import {
  IMAGE_CACHE_DB_NAME,
  IMAGE_CACHE_DB_VERSION,
  IMAGE_CACHE_MAX_BYTES,
  IMAGE_CACHE_MAX_ITEMS,
  IMAGE_CACHE_STORE,
  IMAGE_PLACEHOLDER_URL,
  USER_CONFIG,
} from '../domain/constants';

type CachedImageFetch = {
  dataUrl: string;
  size: number;
};

export class ImageCache {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private inflight = new Map<string, Promise<string | null>>();
  private pruneTimer = 0;

  constructor(private readonly log: any) {}

  getHttpUrl(url: string): string {
    try {
      const parsed = new URL(String(url || '').trim(), window.location.href);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
    } catch {
      return '';
    }
  }

  getCacheKey(url: string): string {
    try {
      const parsed = new URL(String(url || '').trim(), window.location.href);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';

      parsed.hash = '';
      if (parsed.origin === window.location.origin && /^\/api\/uploads\/[^/]+\/image\/?$/.test(parsed.pathname)) {
        parsed.search = '';
      }
      return parsed.href;
    } catch {
      return '';
    }
  }

  getCacheKeys(sourceUrl: string, cacheKey = sourceUrl): string[] {
    return Array.from(new Set([
      this.getCacheKey(cacheKey),
      this.getCacheKey(sourceUrl),
    ].filter(Boolean)));
  }

  canCacheImagePreview(url: string): boolean {
    return Boolean(this.getHttpUrl(url));
  }

  openDb(): Promise<IDBDatabase> {
    if (!window.indexedDB) return Promise.reject(new Error('IndexedDB unavailable'));
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(IMAGE_CACHE_DB_NAME, IMAGE_CACHE_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.objectStoreNames.contains(IMAGE_CACHE_STORE)
          ? request.transaction!.objectStore(IMAGE_CACHE_STORE)
          : db.createObjectStore(IMAGE_CACHE_STORE, { keyPath: 'url' });
        if (!store.indexNames.contains('lastAccess')) store.createIndex('lastAccess', 'lastAccess');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Failed to open image cache'));
    });

    this.dbPromise.catch(() => {
      this.dbPromise = null;
    });
    return this.dbPromise;
  }

  blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Failed to read image blob'));
      reader.readAsDataURL(blob);
    });
  }

  async readCachedImageDataUrl(url: string): Promise<string | null> {
    try {
      const record: any = await this.readRecord(url);
      if (!record) return null;

      if (record.dataUrl) {
        this.touchRecord(record);
        return record.dataUrl;
      }

      if (record.blob instanceof Blob) {
        const dataUrl = await this.blobToDataUrl(record.blob);
        await this.writeDataUrl(url, dataUrl, Number(record.size || record.blob.size || dataUrl.length || 0));
        return dataUrl;
      }

      return null;
    } catch (error: any) {
      this.log('debug', 'Image cache read skipped', { url, message: error?.message || String(error) });
      return null;
    }
  }

  async readRecord(url: string): Promise<any> {
    const key = this.getCacheKey(url);
    if (!key) return null;

    const db = await this.openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IMAGE_CACHE_STORE, 'readonly');
      const request = tx.objectStore(IMAGE_CACHE_STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Failed to read cached image'));
      tx.onerror = () => reject(tx.error || new Error('Image cache read transaction failed'));
    });
  }

  async touchRecord(record: any): Promise<void> {
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IMAGE_CACHE_STORE, 'readwrite');
        tx.objectStore(IMAGE_CACHE_STORE).put({
          ...record,
          lastAccess: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Image cache touch transaction failed'));
      });
    } catch (error: any) {
      this.log('debug', 'Image cache touch skipped', { url: record?.url, message: error?.message || String(error) });
    }
  }

  async writeDataUrl(url: string, dataUrl: string, size: number): Promise<void> {
    const key = this.getCacheKey(url);
    if (!key) return;
    if (!dataUrl || !String(dataUrl).startsWith('data:image/')) return;

    const safeSize = Number(size || dataUrl.length || 0);
    if (safeSize <= 0) return;

    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IMAGE_CACHE_STORE, 'readwrite');
        const store = tx.objectStore(IMAGE_CACHE_STORE);
        store.put({
          url: key,
          dataUrl,
          size: safeSize,
          cachedAt: Date.now(),
          lastAccess: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Image cache write transaction failed'));
      });
      this.schedulePrune();
    } catch (error: any) {
      this.log('debug', 'Image cache write skipped', { url, message: error?.message || String(error) });
    }
  }

  getHeaderValue(headers: string, name: string): string {
    const pattern = new RegExp(`^${name}:\\s*([^\\r\\n]+)`, 'im');
    const match = String(headers || '').match(pattern);
    return match ? match[1].trim() : '';
  }

  getImageMimeFromUrl(url: string): string {
    try {
      const path = new URL(url, window.location.href).pathname.toLowerCase();
      if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
      if (path.endsWith('.png')) return 'image/png';
      if (path.endsWith('.gif')) return 'image/gif';
      if (path.endsWith('.webp')) return 'image/webp';
      if (path.endsWith('.avif')) return 'image/avif';
      if (path.endsWith('.bmp')) return 'image/bmp';
      if (path.endsWith('.svg')) return 'image/svg+xml';
    } catch {
      // Ignore malformed URLs; the caller will fall back to direct img loading.
    }
    return '';
  }

  normalizeImageBlob(blob: Blob, mimeType: string, url: string): Blob | null {
    const type = String(mimeType || blob.type || '').split(';')[0].trim().toLowerCase()
      || this.getImageMimeFromUrl(url);
    if (!type.startsWith('image/')) return null;
    return blob.type === type ? blob : blob.slice(0, blob.size, type);
  }

  canFetchImageWithGm(url: URL): boolean {
    return url.protocol === 'http:' || url.protocol === 'https:';
  }

  async fetchImageBlobWithGm(url: string): Promise<Blob | null> {
    const gmXmlHttpRequest = (globalThis as any).GM_xmlhttpRequest;
    if (typeof gmXmlHttpRequest !== 'function') return null;

    return await new Promise((resolve, reject) => {
      gmXmlHttpRequest({
        method: 'GET',
        url,
        responseType: 'blob',
        timeout: USER_CONFIG.imageCache.fetchTimeoutMs,
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
        onload: (response: any) => {
          const status = Number(response.status || 0);
          if (status < 200 || status >= 300) {
            reject(new Error(`HTTP ${status}`));
            return;
          }

          const blob = response.response instanceof Blob ? response.response : null;
          if (!blob || blob.size <= 0) {
            resolve(null);
            return;
          }

          resolve(this.normalizeImageBlob(blob, this.getHeaderValue(response.responseHeaders, 'content-type'), url));
        },
        onerror: (error: any) => reject(new Error(error?.message || String(error || 'Request failed'))),
        ontimeout: () => reject(new Error('Request timed out')),
      });
    });
  }

  async fetchImageBlob(url: string): Promise<Blob | null> {
    const parsed = new URL(url, window.location.href);
    if (parsed.origin !== window.location.origin) {
      if (!this.canFetchImageWithGm(parsed)) return null;

      try {
        const gmBlob = await this.fetchImageBlobWithGm(parsed.href);
        if (gmBlob) return gmBlob;
      } catch (error: any) {
        this.log('debug', 'GM image fetch fallback', { url: parsed.href, message: error?.message || String(error) });
      }
      return null;
    }

    const response = await fetch(parsed.href, {
      cache: 'force-cache',
      credentials: parsed.origin === window.location.origin ? 'same-origin' : 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const blob = await response.blob();
    if (!(blob instanceof Blob) || blob.size <= 0) return null;
    return this.normalizeImageBlob(blob, response.headers.get('content-type') || '', parsed.href);
  }

  async fetchImageDataUrl(url: string): Promise<CachedImageFetch | null> {
    const blob = await this.fetchImageBlob(url);
    if (!blob) return null;

    const dataUrl = await this.blobToDataUrl(blob);
    return {
      dataUrl,
      size: blob.size,
    };
  }

  async fetchAndCacheImageDataUrl(url: string, cacheKey: string): Promise<string | null> {
    const result = await this.fetchImageDataUrl(url);
    if (!result?.dataUrl) return null;

    await this.writeDataUrl(cacheKey, result.dataUrl, result.size);
    return result.dataUrl;
  }

  async resolveImagePreviewUrl(url: string, cacheKey = url): Promise<string> {
    const fetchUrl = this.getHttpUrl(url);
    if (!fetchUrl) return url;

    const cacheKeys = this.getCacheKeys(fetchUrl, cacheKey);
    if (cacheKeys.length === 0) return url;

    const primaryKey = cacheKeys[0];
    for (const key of cacheKeys) {
      const cachedDataUrl = await this.readCachedImageDataUrl(key);
      if (!cachedDataUrl) continue;

      if (key !== primaryKey) await this.writeDataUrl(primaryKey, cachedDataUrl, cachedDataUrl.length);
      return cachedDataUrl;
    }

    let pending = this.inflight.get(primaryKey);
    if (!pending) {
      pending = this.fetchAndCacheImageDataUrl(fetchUrl, primaryKey);
      this.inflight.set(primaryKey, pending);
      pending.then(
        () => this.inflight.delete(primaryKey),
        () => this.inflight.delete(primaryKey),
      );
    }

    return (await pending) || url;
  }

  setImagePreviewSource(img: any, sourceUrl: string, cacheKey = sourceUrl): void {
    const url = String(sourceUrl || '').trim();
    if (!url) return;

    img.dataset.cacheSource = url;
    img.src = IMAGE_PLACEHOLDER_URL;

    this.resolveImagePreviewUrl(url, cacheKey)
      .then((resolvedUrl) => {
        if (img.dataset.cacheSource === url) img.src = resolvedUrl;
      })
      .catch((error: any) => {
        this.log('debug', 'Image preview cache fallback', { url, message: error?.message || String(error) });
        if (img.dataset.cacheSource === url) img.src = url;
      });
  }

  async getAllRecords(): Promise<any[]> {
    const db = await this.openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IMAGE_CACHE_STORE, 'readonly');
      const request = tx.objectStore(IMAGE_CACHE_STORE).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error || new Error('Failed to list cached images'));
      tx.onerror = () => reject(tx.error || new Error('Image cache list transaction failed'));
    });
  }

  async deleteUrls(urls: string[]): Promise<void> {
    const keys = Array.from(new Set(urls.map((url) => this.getCacheKey(url)).filter(Boolean)));
    if (!keys.length) return;

    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IMAGE_CACHE_STORE, 'readwrite');
      const store = tx.objectStore(IMAGE_CACHE_STORE);
      keys.forEach((url) => store.delete(url));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Image cache prune transaction failed'));
    });
  }

  async prune(): Promise<void> {
    try {
      const records = await this.getAllRecords();
      const newestFirst = records
        .map((record: any) => ({
          url: record.url,
          size: Number(record.size || record.dataUrl?.length || record.blob?.size || 0),
          lastAccess: Number(record.lastAccess || record.cachedAt || 0),
        }))
        .sort((a, b) => b.lastAccess - a.lastAccess);
      let keptCount = 0;
      let keptBytes = 0;
      const deleteUrls: string[] = [];

      newestFirst.forEach((record) => {
        const nextCount = keptCount + 1;
        const nextBytes = keptBytes + record.size;
        if (nextCount <= IMAGE_CACHE_MAX_ITEMS && nextBytes <= IMAGE_CACHE_MAX_BYTES) {
          keptCount = nextCount;
          keptBytes = nextBytes;
          return;
        }
        if (record.url) deleteUrls.push(record.url);
      });

      await this.deleteUrls(deleteUrls);
      if (deleteUrls.length > 0) this.log('info', 'Image cache pruned', { deleted: deleteUrls.length });
    } catch (error: any) {
      this.log('debug', 'Image cache prune skipped', { message: error?.message || String(error) });
    }
  }

  schedulePrune(): void {
    window.clearTimeout(this.pruneTimer);
    this.pruneTimer = window.setTimeout(() => this.prune(), USER_CONFIG.imageCache.pruneDelayMs);
  }
}
