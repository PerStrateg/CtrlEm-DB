import {
  INPUT_CATEGORY_NAME,
  RecordType,
  STATE_VERSION,
  TYPE_LABELS,
  TYPE_ORDER,
} from './constants';
import { readDefaultDb } from './defaultDb';
import {
  clampAutoSendInterval,
  clampMinimumRequestInterval,
  createId,
  formatCategoryContent,
  getCategoryNameFromFileName,
  getCategoryDataLines,
  getLineItem,
  hasNoPreviewsMarker,
  normalizeMediaItem,
  normalizeType,
  parseLabeledUrlLine,
  parseLines,
} from './content';

export function createEmptyCategory(type: string): any {
  return {
    id: createId(type),
    name: 'Untitled',
    content: '',
  };
}

export function createSeedState(): any {
  const defaultDb: any = readDefaultDb();
  const types = (TYPE_ORDER as readonly string[]).reduce((result: any, type) => {
    const sourceCategories = Array.isArray(defaultDb.types?.[type])
      ? defaultDb.types[type]
      : [];

    result[type] = sourceCategories.map((category: any) => ({
      id: createId(type),
      name: String(category?.name || 'Untitled').trim() || 'Untitled',
      content: formatCategoryContent(category?.content),
    }));
    if (result[type].length === 0) {
      result[type].push(createEmptyCategory(type));
    }
    return result;
  }, {});

  return {
    version: STATE_VERSION,
    activeType: RecordType.LINKS,
    autoSave: true,
    autoSendIntervalSeconds: clampAutoSendInterval(defaultDb.autoSendIntervalSeconds),
    minimumRequestIntervalSeconds: clampMinimumRequestInterval(defaultDb.minimumRequestIntervalSeconds),
    types,
  };
}

export function normalizeCategory(category: any, type: string): any {
  return {
    id: String(category?.id || createId(type)),
    name: String(category?.name || 'Untitled').trim() || 'Untitled',
    content: formatCategoryContent(category?.content),
  };
}

export function normalizeDbState(rawState: any): any {
  const seed = createSeedState();
  const source = rawState && typeof rawState === 'object' ? rawState : {};
  const normalized: any = {
    version: STATE_VERSION,
    activeType: source.activeType ? normalizeType(source.activeType) : RecordType.LINKS,
    autoSave: source.autoSave !== false,
    autoSendIntervalSeconds: clampAutoSendInterval(source.autoSendIntervalSeconds),
    minimumRequestIntervalSeconds: clampMinimumRequestInterval(source.minimumRequestIntervalSeconds),
    types: {},
  };

  (TYPE_ORDER as readonly string[]).forEach((type) => {
    const rawCategories = Array.isArray(source.types?.[type]) ? source.types[type] : seed.types[type];
    normalized.types[type] = rawCategories.map((category: any) => normalizeCategory(category, type));
    if (normalized.types[type].length === 0) {
      normalized.types[type].push(createEmptyCategory(type));
    }
  });

  return normalized;
}

export function resetManagerSelections(state: any, selection: any): void {
  (TYPE_ORDER as readonly string[]).forEach((type) => {
    selection.selectedCategoryByType[type] = state.types[type][0]?.id || null;
  });
}

export function getUserCategories(state: any, type: string): any[] {
  const normalizedType = normalizeType(type);
  if (!Array.isArray(state.types[normalizedType])) state.types[normalizedType] = [];
  if (state.types[normalizedType].length === 0) {
    state.types[normalizedType].push(createEmptyCategory(normalizedType));
  }
  return state.types[normalizedType];
}

export function normalizeAllCategoryContent(state: any): void {
  (TYPE_ORDER as readonly string[]).forEach((type) => {
    const categories = Array.isArray(state?.types?.[type]) ? state.types[type] : [];
    categories.forEach((category: any) => {
      category.content = formatCategoryContent(category.content);
    });
  });
}

export function getSelectedCategory(state: any, selection: any, type: string): any {
  const categories = getUserCategories(state, type);
  const selectedId = selection.selectedCategoryByType[type];
  let category = categories.find((item) => item.id === selectedId);

  if (!category) {
    category = categories[0];
    selection.selectedCategoryByType[type] = category?.id || null;
  }

  return category || null;
}

export function getCategories(state: any, type: string): any[] {
  return getUserCategories(state, type)
    .map((category) => ({
      id: category.id,
      name: category.name,
      content: category.content,
      items: parseLines(category.content),
    }));
}

export function getDatabaseSummary(state: any): any {
  return (TYPE_ORDER as readonly string[]).reduce((summary: any, type) => {
    const categories = getUserCategories(state, type);
    summary[type] = {
      categories: categories.length,
      items: categories.reduce((count, category) => count + parseLines(category.content).length, 0),
    };
    return summary;
  }, {});
}

export function getStaticMediaCategories(state: any, type: string): any[] {
  return getUserCategories(state, type)
    .map((category) => ({
      id: category.id,
      name: category.name,
      disablePreviews: type === RecordType.IMAGE && hasNoPreviewsMarker(category.content),
      items: getCategoryDataLines(category.content)
        .map((url) => normalizeMediaItem(url))
        .filter(Boolean),
    }));
}

export function getRecordKey(type: string, value: unknown): string {
  const trimmed = String(value || '').trim();
  if (type === RecordType.VIDEO || type === RecordType.SOUND) {
    return parseLabeledUrlLine(trimmed)?.url || '';
  }
  return trimmed;
}

export function hasStoredValue(state: any, type: string, value: unknown): boolean {
  const key = getRecordKey(type, value);
  if (!key) return true;

  return getUserCategories(state, type).some((category) => (
    parseLines(category.content).some((line) => getRecordKey(type, line) === key)
  ));
}

export function getOrCreateInputCategory(state: any, type: string): any {
  const categories = getUserCategories(state, type);
  let category = categories.find((item) => item.name.toLowerCase() === INPUT_CATEGORY_NAME.toLowerCase());

  if (!category) {
    category = {
      id: createId(type),
      name: INPUT_CATEGORY_NAME,
      content: '',
    };
    categories.push(category);
  }

  return category;
}

export function appendInputValue(state: any, selection: any, type: string, value: unknown): any {
  const category = getOrCreateInputCategory(state, type);
  const lines = parseLines(category.content);
  const line = String(value || '').trim();
  const key = getRecordKey(type, line);
  if (key && !lines.some((item) => getRecordKey(type, item) === key)) {
    lines.push(line);
    category.content = formatCategoryContent(lines.join('\n'));
  }
  selection.selectedCategoryByType[type] ||= category.id;
  return category;
}

export function makeUniqueCategoryName(state: any, type: string, name: string, ignoreId = ''): string {
  const base = String(name || 'Untitled').trim() || 'Untitled';
  const names = new Set(getUserCategories(state, type)
    .filter((category) => category.id !== ignoreId)
    .map((category) => category.name));

  if (!names.has(base)) return base;

  let index = 2;
  let candidate = `${base} (${index})`;
  while (names.has(candidate)) {
    index += 1;
    candidate = `${base} (${index})`;
  }
  return candidate;
}

export function createExportPayload(state: any): any {
  return {
    version: STATE_VERSION,
    exportedAt: new Date().toISOString(),
    autoSendIntervalSeconds: clampAutoSendInterval(state.autoSendIntervalSeconds),
    minimumRequestIntervalSeconds: clampMinimumRequestInterval(state.minimumRequestIntervalSeconds),
    types: (TYPE_ORDER as readonly string[]).reduce((result: any, type) => {
      result[type] = getUserCategories(state, type).map((category) => ({
        name: category.name,
        content: formatCategoryContent(category.content),
      }));
      return result;
    }, {}),
  };
}

export function parseImportFile(file: File, text: string, activeType: string, log: any): any[] {
  const nameFromFile = getCategoryNameFromFileName(file.name);
  const isJson = file.name.toLowerCase().endsWith('.json');

  if (!isJson) {
    return [{
      type: activeType,
      name: nameFromFile,
      content: text,
    }];
  }

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (error: any) {
    log('error', 'Invalid JSON import', { name: file.name, message: error?.message || String(error) });
    return [];
  }

  const additions: any[] = [];
  const pushCategory = (type: string, category: any, fallbackName: string) => {
    if (!category || typeof category !== 'object') return;
    const content = category.content !== undefined
      ? category.content
      : (Array.isArray(category.items) ? category.items.join('\n') : '');
    additions.push({
      type,
      name: String(category.name || fallbackName || 'Imported').trim() || 'Imported',
      content: String(content || ''),
    });
  };

  if (Array.isArray(parsed)) {
    parsed.forEach((category, index) => {
      pushCategory(category?.type || activeType, category, `${nameFromFile}-${index + 1}`);
    });
    return additions;
  }

  if (parsed?.types && typeof parsed.types === 'object') {
    (TYPE_ORDER as readonly string[]).forEach((type) => {
      const categories = Array.isArray(parsed.types[type]) ? parsed.types[type] : [];
      categories.forEach((category, index) => pushCategory(type, category, `${TYPE_LABELS[type]}-${index + 1}`));
    });
    return additions;
  }

  if (parsed?.name || parsed?.content) {
    pushCategory(parsed.type || activeType, parsed, nameFromFile);
    return additions;
  }

  log('warn', 'JSON import did not contain categories', { name: file.name });
  return additions;
}

export function lineItemsForCategory(type: string, category: any): any[] {
  return parseLines(category.content)
    .map((line) => getLineItem(type, line))
    .filter(Boolean);
}
