import {
  AUTO_SEND_INTERVAL_DEFAULT,
  AUTO_SEND_INTERVAL_MAX,
  AUTO_SEND_INTERVAL_MIN,
  AUTO_SEND_MINIMUM_REQUEST_INTERVAL_DEFAULT,
  AUTO_SEND_MINIMUM_REQUEST_INTERVAL_MAX,
  AUTO_SEND_MINIMUM_REQUEST_INTERVAL_MIN,
  NO_PREVIEWS_MARKER,
  RecordType,
  TYPE_ORDER,
} from './constants';

export function parseLines(rawText: unknown): string[] {
  return String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function isNoPreviewsMarker(value: unknown): boolean {
  return String(value || '').trim().toLowerCase() === NO_PREVIEWS_MARKER;
}

export function hasNoPreviewsMarker(rawText: unknown): boolean {
  const lines = parseLines(rawText);
  return lines.length > 0 && isNoPreviewsMarker(lines[0]);
}

export function getCategoryDataLines(rawText: unknown): string[] {
  const lines = parseLines(rawText);
  return hasNoPreviewsMarker(rawText) ? lines.slice(1) : lines;
}

export function parseLabeledUrlLine(rawText: unknown): any {
  const text = String(rawText || '').trim();
  if (!text) return null;

  const match = text.match(/^(\S+)(?:\s+([\s\S]+))?$/);
  if (!match) return null;

  const url = match[1].trim();
  const label = String(match[2] || '').trim();
  return {
    url,
    label,
    display: label || url,
  };
}

export function getLineItem(type: string, rawText: unknown): any {
  if (type === RecordType.VIDEO || type === RecordType.SOUND) {
    const media = parseLabeledUrlLine(rawText);
    return media ? {
      value: media.url,
      label: media.label,
      display: media.display,
      title: String(rawText || '').trim(),
    } : null;
  }

  const value = String(rawText || '').trim();
  return value ? { value, display: value, title: value } : null;
}

export function isHttpUrl(value: unknown): boolean {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function formatCategoryContent(rawText: unknown): string {
  const lines = parseLines(rawText);
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

export function clampAutoSendInterval(value: unknown): number {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return AUTO_SEND_INTERVAL_DEFAULT;
  return Math.min(AUTO_SEND_INTERVAL_MAX, Math.max(AUTO_SEND_INTERVAL_MIN, parsed));
}

export function clampMinimumRequestInterval(value: unknown): number {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return AUTO_SEND_MINIMUM_REQUEST_INTERVAL_DEFAULT;
  return Math.min(AUTO_SEND_MINIMUM_REQUEST_INTERVAL_MAX, Math.max(AUTO_SEND_MINIMUM_REQUEST_INTERVAL_MIN, parsed));
}

export function createId(prefix = 'cat'): string {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeType(type: string): string {
  return (TYPE_ORDER as readonly string[]).includes(type) ? type : RecordType.TEXT;
}

export function getUploadImageUrl(uploadId: string): string {
  return `${window.location.origin}/api/uploads/${encodeURIComponent(uploadId)}/image`;
}

export function getLabelFromUrl(url: string, fallback = 'Media'): string {
  try {
    const parsed = new URL(url, window.location.href);
    const lastPart = parsed.pathname.split('/').filter(Boolean).pop();
    return lastPart ? decodeURIComponent(lastPart) : fallback;
  } catch {
    return fallback;
  }
}

export function getSafeFileName(value: unknown, fallback: string): string {
  const clean = String(value || fallback || 'db')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return clean || fallback || 'db';
}

export function getCategoryNameFromFileName(fileName: string): string {
  return String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .trim() || 'Imported';
}

export function normalizeMediaItem(value: any, fallbackTitle?: string): any {
  if (typeof value === 'string') {
    const url = value.trim();
    return url ? { url, previewUrl: url, title: fallbackTitle || getLabelFromUrl(url) } : null;
  }

  const url = String(value?.url || '').trim();
  if (!url) return null;
  const uploadId = String(value?.uploadId || value?.id || '').trim();
  const previewUrl = String(value?.previewUrl || value?.src || url).trim();
  return {
    url,
    previewUrl,
    title: String(value?.title || fallbackTitle || getLabelFromUrl(url)).trim(),
    uploadId,
    canDelete: Boolean(value?.canDelete || uploadId || value?.deleteButton),
    deleteButton: value?.deleteButton instanceof Element ? value.deleteButton : null,
  };
}

export function uniqueMediaItems(items: any[]): any[] {
  const byUrl = new Map();

  items.forEach((item) => {
    const normalized = normalizeMediaItem(item);
    if (!normalized) return;

    const existing = byUrl.get(normalized.url);
    if (!existing) {
      byUrl.set(normalized.url, normalized);
      return;
    }

    if (!existing.uploadId && normalized.uploadId) existing.uploadId = normalized.uploadId;
    if (!existing.previewUrl && normalized.previewUrl) existing.previewUrl = normalized.previewUrl;
    if (!existing.canDelete && normalized.canDelete) existing.canDelete = true;
    if (!existing.deleteButton && normalized.deleteButton) existing.deleteButton = normalized.deleteButton;
  });

  return Array.from(byUrl.values());
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
