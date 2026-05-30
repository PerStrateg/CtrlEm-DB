import {
  RecordType,
  TYPE_LABELS,
  TYPE_ORDER,
  UI_IDS,
  USER_CONFIG,
} from '../domain/constants';
import { parseLines } from '../domain/content';
import { MANAGER_TABS } from '../domain/uiState';
import { createElement } from './dom';

let dragCategoryId: string | null = null;

export function renderDbManager(root: any, viewModel: any, actions: any): void {
  const activeTab = viewModel.uiState?.activeTab || MANAGER_TABS.EDITOR;
  const layoutChildren = activeTab === MANAGER_TABS.EDITOR
    ? [
      createManagerSide(viewModel, actions),
      createManagerWorkspace(viewModel, actions),
    ]
    : [createManagerWorkspace(viewModel, actions)];

  root.replaceChildren(
    createManagerTopBar(viewModel, actions),
    createElement('div', {
      className: `ctrlem-db-manager-layout${activeTab !== MANAGER_TABS.EDITOR ? ' is-single-panel' : ''}`,
    }, layoutChildren),
  );
}

export function renderCategoryList(list: any, viewModel: any, actions: any): void {
  if (!list) return;

  const selected = viewModel.selectedCategory;
  list.replaceChildren();

  viewModel.categories.forEach((category: any) => {
    const item = createElement('button', {
      className: `ctrlem-db-category-item${category.id === selected?.id ? ' is-selected' : ''}`,
      text: '',
      type: 'button',
      title: `${category.name} - drag to reorder`,
      attrs: { draggable: 'true' },
      dataset: { id: category.id },
    }, [
      createElement('span', { className: 'ctrlem-db-category-item-main' }, [
        createElement('span', {
          className: 'ctrlem-db-drag-handle',
          text: '::',
          attrs: { 'aria-hidden': 'true' },
        }),
        createElement('span', {
          className: 'ctrlem-db-category-item-name',
          text: category.name,
        }),
      ]),
      createElement('span', {
        className: 'ctrlem-db-category-item-count',
        text: String(parseLines(category.content).length),
      }),
    ]);

    item.addEventListener('click', () => actions.selectCategory(category.id));
    item.addEventListener('dragstart', (event: DragEvent) => {
      dragCategoryId = category.id;
      item.classList.add('is-dragging');
      event.dataTransfer?.setData('text/plain', category.id);
      event.dataTransfer?.setDragImage(item, 10, 10);
    });
    item.addEventListener('dragend', () => {
      dragCategoryId = null;
      item.classList.remove('is-dragging');
      list.querySelectorAll('.ctrlem-db-category-item.is-drop-target').forEach((target: any) => {
        target.classList.remove('is-drop-target');
      });
    });
    item.addEventListener('dragover', (event: DragEvent) => {
      event.preventDefault();
      if (dragCategoryId && dragCategoryId !== category.id) {
        item.classList.add('is-drop-target');
      }
    });
    item.addEventListener('dragleave', () => {
      item.classList.remove('is-drop-target');
    });
    item.addEventListener('drop', (event: DragEvent) => {
      event.preventDefault();
      item.classList.remove('is-drop-target');
      const sourceId = event.dataTransfer?.getData('text/plain') || dragCategoryId;
      actions.reorderCategory(sourceId, category.id);
    });

    list.appendChild(item);
  });

  window.setTimeout(() => {
    list.scrollTop = Math.max(0, Number(viewModel.uiState?.categoryListScrollTop) || 0);
  }, 0);
}

export function setManagerStatus(message: string, level = 'info'): void {
  const status: any = document.getElementById(UI_IDS.dbManagerStatus);
  if (!status) return;
  status.textContent = message || '';
  status.dataset.level = level;
}

function createManagerTopBar(viewModel: any, actions: any): any {
  return createElement('div', { className: 'ctrlem-db-manager-topbar' }, [
    createTopTabs(viewModel, actions),
  ]);
}

function createTopTabs(viewModel: any, actions: any): any {
  const activeTab = viewModel.uiState?.activeTab || MANAGER_TABS.EDITOR;
  const row = createElement('div', { className: 'ctrlem-db-type-row', attrs: { role: 'tablist' } });

  (TYPE_ORDER as readonly string[]).forEach((type) => {
    const isActive = activeTab === MANAGER_TABS.EDITOR && viewModel.activeType === type;
    const button = createElement('button', {
      className: `ctrlem-db-type-option${isActive ? ' is-active' : ''}`,
      text: TYPE_LABELS[type],
      type: 'button',
      attrs: {
        role: 'tab',
        'aria-selected': String(isActive),
      },
      dataset: { type },
    });
    button.addEventListener('click', () => actions.setActiveType(type));
    row.appendChild(button);
  });

  [
    { key: MANAGER_TABS.SETTINGS, label: 'Settings' },
    { key: MANAGER_TABS.INFO, label: 'Info' },
  ].forEach((tab) => {
    const isActive = activeTab === tab.key;
    const button = createElement('button', {
      className: `ctrlem-db-type-option${isActive ? ' is-active' : ''}`,
      text: tab.label,
      type: 'button',
      attrs: {
        role: 'tab',
        'aria-selected': String(isActive),
      },
      dataset: { tab: tab.key },
    });
    button.addEventListener('click', () => actions.setActiveTab(tab.key));
    row.appendChild(button);
  });

  return row;
}

function createManagerSide(viewModel: any, actions: any): any {
  const list = createElement('div', {
    id: UI_IDS.dbManagerCategoryList,
    className: 'ctrlem-db-category-list',
  });
  let scrollTimer = 0;
  list.addEventListener('scroll', () => {
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => actions.setCategoryListScroll(list.scrollTop), USER_CONFIG.ui.scrollSaveDelayMs);
  });
  renderCategoryList(list, viewModel, actions);

  return createElement('div', { className: 'ctrlem-db-manager-side' }, [
    createElement('div', { className: 'ctrlem-db-side-title', text: 'Categories DB:' }),
    list,
    createElement('div', {
      id: UI_IDS.dbManagerStatus,
      className: 'ctrlem-db-status',
      attrs: { 'aria-live': 'polite' },
    }),
    createElement('div', { className: 'ctrlem-db-side-note' }, [
      createElement('span', { text: 'Categories can be dragged to change order.' }),
    ]),
  ]);
}

function createManagerWorkspace(viewModel: any, actions: any): any {
  const activeTab = viewModel.uiState?.activeTab || MANAGER_TABS.EDITOR;

  let panel = createEditorPanel(viewModel, actions);
  if (activeTab === MANAGER_TABS.SETTINGS) panel = createSettingsTools(viewModel, actions);
  if (activeTab === MANAGER_TABS.INFO) panel = createInfoPanel(viewModel);

  return createElement('div', { className: 'ctrlem-db-manager-workspace' }, [panel]);
}

function createEditorPanel(viewModel: any, actions: any): any {
  const activeCategory = viewModel.selectedCategory;
  const nameInput = createElement('input', {
    className: 'ctrlem-db-category-name-input',
    type: 'text',
    value: activeCategory?.name || '',
    attrs: {
      autocomplete: 'off',
      spellcheck: 'false',
    },
  });
  const addButton = createElement('button', {
    className: 'btn btn-sm btn-secondary',
    text: 'Add',
    type: 'button',
  });
  const deleteButton = createElement('button', {
    className: 'btn btn-sm btn-secondary',
    text: 'Delete',
    type: 'button',
  });
  const textarea = createElement('textarea', {
    id: UI_IDS.dbManagerTextarea,
    className: 'ctrlem-db-manager-textarea',
    value: activeCategory?.content || '',
    attrs: {
      wrap: 'off',
      spellcheck: 'false',
    },
  });

  const commitName = () => {
    nameInput.value = actions.renameCategoryTo(nameInput.value);
  };

  nameInput.addEventListener('change', commitName);
  nameInput.addEventListener('blur', commitName);
  nameInput.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commitName();
    nameInput.blur();
  });
  addButton.addEventListener('click', actions.addCategory);
  deleteButton.addEventListener('click', actions.deleteCategory);
  textarea.addEventListener('input', () => {
    actions.updateEditorContent(textarea.value);
  });

  const children = [
    createElement('div', { className: 'ctrlem-db-editor-head' }, [
      nameInput,
      addButton,
      deleteButton,
    ]),
    textarea,
    createEditorHelp(viewModel.activeType),
    createEditorSaveRow(viewModel, actions),
  ];

  return createElement('div', { className: 'ctrlem-db-tab-panel ctrlem-db-editor-panel', attrs: { role: 'tabpanel' } }, children);
}

function createEditorSaveRow(viewModel: any, actions: any): any {
  const autoSaveToggle = createElement('input', {
    type: 'checkbox',
    checked: viewModel.autoSave,
  });
  const saveButton = createElement('button', {
    className: 'btn btn-sm btn-primary',
    text: 'Save',
    type: 'button',
  });

  autoSaveToggle.addEventListener('change', () => actions.setAutoSave(autoSaveToggle.checked));
  saveButton.addEventListener('click', () => actions.save());

  return createElement('div', { className: 'ctrlem-db-editor-save-row' }, [
    createElement('label', { className: 'toggle ctrlem-db-editor-autosave-toggle', title: 'Toggle DB auto-save' }, [
      autoSaveToggle,
      createElement('span', { className: 'toggle-slider' }),
    ]),
    createElement('span', { className: 'text-muted ctrlem-db-autosave-label', text: 'Auto-save' }),
    saveButton,
  ]);
}

function isMediaManagerType(type: string): boolean {
  return type === RecordType.IMAGE || type === RecordType.SOUND || type === RecordType.VIDEO;
}

function createEditorHelp(type: string): any {
  const items = [
    'One item per line.',
  ];
  if (isMediaManagerType(type)) {
    items.push('Media link names can be written after the URL separated by a space.');
  }
  if (type === RecordType.IMAGE) {
    items.push('- (no previews) disables image previews for that category.');
  }

  return createElement('ul', { className: 'ctrlem-db-editor-help' }, items.map((text) => (
    createElement('li', { text })
  )));
}

function formatBrokenLinkResults(items: any[]): string {
  return [...new Set(items
    .map((item) => item.url)
    .filter(Boolean))]
    .join('\n');
}

function formatLinkCheckType(type: string): string {
  if (type === RecordType.IMAGE) return 'Images';
  if (type === RecordType.SOUND) return 'Sounds';
  if (type === RecordType.VIDEO) return 'Videos';
  return '-';
}

function getLinkCheckScopeType(state: any): string {
  return [RecordType.IMAGE, RecordType.SOUND, RecordType.VIDEO].includes(state.scopeType)
    ? state.scopeType
    : RecordType.IMAGE;
}

function createLinkCheckScopeControls(viewModel: any, state: any, actions: any): any {
  const scopeAll = state.scopeAll !== false;
  const scopeType = getLinkCheckScopeType(state);
  const mediaCategories = viewModel.linkCheckCategories || {};
  const categories = Array.isArray(mediaCategories[scopeType]) ? mediaCategories[scopeType] : [];
  const scopeCategoryId = categories.some((category: any) => category.id === state.scopeCategoryId)
    ? state.scopeCategoryId
    : categories[0]?.id || '';

  const allMediaToggle = createElement('input', {
    type: 'checkbox',
    checked: scopeAll,
  });
  const typeSelect = createElement('select', {
    className: 'ctrlem-db-link-check-select',
    value: scopeType,
  }, [RecordType.IMAGE, RecordType.SOUND, RecordType.VIDEO].map((type) => (
    createElement('option', {
      text: formatLinkCheckType(type),
      value: type,
      attrs: { value: type },
    })
  )));
  const categorySelect = createElement('select', {
    className: 'ctrlem-db-link-check-select',
    value: scopeCategoryId,
  }, categories.map((category: any) => (
    createElement('option', {
      text: category.name,
      value: category.id,
      attrs: { value: category.id },
    })
  )));

  typeSelect.value = scopeType;
  categorySelect.value = scopeCategoryId;
  allMediaToggle.disabled = Boolean(state.isBusy);
  typeSelect.disabled = Boolean(state.isBusy);
  categorySelect.disabled = Boolean(state.isBusy);

  allMediaToggle.addEventListener('change', () => actions.setLinkCheckScope({ scopeAll: allMediaToggle.checked }));
  typeSelect.addEventListener('change', () => actions.setLinkCheckScope({ scopeType: typeSelect.value }));
  categorySelect.addEventListener('change', () => actions.setLinkCheckScope({ scopeCategoryId: categorySelect.value }));

  const children = [
    createElement('label', { className: 'ctrlem-db-settings-check ctrlem-db-link-check-all-toggle' }, [
      allMediaToggle,
      createElement('span', { text: 'All media' }),
    ]),
  ];

  if (!scopeAll) {
    children.push(
      createElement('label', { className: 'ctrlem-db-link-check-field' }, [
        createElement('span', { text: 'Type' }),
        typeSelect,
      ]),
      createElement('label', { className: 'ctrlem-db-link-check-field' }, [
        createElement('span', { text: 'Category' }),
        categorySelect,
      ]),
    );
  }

  return createElement('div', { className: 'ctrlem-db-link-check-scope' }, children);
}

function createBrokenLinkTools(viewModel: any, actions: any): any {
  const state = viewModel.linkCheck || {};
  const broken = Array.isArray(state.broken) ? state.broken : [];
  const status = createElement('div', {
    className: 'ctrlem-db-link-check-status',
    text: state.statusMessage || 'No check results yet.',
    attrs: { 'aria-live': 'polite' },
  });
  status.dataset.level = state.statusLevel || 'info';

  const checkButton = createElement('button', {
    className: 'btn btn-sm btn-secondary',
    text: state.isBusy ? 'Checking...' : 'Check broken links',
    type: 'button',
  });
  const removeButton = createElement('button', {
    className: 'btn btn-sm btn-secondary',
    text: 'Remove broken',
    type: 'button',
  });
  const resultTextarea = createElement('textarea', {
    className: 'ctrlem-db-link-check-results',
    value: formatBrokenLinkResults(broken),
    attrs: {
      readonly: '',
      rows: '4',
      placeholder: 'Broken links will appear here',
      spellcheck: 'false',
    },
  });

  const currentCategory = state.currentCategoryName
    ? `${formatLinkCheckType(state.currentType)} / ${state.currentCategoryName}`
    : '-';
  const currentUrl = state.currentUrl || '-';

  checkButton.disabled = Boolean(state.isBusy);
  removeButton.disabled = Boolean(state.isBusy || broken.length === 0);

  checkButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    actions.checkBrokenLinks();
  });
  removeButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    actions.removeBrokenLinks();
  });

  return createElement('div', { className: 'ctrlem-db-link-check-tools' }, [
    createElement('div', { className: 'ctrlem-db-settings-title', text: 'Check broken links' }),
    createElement('div', {
      className: 'ctrlem-db-link-check-copy',
      text: 'Checking many links can take some time. You can check all media or a specific category.',
    }),
    createLinkCheckScopeControls(viewModel, state, actions),
    createElement('div', { className: 'ctrlem-db-link-check-actions' }, [
      checkButton,
      removeButton,
      status,
    ]),
    createElement('div', { className: 'ctrlem-db-link-check-progress' }, [
      createElement('div', { className: 'ctrlem-db-link-check-row' }, [
        createElement('span', { text: 'Checked links' }),
        createElement('strong', { text: `${Number(state.checked || 0)}/${Number(state.total || 0)}` }),
      ]),
      createElement('div', { className: 'ctrlem-db-link-check-row' }, [
        createElement('span', { text: 'Broken' }),
        createElement('strong', { text: String(Number(state.brokenCount || 0)) }),
      ]),
      createElement('div', { className: 'ctrlem-db-link-check-row' }, [
        createElement('span', { text: 'Category' }),
        createElement('strong', { text: currentCategory }),
      ]),
      createElement('div', { className: 'ctrlem-db-link-check-row ctrlem-db-link-check-row-url' }, [
        createElement('span', { text: 'Current link' }),
        createElement('strong', { text: currentUrl, title: currentUrl }),
      ]),
    ]),
    resultTextarea,
  ]);
}

function createInfoPanel(viewModel: any): any {
  const profileTitle = String(viewModel.profileTitle || '').trim();
  const children = [
    createElement('div', { className: 'ctrlem-db-settings-title', text: 'CtrlEm DB userscript' }),
  ];
  if (profileTitle) {
    children.push(createElement('p', {
      className: 'ctrlem-db-info-copy',
      text: `Profile: ${profileTitle}`,
    }));
  }
  children.push(
    createElement('p', {
      className: 'ctrlem-db-info-copy',
      text: 'A local database manager for CtrlEm command inputs, picker rows, media links, uploads, and auto-send workflows.',
    }),
    createElement('ul', { className: 'ctrlem-db-info-list' }, [
      createElement('li', { text: 'Stores reusable links, text, images, sounds, and videos by category.' }),
      createElement('li', { text: 'Adds picker controls beside supported CtrlEm inputs.' }),
      createElement('li', { text: 'Supports import, export, defaults restore, and media upload helpers.' }),
      createElement('li', { text: 'Can cycle visible category items with auto-send controls.' }),
    ]),
  );

  return createElement('div', { className: 'ctrlem-db-tab-panel ctrlem-db-info-panel', attrs: { role: 'tabpanel' } }, [
    createElement('div', { className: 'ctrlem-db-settings-section' }, children),
  ]);
}

function createSettingsTools(viewModel: any, actions: any): any {
  const importAllInput = createElement('input', {
    id: UI_IDS.dbManagerImportAll,
    type: 'file',
    attrs: {
      accept: '.json,application/json',
      hidden: '',
    },
  });

  importAllInput.addEventListener('change', () => {
    actions.importAllCategories(importAllInput.files?.[0]);
    importAllInput.value = '';
  });

  const exportAllButton = createElement('button', {
    className: 'btn btn-sm btn-secondary',
    text: 'Export all (json)',
    type: 'button',
  });
  const importAllButton = createElement('button', {
    className: 'btn btn-sm btn-secondary',
    text: 'Import all (json)',
    type: 'button',
  });
  const restoreDefaultsButton = createElement('button', {
    className: 'btn btn-sm btn-secondary',
    text: 'Restore Defaults',
    type: 'button',
  });

  exportAllButton.addEventListener('click', actions.exportAll);
  importAllButton.addEventListener('click', () => importAllInput.click());
  restoreDefaultsButton.addEventListener('click', actions.restoreDefaults);

  const imgbbApiKey = createElement('input', {
    className: 'ctrlem-db-settings-input',
    type: 'password',
    value: viewModel.uploaderSettings?.imgbbApiKey || '',
    attrs: {
      placeholder: 'ImgBB API key',
      autocomplete: 'off',
    },
  });
  const catboxUserhash = createElement('input', {
    className: 'ctrlem-db-settings-input',
    type: 'password',
    value: viewModel.uploaderSettings?.catboxUserhash || '',
    attrs: {
      placeholder: 'Catbox userhash',
      autocomplete: 'off',
    },
  });
  const hideCtrlEmUploader = createElement('input', {
    type: 'checkbox',
    checked: viewModel.uploaderSettings?.hideCtrlEmUploader === true,
  });
  const autoDownloadSendOrDeleteImages = createElement('input', {
    type: 'checkbox',
    checked: viewModel.uploaderSettings?.autoDownloadSendOrDeleteImages !== false,
  });
  imgbbApiKey.addEventListener('input', () => actions.setUploaderSetting('imgbbApiKey', imgbbApiKey.value));
  catboxUserhash.addEventListener('input', () => actions.setUploaderSetting('catboxUserhash', catboxUserhash.value));
  hideCtrlEmUploader.addEventListener('change', () => actions.setUploaderSetting('hideCtrlEmUploader', hideCtrlEmUploader.checked));
  autoDownloadSendOrDeleteImages.addEventListener('change', () => {
    actions.setUploaderSetting('autoDownloadSendOrDeleteImages', autoDownloadSendOrDeleteImages.checked);
  });

  return createElement('div', { className: 'ctrlem-db-tab-panel ctrlem-db-settings-panel', attrs: { role: 'tabpanel' } }, [
    createElement('div', { className: 'ctrlem-db-settings-section' }, [
      createElement('div', { className: 'ctrlem-db-settings-title', text: 'Uploader settings' }),
      createElement('label', { className: 'ctrlem-db-settings-field' }, [
        createElement('span', { text: 'ImgBB API key' }),
        imgbbApiKey,
      ]),
      createElement('label', { className: 'ctrlem-db-settings-field' }, [
        createElement('span', { text: 'Catbox userhash (optional)' }),
        catboxUserhash,
      ]),
      createElement('label', { className: 'ctrlem-db-settings-field ctrlem-db-settings-check' }, [
        hideCtrlEmUploader,
        createElement('span', { text: 'Hide CtrlEm uploader box' }),
      ]),
      createElement('label', { className: 'ctrlem-db-settings-field ctrlem-db-settings-check' }, [
        autoDownloadSendOrDeleteImages,
        createElement('span', { text: 'Auto-download Send or Delete images' }),
      ]),
    ]),
    createElement('div', { className: 'ctrlem-db-settings-section' }, [
      createBrokenLinkTools(viewModel, actions),
    ]),
    createElement('div', { className: 'ctrlem-db-settings-section ctrlem-db-database-section' }, [
      createElement('div', { className: 'ctrlem-db-settings-title', text: 'Database' }),
      createElement('div', { className: 'ctrlem-db-import-actions' }, [
        exportAllButton,
        importAllButton,
        restoreDefaultsButton,
        importAllInput,
      ]),
    ]),
  ]);
}
