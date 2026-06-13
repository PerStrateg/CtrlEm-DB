import {
  ACTION_COMMANDS,
  AUTO_SEND_COMMAND_KEYS,
  AUTO_SEND_INTERVAL_MAX,
  AUTO_SEND_INTERVAL_MIN,
  AUTO_SEND_SESSION_STORAGE_KEY,
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
const RUNNER_MS = USER_CONFIG.autoSend.runnerMs;
const INTERVAL_BUFFER_MS = 100;

export class AutoSendController {
  private states = new Map<string, any>();

  private receiverCooldowns = new Map<string, any>();

  private restoredCursorKeys = new Set<string>();

  private managerTimer = 0;

  private runnerTimer = 0;

  private managerCollapsed = false;

  private sequence = 0;

  constructor(private readonly options: any) {
    document.addEventListener('click', (event) => this.captureNativeSend(event), true);
    this.startRunner();
  }

  getCommandConfig(commandKey: string): any {
    return (TEXT_COMMANDS as any)[commandKey] || (MEDIA_COMMANDS as any)[commandKey] || (ACTION_COMMANDS as any)[commandKey] || null;
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

  getReceiverKey(pageKey = this.getPageKey(), pageCode = this.getPageCode()): string {
    const normalizedPageCode = String(pageCode || '').trim();
    if (normalizedPageCode) return `receiver:${normalizedPageCode.toUpperCase()}`;

    const pathMatch = String(pageKey || '').match(/\/u\/([^/?#]+)/i);
    if (pathMatch?.[1]) return `receiver:${decodeURIComponent(pathMatch[1]).toUpperCase()}`;

    const normalizedPageKey = String(pageKey || '').trim();
    return normalizedPageKey ? `receiver-url:${normalizedPageKey}` : 'receiver:current';
  }

  getSendType(config: any): string {
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
    const cursor = this.readCursor(config.key);
    const uiState = this.options.getPickerUiState?.(config.key) || {};
    const savedValue = String(cursor?.lastSelectedValue || uiState.value || input?.dataset?.ctrlemDbSelectedValue || input?.value || '').trim();
    const savedIndex = Number.isFinite(Number(cursor?.nextIndex)) && Number(cursor.nextIndex) >= 0
      ? Number(cursor.nextIndex)
      : Number(uiState.itemIndex);

    if (Number.isFinite(savedIndex) && savedIndex >= 0 && items[savedIndex]?.value === savedValue) {
      return savedIndex;
    }

    if (Number.isFinite(Number(cursor?.nextIndex)) && Number(cursor.nextIndex) >= 0) {
      return Number(cursor.nextIndex) % items.length;
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

    const selectOptions = {
      focus: false,
      focusState: options.focusState,
      persistUiState: false,
    };
    if (element.classList.contains('ctrlem-db-media-tile')) {
      this.options.selectMediaItem(input, picker, element, selectOptions);
      return true;
    }

    this.options.selectTextItem(input, picker, element, selectOptions);
    return true;
  }

  isNativeSendButtonReady(button: any): boolean {
    return Boolean(
      button
      && button.isConnected
      && !button.disabled
      && !button.hasAttribute('disabled')
      && button.getAttribute('aria-disabled') !== 'true'
      && !button.classList?.contains('disabled')
      && !button.classList?.contains('is-disabled')
    );
  }

  getNativeSendButton(commandKey: string): any {
    return document.querySelector(`[data-send="${CSS.escape(commandKey)}"]`);
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
    if (!state) return;

    const nextInterval = clampAutoSendInterval(seconds);
    const now = Date.now();
    state.taskIntervalSeconds = nextInterval;
    if (Number(state.dueAt || 0) > now) {
      state.dueAt = now + this.getBufferedIntervalMs(nextInterval);
      state.progressStartedAt = now;
      state.progressEndsAt = state.dueAt;
    }
    this.renderManager();
  }

  readSessionState(): any {
    try {
      const parsed = JSON.parse(window.sessionStorage.getItem(AUTO_SEND_SESSION_STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  writeSessionState(state: any): void {
    try {
      window.sessionStorage.setItem(AUTO_SEND_SESSION_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Session storage can be unavailable in hardened contexts; auto-send still works in memory.
    }
  }

  getCursorBucket(state = this.readSessionState()): any {
    const pageKey = this.getPageKey();
    state.pages ||= {};
    state.pages[pageKey] ||= {};
    return state.pages[pageKey];
  }

  readCursor(commandKey: string): any {
    const state = this.readSessionState();
    return this.getCursorBucket(state)[commandKey] || null;
  }

  writeCursor(commandKey: string, patch: any): void {
    const state = this.readSessionState();
    const bucket = this.getCursorBucket(state);
    bucket[commandKey] = {
      ...(bucket[commandKey] || {}),
      ...patch,
      pageCode: this.getPageCode(),
      updatedAt: Date.now(),
    };
    this.writeSessionState(state);
  }

  captureNativeSend(event: Event): void {
    if (!(event.target instanceof Element)) return;

    const button: any = event.target.closest('[data-send]');
    if (!button || !this.isNativeSendButtonReady(button)) return;

    const commandKey = String(button.dataset.send || '');
    if (!commandKey) return;

    this.recordSendAttempt(this.getReceiverKey(), Date.now());
  }

  recordSendAttempt(receiverKey: string, now = Date.now()): void {
    this.receiverCooldowns.set(receiverKey, {
      lastSentAt: now,
      nextAllowedAt: now + this.getBufferedMinimumRequestIntervalMs(),
    });
  }

  getReceiverNextAllowedAt(receiverKey: string): number {
    return Math.max(0, Number(this.receiverCooldowns.get(receiverKey)?.nextAllowedAt) || 0);
  }

  stop(commandKey: string, reason = 'stopped'): void {
    const state = this.states.get(commandKey);
    if (!state) return;

    this.states.delete(commandKey);
    this.setButtonState(state.button, false);
    this.setCommandButtons(commandKey, false);
    this.options.log('info', 'Auto-send stopped', { command: commandKey, reason });
    this.renderManager();
  }

  stopAll(reason = 'stopped'): void {
    Array.from(this.states.keys()).forEach((commandKey) => this.stop(commandKey, reason));
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
    const cursor = this.readCursor(config.key);
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

    const now = Date.now();
    const taskIntervalSeconds = this.getControlIntervalSeconds(config.key);
    const startIndex = config.clickOnly ? 0 : this.getStartIndex(config, input, items);
    const startItem = config.clickOnly ? null : items[startIndex % items.length];
    const category = cursor?.category || this.getTaskCategory(config, items);

    const state = {
      taskId: createId('autosend'),
      commandKey: config.key,
      config,
      button,
      sendType: this.getSendType(config),
      category,
      categoryId: cursor?.categoryId || startItem?.categoryId || '',
      profileTitle: this.getProfileTitle(),
      pageCode: this.getPageCode(),
      receiverKey: this.getReceiverKey(),
      taskIntervalSeconds,
      nextIndex: Number.isFinite(Number(cursor?.nextIndex)) && Number(cursor.nextIndex) >= 0
        ? Number(cursor.nextIndex)
        : startIndex,
      itemValue: startItem?.value || cursor?.lastSelectedValue || '',
      itemIndex: Number.isFinite(Number(startItem?.index)) ? Number(startItem.index) : startIndex,
      dueAt: now,
      progressStartedAt: now,
      progressEndsAt: now,
      sequence: this.sequence += 1,
      waitReason: 'ready',
    };

    this.states.set(config.key, state);
    this.setButtonState(button, true);
    this.setCommandButtons(config.key, true);
    this.options.log('info', 'Auto-send started', {
      command: config.key,
      type: config.type,
      category: state.category,
      pageCode: state.pageCode,
      items: config.clickOnly ? null : items.length,
      intervalSeconds: taskIntervalSeconds,
    });
    this.processDueQueue();
    this.renderManager();
  }

  toggle(config: any, sendButton: any, button: any): void {
    if (this.states.has(config.key)) {
      this.stop(config.key);
      return;
    }
    this.start(config, sendButton, button);
  }

  updateCursorFromItem(state: any, item: any, itemIndex: number, nextIndex: number): void {
    state.itemValue = item.value || '';
    state.itemIndex = Number.isFinite(Number(item.index)) ? Number(item.index) : itemIndex;
    state.categoryId = item.categoryId || state.categoryId || '';
    state.category = item.category || state.category || state.config.label || state.commandKey;
    state.nextIndex = nextIndex;

    this.writeCursor(state.commandKey, {
      categoryId: state.categoryId,
      category: state.category,
      lastSelectedIndex: state.itemIndex,
      lastSelectedValue: state.itemValue,
      nextIndex,
    });
  }

  rememberSelectedItem(state: any, item: any, itemIndex: number, nextIndexAfterClick: number): void {
    state.itemValue = item.value || '';
    state.itemIndex = Number.isFinite(Number(item.index)) ? Number(item.index) : itemIndex;
    state.categoryId = item.categoryId || state.categoryId || '';
    state.category = item.category || state.category || state.config.label || state.commandKey;
    state.pendingNextIndex = nextIndexAfterClick;

    this.writeCursor(state.commandKey, {
      categoryId: state.categoryId,
      category: state.category,
      lastSelectedIndex: state.itemIndex,
      lastSelectedValue: state.itemValue,
      nextIndex: itemIndex,
    });
  }

  prepareAutoTask(state: any): boolean {
    const sendButton = this.getNativeSendButton(state.commandKey);
    if (!sendButton?.isConnected) {
      state.waitReason = 'waiting DOM';
      return false;
    }

    if (state.config.clickOnly) {
      state.waitReason = this.isNativeSendButtonReady(sendButton) ? 'ready' : 'native disabled';
      return this.isNativeSendButtonReady(sendButton);
    }

    this.ensureTaskCategoryVisible(state.config, state);
    state.items = this.getVisibleItems(state.config);
    if (state.items.length === 0) {
      this.options.notifySite('Auto-send category is empty', 'error');
      this.stop(state.commandKey, 'category empty');
      return false;
    }

    const itemIndex = Number(state.nextIndex || 0) % state.items.length;
    const item = state.items[itemIndex];
    const focusState = this.options.captureFocusState?.();
    const selected = this.selectItem(state.config, item, { focusState });
    this.options.restoreFocusState?.(focusState);
    if (!selected) {
      state.waitReason = 'waiting item';
      return false;
    }

    const nextIndex = (itemIndex + 1) % state.items.length;
    this.rememberSelectedItem(state, item, itemIndex, nextIndex);
    state.waitReason = this.isNativeSendButtonReady(sendButton) ? 'ready' : 'native disabled';
    return this.isNativeSendButtonReady(sendButton);
  }

  completeAutoClick(state: any, now = Date.now()): void {
    if (!state.config.clickOnly && Number.isFinite(Number(state.pendingNextIndex))) {
      this.updateCursorFromItem(state, {
        value: state.itemValue,
        index: state.itemIndex,
        categoryId: state.categoryId,
        category: state.category,
      }, state.itemIndex, Number(state.pendingNextIndex));
      state.pendingNextIndex = -1;
    }
    state.dueAt = now + this.getBufferedIntervalMs(state.taskIntervalSeconds);
    state.progressStartedAt = now;
    state.progressEndsAt = state.dueAt;
    state.waitReason = 'cooldown';
  }

  runAutoTask(state: any): boolean {
    if (!this.prepareAutoTask(state)) return false;

    const sendButton = this.getNativeSendButton(state.commandKey);
    if (!this.isNativeSendButtonReady(sendButton)) return false;

    sendButton.click();
    this.completeAutoClick(state, Date.now());
    this.options.log('info', 'Auto-send clicked native Send', {
      command: state.commandKey,
      receiverKey: state.receiverKey,
    });
    return true;
  }

  getRunnableTasks(now = Date.now()): any[] {
    return Array.from(this.states.values())
      .filter((state: any) => Number(state.dueAt || 0) <= now)
      .sort((a: any, b: any) => {
        const dueDiff = Number(a.dueAt || 0) - Number(b.dueAt || 0);
        if (dueDiff !== 0) return dueDiff;
        return Number(a.sequence || 0) - Number(b.sequence || 0);
      });
  }

  processDueQueue(): void {
    const now = Date.now();
    const task = this.getRunnableTasks(now).find((state: any) => now >= this.getReceiverNextAllowedAt(state.receiverKey));
    if (!task) {
      this.renderManager();
      return;
    }

    this.runAutoTask(task);
    this.renderManager();
  }

  startRunner(): void {
    if (this.runnerTimer) return;
    this.runnerTimer = window.setInterval(() => {
      this.processDueQueue();
    }, RUNNER_MS);
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
      const seconds = String(clampAutoSendInterval(state?.taskIntervalSeconds || this.getIntervalSeconds()));
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

  restoreCursorSelection(commandKey: string): void {
    const key = `${this.getPageKey()}::${commandKey}`;
    if (this.restoredCursorKeys.has(key)) return;

    const cursor = this.readCursor(commandKey);
    if (!cursor?.lastSelectedValue && !Number.isFinite(Number(cursor?.lastSelectedIndex))) return;

    const config = this.getCommandConfig(commandKey);
    if (!config || config.clickOnly) return;

    this.ensureTaskCategoryVisible(config, cursor);
    const items = this.getVisibleItems(config);
    if (items.length === 0) return;

    const selectedIndex = Number(cursor.lastSelectedIndex);
    const item = items.find((candidate: any) => (
      candidate.value === cursor.lastSelectedValue
      && (!cursor.categoryId || candidate.categoryId === cursor.categoryId)
    )) || (Number.isFinite(selectedIndex) && selectedIndex >= 0 ? items[selectedIndex % items.length] : null);
    if (!item) return;

    const focusState = this.options.captureFocusState?.();
    if (this.selectItem(config, item, { focusState })) {
      this.options.restoreFocusState?.(focusState);
      this.restoredCursorKeys.add(key);
    }
  }

  mountControls(): boolean {
    let changed = false;

    (AUTO_SEND_COMMAND_KEYS as readonly string[]).forEach((commandKey) => {
      const config = this.getCommandConfig(commandKey);
      if (!config) return;

      document.querySelectorAll(`[data-send="${commandKey}"]`).forEach((sendButton: any) => {
        const parent = this.getOrCreateControlHost(sendButton);
        if (!parent || parent.querySelector(`.ctrlem-db-auto-send-button[data-command="${commandKey}"]`)) {
          this.restoreCursorSelection(commandKey);
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
        this.setButtonState(button, this.states.has(commandKey));
        this.restoreCursorSelection(commandKey);
        changed = true;
      });
    });

    if (changed) this.options.log('info', 'Auto-send controls mounted');
    return changed;
  }

  refreshControlButtons(): void {
    document.querySelectorAll('.ctrlem-db-auto-send-button').forEach((button: any) => {
      this.setButtonState(button, this.states.has(button.dataset.command));
    });
  }

  getEffectiveSendAt(task: any, now = Date.now()): number {
    return Math.max(Number(task?.dueAt || 0), this.getReceiverNextAllowedAt(task.receiverKey), now);
  }

  getOrderedTasks(now = Date.now()): any[] {
    return Array.from(this.states.values()).sort((a: any, b: any) => {
      const aSendAt = this.getEffectiveSendAt(a, now);
      const bSendAt = this.getEffectiveSendAt(b, now);
      if (aSendAt !== bSendAt) return aSendAt - bSendAt;
      return Number(a.sequence || 0) - Number(b.sequence || 0);
    });
  }

  getCooldownPercent(task: any, now = Date.now()): number {
    const effectiveAt = this.getEffectiveSendAt(task, now);
    const progressEndsAt = Math.max(Number(task.progressEndsAt || 0), effectiveAt);
    if (progressEndsAt <= now) return 100;
    const progressStartedAt = Math.min(Math.max(0, Number(task.progressStartedAt || task.createdAt || now)), progressEndsAt);
    const duration = Math.max(1, progressEndsAt - progressStartedAt);
    return Math.max(0, Math.min(100, ((now - progressStartedAt) / duration) * 100));
  }

  getRemainingText(task: any, now = Date.now()): string {
    const dueAt = Number(task?.dueAt || 0);
    const taskRemaining = Math.max(0, dueAt - now);
    if (taskRemaining > 0) return `${Math.ceil(taskRemaining / 1000)}s`;

    const receiverRemaining = Math.max(0, this.getReceiverNextAllowedAt(task.receiverKey) - now);
    if (receiverRemaining > 0) return `rate:${Math.ceil(receiverRemaining / 1000)}s`;

    if (task.waitReason && task.waitReason !== 'ready' && task.waitReason !== 'cooldown') return task.waitReason;
    return 'ready';
  }

  startManagerTimer(): void {
    if (this.managerTimer) return;
    this.managerTimer = window.setInterval(() => {
      const rowsHost = document.querySelector(`#${MANAGER_ID} .ctrlem-db-autosend-rows`);
      if (!this.states.size || !rowsHost) {
        window.clearInterval(this.managerTimer);
        this.managerTimer = 0;
        return;
      }

      this.syncTaskRows(rowsHost, this.getOrderedTasks());
    }, USER_CONFIG.autoSend.managerRefreshMs);
  }

  setElementText(element: any, text: string): void {
    if (!element) return;
    if (element.textContent !== text) element.textContent = text;
    if (element.title !== undefined && element.title !== text) element.title = text;
  }

  updateTaskRow(row: any, task: any): void {
    row.classList.toggle('is-manual', false);
    row.classList.toggle('is-auto', true);
    this.setElementText(row.querySelector('.ctrlem-db-autosend-kind'), task.sendType || 'Auto');
    this.setElementText(row.querySelector('.ctrlem-db-autosend-profile'), task.profileTitle || 'Current profile');
    this.setElementText(row.querySelector('.ctrlem-db-autosend-code'), task.pageCode || 'Current page');
    this.setElementText(row.querySelector('.ctrlem-db-autosend-category'), task.category || task.commandKey || 'Send');

    const progress: any = row.querySelector('.ctrlem-db-autosend-progress');
    if (progress) progress.style.width = `${this.getCooldownPercent(task)}%`;

    const wait: any = row.querySelector('.ctrlem-db-autosend-wait');
    if (wait) {
      this.setElementText(wait, this.getRemainingText(task));
      wait.classList.remove('is-open-tab');
      wait.dataset.openTab = 'false';
    }
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

  createTaskRow(task: any): any {
    const stopButton = createElement('button', {
      className: 'ctrlem-db-autosend-mini-button ctrlem-db-autosend-stop',
      text: 'Stop',
      title: 'Stop this auto-send',
      type: 'button',
    });
    stopButton.addEventListener('click', () => this.stop(task.commandKey));

    const row = createElement('div', {
      className: 'ctrlem-db-autosend-row is-auto',
      dataset: { taskId: task.taskId },
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

    this.updateTaskRow(row, task);
    return row;
  }

  syncTaskRows(rowsHost: any, tasks: any[]): void {
    const rowsById = new Map(
      (Array.from(rowsHost.querySelectorAll('.ctrlem-db-autosend-row')) as any[])
        .map((row) => [row.dataset.taskId, row]),
    );

    tasks.forEach((task: any, index: number) => {
      let row = rowsById.get(task.taskId);
      if (row) {
        rowsById.delete(task.taskId);
        this.updateTaskRow(row, task);
      } else {
        row = this.createTaskRow(task);
      }

      const currentAtIndex = rowsHost.children[index];
      if (row !== currentAtIndex) rowsHost.insertBefore(row, currentAtIndex || null);
    });

    rowsById.forEach((row: any) => row.remove());
  }

  requestStopAllTasks(): void {
    this.stopAll('stopped all');
    this.renderManager();
  }

  renderManager(): boolean {
    const existing = document.getElementById(MANAGER_ID);
    this.refreshControlButtons();

    if (!this.states.size) {
      existing?.remove();
      this.syncToastOffset(null);
      if (this.managerTimer) {
        window.clearInterval(this.managerTimer);
        this.managerTimer = 0;
      }
      return Boolean(existing);
    }

    const orderedTasks = this.getOrderedTasks();

    if (existing) {
      existing.classList.toggle('is-collapsed', this.managerCollapsed);
      const toggleButton: any = existing.querySelector('.ctrlem-db-autosend-toggle');
      if (toggleButton) {
        toggleButton.textContent = this.managerCollapsed ? 'Show' : 'Hide';
        toggleButton.title = this.managerCollapsed ? 'Expand queue' : 'Collapse queue';
        toggleButton.setAttribute('aria-expanded', String(!this.managerCollapsed));
      }
      const rowsHost = existing.querySelector('.ctrlem-db-autosend-rows') || existing;
      this.syncTaskRows(rowsHost, orderedTasks);
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
      title: 'Stop all auto-sends',
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
        orderedTasks.map((task: any) => this.createTaskRow(task))),
    ]);
    panel.classList.toggle('is-collapsed', this.managerCollapsed);

    document.body.appendChild(panel);
    this.syncToastOffset(panel);
    this.startManagerTimer();
    return true;
  }
}
