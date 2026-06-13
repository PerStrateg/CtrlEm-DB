import {
  ACTION_COMMANDS,
  AUTO_SEND_COMMAND_KEYS,
  AUTO_SEND_INTERVAL_MAX,
  AUTO_SEND_INTERVAL_MIN,
  AUTO_SEND_QUEUE_STORAGE_KEY,
  INPUT_CAPTURE_COMMANDS,
  MEDIA_COMMANDS,
  RecordType,
  TEXT_COMMANDS,
  TYPE_LABELS,
  USER_CONFIG,
} from '../domain/constants';
import { clampAutoSendInterval, clampMinimumRequestInterval, createId, isHttpUrl } from '../domain/content';
import { getMediaPickerId } from '../ui/mediaPicker';
import { getTextPickerId } from '../ui/textPicker';
import { createElement } from '../ui/dom';

const MANAGER_ID = 'ctrlem-db-autosend-manager';
const TOAST_BOTTOM_PROPERTY = '--ctrlem-db-toast-bottom';
const LOCK_TTL_MS = USER_CONFIG.autoSend.queueLockTtlMs;
const HEARTBEAT_MS = USER_CONFIG.autoSend.heartbeatMs;
const HEARTBEAT_TIMEOUT_MS = USER_CONFIG.autoSend.heartbeatTimeoutMs;
const RUNNER_MS = USER_CONFIG.autoSend.runnerMs;
const SEND_FEEDBACK_TIMEOUT_MS = 8000;
const INTERVAL_BUFFER_MS = 100;
const SEND_BUTTON_UNLOCK_MS = 500;
const MANUAL_SNAPSHOT_REUSE_MS = 5000;
const QUEUE_NOTIFICATION_TTL_MS = 15000;
const SEEN_NOTIFICATION_STORAGE_KEY = 'ctrlemDbAutoSendSeenNotifications.v1';
const FINALIZE_RETRY_DELAYS_MS = [100, 250, 500, 1000, 1500, 2000];
const DIRECT_SIMPLE_COMMANDS = new Set([
  'screenshot',
  'webcamCapture',
  'lockinput',
  'screenBlank',
  'sendOrDelete',
]);
const DIRECT_URL_COMMANDS = new Set([
  'openPage',
  'popupImage',
  'changeWallpaper',
  'discordWallpaper',
  'popupSound',
  'videoOverlay',
]);

const TASK_STATUS = Object.freeze({
  PENDING: 'pending',
  SENDING: 'sending',
});

export class AutoSendController {
  private states = new Map<string, any>();

  private manualTasks = new Map<string, any>();

  private recentManualSnapshots = new Map<string, any>();

  private seenNotificationIds = new Set<string>();

  private readonly instanceId = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  private managerTimer = 0;

  private heartbeatTimer = 0;

  private runnerTimer = 0;

  private buttonUnlockTimer = 0;

  private activeSendTaskIdsByReceiver = new Map<string, string>();

  private managerCollapsed = false;

  constructor(private readonly options: any) {
    this.restoreSeenNotificationIds();
    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.key !== AUTO_SEND_QUEUE_STORAGE_KEY) return;
      this.applyStoredQueue(this.parseStoredQueue(event.newValue));
    });
    document.addEventListener('click', (event) => this.captureManualSend(event), true);
    window.addEventListener('beforeunload', () => this.removeOwnedTasks('tab unloaded'));

    this.startHeartbeat();
    this.startButtonUnlocker();
    this.startRunner();
  }

  getCommandConfig(commandKey: string): any {
    return (TEXT_COMMANDS as any)[commandKey] || (MEDIA_COMMANDS as any)[commandKey] || (ACTION_COMMANDS as any)[commandKey] || null;
  }

  getIntervalMs(): number {
    const seconds = clampAutoSendInterval(this.options.getState()?.autoSendIntervalSeconds);
    return this.getBufferedIntervalMs(seconds);
  }

  getIntervalSeconds(): number {
    return clampAutoSendInterval(this.options.getState()?.autoSendIntervalSeconds);
  }

  getBufferedIntervalMs(seconds: unknown): number {
    return clampAutoSendInterval(seconds) * 1000 + INTERVAL_BUFFER_MS;
  }

  getMinimumRequestIntervalMs(): number {
    const seconds = clampMinimumRequestInterval(this.options.getState()?.minimumRequestIntervalSeconds);
    return seconds * 1000;
  }

  getBufferedMinimumRequestIntervalMs(): number {
    return this.getMinimumRequestIntervalMs() + INTERVAL_BUFFER_MS;
  }

  getMinimumRequestIntervalSeconds(): number {
    return clampMinimumRequestInterval(this.options.getState()?.minimumRequestIntervalSeconds);
  }

  cleanText(value: unknown): string {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  getProfileTitle(): string {
    const heading: any = document.querySelector('.profile-details h1');
    if (!heading) return this.getPageCode();

    const clone = heading.cloneNode(true);
    clone.querySelectorAll('.verified-badge, [title="Verified"]').forEach((element: any) => element.remove());
    return this.cleanText(clone.textContent) || this.getPageCode();
  }

  getPageCode(): string {
    const code = String(document.querySelector('.profile-controlcode code')?.textContent || '').trim();
    if (code) return code;

    const pathMatch = window.location.pathname.match(/\/u\/([^/?#]+)/i);
    if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);

    const titleMatch = document.title.match(/^([A-Z0-9]{3,})\b/i);
    return titleMatch?.[1] || 'Current page';
  }

  getPageKey(): string {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    return `${window.location.origin}${path}`;
  }

  getPageUrl(): string {
    return window.location.href;
  }

  getTargetDevice(): string {
    const layout: any = document.getElementById('commands-layout');
    return String(layout?.dataset?.activeDevice || 'desktop').toUpperCase();
  }

  getReceiverKey(pageKey = this.getPageKey(), pageCode = this.getPageCode()): string {
    const normalizedPageCode = String(pageCode || '').trim();
    if (normalizedPageCode) return `receiver:${normalizedPageCode.toUpperCase()}`;

    const pathMatch = String(pageKey || '').match(/\/u\/([^/?#]+)/i);
    if (pathMatch?.[1]) return `receiver:${decodeURIComponent(pathMatch[1]).toUpperCase()}`;

    const normalizedPageKey = String(pageKey || '').trim();
    return normalizedPageKey ? `receiver-url:${normalizedPageKey}` : 'receiver:current';
  }

  getTaskReceiverKey(task: any): string {
    return this.normalizeReceiverKey(task?.receiverKey || this.getReceiverKey(task?.pageKey, task?.pageCode));
  }

  getSendType(config: any, kind: string): string {
    if (kind === 'manual') return 'Manual';
    if (config?.type && (TYPE_LABELS as any)[config.type]) return `Auto ${TYPE_LABELS[config.type]}`;
    return 'Auto Action';
  }

  getTaskCategory(config: any, items: any[]): string {
    if (items[0]?.category) return items[0].category;

    const picker = this.getCommandPicker(config);
    const category = String(picker?.dataset?.category || '').trim();
    return category || config.label || config.key;
  }

  getCommandPicker(config: any): any {
    if (config.clickOnly) return null;
    return document.getElementById(getTextPickerId(config.key))
      || document.getElementById(getMediaPickerId(config.key));
  }

  getVisibleItems(config: any): any[] {
    const picker = this.getCommandPicker(config);
    if (!picker) return [];

    const selector = config.type === RecordType.IMAGE
      ? '.ctrlem-db-media-tile'
      : '.ctrlem-db-row';
    return Array.from(picker.querySelectorAll(selector))
      .map((element: any) => ({
        commandKey: config.key,
        type: config.type || '',
        value: element.dataset.value || element.dataset.url || '',
        categoryId: element.dataset.categoryId || picker.dataset.categoryId || '',
        category: element.dataset.category || picker.dataset.category || '',
        index: Number(element.dataset.index || -1),
        source: element.dataset.source || 'saved',
        isSelected: element.classList.contains('is-selected'),
      }))
      .filter((item) => item.value);
  }

  getStartIndex(config: any, input: any, items: any[]): number {
    const uiState = this.options.getPickerUiState?.(config.key) || {};
    const savedValue = String(uiState.value || input?.dataset?.ctrlemDbSelectedValue || input?.value || '').trim();
    const savedIndex = Number(uiState.itemIndex);

    if (Number.isFinite(savedIndex) && savedIndex >= 0 && items[savedIndex]?.value === savedValue) {
      return savedIndex;
    }

    const selectedIndex = items.findIndex((item) => item.isSelected);
    if (selectedIndex >= 0) return selectedIndex;

    const valueIndex = items.findIndex((item) => item.value === savedValue);
    return valueIndex >= 0 ? valueIndex : 0;
  }

  getItemSelector(config: any): string {
    return config.type === RecordType.IMAGE ? '.ctrlem-db-media-tile' : '.ctrlem-db-row';
  }

  getItemValue(element: any): string {
    return element.dataset.value || element.dataset.url || '';
  }

  findLiveItemElement(config: any, picker: any, item: any): any {
    const selector = this.getItemSelector(config);
    const elements = Array.from(picker.querySelectorAll(selector));
    const exact = elements.find((element: any) => (
      this.getItemValue(element) === item.value
      && (element.dataset.categoryId || picker.dataset.categoryId || '') === item.categoryId
      && Number(element.dataset.index || -1) === item.index
    ));
    if (exact) return exact;

    return elements.find((element: any) => (
      this.getItemValue(element) === item.value
      && (element.dataset.categoryId || picker.dataset.categoryId || '') === item.categoryId
    )) || null;
  }

  selectItem(config: any, item: any, options: any = {}): boolean {
    const input: any = document.querySelector(config.inputSelector);
    const picker = this.getCommandPicker(config);
    if (!input || !picker) return false;

    const element = this.findLiveItemElement(config, picker, item);
    if (!element) return false;

    if (element.classList.contains('ctrlem-db-media-tile')) {
      this.options.selectMediaItem(input, picker, element, options);
      return true;
    }

    this.options.selectTextItem(input, picker, element, options);
    return true;
  }

  setButtonState(button: any, isActive: boolean): void {
    if (!button) return;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
    button.title = isActive ? 'Stop auto-send' : 'Start auto-send';
  }

  setCommandButtons(commandKey: string, isActive: boolean): void {
    document.querySelectorAll(`.ctrlem-db-auto-send-button[data-command="${commandKey}"]`).forEach((button: any) => {
      this.setButtonState(button, isActive);
    });
  }

  getCommandIntervalInput(commandKey: string): any {
    return document.querySelector(`.ctrlem-db-autosend-interval-input[data-command="${CSS.escape(commandKey)}"]`);
  }

  getControlIntervalSeconds(commandKey: string): number {
    const input = this.getCommandIntervalInput(commandKey);
    return clampAutoSendInterval(input?.value || this.getIntervalSeconds());
  }

  updateTaskInterval(commandKey: string, seconds: number): void {
    const state = this.states.get(commandKey);
    if (!state?.taskId) return;

    this.tryQueueLock((queue) => {
      const task = queue.tasks.find((item: any) => item.id === state.taskId && item.kind === 'auto');
      if (!task) return;
      const nextInterval = clampAutoSendInterval(seconds);
      task.taskIntervalSeconds = nextInterval;

      const now = Date.now();
      if (task.status !== TASK_STATUS.SENDING && Number(task.dueAt || 0) > now) {
        task.dueAt = Math.max(now + this.getBufferedIntervalMs(nextInterval), this.getTaskNextSendAllowedAt(queue, task));
        task.progressStartedAt = now;
        task.progressEndsAt = task.dueAt;
      }
    });
  }

  parseStoredQueue(raw: string | null): any {
    if (!raw) return this.createQueueState();
    try {
      const parsed = JSON.parse(raw);
      return this.normalizeQueueState(parsed);
    } catch {
      return this.createQueueState();
    }
  }

  createQueueState(): any {
    return {
      tasks: [],
      lastSentAt: 0,
      nextSendAllowedAt: 0,
      activeSendTaskId: '',
      activeSendOwnerId: '',
      activeSendStartedAt: 0,
      activeSendSettleAt: 0,
      activeSendsByReceiver: {},
      rateLimitBackoffUntil: 0,
      receiverCooldowns: {},
      notifications: [],
      lock: null,
      heartbeats: {},
      updatedAt: Date.now(),
    };
  }

  getHeartbeatTime(value: any): number {
    if (value && typeof value === 'object') return Math.max(0, Number(value.at) || 0);
    return Math.max(0, Number(value) || 0);
  }

  getHeartbeatPageKey(value: any): string {
    if (value && typeof value === 'object') return String(value.pageKey || '').trim();
    return '';
  }

  normalizeReceiverCooldown(source: any): any {
    const cooldown = source && typeof source === 'object' ? source : {};
    return {
      lastSentAt: Math.max(0, Number(cooldown.lastSentAt) || 0),
      nextSendAllowedAt: Math.max(0, Number(cooldown.nextSendAllowedAt) || 0),
      rateLimitBackoffUntil: Math.max(0, Number(cooldown.rateLimitBackoffUntil) || 0),
    };
  }

  normalizeReceiverCooldowns(source: any): any {
    const cooldowns: any = {};
    if (!source || typeof source !== 'object') return cooldowns;

    Object.keys(source).forEach((receiverKey) => {
      const key = this.normalizeReceiverKey(receiverKey);
      if (!key) return;
      const nextCooldown = this.normalizeReceiverCooldown(source[receiverKey]);
      const currentCooldown = this.normalizeReceiverCooldown(cooldowns[key]);
      cooldowns[key] = {
        lastSentAt: Math.max(currentCooldown.lastSentAt, nextCooldown.lastSentAt),
        nextSendAllowedAt: Math.max(currentCooldown.nextSendAllowedAt, nextCooldown.nextSendAllowedAt),
        rateLimitBackoffUntil: Math.max(currentCooldown.rateLimitBackoffUntil, nextCooldown.rateLimitBackoffUntil),
      };
    });

    return cooldowns;
  }

  normalizeActiveSend(source: any): any {
    const active = source && typeof source === 'object' ? source : {};
    return {
      taskId: String(active.taskId || ''),
      ownerId: String(active.ownerId || ''),
      startedAt: Math.max(0, Number(active.startedAt) || 0),
      expiresAt: Math.max(0, Number(active.expiresAt) || 0),
    };
  }

  normalizeActiveSendsByReceiver(source: any): any {
    const activeSends: any = {};
    if (!source || typeof source !== 'object') return activeSends;

    Object.keys(source).forEach((receiverKey) => {
      const key = this.normalizeReceiverKey(receiverKey);
      if (!key) return;
      const active = this.normalizeActiveSend(source[receiverKey]);
      if (active.taskId) activeSends[key] = active;
    });

    return activeSends;
  }

  normalizeQueueNotification(notification: any): any {
    const source = notification && typeof notification === 'object' ? notification : {};
    return {
      id: String(source.id || ''),
      taskId: String(source.taskId || ''),
      receiverKey: source.receiverKey ? this.normalizeReceiverKey(source.receiverKey) : '',
      commandKey: String(source.commandKey || ''),
      kind: String(source.kind || ''),
      message: String(source.message || ''),
      level: String(source.level || 'info'),
      createdAt: Math.max(0, Number(source.createdAt) || 0),
    };
  }

  normalizeQueueNotifications(source: any): any[] {
    if (!Array.isArray(source)) return [];
    const now = Date.now();
    return source
      .map((item) => this.normalizeQueueNotification(item))
      .filter((item) => (
        item.id
        && item.receiverKey
        && item.message
        && item.createdAt > 0
        && now - item.createdAt <= QUEUE_NOTIFICATION_TTL_MS
      ));
  }

  normalizeReceiverKey(receiverKey: string): string {
    const key = String(receiverKey || '').trim();
    if (!key) return this.getReceiverKey();
    if (key.startsWith('receiver:') || key.startsWith('receiver-url:')) return key;
    if (key.startsWith('code:')) return `receiver:${key.slice(5).toUpperCase()}`;

    const pathMatch = key.match(/\/u\/([^/?#]+)/i);
    if (pathMatch?.[1]) return `receiver:${decodeURIComponent(pathMatch[1]).toUpperCase()}`;

    return key;
  }

  getReceiverCooldown(queue: any, receiverKey: string): any {
    const key = this.normalizeReceiverKey(receiverKey);
    const source = queue?.receiverCooldowns?.[key];
    return this.normalizeReceiverCooldown(source);
  }

  ensureReceiverCooldown(queue: any, receiverKey: string): any {
    const key = this.normalizeReceiverKey(receiverKey);
    queue.receiverCooldowns ||= {};
    queue.receiverCooldowns[key] = this.normalizeReceiverCooldown(queue.receiverCooldowns[key]);
    return queue.receiverCooldowns[key];
  }

  getReceiverNextSendAllowedAt(queue: any, receiverKey: string): number {
    const cooldown = this.getReceiverCooldown(queue, receiverKey);
    return Math.max(
      Number(cooldown.nextSendAllowedAt || 0),
      Number(cooldown.rateLimitBackoffUntil || 0),
    );
  }

  getTaskNextSendAllowedAt(queue: any, task: any): number {
    return this.getReceiverNextSendAllowedAt(queue, this.getTaskReceiverKey(task));
  }

  setReceiverAttemptCooldown(queue: any, task: any, attemptedAt: number, nextAllowedAt: number): void {
    const cooldown = this.ensureReceiverCooldown(queue, this.getTaskReceiverKey(task));
    cooldown.lastSentAt = Math.max(Number(cooldown.lastSentAt || 0), attemptedAt);
    cooldown.nextSendAllowedAt = Math.max(Number(cooldown.nextSendAllowedAt || 0), nextAllowedAt);
  }

  setReceiverRateLimitBackoff(queue: any, task: any, backoffUntil: number): void {
    const cooldown = this.ensureReceiverCooldown(queue, this.getTaskReceiverKey(task));
    cooldown.rateLimitBackoffUntil = Math.max(Number(cooldown.rateLimitBackoffUntil || 0), backoffUntil);
    cooldown.nextSendAllowedAt = Math.max(Number(cooldown.nextSendAllowedAt || 0), backoffUntil);
  }

  normalizeTask(task: any, index: number): any {
    const createdAt = Math.max(0, Number(task.createdAt) || Date.now());
    const sequence = Number.isFinite(Number(task.sequence)) ? Number(task.sequence) : createdAt + index;
    const hasTaskInterval = task.taskIntervalSeconds !== undefined && task.taskIntervalSeconds !== null && task.taskIntervalSeconds !== '';
    const pageKey = String(task.pageKey || '').trim();
    const pageCode = String(task.pageCode || '').trim();
    return {
      ...task,
      id: String(task.id || ''),
      key: String(task.key || ''),
      kind: String(task.kind || ''),
      ownerId: String(task.ownerId || ''),
      commandKey: String(task.commandKey || ''),
      sendType: String(task.sendType || task.kind || ''),
      pageKey,
      pageUrl: String(task.pageUrl || task.pageKey || '').trim(),
      pageCode,
      receiverKey: this.normalizeReceiverKey(task.receiverKey || this.getReceiverKey(pageKey, pageCode)),
      source: String(task.source || task.kind || ''),
      commandPayload: String(task.commandPayload || ''),
      targetDevice: String(task.targetDevice || '').trim(),
      snapshot: Array.isArray(task.snapshot) ? task.snapshot : [],
      categoryId: String(task.categoryId || ''),
      category: String(task.category || ''),
      itemValue: String(task.itemValue || ''),
      itemIndex: Number.isFinite(Number(task.itemIndex)) ? Number(task.itemIndex) : -1,
      nextIndex: Number.isFinite(Number(task.nextIndex)) ? Number(task.nextIndex) : -1,
      taskIntervalSeconds: clampAutoSendInterval(hasTaskInterval ? task.taskIntervalSeconds : this.getIntervalSeconds()),
      createdAt,
      dueAt: Math.max(0, Number(task.dueAt) || 0),
      sequence,
      status: task.status === TASK_STATUS.SENDING ? TASK_STATUS.SENDING : TASK_STATUS.PENDING,
      attemptedAt: Math.max(0, Number(task.attemptedAt) || 0),
      attemptOwnerId: String(task.attemptOwnerId || ''),
      attemptExpiresAt: Math.max(0, Number(task.attemptExpiresAt) || 0),
      progressStartedAt: Math.max(0, Number(task.progressStartedAt) || createdAt),
      progressEndsAt: Math.max(0, Number(task.progressEndsAt) || Number(task.dueAt) || createdAt),
      nextIndexAfterAttempt: Number.isFinite(Number(task.nextIndexAfterAttempt)) ? Number(task.nextIndexAfterAttempt) : -1,
    };
  }

  normalizeQueueState(queue: any): any {
    const source = queue && typeof queue === 'object' ? queue : {};
    const heartbeats = source.heartbeats && typeof source.heartbeats === 'object' ? source.heartbeats : {};
    const lastSentAt = Math.max(0, Number(source.lastSentAt) || 0);
    const migratedNextAllowedAt = lastSentAt > 0 ? lastSentAt + this.getMinimumRequestIntervalMs() : 0;
    const tasks = Array.isArray(source.tasks)
      ? source.tasks
        .map((task: any, index: number) => this.normalizeTask(task, index))
        .filter((task: any) => task.id && task.key && task.kind && task.commandKey)
      : [];
    const legacyNextSendAllowedAt = Math.max(0, Number(source.nextSendAllowedAt) || migratedNextAllowedAt);
    const legacyRateLimitBackoffUntil = Math.max(0, Number(source.rateLimitBackoffUntil) || 0);
    const receiverCooldowns = this.normalizeReceiverCooldowns(source.receiverCooldowns);
    const activeSendsByReceiver = this.normalizeActiveSendsByReceiver(source.activeSendsByReceiver);
    const notifications = this.normalizeQueueNotifications(source.notifications);
    const legacyCooldown = this.normalizeReceiverCooldown({
      lastSentAt,
      nextSendAllowedAt: legacyNextSendAllowedAt,
      rateLimitBackoffUntil: legacyRateLimitBackoffUntil,
    });
    if (legacyCooldown.lastSentAt || legacyCooldown.nextSendAllowedAt || legacyCooldown.rateLimitBackoffUntil) {
      const receiverKeys = new Set<string>(tasks.length
        ? tasks.map((task: any) => this.getTaskReceiverKey(task))
        : [this.getReceiverKey()]);
      receiverKeys.forEach((receiverKey) => {
        const cooldown = this.ensureReceiverCooldown({ receiverCooldowns }, receiverKey);
        cooldown.lastSentAt = Math.max(cooldown.lastSentAt, legacyCooldown.lastSentAt);
        cooldown.nextSendAllowedAt = Math.max(cooldown.nextSendAllowedAt, legacyCooldown.nextSendAllowedAt);
        cooldown.rateLimitBackoffUntil = Math.max(cooldown.rateLimitBackoffUntil, legacyCooldown.rateLimitBackoffUntil);
      });
    }
    const legacyActiveTaskId = String(source.activeSendTaskId || '');
    if (legacyActiveTaskId) {
      const legacyActiveTask = tasks.find((task: any) => task.id === legacyActiveTaskId);
      const receiverKey = this.getTaskReceiverKey(legacyActiveTask || {});
      if (receiverKey && !activeSendsByReceiver[receiverKey]) {
        activeSendsByReceiver[receiverKey] = this.normalizeActiveSend({
          taskId: legacyActiveTaskId,
          ownerId: source.activeSendOwnerId || legacyActiveTask?.attemptOwnerId || legacyActiveTask?.ownerId || '',
          startedAt: source.activeSendStartedAt || legacyActiveTask?.attemptedAt || 0,
          expiresAt: source.activeSendSettleAt || legacyActiveTask?.attemptExpiresAt || 0,
        });
      }
    }
    return {
      tasks,
      lastSentAt,
      nextSendAllowedAt: legacyNextSendAllowedAt,
      activeSendTaskId: String(source.activeSendTaskId || ''),
      activeSendOwnerId: String(source.activeSendOwnerId || ''),
      activeSendStartedAt: Math.max(0, Number(source.activeSendStartedAt) || 0),
      activeSendSettleAt: Math.max(0, Number(source.activeSendSettleAt) || 0),
      activeSendsByReceiver,
      rateLimitBackoffUntil: legacyRateLimitBackoffUntil,
      receiverCooldowns,
      notifications,
      lock: source.lock && typeof source.lock === 'object' ? source.lock : null,
      heartbeats,
      updatedAt: Math.max(0, Number(source.updatedAt) || 0),
    };
  }

  getStoredQueue(): any {
    return this.parseStoredQueue(window.localStorage.getItem(AUTO_SEND_QUEUE_STORAGE_KEY));
  }

  writeQueue(queue: any): void {
    queue.updatedAt = Date.now();
    window.localStorage.setItem(AUTO_SEND_QUEUE_STORAGE_KEY, JSON.stringify(queue));
    this.applyStoredQueue(queue);
  }

  restoreSeenNotificationIds(): void {
    try {
      const ids = JSON.parse(window.sessionStorage.getItem(SEEN_NOTIFICATION_STORAGE_KEY) || '[]');
      if (Array.isArray(ids)) this.seenNotificationIds = new Set(ids.map((id) => String(id)));
    } catch {
      this.seenNotificationIds.clear();
    }
  }

  rememberSeenNotificationId(id: string): void {
    this.seenNotificationIds.add(id);
    const ids = Array.from(this.seenNotificationIds).slice(-100);
    this.seenNotificationIds = new Set(ids);
    try {
      window.sessionStorage.setItem(SEEN_NOTIFICATION_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // Session storage can be unavailable in hardened contexts; in-memory de-dupe still works.
    }
  }

  pruneQueueNotifications(queue: any, now = Date.now()): boolean {
    const before = Array.isArray(queue.notifications) ? queue.notifications.length : 0;
    queue.notifications = this.normalizeQueueNotifications(queue.notifications)
      .filter((notification: any) => now - Number(notification.createdAt || 0) <= QUEUE_NOTIFICATION_TTL_MS);
    return queue.notifications.length !== before;
  }

  addQueueNotification(queue: any, task: any, message: string, level = 'info', now = Date.now()): void {
    queue.notifications = this.normalizeQueueNotifications(queue.notifications);
    queue.notifications.push({
      id: createId('notice'),
      taskId: String(task?.id || ''),
      receiverKey: this.getTaskReceiverKey(task),
      commandKey: String(task?.commandKey || ''),
      kind: String(task?.kind || ''),
      message,
      level,
      createdAt: now,
    });
  }

  showQueueNotifications(queue: any): void {
    const receiverKey = this.getReceiverKey();
    this.normalizeQueueNotifications(queue?.notifications).forEach((notification: any) => {
      if (notification.receiverKey !== receiverKey) return;
      if (this.seenNotificationIds.has(notification.id)) return;

      this.rememberSeenNotificationId(notification.id);
      this.options.notifySite(notification.message, notification.level);
    });
  }

  /**
   * Remove stale heartbeats and manual tasks whose owner tab is dead.
   * Auto tasks are preserved even if their owner tab is gone — they can be
   * adopted by another tab on the same page.
   */
  cleanStaleTasks(queue: any, now = Date.now()): boolean {
    let changed = false;
    const heartbeats = queue.heartbeats || {};

    Object.keys(heartbeats).forEach((ownerId) => {
      if (now - this.getHeartbeatTime(heartbeats[ownerId]) > HEARTBEAT_TIMEOUT_MS) {
        delete heartbeats[ownerId];
        changed = true;
      }
    });

    const before = queue.tasks.length;
    queue.tasks = queue.tasks.filter((task: any) => {
      // Auto tasks persist regardless of owner liveness
      if (task.kind !== 'manual') return true;
      // Manual tasks are kept only while their owner tab is alive
      return now - this.getHeartbeatTime(heartbeats[task.ownerId]) <= HEARTBEAT_TIMEOUT_MS;
    });
    if (this.pruneQueueNotifications(queue, now)) changed = true;

    queue.activeSendsByReceiver ||= {};
    Object.keys(queue.activeSendsByReceiver).forEach((receiverKey) => {
      const active = this.normalizeActiveSend(queue.activeSendsByReceiver[receiverKey]);
      const activeTask = queue.tasks.find((task: any) => task.id === active.taskId);
      const activeOwnerId = String(active.ownerId || activeTask?.attemptOwnerId || activeTask?.ownerId || '');
      const activeStartedAt = Number(active.startedAt || activeTask?.attemptedAt || 0);
      const activeOwnerStale = activeOwnerId
        && activeOwnerId !== this.instanceId
        && now - this.getHeartbeatTime(heartbeats[activeOwnerId]) > HEARTBEAT_TIMEOUT_MS
        && now - activeStartedAt > HEARTBEAT_TIMEOUT_MS;

      if (!activeTask || activeOwnerStale) {
        if (activeTask?.status === TASK_STATUS.SENDING) {
          this.requeueTimedOutTask(queue, activeTask, now);
        }
        this.clearActiveSend(queue, receiverKey);
        changed = true;
      }
    });

    return changed || before !== queue.tasks.length;
  }

  tryQueueLock(callback: (queue: any) => void): boolean {
    const now = Date.now();
    const token = createId('lock');
    const ownerId = this.instanceId;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const base = this.getStoredQueue();
      const lock = base.lock;
      if (lock?.ownerId && lock.ownerId !== ownerId && Number(lock.expiresAt || 0) > now) {
        return false;
      }

      base.lock = { ownerId, token, expiresAt: now + LOCK_TTL_MS };
      window.localStorage.setItem(AUTO_SEND_QUEUE_STORAGE_KEY, JSON.stringify(base));

      const locked = this.getStoredQueue();
      if (locked.lock?.ownerId !== ownerId || locked.lock?.token !== token) continue;

      this.cleanStaleTasks(locked);
      callback(locked);
      if (locked.lock?.ownerId === ownerId && locked.lock?.token === token) {
        locked.lock = null;
      }
      this.writeQueue(locked);
      return true;
    }

    return false;
  }

  startHeartbeat(): void {
    const beat = () => {
      this.tryQueueLock((queue) => {
        queue.heartbeats ||= {};
        queue.heartbeats[this.instanceId] = {
          at: Date.now(),
          pageKey: this.getPageKey(),
        };
      });
    };

    beat();
    this.heartbeatTimer = window.setInterval(beat, HEARTBEAT_MS);
  }

  getRateLimitBackoffMs(): number {
    return this.getBufferedMinimumRequestIntervalMs();
  }

  startRunner(): void {
    if (this.runnerTimer) return;
    this.runnerTimer = window.setInterval(() => {
      this.processDueQueue();
    }, RUNNER_MS);
  }

  unlockSendButton(button: any): void {
    if (!button?.matches?.('[data-send]')) return;
    if (button.disabled || button.hasAttribute('disabled')) {
      button.disabled = false;
    }
    if (button.hasAttribute('disabled')) button.removeAttribute('disabled');
    if (button.style?.opacity === '0.5') button.style.opacity = '';
    if (button.style?.pointerEvents === 'none') button.style.pointerEvents = '';
    button.classList?.remove('disabled', 'is-disabled');
    if (button.getAttribute('aria-disabled') !== 'false') button.setAttribute('aria-disabled', 'false');
  }

  unlockSendButtons(root: ParentNode = document): void {
    root.querySelectorAll?.('[data-send]')?.forEach((button: any) => this.unlockSendButton(button));
  }

  startButtonUnlocker(): void {
    if (this.buttonUnlockTimer) return;

    this.unlockSendButtons();
    this.buttonUnlockTimer = window.setInterval(() => this.unlockSendButtons(), SEND_BUTTON_UNLOCK_MS);
  }

  stop(commandKey: string, reason = 'stopped', options: any = {}): void {
    const state = this.states.get(commandKey);
    if (!state) return;

    state.stopped = true;
    this.states.delete(commandKey);
    this.setButtonState(state.button, false);
    this.setCommandButtons(commandKey, false);
    if (options.publish !== false) this.removeTask(state.taskId);
    this.options.log('info', 'Auto-send stopped', { command: commandKey, reason });
  }

  stopAll(reason = 'stopped', options: any = {}): void {
    Array.from(this.states.keys()).forEach((commandKey) => this.stop(commandKey, reason, options));
  }

  removeTask(taskId: string): void {
    this.tryQueueLock((queue) => {
      queue.tasks = queue.tasks.filter((task: any) => task.id !== taskId);
      this.clearActiveSendForTask(queue, taskId);
    });
  }

  /**
   * Called on tab unload. Only removes heartbeats and manual tasks owned by
   * this tab. Auto tasks persist in the queue so other tabs can adopt them.
   */
  removeOwnedTasks(reason = 'stopped'): void {
    this.stopAll(reason, { publish: false });
    this.manualTasks.clear();
    this.tryQueueLock((queue) => {
      // Remove only manual tasks owned by this tab
      queue.tasks = queue.tasks.filter((task: any) =>
        task.kind !== 'manual' || task.ownerId !== this.instanceId
      );
      this.clearActiveSendsForOwner(queue, this.instanceId);
      if (queue.heartbeats) delete queue.heartbeats[this.instanceId];
    });
  }

  /**
   * Build a stable task key that survives tab instances.
   * Used to deduplicate auto tasks across tabs.
   */
  buildTaskKey(pageKey: string, commandKey: string, sendType: string): string {
    return `${pageKey}::${commandKey}::${sendType}`;
  }

  taskMatchesCurrentPage(task: any): boolean {
    const pageKey = String(task?.pageKey || '').trim();
    if (pageKey && pageKey === this.getPageKey()) return true;
    return !pageKey && String(task?.pageCode || '').trim() === this.getPageCode();
  }

  taskSortValue(task: any): number {
    return Number(task?.sequence ?? task?.createdAt ?? 0) || 0;
  }

  sortReadyTasks(tasks: any[]): any[] {
    return [...tasks].sort((a: any, b: any) => {
      const sequenceDiff = this.taskSortValue(a) - this.taskSortValue(b);
      if (sequenceDiff !== 0) return sequenceDiff;
      return Number(a.dueAt || 0) - Number(b.dueAt || 0);
    });
  }

  getNextSequence(queue: any): number {
    return Math.max(0, ...queue.tasks.map((task: any) => this.taskSortValue(task))) + 1;
  }

  isOwnerAlive(queue: any, ownerId: string, now = Date.now()): boolean {
    if (ownerId === this.instanceId) return true;
    return now - this.getHeartbeatTime(queue.heartbeats?.[ownerId]) <= HEARTBEAT_TIMEOUT_MS;
  }

  isTaskPageActive(queue: any, task: any, now = Date.now()): boolean {
    if (this.taskMatchesCurrentPage(task)) return true;
    const taskPageKey = String(task?.pageKey || '').trim();
    if (!taskPageKey) return false;

    return Object.values(queue.heartbeats || {}).some((heartbeat: any) => (
      this.getHeartbeatPageKey(heartbeat) === taskPageKey
      && now - this.getHeartbeatTime(heartbeat) <= HEARTBEAT_TIMEOUT_MS
    ));
  }

  findQueuedAutoTask(queue: any, config: any, sendType: string): any {
    return queue.tasks.find((task: any) => (
      task.kind === 'auto'
      && task.commandKey === config.key
      && (task.sendType === sendType || !task.sendType)
      && this.taskMatchesCurrentPage(task)
    ));
  }

  ensureTaskCategoryVisible(config: any, task: any): void {
    if (config.clickOnly || !task?.category) return;

    const picker = this.getCommandPicker(config);
    if (!picker || picker.dataset.category === task.category) return;

    const select: any = picker.querySelector('select');
    if (!select) return;

    const option = Array.from(select.options).find((item: any) => (
      String(item.textContent || '').replace(/\s+\(\d+\)$/, '') === task.category
    )) as any;
    if (!option || select.value === option.value) return;

    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  start(config: any, sendButton: any, button: any): void {
    const input: any = config.inputSelector ? document.querySelector(config.inputSelector) : null;
    const items = config.clickOnly ? [] : this.getVisibleItems(config);

    if (!config.clickOnly && !input) {
      this.options.notifySite('Auto-send input was not found', 'error');
      return;
    }
    if (!config.clickOnly && items.length === 0) {
      this.options.notifySite('Auto-send category is empty', 'error');
      return;
    }

    if (this.states.has(config.key)) {
      this.stop(config.key);
      return;
    }

    const taskId = createId('autosend');
    const category = this.getTaskCategory(config, items);
    const pageKey = this.getPageKey();
    const pageUrl = this.getPageUrl();
    const pageCode = this.getPageCode();
    const receiverKey = this.getReceiverKey(pageKey, pageCode);
    const sendType = this.getSendType(config, 'auto');
    const taskKey = this.buildTaskKey(pageKey, config.key, sendType);
    const taskIntervalSeconds = this.getControlIntervalSeconds(config.key);
    const startIndex = config.clickOnly ? 0 : this.getStartIndex(config, input, items);
    const startItem = config.clickOnly ? null : items[startIndex % items.length];

    const state = {
      taskId,
      commandKey: config.key,
      config,
      sendButton,
      button,
      items,
      nextIndex: startIndex,
      category,
      profileTitle: this.getProfileTitle(),
      pageKey,
      pageUrl,
      pageCode,
      receiverKey,
      taskIntervalSeconds,
      stopped: false,
    };

    let added = false;
    this.tryQueueLock((queue) => {
      // Check if a task with the same stable key already exists (adopt it)
      const existing = this.findQueuedAutoTask(queue, config, sendType);
      if (existing) {
        state.taskId = existing.id;
        state.nextIndex = Number.isFinite(Number(existing.nextIndex)) && Number(existing.nextIndex) >= 0
          ? Number(existing.nextIndex)
          : startIndex;
        existing.key ||= taskKey;
        existing.pageKey ||= pageKey;
        existing.pageUrl ||= pageUrl;
        existing.pageCode ||= pageCode;
        existing.receiverKey ||= receiverKey;
        existing.profileTitle = state.profileTitle;
        existing.category ||= category;
        existing.categoryId ||= startItem?.categoryId || '';
        existing.taskIntervalSeconds = clampAutoSendInterval(existing.taskIntervalSeconds || taskIntervalSeconds);
        added = true;
        return;
      }

      const now = Date.now();
      queue.tasks.push({
        id: taskId,
        key: taskKey,
        kind: 'auto',
        commandKey: config.key,
        sendType,
        source: 'auto',
        targetDevice: this.getTargetDevice(),
        pageKey,
        pageUrl,
        pageCode,
        receiverKey,
        categoryId: startItem?.categoryId || '',
        category,
        profileTitle: state.profileTitle,
        itemValue: startItem?.value || '',
        itemIndex: Number.isFinite(Number(startItem?.index)) ? Number(startItem.index) : startIndex,
        nextIndex: startIndex,
        taskIntervalSeconds,
        createdAt: now,
        dueAt: now, // Ready immediately, subject only to this receiver's request interval.
        progressStartedAt: now,
        progressEndsAt: now,
        sequence: this.getNextSequence(queue),
        status: TASK_STATUS.PENDING,
      });
      added = true;
    });

    if (!added) {
      this.options.notifySite('Auto-send queue is busy. Try again.', 'error');
      return;
    }

    this.states.set(config.key, state);
    this.setButtonState(button, true);
    this.setCommandButtons(config.key, true);
    this.options.log('info', 'Auto-send queued', {
      command: config.key,
      type: config.type,
      category: state.category,
      pageCode: state.pageCode,
      items: config.clickOnly ? null : items.length,
      intervalSeconds: taskIntervalSeconds,
    });
    this.restoreTaskSelection(this.getStoredQueue().tasks.find((task: any) => task.id === state.taskId), state);
    this.processDueQueue();
  }

  toggle(config: any, sendButton: any, button: any): void {
    if (this.states.has(config.key)) {
      this.stop(config.key);
      return;
    }
    this.start(config, sendButton, button);
  }

  createRuntimeState(task: any, config: any, sendButton: any, button: any): any {
    const input: any = config.inputSelector ? document.querySelector(config.inputSelector) : null;
    this.ensureTaskCategoryVisible(config, task);
    const items = config.clickOnly ? [] : this.getVisibleItems(config);
    if (!config.clickOnly && (!input || items.length === 0)) return null;

    let nextIndex = Number(task.nextIndex);
    if (!Number.isFinite(nextIndex) || nextIndex < 0) {
      nextIndex = Number.isFinite(Number(task.itemIndex)) && Number(task.itemIndex) >= 0
        ? Number(task.itemIndex)
        : this.getStartIndex(config, input, items);
    }

    if (!config.clickOnly && task.itemValue) {
      const itemIndex = items.findIndex((item: any) => (
        item.value === task.itemValue
        && (!task.categoryId || item.categoryId === task.categoryId)
      ));
      if (itemIndex >= 0) nextIndex = itemIndex;
    }

    return {
      taskId: task.id,
      commandKey: config.key,
      config,
      sendButton,
      button,
      items,
      nextIndex,
      category: task.category || this.getTaskCategory(config, items),
      profileTitle: task.profileTitle || this.getProfileTitle(),
      pageKey: task.pageKey || this.getPageKey(),
      pageUrl: task.pageUrl || task.pageKey || this.getPageUrl(),
      pageCode: task.pageCode || this.getPageCode(),
      receiverKey: this.getTaskReceiverKey(task),
      taskIntervalSeconds: clampAutoSendInterval(task.taskIntervalSeconds || this.getIntervalSeconds()),
      stopped: false,
    };
  }

  restoreTaskSelection(task: any, state: any): void {
    if (!task || !state || state.config.clickOnly || state.items.length === 0) return;

    this.ensureTaskCategoryVisible(state.config, task);
    state.items = this.getVisibleItems(state.config);
    if (state.items.length === 0) return;

    const item = state.items.find((candidate: any) => (
      candidate.value === task.itemValue
      && (!task.categoryId || candidate.categoryId === task.categoryId)
    )) || state.items[state.nextIndex % state.items.length];

    if (!item) return;

    const focusState = this.options.captureFocusState?.();
    if (this.selectItem(state.config, item, { focus: false, focusState })) {
      this.options.restoreFocusState?.(focusState);
    }
  }

  adoptTask(task: any): boolean {
    if (!task || task.kind !== 'auto' || !this.taskMatchesCurrentPage(task)) return false;
    if (this.states.get(task.commandKey)?.taskId === task.id) return true;

    const config = this.getCommandConfig(task.commandKey);
    if (!config) return false;

    const sendButton: any = document.querySelector(`[data-send="${CSS.escape(task.commandKey)}"]`);
    const button: any = document.querySelector(`.ctrlem-db-auto-send-button[data-command="${CSS.escape(task.commandKey)}"]`);
    if (!sendButton || !button) return false;

    const state = this.createRuntimeState(task, config, sendButton, button);
    if (!state) return false;

    this.states.set(task.commandKey, state);
    this.setButtonState(button, true);
    this.setCommandButtons(task.commandKey, true);
    const input = this.getCommandIntervalInput(task.commandKey);
    if (input) input.value = String(state.taskIntervalSeconds);
    this.restoreTaskSelection(task, state);
    return true;
  }

  adoptCurrentPageTasks(queue = this.getStoredQueue()): boolean {
    let adopted = false;
    queue.tasks.forEach((task: any) => {
      if (task.kind === 'auto' && this.taskMatchesCurrentPage(task)) {
        adopted = this.adoptTask(task) || adopted;
      }
    });
    return adopted;
  }

  applyStoredQueue(queue: any): void {
    this.showQueueNotifications(queue);
    const taskIds = new Set((queue?.tasks || []).map((task: any) => task.id));
    Array.from(this.states.values()).forEach((state: any) => {
      if (taskIds.has(state.taskId)) return;
      this.stop(state.commandKey, 'removed from queue', { publish: false });
    });
    Array.from(this.manualTasks.keys()).forEach((taskId) => {
      if (!taskIds.has(taskId)) this.manualTasks.delete(taskId);
    });
    this.adoptCurrentPageTasks(queue);
    this.refreshControlButtons();
    this.renderManager();
  }

  requestStopTask(taskId: string): void {
    const state = Array.from(this.states.values()).find((item: any) => item.taskId === taskId);
    if (state) {
      this.stop(state.commandKey);
      return;
    }
    this.removeTask(taskId);
  }

  requestStopAllTasks(): void {
    this.stopAll('stopped all', { publish: false });
    this.manualTasks.clear();
    this.tryQueueLock((queue) => {
      queue.tasks = [];
      queue.nextSendAllowedAt = 0;
      queue.rateLimitBackoffUntil = 0;
      queue.receiverCooldowns = {};
      this.clearActiveSend(queue);
    });
    this.renderManager();
  }

  hasActiveSend(queue: any, receiverKey?: string): boolean {
    if (!queue) return false;
    if (receiverKey) return Boolean(this.getActiveSend(queue, receiverKey));
    return Boolean(Object.keys(queue.activeSendsByReceiver || {}).length);
  }

  getActiveSend(queue: any, receiverKey: string): any {
    const key = this.normalizeReceiverKey(receiverKey);
    const active = queue?.activeSendsByReceiver?.[key];
    return active?.taskId ? this.normalizeActiveSend(active) : null;
  }

  clearActiveSend(queue: any, receiverKey?: string): void {
    if (!queue) return;
    queue.activeSendsByReceiver ||= {};
    if (receiverKey) {
      const key = this.normalizeReceiverKey(receiverKey);
      const taskId = String(queue.activeSendsByReceiver[key]?.taskId || '');
      if (taskId) this.activeSendTaskIdsByReceiver.delete(key);
      delete queue.activeSendsByReceiver[key];
      if (queue.activeSendTaskId === taskId) {
        queue.activeSendTaskId = '';
        queue.activeSendOwnerId = '';
        queue.activeSendStartedAt = 0;
        queue.activeSendSettleAt = 0;
      }
      return;
    }
    this.activeSendTaskIdsByReceiver.clear();
    queue.activeSendsByReceiver = {};
    queue.activeSendTaskId = '';
    queue.activeSendOwnerId = '';
    queue.activeSendStartedAt = 0;
    queue.activeSendSettleAt = 0;
  }

  clearActiveSendForTask(queue: any, taskId: string): void {
    const id = String(taskId || '');
    Object.keys(queue?.activeSendsByReceiver || {}).forEach((receiverKey) => {
      if (queue.activeSendsByReceiver[receiverKey]?.taskId === id) this.clearActiveSend(queue, receiverKey);
    });
  }

  clearActiveSendsForOwner(queue: any, ownerId: string): void {
    const id = String(ownerId || '');
    Object.keys(queue?.activeSendsByReceiver || {}).forEach((receiverKey) => {
      if (queue.activeSendsByReceiver[receiverKey]?.ownerId === id) this.clearActiveSend(queue, receiverKey);
    });
  }

  beginTaskAttempt(queue: any, task: any): any {
    const attemptedAt = Date.now();
    const nextAllowedAt = attemptedAt + this.getBufferedMinimumRequestIntervalMs();
    const feedbackTimeoutAt = attemptedAt + SEND_FEEDBACK_TIMEOUT_MS;
    const targetDevice = String(task.targetDevice || this.getTargetDevice()).trim() || this.getTargetDevice();
    const receiverKey = this.getTaskReceiverKey(task);

    task.status = TASK_STATUS.SENDING;
    task.attemptedAt = attemptedAt;
    task.attemptOwnerId = this.instanceId;
    task.attemptExpiresAt = feedbackTimeoutAt;
    task.targetDevice = targetDevice;

    queue.lastSentAt = attemptedAt;
    this.setReceiverAttemptCooldown(queue, task, attemptedAt, nextAllowedAt);
    queue.activeSendsByReceiver ||= {};
    queue.activeSendsByReceiver[receiverKey] = {
      taskId: task.id,
      ownerId: this.instanceId,
      startedAt: attemptedAt,
      expiresAt: feedbackTimeoutAt,
    };
    queue.activeSendTaskId = task.id;
    queue.activeSendOwnerId = this.instanceId;
    queue.activeSendStartedAt = attemptedAt;
    queue.activeSendSettleAt = feedbackTimeoutAt;

    this.activeSendTaskIdsByReceiver.set(receiverKey, task.id);

    return {
      taskId: task.id,
      commandKey: task.commandKey,
      kind: task.kind,
      commandPayload: String(task.commandPayload || ''),
      targetDevice,
      receiverKey,
      pageCode: String(task.pageCode || this.getPageCode()),
      attemptedAt,
    };
  }

  clearAttemptFields(task: any): void {
    task.status = TASK_STATUS.PENDING;
    task.attemptedAt = 0;
    task.attemptOwnerId = '';
    task.attemptExpiresAt = 0;
    task.nextIndexAfterAttempt = -1;
  }

  updateAutoTaskToNextItem(task: any, state: any, nextIndex: number): void {
    if (!state || state.config.clickOnly) {
      task.nextIndex = nextIndex;
      return;
    }

    state.items = this.getVisibleItems(state.config);
    if (state.items.length === 0) {
      task.nextIndex = nextIndex;
      return;
    }

    const normalizedNextIndex = nextIndex % state.items.length;
    state.nextIndex = normalizedNextIndex;
    const nextItem = state.items[normalizedNextIndex];
    task.nextIndex = normalizedNextIndex;
    task.itemValue = nextItem?.value || task.itemValue || '';
    task.itemIndex = Number.isFinite(Number(nextItem?.index)) ? Number(nextItem.index) : normalizedNextIndex;
    task.categoryId = nextItem?.categoryId || task.categoryId || '';
    task.category = nextItem?.category || task.category || state.category;
  }

  completeAttemptedTask(queue: any, task: any, now = Date.now()): void {
    if (task.kind === 'auto') {
      const state = this.states.get(task.commandKey);
      const nextIndex = Number.isFinite(Number(task.nextIndexAfterAttempt)) && Number(task.nextIndexAfterAttempt) >= 0
        ? Number(task.nextIndexAfterAttempt)
        : Number(task.nextIndex || 0);

      this.updateAutoTaskToNextItem(task, state, nextIndex);
      this.clearAttemptFields(task);
      const dueAt = Math.max(
        now + this.getBufferedIntervalMs(task.taskIntervalSeconds),
        this.getTaskNextSendAllowedAt(queue, task),
      );
      task.dueAt = dueAt;
      task.progressStartedAt = now;
      task.progressEndsAt = dueAt;
    } else {
      queue.tasks = queue.tasks.filter((item: any) => item.id !== task.id);
      this.manualTasks.delete(task.id);
    }

    this.addQueueNotification(queue, task, 'Command sent', 'success', now);
    this.clearActiveSend(queue, this.getTaskReceiverKey(task));
  }

  requeueRateLimitedTask(queue: any, task: any, backoffUntil: number): void {
    this.clearAttemptFields(task);
    const now = Date.now();
    task.dueAt = Math.max(backoffUntil, now + this.getBufferedMinimumRequestIntervalMs());
    task.progressStartedAt = now;
    task.progressEndsAt = task.dueAt;
    if (task.kind === 'auto') {
      const state = this.states.get(task.commandKey);
      if (state && Number.isFinite(Number(task.nextIndex)) && Number(task.nextIndex) >= 0) {
        state.nextIndex = Number(task.nextIndex);
      }
    }
    this.clearActiveSend(queue, this.getTaskReceiverKey(task));
  }

  requeueTimedOutTask(queue: any, task: any, now = Date.now()): void {
    this.clearAttemptFields(task);
    task.dueAt = Math.max(now + INTERVAL_BUFFER_MS, this.getTaskNextSendAllowedAt(queue, task));
    task.progressStartedAt = now;
    task.progressEndsAt = task.dueAt;
    if (task.kind === 'auto') {
      const state = this.states.get(task.commandKey);
      if (state && Number.isFinite(Number(task.nextIndex)) && Number(task.nextIndex) >= 0) {
        state.nextIndex = Number(task.nextIndex);
      }
    }
    this.clearActiveSend(queue, this.getTaskReceiverKey(task));
    this.options.log('warn', 'Auto-send direct API attempt timed out; task will retry', {
      command: task.commandKey,
      kind: task.kind,
      receiverKey: this.getTaskReceiverKey(task),
    });
  }

  getRetryableAttemptTask(queue: any, receiverKey?: string): any {
    if (receiverKey) {
      const active = this.getActiveSend(queue, receiverKey);
      if (active?.taskId) {
        const activeTask = queue.tasks.find((task: any) => task.id === active.taskId);
        if (activeTask) return activeTask;
      }
      return [...queue.tasks]
        .filter((task: any) => task.status === TASK_STATUS.SENDING && this.getTaskReceiverKey(task) === this.normalizeReceiverKey(receiverKey))
        .sort((a: any, b: any) => Number(b.attemptedAt || 0) - Number(a.attemptedAt || 0))[0] || null;
    }

    return [...queue.tasks]
      .filter((task: any) => task.status === TASK_STATUS.SENDING)
      .sort((a: any, b: any) => Number(b.attemptedAt || 0) - Number(a.attemptedAt || 0))[0] || null;
  }

  settleActiveSend(queue: any, receiverKey: string, now = Date.now()): boolean {
    if (!this.hasActiveSend(queue, receiverKey)) return false;

    const active = this.getActiveSend(queue, receiverKey);
    const task = this.getRetryableAttemptTask(queue, receiverKey);
    const activeOwnerId = String(active?.ownerId || task?.attemptOwnerId || '');
    if (activeOwnerId && activeOwnerId !== this.instanceId && this.isOwnerAlive(queue, activeOwnerId, now)) {
      return true;
    }

    const settleAt = Math.max(
      Number(active?.expiresAt || 0),
      Number(task?.attemptExpiresAt || 0),
      Number(task?.attemptedAt || active?.startedAt || 0) + SEND_FEEDBACK_TIMEOUT_MS,
    );

    if (now < settleAt) return true;

    if (task) {
      this.requeueTimedOutTask(queue, task, now);
    } else {
      this.clearActiveSend(queue, receiverKey);
    }
    return true;
  }

  settleExpiredActiveSends(queue: any, now = Date.now()): boolean {
    let blocked = false;
    Object.keys(queue.activeSendsByReceiver || {}).forEach((receiverKey) => {
      if (this.settleActiveSend(queue, receiverKey, now)) blocked = true;
    });
    return blocked;
  }

  runAutoTask(queue: any, task: any): any {
    const state = this.states.get(task.commandKey);
    if (!state || state.taskId !== task.id || state.stopped) return 'skip';

    if (!state.sendButton.isConnected) {
      this.stop(state.commandKey, 'send button disconnected', { publish: false });
      return 'skip';
    }

    const focusState = this.options.captureFocusState?.();

    if (!state.config.clickOnly) {
      state.items = this.getVisibleItems(state.config);
      if (state.items.length === 0) {
        this.options.notifySite('Auto-send category is empty', 'error');
        this.stop(state.commandKey, 'category empty', { publish: false });
        return 'remove';
      }

      const itemIndex = state.nextIndex % state.items.length;
      const item = state.items[itemIndex];

      if (!this.selectItem(state.config, item, { focus: false, focusState })) {
        this.options.notifySite('Auto-send item is no longer visible', 'error');
        this.stop(state.commandKey, 'item no longer visible', { publish: false });
        return 'remove';
      }

      task.itemValue = item.value || '';
      task.itemIndex = Number.isFinite(Number(item.index)) ? Number(item.index) : itemIndex;
      task.categoryId = item.categoryId || task.categoryId || '';
      task.category = item.category || task.category || state.category;
      task.nextIndex = itemIndex;
      task.nextIndexAfterAttempt = (itemIndex + 1) % state.items.length;
    }

    const snapshot = this.getInputSnapshot(state.sendButton, state.config);
    const payload = this.buildCommandPayload(state.commandKey, snapshot);
    if (!payload) {
      this.options.notifySite('Auto-send command could not be built', 'error');
      this.stop(state.commandKey, 'unsupported or invalid command payload', { publish: false });
      this.options.restoreFocusState?.(focusState);
      return 'remove';
    }

    task.commandPayload = payload.commandPayload;
    task.targetDevice = payload.targetDevice;
    this.options.restoreFocusState?.(focusState);
    return this.beginTaskAttempt(queue, task);
  }

  runManualTask(queue: any, task: any): any {
    const state = this.manualTasks.get(task.id);
    if (!state) return 'remove';
    if (!task.commandPayload && state.commandPayload) task.commandPayload = state.commandPayload;
    if (!task.targetDevice && state.targetDevice) task.targetDevice = state.targetDevice;
    if (!task.commandPayload) return 'remove';

    return this.beginTaskAttempt(queue, task);
  }

  isAutoTaskRunnable(task: any): boolean {
    if (!this.taskMatchesCurrentPage(task)) return false;
    if (!this.adoptTask(task)) return false;

    const state = this.states.get(task.commandKey);
    return Boolean(
      state
      && state.taskId === task.id
      && !state.stopped
      && state.sendButton?.isConnected
    );
  }

  getNextRunnableTask(queue: any, now = Date.now(), requireReceiverReady = false): any {
    const readyTasks = this.sortReadyTasks(
      queue.tasks.filter((task: any) => task.status !== TASK_STATUS.SENDING && Number(task.dueAt || 0) <= now),
    );

    for (const task of readyTasks) {
      if (this.hasActiveSend(queue, this.getTaskReceiverKey(task))) continue;
      if (requireReceiverReady && now < this.getTaskNextSendAllowedAt(queue, task)) continue;

      if (task.kind === 'manual') {
        if (task.ownerId === this.instanceId && this.manualTasks.has(task.id)) return task;
        continue;
      }

      if (task.kind !== 'auto') continue;
      if (!this.isTaskPageActive(queue, task, now)) continue;
      if (!this.taskMatchesCurrentPage(task)) continue;
      if (this.isAutoTaskRunnable(task)) return task;
    }

    return null;
  }

  isCurrentAttempt(queue: any, task: any, attempt: any): boolean {
    const active = this.getActiveSend(queue, attempt.receiverKey);
    return Boolean(
      task
      && active?.taskId === attempt.taskId
      && task.status === TASK_STATUS.SENDING
      && task.attemptOwnerId === this.instanceId
      && Number(task.attemptedAt || 0) === Number(attempt.attemptedAt || 0)
    );
  }

  scheduleAttemptFinalizationRetry(action: 'confirm' | 'requeue', attempt: any, reason = '', retryAttempt = 0): void {
    const delay = FINALIZE_RETRY_DELAYS_MS[retryAttempt];
    if (delay === undefined) {
      this.options.log('warn', 'Auto-send attempt finalization could not acquire queue lock', {
        action,
        command: attempt?.commandKey,
        kind: attempt?.kind,
        receiverKey: attempt?.receiverKey,
        reason,
      });
      return;
    }

    window.setTimeout(() => {
      if (action === 'confirm') {
        this.confirmQueuedAttempt(attempt, retryAttempt + 1);
      } else {
        this.requeueFailedAttempt(attempt, reason, retryAttempt + 1);
      }
    }, delay);
  }

  confirmQueuedAttempt(attempt: any, retryAttempt = 0): void {
    let completed = false;

    const locked = this.tryQueueLock((queue) => {
      const task = queue.tasks.find((item: any) => item.id === attempt.taskId);
      if (!this.isCurrentAttempt(queue, task, attempt)) return;

      this.completeAttemptedTask(queue, task, Date.now());
      completed = true;
      this.options.log('info', 'Auto-send task sent through direct API', {
        command: attempt.commandKey,
        kind: attempt.kind,
        receiverKey: attempt.receiverKey,
      });
    });

    if (!locked) {
      this.scheduleAttemptFinalizationRetry('confirm', attempt, '', retryAttempt);
      return;
    }

    if (completed) {
      this.processDueQueue();
    }
  }

  requeueFailedAttempt(attempt: any, reason: string, retryAttempt = 0): void {
    const now = Date.now();
    const backoffUntil = now + this.getRateLimitBackoffMs();
    let requeued = false;

    const locked = this.tryQueueLock((queue) => {
      const task = queue.tasks.find((item: any) => item.id === attempt.taskId);
      if (!this.isCurrentAttempt(queue, task, attempt)) return;

      this.setReceiverRateLimitBackoff(queue, task, backoffUntil);
      this.requeueRateLimitedTask(queue, task, backoffUntil);
      requeued = true;
      this.options.log('warn', 'Auto-send direct API failed; task will retry', {
        command: attempt.commandKey,
        kind: attempt.kind,
        receiverKey: attempt.receiverKey,
        retryInMs: backoffUntil - now,
        reason,
      });
    });

    if (!locked) {
      this.scheduleAttemptFinalizationRetry('requeue', attempt, reason, retryAttempt);
      return;
    }

    if (requeued) this.processDueQueue();
  }

  async sendQueuedTask(attempt: any): Promise<void> {
    if (!attempt?.commandPayload) {
      this.requeueFailedAttempt(attempt, 'missing command payload');
      return;
    }

    try {
      const response = await fetch('/api/command', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          controlCode: attempt.pageCode || this.getPageCode(),
          command: attempt.commandPayload,
          targetDevice: attempt.targetDevice || this.getTargetDevice(),
        }),
      });

      if (!response.ok) {
        let text = '';
        try {
          text = await response.text();
        } catch {
          text = '';
        }
        throw new Error(text || `HTTP ${response.status}`);
      }

      this.confirmQueuedAttempt(attempt);
    } catch (error) {
      this.requeueFailedAttempt(attempt, error instanceof Error ? error.message : String(error || 'request failed'));
    }
  }

  /**
   * Two-level timing queue processor:
   *
   * 1. Collect all tasks with dueAt <= now (ready by their own interval).
   * 2. Sort by nearest dueAt.
   * 3. Pick the first ready task that this tab is allowed to execute.
   * 4. Check receiver cooldown: now >= receiver nextSendAllowedAt.
   * 5. Mark the task as the single active attempt.
   * 6. Send it through POST /api/command and complete or requeue from that response.
   */
  processDueQueue(): void {
    let attempt: any = null;
    this.tryQueueLock((queue) => {
      const now = Date.now();
      this.settleExpiredActiveSends(queue, now);

      const task = this.getNextRunnableTask(queue, now, true);
      if (!task) return;

      const result = task.kind === 'manual' ? this.runManualTask(queue, task) : this.runAutoTask(queue, task);

      if (result === 'skip') return;

      if (result === 'remove') {
        queue.tasks = queue.tasks.filter((t: any) => t.id !== task.id);
        if (task.kind === 'manual') this.manualTasks.delete(task.id);
        return;
      }

      if (result?.taskId) attempt = result;
    });

    if (attempt) void this.sendQueuedTask(attempt);
  }

  getInputSnapshot(button: any, config: any): any[] {
    const panel = button.closest('.cmd-panel') || button.closest('form') || document;
    const fields = Array.from(panel.querySelectorAll('input, textarea, select')) as any[];
    const configuredInputSelector = String(config?.inputSelector || '');
    if (configuredInputSelector) {
      const input = document.querySelector(configuredInputSelector);
      if (input && !fields.includes(input)) fields.push(input);
    }
    return fields.map((field: any, index) => ({
      selector: field.id
        ? `#${CSS.escape(field.id)}`
        : (configuredInputSelector && field.matches?.(configuredInputSelector) ? configuredInputSelector : ''),
      index,
      value: field.type === 'checkbox' || field.type === 'radio' ? field.checked : field.value,
      checked: Boolean(field.checked),
    }));
  }

  getSnapshotValue(snapshot: any[], selector: string): string {
    if (!selector) return '';
    const item = snapshot.find((entry: any) => entry.selector === selector);
    return String(item?.value || '').trim();
  }

  getSnapshotNumber(snapshot: any[], selector: string, fallback: number): number {
    const raw = this.getSnapshotValue(snapshot, selector);
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : fallback;
  }

  isDirectCommandSupported(commandKey: string): boolean {
    return commandKey === 'sendMessage'
      || commandKey === 'writeForMe'
      || DIRECT_SIMPLE_COMMANDS.has(commandKey)
      || DIRECT_URL_COMMANDS.has(commandKey);
  }

  buildCommandPayload(commandKey: string, snapshot: any[]): any {
    const key = String(commandKey || '').trim();
    const targetDevice = this.getTargetDevice();

    if (DIRECT_SIMPLE_COMMANDS.has(key)) {
      return { commandPayload: key, targetDevice };
    }

    if (key === 'sendMessage') {
      const text = this.getSnapshotValue(snapshot, '#val-sendMessage');
      if (!text) return null;
      return { commandPayload: `sendMessage ${encodeURIComponent(text)}`, targetDevice };
    }

    if (key === 'writeForMe') {
      const text = this.getSnapshotValue(snapshot, '#val-writeForMe-text');
      if (!text || text.length > 200) return null;
      const count = Math.max(1, Math.min(5, this.getSnapshotNumber(snapshot, '#val-writeForMe-count', 1)));
      return { commandPayload: `writeForMe ${encodeURIComponent(text)}|DELIM|${count}`, targetDevice };
    }

    if (DIRECT_URL_COMMANDS.has(key)) {
      const config = (INPUT_CAPTURE_COMMANDS as any)[key] || this.getCommandConfig(key);
      const value = this.getSnapshotValue(snapshot, config?.inputSelector || '');
      if (!isHttpUrl(value)) return null;
      return { commandPayload: `${key} ${value}`, targetDevice };
    }

    return null;
  }

  hasOwnedManualTask(commandKey: string): boolean {
    return Array.from(this.manualTasks.values()).some((state: any) => state?.commandKey === commandKey);
  }

  getReusableManualSnapshot(commandKey: string): any[] | null {
    const cached = this.recentManualSnapshots.get(commandKey);
    if (!cached || Date.now() - Number(cached.at || 0) > MANUAL_SNAPSHOT_REUSE_MS) return null;
    if (!this.hasOwnedManualTask(commandKey)) return null;
    return Array.isArray(cached.snapshot) ? cached.snapshot : null;
  }

  getManualValidationConfig(commandKey: string, config: any): any {
    return (INPUT_CAPTURE_COMMANDS as any)[commandKey] || (config?.inputSelector ? config : null);
  }

  enqueueManualTask(task: any, state: any, attempt = 0): void {
    this.manualTasks.set(task.id, state);
    const queued = this.tryQueueLock((queue) => {
      if (queue.tasks.some((item: any) => item.id === task.id)) return;
      task.sequence = this.getNextSequence(queue);
      // Manual tasks go to the front of the queue for priority.
      queue.tasks.unshift(task);
    });

    if (queued) {
      this.processDueQueue();
      return;
    }

    if (attempt < 8) {
      const retryDelay = Math.min(LOCK_TTL_MS, 150 + attempt * 150);
      window.setTimeout(() => {
        if (this.manualTasks.has(task.id)) this.enqueueManualTask(task, state, attempt + 1);
      }, retryDelay);
      return;
    }

    this.manualTasks.delete(task.id);
    this.options.notifySite('Auto-send queue is busy. Try again.', 'error');
  }

  captureManualSend(event: Event): void {
    if (!(event.target instanceof Element)) return;

    const button: any = event.target.closest('[data-send]');
    if (!button || button !== event.target.closest('[data-send]')) return;

    const commandKey = String(button.dataset.send || '');
    if (!commandKey) return;
    if (!this.isDirectCommandSupported(commandKey)) return;

    const config = this.getCommandConfig(commandKey) || (INPUT_CAPTURE_COMMANDS as any)[commandKey] || { key: commandKey };

    let snapshot = this.getInputSnapshot(button, config);
    let payload = this.buildCommandPayload(commandKey, snapshot);
    if (!payload) {
      const reusableSnapshot = this.getReusableManualSnapshot(commandKey);
      if (reusableSnapshot) {
        snapshot = reusableSnapshot;
        payload = this.buildCommandPayload(commandKey, snapshot);
      }
    }

    if (!payload) {
      const validationConfig = this.getManualValidationConfig(commandKey, config);
      if (validationConfig?.inputSelector) {
        this.options.notifySite('Enter a valid value before queueing send', 'error');
        event.preventDefault();
        event.stopImmediatePropagation();
      } else {
        this.options.notifySite('This command is not supported by queued send yet', 'error');
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const taskId = createId('manualsend');
    const pageKey = this.getPageKey();
    const pageUrl = this.getPageUrl();
    const pageCode = this.getPageCode();
    const receiverKey = this.getReceiverKey(pageKey, pageCode);
    const sendType = this.getSendType(config, 'manual');
    const taskKey = this.buildTaskKey(pageKey, commandKey, sendType);
    const now = Date.now();

    const task = {
      id: taskId,
      key: taskKey,
      ownerId: this.instanceId,
      kind: 'manual',
      commandKey,
      sendType,
      category: config?.label || commandKey,
      profileTitle: this.getProfileTitle(),
      pageKey,
      pageUrl,
      pageCode,
      receiverKey,
      source: 'manual',
      commandPayload: payload.commandPayload,
      targetDevice: payload.targetDevice,
      snapshot,
      createdAt: now,
      dueAt: now, // Ready immediately, subject only to this receiver's request interval.
      sequence: now,
      status: TASK_STATUS.PENDING,
      progressStartedAt: now,
      progressEndsAt: now,
    };

    this.recentManualSnapshots.set(commandKey, { snapshot, at: now });
    this.enqueueManualTask(task, {
      button,
      snapshot,
      commandKey,
      commandPayload: payload.commandPayload,
      targetDevice: payload.targetDevice,
    });
  }

  getOrCreateControlHost(sendButton: any): any {
    const parent = sendButton.parentElement;
    if (!parent) return null;

    if (!parent.matches('.cmd-panel')) return parent;

    const wrapper = createElement('div', {
      className: 'ctrlem-db-autosend-group',
    });
    parent.insertBefore(wrapper, sendButton);
    wrapper.appendChild(sendButton);
    return wrapper;
  }

  syncIntervalInputs(): void {
    document.querySelectorAll('.ctrlem-db-autosend-interval-input').forEach((input: any) => {
      const commandKey = String(input.dataset.command || '');
      const state = this.states.get(commandKey);
      const task = state?.taskId
        ? this.getStoredQueue().tasks.find((item: any) => item.id === state.taskId)
        : null;
      const seconds = String(clampAutoSendInterval(task?.taskIntervalSeconds || this.getIntervalSeconds()));
      if (input.value !== seconds) input.value = seconds;
    });
  }

  createIntervalInput(commandKey: string): any {
    const input = createElement('input', {
      className: 'ctrlem-db-interval-input ctrlem-db-autosend-interval-input',
      type: 'number',
      value: String(this.getIntervalSeconds()),
      attrs: {
        min: String(AUTO_SEND_INTERVAL_MIN),
        max: String(AUTO_SEND_INTERVAL_MAX),
        step: '1',
        'aria-label': 'Auto-send interval in seconds',
      },
      dataset: { command: commandKey },
    });

    input.addEventListener('change', () => {
      const nextInterval = clampAutoSendInterval(input.value);
      input.value = String(nextInterval);
      if (this.states.has(commandKey)) {
        this.updateTaskInterval(commandKey, nextInterval);
      } else {
        this.options.setAutoSendInterval?.(nextInterval);
      }
      this.renderManager();
    });

    return input;
  }

  mountControls(): boolean {
    let changed = false;

    (AUTO_SEND_COMMAND_KEYS as readonly string[]).forEach((commandKey) => {
      const config = this.getCommandConfig(commandKey);
      if (!config) return;

      document.querySelectorAll(`[data-send="${commandKey}"]`).forEach((sendButton: any) => {
        const parent = this.getOrCreateControlHost(sendButton);
        if (!parent || parent.querySelector(`.ctrlem-db-auto-send-button[data-command="${commandKey}"]`)) {
          return;
        }

        parent.classList.add('ctrlem-db-autosend-group');
        const intervalInput = this.createIntervalInput(commandKey);
        const button = createElement('button', {
          className: 'ctrlem-db-auto-send-button',
          text: 'A',
          title: 'Start auto-send',
          type: 'button',
          attrs: {
            'aria-label': `Auto-send ${commandKey}`,
            'aria-pressed': 'false',
          },
          dataset: { command: commandKey },
        });
        button.addEventListener('click', () => this.toggle(config, sendButton, button));
        parent.appendChild(intervalInput);
        parent.appendChild(createElement('span', { className: 'ctrlem-db-autosend-sec', text: 'sec' }));
        parent.appendChild(button);
        this.adoptCurrentPageTasks();
        this.setButtonState(button, this.states.has(commandKey));
        changed = true;
      });
    });

    this.adoptCurrentPageTasks();

    if (changed) this.options.log('info', 'Auto-send controls mounted');
    return changed;
  }

  refreshControlButtons(): void {
    document.querySelectorAll('.ctrlem-db-auto-send-button').forEach((button: any) => {
      this.setButtonState(button, this.states.has(button.dataset.command));
    });
  }

  isTaskActiveForDisplay(queue: any, task: any, now = Date.now()): boolean {
    if (task.kind === 'manual') return this.isOwnerAlive(queue, task.ownerId, now);
    if (task.kind === 'auto') return this.isTaskPageActive(queue, task, now);
    return false;
  }

  getReadyDisplayTasks(queue: any, now = Date.now()): any[] {
    return this.sortReadyTasks(queue.tasks.filter((task: any) => (
      Number(task.dueAt || 0) <= now && this.isTaskActiveForDisplay(queue, task, now)
    )));
  }

  getEffectiveSendAt(task: any, queue: any, readyTasks: any[], now = Date.now()): number {
    if (!this.isTaskActiveForDisplay(queue, task, now)) return Number.MAX_SAFE_INTEGER;
    if (task?.status === TASK_STATUS.SENDING) return Number(task?.attemptedAt || now);

    const dueAt = Number(task?.dueAt || 0);
    const receiverKey = this.getTaskReceiverKey(task);
    const firstAllowedAt = Math.max(now, dueAt, this.getTaskNextSendAllowedAt(queue, task));
    if (dueAt > now) return firstAllowedAt;

    const receiverReadyTasks = readyTasks.filter((item: any) => this.getTaskReceiverKey(item) === receiverKey);
    const readyIndex = Math.max(0, receiverReadyTasks.findIndex((item: any) => item.id === task.id));
    return firstAllowedAt + readyIndex * this.getBufferedMinimumRequestIntervalMs();
  }

  getOrderedTasks(queue: any, now = Date.now()): any[] {
    const readyTasks = this.getReadyDisplayTasks(queue, now);
    return [...queue.tasks].sort((a: any, b: any) => {
      const aSendAt = this.getEffectiveSendAt(a, queue, readyTasks, now);
      const bSendAt = this.getEffectiveSendAt(b, queue, readyTasks, now);
      if (aSendAt !== bSendAt) return aSendAt - bSendAt;
      return this.taskSortValue(a) - this.taskSortValue(b);
    });
  }

  getDisplayProgressWindow(task: any, queue: any, readyTasks: any[], now = Date.now()): any {
    const effectiveAt = this.getEffectiveSendAt(task, queue, readyTasks, now);
    const progressEndsAt = Math.max(
      Number(task?.progressEndsAt || 0),
      Number(task?.dueAt || 0),
      Number.isFinite(effectiveAt) ? effectiveAt : 0,
    );
    const progressStartedAt = Math.min(
      Math.max(0, Number(task?.progressStartedAt || task?.createdAt || now)),
      progressEndsAt,
    );
    return { progressStartedAt, progressEndsAt };
  }

  getCooldownPercent(task: any, queue = this.getStoredQueue(), readyTasks = this.getReadyDisplayTasks(queue)): number {
    const now = Date.now();
    if (!this.isTaskActiveForDisplay(queue, task, now)) return 100;
    if (task.status === TASK_STATUS.SENDING) return 100;
    const { progressStartedAt, progressEndsAt } = this.getDisplayProgressWindow(task, queue, readyTasks, now);
    if (progressEndsAt <= now) return 100;
    const duration = Math.max(1, progressEndsAt - progressStartedAt);
    return Math.max(0, Math.min(100, ((now - progressStartedAt) / duration) * 100));
  }

  /**
   * Return human-readable remaining time text.
   * - "Xs" when waiting for the task's own interval.
   * - "rate:Xs" when the task is ready but waiting for the receiver rate limit.
   * - "ready" when both conditions are met.
   */
  getRemainingText(task: any, queue = this.getStoredQueue(), readyTasks = this.getReadyDisplayTasks(queue)): string {
    if (task.status === TASK_STATUS.SENDING) return 'sending';

    const now = Date.now();
    const dueAt = Number(task?.dueAt || 0);
    const taskRemaining = Math.max(0, dueAt - now);

    if (taskRemaining > 0) {
      return `${Math.ceil(taskRemaining / 1000)}s`;
    }

    if (!this.isTaskActiveForDisplay(queue, task, now)) return 'waiting tab';

    const effectiveAt = this.getEffectiveSendAt(task, queue, readyTasks, now);
    const rateRemaining = Math.max(0, effectiveAt - now);

    if (rateRemaining > 0) {
      const cooldown = this.getReceiverCooldown(queue, this.getTaskReceiverKey(task));
      if (Number(cooldown.rateLimitBackoffUntil || 0) > now) {
        return `retry:${Math.ceil(rateRemaining / 1000)}s`;
      }
      return `rate:${Math.ceil(rateRemaining / 1000)}s`;
    }

    return 'ready';
  }

  getTaskPageUrl(task: any): string {
    return String(task?.pageUrl || task?.pageKey || '').trim();
  }

  openTaskPage(task: any): void {
    const url = this.getTaskPageUrl(task);
    if (!url) return;

    const gmOpenInTab = (globalThis as any).GM_openInTab;
    if (typeof gmOpenInTab === 'function') {
      gmOpenInTab(url, { active: true, insert: true });
      return;
    }

    window.open(url, '_blank', 'noopener');
  }

  startManagerTimer(): void {
    if (this.managerTimer) return;
    this.managerTimer = window.setInterval(() => {
      const queue = this.getStoredQueue();
      const readyTasks = this.getReadyDisplayTasks(queue);
      const orderedTasks = this.getOrderedTasks(queue);
      const rowsHost = document.querySelector(`#${MANAGER_ID} .ctrlem-db-autosend-rows`);
      if (!queue.tasks.length || !rowsHost) {
        window.clearInterval(this.managerTimer);
        this.managerTimer = 0;
        return;
      }

      this.syncTaskRows(rowsHost, orderedTasks, queue, readyTasks);
    }, USER_CONFIG.autoSend.managerRefreshMs);
  }

  setElementText(element: any, text: string): void {
    if (!element) return;
    if (element.textContent !== text) element.textContent = text;
    if (element.title !== undefined && element.title !== text) element.title = text;
  }

  updateTaskRow(row: any, task: any, queue: any, readyTasks: any[]): void {
    row.classList.toggle('is-manual', task.kind === 'manual');
    row.classList.toggle('is-auto', task.kind === 'auto');
    this.setElementText(row.querySelector('.ctrlem-db-autosend-kind'), task.sendType || task.kind);
    this.setElementText(row.querySelector('.ctrlem-db-autosend-profile'), task.profileTitle || 'Current profile');
    this.setElementText(row.querySelector('.ctrlem-db-autosend-code'), task.pageCode || 'Current page');
    this.setElementText(row.querySelector('.ctrlem-db-autosend-category'), task.category || task.commandKey || 'Send');

    const progress: any = row.querySelector('.ctrlem-db-autosend-progress');
    if (progress) progress.style.width = `${this.getCooldownPercent(task, queue, readyTasks)}%`;

    const wait: any = row.querySelector('.ctrlem-db-autosend-wait');
    if (wait) {
      const isWaitingTab = !this.isTaskActiveForDisplay(queue, task, Date.now()) && Number(task?.dueAt || 0) <= Date.now();
      this.setElementText(wait, this.getRemainingText(task, queue, readyTasks));
      wait.classList.toggle('is-open-tab', isWaitingTab);
      wait.dataset.openTab = isWaitingTab ? 'true' : 'false';
      wait.title = isWaitingTab ? 'Open this page to resume auto-send' : wait.textContent;
    }
    row.dataset.pageUrl = this.getTaskPageUrl(task);
  }

  syncToastOffset(panel = document.getElementById(MANAGER_ID)): void {
    if (!panel) {
      document.documentElement.style.removeProperty(TOAST_BOTTOM_PROPERTY);
      return;
    }

    const bottomGap = 16;
    const toastGap = 12;
    document.documentElement.style.setProperty(
      TOAST_BOTTOM_PROPERTY,
      `${Math.ceil(panel.getBoundingClientRect().height + bottomGap + toastGap)}px`,
    );
  }

  createTaskRow(task: any, queue: any, readyTasks: any[]): any {
    const stopButton = createElement('button', {
      className: 'ctrlem-db-autosend-mini-button ctrlem-db-autosend-stop',
      text: 'Stop',
      title: 'Stop this queued send',
      type: 'button',
    });
    stopButton.addEventListener('click', () => this.requestStopTask(task.id));

    const row = createElement('div', {
      className: `ctrlem-db-autosend-row is-${task.kind}`,
      dataset: { taskId: task.id },
    }, [
      createElement('span', {
        className: 'ctrlem-db-autosend-kind',
      }),
      createElement('span', {
        className: 'ctrlem-db-autosend-profile',
      }),
      createElement('span', {
        className: 'ctrlem-db-autosend-code',
      }),
      createElement('span', {
        className: 'ctrlem-db-autosend-category',
      }),
      createElement('span', { className: 'ctrlem-db-autosend-cooldown' }, [
        createElement('span', {
          className: 'ctrlem-db-autosend-progress',
        }),
      ]),
      createElement('span', { className: 'ctrlem-db-autosend-wait' }),
      stopButton,
    ]);
    const wait: any = row.querySelector('.ctrlem-db-autosend-wait');
    wait?.addEventListener('click', (event: Event) => {
      if (wait.dataset.openTab !== 'true') return;
      event.preventDefault();
      event.stopPropagation();
      const currentTask = this.getStoredQueue().tasks.find((item: any) => item.id === row.dataset.taskId);
      this.openTaskPage(currentTask || { pageUrl: row.dataset.pageUrl });
    });

    this.updateTaskRow(row, task, queue, readyTasks);
    return row;
  }

  syncTaskRows(rowsHost: any, tasks: any[], queue: any, readyTasks: any[]): void {
    const rowsById = new Map(
      (Array.from(rowsHost.querySelectorAll('.ctrlem-db-autosend-row')) as any[])
        .map((row) => [row.dataset.taskId, row]),
    );

    tasks.forEach((task: any, index: number) => {
      let row = rowsById.get(task.id);
      if (row) {
        rowsById.delete(task.id);
        this.updateTaskRow(row, task, queue, readyTasks);
      } else {
        row = this.createTaskRow(task, queue, readyTasks);
      }

      const currentAtIndex = rowsHost.children[index];
      if (row !== currentAtIndex) rowsHost.insertBefore(row, currentAtIndex || null);
    });

    rowsById.forEach((row: any) => row.remove());
  }

  renderManager(): boolean {
    const queue = this.getStoredQueue();
    const existing = document.getElementById(MANAGER_ID);
    this.refreshControlButtons();

    if (!queue.tasks.length) {
      existing?.remove();
      this.syncToastOffset(null);
      if (this.managerTimer) {
        window.clearInterval(this.managerTimer);
        this.managerTimer = 0;
      }
      return Boolean(existing);
    }

    const readyTasks = this.getReadyDisplayTasks(queue);
    const orderedTasks = this.getOrderedTasks(queue);

    if (existing) {
      existing.classList.toggle('is-collapsed', this.managerCollapsed);
      const toggleButton: any = existing.querySelector('.ctrlem-db-autosend-toggle');
      if (toggleButton) {
        toggleButton.textContent = this.managerCollapsed ? 'Show' : 'Hide';
        toggleButton.title = this.managerCollapsed ? 'Expand queue' : 'Collapse queue';
        toggleButton.setAttribute('aria-expanded', String(!this.managerCollapsed));
      }
      const rowsHost = existing.querySelector('.ctrlem-db-autosend-rows') || existing;
      this.syncTaskRows(rowsHost, orderedTasks, queue, readyTasks);
      this.syncToastOffset(existing);
      this.startManagerTimer();
      return false;
    }

    const toggleButton = createElement('button', {
      className: 'ctrlem-db-autosend-mini-button ctrlem-db-autosend-toggle',
      text: 'Hide',
      title: 'Collapse queue',
      type: 'button',
      attrs: { 'aria-expanded': String(!this.managerCollapsed) },
    });
    toggleButton.addEventListener('click', () => {
      this.managerCollapsed = !this.managerCollapsed;
      toggleButton.textContent = this.managerCollapsed ? 'Show' : 'Hide';
      toggleButton.title = this.managerCollapsed ? 'Expand queue' : 'Collapse queue';
      toggleButton.setAttribute('aria-expanded', String(!this.managerCollapsed));
      panel.classList.toggle('is-collapsed', this.managerCollapsed);
      this.syncToastOffset(panel);
    });

    const stopAllButton = createElement('button', {
      className: 'ctrlem-db-autosend-mini-button ctrlem-db-autosend-stop-all',
      text: 'Stop all',
      title: 'Stop all queued sends',
      type: 'button',
    });
    stopAllButton.addEventListener('click', () => this.requestStopAllTasks());

    const panel = createElement('div', {
      id: MANAGER_ID,
      className: 'ctrlem-db-autosend-manager',
      attrs: { role: 'status' },
    }, [
      createElement('div', { className: 'ctrlem-db-autosend-head' }, [
        createElement('span', { className: 'ctrlem-db-autosend-note', text: 'Keep this tab open for auto-send.' }),
        toggleButton,
        stopAllButton,
      ]),
      createElement('div', { className: 'ctrlem-db-autosend-rows' },
        orderedTasks.map((task: any) => this.createTaskRow(task, queue, readyTasks))),
    ]);
    panel.classList.toggle('is-collapsed', this.managerCollapsed);

    document.body.appendChild(panel);
    this.syncToastOffset(panel);
    this.startManagerTimer();
    return true;
  }
}
