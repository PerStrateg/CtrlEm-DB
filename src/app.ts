import {
  AUTOSAVE_DELAY,
  CONFIG,
  MEDIA_COMMANDS,
  NO_PREVIEWS_MARKER,
  RecordType,
  TEXT_COMMANDS,
  TYPE_ORDER,
  UI_IDS,
  UPLOAD_COMMANDS,
  IMAGE_PREVIEW_MAX_ITEMS,
  USER_CONFIG,
} from './domain/constants';
import {
  clampAutoSendInterval,
  clampMinimumRequestInterval,
  clonePlain,
  createId,
  formatCategoryContent,
  getCategoryDataLines,
  getSafeFileName,
  isNoPreviewsMarker,
  normalizeType,
  parseLines,
} from './domain/content';
import {
  appendInputValue,
  createEmptyCategory,
  createExportPayload,
  createSeedState,
  getCategories,
  getDatabaseSummary,
  getRecordKey,
  getSelectedCategory,
  getStaticMediaCategories,
  getUserCategories,
  hasStoredValue,
  makeUniqueCategoryName,
  normalizeAllCategoryContent,
  normalizeDbState,
  parseImportFile,
  resetManagerSelections,
} from './domain/state';
import { createUiState, getPickerUiState, getUploadUiState, normalizeUiState } from './domain/uiState';
import { AutoSendController } from './features/autoSend';
import { isCaptureValueValid, mountInputCapture } from './features/inputCapture';
import { log } from './logger';
import { CtrlEmSite } from './services/ctrlEmSite';
import { uploadFileToCatbox, uploadImageToImgBB, uploadVideoToVidHosting } from './services/contentUpload';
import { ImageCache } from './services/imageCache';
import { findBrokenMediaLinks } from './services/linkChecker';
import {
  readStoredState,
  readStoredUiState,
  readStoredUploaderSettings,
  writeStoredState,
  writeStoredUiState,
  writeStoredUploaderSettings,
} from './storage';
import { renderDbManager as renderManagerView, renderCategoryList as renderManagerCategoryList, setManagerStatus } from './ui/dbManager';
import { createElement, downloadTextFile } from './ui/dom';
import { createMediaPicker, getMediaPickerId, updateMediaPicker } from './ui/mediaPicker';
import { addStyles } from './ui/styles';
import { createTextPicker, getTextPickerId } from './ui/textPicker';
import { createUploadPanel, getUploadPanelId } from './ui/uploadPanel';

const LINK_CHECK_MEDIA_TYPES = [RecordType.IMAGE, RecordType.SOUND, RecordType.VIDEO];

function createDbManagerBrandLink(): any {
  const tooltipText = 'Test on me, and I will always be glad to have your attention. Thank you for using it. Have a great mood!';
  const link = createElement('a', {
    className: 'ctrlem-db-brand-link',
    attrs: {
      href: 'https://ctrlem.com/u/KPD0M',
      target: '_blank',
      rel: 'noopener noreferrer',
      'data-tooltip': tooltipText,
    },
  }, [
    createElement('span', { className: 'ctrlem-db-brand-strateg', text: 'Strateg' }),
    createElement('span', { text: ' ' }),
    createElement('span', { className: 'ctrlem-db-brand-tag', text: '' }),
  ]);
  let tooltip: any = null;
  const hideTooltip = () => {
    tooltip?.remove();
    tooltip = null;
  };
  const showTooltip = () => {
    hideTooltip();
    tooltip = createElement('div', {
      className: 'ctrlem-db-brand-tooltip',
      text: tooltipText,
    });
    document.body.appendChild(tooltip);
    const linkRect = link.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const top = Math.max(8, linkRect.top - tooltipRect.height - 8);
    const left = Math.min(
      window.innerWidth - tooltipRect.width - 8,
      Math.max(8, linkRect.left + (linkRect.width / 2) - (tooltipRect.width / 2)),
    );
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  };

  link.addEventListener('mouseenter', showTooltip);
  link.addEventListener('mouseleave', hideTooltip);
  link.addEventListener('focus', showTooltip);
  link.addEventListener('blur', hideTooltip);
  link.addEventListener('click', hideTooltip);

  return createElement('span', { className: 'ctrlem-db-brand' }, [
    createElement('span', { text: 'DB Userscript by ' }),
    link,
  ]);
}

export class CtrlEmDbApp {
  private dbState: any = createSeedState();
  private uiState: any = createUiState();
  private saveTimer = 0;
  private uiSaveTimer = 0;
  private uploaderSettingsSaveTimer = 0;
  private mediaRenderToken = 0;
  private sendOrDeleteDownloadArms: any[] = [];
  private pendingMediaMounts = new Set<string>();
  private readonly linkCheckState: any = {
    categoryId: '',
    scopeAll: true,
    scopeType: RecordType.IMAGE,
    scopeCategoryId: '',
    isBusy: false,
    checked: 0,
    total: 0,
    brokenCount: 0,
    currentType: '',
    currentCategoryName: '',
    currentUrl: '',
    broken: [],
    statusMessage: '',
    statusLevel: 'info',
  };
  private readonly uploaderSettings: any = {
    imgbbApiKey: '',
    catboxUserhash: '',
    hideCtrlEmUploader: false,
    autoDownloadSendOrDeleteImages: true,
  };
  private managerSelection: any = {
    isOpen: false,
    selectedCategoryByType: {},
    originalTitle: '',
    originalDescription: '',
    editorCommandKey: '',
  };
  private readonly site = new CtrlEmSite(log);
  private readonly imageCache = new ImageCache(log);
  private readonly autoSend = new AutoSendController({
    getState: () => this.dbState,
    selectTextItem: (input: any, list: any, button: any, options?: any) => this.selectTextItem(input, list, button, options),
    selectMediaItem: (input: any, picker: any, button: any, options?: any) => this.selectMediaItem(input, picker, button, options),
    getPickerUiState: (commandKey: string) => this.getCommandPickerUiState(commandKey),
    captureFocusState: () => this.captureFocusState(),
    restoreFocusState: (state: any) => this.restoreFocusState(state),
    setAutoSendInterval: (seconds: number) => this.setAutoSendInterval(seconds, { status: false }),
    setMinimumRequestInterval: (seconds: number) => this.setMinimumRequestInterval(seconds, { status: false }),
    notifySite: (message: string, level = 'info') => this.site.notify(message, level),
    log,
  });

  private readonly managerActions = {
    save: () => this.saveDbState('manual save'),
    setAutoSave: (enabled: boolean) => this.setAutoSave(enabled),
    setAutoSendInterval: (seconds: number) => this.setAutoSendInterval(seconds),
    setMinimumRequestInterval: (seconds: number) => this.setMinimumRequestInterval(seconds),
    updateEditorContent: (content: string) => this.updateEditorContent(content),
    importCategories: (files: File[]) => this.importCategoriesFromFiles(files),
    importAllCategories: (file?: File) => this.importAllCategoriesFromFile(file),
    renameCategory: () => this.renameSelectedCategory(),
    deleteCategory: () => this.deleteSelectedCategory(),
    exportCategory: () => this.exportSelectedCategory(),
    exportAll: () => this.exportAllCategories(),
    restoreDefaults: () => this.restoreDefaultCategories(),
    addCategory: () => this.addCategory(),
    selectCategory: (categoryId: string) => this.selectManagerCategory(categoryId),
    reorderCategory: (sourceId: string, targetId: string) => this.reorderCategory(sourceId, targetId),
    renameCategoryTo: (name: string) => this.renameSelectedCategoryTo(name),
    setActiveType: (type: string) => this.setActiveType(type),
    setActiveTab: (tab: string) => this.setActiveTab(tab),
    setCategoryListScroll: (scrollTop: number) => this.setCategoryListScroll(scrollTop),
    setUploaderSetting: (name: string, value: string) => this.setUploaderSetting(name, value),
    getUploaderSettings: () => this.uploaderSettings,
    getUploadTarget: (config: any) => this.getUploadTarget(config),
    getUploadCategories: (config: any) => this.getUploadCategories(config),
    uploadContentFile: (request: any) => this.uploadContentFile(request),
    uploadCommandFile: (request: any) => this.uploadCommandFile(request),
    appendUploadedUrl: (request: any) => this.appendUploadedUrl(request),
    openImgBBKeyPrompt: () => this.openImgBBKeyPrompt(),
    setLinkCheckScope: (patch: any) => this.setLinkCheckScope(patch),
    checkBrokenLinks: () => this.checkBrokenLinks(),
    removeBrokenLinks: () => this.removeBrokenLinks(),
  };

  async start(): Promise<void> {
    await this.loadDbState();
    log('info', 'Script started', {
      href: window.location.href,
      summary: getDatabaseSummary(this.dbState),
    });

    addStyles();
    this.mountUi('initial');
    this.startObserver();
  }

  async loadDbState(): Promise<void> {
    const [stored, storedUi, storedUploaderSettings] = await Promise.all([
      readStoredState(),
      readStoredUiState(),
      readStoredUploaderSettings(),
    ]);
    this.dbState = normalizeDbState(stored || createSeedState());
    this.uiState = normalizeUiState(storedUi || createUiState());
    this.restoreUploaderSettings(storedUploaderSettings);
    resetManagerSelections(this.dbState, this.managerSelection);
    this.restoreManagerSelectionsFromUiState();
    log('info', 'DB state loaded', getDatabaseSummary(this.dbState));
  }

  restoreUploaderSettings(settings: any): void {
    const source = settings && typeof settings === 'object' ? settings : {};
    Object.assign(this.uploaderSettings, {
      imgbbApiKey: String(source.imgbbApiKey || ''),
      catboxUserhash: String(source.catboxUserhash || ''),
      hideCtrlEmUploader: source.hideCtrlEmUploader === true,
      autoDownloadSendOrDeleteImages: source.autoDownloadSendOrDeleteImages !== false,
    });
  }

  getSelectedCategory(type: string): any {
    return getSelectedCategory(this.dbState, this.managerSelection, type);
  }

  restoreManagerSelectionsFromUiState(): void {
    (TYPE_ORDER as readonly string[]).forEach((type) => {
      const storedId = this.uiState.manager.selectedCategoryByType[type];
      if (storedId) this.managerSelection.selectedCategoryByType[type] = storedId;
      const selected = this.getSelectedCategory(type);
      this.uiState.manager.selectedCategoryByType[type] = selected?.id || '';
    });
  }

  scheduleUiStateSave(reason = 'ui changed'): void {
    window.clearTimeout(this.uiSaveTimer);
    this.uiSaveTimer = window.setTimeout(() => {
      writeStoredUiState(clonePlain(this.uiState)).catch((error: any) => {
        log('warn', 'Failed to save UI state', { reason, message: error?.message || String(error) });
      });
    }, USER_CONFIG.ui.saveDelayMs);
  }

  scheduleUploaderSettingsSave(reason = 'uploader settings changed'): void {
    window.clearTimeout(this.uploaderSettingsSaveTimer);
    this.uploaderSettingsSaveTimer = window.setTimeout(() => {
      writeStoredUploaderSettings(clonePlain(this.uploaderSettings)).catch((error: any) => {
        log('warn', 'Failed to save uploader settings', { reason, message: error?.message || String(error) });
      });
    }, USER_CONFIG.ui.saveDelayMs);
  }

  setManagerSelectedCategory(type: string, categoryId: string): void {
    this.managerSelection.selectedCategoryByType[type] = categoryId;
    this.uiState.manager.selectedCategoryByType[type] = categoryId;
    this.scheduleUiStateSave('manager category selected');
  }

  getCommandPickerUiState(commandKey: string): any {
    return getPickerUiState(this.uiState, commandKey);
  }

  updateCommandPickerUiState(commandKey: string, patch: any): void {
    if (!commandKey) return;
    Object.assign(this.getCommandPickerUiState(commandKey), patch);
    this.scheduleUiStateSave('picker state changed');
  }

  getCommandUploadUiState(commandKey: string): any {
    return getUploadUiState(this.uiState, commandKey);
  }

  updateCommandUploadUiState(commandKey: string, patch: any): void {
    if (!commandKey) return;
    Object.assign(this.getCommandUploadUiState(commandKey), patch);
    this.scheduleUiStateSave('upload panel state changed');
  }

  captureFocusState(): any {
    const element: any = document.activeElement;
    if (!element || element === document.body || element === document.documentElement) return null;

    return {
      element,
      selectionStart: typeof element.selectionStart === 'number' ? element.selectionStart : null,
      selectionEnd: typeof element.selectionEnd === 'number' ? element.selectionEnd : null,
      selectionDirection: typeof element.selectionDirection === 'string' ? element.selectionDirection : undefined,
    };
  }

  restoreFocusState(state: any): void {
    const element: any = state?.element;
    if (!element?.isConnected) return;

    try {
      if (document.activeElement !== element) element.focus({ preventScroll: true });
      if (state.selectionStart !== null && typeof element.setSelectionRange === 'function') {
        element.setSelectionRange(state.selectionStart, state.selectionEnd, state.selectionDirection);
      }
    } catch {
      // Some input types do not support selection ranges.
    }
  }

  getProfileTitle(): string {
    const heading: any = document.querySelector('.profile-details h1');
    if (!heading) return '';

    const clone = heading.cloneNode(true);
    clone.querySelectorAll('.verified-badge, [title="Verified"]').forEach((element: any) => element.remove());
    return String(clone.textContent || '').replace(/\s+/g, ' ').trim();
  }

  getManagerViewModel(): any {
    const selectedCategory = this.getSelectedCategory(this.dbState.activeType);
    this.normalizeLinkCheckScope();

    return {
      activeType: this.dbState.activeType,
      autoSave: this.dbState.autoSave,
      autoSendIntervalSeconds: this.dbState.autoSendIntervalSeconds,
      minimumRequestIntervalSeconds: this.dbState.minimumRequestIntervalSeconds,
      categories: getUserCategories(this.dbState, this.dbState.activeType),
      selectedCategory,
      profileTitle: this.getProfileTitle(),
      uploaderSettings: this.uploaderSettings,
      uiState: this.uiState.manager,
      linkCheck: this.linkCheckState,
      linkCheckCategories: LINK_CHECK_MEDIA_TYPES.reduce((result: any, type) => {
        result[type] = getUserCategories(this.dbState, type).map((category: any) => ({
          id: category.id,
          name: category.name,
        }));
        return result;
      }, {}),
    };
  }

  flushEditorToState(): void {
    const textarea: any = document.getElementById(UI_IDS.dbManagerTextarea);
    if (!textarea || !this.managerSelection.isOpen) return;

    const category = this.getSelectedCategory(this.dbState.activeType);
    if (category) category.content = textarea.value;
  }

  syncEditorTextarea(): void {
    if (!this.managerSelection.isOpen) return;
    const textarea: any = document.getElementById(UI_IDS.dbManagerTextarea);
    const category = this.getSelectedCategory(this.dbState.activeType);
    if (textarea && category && textarea.value !== category.content) {
      textarea.value = category.content;
    }
  }

  async saveDbState(reason = 'manual', options: any = {}): Promise<boolean> {
    const {
      flushEditor = true,
      refreshConsumers = true,
      syncTextarea = true,
    } = options;

    try {
      if (flushEditor) this.flushEditorToState();
      this.dbState.autoSendIntervalSeconds = clampAutoSendInterval(this.dbState.autoSendIntervalSeconds);
      this.dbState.minimumRequestIntervalSeconds = clampMinimumRequestInterval(this.dbState.minimumRequestIntervalSeconds);
      normalizeAllCategoryContent(this.dbState);
      if (syncTextarea) this.syncEditorTextarea();
      await writeStoredState(clonePlain(this.dbState));
      log('info', 'DB state saved', { reason, summary: getDatabaseSummary(this.dbState) });
      setManagerStatus(`Saved: ${reason}`, 'success');
      this.renderCategoryList();
      if (refreshConsumers) this.refreshDbConsumers(reason);
      return true;
    } catch (error: any) {
      log('error', 'Failed to save DB state', { reason, message: error?.message || String(error) });
      setManagerStatus('Save failed. Check console logs.', 'error');
      return false;
    }
  }

  scheduleDataCommit(reason: string): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(async () => {
      this.flushEditorToState();
      if (this.dbState?.autoSave) {
        await this.saveDbState(reason, { syncTextarea: false });
        return;
      }
      this.renderCategoryList();
      this.refreshDbConsumers(reason);
    }, AUTOSAVE_DELAY);
  }

  refreshDbConsumers(reason = 'refresh'): void {
    this.mediaRenderToken += 1;
    Object.values(TEXT_COMMANDS).forEach((config: any) => {
      document.getElementById(getTextPickerId(config.key))?.remove();
    });
    this.mountTextPickers();

    Object.values(MEDIA_COMMANDS).forEach((config: any) => {
      this.refreshMediaPicker(config);
    });
    this.mountUploadPanels();

    log('debug', 'DB consumers refreshed', { reason });
  }

  async captureInputValue(config: any): Promise<boolean> {
    const input: any = document.querySelector(config.inputSelector);
    const value = String(input?.value || '').trim();
    if (!input || !isCaptureValueValid(config, value)) return false;

    if (
      input.dataset.ctrlemDbSelectedSource === 'default'
      && input.dataset.ctrlemDbSelectedValue === value
    ) {
      return false;
    }

    if (hasStoredValue(this.dbState, config.type, value)) return false;

    const category = appendInputValue(this.dbState, this.managerSelection, config.type, value);
    this.uiState.manager.selectedCategoryByType[config.type] = this.managerSelection.selectedCategoryByType[config.type] || category.id;
    this.scheduleUiStateSave('input category captured');
    if (
      this.managerSelection.isOpen
      && this.dbState.activeType === config.type
      && this.managerSelection.selectedCategoryByType[config.type] === category.id
    ) {
      const textarea: any = document.getElementById(UI_IDS.dbManagerTextarea);
      if (textarea) textarea.value = category.content;
    }
    await this.saveDbState(`input captured: ${config.key}`);
    log('info', 'Input captured', { command: config.key, type: config.type });
    return true;
  }

  mountDatabaseButton(): boolean {
    const existing = document.getElementById(UI_IDS.dbButton);
    if (existing) return false;

    const head: any = document.querySelector(CONFIG.selectors.commandsHead);
    if (!head) {
      log('debug', 'Commands panel header was not found yet');
      return false;
    }

    let textBlock = head.querySelector(':scope > .ctrlem-db-head-copy');
    if (!textBlock) {
      const title = head.querySelector(':scope > h2');
      const description = head.querySelector(':scope > p');
      textBlock = createElement('div', { className: 'ctrlem-db-head-copy' });

      if (title) textBlock.appendChild(title);
      if (description) textBlock.appendChild(description);
      head.prepend(textBlock);
    }

    const button = createElement('button', {
      id: UI_IDS.dbButton,
      className: 'ctrlem-db-button',
      text: 'DB',
      title: 'Open DB manager',
      type: 'button',
      attrs: {
        'aria-label': 'Open DB manager',
        'aria-pressed': 'false',
      },
    });

    button.addEventListener('click', () => this.toggleDbManager());

    head.classList.add('ctrlem-db-head');
    head.appendChild(button);

    log('info', 'DB button mounted', { selector: CONFIG.selectors.commandsHead });
    return true;
  }

  setDbButtonActive(isActive: boolean): void {
    const button = document.getElementById(UI_IDS.dbButton);
    if (!button) return;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  }

  markInputSelection(input: any, options: any): void {
    input.dataset.ctrlemDbSelectedValue = options.value || '';
    input.dataset.ctrlemDbSelectedType = options.type || '';
    input.dataset.ctrlemDbSelectedSource = options.source || 'saved';
  }

  selectTextItem(input: any, list: any, button: any, options: any = {}): void {
    const value = button.dataset.value || '';
    const rows: any = list.querySelector('.ctrlem-db-rows');
    this.markInputSelection(input, {
      value,
      type: button.dataset.type,
      source: 'saved',
    });
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (options.focus !== false) {
      this.focusWithoutScroll(input);
    } else {
      this.restoreFocusState(options.focusState);
    }

    list.querySelectorAll('.ctrlem-db-row.is-selected').forEach((row: any) => {
      row.classList.remove('is-selected');
    });
    button.classList.add('is-selected');
    if (options.persistUiState !== false) {
      this.updateCommandPickerUiState(button.dataset.command || '', {
        categoryId: button.dataset.categoryId || list.dataset.categoryId || '',
        categoryName: button.dataset.category || list.dataset.category || '',
        value,
        itemIndex: Number(button.dataset.index || -1),
        scrollTop: rows?.scrollTop || 0,
      });
    }

    log('info', 'Text item selected', {
      command: button.dataset.command,
      type: button.dataset.type,
      category: button.dataset.category,
      length: value.length,
    });
  }

  getCommandPickerElement(commandKey: string): any {
    return document.getElementById(getMediaPickerId(commandKey))
      || document.getElementById(getTextPickerId(commandKey));
  }

  focusWithoutScroll(element: any): void {
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
  }

  ensurePasteUrlSeparator(panel: any, input: any): any {
    let separator = panel.querySelector('.upload-separator');
    if (!separator) {
      separator = createElement('div', { className: 'upload-separator' });
    }

    separator.replaceChildren(createElement('span', { text: 'or paste a URL' }));
    if (separator.nextElementSibling !== input) {
      input.insertAdjacentElement('beforebegin', separator);
    }
    return separator;
  }

  insertTextPicker(panel: any, config: any, input: any, picker: any): void {
    if ((UPLOAD_COMMANDS as any)[config.key]) {
      const separator = this.ensurePasteUrlSeparator(panel, input);
      const uploadPanel = document.getElementById(getUploadPanelId(config.key));
      if (uploadPanel && panel.contains(uploadPanel)) {
        uploadPanel.insertAdjacentElement('beforebegin', picker);
        return;
      }

      separator.insertAdjacentElement('beforebegin', picker);
      return;
    }

    input.insertAdjacentElement('afterend', picker);
  }

  mountTextPicker(config: any): boolean {
    const pickerId = getTextPickerId(config.key);
    if (document.getElementById(pickerId)) return false;

    const panel: any = document.querySelector(config.panelSelector);
    const input: any = document.querySelector(config.inputSelector);

    if (!panel || !input || !panel.contains(input)) {
      log('debug', 'Text command input was not found yet', {
        command: config.key,
        panel: Boolean(panel),
        input: Boolean(input),
      });
      return false;
    }

    const picker = createTextPicker({
      config,
      input,
      categories: getCategories(this.dbState, config.type),
      uiState: this.getCommandPickerUiState(config.key),
      onSelect: ({ input: sourceInput, list, button }: any) => this.selectTextItem(sourceInput, list, button),
      onPreview: ({ button }: any) => this.openMediaPreview(button),
      onCategoryChange: (details: any) => log('info', 'Text category changed', details),
      onUiStateChange: (patch: any) => this.updateCommandPickerUiState(config.key, patch),
      onAddCategory: () => this.addCategory(config.type, config.key),
      onRenameCategory: (categoryId: string) => this.openCategoryEditor(config.type, categoryId, config.key),
    });
    this.insertTextPicker(panel, config, input, picker);

    log('info', 'Text picker mounted', {
      command: config.key,
      type: config.type,
      selector: config.inputSelector,
      summary: getDatabaseSummary(this.dbState)[config.type],
    });
    return true;
  }

  mountTextPickers(): boolean {
    return Object.values(TEXT_COMMANDS)
      .map((config: any) => this.mountTextPicker(config))
      .some(Boolean);
  }

  selectMediaItem(input: any, picker: any, button: any, options: any = {}): void {
    const url = button.dataset.url || '';
    const grid: any = picker.querySelector('.ctrlem-db-media-grid');
    this.markInputSelection(input, {
      value: url,
      type: button.dataset.type,
      source: button.dataset.source || 'saved',
    });
    input.value = url;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (options.focus !== false) {
      this.focusWithoutScroll(input);
    } else {
      this.restoreFocusState(options.focusState);
    }

    picker.querySelectorAll('.ctrlem-db-media-tile.is-selected').forEach((tile: any) => {
      tile.classList.remove('is-selected');
    });
    button.classList.add('is-selected');
    if (options.persistUiState !== false) {
      this.updateCommandPickerUiState(button.dataset.command || '', {
        categoryId: button.dataset.categoryId || picker.dataset.categoryId || '',
        categoryName: button.dataset.category || picker.dataset.category || '',
        value: url,
        itemIndex: Number(button.dataset.index || -1),
        scrollTop: grid?.scrollTop || 0,
      });
    }

    log('info', 'Media selected', {
      command: button.dataset.command,
      type: button.dataset.type,
      category: button.dataset.category,
      url,
    });
  }

  async getMediaCategories(config: any): Promise<any[]> {
    const categories = getStaticMediaCategories(this.dbState, config.type);

    if (config.type !== RecordType.IMAGE) return categories;

    const defaultItems = await this.site.getDefaultImageItems(config.key);
    if (defaultItems.length === 0) return categories;

    return [
      ...categories,
      { id: 'default', name: 'Default', items: defaultItems, isDefault: true },
    ];
  }

  insertMediaPicker(panel: any, input: any, picker: any): void {
    const separator = this.ensurePasteUrlSeparator(panel, input);
    const uploadPanel = document.getElementById(getUploadPanelId(picker.dataset.command || ''));
    if (uploadPanel && panel.contains(uploadPanel)) {
      uploadPanel.insertAdjacentElement('beforebegin', picker);
      return;
    }

    separator.insertAdjacentElement('beforebegin', picker);
  }

  async refreshMediaPicker(config: any): Promise<boolean> {
    const pickerId = getMediaPickerId(config.key);
    const picker: any = document.getElementById(pickerId);
    const panel: any = document.querySelector(config.panelSelector);
    const input: any = document.querySelector(config.inputSelector);
    const canMount = panel && input && panel.contains(input);
    if (panel) this.site.hideMediaUi(config, panel);

    if (!picker) {
      if (canMount && !this.pendingMediaMounts.has(config.key)) this.mountMediaPicker(config);
      return Boolean(canMount);
    }

    if (!canMount || !panel.contains(picker) || picker.ctrlemDbInput !== input) {
      picker.remove();
      if (canMount && !this.pendingMediaMounts.has(config.key)) this.mountMediaPicker(config);
      return true;
    }

    const renderToken = this.mediaRenderToken;
    const categories = await this.getMediaCategories(config);
    if (renderToken !== this.mediaRenderToken || !picker.isConnected) return false;

    const refreshed = updateMediaPicker(picker, {
      categories,
      input,
      uiState: this.getCommandPickerUiState(config.key),
    });
    if (refreshed) return true;

    picker.remove();
    if (!this.pendingMediaMounts.has(config.key)) this.mountMediaPicker(config);
    return true;
  }

  async mountMediaPicker(config: any): Promise<boolean> {
    const pickerId = getMediaPickerId(config.key);
    if (document.getElementById(pickerId) || this.pendingMediaMounts.has(config.key)) return false;
    const renderToken = this.mediaRenderToken;

    const panel: any = document.querySelector(config.panelSelector);
    const input: any = document.querySelector(config.inputSelector);

    if (!panel || !input || !panel.contains(input)) {
      log('debug', 'Media command input was not found yet', {
        command: config.key,
        panel: Boolean(panel),
        input: Boolean(input),
      });
      return false;
    }

    this.pendingMediaMounts.add(config.key);

    try {
      const categories = await this.getMediaCategories(config);
      if (renderToken !== this.mediaRenderToken) return false;
      if (!panel.isConnected || !input.isConnected || document.getElementById(pickerId)) return false;

      const picker = createMediaPicker({
        config,
        categories,
        input,
        uiState: this.getCommandPickerUiState(config.key),
        onSelect: ({ input: sourceInput, picker: sourcePicker, button }: any) => this.selectMediaItem(sourceInput, sourcePicker, button),
        onDelete: ({ item, tile }: any) => this.site.deleteDefaultImageItem(item, tile, () => this.refreshDbConsumers('default image deleted')),
        onCategoryChange: (details: any) => log('info', 'Media category changed', details),
        onUiStateChange: (patch: any) => this.updateCommandPickerUiState(config.key, patch),
        onAddCategory: () => this.addCategory(config.type, config.key),
        onRenameCategory: (categoryId: string) => this.openCategoryEditor(config.type, categoryId, config.key),
        onPreviewToggle: (categoryId: string, enabled: boolean) => this.setImagePreviewsEnabled(categoryId, enabled),
        setImagePreviewSource: (image: any, sourceUrl: string, cacheKey: string) => this.imageCache.setImagePreviewSource(image, sourceUrl, cacheKey),
      });
      picker.ctrlemDbInput = input;
      this.insertMediaPicker(panel, input, picker);

      log('info', 'Media picker mounted', {
        command: config.key,
        type: config.type,
        categories: categories.length,
        items: categories.reduce((count, category) => count + category.items.length, 0),
      });
      return true;
    } catch (error: any) {
      log('error', 'Failed to mount media picker', {
        command: config.key,
        message: error?.message || String(error),
      });
      return false;
    } finally {
      this.pendingMediaMounts.delete(config.key);
      if (renderToken !== this.mediaRenderToken && !document.getElementById(pickerId)) {
        window.setTimeout(() => this.mountMediaPicker(config), 0);
      }
    }
  }

  mountMediaPickers(): boolean {
    let changed = false;

    Object.values(MEDIA_COMMANDS).forEach((config: any) => {
      const panel: any = document.querySelector(config.panelSelector);
      if (panel) changed = this.site.hideMediaUi(config, panel) || changed;

      const input: any = document.querySelector(config.inputSelector);
      const canMount = panel && input && panel.contains(input);
      const isMissing = !document.getElementById(getMediaPickerId(config.key));
      const isPending = this.pendingMediaMounts.has(config.key);

      if (canMount && isMissing && !isPending) {
        changed = true;
        this.mountMediaPicker(config);
      }
    });

    return changed;
  }

  insertUploadPanel(panel: any, config: any, uploadPanel: any, input: any): void {
    const picker = this.getCommandPickerElement(config.key);
    if (picker && panel.contains(picker)) {
      picker.insertAdjacentElement('afterend', uploadPanel);
      return;
    }

    const separator = this.ensurePasteUrlSeparator(panel, input);
    separator.insertAdjacentElement('beforebegin', uploadPanel);
  }

  mountUploadPanel(config: any): boolean {
    if (document.getElementById(getUploadPanelId(config.key))) return false;

    const panel: any = document.querySelector(config.panelSelector);
    const input: any = document.querySelector(config.inputSelector);
    if (!panel || !input || !panel.contains(input)) return false;

    const nativeDropzone = config.nativeDropzoneSelector
      ? panel.querySelector(config.nativeDropzoneSelector)
      : null;
    const uploadPanel = createUploadPanel({
      config,
      input,
      nativeDropzone,
      uiState: this.getCommandUploadUiState(config.key),
      onUiStateChange: (patch: any) => this.updateCommandUploadUiState(config.key, patch),
      actions: this.managerActions,
    });
    this.insertUploadPanel(panel, config, uploadPanel, input);

    log('info', 'Upload panel mounted', {
      command: config.key,
      tools: config.tools,
      native: Boolean(nativeDropzone),
    });
    return true;
  }

  mountUploadPanels(): boolean {
    return Object.values(UPLOAD_COMMANDS)
      .map((config: any) => this.mountUploadPanel(config))
      .some(Boolean);
  }

  getSendOrDeleteDownloadFilename(src: string): string {
    const timestamp = new Date().toISOString()
      .slice(0, 19)
      .replace('T', '-')
      .replace(/:/g, '-');
    let extension = 'png';

    try {
      const url = new URL(src, window.location.href);
      const match = url.pathname.match(/\.([a-z0-9]{2,5})$/i);
      if (match) extension = match[1].toLowerCase();
    } catch {
      const match = src.split('?')[0].match(/\.([a-z0-9]{2,5})$/i);
      if (match) extension = match[1].toLowerCase();
    }

    return `sendOrDelete-${timestamp}.${extension}`;
  }

  downloadSendOrDeleteImage(src: string): void {
    const url = new URL(src, window.location.href).href;
    const name = this.getSendOrDeleteDownloadFilename(url);
    const gmDownload = (globalThis as any).GM_download;

    if (typeof gmDownload === 'function') {
      gmDownload({ url, name, saveAs: false });
      return;
    }

    const link = createElement('a', {
      attrs: {
        href: url,
        download: name,
      },
    });
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  getSendOrDeleteResponseSignature(item: any): string {
    const image: any = item.querySelector('.response-image[src]');
    if (image?.src) return `image:${new URL(image.src, window.location.href).href}`;

    const body = String(item.querySelector('.response-body')?.textContent || item.textContent || '').trim();
    return `text:${body}`;
  }

  getCurrentSendOrDeleteResponseCounts(): Map<string, number> {
    const container: any = document.querySelector(CONFIG.selectors.resultsContainer);
    const counts = new Map<string, number>();
    if (!container) return counts;

    container.querySelectorAll('.response-item').forEach((item: any) => {
      const badge = String(item.querySelector('.response-badge')?.textContent || '').trim().toLowerCase();
      if (badge !== 'sendordelete') return;

      const signature = this.getSendOrDeleteResponseSignature(item);
      counts.set(signature, (counts.get(signature) || 0) + 1);
    });

    return counts;
  }

  armSendOrDeleteDownload(): void {
    if (this.uploaderSettings.autoDownloadSendOrDeleteImages === false) return;

    this.sendOrDeleteDownloadArms.push({
      baseline: this.getCurrentSendOrDeleteResponseCounts(),
      armedAt: Date.now(),
    });
    log('debug', 'Send or Delete image download armed', { pending: this.sendOrDeleteDownloadArms.length });
  }

  mountSendOrDeleteDownloadTrigger(): boolean {
    if (document.documentElement.dataset.ctrlemDbSendOrDeleteDownloadTrigger === 'true') return false;
    document.documentElement.dataset.ctrlemDbSendOrDeleteDownloadTrigger = 'true';

    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;

      const button: any = event.target.closest('[data-send="sendOrDelete"]');
      if (!button || button.disabled) return;

      this.armSendOrDeleteDownload();
    }, true);

    return true;
  }

  scanSendOrDeleteResponses(): boolean {
    const container: any = document.querySelector(CONFIG.selectors.resultsContainer);
    if (!container || this.sendOrDeleteDownloadArms.length === 0) return false;

    let downloaded = false;
    const shouldDownload = this.uploaderSettings.autoDownloadSendOrDeleteImages !== false;
    const seen = new Map<string, number>();
    container.querySelectorAll('.response-item').forEach((item: any) => {
      if (this.sendOrDeleteDownloadArms.length === 0) return;

      const badge = String(item.querySelector('.response-badge')?.textContent || '').trim().toLowerCase();
      if (badge !== 'sendordelete') return;

      const signature = this.getSendOrDeleteResponseSignature(item);
      const seenCount = (seen.get(signature) || 0) + 1;
      seen.set(signature, seenCount);
      if (item.dataset.ctrlemDbSendOrDeleteDownloaded === 'true') return;

      const armIndex = this.sendOrDeleteDownloadArms.findIndex((arm) => (
        seenCount > (arm.baseline.get(signature) || 0)
      ));
      if (armIndex < 0) return;

      item.dataset.ctrlemDbSendOrDeleteDownloaded = 'true';
      this.sendOrDeleteDownloadArms.splice(armIndex, 1);
      this.sendOrDeleteDownloadArms.forEach((arm) => {
        arm.baseline.set(signature, (arm.baseline.get(signature) || 0) + 1);
      });

      const image: any = item.querySelector('.response-image[src]');
      if (!shouldDownload || !image?.src) return;

      this.downloadSendOrDeleteImage(image.src);
      downloaded = true;
      log('info', 'Send or Delete image download started', { src: image.src });
    });

    return downloaded;
  }

  toggleDbManager(): void {
    if (this.managerSelection.isOpen) {
      this.closeDbManager();
      return;
    }
    this.openDbManager();
  }

  openDbManager(): void {
    const parts = this.site.getResultsParts();
    if (!parts.panel || !parts.head || !parts.title || !parts.description) {
      log('warn', 'Results panel was not found for DB manager');
      return;
    }

    if (!this.managerSelection.originalTitle) {
      this.managerSelection.originalTitle = parts.title.textContent || 'Results';
      this.managerSelection.originalDescription = parts.description.textContent || '';
    }

    this.ensureDbManagerRoot(parts.head);
    this.renderDbManager();

    parts.title.replaceChildren(createDbManagerBrandLink());
    parts.description.textContent = 'Edit links, phrases, images, sounds, and videos.';
    parts.actions?.classList.add('ctrlem-db-hidden-site-ui');
    parts.pagination?.classList.add('ctrlem-db-hidden-site-ui');

    const root: any = document.getElementById(UI_IDS.dbManager);
    if (root) root.hidden = false;

    this.managerSelection.isOpen = true;
    this.setDbButtonActive(true);
    log('info', 'DB manager opened');
  }

  closeDbManager(): void {
    const parts = this.site.getResultsParts();
    const root: any = document.getElementById(UI_IDS.dbManager);

    this.flushEditorToState();
    if (this.dbState?.autoSave) {
      this.saveDbState('manager closed');
    } else {
      this.refreshDbConsumers('manager closed');
    }
    if (root) root.hidden = true;
    if (parts.title) parts.title.textContent = this.managerSelection.originalTitle || 'Results';
    if (parts.description) parts.description.textContent = this.managerSelection.originalDescription || '';
    parts.actions?.classList.remove('ctrlem-db-hidden-site-ui');
    parts.pagination?.classList.remove('ctrlem-db-hidden-site-ui');

    this.managerSelection.isOpen = false;
    this.managerSelection.editorCommandKey = '';
    this.setDbButtonActive(false);
    log('info', 'DB manager closed');
  }

  ensureDbManagerRoot(head: any): any {
    let root: any = document.getElementById(UI_IDS.dbManager);
    if (root) return root;

    root = createElement('div', {
      id: UI_IDS.dbManager,
      className: 'ctrlem-db-manager',
      attrs: { hidden: '' },
    });
    head.insertAdjacentElement('afterend', root);
    return root;
  }

  renderDbManager(): void {
    const root: any = document.getElementById(UI_IDS.dbManager);
    if (!root) return;
    renderManagerView(root, this.getManagerViewModel(), this.managerActions);
  }

  renderCategoryList(): void {
    const list = document.getElementById(UI_IDS.dbManagerCategoryList);
    if (!list) return;
    renderManagerCategoryList(list, this.getManagerViewModel(), this.managerActions);
  }

  setActiveType(type: string): void {
    this.flushEditorToState();
    this.dbState.activeType = normalizeType(type);
    this.uiState.manager.activeTab = 'editor';
    const selected = this.getSelectedCategory(this.dbState.activeType);
    if (selected) this.setManagerSelectedCategory(this.dbState.activeType, selected.id);
    this.renderDbManager();
    this.scheduleUiStateSave('manager type changed');
    this.saveAndRefreshAfterStructuralChange('type changed');
    log('info', 'Manager type changed', { type: this.dbState.activeType });
  }

  setActiveTab(tab: string): void {
    if (!['editor', 'settings', 'info'].includes(tab)) return;
    this.flushEditorToState();
    this.uiState.manager.activeTab = tab;
    this.renderDbManager();
    this.scheduleUiStateSave('manager tab changed');
    log('info', 'Manager tab changed', { tab });
  }

  setCategoryListScroll(scrollTop: number): void {
    this.uiState.manager.categoryListScrollTop = Math.max(0, Number(scrollTop) || 0);
    this.scheduleUiStateSave('category list scrolled');
  }

  selectManagerCategory(categoryId: string): void {
    this.flushEditorToState();
    this.setManagerSelectedCategory(this.dbState.activeType, categoryId);
    this.renderDbManager();
    if (this.dbState.autoSave) this.saveDbState('category selected');
    log('info', 'Category selected', {
      type: this.dbState.activeType,
      categoryId,
    });
  }

  setAutoSave(enabled: boolean): void {
    this.dbState.autoSave = enabled;
    log('info', 'Auto-save toggled', { enabled: this.dbState.autoSave });
    this.saveDbState('auto-save toggled');
    setManagerStatus(this.dbState.autoSave ? 'Auto-save enabled' : 'Auto-save disabled', 'info');
  }

  setAutoSendInterval(seconds: number, options: any = {}): void {
    const nextInterval = clampAutoSendInterval(seconds);
    this.dbState.autoSendIntervalSeconds = nextInterval;
    log('info', 'Auto-send interval changed', { seconds: nextInterval });
    this.saveDbState('auto-send interval changed');
    this.autoSend.syncIntervalInputs();
    if (options.status !== false) setManagerStatus(`Auto-send interval: ${nextInterval}s`, 'info');
  }

  setMinimumRequestInterval(seconds: number, options: any = {}): void {
    const nextInterval = clampMinimumRequestInterval(seconds);
    this.dbState.minimumRequestIntervalSeconds = nextInterval;
    log('info', 'Auto-send per-receiver minimum request interval changed', { seconds: nextInterval });
    this.saveDbState('auto-send per-receiver minimum request interval changed');
    if (options.status !== false) setManagerStatus(`Auto-send per-receiver min request interval: ${nextInterval}s`, 'info');
  }

  setUploaderSetting(name: string, value: any): void {
    if (!Object.prototype.hasOwnProperty.call(this.uploaderSettings, name)) return;
    this.uploaderSettings[name] = typeof this.uploaderSettings[name] === 'boolean'
      ? value === true || value === 'true'
      : String(value || '');
    if (name === 'autoDownloadSendOrDeleteImages' && this.uploaderSettings[name] === false) {
      this.sendOrDeleteDownloadArms = [];
    }
    this.scheduleUploaderSettingsSave();
  }

  normalizeLinkCheckScope(): any {
    const scopeAll = this.linkCheckState.scopeAll !== false;
    const scopeType = (LINK_CHECK_MEDIA_TYPES as readonly string[]).includes(this.linkCheckState.scopeType)
      ? this.linkCheckState.scopeType
      : RecordType.IMAGE;
    const categories = getUserCategories(this.dbState, scopeType);
    const selectedCategory = categories.find((category: any) => category.id === this.linkCheckState.scopeCategoryId) || categories[0] || null;

    Object.assign(this.linkCheckState, {
      scopeAll,
      scopeType,
      scopeCategoryId: selectedCategory?.id || '',
    });

    return {
      scopeAll,
      scopeType,
      scopeCategoryId: selectedCategory?.id || '',
      category: selectedCategory,
    };
  }

  setLinkCheckScope(patch: any): void {
    if (this.linkCheckState.isBusy) return;
    if (typeof patch?.scopeAll === 'boolean') this.linkCheckState.scopeAll = patch.scopeAll;
    if ((LINK_CHECK_MEDIA_TYPES as readonly string[]).includes(patch?.scopeType)) {
      this.linkCheckState.scopeType = patch.scopeType;
      if (patch.scopeCategoryId === undefined) this.linkCheckState.scopeCategoryId = '';
    }
    if (patch?.scopeCategoryId !== undefined) this.linkCheckState.scopeCategoryId = String(patch.scopeCategoryId || '');
    this.normalizeLinkCheckScope();
    this.renderDbManager();
  }

  async renameMediaItem(details: any, name: string): Promise<boolean> {
    const type = String(details?.type || '');
    if (type !== RecordType.SOUND && type !== RecordType.VIDEO) return false;

    const url = String(details?.value || '').trim();
    if (!url) return false;

    const categories = getUserCategories(this.dbState, type);
    const category = categories.find((item) => item.id === details?.categoryId)
      || categories.find((item) => item.name === details?.category);
    if (!category) return false;

    const lines = parseLines(category.content);
    const requestedIndex = Number(details?.index);
    let lineIndex = Number.isFinite(requestedIndex)
      && requestedIndex >= 0
      && getRecordKey(type, lines[requestedIndex]) === url
      ? requestedIndex
      : -1;

    if (lineIndex < 0) {
      lineIndex = lines.findIndex((line) => getRecordKey(type, line) === url);
    }
    if (lineIndex < 0) return false;

    const cleanName = String(name || '').trim();
    lines[lineIndex] = cleanName ? `${url} ${cleanName}` : url;
    category.content = formatCategoryContent(lines.join('\n'));
    this.updateCommandPickerUiState(details?.command || '', {
      categoryId: category.id,
      categoryName: category.name,
      value: url,
      itemIndex: lineIndex,
    });

    if (
      this.managerSelection.isOpen
      && this.dbState.activeType === type
      && this.managerSelection.selectedCategoryByType[type] === category.id
    ) {
      const textarea: any = document.getElementById(UI_IDS.dbManagerTextarea);
      if (textarea) textarea.value = category.content;
    }

    await this.saveDbState('media renamed', { flushEditor: false });
    this.site.notify('Media renamed', 'success');
    return true;
  }

  openMediaPreview(button: any): void {
    const type = String(button?.dataset?.type || '');
    const url = String(button?.dataset?.value || '').trim();
    if (!url || (type !== RecordType.SOUND && type !== RecordType.VIDEO)) return;

    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    const title = type === RecordType.SOUND ? 'Sound preview' : 'Video preview';
    const nameInput = createElement('input', {
      className: 'ctrlem-db-media-preview-name',
      value: button.dataset.label || '',
      attrs: {
        placeholder: 'Display name',
        autocomplete: 'off',
      },
    });
    const status = createElement('div', {
      className: 'ctrlem-db-media-preview-status',
      attrs: { 'aria-live': 'polite' },
    });
    const closeButton = createElement('button', {
      className: 'btn btn-sm btn-secondary',
      text: 'Cancel',
      type: 'button',
    });
    const saveButton = createElement('button', {
      className: 'btn btn-sm btn-primary',
      text: 'Save name',
      type: 'button',
    });
    const modal = createElement('div', {
      className: 'ctrlem-db-modal-backdrop ctrlem-db-media-preview-backdrop',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    }, [
      createElement('div', { className: 'ctrlem-db-modal ctrlem-db-media-preview-modal' }, [
        createElement('div', { className: 'ctrlem-db-modal-title', text: title }),
        createElement('a', {
          className: 'ctrlem-db-media-preview-url',
          text: url,
          attrs: { href: url, target: '_blank', rel: 'noopener noreferrer' },
        }),
        nameInput,
        status,
        createElement('div', { className: 'ctrlem-db-modal-actions' }, [
          closeButton,
          saveButton,
        ]),
      ]),
    ]);

    const close = () => {
      modal.remove();
    };
    status.textContent = opened
      ? 'Your preview was opened in a new tab. You can rename the link or close this window.'
      : 'Your preview can be opened from the link above. You can rename the link or close this window.';
    const save = async () => {
      saveButton.disabled = true;
      status.textContent = 'Saving...';
      status.dataset.level = 'info';
      const saved = await this.renameMediaItem(button.dataset, nameInput.value);
      if (!saved) {
        saveButton.disabled = false;
        status.textContent = 'Media item was not found.';
        status.dataset.level = 'error';
        return;
      }
      button.dataset.label = nameInput.value.trim();
      close();
    };

    closeButton.addEventListener('click', close);
    saveButton.addEventListener('click', () => {
      save().catch((error: any) => {
        saveButton.disabled = false;
        status.textContent = error?.message || String(error);
        status.dataset.level = 'error';
      });
    });
    nameInput.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter') saveButton.click();
      if (event.key === 'Escape') close();
    });
    modal.addEventListener('click', (event: MouseEvent) => {
      if (event.target === modal) close();
    });

    document.body.appendChild(modal);
    window.setTimeout(() => this.focusWithoutScroll(nameInput), 0);
  }

  openImgBBKeyPrompt(): void {
    document.getElementById(UI_IDS.imgbbKeyModal)?.remove();

    const input = createElement('input', {
      className: 'ctrlem-db-imgbb-key-input',
      type: 'password',
      value: this.uploaderSettings.imgbbApiKey || '',
      attrs: {
        placeholder: 'ImgBB API key',
        autocomplete: 'off',
      },
    });
    const status = createElement('div', {
      className: 'ctrlem-db-imgbb-key-status',
      attrs: { 'aria-live': 'polite' },
    });
    const closeButton = createElement('button', {
      className: 'btn btn-sm btn-secondary',
      text: 'Cancel',
      type: 'button',
    });
    const saveButton = createElement('button', {
      className: 'btn btn-sm btn-primary',
      text: 'Save key',
      type: 'button',
    });
    const modal = createElement('div', {
      id: UI_IDS.imgbbKeyModal,
      className: 'ctrlem-db-modal-backdrop',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'ImgBB API key' },
    }, [
      createElement('div', { className: 'ctrlem-db-modal' }, [
        createElement('div', { className: 'ctrlem-db-modal-title', text: 'ImgBB API key' }),
        createElement('p', {
          className: 'ctrlem-db-modal-copy',
          text: 'ImgBB needs an API key for full media uploading above CtrlEm small-file limits.',
        }),
        input,
        status,
        createElement('div', { className: 'ctrlem-db-modal-actions' }, [
          closeButton,
          saveButton,
        ]),
      ]),
    ]);

    const close = () => modal.remove();
    const save = () => {
      const value = input.value.trim();
      if (!value) {
        status.textContent = 'Enter an ImgBB API key.';
        status.dataset.level = 'error';
        return;
      }
      this.setUploaderSetting('imgbbApiKey', value);
      status.textContent = 'Saved.';
      status.dataset.level = 'success';
      window.setTimeout(close, USER_CONFIG.ui.modalCloseDelayMs);
    };

    closeButton.addEventListener('click', close);
    saveButton.addEventListener('click', save);
    input.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter') save();
      if (event.key === 'Escape') close();
    });
    modal.addEventListener('click', (event: MouseEvent) => {
      if (event.target === modal) close();
    });

    document.body.appendChild(modal);
    window.setTimeout(() => input.focus(), 0);
  }

  async uploadContentFile(request: any): Promise<string> {
    const tool = String(request?.tool || '');
    const file: File | undefined = request?.file;
    if (!file) throw new Error('File is required');

    try {
      if (tool === 'imgbb') {
        const url = await uploadImageToImgBB(file, request?.apiKey || this.uploaderSettings.imgbbApiKey);
        log('info', 'ImgBB upload completed', { name: file.name, url });
        return url;
      }

      if (tool === 'catbox') {
        const url = await uploadFileToCatbox(file, request?.userhash || this.uploaderSettings.catboxUserhash);
        log('info', 'Catbox upload completed', { name: file.name, url });
        return url;
      }

      if (tool === 'vidhosting') {
        const url = await uploadVideoToVidHosting(file);
        log('info', 'VidHosting upload completed', { name: file.name, url });
        return url;
      }

      throw new Error(`Unknown upload tool: ${tool}`);
    } catch (error: any) {
      log('error', 'Content upload failed', {
        tool,
        name: file.name,
        message: error?.message || String(error),
      });
      throw error;
    }
  }

  getUploadTarget(config: any): any {
    const categories = getUserCategories(this.dbState, config.type);
    const pickerState = this.getCommandPickerUiState(config.key);
    const selectedId = pickerState.categoryId || this.managerSelection.selectedCategoryByType[config.type];
    const category = categories.find((item) => item.id === selectedId) || categories[0];

    return {
      id: category?.id || '',
      name: category?.name || 'Current category',
      type: config.type,
    };
  }

  getUploadCategories(config: any): any[] {
    return getUserCategories(this.dbState, config.type).map((category) => ({
      id: category.id,
      name: category.name,
      type: config.type,
    }));
  }

  async appendUploadedUrl(request: any): Promise<any> {
    const config = request?.config || {};
    const url = String(request?.url || '').trim();
    const fileName = String(request?.fileName || '').trim();
    const value = String(
      request?.value
      || request?.line
      || ((config.type === RecordType.SOUND || config.type === RecordType.VIDEO) && fileName
        ? `${url} ${fileName}`
        : url),
    ).trim();
    const categories = getUserCategories(this.dbState, config.type);
    const category = categories.find((item) => item.id === request?.targetCategoryId)
      || categories.find((item) => item.id === this.getCommandPickerUiState(config.key).categoryId)
      || categories[0];
    if (!category || !url || !value) return { appended: false, categoryName: category?.name || 'Current category' };

    const existing = parseLines(category.content);
    const existingKeys = new Set(existing.map((line) => getRecordKey(config.type, line)));
    const key = getRecordKey(config.type, value);
    const appended = Boolean(key && !existingKeys.has(key));

    if (appended) {
      category.content = formatCategoryContent([...existing, value].join('\n'));
      this.updateCommandPickerUiState(config.key, {
        categoryId: category.id,
        categoryName: category.name,
        value: url,
        itemIndex: existing.length,
      });

      if (
        this.managerSelection.isOpen
        && this.dbState.activeType === config.type
        && this.managerSelection.selectedCategoryByType[config.type] === category.id
      ) {
        const textarea: any = document.getElementById(UI_IDS.dbManagerTextarea);
        if (textarea) textarea.value = category.content;
      }

      if (this.dbState.autoSave) {
        await this.saveDbState(`${config.label || config.key} upload appended`, { flushEditor: false });
      } else {
        this.renderCategoryList();
        this.refreshDbConsumers(`${config.label || config.key} upload appended`);
      }
    }

    log('info', 'Uploaded URL handled', {
      command: config.key,
      source: request?.source,
      category: category.name,
      appended,
      url,
    });
    return { appended, categoryName: category.name, url, value };
  }

  async uploadCommandFile(request: any): Promise<any> {
    const url = await this.uploadContentFile(request);
    return this.appendUploadedUrl({
      config: request.config,
      url,
      targetCategoryId: request.targetCategoryId,
      source: request.tool,
    });
  }

  resetLinkCheckState(categoryId = '', patch: any = {}): void {
    const scopeAll = this.linkCheckState.scopeAll !== false;
    const scopeType = (LINK_CHECK_MEDIA_TYPES as readonly string[]).includes(this.linkCheckState.scopeType)
      ? this.linkCheckState.scopeType
      : RecordType.IMAGE;
    const scopeCategoryId = String(this.linkCheckState.scopeCategoryId || '');

    Object.assign(this.linkCheckState, {
      categoryId,
      scopeAll,
      scopeType,
      scopeCategoryId,
      isBusy: false,
      checked: 0,
      total: 0,
      brokenCount: 0,
      currentType: '',
      currentCategoryName: '',
      currentUrl: '',
      broken: [],
      statusMessage: '',
      statusLevel: 'info',
      token: '',
      ...patch,
    });
  }

  async checkBrokenLinks(): Promise<void> {
    this.flushEditorToState();

    const scope = this.normalizeLinkCheckScope();
    const targets = scope.scopeAll
      ? LINK_CHECK_MEDIA_TYPES.flatMap((type) => (
        getUserCategories(this.dbState, type).map((category: any) => ({ type, category }))
      ))
      : (scope.category ? [{ type: scope.scopeType, category: scope.category }] : []);
    const total = targets.reduce((count, target) => count + getCategoryDataLines(target.category.content).length, 0);

    const token = createId('link-check');
    this.resetLinkCheckState('', {
      isBusy: true,
      total,
      statusMessage: 'Checking media links...',
      token,
    });
    this.renderDbManager();
    setManagerStatus('Checking media links...', 'info');

    try {
      const broken: any[] = [];
      let checked = 0;

      for (const target of targets) {
        const result = await findBrokenMediaLinks(target.type, target.category.content, (progress) => {
          if (this.linkCheckState.token !== token) return;
          Object.assign(this.linkCheckState, {
            checked: checked + progress.checked,
            total,
            brokenCount: broken.length + progress.brokenCount,
            currentType: target.type,
            currentCategoryName: target.category.name,
            currentUrl: progress.currentUrl || '',
            statusMessage: `Checked links: ${checked + progress.checked}/${total}. Broken: ${broken.length + progress.brokenCount}`,
            statusLevel: 'info',
          });
          setManagerStatus(`Checked links: ${checked + progress.checked}/${total}. Broken: ${broken.length + progress.brokenCount}`, 'info');
          this.renderDbManager();
        });

        if (this.linkCheckState.token !== token) return;
        checked += result.checked;
        broken.push(...result.broken.map((item: any) => ({
          ...item,
          type: target.type,
          categoryId: target.category.id,
          categoryName: target.category.name,
        })));
      }

      if (this.linkCheckState.token !== token) return;

      Object.assign(this.linkCheckState, {
        isBusy: false,
        checked,
        total,
        brokenCount: broken.length,
        currentType: '',
        currentCategoryName: '',
        currentUrl: '',
        broken,
        statusMessage: broken.length > 0
          ? `Broken links found: ${broken.length}/${total}`
          : `No broken links found: ${total}`,
        statusLevel: broken.length > 0 ? 'error' : 'success',
      });
      this.renderDbManager();
      setManagerStatus(this.linkCheckState.statusMessage, this.linkCheckState.statusLevel);
      log('info', 'Broken media link check completed', {
        scope: scope.scopeAll ? 'all' : `${scope.scopeType}:${scope.scopeCategoryId}`,
        total,
        broken: broken.length,
      });
    } catch (error: any) {
      if (this.linkCheckState.token !== token) return;
      Object.assign(this.linkCheckState, {
        isBusy: false,
        currentType: '',
        currentCategoryName: '',
        currentUrl: '',
        statusMessage: `Link check failed: ${error?.message || String(error)}`,
        statusLevel: 'error',
      });
      this.renderDbManager();
      setManagerStatus('Link check failed. Check console logs.', 'error');
      log('error', 'Broken media link check failed', {
        message: error?.message || String(error),
      });
    }
  }

  async removeBrokenLinks(): Promise<void> {
    this.flushEditorToState();

    const broken = Array.isArray(this.linkCheckState.broken) ? this.linkCheckState.broken : [];
    if (broken.length === 0) {
      setManagerStatus('No broken links to remove', 'info');
      return;
    }

    if (!window.confirm(`Remove ${broken.length} broken link(s) from media database?`)) return;

    const brokenByCategory = new Map<string, any>();
    broken.forEach((item: any) => {
      if (!item?.type || !item?.categoryId || !item?.line) return;
      const key = `${item.type}:${item.categoryId}`;
      const group = brokenByCategory.get(key) || {
        type: item.type,
        categoryId: item.categoryId,
        lines: new Set<string>(),
      };
      group.lines.add(item.line);
      brokenByCategory.set(key, group);
    });

    let removedCount = 0;
    let shouldSyncEditor = false;
    brokenByCategory.forEach((group) => {
      const category = getUserCategories(this.dbState, group.type)
        .find((item: any) => item.id === group.categoryId);
      if (!category) return;

      const beforeLines = parseLines(category.content);
      const afterLines = beforeLines.filter((line) => !group.lines.has(line));
      const categoryRemovedCount = beforeLines.length - afterLines.length;
      if (categoryRemovedCount === 0) return;

      removedCount += categoryRemovedCount;
      category.content = formatCategoryContent(afterLines.join('\n'));
      shouldSyncEditor = shouldSyncEditor || (
        this.managerSelection.isOpen
        && this.dbState.activeType === group.type
        && this.managerSelection.selectedCategoryByType[group.type] === category.id
      );
    });

    if (shouldSyncEditor) this.syncEditorTextarea();

    const brokenUrls = [...new Set<string>(broken.map((item: any) => String(item.url || '')).filter(Boolean))];
    this.imageCache.deleteUrls(brokenUrls).catch((error: any) => {
      log('debug', 'Broken link cache cleanup skipped', { message: error?.message || String(error) });
    });

    await this.saveDbState('broken links removed', { flushEditor: false });
    this.resetLinkCheckState('', {
      statusMessage: `Removed broken links: ${removedCount}`,
      statusLevel: removedCount > 0 ? 'success' : 'info',
    });
    this.renderDbManager();
    setManagerStatus(`Removed broken links: ${removedCount}`, removedCount > 0 ? 'success' : 'info');
    log('info', 'Broken media links removed', {
      removed: removedCount,
    });
  }

  updateEditorContent(content: string): void {
    const category = this.getSelectedCategory(this.dbState.activeType);
    if (category) category.content = content;
    if (
      category?.id
      && [RecordType.IMAGE, RecordType.SOUND, RecordType.VIDEO].includes(this.dbState.activeType)
      && (this.linkCheckState.broken.length > 0 || this.linkCheckState.statusMessage)
    ) {
      this.resetLinkCheckState('', {
        statusMessage: 'Category changed. Run the check again.',
      });
    }
    this.scheduleDataCommit('editor input');
  }

  addCategory(type = this.dbState.activeType, commandKey = ''): void {
    this.flushEditorToState();

    const normalizedType = normalizeType(type);
    const nextName = window.prompt('Category name', '');
    if (nextName === null) return;

    const cleanName = nextName.trim();
    if (!cleanName) {
      log('warn', 'Category add cancelled: empty name');
      setManagerStatus('Add cancelled: empty category name.', 'error');
      return;
    }

    const category = {
      id: createId(normalizedType),
      name: makeUniqueCategoryName(this.dbState, normalizedType, cleanName),
      content: '',
    };
    getUserCategories(this.dbState, normalizedType).push(category);
    this.setManagerSelectedCategory(normalizedType, category.id);
    if (commandKey) {
      this.updateCommandPickerUiState(commandKey, {
        categoryId: category.id,
        categoryName: category.name,
        itemIndex: -1,
        scrollTop: 0,
      });
      if (this.managerSelection.isOpen && this.dbState.activeType === normalizedType) {
        this.renderDbManager();
      }
    } else {
      this.uiState.manager.activeTab = 'editor';
      this.renderDbManager();
      this.focusManagerTextarea();
    }
    this.saveAndRefreshAfterStructuralChange('category added');
    log('info', 'Category added', { type: normalizedType, category: category.name });
  }

  renameSelectedCategory(): void {
    this.renameCategory(this.dbState.activeType);
  }

  renameSelectedCategoryTo(name: string): string {
    this.flushEditorToState();

    const type = this.dbState.activeType;
    const category = this.getSelectedCategory(type);
    if (!category) return '';

    const cleanName = String(name || '').trim();
    if (!cleanName) {
      log('warn', 'Category rename cancelled: empty name');
      setManagerStatus('Rename cancelled: empty category name.', 'error');
      return category.name;
    }

    const nextName = makeUniqueCategoryName(this.dbState, type, cleanName, category.id);
    if (nextName === category.name) return category.name;

    category.name = nextName;
    this.setManagerSelectedCategory(type, category.id);
    this.renderDbManager();
    this.saveAndRefreshAfterStructuralChange('category renamed');
    log('info', 'Category renamed', { type, category: category.name });
    return category.name;
  }

  renameCategory(type = this.dbState.activeType, categoryId = '', commandKey = ''): void {
    this.flushEditorToState();

    const normalizedType = normalizeType(type);
    const category = categoryId
      ? getUserCategories(this.dbState, normalizedType).find((item) => item.id === categoryId)
      : this.getSelectedCategory(normalizedType);
    if (!category) return;

    const nextName = window.prompt('Category name', category.name);
    if (nextName === null) return;

    const cleanName = nextName.trim();
    if (!cleanName) {
      log('warn', 'Category rename cancelled: empty name');
      setManagerStatus('Rename cancelled: empty category name.', 'error');
      return;
    }

    category.name = makeUniqueCategoryName(this.dbState, normalizedType, cleanName, category.id);
    this.setManagerSelectedCategory(normalizedType, category.id);
    if (commandKey) {
      this.updateCommandPickerUiState(commandKey, {
        categoryId: category.id,
        categoryName: category.name,
      });
    }
    this.renderDbManager();
    this.saveAndRefreshAfterStructuralChange('category renamed');
    log('info', 'Category renamed', { type: normalizedType, category: category.name });
  }

  openCategoryEditor(type = this.dbState.activeType, categoryId = '', commandKey = ''): void {
    this.flushEditorToState();

    const normalizedType = normalizeType(type);
    const category = categoryId
      ? getUserCategories(this.dbState, normalizedType).find((item) => item.id === categoryId)
      : this.getSelectedCategory(normalizedType);
    if (!category) return;

    if (
      this.managerSelection.isOpen
      && this.dbState.activeType === normalizedType
      && this.uiState.manager.activeTab === 'editor'
      && this.managerSelection.selectedCategoryByType[normalizedType] === category.id
      && this.managerSelection.editorCommandKey === commandKey
    ) {
      this.closeDbManager();
      return;
    }

    this.dbState.activeType = normalizedType;
    this.uiState.manager.activeTab = 'editor';
    this.setManagerSelectedCategory(normalizedType, category.id);
    if (commandKey) {
      this.updateCommandPickerUiState(commandKey, {
        categoryId: category.id,
        categoryName: category.name,
      });
    }

    if (this.managerSelection.isOpen) {
      this.renderDbManager();
    } else {
      this.openDbManager();
    }
    this.managerSelection.editorCommandKey = commandKey;
    this.focusManagerCategoryName();
    log('info', 'Category editor opened', { type: normalizedType, category: category.name });
  }

  setImagePreviewsEnabled(categoryId: string, enabled: boolean): void {
    this.flushEditorToState();

    const category = getUserCategories(this.dbState, RecordType.IMAGE).find((item) => item.id === categoryId);
    if (!category) return;

    const dataLines = parseLines(category.content).filter((line) => !isNoPreviewsMarker(line));
    const shouldEnable = enabled && getCategoryDataLines(category.content).length <= IMAGE_PREVIEW_MAX_ITEMS;
    category.content = formatCategoryContent(shouldEnable
      ? dataLines.join('\n')
      : [NO_PREVIEWS_MARKER, ...dataLines].join('\n'));
    this.setManagerSelectedCategory(RecordType.IMAGE, category.id);

    if (
      this.managerSelection.isOpen
      && this.dbState.activeType === RecordType.IMAGE
      && this.managerSelection.selectedCategoryByType[RecordType.IMAGE] === category.id
    ) {
      this.syncEditorTextarea();
    }

    this.saveAndRefreshAfterStructuralChange('image previews toggled');
    log('info', 'Image previews toggled', { category: category.name, enabled: shouldEnable });
  }

  deleteSelectedCategory(): void {
    const type = this.dbState.activeType;
    const categories = getUserCategories(this.dbState, type);
    const category = this.getSelectedCategory(type);
    if (!category) return;

    if (!window.confirm(`Delete category "${category.name}"?`)) return;

    const oldIndex = categories.findIndex((item) => item.id === category.id);
    if (oldIndex >= 0) categories.splice(oldIndex, 1);
    if (categories.length === 0) {
      categories.push(createEmptyCategory(type));
    }

    const nextIndex = Math.max(0, Math.min(oldIndex, categories.length - 1));
    this.setManagerSelectedCategory(type, categories[nextIndex].id);
    this.renderDbManager();
    this.saveAndRefreshAfterStructuralChange('category deleted');
    log('info', 'Category deleted', { type, category: category.name });
  }

  reorderCategory(sourceId: string, targetId: string): void {
    const type = this.dbState.activeType;
    if (!sourceId || !targetId || sourceId === targetId) return;

    const categories = getUserCategories(this.dbState, type);
    const sourceIndex = categories.findIndex((category) => category.id === sourceId);
    const targetIndex = categories.findIndex((category) => category.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const [moved] = categories.splice(sourceIndex, 1);
    categories.splice(targetIndex, 0, moved);
    this.setManagerSelectedCategory(type, moved.id);
    this.renderCategoryList();
    this.saveAndRefreshAfterStructuralChange('category reordered');
    log('info', 'Category reordered', { type, category: moved.name, targetId });
  }

  saveAndRefreshAfterStructuralChange(reason: string): void {
    this.flushEditorToState();
    if (this.dbState.autoSave) {
      this.saveDbState(reason);
      return;
    }
    this.renderCategoryList();
    this.refreshDbConsumers(reason);
  }

  focusManagerTextarea(): void {
    window.setTimeout(() => {
      const textarea = document.getElementById(UI_IDS.dbManagerTextarea);
      if (textarea) textarea.focus();
    }, 0);
  }

  focusManagerCategoryName(): void {
    window.setTimeout(() => {
      const input: any = document.querySelector('.ctrlem-db-category-name-input');
      if (!input) return;
      input.focus();
      input.select?.();
    }, 0);
  }

  exportSelectedCategory(): void {
    this.flushEditorToState();
    const type = this.dbState.activeType;
    const category = this.getSelectedCategory(type);
    if (!category) return;

    const filename = `${getSafeFileName(type, 'type')}-${getSafeFileName(category.name, 'category')}.txt`;
    downloadTextFile(filename, formatCategoryContent(category.content), 'text/plain;charset=utf-8');
    setManagerStatus(`Exported category: ${category.name}`, 'success');
    log('info', 'Category exported', { type, category: category.name, filename });
  }

  exportAllCategories(): void {
    this.flushEditorToState();

    const filename = `ctrlem-db-${new Date().toISOString().slice(0, 10)}.json`;
    downloadTextFile(filename, JSON.stringify(createExportPayload(this.dbState), null, 2), 'application/json;charset=utf-8');
    setManagerStatus('Exported all categories', 'success');
    log('info', 'All categories exported', { filename });
  }

  async replaceAllCategories(rawState: any, reason: string, successMessage: string): Promise<void> {
    const keepAutoSave = this.dbState?.autoSave !== false;
    const keepAutoSendInterval = clampAutoSendInterval(this.dbState?.autoSendIntervalSeconds);
    const keepMinimumRequestInterval = clampMinimumRequestInterval(this.dbState?.minimumRequestIntervalSeconds);
    this.dbState = normalizeDbState(rawState);
    this.dbState.autoSave = keepAutoSave;
    if (rawState?.autoSendIntervalSeconds === undefined) {
      this.dbState.autoSendIntervalSeconds = keepAutoSendInterval;
    }
    if (rawState?.minimumRequestIntervalSeconds === undefined) {
      this.dbState.minimumRequestIntervalSeconds = keepMinimumRequestInterval;
    }
    resetManagerSelections(this.dbState, this.managerSelection);
    this.restoreManagerSelectionsFromUiState();
    this.scheduleUiStateSave('manager selections restored');
    this.renderDbManager();
    await this.saveDbState(reason, { flushEditor: false });
    setManagerStatus(successMessage, 'success');
    log('info', successMessage, getDatabaseSummary(this.dbState));
  }

  async importAllCategoriesFromFile(file?: File): Promise<void> {
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed?.types || typeof parsed.types !== 'object') {
        throw new Error('JSON must contain a "types" object');
      }

      await this.replaceAllCategories(parsed, 'all categories imported', 'Imported all categories from JSON');
    } catch (error: any) {
      setManagerStatus('Import all failed. Select a valid DB JSON export.', 'error');
      log('error', 'Failed to import all categories', {
        name: file.name,
        message: error?.message || String(error),
      });
    }
  }

  async restoreDefaultCategories(): Promise<void> {
    await this.replaceAllCategories(createSeedState(), 'defaults restored', 'Restored default categories');
  }

  async importCategoriesFromFiles(files: File[]): Promise<void> {
    if (!files.length) return;

    this.flushEditorToState();

    let importedCount = 0;
    let firstImported: any = null;

    for (const file of files) {
      try {
        const text = await file.text();
        const additions = parseImportFile(file, text, this.dbState.activeType, log);
        additions.forEach((addition) => {
          const type = normalizeType(addition.type || this.dbState.activeType);
          const category = {
            id: createId(type),
            name: makeUniqueCategoryName(this.dbState, type, addition.name),
            content: formatCategoryContent(addition.content),
          };
          getUserCategories(this.dbState, type).push(category);
          importedCount += 1;
          if (!firstImported) firstImported = { type, id: category.id };
        });
      } catch (error: any) {
        log('error', 'Failed to import file', {
          name: file.name,
          message: error?.message || String(error),
        });
      }
    }

    if (firstImported) {
      this.dbState.activeType = firstImported.type;
      this.setManagerSelectedCategory(firstImported.type, firstImported.id);
    }

    this.renderDbManager();
    this.saveAndRefreshAfterStructuralChange('categories imported');
    setManagerStatus(`Imported categories: ${importedCount}`, importedCount ? 'success' : 'error');
    log('info', 'Categories imported', { count: importedCount, files: files.length });
  }

  mountUi(reason: string): void {
    const mounted = [
      this.mountDatabaseButton(),
      mountInputCapture({
        captureInputValue: (config: any) => this.captureInputValue(config),
        log,
      }),
      this.mountTextPickers(),
      this.mountMediaPickers(),
      this.mountUploadPanels(),
      this.mountSendOrDeleteDownloadTrigger(),
      this.autoSend.mountControls(),
      this.autoSend.renderManager(),
      this.scanSendOrDeleteResponses(),
    ].some(Boolean);

    if (mounted) log('debug', 'UI mount pass completed', { reason });
  }

  debounce(callback: () => void, delay: number): () => void {
    let timer = 0;
    return () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(callback, delay);
    };
  }

  startObserver(): void {
    if (!document.body) return;

    const observer = new MutationObserver(this.debounce(() => {
      this.mountUi('dom-mutation');
    }, USER_CONFIG.ui.domObserverDelayMs));

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    log('debug', 'DOM observer started');
  }
}

export async function bootCtrlEmDb(): Promise<void> {
  const app = new CtrlEmDbApp();
  await app.start();
}
