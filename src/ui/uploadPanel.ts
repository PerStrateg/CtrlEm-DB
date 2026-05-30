import { RecordType, UI_IDS, USER_CONFIG } from '../domain/constants';
import { createElement } from './dom';

export function getUploadPanelId(commandKey: string): string {
  return `${UI_IDS.uploadPrefix}-${commandKey}`;
}

const STATUS = Object.freeze({
  QUEUED: 'Queued',
  UPLOADING: 'Uploading',
  UPLOADED: 'Uploaded',
  FAILED: 'Failed',
});
const UPLOAD_DELAY_MS = USER_CONFIG.upload.delayMs;
const CTRLEM_IMAGE_MAX_BYTES = USER_CONFIG.upload.ctrlemImageMaxBytes;
const CTRLEM_SOUND_MAX_BYTES = USER_CONFIG.upload.ctrlemSoundMaxBytes;
const CTRLEM_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const CTRLEM_SOUND_TYPES = new Set(['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/flac', 'audio/webm', 'audio/opus']);

function getToolLabel(tool: string): string {
  if (tool === 'ctrlem') return 'CtrlEm';
  if (tool === 'imgbb') return 'ImgBB';
  if (tool === 'catbox') return 'Catbox';
  if (tool === 'vidhosting') return 'VidHosting';
  return tool;
}

function getMediaLabel(config: any): string {
  if (config.type === RecordType.IMAGE) return 'image';
  if (config.type === RecordType.SOUND) return 'audio';
  if (config.type === RecordType.VIDEO) return 'video';
  return 'file';
}

function getAccept(config: any, tool: string): string {
  if (tool === 'imgbb') return 'image/jpeg,image/png,image/gif,image/webp';
  if (tool === 'vidhosting') return 'video/*';
  if (tool === 'catbox' && config.type === RecordType.SOUND) return 'audio/*';
  if (tool === 'catbox' && config.type === RecordType.VIDEO) return 'video/*';
  return '';
}

function isAcceptedFile(config: any, tool: string, file: File): boolean {
  if (tool === 'imgbb') return file.type.startsWith('image/');
  if (tool === 'vidhosting') return file.type.startsWith('video/');
  if (tool === 'catbox' && config.type === RecordType.SOUND) return file.type.startsWith('audio/');
  if (tool === 'catbox' && config.type === RecordType.VIDEO) return file.type.startsWith('video/');
  return true;
}

function getToolNote(config: any, tool: string): string {
  if (tool === 'ctrlem' && config.type === RecordType.IMAGE) return 'Max 5MB - JPG, PNG, GIF, WebP';
  if (tool === 'ctrlem' && config.type === RecordType.SOUND) return 'Max 15MB - MP3, WAV, OGG, M4A';
  if (tool === 'imgbb') return 'Max 32MB - JPG, PNG, GIF, WebP - Requires key';
  if (tool === 'catbox') {
    return config.type === RecordType.SOUND
      ? 'Audio files - Optional userhash in Settings'
      : 'Video files - Optional userhash in Settings';
  }
  if (tool === 'vidhosting') return 'Video files';
  return '';
}

function getUploadTargetText(config: any): string {
  if (config.type === RecordType.IMAGE) return 'Upload images and gifs - expand/collapse';
  if (config.type === RecordType.SOUND) return 'Upload sounds - expand/collapse';
  if (config.type === RecordType.VIDEO) return 'Upload videos - expand/collapse';
  return 'Upload files - expand/collapse';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getCtrlEmValidationError(config: any, file: File): string {
  if (config.type === RecordType.IMAGE) {
    if (file.size > CTRLEM_IMAGE_MAX_BYTES) return 'Image must be under 5MB.';
    if (!CTRLEM_IMAGE_TYPES.has(file.type)) return 'Only JPG, PNG, GIF, and WebP images are allowed.';
  }
  if (config.type === RecordType.SOUND) {
    if (file.size > CTRLEM_SOUND_MAX_BYTES) return 'Audio must be under 15MB.';
    if (!CTRLEM_SOUND_TYPES.has(file.type)) return 'Only MP3, WAV, OGG, M4A, FLAC audio allowed.';
  }
  return '';
}

async function uploadCtrlEmFile(config: any, file: File): Promise<string> {
  const validationError = getCtrlEmValidationError(config, file);
  if (validationError) throw new Error(validationError);

  const formData = new FormData();
  const isSound = config.type === RecordType.SOUND;
  formData.append(isSound ? 'sound' : 'image', file);

  const response = await fetch(isSound ? '/api/upload/sound' : '/api/upload/image', {
    method: 'POST',
    body: formData,
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || 'Upload failed');
  }

  const data = await response.json();
  const url = String(data?.url || '');
  if (!url) throw new Error('CtrlEm upload did not return a URL.');
  return url.startsWith('http') ? url : `${window.location.origin}${url}`;
}

function createUploadIcon(): any {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  [
    ['path', { d: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4' }],
    ['polyline', { points: '17 8 12 3 7 8' }],
    ['line', { x1: '12', y1: '3', x2: '12', y2: '15' }],
  ].forEach(([tagName, attrs]: any) => {
    const child = document.createElementNS('http://www.w3.org/2000/svg', tagName);
    Object.entries(attrs).forEach(([name, value]) => child.setAttribute(name, String(value)));
    svg.appendChild(child);
  });
  return svg;
}

function getCategorySelect(config: any, actions: any): any {
  const categories = actions.getUploadCategories(config);
  const target = actions.getUploadTarget(config);
  const select = createElement('select', {
    className: 'ctrlem-db-upload-session-select',
    attrs: { 'aria-label': 'Upload category' },
  });

  categories.forEach((category: any) => {
    const option = createElement('option', {
      value: category.id,
      text: category.name,
    });
    option.selected = category.id === target.id;
    select.appendChild(option);
  });

  if (!select.value && categories[0]) select.value = categories[0].id;
  return select;
}

function createUploadSession(options: any): any {
  const { config, source, files, actions } = options;
  const totalFiles = files.length;
  const items = files.map((file: File, index: number) => ({
    file,
    fileName: file?.name || `${getMediaLabel(config)} ${index + 1}`,
    status: STATUS.QUEUED,
    url: '',
    error: '',
    appended: false,
    duplicate: false,
    row: null,
    statusEl: null,
    detailEl: null,
    progressBarEl: null,
    progressFillEl: null,
    stateIconEl: null,
    speedEl: null,
  }));
  const categorySelect = getCategorySelect(config, actions);
  const list = createElement('div', { className: 'ctrlem-db-upload-session-list' });
  const progressEl = createElement('div', {
    className: 'ctrlem-db-upload-session-progress',
    attrs: { 'aria-live': 'polite' },
  });
  const status = createElement('div', {
    className: 'ctrlem-db-upload-session-status',
    attrs: { 'aria-live': 'polite' },
  });
  const addButton = createElement('button', {
    className: 'btn btn-primary',
    text: 'Add links',
    type: 'button',
    attrs: { disabled: '' },
  });
  const cancelButton = createElement('button', {
    className: 'btn btn-sm btn-secondary ctrlem-db-upload-session-cancel',
    text: 'Cancel',
    type: 'button',
  });

  const updateProgressCounter = () => {
    const done = items.filter((item: any) => item.status === STATUS.UPLOADED || item.status === STATUS.FAILED).length;
    progressEl.textContent = `${done} of ${totalFiles} files processed`;
  };

  const modal = createElement('div', {
    className: 'ctrlem-db-modal-backdrop ctrlem-db-upload-session-backdrop',
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': `${config.label} upload status` },
  }, [
    createElement('div', { className: 'ctrlem-db-modal ctrlem-db-upload-session' }, [
      createElement('div', { className: 'ctrlem-db-upload-session-head' }, [
        createElement('div', { className: 'ctrlem-db-modal-title', text: `${source} upload` }),
        createElement('label', { className: 'ctrlem-db-upload-session-category' }, [
          createElement('span', { text: 'Category' }),
          categorySelect,
        ]),
      ]),
      progressEl,
      list,
      status,
      createElement('div', { className: 'ctrlem-db-modal-actions' }, [
        cancelButton,
        addButton,
      ]),
    ]),
  ]);

  const renderItem = (item: any) => {
    item.row.dataset.status = String(item.status).toLowerCase();
    item.row.classList.remove('is-uploading', 'is-uploaded', 'is-failed');

    if (item.status === STATUS.UPLOADING) {
      item.row.classList.add('is-uploading');
    } else if (item.status === STATUS.UPLOADED) {
      item.row.classList.add('is-uploaded');
    } else if (item.status === STATUS.FAILED) {
      item.row.classList.add('is-failed');
    }

    // Update state column: icon + status text
    item.statusEl.replaceChildren();
    if (item.status === STATUS.UPLOADED) {
      item.stateIconEl = createElement('span', {
        className: 'ctrlem-db-upload-session-state-icon',
        text: '✓',
      });
      item.statusEl.appendChild(item.stateIconEl);
      item.statusEl.appendChild(document.createTextNode(' Uploaded'));
    } else if (item.status === STATUS.FAILED) {
      item.stateIconEl = createElement('span', {
        className: 'ctrlem-db-upload-session-state-icon',
        text: '✕',
      });
      item.statusEl.appendChild(item.stateIconEl);
      item.statusEl.appendChild(document.createTextNode(' Failed'));
    } else if (item.status === STATUS.UPLOADING) {
      item.statusEl.textContent = 'Uploading...';
    } else {
      item.statusEl.textContent = item.status;
    }

    // Update detail column
    item.detailEl.replaceChildren();
    if (item.url) {
      item.detailEl.appendChild(createElement('a', {
        text: item.url,
        attrs: { href: item.url, target: '_blank', rel: 'noopener noreferrer' },
      }));
    }
    if (item.error) {
      item.detailEl.appendChild(createElement('span', {
        className: 'ctrlem-db-upload-session-error',
        text: item.error,
      }));
    }
    if (item.duplicate) {
      item.detailEl.appendChild(createElement('span', {
        className: 'ctrlem-db-upload-session-note is-duplicate',
        text: 'already exists',
      }));
    }
    if (item.appended) {
      item.detailEl.appendChild(createElement('span', {
        className: 'ctrlem-db-upload-session-note',
        text: 'added',
      }));
    }
    // Show speed if set
    if (item.speedEl && item.speedEl.textContent) {
      item.detailEl.appendChild(item.speedEl);
    }

    updateProgressCounter();
  };

  const updateActions = () => {
    const hasUploadedUrl = items.some((item: any) => item.status === STATUS.UPLOADED && item.url);
    addButton.disabled = !hasUploadedUrl;
  };

  items.forEach((item: any) => {
    // Progress bar
    const progressFill = createElement('span', { className: 'ctrlem-db-upload-progress-fill' });
    const progressBar = createElement('div', { className: 'ctrlem-db-upload-progress-bar' }, [progressFill]);
    item.progressBarEl = progressBar;
    item.progressFillEl = progressFill;

    // State column container
    const stateCol = createElement('div', { className: 'ctrlem-db-upload-session-state' });

    // Speed element (hidden initially)
    const speedEl = createElement('span', { className: 'ctrlem-db-upload-speed' });
    item.speedEl = speedEl;

    item.row = createElement('div', { className: 'ctrlem-db-upload-session-row' }, [
      createElement('div', { className: 'ctrlem-db-upload-session-file', text: item.fileName }),
      progressBar,
      stateCol,
    ]);
    item.statusEl = stateCol;
    item.detailEl = createElement('div', { className: 'ctrlem-db-upload-session-detail' });
    item.row.appendChild(item.detailEl);
    list.appendChild(item.row);
    renderItem(item);
  });

  const close = () => modal.remove();

  const setItemStatus = (item: any, nextStatus: string, patch: any = {}) => {
    Object.assign(item, patch, { status: nextStatus });
    renderItem(item);
    updateActions();
  };

  const setItemProgress = (item: any, progress: any = {}) => {
    if (progress.statusText !== undefined && item.statusEl) {
      item.statusEl.textContent = progress.statusText;
    }
    if (progress.speed !== undefined && item.speedEl) {
      item.speedEl.textContent = progress.speed;
    }
  };

  const addLinks = async () => {
    const uploadedItems = items.filter((item: any) => item.status === STATUS.UPLOADED && item.url);
    if (uploadedItems.length === 0) return;

    addButton.disabled = true;
    cancelButton.disabled = true;
    status.textContent = 'Adding links...';
    status.dataset.level = 'info';

    let appended = 0;
    for (const item of uploadedItems) {
      const result = await actions.appendUploadedUrl({
        config,
        url: item.url,
        fileName: item.fileName,
        targetCategoryId: categorySelect.value,
        source,
      });
      item.appended = Boolean(result.appended);
      item.duplicate = !result.appended;
      if (result.appended) appended += 1;
      renderItem(item);
    }

    status.textContent = appended > 0
      ? `Added ${appended} link${appended === 1 ? '' : 's'}.`
      : 'No new links added.';
    status.dataset.level = appended > 0 ? 'success' : 'info';
    cancelButton.disabled = false;
    if (appended > 0) window.setTimeout(close, USER_CONFIG.ui.uploadSessionCloseDelayMs);
    else updateActions();
  };

  addButton.addEventListener('click', () => {
    addLinks().catch((error: any) => {
      status.textContent = error?.message || String(error);
      status.dataset.level = 'error';
      cancelButton.disabled = false;
      updateActions();
    });
  });
  cancelButton.addEventListener('click', close);
  modal.addEventListener('click', (event: MouseEvent) => {
    if (event.target === modal) close();
  });

  document.body.appendChild(modal);
  return {
    items,
    modal,
    setItemStatus,
    setItemProgress,
    setStatus(message: string, level = 'info') {
      status.textContent = message;
      status.dataset.level = level;
    },
  };
}

function decorateNativeDropzone(dropzone: any): void {
  dropzone.classList.remove('ctrlem-db-hidden-site-ui');
  dropzone.classList.add('ctrlem-db-upload-dropzone');
  dropzone.dataset.tool = 'ctrlem';
  dropzone.querySelector('input[type="file"]')?.setAttribute('multiple', '');

  const main = (Array.from(dropzone.querySelectorAll('span')) as any[])
    .find((span: any) => !span.classList.contains('upload-hint'));
  if (main && !main.querySelector('.ctrlem-db-upload-tool-label')) {
    main.prepend(createElement('span', {
      className: 'ctrlem-db-upload-tool-label',
      text: `[${getToolLabel('ctrlem')}] Upload `,
    }));
  }
}

function createNativeTool(config: any, input: any, dropzone: any, actions: any): any[] {
  decorateNativeDropzone(dropzone);
  const fileInput: any = dropzone.querySelector('input[type="file"]');

  let isBusy = false;
  const uploadFiles = async (files: File[]) => {
    if (isBusy || files.length === 0) return;
    const session = createUploadSession({
      config,
      source: getToolLabel('ctrlem'),
      files,
      actions,
    });

    isBusy = true;
    dropzone.classList.add('is-busy');
    session.setStatus('Uploading files...');

    for (let index = 0; index < session.items.length; index += 1) {
      const item = session.items[index];
      if (index > 0) {
        session.setStatus(`Waiting ${UPLOAD_DELAY_MS / 1000}s before next upload...`);
        await delay(UPLOAD_DELAY_MS);
      }

      session.setItemStatus(item, STATUS.UPLOADING);

      // Speed tracking for large files
      const startTime = Date.now();
      const fileSizeMB = item.file.size / (1024 * 1024);
      let speedInterval: any = null;

      if (item.file.size > 1024 * 1024) {
        speedInterval = window.setInterval(() => {
          const elapsed = (Date.now() - startTime) / 1000;
          if (elapsed < 1) return;
          const speed = fileSizeMB / elapsed;
          session.setItemProgress(item, {
            statusText: `Uploading... (${elapsed.toFixed(0)}s)`,
            speed: speed > 0.1 ? `${speed.toFixed(1)} MB/s` : '',
          });
        }, 500);
      }

      try {
        const url = await uploadCtrlEmFile(config, item.file);
        if (speedInterval) window.clearInterval(speedInterval);
        input.value = url;
        session.setItemStatus(item, STATUS.UPLOADED, { url });
      } catch (error: any) {
        if (speedInterval) window.clearInterval(speedInterval);
        session.setItemStatus(item, STATUS.FAILED, {
          error: error?.message || String(error),
        });
      }
    }

    isBusy = false;
    dropzone.classList.remove('is-busy');
    if (fileInput) fileInput.value = '';
    const successful = session.items.filter((item: any) => item.status === STATUS.UPLOADED).length;
    const failed = session.items.filter((item: any) => item.status === STATUS.FAILED).length;

    // Flash effect on dropzone
    if (successful > 0 && failed === 0) {
      dropzone.classList.add('flash-success');
      window.setTimeout(() => dropzone.classList.remove('flash-success'), 1200);
    } else if (failed > 0 && successful === 0) {
      dropzone.classList.add('flash-error');
      window.setTimeout(() => dropzone.classList.remove('flash-error'), 1200);
    }

    session.setStatus(
      successful > 0 ? 'Upload finished. Review links, choose a category, then add them.' : 'No files uploaded.',
      successful > 0 ? 'success' : 'error',
    );

    // Toast notification
    showUploadToast(successful, failed);
  };

  dropzone.addEventListener('drop', (event: DragEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    dropzone.classList.remove('drag-active');
    const files = Array.from(event.dataTransfer?.files || []) as File[];
    uploadFiles(files);
  }, true);
  fileInput?.addEventListener('change', (event: Event) => {
    event.stopImmediatePropagation();
    const files = Array.from(fileInput.files || []) as File[];
    uploadFiles(files);
  }, true);

  return [dropzone];
}

function createImgBBDisabledTool(actions: any): any[] {
  const openPrompt = () => actions.openImgBBKeyPrompt();
  const dropzone = createElement('div', {
    className: 'upload-dropzone ctrlem-db-upload-dropzone is-disabled',
    attrs: {
      role: 'button',
      tabindex: '0',
      'aria-label': 'Set ImgBB API key before uploading',
    },
    dataset: { tool: 'imgbb' },
  }, [
    createUploadIcon(),
    createElement('span', { className: 'ctrlem-db-upload-dropzone-main' }, [
      createElement('span', { className: 'ctrlem-db-upload-tool-label', text: '[ImgBB] ' }),
      createElement('span', { text: 'Set API key before uploading' }),
    ]),
    createElement('span', { className: 'upload-hint', text: 'Click to open ImgBB key settings' }),
  ]);

  dropzone.addEventListener('click', openPrompt);
  dropzone.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openPrompt();
  });
  dropzone.addEventListener('dragover', (event: DragEvent) => event.preventDefault());
  dropzone.addEventListener('drop', (event: DragEvent) => {
    event.preventDefault();
    openPrompt();
  });

  return [dropzone];
}

function createExternalTool(config: any, tool: string, input: any, actions: any): any[] {
  if (tool === 'imgbb' && !String(actions.getUploaderSettings().imgbbApiKey || '').trim()) {
    return createImgBBDisabledTool(actions);
  }

  const label = getToolLabel(tool);
  const fileInputId = `file-${config.key}-${tool}`;
  const fileInput = createElement('input', {
    className: 'ctrlem-db-command-upload-file',
    type: 'file',
    attrs: {
      accept: getAccept(config, tool),
      multiple: '',
      id: fileInputId,
      style: 'display:none',
    },
  });
  const browseLabel = createElement('label', {
    className: 'upload-browse-label',
    text: 'browse',
    attrs: { for: fileInputId },
  });
  browseLabel.addEventListener('click', (event: MouseEvent) => event.stopPropagation());

  const dropzone = createElement('div', {
    className: 'upload-dropzone ctrlem-db-upload-dropzone',
    attrs: {
      role: 'button',
      tabindex: '0',
    },
    dataset: {
      uploadFor: config.key,
      tool,
    },
  }, [
    createUploadIcon(),
    createElement('span', { className: 'ctrlem-db-upload-dropzone-main' }, [
      createElement('span', { className: 'ctrlem-db-upload-tool-label', text: `[${label}] Upload ` }),
      createElement('span', { text: `Drag & drop ${getMediaLabel(config)} or ` }),
      browseLabel,
    ]),
    createElement('span', { className: 'upload-hint', text: getToolNote(config, tool) }),
    fileInput,
    createElement('div', { className: 'upload-spinner', attrs: { style: 'display:none' }, text: 'Uploading...' }),
  ]);

  let isBusy = false;
  const setBusy = (busy: boolean) => {
    isBusy = busy;
    fileInput.disabled = busy;
    dropzone.classList.toggle('is-busy', busy);
    dropzone.setAttribute('aria-disabled', String(busy));
  };

  const uploadFiles = async (files: File[]) => {
    if (isBusy || files.length === 0) return;

    const session = createUploadSession({
      config,
      source: label,
      files,
      actions,
    });

    setBusy(true);
    session.setStatus('Uploading files...');

    for (const item of session.items) {
      if (!isAcceptedFile(config, tool, item.file)) {
        session.setItemStatus(item, STATUS.FAILED, {
          error: `${item.fileName}: not accepted by ${label}.`,
        });
        continue;
      }

      session.setItemStatus(item, STATUS.UPLOADING);

      // Speed tracking for large files
      const startTime = Date.now();
      const fileSizeMB = item.file.size / (1024 * 1024);
      let speedInterval: any = null;

      if (item.file.size > 1024 * 1024) {
        speedInterval = window.setInterval(() => {
          const elapsed = (Date.now() - startTime) / 1000;
          if (elapsed < 1) return;
          const speed = fileSizeMB / elapsed;
          session.setItemProgress(item, {
            statusText: `Uploading... (${elapsed.toFixed(0)}s)`,
            speed: speed > 0.1 ? `${speed.toFixed(1)} MB/s` : '',
          });
        }, 500);
      }

      try {
        const url = await actions.uploadContentFile({
          config,
          tool,
          file: item.file,
        });
        if (speedInterval) window.clearInterval(speedInterval);
        session.setItemStatus(item, STATUS.UPLOADED, { url });
        // Set the input value so the site's Send button can become enabled
        input.value = url;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (error: any) {
        if (speedInterval) window.clearInterval(speedInterval);
        session.setItemStatus(item, STATUS.FAILED, {
          error: error?.message || String(error),
        });
      }
    }

    setBusy(false);
    fileInput.value = '';
    const successful = session.items.filter((item: any) => item.status === STATUS.UPLOADED).length;
    const failed = session.items.filter((item: any) => item.status === STATUS.FAILED).length;

    // Flash effect on dropzone
    if (successful > 0 && failed === 0) {
      dropzone.classList.add('flash-success');
      window.setTimeout(() => dropzone.classList.remove('flash-success'), 1200);
    } else if (failed > 0 && successful === 0) {
      dropzone.classList.add('flash-error');
      window.setTimeout(() => dropzone.classList.remove('flash-error'), 1200);
    }

    session.setStatus(
      successful > 0 ? 'Upload finished. Review links, choose a category, then add them.' : 'No files uploaded.',
      successful > 0 ? 'success' : 'error',
    );

    // Toast notification
    showUploadToast(successful, failed);
  };

  dropzone.addEventListener('click', () => {
    if (!isBusy) fileInput.click();
  });
  dropzone.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!isBusy) fileInput.click();
  });
  dropzone.addEventListener('dragover', (event: DragEvent) => {
    event.preventDefault();
    if (!isBusy) dropzone.classList.add('drag-active');
  });
  dropzone.addEventListener('dragenter', (event: DragEvent) => {
    event.preventDefault();
    if (!isBusy) dropzone.classList.add('drag-active');
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-active');
  });
  dropzone.addEventListener('drop', (event: DragEvent) => {
    event.preventDefault();
    dropzone.classList.remove('drag-active');
    uploadFiles(Array.from(event.dataTransfer?.files || []) as File[]);
  });
  fileInput.addEventListener('change', () => {
    uploadFiles(Array.from(fileInput.files || []) as File[]);
  });

  return [dropzone];
}

/* ── Toast notifications ── */

function showUploadToast(successful: number, failed: number): void {
  if (successful === 0 && failed === 0) return;

  let container: any = document.querySelector('.ctrlem-db-toast-container');
  if (!container) {
    container = createElement('div', { className: 'ctrlem-db-toast-container' });
    document.body.appendChild(container);
  }

  let text: string;
  let level: string;
  if (failed === 0) {
    text = `✓ All ${successful} file${successful === 1 ? '' : 's'} uploaded successfully`;
    level = 'is-success';
  } else if (successful === 0) {
    text = `✕ All ${failed} file${failed === 1 ? '' : 's'} failed to upload`;
    level = 'is-error';
  } else {
    text = `⚠ ${successful} uploaded, ${failed} failed`;
    level = 'is-warning';
  }

  const toast = createElement('div', {
    className: `ctrlem-db-toast ${level}`,
    text,
  });

  container.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add('is-leaving');
    window.setTimeout(() => toast.remove(), 250);
  }, 3500);
}

export function createUploadPanel(options: any): any {
  const { config, input, nativeDropzone, uiState = {}, onUiStateChange, actions } = options;
  const grid = createElement('div', { className: 'ctrlem-db-command-upload-grid' });
  const cardChildren: Node[] = [];
  const isCollapsed = uiState.collapsed !== false;
  const tools = config.tools || [];
  const hideCtrlEmUploader = actions.getUploaderSettings?.().hideCtrlEmUploader === true;

  if (nativeDropzone && (!tools.includes('ctrlem') || hideCtrlEmUploader)) {
    nativeDropzone.classList.add('ctrlem-db-hidden-site-ui');
  }

  tools.forEach((tool: string) => {
    if (tool === 'ctrlem') {
      if (nativeDropzone && !hideCtrlEmUploader) cardChildren.push(...createNativeTool(config, input, nativeDropzone, actions));
      return;
    }
    cardChildren.push(...createExternalTool(config, tool, input, actions));
  });

  grid.appendChild(createElement('div', {
    className: 'ctrlem-db-upload-card ctrlem-db-upload-native-card',
  }, cardChildren));

  const bodyId = `${getUploadPanelId(config.key)}-body`;
  grid.id = bodyId;
  grid.hidden = isCollapsed;

  const panel = createElement('div', {
    id: getUploadPanelId(config.key),
    className: `ctrlem-db-command-upload${isCollapsed ? ' is-collapsed' : ''}`,
    attrs: { 'aria-label': `${config.label} upload tools` },
    dataset: {
      command: config.key,
      type: config.type,
    },
  }, [
    createElement('button', {
      className: 'ctrlem-db-command-upload-head',
      type: 'button',
      attrs: {
        'aria-expanded': String(!isCollapsed),
        'aria-controls': bodyId,
      },
    }, [
      createElement('span', { className: 'ctrlem-db-command-upload-title', text: 'Upload' }),
      createElement('span', { className: 'ctrlem-db-command-upload-target', text: getUploadTargetText(config) }),
      createElement('span', { className: 'ctrlem-db-command-upload-chevron', text: 'v' }),
    ]),
    createElement('div', {
      className: 'ctrlem-db-command-upload-recommendation',
      text: 'Recommended: use ImgBB/Catbox first for faster uploads and longer-lived links.',
    }),
    grid,
  ]);

  const button: any = panel.querySelector('.ctrlem-db-command-upload-head');
  button.addEventListener('click', () => {
    const nextCollapsed = !grid.hidden;
    grid.hidden = nextCollapsed;
    panel.classList.toggle('is-collapsed', nextCollapsed);
    button.setAttribute('aria-expanded', String(!nextCollapsed));
    onUiStateChange?.({ collapsed: nextCollapsed });
  });

  return panel;
}
