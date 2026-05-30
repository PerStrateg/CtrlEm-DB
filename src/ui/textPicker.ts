import { getLineItem } from '../domain/content';
import { RecordType, UI_IDS, USER_CONFIG } from '../domain/constants';
import { createElement } from './dom';

export function getTextPickerId(commandKey: string): string {
  return `${UI_IDS.textPrefix}-${commandKey}`;
}

export function createTextPicker(options: any): any {
  const {
    config,
    input,
    categories,
    uiState = {},
    onSelect,
    onPreview,
    onCategoryChange,
    onUiStateChange,
    onAddCategory,
    onRenameCategory,
  } = options;
  const pickerId = getTextPickerId(config.key);

  if (categories.length === 0) {
    return createElement('div', {
      id: pickerId,
      className: 'ctrlem-db-empty',
      text: config.emptyText,
    });
  }

  const list = createElement('div', {
    id: pickerId,
    className: 'ctrlem-db-phrase-list ctrlem-db-text-picker',
    attrs: { 'aria-label': config.label },
    dataset: {
      command: config.key,
      type: config.type,
    },
  });
  const select = createElement('select', {
    id: `${pickerId}-category`,
    className: 'form-select ctrlem-db-text-select',
  });
  const rows = createElement('div', {
    className: 'ctrlem-db-rows',
    attrs: { role: 'list' },
  });
  const selectedValue = String(uiState.value || input.value || '').trim();
  const selectedIndex = Number(uiState.itemIndex);
  const hasSelectedIndex = Number.isFinite(selectedIndex) && selectedIndex >= 0;

  categories.forEach((category, categoryIndex) => {
    select.appendChild(createElement('option', {
      text: `${category.name} (${category.items.length})`,
      attrs: { value: String(categoryIndex) },
    }));
  });

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

  addButton.addEventListener('click', () => onAddCategory?.());
  renameButton.addEventListener('click', () => {
    const category = categories[Number(select.value) || 0];
    if (category?.id) onRenameCategory?.(category.id);
  });

  list.appendChild(createElement('div', { className: 'ctrlem-db-text-toolbar ctrlem-db-category-toolbar' }, [
    select,
    addButton,
    renameButton,
  ]));
  list.appendChild(rows);

  const getCategoryIndex = () => {
    const byId = categories.findIndex((category: any) => category.id && category.id === uiState.categoryId);
    if (byId >= 0) return byId;

    const byName = categories.findIndex((category: any) => category.name === uiState.categoryName);
    if (byName >= 0) return byName;

    const byValue = categories.findIndex((category: any) => category.items.some((line: string) => {
      const item = getLineItem(config.type, line);
      return item?.value === selectedValue;
    }));
    return byValue >= 0 ? byValue : 0;
  };

  const renderCategory = (categoryIndex: number) => {
    const category = categories[categoryIndex];
    rows.replaceChildren();
    list.dataset.categoryIndex = String(categoryIndex);
    list.dataset.categoryId = category?.id || '';
    list.dataset.category = category?.name || '';

    if (!category || category.items.length === 0) {
      rows.appendChild(createElement('div', {
        className: 'ctrlem-db-empty',
        text: config.emptyText,
      }));
      return;
    }

    category.items.forEach((line: string, itemIndex: number) => {
      const item = getLineItem(config.type, line);
      if (!item) return;
      const hasPreview = Boolean(onPreview && (config.type === RecordType.SOUND || config.type === RecordType.VIDEO));

      const button = createElement(hasPreview ? 'div' : 'button', {
        className: `ctrlem-db-row${hasPreview ? ' has-preview' : ''}`,
        title: item.title,
        type: hasPreview ? undefined : 'button',
        attrs: hasPreview ? { role: 'button', tabindex: '0' } : { role: 'listitem' },
        dataset: {
          command: config.key,
          type: config.type,
          value: item.value,
          label: item.label || '',
          index: String(itemIndex),
          categoryId: category.id || '',
          category: category.name,
        },
      }, [
        createElement('span', { className: 'ctrlem-db-row-label', text: item.display }),
      ]);
      if (hasPreview) {
        button.appendChild(createElement('button', {
          className: 'ctrlem-db-row-preview',
          text: 'Preview',
          title: `Preview ${item.display}`,
          type: 'button',
        }));
      }
      if (selectedValue && item.value === selectedValue && (!hasSelectedIndex || selectedIndex === itemIndex)) {
        button.classList.add('is-selected');
      }
      rows.appendChild(button);
    });

    if (!rows.querySelector('.ctrlem-db-row')) {
      rows.appendChild(createElement('div', {
        className: 'ctrlem-db-empty',
        text: config.emptyText,
      }));
    }
  };

  select.addEventListener('change', () => {
    const categoryIndex = Number(select.value) || 0;
    renderCategory(categoryIndex);
    rows.scrollTop = 0;
    const category = categories[categoryIndex];
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

  let scrollTimer = 0;
  rows.addEventListener('scroll', () => {
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      onUiStateChange?.({ scrollTop: rows.scrollTop });
    }, USER_CONFIG.ui.scrollSaveDelayMs);
  });

  list.addEventListener('click', (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;

    const previewButton = event.target.closest('.ctrlem-db-row-preview');
    if (previewButton && list.contains(previewButton)) {
      const button = previewButton.closest('.ctrlem-db-row');
      if (button) onPreview?.({ input, list, button });
      return;
    }

    const button = event.target.closest('.ctrlem-db-row');
    if (!button || !list.contains(button)) return;
    onSelect({ input, list, button });
  });
  list.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('.ctrlem-db-row-preview')) return;

    const button = event.target.closest('.ctrlem-db-row');
    if (!button || !list.contains(button)) return;
    if (!button.classList.contains('has-preview')) return;
    event.preventDefault();
    onSelect({ input, list, button });
  });

  const initialCategoryIndex = getCategoryIndex();
  select.value = String(initialCategoryIndex);
  renderCategory(initialCategoryIndex);
  window.setTimeout(() => {
    rows.scrollTop = Math.max(0, Number(uiState.scrollTop) || 0);
  }, 0);
  return list;
}
