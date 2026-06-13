import { getImagePreviewMaxItems, IMAGE_PLACEHOLDER_URL, RecordType, UI_IDS, USER_CONFIG } from '../domain/constants';
import { createElement } from './dom';

export function getMediaPickerId(commandKey: string): string {
  return `${UI_IDS.mediaPrefix}-${commandKey}`;
}

export function updateMediaPicker(picker: any, options: any): boolean {
  return typeof picker?.ctrlemDbRefresh === 'function'
    ? picker.ctrlemDbRefresh(options)
    : false;
}

export function createMediaPicker(options: any): any {
  const {
    config,
    categories,
    input,
    uiState = {},
    onSelect,
    onDelete,
    onCategoryChange,
    onUiStateChange,
    onAddCategory,
    onRenameCategory,
    onPreviewToggle,
    setImagePreviewSource,
  } = options;
  const picker = createElement('div', {
    id: getMediaPickerId(config.key),
    className: 'ctrlem-db-media-picker',
    attrs: { 'aria-label': `${config.key} DB picker` },
    dataset: {
      command: config.key,
      type: config.type,
    },
  });
  const state: any = {
    categories,
    input,
    uiState,
    selectedValue: '',
    selectedIndex: -1,
    hasSelectedIndex: false,
  };

  if (categories.length === 0) {
    picker.appendChild(createElement('div', {
      className: 'ctrlem-db-empty',
      text: 'No media configured',
    }));
    return picker;
  }

  const select = createElement('select', {
    id: `${getMediaPickerId(config.key)}-category`,
    className: 'form-select ctrlem-db-media-select',
  });
  const grid = createElement('div', {
    className: 'ctrlem-db-media-grid',
    attrs: { role: 'list' },
  });

  const syncSelection = () => {
    state.selectedValue = String(state.uiState?.value || state.input.value || '').trim();
    state.selectedIndex = Number(state.uiState?.itemIndex);
    state.hasSelectedIndex = Number.isFinite(state.selectedIndex) && state.selectedIndex >= 0;
  };

  const populateSelect = () => {
    select.replaceChildren(...state.categories.map((category: any, index: number) => createElement('option', {
      text: `${category.name} (${category.items.length})`,
      attrs: { value: String(index) },
    })));
  };

  const addButton = createElement('button', {
    className: 'ctrlem-db-category-tool-button',
    text: '+',
    title: 'Add category',
    type: 'button',
    attrs: { 'aria-label': 'Add category' },
  });
  const renameButton = createElement('button', {
    className: 'ctrlem-db-category-tool-button',
    text: '✎',
    title: 'Edit category',
    type: 'button',
    attrs: { 'aria-label': 'Edit category' },
  });
  const previewToggle = createElement('input', {
    className: 'ctrlem-db-preview-toggle-input',
    type: 'checkbox',
    checked: true,
    attrs: { 'aria-label': '' },
  });
  const previewControl = createElement('label', {
    className: 'ctrlem-db-preview-toggle',
    title: 'Show previews',
    dataset: { tooltip: 'Show previews' },
  }, [
    previewToggle,
    createElement('span', { text: '' }),
  ]);
  const toolbarChildren = config.type === RecordType.IMAGE
    ? [select, previewControl, addButton, renameButton]
    : [select, addButton, renameButton];

  addButton.addEventListener('click', () => onAddCategory?.());
  renameButton.addEventListener('click', () => {
    const category = state.categories[Number(select.value) || 0];
    if (category?.id && category.id !== 'default') onRenameCategory?.(category.id);
  });
  previewToggle.addEventListener('change', () => {
    const categoryIndex = Number(select.value) || 0;
    const category = state.categories[categoryIndex];
    if (!category?.id || category.id === 'default' || category.items.length > getImagePreviewMaxItems()) return;
    category.disablePreviews = !previewToggle.checked;
    renderMediaCategory(categoryIndex);
    onPreviewToggle?.(category.id, previewToggle.checked);
  });

  picker.appendChild(createElement('div', { className: 'ctrlem-db-media-toolbar ctrlem-db-category-toolbar' }, toolbarChildren));
  picker.appendChild(grid);

  const getCategoryIndex = () => {
    const byId = state.categories.findIndex((category: any) => (
      category.id && category.id === state.uiState?.categoryId
    ));
    if (byId >= 0) return byId;

    const byName = state.categories.findIndex((category: any) => category.name === state.uiState?.categoryName);
    if (byName >= 0) return byName;

    const byValue = state.categories.findIndex((category: any) => (
      category.items.some((item: any) => item?.url === state.selectedValue)
    ));
    return byValue >= 0 ? byValue : 0;
  };

  const renderMediaCategory = (categoryIndex: number, renderOptions: any = {}) => {
    syncSelection();
    const category = state.categories[categoryIndex];
    const scrollTop = renderOptions.scrollTop;
    picker.dataset.categoryId = category?.id || '';
    picker.dataset.category = category?.name || '';
    renameButton.disabled = Boolean(!category || category.id === 'default');
    if (config.type === RecordType.IMAGE) {
      const isTooLarge = Boolean(category && category.items.length > getImagePreviewMaxItems());
      previewToggle.checked = Boolean(category && !category.disablePreviews && !isTooLarge);
      previewToggle.disabled = Boolean(!category || category.id === 'default' || isTooLarge);
      previewControl.title = isTooLarge ? `Disabled: ${getImagePreviewMaxItems()}+ files` : 'Show previews';
      previewControl.dataset.tooltip = previewControl.title;
    }

    if (!category || category.items.length === 0) {
      grid.replaceChildren(createElement('div', {
        className: 'ctrlem-db-empty',
        text: 'No media in this category',
      }));
      if (scrollTop !== undefined) grid.scrollTop = Math.max(0, Number(scrollTop) || 0);
      return;
    }

    const reusableTiles = new Map(
      (Array.from(grid.querySelectorAll('.ctrlem-db-media-tile')) as any[])
        .map((tile) => [tile.dataset.itemKey, tile]),
    );
    const tiles = category.items.map((item: any, itemIndex: number) => {
      const tileOptions = {
        item,
        itemIndex,
        config,
        category,
        input: state.input,
        selectedValue: state.selectedValue,
        selectedIndex: state.selectedIndex,
        hasSelectedIndex: state.hasSelectedIndex,
        onDelete,
        setImagePreviewSource,
      };
      const reusableTile = reusableTiles.get(getImageTileKey(category, item, itemIndex));

      if (canReuseImageTile(reusableTile, category, item)) {
        updateImageTile(reusableTile, tileOptions);
        return reusableTile;
      }

      return createImageTile(tileOptions);
    });
    grid.replaceChildren(...tiles);
    if (scrollTop !== undefined) grid.scrollTop = Math.max(0, Number(scrollTop) || 0);
  };

  select.addEventListener('change', () => {
    const categoryIndex = Number(select.value) || 0;
    renderMediaCategory(categoryIndex);
    grid.scrollTop = 0;
    const category = state.categories[categoryIndex];
    onUiStateChange?.({
      categoryId: category?.id || '',
      categoryName: category?.name || '',
      itemIndex: -1,
      scrollTop: 0,
    });
    onCategoryChange?.({
      command: config.key,
      type: config.type,
      category: category?.name,
    });
  });

  picker.ctrlemDbRefresh = (nextOptions: any = {}) => {
    const nextCategories = Array.isArray(nextOptions.categories) ? nextOptions.categories : [];
    if (!canReconcileCategoryStructure(state.categories) || !canReconcileCategoryStructure(nextCategories)) {
      return false;
    }
    if (nextOptions.input && nextOptions.input !== state.input) return false;

    const scrollTop = grid.scrollTop;
    state.categories = nextCategories;
    state.uiState = nextOptions.uiState || {};
    syncSelection();
    populateSelect();
    const categoryIndex = getCategoryIndex();
    select.value = String(categoryIndex);
    renderMediaCategory(categoryIndex, { scrollTop });
    return true;
  };

  let scrollTimer = 0;
  grid.addEventListener('scroll', () => {
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      onUiStateChange?.({ scrollTop: grid.scrollTop });
    }, USER_CONFIG.ui.scrollSaveDelayMs);
  });

  grid.addEventListener('click', (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;

    const button = event.target.closest('.ctrlem-db-media-tile');
    if (!button || !grid.contains(button)) return;
    onSelect({ input: state.input, picker, button });
  });
  grid.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('.ctrlem-db-media-delete')) return;

    const button = event.target.closest('.ctrlem-db-media-tile');
    if (!button || !grid.contains(button)) return;
    event.preventDefault();
    onSelect({ input: state.input, picker, button });
  });

  populateSelect();
  syncSelection();
  const initialCategoryIndex = getCategoryIndex();
  select.value = String(initialCategoryIndex);
  renderMediaCategory(initialCategoryIndex);
  window.setTimeout(() => {
    grid.scrollTop = Math.max(0, Number(state.uiState?.scrollTop) || 0);
  }, 0);
  return picker;
}

function getCategoryKey(category: any): string {
  return String(category?.id || category?.name || '').trim();
}

function canReconcileCategoryStructure(categories: any[]): boolean {
  if (!Array.isArray(categories) || categories.length === 0) return false;
  const keys = categories.map((category) => getCategoryKey(category));
  return keys.every(Boolean) && new Set(keys).size === keys.length;
}

function getImageTileKey(category: any, item: any, itemIndex: number): string {
  return `${getCategoryKey(category)}|${item?.url || ''}|${itemIndex}`;
}

function shouldRenderImagePreview(category: any): boolean {
  return !category.disablePreviews && category.items.length <= getImagePreviewMaxItems();
}

function canReuseImageTile(tile: any, category: any, item: any): boolean {
  if (!tile) return false;
  if (tile.dataset.previewEnabled !== String(shouldRenderImagePreview(category))) return false;
  if (tile.dataset.canDelete === 'true') return false;
  return tile.dataset.url === item.url;
}

function createImageTile(options: any): any {
  const {
    item,
    itemIndex,
    config,
    category,
    input,
    selectedValue,
    selectedIndex,
    hasSelectedIndex,
    onDelete,
    setImagePreviewSource,
  } = options;
  const shouldRenderPreview = shouldRenderImagePreview(category);
  const itemKey = getImageTileKey(category, item, itemIndex);
  const previewSource = item.previewUrl || item.url;
  const canDelete = Boolean(category.isDefault && item.canDelete);
  const children = shouldRenderPreview
    ? [
      createElement('img', {
        className: 'ctrlem-db-media-img',
        attrs: {
          src: IMAGE_PLACEHOLDER_URL,
          alt: item.title,
          loading: 'lazy',
          referrerpolicy: 'no-referrer',
        },
      }),
    ]
    : [
      createElement('span', {
        className: 'ctrlem-db-media-url-label',
        text: item.title || item.url,
      }),
    ];

  if (canDelete) {
    children.push(createElement('button', {
      className: 'ctrlem-db-media-delete',
      text: 'x',
      title: 'Delete image',
      type: 'button',
      attrs: { 'aria-label': 'Delete image' },
    }));
  }

  const tile = createElement('div', {
    className: `ctrlem-db-media-tile ctrlem-db-media-tile-image${shouldRenderPreview ? '' : ' no-preview'}${canDelete ? ' has-delete' : ''}`,
    title: item.title,
    attrs: {
      role: 'button',
      tabindex: '0',
      'aria-label': item.title,
    },
    dataset: {
      command: config.key,
      type: config.type,
      categoryId: category.id || '',
      category: category.name,
      source: category.isDefault ? 'default' : 'saved',
      url: item.url,
      index: String(itemIndex),
      itemKey,
      previewEnabled: String(shouldRenderPreview),
      previewSource,
      loadedPreviewSource: previewSource,
      canDelete: String(canDelete),
    },
  }, children);

  tile.querySelector('.ctrlem-db-media-delete')?.addEventListener('click', (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onDelete({ item, tile });
  });

  if ((selectedValue || input.value.trim()) === item.url && (!hasSelectedIndex || selectedIndex === itemIndex)) {
    tile.classList.add('is-selected');
  }
  const image = tile.querySelector('.ctrlem-db-media-img');
  if (image) setImagePreviewSource(image, previewSource, item.url);
  return tile;
}

function updateImageTile(tile: any, options: any): void {
  const {
    item,
    itemIndex,
    config,
    category,
    input,
    selectedValue,
    selectedIndex,
    hasSelectedIndex,
    setImagePreviewSource,
  } = options;
  const shouldRenderPreview = shouldRenderImagePreview(category);
  const previewSource = item.previewUrl || item.url;

  tile.title = item.title;
  tile.setAttribute('aria-label', item.title);
  tile.dataset.command = config.key;
  tile.dataset.type = config.type;
  tile.dataset.categoryId = category.id || '';
  tile.dataset.category = category.name;
  tile.dataset.source = category.isDefault ? 'default' : 'saved';
  tile.dataset.url = item.url;
  tile.dataset.index = String(itemIndex);
  tile.dataset.itemKey = getImageTileKey(category, item, itemIndex);
  tile.dataset.previewEnabled = String(shouldRenderPreview);
  tile.dataset.previewSource = previewSource;
  tile.dataset.canDelete = 'false';
  tile.classList.toggle(
    'is-selected',
    (selectedValue || input.value.trim()) === item.url && (!hasSelectedIndex || selectedIndex === itemIndex),
  );

  const image = tile.querySelector('.ctrlem-db-media-img');
  if (image) {
    image.alt = item.title;
    if (tile.dataset.loadedPreviewSource !== previewSource) {
      setImagePreviewSource(image, previewSource, item.url);
      tile.dataset.loadedPreviewSource = previewSource;
    }
    return;
  }

  const label = tile.querySelector('.ctrlem-db-media-url-label');
  if (label) label.textContent = item.title || item.url;
}
