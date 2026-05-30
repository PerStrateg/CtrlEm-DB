import {
  ACTION_COMMANDS,
  AUTO_SEND_COMMAND_KEYS,
  AUTO_SEND_INTERVAL_MAX,
  AUTO_SEND_INTERVAL_MIN,
  AUTO_SEND_QUEUE_STORAGE_KEY,
  MEDIA_COMMANDS,
  RecordType,
  TEXT_COMMANDS,
  TYPE_LABELS,
  USER_CONFIG,
} from '../domain/constants';
import { clampAutoSendInterval, clampMinimumRequestInterval, createId } from '../domain/content';
import { getMediaPickerId } from '../ui/mediaPicker';
import { getTextPickerId } from '../ui/textPicker';
import { createElement } from '../ui/dom';

const MANAGER_ID = 'ctrlem-db-autosend-manager';
const TOAST_BOTTOM_PROPERTY = '--ctrlem-db-toast-bottom';
const LOCK_TTL_MS = USER_CONFIG.autoSend.queueLockTtlMs;
const HEARTBEAT_MS = USER_CONFIG.autoSend.heartbeatMs;
const HEARTBEAT_TIMEOUT_MS = USER_CONFIG.autoSend.heartbeatTimeoutMs;
const RUNNER_MS = USER_CONFIG.autoSend.runnerMs;

const TASK_STATUS = Object.freeze({
  PENDING: 'pending',
  SENDING: 'sending',
});

export class AutoSendController {
  private states = new Map<string, any>();

  private manualTasks = new Map<string, any>();

  private readonly instanceId = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  private managerTimer = 0;

  private heartbeatTimer = 0;

  private runnerTimer = 0;

  private bypassSendButton: any = null;

  private managerCollapsed = false;

  constructor(private readonly options: any) {
    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.key !== AUTO_SEND_QUEUE_STORAGE_KEY) return;
      this.applyStoredQueue(this.parseStoredQueue(event.newValue));
    });
    document.addEventListener('click', (event) => this.captureManualSend(event), true);
    window.addEventListener('beforeunload', () => this.removeOwnedTasks('tab unloaded'));

    this.startHeartbeat();
    this.startRunner();
  }

  getCommandConfig(commandKey: string): any {
    return (TEXT_COMMANDS as any)[commandKey] || (MEDIA_COMMANDS as any)[commandKey] || (ACTION_COMMANDS as any)[commandKey] || null;
  }

  getIntervalMs(): number {
    const seconds = clampAutoSendInterval(this.options.getState()?.autoSendIntervalSeconds);
    return seconds * 1000;
  }

  getIntervalSeconds(): number {
    return clampAutoSendInterval(this.options.getState()?.autoSendIntervalSeconds);
  }

  getMinimumRequestIntervalMs(): number {
    const seconds = clampMinimumRequestInterval(this.options.getState()?.minimumRequestIntervalSeconds);
    return seconds * 1000;
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

  normalizeTask(task: any, index: number): any {
    const createdAt = Math.max(0, Number(task.createdAt) || Date.now());
    const sequence = Number.isFinite(Number(task.sequence)) ? Number(task.sequence) : createdAt + index;
    const hasTaskInterval = task.taskIntervalSeconds !== undefined && task.taskIntervalSeconds !== null && task.taskIntervalSeconds !== '';
    return {
      ...task,
      id: String(task.id || ''),
      key: String(task.key || ''),
      kind: String(task.kind || ''),
      ownerId: String(task.ownerId || ''),
      commandKey: String(task.commandKey || ''),
      sendType: String(task.sendType || task.kind || ''),
      pageKey: String(task.pageKey || '').trim(),
      pageUrl: String(task.pageUrl || task.pageKey || '').trim(),
      pageCode: String(task.pageCode || '').trim(),
      categoryId: String(task.categoryId || ''),
      category: String(task.category || ''),
      itemValue: String(task.itemValue || ''),
      itemIndex: Number.isFinite(Number(task.itemIndex)) ? Number(task.itemIndex) : -1,
      nextIndex: Number.isFinite(Number(task.nextIndex)) ? Number(task.nextIndex) : -1,
      taskIntervalSeconds: clampAutoSendInterval(hasTaskInterval ? task.taskIntervalSeconds : this.getIntervalSeconds()),
      createdAt,
      dueAt: Math.max(0, Number(task.dueAt) || 0),
      sequence,
      status: task.status || TASK_STATUS.PENDING,
    };
  }

  normalizeQueueState(queue: any): any {
    const source = queue && typeof queue === 'object' ? queue : {};
    const heartbeats = source.heartbeats && typeof source.heartbeats === 'object' ? source.heartbeats : {};
    return {
      tasks: Array.isArray(source.tasks)
        ? source.tasks
          .map((task: any, index: number) => this.normalizeTask(task, index))
          .filter((task: any) => task.id && task.key && task.kind && task.commandKey)
        : [],
      lastSentAt: Math.max(0, Number(source.lastSentAt) || 0),
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

  startRunner(): void {
    if (this.runnerTimer) return;
    this.runnerTimer = window.setInterval(() => this.processDueQueue(), RUNNER_MS);
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
      const manualPriority = (a.kind === 'manual' ? 0 : 1) - (b.kind === 'manual' ? 0 : 1);
      if (manualPriority !== 0) return manualPriority;
      const dueDiff = Number(a.dueAt || 0) - Number(b.dueAt || 0);
      if (dueDiff !== 0) return dueDiff;
      return this.taskSortValue(a) - this.taskSortValue(b);
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
    const sendType = this.getSendType(config, 'auto');
    const taskKey = this.buildTaskKey(pageKey, config.key, sendType);
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
        existing.profileTitle = state.profileTitle;
        existing.category ||= category;
        existing.categoryId ||= startItem?.categoryId || '';
        existing.taskIntervalSeconds = clampAutoSendInterval(existing.taskIntervalSeconds || this.getIntervalSeconds());
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
        pageKey,
        pageUrl,
        pageCode,
        categoryId: startItem?.categoryId || '',
        category,
        profileTitle: state.profileTitle,
        itemValue: startItem?.value || '',
        itemIndex: Number.isFinite(Number(startItem?.index)) ? Number(startItem.index) : startIndex,
        nextIndex: startIndex,
        taskIntervalSeconds: this.getIntervalSeconds(),
        createdAt: now,
        dueAt: now, // Ready immediately (subject only to the global request interval)
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
      intervalSeconds: this.getIntervalSeconds(),
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
    });
    this.renderManager();
  }

  clickSendButton(button: any): void {
    this.bypassSendButton = button;
    try {
      button.click();
    } finally {
      this.bypassSendButton = null;
    }
  }

  runAutoTask(task: any): string {
    const state = this.states.get(task.commandKey);
    if (!state || state.taskId !== task.id || state.stopped) return 'skip';

    if (!state.sendButton.isConnected) {
      this.stop(state.commandKey, 'send button disconnected', { publish: false });
      return 'skip';
    }

    if (state.sendButton.disabled) return 'skip';

    const focusState = this.options.captureFocusState?.();

    if (!state.config.clickOnly) {
      const item = state.items[state.nextIndex % state.items.length];
      state.nextIndex = (state.nextIndex + 1) % state.items.length;

      if (!this.selectItem(state.config, item, { focus: false, focusState })) {
        this.options.notifySite('Auto-send item is no longer visible', 'error');
        this.stop(state.commandKey, 'item no longer visible', { publish: false });
        return 'remove';
      }

      const nextItem = state.items[state.nextIndex % state.items.length];
      task.itemValue = nextItem?.value || item.value || '';
      task.itemIndex = Number.isFinite(Number(nextItem?.index)) ? Number(nextItem.index) : state.nextIndex;
      task.categoryId = nextItem?.categoryId || item.categoryId || task.categoryId || '';
      task.category = nextItem?.category || item.category || task.category || state.category;
      task.nextIndex = state.nextIndex;
    }

    this.clickSendButton(state.sendButton);
    this.options.restoreFocusState?.(focusState);
    return 'sent';
  }

  runManualTask(task: any): string {
    const state = this.manualTasks.get(task.id);
    if (!state?.button?.isConnected) return 'remove';
    if (state.button.disabled) return 'skip';

    this.restoreInputSnapshot(state.snapshot);
    this.clickSendButton(state.button);
    this.manualTasks.delete(task.id);
    return 'sent';
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
      && !state.sendButton.disabled
    );
  }

  getNextRunnableTask(queue: any, now = Date.now()): any {
    const readyTasks = this.sortReadyTasks(
      queue.tasks.filter((task: any) => Number(task.dueAt || 0) <= now),
    );

    for (const task of readyTasks) {
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

  /**
   * Two-level timing queue processor:
   *
   * 1. Collect all tasks with dueAt <= now (ready by their own interval).
   * 2. Sort by nearest dueAt.
   * 3. Pick the first ready task that this tab is allowed to execute.
   * 4. Check global rate limit: now >= lastSentAt + minimumRequestInterval.
   * 5. Execute the task (auto or manual).
   * 6. On success: update lastSentAt, re-queue auto task with dueAt = actualSentAt + taskInterval.
   */
  processDueQueue(): void {
    const snapshot = this.getStoredQueue();
    const snapshotNow = Date.now();
    const snapshotTask = this.getNextRunnableTask(snapshot, snapshotNow);
    if (!snapshotTask) return;
    if (snapshotNow < Number(snapshot.lastSentAt || 0) + this.getMinimumRequestIntervalMs()) return;

    this.tryQueueLock((queue) => {
      const now = Date.now();
      const minIntervalMs = this.getMinimumRequestIntervalMs();

      // Check global rate limit
      const rateLimitAt = Number(queue.lastSentAt || 0) + minIntervalMs;
      if (now < rateLimitAt) return;

      const task = this.getNextRunnableTask(queue, now);
      if (!task) return;

      // Execute the task
      const result = task.kind === 'manual' ? this.runManualTask(task) : this.runAutoTask(task);

      if (result === 'skip') return;

      if (result === 'remove') {
        queue.tasks = queue.tasks.filter((t: any) => t.id !== task.id);
        if (task.kind === 'manual') this.manualTasks.delete(task.id);
        return;
      }

      // Successful send
      const sentAt = Date.now();
      queue.lastSentAt = sentAt;

      if (task.kind === 'auto') {
        // Re-queue auto task with its own interval
        task.status = TASK_STATUS.PENDING;
        task.dueAt = sentAt + clampAutoSendInterval(task.taskIntervalSeconds) * 1000;
      } else {
        // Manual task is one-shot — remove it
        queue.tasks = queue.tasks.filter((t: any) => t.id !== task.id);
        this.manualTasks.delete(task.id);
      }
    });
  }

  hasActiveAutoQueue(): boolean {
    const queue = this.getStoredQueue();
    this.cleanStaleTasks(queue);
    return queue.tasks.some((task: any) => task.kind === 'auto');
  }

  getInputSnapshot(button: any, config: any): any[] {
    const panel = button.closest('.cmd-panel') || button.closest('form') || document;
    const fields = Array.from(panel.querySelectorAll('input, textarea, select')) as any[];
    if (config?.inputSelector) {
      const input = document.querySelector(config.inputSelector);
      if (input && !fields.includes(input)) fields.push(input);
    }
    return fields.map((field: any, index) => ({
      selector: field.id ? `#${CSS.escape(field.id)}` : '',
      index,
      value: field.type === 'checkbox' || field.type === 'radio' ? field.checked : field.value,
      checked: Boolean(field.checked),
    }));
  }

  restoreInputSnapshot(snapshot: any[]): void {
    snapshot.forEach((item: any) => {
      const field: any = item.selector ? document.querySelector(item.selector) : null;
      if (!field) return;
      if (field.type === 'checkbox' || field.type === 'radio') {
        field.checked = Boolean(item.checked);
      } else if (field.value !== item.value) {
        field.value = item.value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  captureManualSend(event: Event): void {
    if (!(event.target instanceof Element)) return;

    const button: any = event.target.closest('[data-send]');
    if (!button || button !== event.target.closest('[data-send]')) return;
    if (button === this.bypassSendButton || button.disabled) return;
    if (!this.hasActiveAutoQueue()) return;

    const commandKey = String(button.dataset.send || '');
    const config = this.getCommandConfig(commandKey);
    if (!commandKey) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const taskId = createId('manualsend');
    const snapshot = this.getInputSnapshot(button, config);
    const pageKey = this.getPageKey();
    const pageUrl = this.getPageUrl();
    const pageCode = this.getPageCode();
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
      createdAt: now,
      dueAt: now, // Ready immediately (subject to global rate limit)
      sequence: now,
      status: TASK_STATUS.PENDING,
    };

    this.manualTasks.set(taskId, { button, snapshot });
    this.tryQueueLock((queue) => {
      task.sequence = this.getNextSequence(queue);
      // Manual tasks go to the front of the queue for priority
      queue.tasks.unshift(task);
    });
    this.processDueQueue();
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
    const seconds = String(this.getIntervalSeconds());
    document.querySelectorAll('.ctrlem-db-autosend-interval-input').forEach((input: any) => {
      if (input.value !== seconds) input.value = seconds;
    });
  }

  createIntervalInput(): any {
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
    });

    input.addEventListener('change', () => {
      const nextInterval = clampAutoSendInterval(input.value);
      this.options.setAutoSendInterval?.(nextInterval);
      this.syncIntervalInputs();
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
        const intervalInput = this.createIntervalInput();
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
    const dueAt = Number(task?.dueAt || 0);
    if (dueAt > now) return dueAt;
    if (!this.isTaskActiveForDisplay(queue, task, now)) return Number.MAX_SAFE_INTEGER;

    const readyIndex = Math.max(0, readyTasks.findIndex((item: any) => item.id === task.id));
    const firstAllowedAt = Math.max(now, Number(queue.lastSentAt || 0) + this.getMinimumRequestIntervalMs());
    return firstAllowedAt + readyIndex * this.getMinimumRequestIntervalMs();
  }

  getOrderedTasks(queue: any, now = Date.now()): any[] {
    const readyTasks = this.getReadyDisplayTasks(queue, now);
    return [...queue.tasks].sort((a: any, b: any) => {
      const sendDiff = this.getEffectiveSendAt(a, queue, readyTasks, now) - this.getEffectiveSendAt(b, queue, readyTasks, now);
      if (sendDiff !== 0) return sendDiff;
      const priority = (a.kind === 'manual' ? 0 : 1) - (b.kind === 'manual' ? 0 : 1);
      if (priority !== 0) return priority;
      return this.taskSortValue(a) - this.taskSortValue(b);
    });
  }

  /**
   * Calculate progress percentage for the cooldown bar.
   * - If task.dueAt > now: progress is based on the task interval.
   * - If task.dueAt <= now but rate-limited: progress is based on the rate limit.
   * - If both conditions pass: 100% (ready).
   */
  getCooldownPercent(task: any, queue = this.getStoredQueue(), readyTasks = this.getReadyDisplayTasks(queue)): number {
    const now = Date.now();
    const dueAt = Number(task?.dueAt || 0);
    const taskRemaining = Math.max(0, dueAt - now);

    if (taskRemaining > 0) {
      const intervalMs = Math.max(1, clampAutoSendInterval(task.taskIntervalSeconds) * 1000);
      const elapsed = intervalMs - Math.min(intervalMs, taskRemaining);
      return Math.max(0, Math.min(100, (elapsed / intervalMs) * 100));
    }

    if (!this.isTaskActiveForDisplay(queue, task, now)) return 100;

    const minIntervalMs = this.getMinimumRequestIntervalMs();
    const effectiveAt = this.getEffectiveSendAt(task, queue, readyTasks, now);
    const rateRemaining = Math.max(0, effectiveAt - now);

    if (rateRemaining > 0) {
      const elapsed = minIntervalMs - Math.min(minIntervalMs, rateRemaining % minIntervalMs || minIntervalMs);
      return Math.max(0, Math.min(100, (elapsed / minIntervalMs) * 100));
    }

    return 100;
  }

  /**
   * Return human-readable remaining time text.
   * - "Xs" when waiting for the task's own interval.
   * - "rate:Xs" when the task is ready but waiting for the global rate limit.
   * - "ready" when both conditions are met.
   */
  getRemainingText(task: any, queue = this.getStoredQueue(), readyTasks = this.getReadyDisplayTasks(queue)): string {
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
      const rows = document.querySelectorAll(`#${MANAGER_ID} .ctrlem-db-autosend-row`);
      if (!queue.tasks.length || rows.length === 0) {
        window.clearInterval(this.managerTimer);
        this.managerTimer = 0;
        return;
      }

      rows.forEach((row: any) => {
        const task = orderedTasks.find((item: any) => item.id === row.dataset.taskId);
        if (task) this.updateTaskRow(row, task, queue, readyTasks);
      });
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
      const rowsById = new Map(
        (Array.from(rowsHost.querySelectorAll('.ctrlem-db-autosend-row')) as any[])
          .map((row) => [row.dataset.taskId, row]),
      );

      orderedTasks.forEach((task: any, index: number) => {
        let row = rowsById.get(task.id);
        if (row) {
          rowsById.delete(task.id);
          this.updateTaskRow(row, task, queue, readyTasks);
        } else {
          row = this.createTaskRow(task, queue, readyTasks);
        }
        const currentAtIndex = rowsHost.children[index];
        if (row !== currentAtIndex) {
          rowsHost.insertBefore(row, currentAtIndex || null);
        }
      });
      rowsById.forEach((row: any) => row.remove());
      this.syncToastOffset(existing);
      this.startManagerTimer();
      return false;
    }

    const rows = orderedTasks.map((task: any) => this.createTaskRow(task, queue, readyTasks));
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
      createElement('div', { className: 'ctrlem-db-autosend-rows' }, rows),
    ]);
    panel.classList.toggle('is-collapsed', this.managerCollapsed);

    document.body.appendChild(panel);
    this.syncToastOffset(panel);
    this.startManagerTimer();
    return true;
  }
}
