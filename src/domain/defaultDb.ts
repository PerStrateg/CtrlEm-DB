import defaultDbJson from './defaultDb.json?raw';

const EMPTY_DEFAULT_DB = Object.freeze({
  types: Object.freeze({}),
});

export function readDefaultDb(): any {
  try {
    const parsed = JSON.parse(defaultDbJson);
    return parsed && typeof parsed === 'object' ? parsed : EMPTY_DEFAULT_DB;
  } catch {
    return EMPTY_DEFAULT_DB;
  }
}
