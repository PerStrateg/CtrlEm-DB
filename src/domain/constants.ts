export const LOG_PREFIX = '[CtrlEm DB]';
export const STORAGE_KEY = 'ctrlemDbState.v1';
export const UI_STORAGE_KEY = 'ctrlemDbUiState.v1';
export const UPLOADER_SETTINGS_STORAGE_KEY = 'ctrlemDbUploaderSettings.v1';
export const AUTO_SEND_SESSION_STORAGE_KEY = 'ctrlemDbAutoSendSession.v1';
export const AUTO_SEND_QUEUE_STORAGE_KEY = 'ctrlemDbAutoSendQueue.v1';
export const STATE_VERSION = 2;
export const INPUT_CATEGORY_NAME = 'Input';
export const NO_PREVIEWS_MARKER = '- (no previews)';

export const USER_CONFIG = Object.freeze({
  autosaveDelayMs: 500,
  autoSend: Object.freeze({
    intervalDefaultSeconds: 5,
    intervalMinSeconds: 3,
    intervalMaxSeconds: 3600,
    minimumRequestIntervalDefaultSeconds: 3,
    minimumRequestIntervalMinSeconds: 3,
    minimumRequestIntervalMaxSeconds: 60,
    queueLockTtlMs: 1200,
    heartbeatMs: 2000,
    heartbeatTimeoutMs: 9000,
    runnerMs: 200,
    managerRefreshMs: 200,
  }),
  imagePreviews: Object.freeze({
    maxItems: 100,
  }),
  ui: Object.freeze({
    saveDelayMs: 120,
    scrollSaveDelayMs: 120,
    domObserverDelayMs: 120,
    modalCloseDelayMs: 250,
    uploadSessionCloseDelayMs: 700,
  }),
  upload: Object.freeze({
    delayMs: 3000,
    ctrlemImageMaxBytes: 5 * 1024 * 1024,
    ctrlemSoundMaxBytes: 15 * 1024 * 1024,
    imgbbMaxBytes: 32 * 1024 * 1024,
    vidhostingMaxBytes: 100 * 1024 * 1024,
    externalRequestTimeoutMs: 120000,
  }),
  linkCheck: Object.freeze({
    timeoutMs: 15000,
    concurrency: 4,
  }),
  imageCache: Object.freeze({
    fetchTimeoutMs: 60000,
    pruneDelayMs: 2000,
  }),
  inputCapture: Object.freeze({
    maxTextLength: 200,
    countMin: 1,
    countMax: 5,
  }),
});

export const AUTOSAVE_DELAY = USER_CONFIG.autosaveDelayMs;
export const AUTO_SEND_INTERVAL_DEFAULT = USER_CONFIG.autoSend.intervalDefaultSeconds;
export const AUTO_SEND_INTERVAL_MIN = USER_CONFIG.autoSend.intervalMinSeconds;
export const AUTO_SEND_INTERVAL_MAX = USER_CONFIG.autoSend.intervalMaxSeconds;
export const AUTO_SEND_MINIMUM_REQUEST_INTERVAL_DEFAULT = USER_CONFIG.autoSend.minimumRequestIntervalDefaultSeconds;
export const AUTO_SEND_MINIMUM_REQUEST_INTERVAL_MIN = USER_CONFIG.autoSend.minimumRequestIntervalMinSeconds;
export const AUTO_SEND_MINIMUM_REQUEST_INTERVAL_MAX = USER_CONFIG.autoSend.minimumRequestIntervalMaxSeconds;
export const IMAGE_PREVIEW_MAX_ITEMS = USER_CONFIG.imagePreviews.maxItems;

export const IMAGE_CACHE_DB_NAME = 'ctrlem-image-cache';
export const IMAGE_CACHE_DB_VERSION = 1;
export const IMAGE_CACHE_STORE = 'images';
export const IMAGE_CACHE_MAX_ITEMS = 3000;
export const IMAGE_CACHE_MAX_BYTES = 1024 * 1024 * 1024;
export const IMAGE_PLACEHOLDER_URL = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2264%22 height=%2264%22%3E%3C/svg%3E';

export const RecordType = Object.freeze({
  LINKS: 'links',
  TEXT: 'text',
  IMAGE: 'image',
  SOUND: 'sound',
  VIDEO: 'video',
});

export const TYPE_LABELS = Object.freeze({
  [RecordType.LINKS]: 'Links',
  [RecordType.TEXT]: 'Text',
  [RecordType.IMAGE]: 'Images',
  [RecordType.SOUND]: 'Sounds',
  [RecordType.VIDEO]: 'Videos',
});

export const TYPE_ORDER = Object.freeze([
  RecordType.LINKS,
  RecordType.TEXT,
  RecordType.IMAGE,
  RecordType.SOUND,
  RecordType.VIDEO,
]);

export const CONFIG = Object.freeze({
  debug: true,
  selectors: Object.freeze({
    commandsHead: '.panel--commands .panel-head',
    resultsPanel: '.panel--results',
    resultsContainer: '#responses-container',
    resultsPagination: '#responses-pagination',
  }),
});

export const UI_IDS = Object.freeze({
  dbButton: 'ctrlem-db-open-button',
  dbManager: 'ctrlem-db-manager',
  dbManagerStatus: 'ctrlem-db-manager-status',
  dbManagerCategoryList: 'ctrlem-db-manager-category-list',
  dbManagerTextarea: 'ctrlem-db-manager-textarea',
  dbManagerImport: 'ctrlem-db-manager-import',
  dbManagerImportAll: 'ctrlem-db-manager-import-all',
  textPrefix: 'ctrlem-db-text',
  mediaPrefix: 'ctrlem-db-media',
  uploadPrefix: 'ctrlem-db-upload',
  imgbbKeyModal: 'ctrlem-db-imgbb-key-modal',
});

export const TEXT_COMMANDS = Object.freeze({
  openPage: Object.freeze({
    key: 'openPage',
    type: RecordType.LINKS,
    panelSelector: '#acc-openPage',
    inputSelector: '#val-openPage',
    label: 'Link database',
    emptyText: 'No links configured',
  }),
  sendMessage: Object.freeze({
    key: 'sendMessage',
    type: RecordType.TEXT,
    panelSelector: '#acc-sendMessage',
    inputSelector: '#val-sendMessage',
    label: 'Phrase database',
    emptyText: 'No phrases configured',
  }),
  writeForMe: Object.freeze({
    key: 'writeForMe',
    type: RecordType.TEXT,
    panelSelector: '#acc-writeForMe',
    inputSelector: '#val-writeForMe-text',
    label: 'Phrase database',
    emptyText: 'No phrases configured',
  }),
  videoOverlay: Object.freeze({
    key: 'videoOverlay',
    type: RecordType.VIDEO,
    panelSelector: '#acc-videoOverlay',
    inputSelector: '#val-videoOverlay',
    label: 'Video database',
    emptyText: 'No videos configured',
  }),
  popupSound: Object.freeze({
    key: 'popupSound',
    type: RecordType.SOUND,
    panelSelector: '#acc-popupSound',
    inputSelector: '#val-popupSound',
    label: 'Sound database',
    emptyText: 'No sounds configured',
  }),
});

export const MEDIA_COMMANDS = Object.freeze({
  popupImage: Object.freeze({
    key: 'popupImage',
    type: RecordType.IMAGE,
    panelSelector: '#acc-popupImage',
    inputSelector: '#val-popupImage',
    dropzoneSelector: '.upload-dropzone[data-upload-for="popupImage"]',
    gallerySelector: '#gallery-popupImage',
  }),
  changeWallpaper: Object.freeze({
    key: 'changeWallpaper',
    type: RecordType.IMAGE,
    panelSelector: '#acc-changeWallpaper',
    inputSelector: '#val-changeWallpaper',
    dropzoneSelector: '.upload-dropzone[data-upload-for="changeWallpaper"]',
    gallerySelector: '#gallery-changeWallpaper',
  }),
});

export const UPLOAD_COMMANDS = Object.freeze({
  popupImage: Object.freeze({
    key: 'popupImage',
    label: 'Popup Image',
    type: RecordType.IMAGE,
    panelSelector: '#acc-popupImage',
    inputSelector: '#val-popupImage',
    nativeDropzoneSelector: '.upload-dropzone[data-upload-for="popupImage"]',
    tools: Object.freeze(['ctrlem', 'imgbb']),
  }),
  changeWallpaper: Object.freeze({
    key: 'changeWallpaper',
    label: 'Change Wallpaper',
    type: RecordType.IMAGE,
    panelSelector: '#acc-changeWallpaper',
    inputSelector: '#val-changeWallpaper',
    nativeDropzoneSelector: '.upload-dropzone[data-upload-for="changeWallpaper"]',
    tools: Object.freeze(['ctrlem', 'imgbb']),
  }),
  popupSound: Object.freeze({
    key: 'popupSound',
    label: 'Popup Sound',
    type: RecordType.SOUND,
    panelSelector: '#acc-popupSound',
    inputSelector: '#val-popupSound',
    nativeDropzoneSelector: '.upload-dropzone[data-upload-for="popupSound"]',
    tools: Object.freeze(['catbox']),
  }),
  videoOverlay: Object.freeze({
    key: 'videoOverlay',
    label: 'Video Overlay',
    type: RecordType.VIDEO,
    panelSelector: '#acc-videoOverlay',
    inputSelector: '#val-videoOverlay',
    tools: Object.freeze(['vidhosting', 'catbox']),
  }),
});

export const ACTION_COMMANDS = Object.freeze({
  sendOrDelete: Object.freeze({
    key: 'sendOrDelete',
    panelSelector: '#acc-sendOrDelete',
    clickOnly: true,
  }),
});

export const INPUT_CAPTURE_COMMANDS = Object.freeze({
  openPage: Object.freeze({
    key: 'openPage',
    type: RecordType.LINKS,
    inputSelector: '#val-openPage',
  }),
  sendMessage: Object.freeze({
    key: 'sendMessage',
    type: RecordType.TEXT,
    inputSelector: '#val-sendMessage',
  }),
  writeForMe: Object.freeze({
    key: 'writeForMe',
    type: RecordType.TEXT,
    inputSelector: '#val-writeForMe-text',
    countSelector: '#val-writeForMe-count',
  }),
  popupImage: Object.freeze({
    key: 'popupImage',
    type: RecordType.IMAGE,
    inputSelector: '#val-popupImage',
  }),
  changeWallpaper: Object.freeze({
    key: 'changeWallpaper',
    type: RecordType.IMAGE,
    inputSelector: '#val-changeWallpaper',
  }),
  popupSound: Object.freeze({
    key: 'popupSound',
    type: RecordType.SOUND,
    inputSelector: '#val-popupSound',
  }),
  videoOverlay: Object.freeze({
    key: 'videoOverlay',
    type: RecordType.VIDEO,
    inputSelector: '#val-videoOverlay',
  }),
});

export const AUTO_SEND_COMMAND_KEYS = Object.freeze([
  'openPage',
  'sendMessage',
  'writeForMe',
  'popupImage',
  'changeWallpaper',
  'popupSound',
  'videoOverlay',
  'sendOrDelete',
]);
