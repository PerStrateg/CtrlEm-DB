import { RecordType, USER_CONFIG } from '../domain/constants';
import { getCategoryDataLines, isHttpUrl, parseLabeledUrlLine } from '../domain/content';

function getAcceptHeader(type: string): string {
  if (type === RecordType.IMAGE) return 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
  if (type === RecordType.SOUND) return 'audio/*,*/*;q=0.8';
  if (type === RecordType.VIDEO) return 'video/*,*/*;q=0.8';
  return '*/*';
}

function getErrorMessage(error: any): string {
  return error?.message || String(error || 'Request failed');
}

function isOkStatus(status: number): boolean {
  return status >= 200 && status < 400;
}

function isKnownRangeHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'files.catbox.moe' || host === 'stream.vidhosting.in' || host === 'i.ibb.co';
  } catch {
    return false;
  }
}

function getHeaderValue(headers: string, name: string): string {
  const prefix = `${name.toLowerCase()}:`;
  return String(headers || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith(prefix))
    ?.slice(prefix.length).trim() || '';
}

function hasExpectedContentType(type: string, contentType: string): boolean {
  const value = String(contentType || '').toLowerCase();
  if (!value) return true;
  if (type === RecordType.IMAGE) return value.startsWith('image/');
  if (type === RecordType.SOUND) return value.startsWith('audio/');
  if (type === RecordType.VIDEO) return value.startsWith('video/');
  return true;
}

function shouldRetryWithGet(status: number): boolean {
  return status === 0 || status === 403 || status === 405 || status === 501;
}

function normalizeStatus(status: unknown): number {
  const value = Number(status || 0);
  return Number.isFinite(value) ? value : 0;
}

function getMediaUrlFromLine(type: string, line: string): string {
  if (type === RecordType.SOUND || type === RecordType.VIDEO) {
    return parseLabeledUrlLine(line)?.url || '';
  }
  return String(line || '').trim();
}

async function requestMediaUrl(url: string, method: string, accept: string): Promise<any> {
  const gmXmlHttpRequest = (globalThis as any).GM_xmlhttpRequest;
  const headers: any = { Accept: accept };
  if (method === 'GET') headers.Range = 'bytes=0-0';

  if (typeof gmXmlHttpRequest === 'function') {
    return await new Promise((resolve, reject) => {
      gmXmlHttpRequest({
        method,
        url,
        headers,
        timeout: USER_CONFIG.linkCheck.timeoutMs,
        responseType: method === 'GET' ? 'arraybuffer' : undefined,
        onload: (response: any) => resolve({
          status: normalizeStatus(response.status),
          contentType: getHeaderValue(response.responseHeaders, 'content-type'),
        }),
        onerror: (error: any) => reject(new Error(getErrorMessage(error))),
        ontimeout: () => reject(new Error('Request timed out')),
      });
    });
  }

  const response = await fetch(url, {
    method,
    headers,
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'follow',
    referrerPolicy: 'no-referrer',
  });
  return {
    status: response.status,
    contentType: response.headers.get('content-type') || '',
  };
}

async function probeMediaUrl(url: string, type: string): Promise<any> {
  const accept = getAcceptHeader(type);

  try {
    const headResult = await requestMediaUrl(url, 'HEAD', accept);
    const headStatus = normalizeStatus(headResult.status);
    if (isOkStatus(headStatus) && !isKnownRangeHost(url)) {
      return hasExpectedContentType(type, headResult.contentType)
        ? { ok: true, status: headStatus, reason: '' }
        : { ok: false, status: headStatus, reason: `Unexpected content type: ${headResult.contentType}` };
    }
    if (!isOkStatus(headStatus) && !shouldRetryWithGet(headStatus)) return { ok: false, status: headStatus, reason: `HTTP ${headStatus}` };
  } catch {
    // Some hosts block HEAD; GET with Range catches the common media-serving path.
  }

  try {
    const getResult = await requestMediaUrl(url, 'GET', accept);
    const getStatus = normalizeStatus(getResult.status);
    if (isOkStatus(getStatus)) {
      return hasExpectedContentType(type, getResult.contentType)
        ? { ok: true, status: getStatus, reason: '' }
        : { ok: false, status: getStatus, reason: `Unexpected content type: ${getResult.contentType}` };
    }
    return { ok: false, status: getStatus, reason: `HTTP ${getStatus}` };
  } catch (error: any) {
    return { ok: false, status: 0, reason: getErrorMessage(error) };
  }
}

export function isMediaType(type: string): boolean {
  return type === RecordType.IMAGE || type === RecordType.SOUND || type === RecordType.VIDEO;
}

export async function findBrokenMediaLinks(type: string, content: string, onProgress?: (progress: any) => void): Promise<any> {
  const entries = getCategoryDataLines(content)
    .map((line, index) => ({
      index,
      line,
      url: getMediaUrlFromLine(type, line),
    }))
    .filter((entry) => entry.url);

  const broken: any[] = [];
  let cursor = 0;
  let checked = 0;

  const markBroken = (entry: any, reason: string, status = 0) => {
    broken.push({
      index: entry.index,
      line: entry.line,
      url: entry.url,
      reason,
      status,
    });
  };

  entries.forEach((entry) => {
    if (!isHttpUrl(entry.url)) {
      onProgress?.({ checked, total: entries.length, brokenCount: broken.length, currentUrl: entry.url, currentLine: entry.line });
      markBroken(entry, 'Invalid URL');
      checked += 1;
      onProgress?.({ checked, total: entries.length, brokenCount: broken.length, currentUrl: entry.url, currentLine: entry.line });
    }
  });

  const httpEntries = entries.filter((entry) => isHttpUrl(entry.url));
  onProgress?.({ checked, total: entries.length, brokenCount: broken.length });

  const runWorker = async () => {
    while (cursor < httpEntries.length) {
      const entry = httpEntries[cursor];
      cursor += 1;
      onProgress?.({ checked, total: entries.length, brokenCount: broken.length, currentUrl: entry.url, currentLine: entry.line });
      const result = await probeMediaUrl(entry.url, type);
      checked += 1;
      if (!result.ok) markBroken(entry, result.reason, result.status);
      onProgress?.({ checked, total: entries.length, brokenCount: broken.length, currentUrl: entry.url, currentLine: entry.line });
    }
  };

  const workers = Array.from({ length: Math.min(USER_CONFIG.linkCheck.concurrency, httpEntries.length) }, runWorker);
  await Promise.all(workers);

  broken.sort((a, b) => a.index - b.index);
  return {
    total: entries.length,
    checked,
    broken,
  };
}
