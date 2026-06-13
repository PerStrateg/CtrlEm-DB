export const UI_STATE_VERSION = 2;

export const MANAGER_TABS = Object.freeze({
  EDITOR: 'editor',
  SETTINGS: 'settings',
  INFO: 'info',
});

export function normalizeManagerTab(value: unknown): string {
  const tab = String(value || '');
  return (Object.values(MANAGER_TABS) as string[]).includes(tab) ? tab : MANAGER_TABS.EDITOR;
}

export function createUiState(): any {
  return {
    version: UI_STATE_VERSION,
    manager: {
      activeTab: MANAGER_TABS.EDITOR,
      selectedCategoryByType: {},
      categoryListScrollTop: 0,
      settingsSections: {
        uploader: false,
        linkCheck: false,
        constants: false,
        imgbbInfoDismissed: false,
      },
    },
    pickers: {},
    uploads: {},
  };
}

function normalizeStringMap(value: any): any {
  const source = value && typeof value === 'object' ? value : {};
  return Object.entries(source).reduce((result: any, [key, item]) => {
    result[key] = item == null ? '' : String(item);
    return result;
  }, {});
}

export function normalizeUiState(rawState: any): any {
  const source = rawState && typeof rawState === 'object' ? rawState : {};
  const sourceVersion = Number(source.version) || 0;
  const manager = source.manager && typeof source.manager === 'object' ? source.manager : {};
  const settingsSections = manager.settingsSections && typeof manager.settingsSections === 'object'
    ? manager.settingsSections
    : {};
  const rawPickers = source.pickers && typeof source.pickers === 'object' ? source.pickers : {};
  const rawUploads = source.uploads && typeof source.uploads === 'object' ? source.uploads : {};

  return {
    version: UI_STATE_VERSION,
    manager: {
      activeTab: normalizeManagerTab(manager.activeTab),
      selectedCategoryByType: normalizeStringMap(manager.selectedCategoryByType),
      categoryListScrollTop: Math.max(0, Number(manager.categoryListScrollTop) || 0),
      settingsSections: {
        uploader: settingsSections.uploader === true,
        linkCheck: settingsSections.linkCheck === true,
        constants: settingsSections.constants === true,
        imgbbInfoDismissed: settingsSections.imgbbInfoDismissed === true || manager.imgbbInfoDismissed === true,
      },
    },
    pickers: Object.entries(rawPickers).reduce((result: any, [commandKey, value]) => {
      const picker = value && typeof value === 'object' ? value as any : {};
      result[commandKey] = {
        categoryId: String(picker.categoryId || ''),
        categoryName: String(picker.categoryName || ''),
        value: String(picker.value || ''),
        itemIndex: Number.isFinite(Number(picker.itemIndex)) ? Math.max(-1, Number(picker.itemIndex)) : -1,
        scrollTop: Math.max(0, Number(picker.scrollTop) || 0),
      };
      return result;
    }, {}),
    uploads: Object.entries(rawUploads).reduce((result: any, [commandKey, value]) => {
      const upload = value && typeof value === 'object' ? value as any : {};
      result[commandKey] = {
        collapsed: commandKey === 'popupImage' && sourceVersion < 2 ? true : upload.collapsed !== false,
      };
      return result;
    }, {}),
  };
}

export function getPickerUiState(uiState: any, commandKey: string): any {
  if (!uiState.pickers[commandKey]) {
    uiState.pickers[commandKey] = {
      categoryId: '',
      categoryName: '',
      value: '',
      itemIndex: -1,
      scrollTop: 0,
    };
  }
  return uiState.pickers[commandKey];
}

export function getUploadUiState(uiState: any, commandKey: string): any {
  if (!uiState.uploads) uiState.uploads = {};
  if (!uiState.uploads[commandKey]) {
    uiState.uploads[commandKey] = {
      collapsed: true,
    };
  }
  return uiState.uploads[commandKey];
}
