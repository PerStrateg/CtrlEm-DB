import { CONFIG, MEDIA_COMMANDS, RecordType } from '../domain/constants';
import {
  getUploadImageUrl,
  normalizeMediaItem,
  uniqueMediaItems,
  uniqueStrings,
} from '../domain/content';
import { showCtrlEmDbToast } from '../ui/toast';

export class CtrlEmSite {
  private uploadApiItemsPromise: Promise<any[]> | null = null;

  constructor(private readonly log: any) {}

  readDefaultImagesFromGallery(commandKey: string): any[] {
    const selectors = uniqueStrings([
      `#gallery-${commandKey}`,
      ...Object.values(MEDIA_COMMANDS)
        .filter((config: any) => config.type === RecordType.IMAGE)
        .map((config: any) => config.gallerySelector),
    ]);
    const items: any[] = [];

    selectors.forEach((selector) => {
      const gallery: any = document.querySelector(selector);
      if (!gallery) return;

      gallery.querySelectorAll('.gallery-thumb-wrapper').forEach((wrapper: any) => {
        const uploadId = wrapper.dataset.uploadId;
        const img = wrapper.querySelector('.gallery-thumb');
        const deleteButton = wrapper.querySelector('.gallery-thumb-delete');
        const title = img?.getAttribute('title') || img?.getAttribute('alt') || uploadId || 'Uploaded image';
        const url = uploadId ? getUploadImageUrl(uploadId) : img?.src;
        const item = normalizeMediaItem({
          url,
          previewUrl: img?.src || url,
          title,
          uploadId,
          deleteButton,
          canDelete: Boolean(uploadId || deleteButton),
        });
        if (item) items.push(item);
      });
    });

    return uniqueMediaItems(items);
  }

  async fetchDefaultImagesFromApi(): Promise<any[]> {
    if (!this.uploadApiItemsPromise) {
      this.uploadApiItemsPromise = fetch('/api/uploads/my', { credentials: 'same-origin' })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((uploads) => {
          if (!Array.isArray(uploads)) return [];
          return uniqueMediaItems(uploads.map((upload) => {
            const url = upload?.id ? getUploadImageUrl(upload.id) : upload?.url;
            const title = upload?.originalName || upload?.name || upload?.id || 'Uploaded image';
            return {
              url,
              title,
              previewUrl: upload?.url || url,
              uploadId: upload?.id,
              canDelete: Boolean(upload?.id),
            };
          }));
        })
        .catch((error: any) => {
          this.log('warn', 'Default uploads API unavailable', { message: error?.message || String(error) });
          return [];
        });
    }

    return this.uploadApiItemsPromise;
  }

  async getDefaultImageItems(commandKey: string): Promise<any[]> {
    const domItems = this.readDefaultImagesFromGallery(commandKey);
    const apiItems = await this.fetchDefaultImagesFromApi();
    const items = uniqueMediaItems([...domItems, ...apiItems]);

    if (items.length > 0) {
      this.log('info', 'Default loaded', {
        command: commandKey,
        count: items.length,
        dom: domItems.length,
        api: apiItems.length,
      });
    } else {
      this.log('info', 'Default fallback', { command: commandKey });
    }

    return items;
  }

  notify(message: string, level = 'info'): void {
    const pageWindow = (globalThis as any).unsafeWindow || window;
    const showToast = (window as any).showToast || pageWindow.showToast;
    if (typeof showToast === 'function') {
      try {
        showToast.call(pageWindow, message, level);
        return;
      } catch (error: any) {
        this.log('warn', 'Site toast failed; using CtrlEm DB toast', {
          message: error?.message || String(error),
        });
      }
    }

    showCtrlEmDbToast(message, level);
  }

  removeUploadFromSiteGalleries(uploadId: string): void {
    if (!uploadId) return;
    document.querySelectorAll('.gallery-thumb-wrapper').forEach((wrapper: any) => {
      if (wrapper.dataset.uploadId === uploadId) wrapper.remove();
    });
  }

  async deleteDefaultImageItem(item: any, tile: any, refresh: () => void): Promise<void> {
    if (!item?.canDelete) return;

    try {
      tile?.classList.add('is-deleting');

      if (item.uploadId) {
        const response = await fetch(`/api/uploads/${encodeURIComponent(item.uploadId)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        this.removeUploadFromSiteGalleries(item.uploadId);
      } else if (item.deleteButton) {
        item.deleteButton.click();
      }

      this.uploadApiItemsPromise = null;
      this.notify('Image deleted', 'success');
      refresh();
    } catch (error: any) {
      tile?.classList.remove('is-deleting');
      this.notify('Failed to delete image', 'error');
      this.log('error', 'Failed to delete default image', {
        uploadId: item.uploadId,
        message: error?.message || String(error),
      });
    }
  }

  hideMediaUi(config: any, panel: any): boolean {
    let changed = false;
    const elements: any[] = [];

    if (config.gallerySelector) {
      const gallery = panel.querySelector(config.gallerySelector);
      if (gallery) elements.push(gallery);
    }

    panel.querySelectorAll('.gallery-thumb-delete').forEach((button) => elements.push(button));

    elements.forEach((element) => {
      if (element.classList.contains('ctrlem-db-hidden-site-ui')) return;
      element.classList.add('ctrlem-db-hidden-site-ui');
      changed = true;
    });

    if (changed) {
      this.log('info', 'Site media UI hidden', {
        command: config.key,
        count: elements.length,
      });
    }

    return changed;
  }

  getResultsParts(): any {
    const panel: any = document.querySelector(CONFIG.selectors.resultsPanel);
    const head = panel?.querySelector('.panel-head');
    const title = head?.querySelector('h2');
    const description = head?.querySelector('p');
    const actions = head ? Array.from(head.children).find((child: any) => child !== title?.parentElement) : null;
    const responses = document.querySelector(CONFIG.selectors.resultsContainer);
    const pagination = document.querySelector(CONFIG.selectors.resultsPagination);
    return { panel, head, title, description, actions, responses, pagination };
  }
}
