import {
  STORAGE_KEY,
  UI_STORAGE_KEY,
  UPLOADER_SETTINGS_STORAGE_KEY,
  USER_CONFIG_STORAGE_KEY,
} from './domain/constants';
import { log } from './logger';

async function readStoredJson(key: string, label: string): Promise<any> {
  try {
    let raw = null;
    const gmGetValue = (globalThis as any).GM_getValue;
    if (typeof gmGetValue === 'function') {
      raw = await gmGetValue(key, null);
    } else {
      raw = window.localStorage.getItem(key);
    }

    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (error: any) {
    log('warn', `Failed to read ${label}`, { message: error?.message || String(error) });
    return null;
  }
}

async function writeStoredJson(key: string, value: any): Promise<void> {
  const serialized = JSON.stringify(value);
  const gmSetValue = (globalThis as any).GM_setValue;

  if (typeof gmSetValue === 'function') {
    await gmSetValue(key, serialized);
    return;
  }

  window.localStorage.setItem(key, serialized);
}

export async function readStoredState(): Promise<any> {
  return readStoredJson(STORAGE_KEY, 'DB state');
}

export async function writeStoredState(state: any): Promise<void> {
  await writeStoredJson(STORAGE_KEY, state);
}

export async function readStoredUiState(): Promise<any> {
  return readStoredJson(UI_STORAGE_KEY, 'UI state');
}

export async function writeStoredUiState(state: any): Promise<void> {
  await writeStoredJson(UI_STORAGE_KEY, state);
}

export async function readStoredUploaderSettings(): Promise<any> {
  return readStoredJson(UPLOADER_SETTINGS_STORAGE_KEY, 'uploader settings');
}

export async function writeStoredUploaderSettings(settings: any): Promise<void> {
  await writeStoredJson(UPLOADER_SETTINGS_STORAGE_KEY, settings);
}

export async function readStoredUserConfig(): Promise<any> {
  return readStoredJson(USER_CONFIG_STORAGE_KEY, 'user config');
}

export async function writeStoredUserConfig(config: any): Promise<void> {
  await writeStoredJson(USER_CONFIG_STORAGE_KEY, config);
}
