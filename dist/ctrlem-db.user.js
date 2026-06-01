// ==UserScript==
// @name         CtrlEm DB by Strateg
// @namespace    https://discord.com/channels/1465036592262676601/1505167683107160156
// @version      1.3.0
// @description  Adds DB shortcuts and a DB manager to CtrlEm command pages.
// @license      MIT
// @match        https://ctrlem.com/*
// @connect      ctrlem.com
// @connect      api.imgbb.com
// @connect      i.ibb.co
// @connect      catbox.moe
// @connect      files.catbox.moe
// @connect      upload.vidhosting.in
// @connect      stream.vidhosting.in
// @connect      *
// @grant        GM_addStyle
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';
	var LOG_PREFIX = "[CtrlEm DB]";
	var STORAGE_KEY = "ctrlemDbState.v1";
	var UI_STORAGE_KEY = "ctrlemDbUiState.v1";
	var UPLOADER_SETTINGS_STORAGE_KEY = "ctrlemDbUploaderSettings.v1";
	var AUTO_SEND_QUEUE_STORAGE_KEY = "ctrlemDbAutoSendQueue.v1";
	var INPUT_CATEGORY_NAME = "Input";
	var NO_PREVIEWS_MARKER = "- (no previews)";
	var USER_CONFIG = Object.freeze({
		autosaveDelayMs: 500,
		autoSend: Object.freeze({
			intervalDefaultSeconds: 5,
			intervalMinSeconds: 3,
			intervalMaxSeconds: 3600,
			minimumRequestIntervalDefaultSeconds: 3,
			minimumRequestIntervalMinSeconds: 1,
			minimumRequestIntervalMaxSeconds: 60,
			queueLockTtlMs: 1200,
			heartbeatMs: 2e3,
			heartbeatTimeoutMs: 9e3,
			runnerMs: 200,
			managerRefreshMs: 200
		}),
		imagePreviews: Object.freeze({ maxItems: 100 }),
		ui: Object.freeze({
			saveDelayMs: 120,
			scrollSaveDelayMs: 120,
			domObserverDelayMs: 120,
			modalCloseDelayMs: 250,
			uploadSessionCloseDelayMs: 700
		}),
		upload: Object.freeze({
			delayMs: 3e3,
			ctrlemImageMaxBytes: 5 * 1024 * 1024,
			ctrlemSoundMaxBytes: 15 * 1024 * 1024,
			imgbbMaxBytes: 32 * 1024 * 1024,
			vidhostingMaxBytes: 100 * 1024 * 1024,
			externalRequestTimeoutMs: 12e4
		}),
		linkCheck: Object.freeze({
			timeoutMs: 15e3,
			concurrency: 4
		}),
		imageCache: Object.freeze({
			fetchTimeoutMs: 6e4,
			pruneDelayMs: 2e3
		}),
		inputCapture: Object.freeze({
			maxTextLength: 200,
			countMin: 1,
			countMax: 5
		})
	});
	var AUTOSAVE_DELAY = USER_CONFIG.autosaveDelayMs;
	var AUTO_SEND_INTERVAL_DEFAULT = USER_CONFIG.autoSend.intervalDefaultSeconds;
	var AUTO_SEND_INTERVAL_MIN = USER_CONFIG.autoSend.intervalMinSeconds;
	var AUTO_SEND_INTERVAL_MAX = USER_CONFIG.autoSend.intervalMaxSeconds;
	var AUTO_SEND_MINIMUM_REQUEST_INTERVAL_DEFAULT = USER_CONFIG.autoSend.minimumRequestIntervalDefaultSeconds;
	var AUTO_SEND_MINIMUM_REQUEST_INTERVAL_MIN = USER_CONFIG.autoSend.minimumRequestIntervalMinSeconds;
	var AUTO_SEND_MINIMUM_REQUEST_INTERVAL_MAX = USER_CONFIG.autoSend.minimumRequestIntervalMaxSeconds;
	var IMAGE_PREVIEW_MAX_ITEMS = USER_CONFIG.imagePreviews.maxItems;
	var IMAGE_CACHE_DB_NAME = "ctrlem-image-cache";
	var IMAGE_CACHE_STORE = "images";
	var IMAGE_PLACEHOLDER_URL = "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2264%22 height=%2264%22%3E%3C/svg%3E";
	var RecordType = Object.freeze({
		LINKS: "links",
		TEXT: "text",
		IMAGE: "image",
		SOUND: "sound",
		VIDEO: "video"
	});
	var TYPE_LABELS = Object.freeze({
		[RecordType.LINKS]: "Links",
		[RecordType.TEXT]: "Text",
		[RecordType.IMAGE]: "Images",
		[RecordType.SOUND]: "Sounds",
		[RecordType.VIDEO]: "Videos"
	});
	var TYPE_ORDER = Object.freeze([
		RecordType.LINKS,
		RecordType.TEXT,
		RecordType.IMAGE,
		RecordType.SOUND,
		RecordType.VIDEO
	]);
	var CONFIG = Object.freeze({
		debug: true,
		selectors: Object.freeze({
			commandsHead: ".panel--commands .panel-head",
			resultsPanel: ".panel--results",
			resultsContainer: "#responses-container",
			resultsPagination: "#responses-pagination"
		})
	});
	var UI_IDS = Object.freeze({
		dbButton: "ctrlem-db-open-button",
		dbManager: "ctrlem-db-manager",
		dbManagerStatus: "ctrlem-db-manager-status",
		dbManagerCategoryList: "ctrlem-db-manager-category-list",
		dbManagerTextarea: "ctrlem-db-manager-textarea",
		dbManagerImport: "ctrlem-db-manager-import",
		dbManagerImportAll: "ctrlem-db-manager-import-all",
		textPrefix: "ctrlem-db-text",
		mediaPrefix: "ctrlem-db-media",
		uploadPrefix: "ctrlem-db-upload",
		imgbbKeyModal: "ctrlem-db-imgbb-key-modal"
	});
	var TEXT_COMMANDS = Object.freeze({
		openPage: Object.freeze({
			key: "openPage",
			type: RecordType.LINKS,
			panelSelector: "#acc-openPage",
			inputSelector: "#val-openPage",
			label: "Link database",
			emptyText: "No links configured"
		}),
		sendMessage: Object.freeze({
			key: "sendMessage",
			type: RecordType.TEXT,
			panelSelector: "#acc-sendMessage",
			inputSelector: "#val-sendMessage",
			label: "Phrase database",
			emptyText: "No phrases configured"
		}),
		writeForMe: Object.freeze({
			key: "writeForMe",
			type: RecordType.TEXT,
			panelSelector: "#acc-writeForMe",
			inputSelector: "#val-writeForMe-text",
			label: "Phrase database",
			emptyText: "No phrases configured"
		}),
		videoOverlay: Object.freeze({
			key: "videoOverlay",
			type: RecordType.VIDEO,
			panelSelector: "#acc-videoOverlay",
			inputSelector: "#val-videoOverlay",
			label: "Video database",
			emptyText: "No videos configured"
		}),
		popupSound: Object.freeze({
			key: "popupSound",
			type: RecordType.SOUND,
			panelSelector: "#acc-popupSound",
			inputSelector: "#val-popupSound",
			label: "Sound database",
			emptyText: "No sounds configured"
		})
	});
	var MEDIA_COMMANDS = Object.freeze({
		popupImage: Object.freeze({
			key: "popupImage",
			type: RecordType.IMAGE,
			panelSelector: "#acc-popupImage",
			inputSelector: "#val-popupImage",
			dropzoneSelector: ".upload-dropzone[data-upload-for=\"popupImage\"]",
			gallerySelector: "#gallery-popupImage"
		}),
		changeWallpaper: Object.freeze({
			key: "changeWallpaper",
			type: RecordType.IMAGE,
			panelSelector: "#acc-changeWallpaper",
			inputSelector: "#val-changeWallpaper",
			dropzoneSelector: ".upload-dropzone[data-upload-for=\"changeWallpaper\"]",
			gallerySelector: "#gallery-changeWallpaper"
		})
	});
	var UPLOAD_COMMANDS = Object.freeze({
		popupImage: Object.freeze({
			key: "popupImage",
			label: "Popup Image",
			type: RecordType.IMAGE,
			panelSelector: "#acc-popupImage",
			inputSelector: "#val-popupImage",
			nativeDropzoneSelector: ".upload-dropzone[data-upload-for=\"popupImage\"]",
			tools: Object.freeze(["ctrlem", "imgbb"])
		}),
		changeWallpaper: Object.freeze({
			key: "changeWallpaper",
			label: "Change Wallpaper",
			type: RecordType.IMAGE,
			panelSelector: "#acc-changeWallpaper",
			inputSelector: "#val-changeWallpaper",
			nativeDropzoneSelector: ".upload-dropzone[data-upload-for=\"changeWallpaper\"]",
			tools: Object.freeze(["ctrlem", "imgbb"])
		}),
		popupSound: Object.freeze({
			key: "popupSound",
			label: "Popup Sound",
			type: RecordType.SOUND,
			panelSelector: "#acc-popupSound",
			inputSelector: "#val-popupSound",
			nativeDropzoneSelector: ".upload-dropzone[data-upload-for=\"popupSound\"]",
			tools: Object.freeze(["catbox"])
		}),
		videoOverlay: Object.freeze({
			key: "videoOverlay",
			label: "Video Overlay",
			type: RecordType.VIDEO,
			panelSelector: "#acc-videoOverlay",
			inputSelector: "#val-videoOverlay",
			tools: Object.freeze(["vidhosting", "catbox"])
		})
	});
	var ACTION_COMMANDS = Object.freeze({ sendOrDelete: Object.freeze({
		key: "sendOrDelete",
		panelSelector: "#acc-sendOrDelete",
		clickOnly: true
	}) });
	var INPUT_CAPTURE_COMMANDS = Object.freeze({
		openPage: Object.freeze({
			key: "openPage",
			type: RecordType.LINKS,
			inputSelector: "#val-openPage"
		}),
		sendMessage: Object.freeze({
			key: "sendMessage",
			type: RecordType.TEXT,
			inputSelector: "#val-sendMessage"
		}),
		writeForMe: Object.freeze({
			key: "writeForMe",
			type: RecordType.TEXT,
			inputSelector: "#val-writeForMe-text",
			countSelector: "#val-writeForMe-count"
		}),
		popupImage: Object.freeze({
			key: "popupImage",
			type: RecordType.IMAGE,
			inputSelector: "#val-popupImage"
		}),
		changeWallpaper: Object.freeze({
			key: "changeWallpaper",
			type: RecordType.IMAGE,
			inputSelector: "#val-changeWallpaper"
		}),
		popupSound: Object.freeze({
			key: "popupSound",
			type: RecordType.SOUND,
			inputSelector: "#val-popupSound"
		}),
		videoOverlay: Object.freeze({
			key: "videoOverlay",
			type: RecordType.VIDEO,
			inputSelector: "#val-videoOverlay"
		})
	});
	var AUTO_SEND_COMMAND_KEYS = Object.freeze([
		"openPage",
		"sendMessage",
		"writeForMe",
		"popupImage",
		"changeWallpaper",
		"popupSound",
		"videoOverlay",
		"sendOrDelete"
	]);
	function parseLines(rawText) {
		return String(rawText || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
	}
	function isNoPreviewsMarker(value) {
		return String(value || "").trim().toLowerCase() === NO_PREVIEWS_MARKER;
	}
	function hasNoPreviewsMarker(rawText) {
		const lines = parseLines(rawText);
		return lines.length > 0 && isNoPreviewsMarker(lines[0]);
	}
	function getCategoryDataLines(rawText) {
		const lines = parseLines(rawText);
		return hasNoPreviewsMarker(rawText) ? lines.slice(1) : lines;
	}
	function parseLabeledUrlLine(rawText) {
		const text = String(rawText || "").trim();
		if (!text) return null;
		const match = text.match(/^(\S+)(?:\s+([\s\S]+))?$/);
		if (!match) return null;
		const url = match[1].trim();
		const label = String(match[2] || "").trim();
		return {
			url,
			label,
			display: label || url
		};
	}
	function getLineItem(type, rawText) {
		if (type === RecordType.VIDEO || type === RecordType.SOUND) {
			const media = parseLabeledUrlLine(rawText);
			return media ? {
				value: media.url,
				label: media.label,
				display: media.display,
				title: String(rawText || "").trim()
			} : null;
		}
		const value = String(rawText || "").trim();
		return value ? {
			value,
			display: value,
			title: value
		} : null;
	}
	function isHttpUrl(value) {
		try {
			const url = new URL(String(value || "").trim());
			return url.protocol === "http:" || url.protocol === "https:";
		} catch {
			return false;
		}
	}
	function formatCategoryContent(rawText) {
		const lines = parseLines(rawText);
		return lines.length > 0 ? `${lines.join("\n")}\n` : "";
	}
	function clampAutoSendInterval(value) {
		const parsed = Number.parseInt(String(value), 10);
		if (!Number.isFinite(parsed)) return AUTO_SEND_INTERVAL_DEFAULT;
		return Math.min(AUTO_SEND_INTERVAL_MAX, Math.max(AUTO_SEND_INTERVAL_MIN, parsed));
	}
	function clampMinimumRequestInterval(value) {
		const parsed = Number.parseInt(String(value), 10);
		if (!Number.isFinite(parsed)) return AUTO_SEND_MINIMUM_REQUEST_INTERVAL_DEFAULT;
		return Math.min(AUTO_SEND_MINIMUM_REQUEST_INTERVAL_MAX, Math.max(AUTO_SEND_MINIMUM_REQUEST_INTERVAL_MIN, parsed));
	}
	function createId(prefix = "cat") {
		if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
		return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
	}
	function clonePlain(value) {
		return JSON.parse(JSON.stringify(value));
	}
	function normalizeType(type) {
		return TYPE_ORDER.includes(type) ? type : RecordType.TEXT;
	}
	function getUploadImageUrl(uploadId) {
		return `${window.location.origin}/api/uploads/${encodeURIComponent(uploadId)}/image`;
	}
	function getLabelFromUrl(url, fallback = "Media") {
		try {
			const lastPart = new URL(url, window.location.href).pathname.split("/").filter(Boolean).pop();
			return lastPart ? decodeURIComponent(lastPart) : fallback;
		} catch {
			return fallback;
		}
	}
	function getSafeFileName(value, fallback) {
		return String(value || fallback || "db").trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "_").slice(0, 80) || fallback || "db";
	}
	function getCategoryNameFromFileName(fileName) {
		return String(fileName || "").replace(/\.[^.]+$/, "").trim() || "Imported";
	}
	function normalizeMediaItem(value, fallbackTitle) {
		if (typeof value === "string") {
			const url = value.trim();
			return url ? {
				url,
				previewUrl: url,
				title: fallbackTitle || getLabelFromUrl(url)
			} : null;
		}
		const url = String(value?.url || "").trim();
		if (!url) return null;
		const uploadId = String(value?.uploadId || value?.id || "").trim();
		return {
			url,
			previewUrl: String(value?.previewUrl || value?.src || url).trim(),
			title: String(value?.title || fallbackTitle || getLabelFromUrl(url)).trim(),
			uploadId,
			canDelete: Boolean(value?.canDelete || uploadId || value?.deleteButton),
			deleteButton: value?.deleteButton instanceof Element ? value.deleteButton : null
		};
	}
	function uniqueMediaItems(items) {
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
	function uniqueStrings(values) {
		return Array.from(new Set(values.filter(Boolean)));
	}
	var defaultDb_default = "{  \"version\": 2,  \"exportedAt\": \"2026-05-29T16:16:27.363Z\",  \"autoSendIntervalSeconds\": 300,  \"minimumRequestIntervalSeconds\": 3,  \"types\": {    \"links\": [      {        \"name\": \"Hypnotube: Latex\",        \"content\": \"https://hypnotube.com/video/dreaming-latex-36543.html\\n\"      }    ],    \"text\": [      {        \"name\": \"Hello\",        \"content\": \"Hey there. Ready to play?\\nClearing screens is no fun at all!\\nI wish you would think less at work\\n\"      }    ],    \"image\": [      {        \"name\": \"Girls 2D\",        \"content\": \"https://i.ibb.co/Q7dvRLXj/popup-1778972568083.jpg\\nhttps://i.ibb.co/27XX01xX/ssdfsdf.png\\n\"      },      {        \"name\": \"Feets\",        \"content\": \"https://ctrlem.com/api/uploads/520be0f5-9c14-4714-8ce5-d6e3bf0b2381/image\\n\"      },      {        \"name\": \"Wallpapers\",        \"content\": \"https://i.ibb.co/TxDKQwPL/qxqmfk8.png\\n\"      }    ],    \"sound\": [      {        \"name\": \"Kisses\",        \"content\": \"https://files.catbox.moe/b8pqxq.mp3 23 sec kisses\\n\"      }    ],    \"video\": [      {        \"name\": \"Shiny\",        \"content\": \"https://stream.vidhosting.in/videos/cb6c7a99.mp4 Soundy strength\\n\"      },      {        \"name\": \"Thights\",        \"content\": \"https://stream.vidhosting.in/videos/cb6c7a99.mp4 Soundy strength\\n\"      },      {        \"name\": \"Goth\",        \"content\": \"https://stream.vidhosting.in/videos/0387432f.mp4 goth walk with sound and clothed tits\\n\"      },      {        \"name\": \"Voice\",        \"content\": \"https://stream.vidhosting.in/videos/6447b981.mp4 Triggers you\\n\"      }    ]  }}\n";
	var EMPTY_DEFAULT_DB = Object.freeze({ types: Object.freeze({}) });
	function readDefaultDb() {
		try {
			const parsed = JSON.parse(defaultDb_default);
			return parsed && typeof parsed === "object" ? parsed : EMPTY_DEFAULT_DB;
		} catch {
			return EMPTY_DEFAULT_DB;
		}
	}
	function createEmptyCategory(type) {
		return {
			id: createId(type),
			name: "Untitled",
			content: ""
		};
	}
	function createSeedState() {
		const defaultDb = readDefaultDb();
		const types = TYPE_ORDER.reduce((result, type) => {
			result[type] = (Array.isArray(defaultDb.types?.[type]) ? defaultDb.types[type] : []).map((category) => ({
				id: createId(type),
				name: String(category?.name || "Untitled").trim() || "Untitled",
				content: formatCategoryContent(category?.content)
			}));
			if (result[type].length === 0) result[type].push(createEmptyCategory(type));
			return result;
		}, {});
		return {
			version: 2,
			activeType: RecordType.LINKS,
			autoSave: true,
			autoSendIntervalSeconds: clampAutoSendInterval(defaultDb.autoSendIntervalSeconds),
			minimumRequestIntervalSeconds: clampMinimumRequestInterval(defaultDb.minimumRequestIntervalSeconds),
			types
		};
	}
	function normalizeCategory(category, type) {
		return {
			id: String(category?.id || createId(type)),
			name: String(category?.name || "Untitled").trim() || "Untitled",
			content: formatCategoryContent(category?.content)
		};
	}
	function normalizeDbState(rawState) {
		const seed = createSeedState();
		const source = rawState && typeof rawState === "object" ? rawState : {};
		const normalized = {
			version: 2,
			activeType: source.activeType ? normalizeType(source.activeType) : RecordType.LINKS,
			autoSave: source.autoSave !== false,
			autoSendIntervalSeconds: clampAutoSendInterval(source.autoSendIntervalSeconds),
			minimumRequestIntervalSeconds: clampMinimumRequestInterval(source.minimumRequestIntervalSeconds),
			types: {}
		};
		TYPE_ORDER.forEach((type) => {
			const rawCategories = Array.isArray(source.types?.[type]) ? source.types[type] : seed.types[type];
			normalized.types[type] = rawCategories.map((category) => normalizeCategory(category, type));
			if (normalized.types[type].length === 0) normalized.types[type].push(createEmptyCategory(type));
		});
		return normalized;
	}
	function resetManagerSelections(state, selection) {
		TYPE_ORDER.forEach((type) => {
			selection.selectedCategoryByType[type] = state.types[type][0]?.id || null;
		});
	}
	function getUserCategories(state, type) {
		const normalizedType = normalizeType(type);
		if (!Array.isArray(state.types[normalizedType])) state.types[normalizedType] = [];
		if (state.types[normalizedType].length === 0) state.types[normalizedType].push(createEmptyCategory(normalizedType));
		return state.types[normalizedType];
	}
	function normalizeAllCategoryContent(state) {
		TYPE_ORDER.forEach((type) => {
			(Array.isArray(state?.types?.[type]) ? state.types[type] : []).forEach((category) => {
				category.content = formatCategoryContent(category.content);
			});
		});
	}
	function getSelectedCategory(state, selection, type) {
		const categories = getUserCategories(state, type);
		const selectedId = selection.selectedCategoryByType[type];
		let category = categories.find((item) => item.id === selectedId);
		if (!category) {
			category = categories[0];
			selection.selectedCategoryByType[type] = category?.id || null;
		}
		return category || null;
	}
	function getCategories(state, type) {
		return getUserCategories(state, type).map((category) => ({
			id: category.id,
			name: category.name,
			content: category.content,
			items: parseLines(category.content)
		}));
	}
	function getDatabaseSummary(state) {
		return TYPE_ORDER.reduce((summary, type) => {
			const categories = getUserCategories(state, type);
			summary[type] = {
				categories: categories.length,
				items: categories.reduce((count, category) => count + parseLines(category.content).length, 0)
			};
			return summary;
		}, {});
	}
	function getStaticMediaCategories(state, type) {
		return getUserCategories(state, type).map((category) => ({
			id: category.id,
			name: category.name,
			disablePreviews: type === RecordType.IMAGE && hasNoPreviewsMarker(category.content),
			items: getCategoryDataLines(category.content).map((url) => normalizeMediaItem(url)).filter(Boolean)
		}));
	}
	function getRecordKey(type, value) {
		const trimmed = String(value || "").trim();
		if (type === RecordType.VIDEO || type === RecordType.SOUND) return parseLabeledUrlLine(trimmed)?.url || "";
		return trimmed;
	}
	function hasStoredValue(state, type, value) {
		const key = getRecordKey(type, value);
		if (!key) return true;
		return getUserCategories(state, type).some((category) => parseLines(category.content).some((line) => getRecordKey(type, line) === key));
	}
	function getOrCreateInputCategory(state, type) {
		const categories = getUserCategories(state, type);
		let category = categories.find((item) => item.name.toLowerCase() === INPUT_CATEGORY_NAME.toLowerCase());
		if (!category) {
			category = {
				id: createId(type),
				name: INPUT_CATEGORY_NAME,
				content: ""
			};
			categories.push(category);
		}
		return category;
	}
	function appendInputValue(state, selection, type, value) {
		const category = getOrCreateInputCategory(state, type);
		const lines = parseLines(category.content);
		const line = String(value || "").trim();
		const key = getRecordKey(type, line);
		if (key && !lines.some((item) => getRecordKey(type, item) === key)) {
			lines.push(line);
			category.content = formatCategoryContent(lines.join("\n"));
		}
		selection.selectedCategoryByType[type] ||= category.id;
		return category;
	}
	function makeUniqueCategoryName(state, type, name, ignoreId = "") {
		const base = String(name || "Untitled").trim() || "Untitled";
		const names = new Set(getUserCategories(state, type).filter((category) => category.id !== ignoreId).map((category) => category.name));
		if (!names.has(base)) return base;
		let index = 2;
		let candidate = `${base} (${index})`;
		while (names.has(candidate)) {
			index += 1;
			candidate = `${base} (${index})`;
		}
		return candidate;
	}
	function createExportPayload(state) {
		return {
			version: 2,
			exportedAt: new Date().toISOString(),
			autoSendIntervalSeconds: clampAutoSendInterval(state.autoSendIntervalSeconds),
			minimumRequestIntervalSeconds: clampMinimumRequestInterval(state.minimumRequestIntervalSeconds),
			types: TYPE_ORDER.reduce((result, type) => {
				result[type] = getUserCategories(state, type).map((category) => ({
					name: category.name,
					content: formatCategoryContent(category.content)
				}));
				return result;
			}, {})
		};
	}
	function parseImportFile(file, text, activeType, log) {
		const nameFromFile = getCategoryNameFromFileName(file.name);
		if (!file.name.toLowerCase().endsWith(".json")) return [{
			type: activeType,
			name: nameFromFile,
			content: text
		}];
		let parsed = null;
		try {
			parsed = JSON.parse(text);
		} catch (error) {
			log("error", "Invalid JSON import", {
				name: file.name,
				message: error?.message || String(error)
			});
			return [];
		}
		const additions = [];
		const pushCategory = (type, category, fallbackName) => {
			if (!category || typeof category !== "object") return;
			const content = category.content !== void 0 ? category.content : Array.isArray(category.items) ? category.items.join("\n") : "";
			additions.push({
				type,
				name: String(category.name || fallbackName || "Imported").trim() || "Imported",
				content: String(content || "")
			});
		};
		if (Array.isArray(parsed)) {
			parsed.forEach((category, index) => {
				pushCategory(category?.type || activeType, category, `${nameFromFile}-${index + 1}`);
			});
			return additions;
		}
		if (parsed?.types && typeof parsed.types === "object") {
			TYPE_ORDER.forEach((type) => {
				(Array.isArray(parsed.types[type]) ? parsed.types[type] : []).forEach((category, index) => pushCategory(type, category, `${TYPE_LABELS[type]}-${index + 1}`));
			});
			return additions;
		}
		if (parsed?.name || parsed?.content) {
			pushCategory(parsed.type || activeType, parsed, nameFromFile);
			return additions;
		}
		log("warn", "JSON import did not contain categories", { name: file.name });
		return additions;
	}
	var MANAGER_TABS = Object.freeze({
		EDITOR: "editor",
		SETTINGS: "settings",
		INFO: "info"
	});
	function normalizeManagerTab(value) {
		const tab = String(value || "");
		return Object.values(MANAGER_TABS).includes(tab) ? tab : MANAGER_TABS.EDITOR;
	}
	function createUiState() {
		return {
			version: 2,
			manager: {
				activeTab: MANAGER_TABS.EDITOR,
				selectedCategoryByType: {},
				categoryListScrollTop: 0
			},
			pickers: {},
			uploads: {}
		};
	}
	function normalizeStringMap(value) {
		return Object.entries(value && typeof value === "object" ? value : {}).reduce((result, [key, item]) => {
			result[key] = item == null ? "" : String(item);
			return result;
		}, {});
	}
	function normalizeUiState(rawState) {
		const source = rawState && typeof rawState === "object" ? rawState : {};
		const sourceVersion = Number(source.version) || 0;
		const manager = source.manager && typeof source.manager === "object" ? source.manager : {};
		const rawPickers = source.pickers && typeof source.pickers === "object" ? source.pickers : {};
		const rawUploads = source.uploads && typeof source.uploads === "object" ? source.uploads : {};
		return {
			version: 2,
			manager: {
				activeTab: normalizeManagerTab(manager.activeTab),
				selectedCategoryByType: normalizeStringMap(manager.selectedCategoryByType),
				categoryListScrollTop: Math.max(0, Number(manager.categoryListScrollTop) || 0)
			},
			pickers: Object.entries(rawPickers).reduce((result, [commandKey, value]) => {
				const picker = value && typeof value === "object" ? value : {};
				result[commandKey] = {
					categoryId: String(picker.categoryId || ""),
					categoryName: String(picker.categoryName || ""),
					value: String(picker.value || ""),
					itemIndex: Number.isFinite(Number(picker.itemIndex)) ? Math.max(-1, Number(picker.itemIndex)) : -1,
					scrollTop: Math.max(0, Number(picker.scrollTop) || 0)
				};
				return result;
			}, {}),
			uploads: Object.entries(rawUploads).reduce((result, [commandKey, value]) => {
				result[commandKey] = { collapsed: commandKey === "popupImage" && sourceVersion < 2 ? true : (value && typeof value === "object" ? value : {}).collapsed !== false };
				return result;
			}, {})
		};
	}
	function getPickerUiState(uiState, commandKey) {
		if (!uiState.pickers[commandKey]) uiState.pickers[commandKey] = {
			categoryId: "",
			categoryName: "",
			value: "",
			itemIndex: -1,
			scrollTop: 0
		};
		return uiState.pickers[commandKey];
	}
	function getUploadUiState(uiState, commandKey) {
		if (!uiState.uploads) uiState.uploads = {};
		if (!uiState.uploads[commandKey]) uiState.uploads[commandKey] = { collapsed: true };
		return uiState.uploads[commandKey];
	}
	function isCaptureValueValid(config, value) {
		if (!value) return false;
		if (config.type === RecordType.LINKS || config.type === RecordType.IMAGE || config.type === RecordType.SOUND || config.type === RecordType.VIDEO) return isHttpUrl(value);
		if (config.key !== "writeForMe") return true;
		const count = Number.parseInt(document.querySelector(config.countSelector)?.value || "1", 10);
		return value.length <= USER_CONFIG.inputCapture.maxTextLength && count >= USER_CONFIG.inputCapture.countMin && count <= USER_CONFIG.inputCapture.countMax;
	}
	function mountInputCapture(options) {
		const { captureInputValue, log } = options;
		if (document.documentElement.dataset.ctrlemDbInputCapture === "true") return false;
		document.documentElement.dataset.ctrlemDbInputCapture = "true";
		document.addEventListener("click", (event) => {
			if (!(event.target instanceof Element)) return;
			const button = event.target.closest("[data-send]");
			if (!button) return;
			if (button.disabled) return;
			const config = INPUT_CAPTURE_COMMANDS[button.dataset.send];
			if (!config) return;
			captureInputValue(config).catch((error) => {
				log("error", "Failed to capture input", {
					command: config.key,
					message: error?.message || String(error)
				});
			});
		}, true);
		log("debug", "Input capture mounted");
		return true;
	}
	function createElement(tagName, options = {}, children = []) {
		const element = document.createElement(tagName);
		if (options.id) element.id = options.id;
		if (options.className) element.className = options.className;
		if (options.text !== void 0) element.textContent = options.text;
		if (options.value !== void 0) element.value = options.value;
		if (options.title) element.title = options.title;
		if (options.type) element.type = options.type;
		if (options.checked !== void 0) element.checked = Boolean(options.checked);
		if (options.attrs) Object.entries(options.attrs).forEach(([name, value]) => {
			element.setAttribute(name, value);
		});
		if (options.dataset) Object.entries(options.dataset).forEach(([name, value]) => {
			element.dataset[name] = value;
		});
		children.forEach((child) => element.appendChild(child));
		return element;
	}
	function downloadTextFile(filename, content, mimeType) {
		const blob = new Blob([content], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const link = createElement("a", { attrs: {
			href: url,
			download: filename
		} });
		document.body.appendChild(link);
		link.click();
		link.remove();
		window.setTimeout(() => URL.revokeObjectURL(url), USER_CONFIG.ui.modalCloseDelayMs);
	}
	function getMediaPickerId(commandKey) {
		return `${UI_IDS.mediaPrefix}-${commandKey}`;
	}
	function updateMediaPicker(picker, options) {
		return typeof picker?.ctrlemDbRefresh === "function" ? picker.ctrlemDbRefresh(options) : false;
	}
	function createMediaPicker(options) {
		const { config, categories, input, uiState = {}, onSelect, onDelete, onCategoryChange, onUiStateChange, onAddCategory, onRenameCategory, onPreviewToggle, setImagePreviewSource } = options;
		const picker = createElement("div", {
			id: getMediaPickerId(config.key),
			className: "ctrlem-db-media-picker",
			attrs: { "aria-label": `${config.key} DB picker` },
			dataset: {
				command: config.key,
				type: config.type
			}
		});
		const state = {
			categories,
			input,
			uiState,
			selectedValue: "",
			selectedIndex: -1,
			hasSelectedIndex: false
		};
		if (categories.length === 0) {
			picker.appendChild(createElement("div", {
				className: "ctrlem-db-empty",
				text: "No media configured"
			}));
			return picker;
		}
		const select = createElement("select", {
			id: `${getMediaPickerId(config.key)}-category`,
			className: "form-select ctrlem-db-media-select"
		});
		const grid = createElement("div", {
			className: "ctrlem-db-media-grid",
			attrs: { role: "list" }
		});
		const syncSelection = () => {
			state.selectedValue = String(state.uiState?.value || state.input.value || "").trim();
			state.selectedIndex = Number(state.uiState?.itemIndex);
			state.hasSelectedIndex = Number.isFinite(state.selectedIndex) && state.selectedIndex >= 0;
		};
		const populateSelect = () => {
			select.replaceChildren(...state.categories.map((category, index) => createElement("option", {
				text: `${category.name} (${category.items.length})`,
				attrs: { value: String(index) }
			})));
		};
		const addButton = createElement("button", {
			className: "ctrlem-db-category-tool-button",
			text: "+",
			title: "Add category",
			type: "button",
			attrs: { "aria-label": "Add category" }
		});
		const renameButton = createElement("button", {
			className: "ctrlem-db-category-tool-button",
			text: "✎",
			title: "Edit category",
			type: "button",
			attrs: { "aria-label": "Edit category" }
		});
		const previewToggle = createElement("input", {
			className: "ctrlem-db-preview-toggle-input",
			type: "checkbox",
			checked: true,
			attrs: { "aria-label": "" }
		});
		const previewControl = createElement("label", {
			className: "ctrlem-db-preview-toggle",
			title: "Show previews",
			dataset: { tooltip: "Show previews" }
		}, [previewToggle, createElement("span", { text: "" })]);
		const toolbarChildren = config.type === RecordType.IMAGE ? [
			select,
			previewControl,
			addButton,
			renameButton
		] : [
			select,
			addButton,
			renameButton
		];
		addButton.addEventListener("click", () => onAddCategory?.());
		renameButton.addEventListener("click", () => {
			const category = state.categories[Number(select.value) || 0];
			if (category?.id && category.id !== "default") onRenameCategory?.(category.id);
		});
		previewToggle.addEventListener("change", () => {
			const categoryIndex = Number(select.value) || 0;
			const category = state.categories[categoryIndex];
			if (!category?.id || category.id === "default" || category.items.length > IMAGE_PREVIEW_MAX_ITEMS) return;
			category.disablePreviews = !previewToggle.checked;
			renderMediaCategory(categoryIndex);
			onPreviewToggle?.(category.id, previewToggle.checked);
		});
		picker.appendChild(createElement("div", { className: "ctrlem-db-media-toolbar ctrlem-db-category-toolbar" }, toolbarChildren));
		picker.appendChild(grid);
		const getCategoryIndex = () => {
			const byId = state.categories.findIndex((category) => category.id && category.id === state.uiState?.categoryId);
			if (byId >= 0) return byId;
			const byName = state.categories.findIndex((category) => category.name === state.uiState?.categoryName);
			if (byName >= 0) return byName;
			const byValue = state.categories.findIndex((category) => category.items.some((item) => item?.url === state.selectedValue));
			return byValue >= 0 ? byValue : 0;
		};
		const renderMediaCategory = (categoryIndex, renderOptions = {}) => {
			syncSelection();
			const category = state.categories[categoryIndex];
			const scrollTop = renderOptions.scrollTop;
			picker.dataset.categoryId = category?.id || "";
			picker.dataset.category = category?.name || "";
			renameButton.disabled = Boolean(!category || category.id === "default");
			if (config.type === RecordType.IMAGE) {
				const isTooLarge = Boolean(category && category.items.length > IMAGE_PREVIEW_MAX_ITEMS);
				previewToggle.checked = Boolean(category && !category.disablePreviews && !isTooLarge);
				previewToggle.disabled = Boolean(!category || category.id === "default" || isTooLarge);
				previewControl.title = isTooLarge ? `Disabled: ${IMAGE_PREVIEW_MAX_ITEMS}+ files` : "Show previews";
				previewControl.dataset.tooltip = previewControl.title;
			}
			if (!category || category.items.length === 0) {
				grid.replaceChildren(createElement("div", {
					className: "ctrlem-db-empty",
					text: "No media in this category"
				}));
				if (scrollTop !== void 0) grid.scrollTop = Math.max(0, Number(scrollTop) || 0);
				return;
			}
			const reusableTiles = new Map(Array.from(grid.querySelectorAll(".ctrlem-db-media-tile")).map((tile) => [tile.dataset.itemKey, tile]));
			const tiles = category.items.map((item, itemIndex) => {
				const tileOptions = {
					item,
					itemIndex,
					config,
					category,
					input: state.input,
					selectedValue: state.selectedValue,
					selectedIndex: state.selectedIndex,
					hasSelectedIndex: state.hasSelectedIndex,
					onDelete,
					setImagePreviewSource
				};
				const reusableTile = reusableTiles.get(getImageTileKey(category, item, itemIndex));
				if (canReuseImageTile(reusableTile, category, item)) {
					updateImageTile(reusableTile, tileOptions);
					return reusableTile;
				}
				return createImageTile(tileOptions);
			});
			grid.replaceChildren(...tiles);
			if (scrollTop !== void 0) grid.scrollTop = Math.max(0, Number(scrollTop) || 0);
		};
		select.addEventListener("change", () => {
			const categoryIndex = Number(select.value) || 0;
			renderMediaCategory(categoryIndex);
			grid.scrollTop = 0;
			const category = state.categories[categoryIndex];
			onUiStateChange?.({
				categoryId: category?.id || "",
				categoryName: category?.name || "",
				itemIndex: -1,
				scrollTop: 0
			});
			onCategoryChange?.({
				command: config.key,
				type: config.type,
				category: category?.name
			});
		});
		picker.ctrlemDbRefresh = (nextOptions = {}) => {
			const nextCategories = Array.isArray(nextOptions.categories) ? nextOptions.categories : [];
			if (!canReconcileCategoryStructure(state.categories) || !canReconcileCategoryStructure(nextCategories)) return false;
			if (nextOptions.input && nextOptions.input !== state.input) return false;
			const scrollTop = grid.scrollTop;
			state.categories = nextCategories;
			state.uiState = nextOptions.uiState || {};
			syncSelection();
			populateSelect();
			const categoryIndex = getCategoryIndex();
			select.value = String(categoryIndex);
			renderMediaCategory(categoryIndex, { scrollTop });
			return true;
		};
		let scrollTimer = 0;
		grid.addEventListener("scroll", () => {
			window.clearTimeout(scrollTimer);
			scrollTimer = window.setTimeout(() => {
				onUiStateChange?.({ scrollTop: grid.scrollTop });
			}, USER_CONFIG.ui.scrollSaveDelayMs);
		});
		grid.addEventListener("click", (event) => {
			if (!(event.target instanceof Element)) return;
			const button = event.target.closest(".ctrlem-db-media-tile");
			if (!button || !grid.contains(button)) return;
			onSelect({
				input: state.input,
				picker,
				button
			});
		});
		grid.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			if (!(event.target instanceof Element)) return;
			if (event.target.closest(".ctrlem-db-media-delete")) return;
			const button = event.target.closest(".ctrlem-db-media-tile");
			if (!button || !grid.contains(button)) return;
			event.preventDefault();
			onSelect({
				input: state.input,
				picker,
				button
			});
		});
		populateSelect();
		syncSelection();
		const initialCategoryIndex = getCategoryIndex();
		select.value = String(initialCategoryIndex);
		renderMediaCategory(initialCategoryIndex);
		window.setTimeout(() => {
			grid.scrollTop = Math.max(0, Number(state.uiState?.scrollTop) || 0);
		}, 0);
		return picker;
	}
	function getCategoryKey(category) {
		return String(category?.id || category?.name || "").trim();
	}
	function canReconcileCategoryStructure(categories) {
		if (!Array.isArray(categories) || categories.length === 0) return false;
		const keys = categories.map((category) => getCategoryKey(category));
		return keys.every(Boolean) && new Set(keys).size === keys.length;
	}
	function getImageTileKey(category, item, itemIndex) {
		return `${getCategoryKey(category)}|${item?.url || ""}|${itemIndex}`;
	}
	function shouldRenderImagePreview(category) {
		return !category.disablePreviews && category.items.length <= IMAGE_PREVIEW_MAX_ITEMS;
	}
	function canReuseImageTile(tile, category, item) {
		if (!tile) return false;
		if (tile.dataset.previewEnabled !== String(shouldRenderImagePreview(category))) return false;
		if (tile.dataset.canDelete === "true") return false;
		return tile.dataset.url === item.url;
	}
	function createImageTile(options) {
		const { item, itemIndex, config, category, input, selectedValue, selectedIndex, hasSelectedIndex, onDelete, setImagePreviewSource } = options;
		const shouldRenderPreview = shouldRenderImagePreview(category);
		const itemKey = getImageTileKey(category, item, itemIndex);
		const previewSource = item.previewUrl || item.url;
		const canDelete = Boolean(category.isDefault && item.canDelete);
		const children = shouldRenderPreview ? [createElement("img", {
			className: "ctrlem-db-media-img",
			attrs: {
				src: IMAGE_PLACEHOLDER_URL,
				alt: item.title,
				loading: "lazy",
				referrerpolicy: "no-referrer"
			}
		})] : [createElement("span", {
			className: "ctrlem-db-media-url-label",
			text: item.title || item.url
		})];
		if (canDelete) children.push(createElement("button", {
			className: "ctrlem-db-media-delete",
			text: "x",
			title: "Delete image",
			type: "button",
			attrs: { "aria-label": "Delete image" }
		}));
		const tile = createElement("div", {
			className: `ctrlem-db-media-tile ctrlem-db-media-tile-image${shouldRenderPreview ? "" : " no-preview"}${canDelete ? " has-delete" : ""}`,
			title: item.title,
			attrs: {
				role: "button",
				tabindex: "0",
				"aria-label": item.title
			},
			dataset: {
				command: config.key,
				type: config.type,
				categoryId: category.id || "",
				category: category.name,
				source: category.isDefault ? "default" : "saved",
				url: item.url,
				index: String(itemIndex),
				itemKey,
				previewEnabled: String(shouldRenderPreview),
				previewSource,
				loadedPreviewSource: previewSource,
				canDelete: String(canDelete)
			}
		}, children);
		tile.querySelector(".ctrlem-db-media-delete")?.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			onDelete({
				item,
				tile
			});
		});
		if ((selectedValue || input.value.trim()) === item.url && (!hasSelectedIndex || selectedIndex === itemIndex)) tile.classList.add("is-selected");
		const image = tile.querySelector(".ctrlem-db-media-img");
		if (image) setImagePreviewSource(image, previewSource, item.url);
		return tile;
	}
	function updateImageTile(tile, options) {
		const { item, itemIndex, config, category, input, selectedValue, selectedIndex, hasSelectedIndex, setImagePreviewSource } = options;
		const shouldRenderPreview = shouldRenderImagePreview(category);
		const previewSource = item.previewUrl || item.url;
		tile.title = item.title;
		tile.setAttribute("aria-label", item.title);
		tile.dataset.command = config.key;
		tile.dataset.type = config.type;
		tile.dataset.categoryId = category.id || "";
		tile.dataset.category = category.name;
		tile.dataset.source = category.isDefault ? "default" : "saved";
		tile.dataset.url = item.url;
		tile.dataset.index = String(itemIndex);
		tile.dataset.itemKey = getImageTileKey(category, item, itemIndex);
		tile.dataset.previewEnabled = String(shouldRenderPreview);
		tile.dataset.previewSource = previewSource;
		tile.dataset.canDelete = "false";
		tile.classList.toggle("is-selected", (selectedValue || input.value.trim()) === item.url && (!hasSelectedIndex || selectedIndex === itemIndex));
		const image = tile.querySelector(".ctrlem-db-media-img");
		if (image) {
			image.alt = item.title;
			if (tile.dataset.loadedPreviewSource !== previewSource) {
				setImagePreviewSource(image, previewSource, item.url);
				tile.dataset.loadedPreviewSource = previewSource;
			}
			return;
		}
		const label = tile.querySelector(".ctrlem-db-media-url-label");
		if (label) label.textContent = item.title || item.url;
	}
	function getTextPickerId(commandKey) {
		return `${UI_IDS.textPrefix}-${commandKey}`;
	}
	function createTextPicker(options) {
		const { config, input, categories, uiState = {}, onSelect, onPreview, onCategoryChange, onUiStateChange, onAddCategory, onRenameCategory } = options;
		const pickerId = getTextPickerId(config.key);
		if (categories.length === 0) return createElement("div", {
			id: pickerId,
			className: "ctrlem-db-empty",
			text: config.emptyText
		});
		const list = createElement("div", {
			id: pickerId,
			className: "ctrlem-db-phrase-list ctrlem-db-text-picker",
			attrs: { "aria-label": config.label },
			dataset: {
				command: config.key,
				type: config.type
			}
		});
		const select = createElement("select", {
			id: `${pickerId}-category`,
			className: "form-select ctrlem-db-text-select"
		});
		const rows = createElement("div", {
			className: "ctrlem-db-rows",
			attrs: { role: "list" }
		});
		const selectedValue = String(uiState.value || input.value || "").trim();
		const selectedIndex = Number(uiState.itemIndex);
		const hasSelectedIndex = Number.isFinite(selectedIndex) && selectedIndex >= 0;
		categories.forEach((category, categoryIndex) => {
			select.appendChild(createElement("option", {
				text: `${category.name} (${category.items.length})`,
				attrs: { value: String(categoryIndex) }
			}));
		});
		const addButton = createElement("button", {
			className: "ctrlem-db-category-tool-button",
			text: "+",
			title: "Add category",
			type: "button",
			attrs: { "aria-label": "Add category" }
		});
		const renameButton = createElement("button", {
			className: "ctrlem-db-category-tool-button",
			text: "✎",
			title: "Edit category",
			type: "button",
			attrs: { "aria-label": "Edit category" }
		});
		addButton.addEventListener("click", () => onAddCategory?.());
		renameButton.addEventListener("click", () => {
			const category = categories[Number(select.value) || 0];
			if (category?.id) onRenameCategory?.(category.id);
		});
		list.appendChild(createElement("div", { className: "ctrlem-db-text-toolbar ctrlem-db-category-toolbar" }, [
			select,
			addButton,
			renameButton
		]));
		list.appendChild(rows);
		const getCategoryIndex = () => {
			const byId = categories.findIndex((category) => category.id && category.id === uiState.categoryId);
			if (byId >= 0) return byId;
			const byName = categories.findIndex((category) => category.name === uiState.categoryName);
			if (byName >= 0) return byName;
			const byValue = categories.findIndex((category) => category.items.some((line) => {
				return getLineItem(config.type, line)?.value === selectedValue;
			}));
			return byValue >= 0 ? byValue : 0;
		};
		const renderCategory = (categoryIndex) => {
			const category = categories[categoryIndex];
			rows.replaceChildren();
			list.dataset.categoryIndex = String(categoryIndex);
			list.dataset.categoryId = category?.id || "";
			list.dataset.category = category?.name || "";
			if (!category || category.items.length === 0) {
				rows.appendChild(createElement("div", {
					className: "ctrlem-db-empty",
					text: config.emptyText
				}));
				return;
			}
			category.items.forEach((line, itemIndex) => {
				const item = getLineItem(config.type, line);
				if (!item) return;
				const hasPreview = Boolean(onPreview && (config.type === RecordType.SOUND || config.type === RecordType.VIDEO));
				const button = createElement(hasPreview ? "div" : "button", {
					className: `ctrlem-db-row${hasPreview ? " has-preview" : ""}`,
					title: item.title,
					type: hasPreview ? void 0 : "button",
					attrs: hasPreview ? {
						role: "button",
						tabindex: "0"
					} : { role: "listitem" },
					dataset: {
						command: config.key,
						type: config.type,
						value: item.value,
						label: item.label || "",
						index: String(itemIndex),
						categoryId: category.id || "",
						category: category.name
					}
				}, [createElement("span", {
					className: "ctrlem-db-row-label",
					text: item.display
				})]);
				if (hasPreview) button.appendChild(createElement("button", {
					className: "ctrlem-db-row-preview",
					text: "Preview",
					title: `Preview ${item.display}`,
					type: "button"
				}));
				if (selectedValue && item.value === selectedValue && (!hasSelectedIndex || selectedIndex === itemIndex)) button.classList.add("is-selected");
				rows.appendChild(button);
			});
			if (!rows.querySelector(".ctrlem-db-row")) rows.appendChild(createElement("div", {
				className: "ctrlem-db-empty",
				text: config.emptyText
			}));
		};
		select.addEventListener("change", () => {
			const categoryIndex = Number(select.value) || 0;
			renderCategory(categoryIndex);
			rows.scrollTop = 0;
			const category = categories[categoryIndex];
			onUiStateChange?.({
				categoryId: category?.id || "",
				categoryName: category?.name || "",
				itemIndex: -1,
				scrollTop: 0
			});
			onCategoryChange?.({
				command: config.key,
				type: config.type,
				category: category?.name
			});
		});
		let scrollTimer = 0;
		rows.addEventListener("scroll", () => {
			window.clearTimeout(scrollTimer);
			scrollTimer = window.setTimeout(() => {
				onUiStateChange?.({ scrollTop: rows.scrollTop });
			}, USER_CONFIG.ui.scrollSaveDelayMs);
		});
		list.addEventListener("click", (event) => {
			if (!(event.target instanceof Element)) return;
			const previewButton = event.target.closest(".ctrlem-db-row-preview");
			if (previewButton && list.contains(previewButton)) {
				const button = previewButton.closest(".ctrlem-db-row");
				if (button) onPreview?.({
					input,
					list,
					button
				});
				return;
			}
			const button = event.target.closest(".ctrlem-db-row");
			if (!button || !list.contains(button)) return;
			onSelect({
				input,
				list,
				button
			});
		});
		list.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			if (!(event.target instanceof Element)) return;
			if (event.target.closest(".ctrlem-db-row-preview")) return;
			const button = event.target.closest(".ctrlem-db-row");
			if (!button || !list.contains(button)) return;
			if (!button.classList.contains("has-preview")) return;
			event.preventDefault();
			onSelect({
				input,
				list,
				button
			});
		});
		const initialCategoryIndex = getCategoryIndex();
		select.value = String(initialCategoryIndex);
		renderCategory(initialCategoryIndex);
		window.setTimeout(() => {
			rows.scrollTop = Math.max(0, Number(uiState.scrollTop) || 0);
		}, 0);
		return list;
	}
	var MANAGER_ID = "ctrlem-db-autosend-manager";
	var TOAST_BOTTOM_PROPERTY = "--ctrlem-db-toast-bottom";
	var LOCK_TTL_MS = USER_CONFIG.autoSend.queueLockTtlMs;
	var HEARTBEAT_MS = USER_CONFIG.autoSend.heartbeatMs;
	var HEARTBEAT_TIMEOUT_MS = USER_CONFIG.autoSend.heartbeatTimeoutMs;
	var RUNNER_MS = USER_CONFIG.autoSend.runnerMs;
	var NATIVE_SEND_DISABLED_GRACE_MS = 1e3;
	var NATIVE_SEND_REQUEST_GRACE_MS = 250;
	var SEND_SETTLE_MS = 1500;
	var RATE_LIMIT_BACKOFF_MIN_MS = 5e3;
	var RATE_LIMIT_BACKOFF_MAX_MS = 2e4;
	var TASK_STATUS = Object.freeze({
		PENDING: "pending",
		SENDING: "sending"
	});
	var AutoSendController = class {
		options;
		states = new Map();
		manualTasks = new Map();
		instanceId = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
		managerTimer = 0;
		heartbeatTimer = 0;
		runnerTimer = 0;
		bypassSendButton = null;
		unlockObserver = null;
		rateLimitObserver = null;
		sendRequestCaptureDepth = 0;
		nativeSendRequestsInFlight = 0;
		nativeSendBusyUntil = 0;
		nextSendAllowedAt = 0;
		activeSendTaskId = "";
		rateLimitBackoffUntil = 0;
		managerCollapsed = false;
		constructor(options) {
			this.options = options;
			window.addEventListener("storage", (event) => {
				if (event.key !== "ctrlemDbAutoSendQueue.v1") return;
				this.applyStoredQueue(this.parseStoredQueue(event.newValue));
			});
			document.addEventListener("click", (event) => this.captureManualSend(event), true);
			window.addEventListener("beforeunload", () => this.removeOwnedTasks("tab unloaded"));
			this.installNativeSendTracker();
			this.startHeartbeat();
			this.startRunner();
			this.startButtonUnlocker();
			this.startRateLimitObserver();
		}
		getCommandConfig(commandKey) {
			return TEXT_COMMANDS[commandKey] || MEDIA_COMMANDS[commandKey] || ACTION_COMMANDS[commandKey] || null;
		}
		getIntervalMs() {
			return clampAutoSendInterval(this.options.getState()?.autoSendIntervalSeconds) * 1e3;
		}
		getIntervalSeconds() {
			return clampAutoSendInterval(this.options.getState()?.autoSendIntervalSeconds);
		}
		getMinimumRequestIntervalMs() {
			return clampMinimumRequestInterval(this.options.getState()?.minimumRequestIntervalSeconds) * 1e3;
		}
		getMinimumRequestIntervalSeconds() {
			return clampMinimumRequestInterval(this.options.getState()?.minimumRequestIntervalSeconds);
		}
		cleanText(value) {
			return String(value || "").replace(/\s+/g, " ").trim();
		}
		getProfileTitle() {
			const heading = document.querySelector(".profile-details h1");
			if (!heading) return this.getPageCode();
			const clone = heading.cloneNode(true);
			clone.querySelectorAll(".verified-badge, [title=\"Verified\"]").forEach((element) => element.remove());
			return this.cleanText(clone.textContent) || this.getPageCode();
		}
		getPageCode() {
			const code = String(document.querySelector(".profile-controlcode code")?.textContent || "").trim();
			if (code) return code;
			const pathMatch = window.location.pathname.match(/\/u\/([^/?#]+)/i);
			if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);
			return document.title.match(/^([A-Z0-9]{3,})\b/i)?.[1] || "Current page";
		}
		getPageKey() {
			const path = window.location.pathname.replace(/\/+$/, "") || "/";
			return `${window.location.origin}${path}`;
		}
		getPageUrl() {
			return window.location.href;
		}
		getSendType(config, kind) {
			if (kind === "manual") return "Manual";
			if (config?.type && TYPE_LABELS[config.type]) return `Auto ${TYPE_LABELS[config.type]}`;
			return "Auto Action";
		}
		getTaskCategory(config, items) {
			if (items[0]?.category) return items[0].category;
			const picker = this.getCommandPicker(config);
			return String(picker?.dataset?.category || "").trim() || config.label || config.key;
		}
		getCommandPicker(config) {
			if (config.clickOnly) return null;
			return document.getElementById(getTextPickerId(config.key)) || document.getElementById(getMediaPickerId(config.key));
		}
		getVisibleItems(config) {
			const picker = this.getCommandPicker(config);
			if (!picker) return [];
			const selector = config.type === RecordType.IMAGE ? ".ctrlem-db-media-tile" : ".ctrlem-db-row";
			return Array.from(picker.querySelectorAll(selector)).map((element) => ({
				commandKey: config.key,
				type: config.type || "",
				value: element.dataset.value || element.dataset.url || "",
				categoryId: element.dataset.categoryId || picker.dataset.categoryId || "",
				category: element.dataset.category || picker.dataset.category || "",
				index: Number(element.dataset.index || -1),
				source: element.dataset.source || "saved",
				isSelected: element.classList.contains("is-selected")
			})).filter((item) => item.value);
		}
		getStartIndex(config, input, items) {
			const uiState = this.options.getPickerUiState?.(config.key) || {};
			const savedValue = String(uiState.value || input?.dataset?.ctrlemDbSelectedValue || input?.value || "").trim();
			const savedIndex = Number(uiState.itemIndex);
			if (Number.isFinite(savedIndex) && savedIndex >= 0 && items[savedIndex]?.value === savedValue) return savedIndex;
			const selectedIndex = items.findIndex((item) => item.isSelected);
			if (selectedIndex >= 0) return selectedIndex;
			const valueIndex = items.findIndex((item) => item.value === savedValue);
			return valueIndex >= 0 ? valueIndex : 0;
		}
		getItemSelector(config) {
			return config.type === RecordType.IMAGE ? ".ctrlem-db-media-tile" : ".ctrlem-db-row";
		}
		getItemValue(element) {
			return element.dataset.value || element.dataset.url || "";
		}
		findLiveItemElement(config, picker, item) {
			const selector = this.getItemSelector(config);
			const elements = Array.from(picker.querySelectorAll(selector));
			const exact = elements.find((element) => this.getItemValue(element) === item.value && (element.dataset.categoryId || picker.dataset.categoryId || "") === item.categoryId && Number(element.dataset.index || -1) === item.index);
			if (exact) return exact;
			return elements.find((element) => this.getItemValue(element) === item.value && (element.dataset.categoryId || picker.dataset.categoryId || "") === item.categoryId) || null;
		}
		selectItem(config, item, options = {}) {
			const input = document.querySelector(config.inputSelector);
			const picker = this.getCommandPicker(config);
			if (!input || !picker) return false;
			const element = this.findLiveItemElement(config, picker, item);
			if (!element) return false;
			if (element.classList.contains("ctrlem-db-media-tile")) {
				this.options.selectMediaItem(input, picker, element, options);
				return true;
			}
			this.options.selectTextItem(input, picker, element, options);
			return true;
		}
		setButtonState(button, isActive) {
			if (!button) return;
			button.classList.toggle("is-active", isActive);
			button.setAttribute("aria-pressed", String(isActive));
			button.title = isActive ? "Stop auto-send" : "Start auto-send";
		}
		setCommandButtons(commandKey, isActive) {
			document.querySelectorAll(`.ctrlem-db-auto-send-button[data-command="${commandKey}"]`).forEach((button) => {
				this.setButtonState(button, isActive);
			});
		}
		parseStoredQueue(raw) {
			if (!raw) return this.createQueueState();
			try {
				const parsed = JSON.parse(raw);
				return this.normalizeQueueState(parsed);
			} catch {
				return this.createQueueState();
			}
		}
		createQueueState() {
			return {
				tasks: [],
				lastSentAt: 0,
				nextSendAllowedAt: 0,
				activeSendTaskId: "",
				activeSendOwnerId: "",
				activeSendStartedAt: 0,
				activeSendSettleAt: 0,
				rateLimitBackoffUntil: 0,
				lock: null,
				heartbeats: {},
				updatedAt: Date.now()
			};
		}
		getHeartbeatTime(value) {
			if (value && typeof value === "object") return Math.max(0, Number(value.at) || 0);
			return Math.max(0, Number(value) || 0);
		}
		getHeartbeatPageKey(value) {
			if (value && typeof value === "object") return String(value.pageKey || "").trim();
			return "";
		}
		normalizeTask(task, index) {
			const createdAt = Math.max(0, Number(task.createdAt) || Date.now());
			const sequence = Number.isFinite(Number(task.sequence)) ? Number(task.sequence) : createdAt + index;
			const hasTaskInterval = task.taskIntervalSeconds !== void 0 && task.taskIntervalSeconds !== null && task.taskIntervalSeconds !== "";
			return {
				...task,
				id: String(task.id || ""),
				key: String(task.key || ""),
				kind: String(task.kind || ""),
				ownerId: String(task.ownerId || ""),
				commandKey: String(task.commandKey || ""),
				sendType: String(task.sendType || task.kind || ""),
				pageKey: String(task.pageKey || "").trim(),
				pageUrl: String(task.pageUrl || task.pageKey || "").trim(),
				pageCode: String(task.pageCode || "").trim(),
				categoryId: String(task.categoryId || ""),
				category: String(task.category || ""),
				itemValue: String(task.itemValue || ""),
				itemIndex: Number.isFinite(Number(task.itemIndex)) ? Number(task.itemIndex) : -1,
				nextIndex: Number.isFinite(Number(task.nextIndex)) ? Number(task.nextIndex) : -1,
				taskIntervalSeconds: clampAutoSendInterval(hasTaskInterval ? task.taskIntervalSeconds : this.getIntervalSeconds()),
				createdAt,
				dueAt: Math.max(0, Number(task.dueAt) || 0),
				sequence,
				status: task.status === TASK_STATUS.SENDING ? TASK_STATUS.SENDING : TASK_STATUS.PENDING,
				attemptedAt: Math.max(0, Number(task.attemptedAt) || 0),
				attemptOwnerId: String(task.attemptOwnerId || ""),
				nextIndexAfterAttempt: Number.isFinite(Number(task.nextIndexAfterAttempt)) ? Number(task.nextIndexAfterAttempt) : -1
			};
		}
		normalizeQueueState(queue) {
			const source = queue && typeof queue === "object" ? queue : {};
			const heartbeats = source.heartbeats && typeof source.heartbeats === "object" ? source.heartbeats : {};
			const lastSentAt = Math.max(0, Number(source.lastSentAt) || 0);
			const migratedNextAllowedAt = lastSentAt > 0 ? lastSentAt + this.getMinimumRequestIntervalMs() : 0;
			return {
				tasks: Array.isArray(source.tasks) ? source.tasks.map((task, index) => this.normalizeTask(task, index)).filter((task) => task.id && task.key && task.kind && task.commandKey) : [],
				lastSentAt,
				nextSendAllowedAt: Math.max(0, Number(source.nextSendAllowedAt) || migratedNextAllowedAt),
				activeSendTaskId: String(source.activeSendTaskId || ""),
				activeSendOwnerId: String(source.activeSendOwnerId || ""),
				activeSendStartedAt: Math.max(0, Number(source.activeSendStartedAt) || 0),
				activeSendSettleAt: Math.max(0, Number(source.activeSendSettleAt) || 0),
				rateLimitBackoffUntil: Math.max(0, Number(source.rateLimitBackoffUntil) || 0),
				lock: source.lock && typeof source.lock === "object" ? source.lock : null,
				heartbeats,
				updatedAt: Math.max(0, Number(source.updatedAt) || 0)
			};
		}
		getStoredQueue() {
			return this.parseStoredQueue(window.localStorage.getItem(AUTO_SEND_QUEUE_STORAGE_KEY));
		}
		writeQueue(queue) {
			queue.updatedAt = Date.now();
			window.localStorage.setItem(AUTO_SEND_QUEUE_STORAGE_KEY, JSON.stringify(queue));
			this.applyStoredQueue(queue);
		}
		cleanStaleTasks(queue, now = Date.now()) {
			let changed = false;
			const heartbeats = queue.heartbeats || {};
			Object.keys(heartbeats).forEach((ownerId) => {
				if (now - this.getHeartbeatTime(heartbeats[ownerId]) > HEARTBEAT_TIMEOUT_MS) {
					delete heartbeats[ownerId];
					changed = true;
				}
			});
			const before = queue.tasks.length;
			queue.tasks = queue.tasks.filter((task) => {
				if (task.kind !== "manual") return true;
				return now - this.getHeartbeatTime(heartbeats[task.ownerId]) <= HEARTBEAT_TIMEOUT_MS;
			});
			const activeTask = queue.activeSendTaskId ? queue.tasks.find((task) => task.id === queue.activeSendTaskId) : null;
			const activeOwnerId = String(queue.activeSendOwnerId || activeTask?.attemptOwnerId || activeTask?.ownerId || "");
			const activeStartedAt = Number(queue.activeSendStartedAt || activeTask?.attemptedAt || 0);
			const activeOwnerStale = activeOwnerId && activeOwnerId !== this.instanceId && now - this.getHeartbeatTime(heartbeats[activeOwnerId]) > HEARTBEAT_TIMEOUT_MS && now - activeStartedAt > HEARTBEAT_TIMEOUT_MS;
			if (queue.activeSendTaskId && (!activeTask || activeOwnerStale)) {
				if (activeTask?.status === TASK_STATUS.SENDING) {
					activeTask.status = TASK_STATUS.PENDING;
					activeTask.dueAt = Math.max(now, this.getQueueNextSendAllowedAt(queue));
					activeTask.attemptOwnerId = "";
				}
				this.clearActiveSend(queue);
				changed = true;
			}
			return changed || before !== queue.tasks.length;
		}
		tryQueueLock(callback) {
			const now = Date.now();
			const token = createId("lock");
			const ownerId = this.instanceId;
			for (let attempt = 0; attempt < 3; attempt += 1) {
				const base = this.getStoredQueue();
				const lock = base.lock;
				if (lock?.ownerId && lock.ownerId !== ownerId && Number(lock.expiresAt || 0) > now) return false;
				base.lock = {
					ownerId,
					token,
					expiresAt: now + LOCK_TTL_MS
				};
				window.localStorage.setItem(AUTO_SEND_QUEUE_STORAGE_KEY, JSON.stringify(base));
				const locked = this.getStoredQueue();
				if (locked.lock?.ownerId !== ownerId || locked.lock?.token !== token) continue;
				this.cleanStaleTasks(locked);
				callback(locked);
				if (locked.lock?.ownerId === ownerId && locked.lock?.token === token) locked.lock = null;
				this.writeQueue(locked);
				return true;
			}
			return false;
		}
		startHeartbeat() {
			const beat = () => {
				this.tryQueueLock((queue) => {
					queue.heartbeats ||= {};
					queue.heartbeats[this.instanceId] = {
						at: Date.now(),
						pageKey: this.getPageKey()
					};
				});
			};
			beat();
			this.heartbeatTimer = window.setInterval(beat, HEARTBEAT_MS);
		}
		getRequestUrl(input) {
			if (typeof input === "string") return input;
			if (input instanceof URL) return input.href;
			return input.url || "";
		}
		shouldTrackNativeSendRequest(input) {
			if (this.sendRequestCaptureDepth <= 0) return false;
			try {
				return new URL(this.getRequestUrl(input), window.location.href).origin === window.location.origin;
			} catch {
				return false;
			}
		}
		beginNativeSendRequest() {
			this.nativeSendRequestsInFlight += 1;
			this.nativeSendBusyUntil = Math.max(this.nativeSendBusyUntil, Date.now() + NATIVE_SEND_REQUEST_GRACE_MS);
		}
		endNativeSendRequest() {
			this.nativeSendRequestsInFlight = Math.max(0, this.nativeSendRequestsInFlight - 1);
			this.nativeSendBusyUntil = Date.now() + NATIVE_SEND_REQUEST_GRACE_MS;
		}
		isNativeSendBusy(now = Date.now()) {
			return this.nativeSendRequestsInFlight > 0 || now < this.nativeSendBusyUntil;
		}
		getRateLimitBackoffMs() {
			const base = this.getMinimumRequestIntervalMs() * 2;
			return Math.max(RATE_LIMIT_BACKOFF_MIN_MS, Math.min(RATE_LIMIT_BACKOFF_MAX_MS, base));
		}
		markRateLimited() {
			const now = Date.now();
			const backoffUntil = now + this.getRateLimitBackoffMs();
			let retryQueued = false;
			this.tryQueueLock((queue) => {
				const task = this.getRetryableAttemptTask(queue);
				if (!task) return;
				queue.rateLimitBackoffUntil = Math.max(Number(queue.rateLimitBackoffUntil || 0), backoffUntil);
				queue.nextSendAllowedAt = Math.max(Number(queue.nextSendAllowedAt || 0), backoffUntil);
				this.rateLimitBackoffUntil = Math.max(this.rateLimitBackoffUntil, backoffUntil);
				this.nativeSendBusyUntil = Math.max(this.nativeSendBusyUntil, backoffUntil);
				this.requeueRateLimitedTask(queue, task, backoffUntil);
				retryQueued = true;
				this.options.log("warn", "Auto-send rate limited; task will retry", {
					command: task.commandKey,
					kind: task.kind,
					retryInMs: backoffUntil - now
				});
			});
			if (!retryQueued) this.nativeSendBusyUntil = Math.max(this.nativeSendBusyUntil, now + NATIVE_SEND_REQUEST_GRACE_MS);
		}
		isRateLimitText(text) {
			const normalized = text.toLowerCase();
			return normalized.includes("too frequent") || normalized.includes("too many requests") || normalized.includes("rate limit") || normalized.includes("слишком част") || normalized.includes("частые запрос");
		}
		scanNodeForRateLimit(node) {
			const text = String(node.textContent || "").trim();
			if (text && this.isRateLimitText(text)) this.markRateLimited();
		}
		installNativeSendTrackerOn(targetWindow) {
			if (!targetWindow || targetWindow.__ctrlemDbNativeSendTrackerInstalled) return;
			targetWindow.__ctrlemDbNativeSendTrackerInstalled = true;
			const nativeFetch = targetWindow.fetch?.bind(targetWindow);
			if (nativeFetch) targetWindow.fetch = ((input, init) => {
				const tracked = this.shouldTrackNativeSendRequest(input);
				if (tracked) this.beginNativeSendRequest();
				return nativeFetch(input, init).finally(() => {
					if (tracked) this.endNativeSendRequest();
				});
			});
			const xhrPrototype = targetWindow.XMLHttpRequest?.prototype;
			if (!xhrPrototype) return;
			const nativeOpen = xhrPrototype.open;
			const nativeSend = xhrPrototype.send;
			const controller = this;
			xhrPrototype.open = function open(method, url, ...args) {
				this.__ctrlemDbRequestUrl = url;
				nativeOpen.call(this, method, url, ...args);
			};
			xhrPrototype.send = function send(...args) {
				if (controller.shouldTrackNativeSendRequest(this.__ctrlemDbRequestUrl || window.location.href)) {
					controller.beginNativeSendRequest();
					this.addEventListener("loadend", () => controller.endNativeSendRequest(), { once: true });
				}
				nativeSend.apply(this, args);
			};
		}
		installNativeSendTracker() {
			this.installNativeSendTrackerOn(window);
			const unsafeWindowRef = globalThis.unsafeWindow;
			if (unsafeWindowRef && unsafeWindowRef !== window) this.installNativeSendTrackerOn(unsafeWindowRef);
		}
		startRunner() {
			if (this.runnerTimer) return;
			this.runnerTimer = window.setInterval(() => {
				this.unlockSendButtons();
				this.processDueQueue();
			}, RUNNER_MS);
		}
		unlockSendButton(button) {
			if (!button?.matches?.("[data-send]")) return;
			if (button.disabled || button.hasAttribute("disabled")) {
				this.nativeSendBusyUntil = Math.max(this.nativeSendBusyUntil, Date.now() + NATIVE_SEND_DISABLED_GRACE_MS);
				button.disabled = false;
			}
			if (button.hasAttribute("disabled")) button.removeAttribute("disabled");
			if (button.style?.opacity === "0.5") button.style.opacity = "";
			if (button.style?.pointerEvents === "none") button.style.pointerEvents = "";
			button.classList?.remove("disabled", "is-disabled");
			button.setAttribute("aria-disabled", "false");
		}
		unlockSendButtons() {
			document.querySelectorAll("[data-send]").forEach((button) => this.unlockSendButton(button));
		}
		scheduleSendButtonUnlock(button) {
			[
				0,
				50,
				150,
				300,
				600,
				1e3,
				2e3
			].forEach((delay) => {
				window.setTimeout(() => {
					if (button?.isConnected) this.unlockSendButton(button);
					this.unlockSendButtons();
				}, delay);
			});
		}
		startButtonUnlocker() {
			this.unlockSendButtons();
			if (this.unlockObserver) return;
			this.unlockObserver = new MutationObserver((mutations) => {
				let shouldUnlock = false;
				mutations.forEach((mutation) => {
					if (shouldUnlock) return;
					const target = mutation.target;
					if (target?.matches?.("[data-send]")) {
						shouldUnlock = true;
						return;
					}
					if (target?.querySelector?.("[data-send]")) {
						shouldUnlock = true;
						return;
					}
					mutation.addedNodes.forEach((node) => {
						if (shouldUnlock || node.nodeType !== Node.ELEMENT_NODE) return;
						shouldUnlock = Boolean(node.matches?.("[data-send]") || node.querySelector?.("[data-send]"));
					});
				});
				if (shouldUnlock) window.setTimeout(() => this.unlockSendButtons(), 0);
			});
			this.unlockObserver.observe(document.documentElement, {
				subtree: true,
				childList: true,
				attributes: true,
				attributeFilter: [
					"disabled",
					"style",
					"class"
				]
			});
		}
		startRateLimitObserver() {
			if (this.rateLimitObserver) return;
			this.rateLimitObserver = new MutationObserver((mutations) => {
				mutations.forEach((mutation) => {
					if (mutation.type === "characterData") this.scanNodeForRateLimit(mutation.target);
					mutation.addedNodes.forEach((node) => this.scanNodeForRateLimit(node));
				});
			});
			this.rateLimitObserver.observe(document.body || document.documentElement, {
				subtree: true,
				childList: true,
				characterData: true
			});
		}
		stop(commandKey, reason = "stopped", options = {}) {
			const state = this.states.get(commandKey);
			if (!state) return;
			state.stopped = true;
			this.states.delete(commandKey);
			this.setButtonState(state.button, false);
			this.setCommandButtons(commandKey, false);
			if (options.publish !== false) this.removeTask(state.taskId);
			this.options.log("info", "Auto-send stopped", {
				command: commandKey,
				reason
			});
		}
		stopAll(reason = "stopped", options = {}) {
			Array.from(this.states.keys()).forEach((commandKey) => this.stop(commandKey, reason, options));
		}
		removeTask(taskId) {
			this.tryQueueLock((queue) => {
				queue.tasks = queue.tasks.filter((task) => task.id !== taskId);
				if (queue.activeSendTaskId === taskId || this.activeSendTaskId === taskId) this.clearActiveSend(queue);
			});
		}
		removeOwnedTasks(reason = "stopped") {
			this.stopAll(reason, { publish: false });
			this.manualTasks.clear();
			this.tryQueueLock((queue) => {
				queue.tasks = queue.tasks.filter((task) => task.kind !== "manual" || task.ownerId !== this.instanceId);
				if (queue.activeSendOwnerId === this.instanceId || this.activeSendTaskId) this.clearActiveSend(queue);
				if (queue.heartbeats) delete queue.heartbeats[this.instanceId];
			});
		}
		buildTaskKey(pageKey, commandKey, sendType) {
			return `${pageKey}::${commandKey}::${sendType}`;
		}
		taskMatchesCurrentPage(task) {
			const pageKey = String(task?.pageKey || "").trim();
			if (pageKey && pageKey === this.getPageKey()) return true;
			return !pageKey && String(task?.pageCode || "").trim() === this.getPageCode();
		}
		taskSortValue(task) {
			return Number(task?.sequence ?? task?.createdAt ?? 0) || 0;
		}
		sortReadyTasks(tasks) {
			return [...tasks].sort((a, b) => {
				const manualPriority = (a.kind === "manual" ? 0 : 1) - (b.kind === "manual" ? 0 : 1);
				if (manualPriority !== 0) return manualPriority;
				const dueDiff = Number(a.dueAt || 0) - Number(b.dueAt || 0);
				if (dueDiff !== 0) return dueDiff;
				return this.taskSortValue(a) - this.taskSortValue(b);
			});
		}
		getNextSequence(queue) {
			return Math.max(0, ...queue.tasks.map((task) => this.taskSortValue(task))) + 1;
		}
		isOwnerAlive(queue, ownerId, now = Date.now()) {
			if (ownerId === this.instanceId) return true;
			return now - this.getHeartbeatTime(queue.heartbeats?.[ownerId]) <= HEARTBEAT_TIMEOUT_MS;
		}
		isTaskPageActive(queue, task, now = Date.now()) {
			if (this.taskMatchesCurrentPage(task)) return true;
			const taskPageKey = String(task?.pageKey || "").trim();
			if (!taskPageKey) return false;
			return Object.values(queue.heartbeats || {}).some((heartbeat) => this.getHeartbeatPageKey(heartbeat) === taskPageKey && now - this.getHeartbeatTime(heartbeat) <= HEARTBEAT_TIMEOUT_MS);
		}
		findQueuedAutoTask(queue, config, sendType) {
			return queue.tasks.find((task) => task.kind === "auto" && task.commandKey === config.key && (task.sendType === sendType || !task.sendType) && this.taskMatchesCurrentPage(task));
		}
		ensureTaskCategoryVisible(config, task) {
			if (config.clickOnly || !task?.category) return;
			const picker = this.getCommandPicker(config);
			if (!picker || picker.dataset.category === task.category) return;
			const select = picker.querySelector("select");
			if (!select) return;
			const option = Array.from(select.options).find((item) => String(item.textContent || "").replace(/\s+\(\d+\)$/, "") === task.category);
			if (!option || select.value === option.value) return;
			select.value = option.value;
			select.dispatchEvent(new Event("change", { bubbles: true }));
		}
		start(config, sendButton, button) {
			const input = config.inputSelector ? document.querySelector(config.inputSelector) : null;
			const items = config.clickOnly ? [] : this.getVisibleItems(config);
			if (!config.clickOnly && !input) {
				this.options.notifySite("Auto-send input was not found", "error");
				return;
			}
			if (!config.clickOnly && items.length === 0) {
				this.options.notifySite("Auto-send category is empty", "error");
				return;
			}
			if (this.states.has(config.key)) {
				this.stop(config.key);
				return;
			}
			const taskId = createId("autosend");
			const category = this.getTaskCategory(config, items);
			const pageKey = this.getPageKey();
			const pageUrl = this.getPageUrl();
			const pageCode = this.getPageCode();
			const sendType = this.getSendType(config, "auto");
			const taskKey = this.buildTaskKey(pageKey, config.key, sendType);
			const startIndex = config.clickOnly ? 0 : this.getStartIndex(config, input, items);
			const startItem = config.clickOnly ? null : items[startIndex % items.length];
			const state = {
				taskId,
				commandKey: config.key,
				config,
				sendButton,
				button,
				items,
				nextIndex: startIndex,
				category,
				profileTitle: this.getProfileTitle(),
				pageKey,
				pageUrl,
				pageCode,
				stopped: false
			};
			let added = false;
			this.tryQueueLock((queue) => {
				const existing = this.findQueuedAutoTask(queue, config, sendType);
				if (existing) {
					state.taskId = existing.id;
					state.nextIndex = Number.isFinite(Number(existing.nextIndex)) && Number(existing.nextIndex) >= 0 ? Number(existing.nextIndex) : startIndex;
					existing.key ||= taskKey;
					existing.pageKey ||= pageKey;
					existing.pageUrl ||= pageUrl;
					existing.pageCode ||= pageCode;
					existing.profileTitle = state.profileTitle;
					existing.category ||= category;
					existing.categoryId ||= startItem?.categoryId || "";
					existing.taskIntervalSeconds = clampAutoSendInterval(existing.taskIntervalSeconds || this.getIntervalSeconds());
					added = true;
					return;
				}
				const now = Date.now();
				queue.tasks.push({
					id: taskId,
					key: taskKey,
					kind: "auto",
					commandKey: config.key,
					sendType,
					pageKey,
					pageUrl,
					pageCode,
					categoryId: startItem?.categoryId || "",
					category,
					profileTitle: state.profileTitle,
					itemValue: startItem?.value || "",
					itemIndex: Number.isFinite(Number(startItem?.index)) ? Number(startItem.index) : startIndex,
					nextIndex: startIndex,
					taskIntervalSeconds: this.getIntervalSeconds(),
					createdAt: now,
					dueAt: now,
					sequence: this.getNextSequence(queue),
					status: TASK_STATUS.PENDING
				});
				added = true;
			});
			if (!added) {
				this.options.notifySite("Auto-send queue is busy. Try again.", "error");
				return;
			}
			this.states.set(config.key, state);
			this.setButtonState(button, true);
			this.setCommandButtons(config.key, true);
			this.options.log("info", "Auto-send queued", {
				command: config.key,
				type: config.type,
				category: state.category,
				pageCode: state.pageCode,
				items: config.clickOnly ? null : items.length,
				intervalSeconds: this.getIntervalSeconds()
			});
			this.restoreTaskSelection(this.getStoredQueue().tasks.find((task) => task.id === state.taskId), state);
			this.processDueQueue();
		}
		toggle(config, sendButton, button) {
			if (this.states.has(config.key)) {
				this.stop(config.key);
				return;
			}
			this.start(config, sendButton, button);
		}
		createRuntimeState(task, config, sendButton, button) {
			const input = config.inputSelector ? document.querySelector(config.inputSelector) : null;
			this.ensureTaskCategoryVisible(config, task);
			const items = config.clickOnly ? [] : this.getVisibleItems(config);
			if (!config.clickOnly && (!input || items.length === 0)) return null;
			let nextIndex = Number(task.nextIndex);
			if (!Number.isFinite(nextIndex) || nextIndex < 0) nextIndex = Number.isFinite(Number(task.itemIndex)) && Number(task.itemIndex) >= 0 ? Number(task.itemIndex) : this.getStartIndex(config, input, items);
			if (!config.clickOnly && task.itemValue) {
				const itemIndex = items.findIndex((item) => item.value === task.itemValue && (!task.categoryId || item.categoryId === task.categoryId));
				if (itemIndex >= 0) nextIndex = itemIndex;
			}
			return {
				taskId: task.id,
				commandKey: config.key,
				config,
				sendButton,
				button,
				items,
				nextIndex,
				category: task.category || this.getTaskCategory(config, items),
				profileTitle: task.profileTitle || this.getProfileTitle(),
				pageKey: task.pageKey || this.getPageKey(),
				pageUrl: task.pageUrl || task.pageKey || this.getPageUrl(),
				pageCode: task.pageCode || this.getPageCode(),
				stopped: false
			};
		}
		restoreTaskSelection(task, state) {
			if (!task || !state || state.config.clickOnly || state.items.length === 0) return;
			this.ensureTaskCategoryVisible(state.config, task);
			state.items = this.getVisibleItems(state.config);
			if (state.items.length === 0) return;
			const item = state.items.find((candidate) => candidate.value === task.itemValue && (!task.categoryId || candidate.categoryId === task.categoryId)) || state.items[state.nextIndex % state.items.length];
			if (!item) return;
			const focusState = this.options.captureFocusState?.();
			if (this.selectItem(state.config, item, {
				focus: false,
				focusState
			})) this.options.restoreFocusState?.(focusState);
		}
		adoptTask(task) {
			if (!task || task.kind !== "auto" || !this.taskMatchesCurrentPage(task)) return false;
			if (this.states.get(task.commandKey)?.taskId === task.id) return true;
			const config = this.getCommandConfig(task.commandKey);
			if (!config) return false;
			const sendButton = document.querySelector(`[data-send="${CSS.escape(task.commandKey)}"]`);
			const button = document.querySelector(`.ctrlem-db-auto-send-button[data-command="${CSS.escape(task.commandKey)}"]`);
			if (!sendButton || !button) return false;
			const state = this.createRuntimeState(task, config, sendButton, button);
			if (!state) return false;
			this.states.set(task.commandKey, state);
			this.setButtonState(button, true);
			this.setCommandButtons(task.commandKey, true);
			this.restoreTaskSelection(task, state);
			return true;
		}
		adoptCurrentPageTasks(queue = this.getStoredQueue()) {
			let adopted = false;
			queue.tasks.forEach((task) => {
				if (task.kind === "auto" && this.taskMatchesCurrentPage(task)) adopted = this.adoptTask(task) || adopted;
			});
			return adopted;
		}
		applyStoredQueue(queue) {
			const taskIds = new Set((queue?.tasks || []).map((task) => task.id));
			Array.from(this.states.values()).forEach((state) => {
				if (taskIds.has(state.taskId)) return;
				this.stop(state.commandKey, "removed from queue", { publish: false });
			});
			Array.from(this.manualTasks.keys()).forEach((taskId) => {
				if (!taskIds.has(taskId)) this.manualTasks.delete(taskId);
			});
			this.adoptCurrentPageTasks(queue);
			this.refreshControlButtons();
			this.renderManager();
		}
		requestStopTask(taskId) {
			const state = Array.from(this.states.values()).find((item) => item.taskId === taskId);
			if (state) {
				this.stop(state.commandKey);
				return;
			}
			this.removeTask(taskId);
		}
		requestStopAllTasks() {
			this.stopAll("stopped all", { publish: false });
			this.manualTasks.clear();
			this.tryQueueLock((queue) => {
				queue.tasks = [];
				queue.nextSendAllowedAt = 0;
				queue.rateLimitBackoffUntil = 0;
				this.nextSendAllowedAt = 0;
				this.rateLimitBackoffUntil = 0;
				this.clearActiveSend(queue);
			});
			this.renderManager();
		}
		clickSendButton(button) {
			this.unlockSendButton(button);
			this.bypassSendButton = button;
			this.sendRequestCaptureDepth += 1;
			try {
				button.click();
			} finally {
				this.bypassSendButton = null;
				window.setTimeout(() => {
					this.sendRequestCaptureDepth = Math.max(0, this.sendRequestCaptureDepth - 1);
				}, 0);
				this.scheduleSendButtonUnlock(button);
			}
		}
		getQueueNextSendAllowedAt(queue) {
			return Math.max(Number(queue?.nextSendAllowedAt || 0), Number(queue?.rateLimitBackoffUntil || 0), this.nextSendAllowedAt, this.rateLimitBackoffUntil);
		}
		hasActiveSend(queue) {
			return Boolean(queue?.activeSendTaskId || this.activeSendTaskId || queue?.tasks?.some?.((task) => task.status === TASK_STATUS.SENDING));
		}
		clearActiveSend(queue) {
			if (!queue) return;
			if (!queue.activeSendTaskId || queue.activeSendTaskId === this.activeSendTaskId) this.activeSendTaskId = "";
			queue.activeSendTaskId = "";
			queue.activeSendOwnerId = "";
			queue.activeSendStartedAt = 0;
			queue.activeSendSettleAt = 0;
		}
		beginTaskAttempt(queue, task) {
			const attemptedAt = Date.now();
			const nextAllowedAt = attemptedAt + this.getMinimumRequestIntervalMs();
			const settleAt = Math.max(attemptedAt + SEND_SETTLE_MS, nextAllowedAt);
			task.status = TASK_STATUS.SENDING;
			task.attemptedAt = attemptedAt;
			task.attemptOwnerId = this.instanceId;
			task.dueAt = settleAt;
			queue.lastSentAt = attemptedAt;
			queue.nextSendAllowedAt = Math.max(Number(queue.nextSendAllowedAt || 0), nextAllowedAt);
			queue.activeSendTaskId = task.id;
			queue.activeSendOwnerId = this.instanceId;
			queue.activeSendStartedAt = attemptedAt;
			queue.activeSendSettleAt = settleAt;
			this.nextSendAllowedAt = Math.max(this.nextSendAllowedAt, nextAllowedAt);
			this.activeSendTaskId = task.id;
		}
		clearAttemptFields(task) {
			task.status = TASK_STATUS.PENDING;
			task.attemptedAt = 0;
			task.attemptOwnerId = "";
			task.nextIndexAfterAttempt = -1;
		}
		updateAutoTaskToNextItem(task, state, nextIndex) {
			if (!state || state.config.clickOnly) {
				task.nextIndex = nextIndex;
				return;
			}
			state.items = this.getVisibleItems(state.config);
			if (state.items.length === 0) {
				task.nextIndex = nextIndex;
				return;
			}
			const normalizedNextIndex = nextIndex % state.items.length;
			state.nextIndex = normalizedNextIndex;
			const nextItem = state.items[normalizedNextIndex];
			task.nextIndex = normalizedNextIndex;
			task.itemValue = nextItem?.value || task.itemValue || "";
			task.itemIndex = Number.isFinite(Number(nextItem?.index)) ? Number(nextItem.index) : normalizedNextIndex;
			task.categoryId = nextItem?.categoryId || task.categoryId || "";
			task.category = nextItem?.category || task.category || state.category;
		}
		completeAttemptedTask(queue, task, now = Date.now()) {
			const attemptedAt = Number(task.attemptedAt || queue.activeSendStartedAt || now);
			if (task.kind === "auto") {
				const state = this.states.get(task.commandKey);
				const nextIndex = Number.isFinite(Number(task.nextIndexAfterAttempt)) && Number(task.nextIndexAfterAttempt) >= 0 ? Number(task.nextIndexAfterAttempt) : Number(task.nextIndex || 0);
				this.updateAutoTaskToNextItem(task, state, nextIndex);
				this.clearAttemptFields(task);
				task.dueAt = Math.max(attemptedAt + clampAutoSendInterval(task.taskIntervalSeconds) * 1e3, this.getQueueNextSendAllowedAt(queue));
			} else {
				queue.tasks = queue.tasks.filter((item) => item.id !== task.id);
				this.manualTasks.delete(task.id);
			}
			this.clearActiveSend(queue);
		}
		requeueRateLimitedTask(queue, task, backoffUntil) {
			this.clearAttemptFields(task);
			task.dueAt = Math.max(backoffUntil, Date.now() + this.getMinimumRequestIntervalMs());
			if (task.kind === "auto") {
				const state = this.states.get(task.commandKey);
				if (state && Number.isFinite(Number(task.nextIndex)) && Number(task.nextIndex) >= 0) state.nextIndex = Number(task.nextIndex);
			}
			this.clearActiveSend(queue);
		}
		getRetryableAttemptTask(queue) {
			const activeTaskId = String(queue?.activeSendTaskId || this.activeSendTaskId || "");
			if (activeTaskId) {
				const activeTask = queue.tasks.find((task) => task.id === activeTaskId);
				if (activeTask) return activeTask;
			}
			return [...queue.tasks].filter((task) => task.status === TASK_STATUS.SENDING).sort((a, b) => Number(b.attemptedAt || 0) - Number(a.attemptedAt || 0))[0] || null;
		}
		settleActiveSend(queue, now = Date.now()) {
			if (!this.hasActiveSend(queue)) return false;
			const task = this.getRetryableAttemptTask(queue);
			const activeOwnerId = String(queue.activeSendOwnerId || task?.attemptOwnerId || "");
			if (activeOwnerId && activeOwnerId !== this.instanceId && this.isOwnerAlive(queue, activeOwnerId, now)) return true;
			const settleAt = Math.max(Number(queue.activeSendSettleAt || 0), Number(task?.dueAt || 0), Number(task?.attemptedAt || queue.activeSendStartedAt || 0) + SEND_SETTLE_MS, this.getQueueNextSendAllowedAt(queue));
			if (this.isNativeSendBusy(now) || now < settleAt) return true;
			if (task) this.completeAttemptedTask(queue, task, now);
			else this.clearActiveSend(queue);
			return true;
		}
		runAutoTask(queue, task) {
			const state = this.states.get(task.commandKey);
			if (!state || state.taskId !== task.id || state.stopped) return "skip";
			if (!state.sendButton.isConnected) {
				this.stop(state.commandKey, "send button disconnected", { publish: false });
				return "skip";
			}
			const focusState = this.options.captureFocusState?.();
			if (!state.config.clickOnly) {
				const itemIndex = state.nextIndex % state.items.length;
				const item = state.items[itemIndex];
				if (!this.selectItem(state.config, item, {
					focus: false,
					focusState
				})) {
					this.options.notifySite("Auto-send item is no longer visible", "error");
					this.stop(state.commandKey, "item no longer visible", { publish: false });
					return "remove";
				}
				task.itemValue = item.value || "";
				task.itemIndex = Number.isFinite(Number(item.index)) ? Number(item.index) : itemIndex;
				task.categoryId = item.categoryId || task.categoryId || "";
				task.category = item.category || task.category || state.category;
				task.nextIndex = itemIndex;
				task.nextIndexAfterAttempt = (itemIndex + 1) % state.items.length;
			}
			this.beginTaskAttempt(queue, task);
			this.clickSendButton(state.sendButton);
			this.options.restoreFocusState?.(focusState);
			return "attempted";
		}
		runManualTask(queue, task) {
			const state = this.manualTasks.get(task.id);
			if (!state?.button?.isConnected) return "remove";
			const focusState = this.options.captureFocusState?.();
			this.restoreInputSnapshot(state.snapshot);
			this.beginTaskAttempt(queue, task);
			this.clickSendButton(state.button);
			this.options.restoreFocusState?.(focusState);
			return "attempted";
		}
		isAutoTaskRunnable(task) {
			if (!this.taskMatchesCurrentPage(task)) return false;
			if (!this.adoptTask(task)) return false;
			const state = this.states.get(task.commandKey);
			return Boolean(state && state.taskId === task.id && !state.stopped && state.sendButton?.isConnected);
		}
		getNextRunnableTask(queue, now = Date.now()) {
			const readyTasks = this.sortReadyTasks(queue.tasks.filter((task) => task.status !== TASK_STATUS.SENDING && Number(task.dueAt || 0) <= now));
			for (const task of readyTasks) {
				if (task.kind === "manual") {
					if (task.ownerId === this.instanceId && this.manualTasks.has(task.id)) return task;
					continue;
				}
				if (task.kind !== "auto") continue;
				if (!this.isTaskPageActive(queue, task, now)) continue;
				if (!this.taskMatchesCurrentPage(task)) continue;
				if (this.isAutoTaskRunnable(task)) return task;
			}
			return null;
		}
		processDueQueue() {
			const snapshot = this.getStoredQueue();
			const snapshotNow = Date.now();
			if (this.hasActiveSend(snapshot)) {
				const activeTask = this.getRetryableAttemptTask(snapshot);
				const activeOwnerId = String(snapshot.activeSendOwnerId || activeTask?.attemptOwnerId || "");
				if (activeOwnerId && activeOwnerId !== this.instanceId && this.isOwnerAlive(snapshot, activeOwnerId, snapshotNow)) return;
				this.tryQueueLock((queue) => {
					this.settleActiveSend(queue, Date.now());
				});
				return;
			}
			if (this.isNativeSendBusy(snapshotNow)) return;
			if (snapshotNow < this.getQueueNextSendAllowedAt(snapshot)) return;
			if (!this.getNextRunnableTask(snapshot, snapshotNow)) return;
			this.tryQueueLock((queue) => {
				const now = Date.now();
				if (this.settleActiveSend(queue, now)) return;
				if (this.isNativeSendBusy(now)) return;
				if (now < this.getQueueNextSendAllowedAt(queue)) return;
				const task = this.getNextRunnableTask(queue, now);
				if (!task) return;
				const result = task.kind === "manual" ? this.runManualTask(queue, task) : this.runAutoTask(queue, task);
				if (result === "skip") return;
				if (result === "remove") {
					queue.tasks = queue.tasks.filter((t) => t.id !== task.id);
					if (task.kind === "manual") this.manualTasks.delete(task.id);
					return;
				}
			});
		}
		getInputSnapshot(button, config) {
			const panel = button.closest(".cmd-panel") || button.closest("form") || document;
			const fields = Array.from(panel.querySelectorAll("input, textarea, select"));
			const configuredInputSelector = String(config?.inputSelector || "");
			if (configuredInputSelector) {
				const input = document.querySelector(configuredInputSelector);
				if (input && !fields.includes(input)) fields.push(input);
			}
			return fields.map((field, index) => ({
				selector: field.id ? `#${CSS.escape(field.id)}` : configuredInputSelector && field.matches?.(configuredInputSelector) ? configuredInputSelector : "",
				index,
				value: field.type === "checkbox" || field.type === "radio" ? field.checked : field.value,
				checked: Boolean(field.checked)
			}));
		}
		restoreInputSnapshot(snapshot) {
			snapshot.forEach((item) => {
				const field = item.selector ? document.querySelector(item.selector) : document.querySelectorAll("input, textarea, select")[Number(item.index)];
				if (!field) return;
				if (field.type === "checkbox" || field.type === "radio") field.checked = Boolean(item.checked);
				else if (field.value !== item.value) {
					field.value = item.value;
					field.dispatchEvent(new Event("input", { bubbles: true }));
					field.dispatchEvent(new Event("change", { bubbles: true }));
				}
			});
		}
		getManualValidationConfig(commandKey, config) {
			return INPUT_CAPTURE_COMMANDS[commandKey] || (config?.inputSelector ? config : null);
		}
		isManualSendValid(commandKey, config) {
			const validationConfig = this.getManualValidationConfig(commandKey, config);
			if (!validationConfig?.inputSelector) return true;
			const input = document.querySelector(validationConfig.inputSelector);
			if (!input) return true;
			return isCaptureValueValid(validationConfig, String(input.value || "").trim());
		}
		captureManualSend(event) {
			if (!(event.target instanceof Element)) return;
			const button = event.target.closest("[data-send]");
			if (!button || button !== event.target.closest("[data-send]")) return;
			if (button === this.bypassSendButton) return;
			const commandKey = String(button.dataset.send || "");
			const config = this.getCommandConfig(commandKey);
			if (!commandKey) return;
			if (!this.isManualSendValid(commandKey, config)) {
				this.options.notifySite("Enter a valid value before queueing send", "error");
				event.preventDefault();
				event.stopImmediatePropagation();
				return;
			}
			event.preventDefault();
			event.stopImmediatePropagation();
			const taskId = createId("manualsend");
			const snapshot = this.getInputSnapshot(button, config);
			const pageKey = this.getPageKey();
			const pageUrl = this.getPageUrl();
			const pageCode = this.getPageCode();
			const sendType = this.getSendType(config, "manual");
			const taskKey = this.buildTaskKey(pageKey, commandKey, sendType);
			const now = Date.now();
			const task = {
				id: taskId,
				key: taskKey,
				ownerId: this.instanceId,
				kind: "manual",
				commandKey,
				sendType,
				category: config?.label || commandKey,
				profileTitle: this.getProfileTitle(),
				pageKey,
				pageUrl,
				pageCode,
				createdAt: now,
				dueAt: now,
				sequence: now,
				status: TASK_STATUS.PENDING
			};
			this.manualTasks.set(taskId, {
				button,
				snapshot
			});
			if (!this.tryQueueLock((queue) => {
				task.sequence = this.getNextSequence(queue);
				queue.tasks.unshift(task);
			})) {
				this.manualTasks.delete(taskId);
				this.options.notifySite("Auto-send queue is busy. Try again.", "error");
				return;
			}
			this.processDueQueue();
		}
		getOrCreateControlHost(sendButton) {
			const parent = sendButton.parentElement;
			if (!parent) return null;
			if (!parent.matches(".cmd-panel")) return parent;
			const wrapper = createElement("div", { className: "ctrlem-db-autosend-group" });
			parent.insertBefore(wrapper, sendButton);
			wrapper.appendChild(sendButton);
			return wrapper;
		}
		syncIntervalInputs() {
			const seconds = String(this.getIntervalSeconds());
			document.querySelectorAll(".ctrlem-db-autosend-interval-input").forEach((input) => {
				if (input.value !== seconds) input.value = seconds;
			});
		}
		createIntervalInput() {
			const input = createElement("input", {
				className: "ctrlem-db-interval-input ctrlem-db-autosend-interval-input",
				type: "number",
				value: String(this.getIntervalSeconds()),
				attrs: {
					min: String(AUTO_SEND_INTERVAL_MIN),
					max: String(AUTO_SEND_INTERVAL_MAX),
					step: "1",
					"aria-label": "Auto-send interval in seconds"
				}
			});
			input.addEventListener("change", () => {
				const nextInterval = clampAutoSendInterval(input.value);
				this.options.setAutoSendInterval?.(nextInterval);
				this.syncIntervalInputs();
				this.renderManager();
			});
			return input;
		}
		mountControls() {
			let changed = false;
			AUTO_SEND_COMMAND_KEYS.forEach((commandKey) => {
				const config = this.getCommandConfig(commandKey);
				if (!config) return;
				document.querySelectorAll(`[data-send="${commandKey}"]`).forEach((sendButton) => {
					const parent = this.getOrCreateControlHost(sendButton);
					if (!parent || parent.querySelector(`.ctrlem-db-auto-send-button[data-command="${commandKey}"]`)) return;
					parent.classList.add("ctrlem-db-autosend-group");
					const intervalInput = this.createIntervalInput();
					const button = createElement("button", {
						className: "ctrlem-db-auto-send-button",
						text: "A",
						title: "Start auto-send",
						type: "button",
						attrs: {
							"aria-label": `Auto-send ${commandKey}`,
							"aria-pressed": "false"
						},
						dataset: { command: commandKey }
					});
					button.addEventListener("click", () => this.toggle(config, sendButton, button));
					parent.appendChild(intervalInput);
					parent.appendChild(createElement("span", {
						className: "ctrlem-db-autosend-sec",
						text: "sec"
					}));
					parent.appendChild(button);
					this.adoptCurrentPageTasks();
					this.setButtonState(button, this.states.has(commandKey));
					changed = true;
				});
			});
			this.adoptCurrentPageTasks();
			if (changed) this.options.log("info", "Auto-send controls mounted");
			return changed;
		}
		refreshControlButtons() {
			document.querySelectorAll(".ctrlem-db-auto-send-button").forEach((button) => {
				this.setButtonState(button, this.states.has(button.dataset.command));
			});
		}
		isTaskActiveForDisplay(queue, task, now = Date.now()) {
			if (task.kind === "manual") return this.isOwnerAlive(queue, task.ownerId, now);
			if (task.kind === "auto") return this.isTaskPageActive(queue, task, now);
			return false;
		}
		getReadyDisplayTasks(queue, now = Date.now()) {
			return this.sortReadyTasks(queue.tasks.filter((task) => Number(task.dueAt || 0) <= now && this.isTaskActiveForDisplay(queue, task, now)));
		}
		getEffectiveSendAt(task, queue, readyTasks, now = Date.now()) {
			const dueAt = Number(task?.dueAt || 0);
			if (dueAt > now) return dueAt;
			if (!this.isTaskActiveForDisplay(queue, task, now)) return Number.MAX_SAFE_INTEGER;
			const readyIndex = Math.max(0, readyTasks.findIndex((item) => item.id === task.id));
			return Math.max(now, this.getQueueNextSendAllowedAt(queue)) + readyIndex * this.getMinimumRequestIntervalMs();
		}
		getOrderedTasks(queue, now = Date.now()) {
			const readyTasks = this.getReadyDisplayTasks(queue, now);
			return [...queue.tasks].sort((a, b) => {
				const sendDiff = this.getEffectiveSendAt(a, queue, readyTasks, now) - this.getEffectiveSendAt(b, queue, readyTasks, now);
				if (sendDiff !== 0) return sendDiff;
				const priority = (a.kind === "manual" ? 0 : 1) - (b.kind === "manual" ? 0 : 1);
				if (priority !== 0) return priority;
				return this.taskSortValue(a) - this.taskSortValue(b);
			});
		}
		getCooldownPercent(task, queue = this.getStoredQueue(), readyTasks = this.getReadyDisplayTasks(queue)) {
			const now = Date.now();
			const dueAt = Number(task?.dueAt || 0);
			const taskRemaining = Math.max(0, dueAt - now);
			if (taskRemaining > 0) {
				const intervalMs = Math.max(1, clampAutoSendInterval(task.taskIntervalSeconds) * 1e3);
				const elapsed = intervalMs - Math.min(intervalMs, taskRemaining);
				return Math.max(0, Math.min(100, elapsed / intervalMs * 100));
			}
			if (!this.isTaskActiveForDisplay(queue, task, now)) return 100;
			const minIntervalMs = this.getMinimumRequestIntervalMs();
			const effectiveAt = this.getEffectiveSendAt(task, queue, readyTasks, now);
			const rateRemaining = Math.max(0, effectiveAt - now);
			if (rateRemaining > 0) {
				const elapsed = minIntervalMs - Math.min(minIntervalMs, rateRemaining % minIntervalMs || minIntervalMs);
				return Math.max(0, Math.min(100, elapsed / minIntervalMs * 100));
			}
			return 100;
		}
		getRemainingText(task, queue = this.getStoredQueue(), readyTasks = this.getReadyDisplayTasks(queue)) {
			const now = Date.now();
			const dueAt = Number(task?.dueAt || 0);
			const taskRemaining = Math.max(0, dueAt - now);
			if (taskRemaining > 0) return `${Math.ceil(taskRemaining / 1e3)}s`;
			if (!this.isTaskActiveForDisplay(queue, task, now)) return "waiting tab";
			const effectiveAt = this.getEffectiveSendAt(task, queue, readyTasks, now);
			const rateRemaining = Math.max(0, effectiveAt - now);
			if (rateRemaining > 0) return `rate:${Math.ceil(rateRemaining / 1e3)}s`;
			return "ready";
		}
		getTaskPageUrl(task) {
			return String(task?.pageUrl || task?.pageKey || "").trim();
		}
		openTaskPage(task) {
			const url = this.getTaskPageUrl(task);
			if (!url) return;
			const gmOpenInTab = globalThis.GM_openInTab;
			if (typeof gmOpenInTab === "function") {
				gmOpenInTab(url, {
					active: true,
					insert: true
				});
				return;
			}
			window.open(url, "_blank", "noopener");
		}
		startManagerTimer() {
			if (this.managerTimer) return;
			this.managerTimer = window.setInterval(() => {
				const queue = this.getStoredQueue();
				const readyTasks = this.getReadyDisplayTasks(queue);
				const orderedTasks = this.getOrderedTasks(queue);
				const rows = document.querySelectorAll(`#${MANAGER_ID} .ctrlem-db-autosend-row`);
				if (!queue.tasks.length || rows.length === 0) {
					window.clearInterval(this.managerTimer);
					this.managerTimer = 0;
					return;
				}
				rows.forEach((row) => {
					const task = orderedTasks.find((item) => item.id === row.dataset.taskId);
					if (task) this.updateTaskRow(row, task, queue, readyTasks);
				});
			}, USER_CONFIG.autoSend.managerRefreshMs);
		}
		setElementText(element, text) {
			if (!element) return;
			if (element.textContent !== text) element.textContent = text;
			if (element.title !== void 0 && element.title !== text) element.title = text;
		}
		updateTaskRow(row, task, queue, readyTasks) {
			row.classList.toggle("is-manual", task.kind === "manual");
			row.classList.toggle("is-auto", task.kind === "auto");
			this.setElementText(row.querySelector(".ctrlem-db-autosend-kind"), task.sendType || task.kind);
			this.setElementText(row.querySelector(".ctrlem-db-autosend-profile"), task.profileTitle || "Current profile");
			this.setElementText(row.querySelector(".ctrlem-db-autosend-code"), task.pageCode || "Current page");
			this.setElementText(row.querySelector(".ctrlem-db-autosend-category"), task.category || task.commandKey || "Send");
			const progress = row.querySelector(".ctrlem-db-autosend-progress");
			if (progress) progress.style.width = `${this.getCooldownPercent(task, queue, readyTasks)}%`;
			const wait = row.querySelector(".ctrlem-db-autosend-wait");
			if (wait) {
				const isWaitingTab = !this.isTaskActiveForDisplay(queue, task, Date.now()) && Number(task?.dueAt || 0) <= Date.now();
				this.setElementText(wait, this.getRemainingText(task, queue, readyTasks));
				wait.classList.toggle("is-open-tab", isWaitingTab);
				wait.dataset.openTab = isWaitingTab ? "true" : "false";
				wait.title = isWaitingTab ? "Open this page to resume auto-send" : wait.textContent;
			}
			row.dataset.pageUrl = this.getTaskPageUrl(task);
		}
		syncToastOffset(panel = document.getElementById(MANAGER_ID)) {
			if (!panel) {
				document.documentElement.style.removeProperty(TOAST_BOTTOM_PROPERTY);
				return;
			}
			document.documentElement.style.setProperty(TOAST_BOTTOM_PROPERTY, `${Math.ceil(panel.getBoundingClientRect().height + 16 + 12)}px`);
		}
		createTaskRow(task, queue, readyTasks) {
			const stopButton = createElement("button", {
				className: "ctrlem-db-autosend-mini-button ctrlem-db-autosend-stop",
				text: "Stop",
				title: "Stop this queued send",
				type: "button"
			});
			stopButton.addEventListener("click", () => this.requestStopTask(task.id));
			const row = createElement("div", {
				className: `ctrlem-db-autosend-row is-${task.kind}`,
				dataset: { taskId: task.id }
			}, [
				createElement("span", { className: "ctrlem-db-autosend-kind" }),
				createElement("span", { className: "ctrlem-db-autosend-profile" }),
				createElement("span", { className: "ctrlem-db-autosend-code" }),
				createElement("span", { className: "ctrlem-db-autosend-category" }),
				createElement("span", { className: "ctrlem-db-autosend-cooldown" }, [createElement("span", { className: "ctrlem-db-autosend-progress" })]),
				createElement("span", { className: "ctrlem-db-autosend-wait" }),
				stopButton
			]);
			const wait = row.querySelector(".ctrlem-db-autosend-wait");
			wait?.addEventListener("click", (event) => {
				if (wait.dataset.openTab !== "true") return;
				event.preventDefault();
				event.stopPropagation();
				const currentTask = this.getStoredQueue().tasks.find((item) => item.id === row.dataset.taskId);
				this.openTaskPage(currentTask || { pageUrl: row.dataset.pageUrl });
			});
			this.updateTaskRow(row, task, queue, readyTasks);
			return row;
		}
		renderManager() {
			const queue = this.getStoredQueue();
			const existing = document.getElementById(MANAGER_ID);
			this.refreshControlButtons();
			if (!queue.tasks.length) {
				existing?.remove();
				this.syncToastOffset(null);
				if (this.managerTimer) {
					window.clearInterval(this.managerTimer);
					this.managerTimer = 0;
				}
				return Boolean(existing);
			}
			const readyTasks = this.getReadyDisplayTasks(queue);
			const orderedTasks = this.getOrderedTasks(queue);
			if (existing) {
				existing.classList.toggle("is-collapsed", this.managerCollapsed);
				const toggleButton = existing.querySelector(".ctrlem-db-autosend-toggle");
				if (toggleButton) {
					toggleButton.textContent = this.managerCollapsed ? "Show" : "Hide";
					toggleButton.title = this.managerCollapsed ? "Expand queue" : "Collapse queue";
					toggleButton.setAttribute("aria-expanded", String(!this.managerCollapsed));
				}
				const rowsHost = existing.querySelector(".ctrlem-db-autosend-rows") || existing;
				const rowsById = new Map(Array.from(rowsHost.querySelectorAll(".ctrlem-db-autosend-row")).map((row) => [row.dataset.taskId, row]));
				orderedTasks.forEach((task, index) => {
					let row = rowsById.get(task.id);
					if (row) {
						rowsById.delete(task.id);
						this.updateTaskRow(row, task, queue, readyTasks);
					} else row = this.createTaskRow(task, queue, readyTasks);
					const currentAtIndex = rowsHost.children[index];
					if (row !== currentAtIndex) rowsHost.insertBefore(row, currentAtIndex || null);
				});
				rowsById.forEach((row) => row.remove());
				this.syncToastOffset(existing);
				this.startManagerTimer();
				return false;
			}
			const rows = orderedTasks.map((task) => this.createTaskRow(task, queue, readyTasks));
			const toggleButton = createElement("button", {
				className: "ctrlem-db-autosend-mini-button ctrlem-db-autosend-toggle",
				text: "Hide",
				title: "Collapse queue",
				type: "button",
				attrs: { "aria-expanded": String(!this.managerCollapsed) }
			});
			toggleButton.addEventListener("click", () => {
				this.managerCollapsed = !this.managerCollapsed;
				toggleButton.textContent = this.managerCollapsed ? "Show" : "Hide";
				toggleButton.title = this.managerCollapsed ? "Expand queue" : "Collapse queue";
				toggleButton.setAttribute("aria-expanded", String(!this.managerCollapsed));
				panel.classList.toggle("is-collapsed", this.managerCollapsed);
				this.syncToastOffset(panel);
			});
			const stopAllButton = createElement("button", {
				className: "ctrlem-db-autosend-mini-button ctrlem-db-autosend-stop-all",
				text: "Stop all",
				title: "Stop all queued sends",
				type: "button"
			});
			stopAllButton.addEventListener("click", () => this.requestStopAllTasks());
			const panel = createElement("div", {
				id: MANAGER_ID,
				className: "ctrlem-db-autosend-manager",
				attrs: { role: "status" }
			}, [createElement("div", { className: "ctrlem-db-autosend-head" }, [
				createElement("span", {
					className: "ctrlem-db-autosend-note",
					text: "Keep this tab open for auto-send."
				}),
				toggleButton,
				stopAllButton
			]), createElement("div", { className: "ctrlem-db-autosend-rows" }, rows)]);
			panel.classList.toggle("is-collapsed", this.managerCollapsed);
			document.body.appendChild(panel);
			this.syncToastOffset(panel);
			this.startManagerTimer();
			return true;
		}
	};
	function log(level, message, details) {
		if (!CONFIG.debug && level !== "warn" && level !== "error") return;
		const target = console[level] || console.log;
		if (details === void 0) {
			target.call(console, LOG_PREFIX, message);
			return;
		}
		target.call(console, LOG_PREFIX, message, details);
	}
	var CtrlEmSite = class {
		log;
		uploadApiItemsPromise = null;
		constructor(log) {
			this.log = log;
		}
		readDefaultImagesFromGallery(commandKey) {
			const selectors = uniqueStrings([`#gallery-${commandKey}`, ...Object.values(MEDIA_COMMANDS).filter((config) => config.type === RecordType.IMAGE).map((config) => config.gallerySelector)]);
			const items = [];
			selectors.forEach((selector) => {
				const gallery = document.querySelector(selector);
				if (!gallery) return;
				gallery.querySelectorAll(".gallery-thumb-wrapper").forEach((wrapper) => {
					const uploadId = wrapper.dataset.uploadId;
					const img = wrapper.querySelector(".gallery-thumb");
					const deleteButton = wrapper.querySelector(".gallery-thumb-delete");
					const title = img?.getAttribute("title") || img?.getAttribute("alt") || uploadId || "Uploaded image";
					const url = uploadId ? getUploadImageUrl(uploadId) : img?.src;
					const item = normalizeMediaItem({
						url,
						previewUrl: img?.src || url,
						title,
						uploadId,
						deleteButton,
						canDelete: Boolean(uploadId || deleteButton)
					});
					if (item) items.push(item);
				});
			});
			return uniqueMediaItems(items);
		}
		async fetchDefaultImagesFromApi() {
			if (!this.uploadApiItemsPromise) this.uploadApiItemsPromise = fetch("/api/uploads/my", { credentials: "same-origin" }).then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			}).then((uploads) => {
				if (!Array.isArray(uploads)) return [];
				return uniqueMediaItems(uploads.map((upload) => {
					const url = upload?.id ? getUploadImageUrl(upload.id) : upload?.url;
					return {
						url,
						title: upload?.originalName || upload?.name || upload?.id || "Uploaded image",
						previewUrl: upload?.url || url,
						uploadId: upload?.id,
						canDelete: Boolean(upload?.id)
					};
				}));
			}).catch((error) => {
				this.log("warn", "Default uploads API unavailable", { message: error?.message || String(error) });
				return [];
			});
			return this.uploadApiItemsPromise;
		}
		async getDefaultImageItems(commandKey) {
			const domItems = this.readDefaultImagesFromGallery(commandKey);
			const apiItems = await this.fetchDefaultImagesFromApi();
			const items = uniqueMediaItems([...domItems, ...apiItems]);
			if (items.length > 0) this.log("info", "Default loaded", {
				command: commandKey,
				count: items.length,
				dom: domItems.length,
				api: apiItems.length
			});
			else this.log("info", "Default fallback", { command: commandKey });
			return items;
		}
		notify(message, level = "info") {
			const showToast = window.showToast;
			if (typeof showToast === "function") showToast(message, level);
		}
		removeUploadFromSiteGalleries(uploadId) {
			if (!uploadId) return;
			document.querySelectorAll(".gallery-thumb-wrapper").forEach((wrapper) => {
				if (wrapper.dataset.uploadId === uploadId) wrapper.remove();
			});
		}
		async deleteDefaultImageItem(item, tile, refresh) {
			if (!item?.canDelete) return;
			try {
				tile?.classList.add("is-deleting");
				if (item.uploadId) {
					const response = await fetch(`/api/uploads/${encodeURIComponent(item.uploadId)}`, {
						method: "DELETE",
						credentials: "same-origin"
					});
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					this.removeUploadFromSiteGalleries(item.uploadId);
				} else if (item.deleteButton) item.deleteButton.click();
				this.uploadApiItemsPromise = null;
				this.notify("Image deleted", "success");
				refresh();
			} catch (error) {
				tile?.classList.remove("is-deleting");
				this.notify("Failed to delete image", "error");
				this.log("error", "Failed to delete default image", {
					uploadId: item.uploadId,
					message: error?.message || String(error)
				});
			}
		}
		hideMediaUi(config, panel) {
			let changed = false;
			const elements = [];
			if (config.gallerySelector) {
				const gallery = panel.querySelector(config.gallerySelector);
				if (gallery) elements.push(gallery);
			}
			panel.querySelectorAll(".gallery-thumb-delete").forEach((button) => elements.push(button));
			elements.forEach((element) => {
				if (element.classList.contains("ctrlem-db-hidden-site-ui")) return;
				element.classList.add("ctrlem-db-hidden-site-ui");
				changed = true;
			});
			if (changed) this.log("info", "Site media UI hidden", {
				command: config.key,
				count: elements.length
			});
			return changed;
		}
		getResultsParts() {
			const panel = document.querySelector(CONFIG.selectors.resultsPanel);
			const head = panel?.querySelector(".panel-head");
			const title = head?.querySelector("h2");
			return {
				panel,
				head,
				title,
				description: head?.querySelector("p"),
				actions: head ? Array.from(head.children).find((child) => child !== title?.parentElement) : null,
				responses: document.querySelector(CONFIG.selectors.resultsContainer),
				pagination: document.querySelector(CONFIG.selectors.resultsPagination)
			};
		}
	};
	var IMGBB_MAX_BYTES = USER_CONFIG.upload.imgbbMaxBytes;
	var VIDHOSTING_MAX_BYTES = USER_CONFIG.upload.vidhostingMaxBytes;
	function getErrorMessage$1(error) {
		return error?.message || String(error || "Unknown error");
	}
	function parseJson(text) {
		try {
			return JSON.parse(text);
		} catch {
			return null;
		}
	}
	function createHttpError(service, response, fallback = "Upload failed") {
		const body = response.text.trim();
		return new Error(`${service}: ${body || `${fallback} (HTTP ${response.status})`}`);
	}
	async function postFormData(url, formData) {
		const gmXmlHttpRequest = globalThis.GM_xmlhttpRequest;
		if (typeof gmXmlHttpRequest === "function") {
			console.log("[CtrlEm DB] Using GM_xmlhttpRequest for", url);
			return new Promise((resolve, reject) => {
				gmXmlHttpRequest({
					method: "POST",
					url,
					data: formData,
					timeout: USER_CONFIG.upload.externalRequestTimeoutMs,
					onload: (response) => {
						console.log("[CtrlEm DB] GM_xmlhttpRequest onload", {
							url,
							status: response.status,
							textLength: String(response.responseText || "").length
						});
						resolve({
							status: Number(response.status || 0),
							text: String(response.responseText || "")
						});
					},
					onerror: (error) => {
						console.log("[CtrlEm DB] GM_xmlhttpRequest onerror", {
							url,
							error: getErrorMessage$1(error)
						});
						reject(new Error(getErrorMessage$1(error)));
					},
					ontimeout: () => {
						console.log("[CtrlEm DB] GM_xmlhttpRequest ontimeout", {
							url,
							timeout: USER_CONFIG.upload.externalRequestTimeoutMs
						});
						reject(new Error("Request timed out"));
					}
				});
			});
		}
		console.log("[CtrlEm DB] Using fetch for", url);
		const response = await fetch(url, {
			method: "POST",
			body: formData
		});
		return {
			status: response.status,
			text: await response.text()
		};
	}
	async function uploadImageToImgBB(file, apiKey) {
		const key = String(apiKey || "").trim();
		if (!key) throw new Error("ImgBB API key is required");
		if (file.size > IMGBB_MAX_BYTES) throw new Error(`${file.name}: ImgBB limit is 32 MB`);
		const endpoint = new URL("https://api.imgbb.com/1/upload");
		endpoint.searchParams.set("key", key);
		const formData = new FormData();
		formData.append("image", file, file.name);
		const response = await postFormData(endpoint.toString(), formData);
		const payload = parseJson(response.text);
		if (response.status < 200 || response.status >= 300 || !payload?.success || !payload?.data?.url) {
			const message = payload?.error?.message || payload?.error || payload?.status_txt || response.text;
			throw new Error(`ImgBB: ${message || `Upload failed (HTTP ${response.status})`}`);
		}
		return String(payload.data.url);
	}
	async function uploadFileToCatbox(file, userhash = "") {
		const formData = new FormData();
		formData.append("reqtype", "fileupload");
		if (userhash.trim()) formData.append("userhash", userhash.trim());
		formData.append("fileToUpload", file, file.name);
		console.log("[CtrlEm DB] Catbox upload starting", {
			name: file.name,
			size: file.size,
			type: file.type
		});
		const startTime = Date.now();
		const response = await postFormData("https://catbox.moe/user/api.php", formData);
		const elapsed = Date.now() - startTime;
		const url = response.text.trim();
		console.log("[CtrlEm DB] Catbox upload response", {
			name: file.name,
			status: response.status,
			elapsed,
			url: url.slice(0, 100)
		});
		if (response.status < 200 || response.status >= 300 || !/^https?:\/\//i.test(url)) throw createHttpError("Catbox", response);
		return url;
	}
	async function uploadVideoToVidHosting(file) {
		if (file.size > VIDHOSTING_MAX_BYTES) throw new Error(`${file.name}: VidHosting limit is 100 MB`);
		const formData = new FormData();
		formData.append("file", file, file.name);
		console.log("[CtrlEm DB] VidHosting upload starting", {
			name: file.name,
			size: file.size,
			type: file.type
		});
		const startTime = Date.now();
		const response = await postFormData("https://upload.vidhosting.in/", formData);
		const elapsed = Date.now() - startTime;
		const payload = parseJson(response.text);
		console.log("[CtrlEm DB] VidHosting upload response", {
			name: file.name,
			status: response.status,
			elapsed,
			isJson: !!payload,
			responsePreview: response.text.slice(0, 500)
		});
		if (response.status < 200 || response.status >= 300 || !payload?.success || !payload?.url) {
			const message = payload?.error || payload?.message || response.text;
			throw new Error(`VidHosting: ${message || `Upload failed (HTTP ${response.status})`}`);
		}
		let url = String(payload.url);
		if (url.includes("stream.vidhosting.in") && !url.includes("/videos/")) url = url.replace("stream.vidhosting.in/", "stream.vidhosting.in/videos/");
		return url;
	}
	var ImageCache = class {
		log;
		dbPromise = null;
		inflight = new Map();
		pruneTimer = 0;
		constructor(log) {
			this.log = log;
		}
		getHttpUrl(url) {
			try {
				const parsed = new URL(String(url || "").trim(), window.location.href);
				return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
			} catch {
				return "";
			}
		}
		getCacheKey(url) {
			try {
				const parsed = new URL(String(url || "").trim(), window.location.href);
				if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
				parsed.hash = "";
				if (parsed.origin === window.location.origin && /^\/api\/uploads\/[^/]+\/image\/?$/.test(parsed.pathname)) parsed.search = "";
				return parsed.href;
			} catch {
				return "";
			}
		}
		getCacheKeys(sourceUrl, cacheKey = sourceUrl) {
			return Array.from(new Set([this.getCacheKey(cacheKey), this.getCacheKey(sourceUrl)].filter(Boolean)));
		}
		canCacheImagePreview(url) {
			return Boolean(this.getHttpUrl(url));
		}
		openDb() {
			if (!window.indexedDB) return Promise.reject(new Error("IndexedDB unavailable"));
			if (this.dbPromise) return this.dbPromise;
			this.dbPromise = new Promise((resolve, reject) => {
				const request = window.indexedDB.open(IMAGE_CACHE_DB_NAME, 1);
				request.onupgradeneeded = () => {
					const db = request.result;
					const store = db.objectStoreNames.contains("images") ? request.transaction.objectStore(IMAGE_CACHE_STORE) : db.createObjectStore(IMAGE_CACHE_STORE, { keyPath: "url" });
					if (!store.indexNames.contains("lastAccess")) store.createIndex("lastAccess", "lastAccess");
				};
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error || new Error("Failed to open image cache"));
			});
			this.dbPromise.catch(() => {
				this.dbPromise = null;
			});
			return this.dbPromise;
		}
		blobToDataUrl(blob) {
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(String(reader.result || ""));
				reader.onerror = () => reject(reader.error || new Error("Failed to read image blob"));
				reader.readAsDataURL(blob);
			});
		}
		async readCachedImageDataUrl(url) {
			try {
				const record = await this.readRecord(url);
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
			} catch (error) {
				this.log("debug", "Image cache read skipped", {
					url,
					message: error?.message || String(error)
				});
				return null;
			}
		}
		async readRecord(url) {
			const key = this.getCacheKey(url);
			if (!key) return null;
			const db = await this.openDb();
			return await new Promise((resolve, reject) => {
				const tx = db.transaction(IMAGE_CACHE_STORE, "readonly");
				const request = tx.objectStore(IMAGE_CACHE_STORE).get(key);
				request.onsuccess = () => resolve(request.result || null);
				request.onerror = () => reject(request.error || new Error("Failed to read cached image"));
				tx.onerror = () => reject(tx.error || new Error("Image cache read transaction failed"));
			});
		}
		async touchRecord(record) {
			try {
				const db = await this.openDb();
				await new Promise((resolve, reject) => {
					const tx = db.transaction(IMAGE_CACHE_STORE, "readwrite");
					tx.objectStore(IMAGE_CACHE_STORE).put({
						...record,
						lastAccess: Date.now()
					});
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error || new Error("Image cache touch transaction failed"));
				});
			} catch (error) {
				this.log("debug", "Image cache touch skipped", {
					url: record?.url,
					message: error?.message || String(error)
				});
			}
		}
		async writeDataUrl(url, dataUrl, size) {
			const key = this.getCacheKey(url);
			if (!key) return;
			if (!dataUrl || !String(dataUrl).startsWith("data:image/")) return;
			const safeSize = Number(size || dataUrl.length || 0);
			if (safeSize <= 0) return;
			try {
				const db = await this.openDb();
				await new Promise((resolve, reject) => {
					const tx = db.transaction(IMAGE_CACHE_STORE, "readwrite");
					tx.objectStore(IMAGE_CACHE_STORE).put({
						url: key,
						dataUrl,
						size: safeSize,
						cachedAt: Date.now(),
						lastAccess: Date.now()
					});
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error || new Error("Image cache write transaction failed"));
				});
				this.schedulePrune();
			} catch (error) {
				this.log("debug", "Image cache write skipped", {
					url,
					message: error?.message || String(error)
				});
			}
		}
		getHeaderValue(headers, name) {
			const pattern = new RegExp(`^${name}:\\s*([^\\r\\n]+)`, "im");
			const match = String(headers || "").match(pattern);
			return match ? match[1].trim() : "";
		}
		getImageMimeFromUrl(url) {
			try {
				const path = new URL(url, window.location.href).pathname.toLowerCase();
				if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
				if (path.endsWith(".png")) return "image/png";
				if (path.endsWith(".gif")) return "image/gif";
				if (path.endsWith(".webp")) return "image/webp";
				if (path.endsWith(".avif")) return "image/avif";
				if (path.endsWith(".bmp")) return "image/bmp";
				if (path.endsWith(".svg")) return "image/svg+xml";
			} catch {}
			return "";
		}
		normalizeImageBlob(blob, mimeType, url) {
			const type = String(mimeType || blob.type || "").split(";")[0].trim().toLowerCase() || this.getImageMimeFromUrl(url);
			if (!type.startsWith("image/")) return null;
			return blob.type === type ? blob : blob.slice(0, blob.size, type);
		}
		canFetchImageWithGm(url) {
			return url.protocol === "http:" || url.protocol === "https:";
		}
		async fetchImageBlobWithGm(url) {
			const gmXmlHttpRequest = globalThis.GM_xmlhttpRequest;
			if (typeof gmXmlHttpRequest !== "function") return null;
			return await new Promise((resolve, reject) => {
				gmXmlHttpRequest({
					method: "GET",
					url,
					responseType: "blob",
					timeout: USER_CONFIG.imageCache.fetchTimeoutMs,
					headers: { Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" },
					onload: (response) => {
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
						resolve(this.normalizeImageBlob(blob, this.getHeaderValue(response.responseHeaders, "content-type"), url));
					},
					onerror: (error) => reject(new Error(error?.message || String(error || "Request failed"))),
					ontimeout: () => reject(new Error("Request timed out"))
				});
			});
		}
		async fetchImageBlob(url) {
			const parsed = new URL(url, window.location.href);
			if (parsed.origin !== window.location.origin) {
				if (!this.canFetchImageWithGm(parsed)) return null;
				try {
					const gmBlob = await this.fetchImageBlobWithGm(parsed.href);
					if (gmBlob) return gmBlob;
				} catch (error) {
					this.log("debug", "GM image fetch fallback", {
						url: parsed.href,
						message: error?.message || String(error)
					});
				}
				return null;
			}
			const response = await fetch(parsed.href, {
				cache: "force-cache",
				credentials: parsed.origin === window.location.origin ? "same-origin" : "omit",
				referrerPolicy: "no-referrer"
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const blob = await response.blob();
			if (!(blob instanceof Blob) || blob.size <= 0) return null;
			return this.normalizeImageBlob(blob, response.headers.get("content-type") || "", parsed.href);
		}
		async fetchImageDataUrl(url) {
			const blob = await this.fetchImageBlob(url);
			if (!blob) return null;
			return {
				dataUrl: await this.blobToDataUrl(blob),
				size: blob.size
			};
		}
		async fetchAndCacheImageDataUrl(url, cacheKey) {
			const result = await this.fetchImageDataUrl(url);
			if (!result?.dataUrl) return null;
			await this.writeDataUrl(cacheKey, result.dataUrl, result.size);
			return result.dataUrl;
		}
		async resolveImagePreviewUrl(url, cacheKey = url) {
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
				pending.then(() => this.inflight.delete(primaryKey), () => this.inflight.delete(primaryKey));
			}
			return await pending || url;
		}
		setImagePreviewSource(img, sourceUrl, cacheKey = sourceUrl) {
			const url = String(sourceUrl || "").trim();
			if (!url) return;
			img.dataset.cacheSource = url;
			img.src = IMAGE_PLACEHOLDER_URL;
			this.resolveImagePreviewUrl(url, cacheKey).then((resolvedUrl) => {
				if (img.dataset.cacheSource === url) img.src = resolvedUrl;
			}).catch((error) => {
				this.log("debug", "Image preview cache fallback", {
					url,
					message: error?.message || String(error)
				});
				if (img.dataset.cacheSource === url) img.src = url;
			});
		}
		async getAllRecords() {
			const db = await this.openDb();
			return await new Promise((resolve, reject) => {
				const tx = db.transaction(IMAGE_CACHE_STORE, "readonly");
				const request = tx.objectStore(IMAGE_CACHE_STORE).getAll();
				request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
				request.onerror = () => reject(request.error || new Error("Failed to list cached images"));
				tx.onerror = () => reject(tx.error || new Error("Image cache list transaction failed"));
			});
		}
		async deleteUrls(urls) {
			const keys = Array.from(new Set(urls.map((url) => this.getCacheKey(url)).filter(Boolean)));
			if (!keys.length) return;
			const db = await this.openDb();
			await new Promise((resolve, reject) => {
				const tx = db.transaction(IMAGE_CACHE_STORE, "readwrite");
				const store = tx.objectStore(IMAGE_CACHE_STORE);
				keys.forEach((url) => store.delete(url));
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error || new Error("Image cache prune transaction failed"));
			});
		}
		async prune() {
			try {
				const newestFirst = (await this.getAllRecords()).map((record) => ({
					url: record.url,
					size: Number(record.size || record.dataUrl?.length || record.blob?.size || 0),
					lastAccess: Number(record.lastAccess || record.cachedAt || 0)
				})).sort((a, b) => b.lastAccess - a.lastAccess);
				let keptCount = 0;
				let keptBytes = 0;
				const deleteUrls = [];
				newestFirst.forEach((record) => {
					const nextCount = keptCount + 1;
					const nextBytes = keptBytes + record.size;
					if (nextCount <= 3e3 && nextBytes <= 1073741824) {
						keptCount = nextCount;
						keptBytes = nextBytes;
						return;
					}
					if (record.url) deleteUrls.push(record.url);
				});
				await this.deleteUrls(deleteUrls);
				if (deleteUrls.length > 0) this.log("info", "Image cache pruned", { deleted: deleteUrls.length });
			} catch (error) {
				this.log("debug", "Image cache prune skipped", { message: error?.message || String(error) });
			}
		}
		schedulePrune() {
			window.clearTimeout(this.pruneTimer);
			this.pruneTimer = window.setTimeout(() => this.prune(), USER_CONFIG.imageCache.pruneDelayMs);
		}
	};
	var CHECK_TIMEOUT_MS = USER_CONFIG.linkCheck.timeoutMs;
	var CHECK_CONCURRENCY = USER_CONFIG.linkCheck.concurrency;
	function getAcceptHeader(type) {
		if (type === RecordType.IMAGE) return "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
		if (type === RecordType.SOUND) return "audio/*,*/*;q=0.8";
		if (type === RecordType.VIDEO) return "video/*,*/*;q=0.8";
		return "*/*";
	}
	function getErrorMessage(error) {
		return error?.message || String(error || "Request failed");
	}
	function isOkStatus(status) {
		return status >= 200 && status < 400;
	}
	function isKnownRangeHost(url) {
		try {
			const host = new URL(url).hostname.toLowerCase();
			return host === "files.catbox.moe" || host === "stream.vidhosting.in" || host === "i.ibb.co";
		} catch {
			return false;
		}
	}
	function getHeaderValue(headers, name) {
		const prefix = `${name.toLowerCase()}:`;
		return String(headers || "").split(/\r?\n/).map((line) => line.trim()).find((line) => line.toLowerCase().startsWith(prefix))?.slice(prefix.length).trim() || "";
	}
	function hasExpectedContentType(type, contentType) {
		const value = String(contentType || "").toLowerCase();
		if (!value) return true;
		if (type === RecordType.IMAGE) return value.startsWith("image/");
		if (type === RecordType.SOUND) return value.startsWith("audio/");
		if (type === RecordType.VIDEO) return value.startsWith("video/");
		return true;
	}
	function shouldRetryWithGet(status) {
		return status === 0 || status === 403 || status === 405 || status === 501;
	}
	function normalizeStatus(status) {
		const value = Number(status || 0);
		return Number.isFinite(value) ? value : 0;
	}
	function getMediaUrlFromLine(type, line) {
		if (type === RecordType.SOUND || type === RecordType.VIDEO) return parseLabeledUrlLine(line)?.url || "";
		return String(line || "").trim();
	}
	async function requestMediaUrl(url, method, accept) {
		const gmXmlHttpRequest = globalThis.GM_xmlhttpRequest;
		const headers = { Accept: accept };
		if (method === "GET") headers.Range = "bytes=0-0";
		if (typeof gmXmlHttpRequest === "function") return await new Promise((resolve, reject) => {
			gmXmlHttpRequest({
				method,
				url,
				headers,
				timeout: CHECK_TIMEOUT_MS,
				responseType: method === "GET" ? "arraybuffer" : void 0,
				onload: (response) => resolve({
					status: normalizeStatus(response.status),
					contentType: getHeaderValue(response.responseHeaders, "content-type")
				}),
				onerror: (error) => reject(new Error(getErrorMessage(error))),
				ontimeout: () => reject(new Error("Request timed out"))
			});
		});
		const response = await fetch(url, {
			method,
			headers,
			cache: "no-store",
			credentials: "omit",
			redirect: "follow",
			referrerPolicy: "no-referrer"
		});
		return {
			status: response.status,
			contentType: response.headers.get("content-type") || ""
		};
	}
	async function probeMediaUrl(url, type) {
		const accept = getAcceptHeader(type);
		try {
			const headResult = await requestMediaUrl(url, "HEAD", accept);
			const headStatus = normalizeStatus(headResult.status);
			if (isOkStatus(headStatus) && !isKnownRangeHost(url)) return hasExpectedContentType(type, headResult.contentType) ? {
				ok: true,
				status: headStatus,
				reason: ""
			} : {
				ok: false,
				status: headStatus,
				reason: `Unexpected content type: ${headResult.contentType}`
			};
			if (!isOkStatus(headStatus) && !shouldRetryWithGet(headStatus)) return {
				ok: false,
				status: headStatus,
				reason: `HTTP ${headStatus}`
			};
		} catch {}
		try {
			const getResult = await requestMediaUrl(url, "GET", accept);
			const getStatus = normalizeStatus(getResult.status);
			if (isOkStatus(getStatus)) return hasExpectedContentType(type, getResult.contentType) ? {
				ok: true,
				status: getStatus,
				reason: ""
			} : {
				ok: false,
				status: getStatus,
				reason: `Unexpected content type: ${getResult.contentType}`
			};
			return {
				ok: false,
				status: getStatus,
				reason: `HTTP ${getStatus}`
			};
		} catch (error) {
			return {
				ok: false,
				status: 0,
				reason: getErrorMessage(error)
			};
		}
	}
	async function findBrokenMediaLinks(type, content, onProgress) {
		const entries = getCategoryDataLines(content).map((line, index) => ({
			index,
			line,
			url: getMediaUrlFromLine(type, line)
		})).filter((entry) => entry.url);
		const broken = [];
		let cursor = 0;
		let checked = 0;
		const markBroken = (entry, reason, status = 0) => {
			broken.push({
				index: entry.index,
				line: entry.line,
				url: entry.url,
				reason,
				status
			});
		};
		entries.forEach((entry) => {
			if (!isHttpUrl(entry.url)) {
				onProgress?.({
					checked,
					total: entries.length,
					brokenCount: broken.length,
					currentUrl: entry.url,
					currentLine: entry.line
				});
				markBroken(entry, "Invalid URL");
				checked += 1;
				onProgress?.({
					checked,
					total: entries.length,
					brokenCount: broken.length,
					currentUrl: entry.url,
					currentLine: entry.line
				});
			}
		});
		const httpEntries = entries.filter((entry) => isHttpUrl(entry.url));
		onProgress?.({
			checked,
			total: entries.length,
			brokenCount: broken.length
		});
		const runWorker = async () => {
			while (cursor < httpEntries.length) {
				const entry = httpEntries[cursor];
				cursor += 1;
				onProgress?.({
					checked,
					total: entries.length,
					brokenCount: broken.length,
					currentUrl: entry.url,
					currentLine: entry.line
				});
				const result = await probeMediaUrl(entry.url, type);
				checked += 1;
				if (!result.ok) markBroken(entry, result.reason, result.status);
				onProgress?.({
					checked,
					total: entries.length,
					brokenCount: broken.length,
					currentUrl: entry.url,
					currentLine: entry.line
				});
			}
		};
		const workers = Array.from({ length: Math.min(CHECK_CONCURRENCY, httpEntries.length) }, runWorker);
		await Promise.all(workers);
		broken.sort((a, b) => a.index - b.index);
		return {
			total: entries.length,
			checked,
			broken
		};
	}
	async function readStoredJson(key, label) {
		try {
			let raw = null;
			const gmGetValue = globalThis.GM_getValue;
			if (typeof gmGetValue === "function") raw = await gmGetValue(key, null);
			else raw = window.localStorage.getItem(key);
			if (!raw) return null;
			return typeof raw === "string" ? JSON.parse(raw) : raw;
		} catch (error) {
			log("warn", `Failed to read ${label}`, { message: error?.message || String(error) });
			return null;
		}
	}
	async function writeStoredJson(key, value) {
		const serialized = JSON.stringify(value);
		const gmSetValue = globalThis.GM_setValue;
		if (typeof gmSetValue === "function") {
			await gmSetValue(key, serialized);
			return;
		}
		window.localStorage.setItem(key, serialized);
	}
	async function readStoredState() {
		return readStoredJson(STORAGE_KEY, "DB state");
	}
	async function writeStoredState(state) {
		await writeStoredJson(STORAGE_KEY, state);
	}
	async function readStoredUiState() {
		return readStoredJson(UI_STORAGE_KEY, "UI state");
	}
	async function writeStoredUiState(state) {
		await writeStoredJson(UI_STORAGE_KEY, state);
	}
	async function readStoredUploaderSettings() {
		return readStoredJson(UPLOADER_SETTINGS_STORAGE_KEY, "uploader settings");
	}
	async function writeStoredUploaderSettings(settings) {
		await writeStoredJson(UPLOADER_SETTINGS_STORAGE_KEY, settings);
	}
	var dragCategoryId = null;
	function renderDbManager(root, viewModel, actions) {
		const activeTab = viewModel.uiState?.activeTab || MANAGER_TABS.EDITOR;
		const layoutChildren = activeTab === MANAGER_TABS.EDITOR ? [createManagerSide(viewModel, actions), createManagerWorkspace(viewModel, actions)] : [createManagerWorkspace(viewModel, actions)];
		root.replaceChildren(createManagerTopBar(viewModel, actions), createElement("div", { className: `ctrlem-db-manager-layout${activeTab !== MANAGER_TABS.EDITOR ? " is-single-panel" : ""}` }, layoutChildren));
	}
	function renderCategoryList(list, viewModel, actions) {
		if (!list) return;
		const selected = viewModel.selectedCategory;
		list.replaceChildren();
		viewModel.categories.forEach((category) => {
			const item = createElement("button", {
				className: `ctrlem-db-category-item${category.id === selected?.id ? " is-selected" : ""}`,
				text: "",
				type: "button",
				title: `${category.name} - drag to reorder`,
				attrs: { draggable: "true" },
				dataset: { id: category.id }
			}, [createElement("span", { className: "ctrlem-db-category-item-main" }, [createElement("span", {
				className: "ctrlem-db-drag-handle",
				text: "::",
				attrs: { "aria-hidden": "true" }
			}), createElement("span", {
				className: "ctrlem-db-category-item-name",
				text: category.name
			})]), createElement("span", {
				className: "ctrlem-db-category-item-count",
				text: String(parseLines(category.content).length)
			})]);
			item.addEventListener("click", () => actions.selectCategory(category.id));
			item.addEventListener("dragstart", (event) => {
				dragCategoryId = category.id;
				item.classList.add("is-dragging");
				event.dataTransfer?.setData("text/plain", category.id);
				event.dataTransfer?.setDragImage(item, 10, 10);
			});
			item.addEventListener("dragend", () => {
				dragCategoryId = null;
				item.classList.remove("is-dragging");
				list.querySelectorAll(".ctrlem-db-category-item.is-drop-target").forEach((target) => {
					target.classList.remove("is-drop-target");
				});
			});
			item.addEventListener("dragover", (event) => {
				event.preventDefault();
				if (dragCategoryId && dragCategoryId !== category.id) item.classList.add("is-drop-target");
			});
			item.addEventListener("dragleave", () => {
				item.classList.remove("is-drop-target");
			});
			item.addEventListener("drop", (event) => {
				event.preventDefault();
				item.classList.remove("is-drop-target");
				const sourceId = event.dataTransfer?.getData("text/plain") || dragCategoryId;
				actions.reorderCategory(sourceId, category.id);
			});
			list.appendChild(item);
		});
		window.setTimeout(() => {
			list.scrollTop = Math.max(0, Number(viewModel.uiState?.categoryListScrollTop) || 0);
		}, 0);
	}
	function setManagerStatus(message, level = "info") {
		const status = document.getElementById(UI_IDS.dbManagerStatus);
		if (!status) return;
		status.textContent = message || "";
		status.dataset.level = level;
	}
	function createManagerTopBar(viewModel, actions) {
		return createElement("div", { className: "ctrlem-db-manager-topbar" }, [createTopTabs(viewModel, actions)]);
	}
	function createTopTabs(viewModel, actions) {
		const activeTab = viewModel.uiState?.activeTab || MANAGER_TABS.EDITOR;
		const row = createElement("div", {
			className: "ctrlem-db-type-row",
			attrs: { role: "tablist" }
		});
		TYPE_ORDER.forEach((type) => {
			const isActive = activeTab === MANAGER_TABS.EDITOR && viewModel.activeType === type;
			const button = createElement("button", {
				className: `ctrlem-db-type-option${isActive ? " is-active" : ""}`,
				text: TYPE_LABELS[type],
				type: "button",
				attrs: {
					role: "tab",
					"aria-selected": String(isActive)
				},
				dataset: { type }
			});
			button.addEventListener("click", () => actions.setActiveType(type));
			row.appendChild(button);
		});
		[{
			key: MANAGER_TABS.SETTINGS,
			label: "Settings"
		}, {
			key: MANAGER_TABS.INFO,
			label: "Info"
		}].forEach((tab) => {
			const isActive = activeTab === tab.key;
			const button = createElement("button", {
				className: `ctrlem-db-type-option${isActive ? " is-active" : ""}`,
				text: tab.label,
				type: "button",
				attrs: {
					role: "tab",
					"aria-selected": String(isActive)
				},
				dataset: { tab: tab.key }
			});
			button.addEventListener("click", () => actions.setActiveTab(tab.key));
			row.appendChild(button);
		});
		return row;
	}
	function createManagerSide(viewModel, actions) {
		const list = createElement("div", {
			id: UI_IDS.dbManagerCategoryList,
			className: "ctrlem-db-category-list"
		});
		let scrollTimer = 0;
		list.addEventListener("scroll", () => {
			window.clearTimeout(scrollTimer);
			scrollTimer = window.setTimeout(() => actions.setCategoryListScroll(list.scrollTop), USER_CONFIG.ui.scrollSaveDelayMs);
		});
		renderCategoryList(list, viewModel, actions);
		return createElement("div", { className: "ctrlem-db-manager-side" }, [
			createElement("div", {
				className: "ctrlem-db-side-title",
				text: "Categories DB:"
			}),
			list,
			createElement("div", {
				id: UI_IDS.dbManagerStatus,
				className: "ctrlem-db-status",
				attrs: { "aria-live": "polite" }
			}),
			createElement("div", { className: "ctrlem-db-side-note" }, [createElement("span", { text: "Categories can be dragged to change order." })])
		]);
	}
	function createManagerWorkspace(viewModel, actions) {
		const activeTab = viewModel.uiState?.activeTab || MANAGER_TABS.EDITOR;
		let panel = createEditorPanel(viewModel, actions);
		if (activeTab === MANAGER_TABS.SETTINGS) panel = createSettingsTools(viewModel, actions);
		if (activeTab === MANAGER_TABS.INFO) panel = createInfoPanel(viewModel);
		return createElement("div", { className: "ctrlem-db-manager-workspace" }, [panel]);
	}
	function createEditorPanel(viewModel, actions) {
		const activeCategory = viewModel.selectedCategory;
		const nameInput = createElement("input", {
			className: "ctrlem-db-category-name-input",
			type: "text",
			value: activeCategory?.name || "",
			attrs: {
				autocomplete: "off",
				spellcheck: "false"
			}
		});
		const addButton = createElement("button", {
			className: "btn btn-sm btn-secondary",
			text: "Add",
			type: "button"
		});
		const deleteButton = createElement("button", {
			className: "btn btn-sm btn-secondary",
			text: "Delete",
			type: "button"
		});
		const textarea = createElement("textarea", {
			id: UI_IDS.dbManagerTextarea,
			className: "ctrlem-db-manager-textarea",
			value: activeCategory?.content || "",
			attrs: {
				wrap: "off",
				spellcheck: "false"
			}
		});
		const commitName = () => {
			nameInput.value = actions.renameCategoryTo(nameInput.value);
		};
		nameInput.addEventListener("change", commitName);
		nameInput.addEventListener("blur", commitName);
		nameInput.addEventListener("keydown", (event) => {
			if (event.key !== "Enter") return;
			event.preventDefault();
			commitName();
			nameInput.blur();
		});
		addButton.addEventListener("click", actions.addCategory);
		deleteButton.addEventListener("click", actions.deleteCategory);
		textarea.addEventListener("input", () => {
			actions.updateEditorContent(textarea.value);
		});
		return createElement("div", {
			className: "ctrlem-db-tab-panel ctrlem-db-editor-panel",
			attrs: { role: "tabpanel" }
		}, [
			createElement("div", { className: "ctrlem-db-editor-head" }, [
				nameInput,
				addButton,
				deleteButton
			]),
			textarea,
			createEditorHelp(viewModel.activeType),
			createEditorSaveRow(viewModel, actions)
		]);
	}
	function createEditorSaveRow(viewModel, actions) {
		const autoSaveToggle = createElement("input", {
			type: "checkbox",
			checked: viewModel.autoSave
		});
		const saveButton = createElement("button", {
			className: "btn btn-sm btn-primary",
			text: "Save",
			type: "button"
		});
		autoSaveToggle.addEventListener("change", () => actions.setAutoSave(autoSaveToggle.checked));
		saveButton.addEventListener("click", () => actions.save());
		return createElement("div", { className: "ctrlem-db-editor-save-row" }, [
			createElement("label", {
				className: "toggle ctrlem-db-editor-autosave-toggle",
				title: "Toggle DB auto-save"
			}, [autoSaveToggle, createElement("span", { className: "toggle-slider" })]),
			createElement("span", {
				className: "text-muted ctrlem-db-autosave-label",
				text: "Auto-save"
			}),
			saveButton
		]);
	}
	function isMediaManagerType(type) {
		return type === RecordType.IMAGE || type === RecordType.SOUND || type === RecordType.VIDEO;
	}
	function createEditorHelp(type) {
		const items = ["One item per line."];
		if (isMediaManagerType(type)) items.push("Media link names can be written after the URL separated by a space.");
		if (type === RecordType.IMAGE) items.push("- (no previews) disables image previews for that category.");
		return createElement("ul", { className: "ctrlem-db-editor-help" }, items.map((text) => createElement("li", { text })));
	}
	function formatBrokenLinkResults(items) {
		return [...new Set(items.map((item) => item.url).filter(Boolean))].join("\n");
	}
	function formatLinkCheckType(type) {
		if (type === RecordType.IMAGE) return "Images";
		if (type === RecordType.SOUND) return "Sounds";
		if (type === RecordType.VIDEO) return "Videos";
		return "-";
	}
	function getLinkCheckScopeType(state) {
		return [
			RecordType.IMAGE,
			RecordType.SOUND,
			RecordType.VIDEO
		].includes(state.scopeType) ? state.scopeType : RecordType.IMAGE;
	}
	function createLinkCheckScopeControls(viewModel, state, actions) {
		const scopeAll = state.scopeAll !== false;
		const scopeType = getLinkCheckScopeType(state);
		const mediaCategories = viewModel.linkCheckCategories || {};
		const categories = Array.isArray(mediaCategories[scopeType]) ? mediaCategories[scopeType] : [];
		const scopeCategoryId = categories.some((category) => category.id === state.scopeCategoryId) ? state.scopeCategoryId : categories[0]?.id || "";
		const allMediaToggle = createElement("input", {
			type: "checkbox",
			checked: scopeAll
		});
		const typeSelect = createElement("select", {
			className: "ctrlem-db-link-check-select",
			value: scopeType
		}, [
			RecordType.IMAGE,
			RecordType.SOUND,
			RecordType.VIDEO
		].map((type) => createElement("option", {
			text: formatLinkCheckType(type),
			value: type,
			attrs: { value: type }
		})));
		const categorySelect = createElement("select", {
			className: "ctrlem-db-link-check-select",
			value: scopeCategoryId
		}, categories.map((category) => createElement("option", {
			text: category.name,
			value: category.id,
			attrs: { value: category.id }
		})));
		typeSelect.value = scopeType;
		categorySelect.value = scopeCategoryId;
		allMediaToggle.disabled = Boolean(state.isBusy);
		typeSelect.disabled = Boolean(state.isBusy);
		categorySelect.disabled = Boolean(state.isBusy);
		allMediaToggle.addEventListener("change", () => actions.setLinkCheckScope({ scopeAll: allMediaToggle.checked }));
		typeSelect.addEventListener("change", () => actions.setLinkCheckScope({ scopeType: typeSelect.value }));
		categorySelect.addEventListener("change", () => actions.setLinkCheckScope({ scopeCategoryId: categorySelect.value }));
		const children = [createElement("label", { className: "ctrlem-db-settings-check ctrlem-db-link-check-all-toggle" }, [allMediaToggle, createElement("span", { text: "All media" })])];
		if (!scopeAll) children.push(createElement("label", { className: "ctrlem-db-link-check-field" }, [createElement("span", { text: "Type" }), typeSelect]), createElement("label", { className: "ctrlem-db-link-check-field" }, [createElement("span", { text: "Category" }), categorySelect]));
		return createElement("div", { className: "ctrlem-db-link-check-scope" }, children);
	}
	function createBrokenLinkTools(viewModel, actions) {
		const state = viewModel.linkCheck || {};
		const broken = Array.isArray(state.broken) ? state.broken : [];
		const status = createElement("div", {
			className: "ctrlem-db-link-check-status",
			text: state.statusMessage || "No check results yet.",
			attrs: { "aria-live": "polite" }
		});
		status.dataset.level = state.statusLevel || "info";
		const checkButton = createElement("button", {
			className: "btn btn-sm btn-secondary",
			text: state.isBusy ? "Checking..." : "Check broken links",
			type: "button"
		});
		const removeButton = createElement("button", {
			className: "btn btn-sm btn-secondary",
			text: "Remove broken",
			type: "button"
		});
		const resultTextarea = createElement("textarea", {
			className: "ctrlem-db-link-check-results",
			value: formatBrokenLinkResults(broken),
			attrs: {
				readonly: "",
				rows: "4",
				placeholder: "Broken links will appear here",
				spellcheck: "false"
			}
		});
		const currentCategory = state.currentCategoryName ? `${formatLinkCheckType(state.currentType)} / ${state.currentCategoryName}` : "-";
		const currentUrl = state.currentUrl || "-";
		checkButton.disabled = Boolean(state.isBusy);
		removeButton.disabled = Boolean(state.isBusy || broken.length === 0);
		checkButton.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			actions.checkBrokenLinks();
		});
		removeButton.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			actions.removeBrokenLinks();
		});
		return createElement("div", { className: "ctrlem-db-link-check-tools" }, [
			createElement("div", {
				className: "ctrlem-db-settings-title",
				text: "Check broken links"
			}),
			createElement("div", {
				className: "ctrlem-db-link-check-copy",
				text: "Checking many links can take some time. You can check all media or a specific category."
			}),
			createLinkCheckScopeControls(viewModel, state, actions),
			createElement("div", { className: "ctrlem-db-link-check-actions" }, [
				checkButton,
				removeButton,
				status
			]),
			createElement("div", { className: "ctrlem-db-link-check-progress" }, [
				createElement("div", { className: "ctrlem-db-link-check-row" }, [createElement("span", { text: "Checked links" }), createElement("strong", { text: `${Number(state.checked || 0)}/${Number(state.total || 0)}` })]),
				createElement("div", { className: "ctrlem-db-link-check-row" }, [createElement("span", { text: "Broken" }), createElement("strong", { text: String(Number(state.brokenCount || 0)) })]),
				createElement("div", { className: "ctrlem-db-link-check-row" }, [createElement("span", { text: "Category" }), createElement("strong", { text: currentCategory })]),
				createElement("div", { className: "ctrlem-db-link-check-row ctrlem-db-link-check-row-url" }, [createElement("span", { text: "Current link" }), createElement("strong", {
					text: currentUrl,
					title: currentUrl
				})])
			]),
			resultTextarea
		]);
	}
	function createInfoPanel(viewModel) {
		const profileTitle = String(viewModel.profileTitle || "").trim();
		const children = [createElement("div", {
			className: "ctrlem-db-settings-title",
			text: "CtrlEm DB userscript"
		})];
		if (profileTitle) children.push(createElement("p", {
			className: "ctrlem-db-info-copy",
			text: `Profile: ${profileTitle}`
		}));
		children.push(createElement("p", {
			className: "ctrlem-db-info-copy",
			text: "A local database manager for CtrlEm command inputs, picker rows, media links, uploads, and auto-send workflows."
		}), createElement("ul", { className: "ctrlem-db-info-list" }, [
			createElement("li", { text: "Stores reusable links, text, images, sounds, and videos by category." }),
			createElement("li", { text: "Adds picker controls beside supported CtrlEm inputs." }),
			createElement("li", { text: "Supports import, export, defaults restore, and media upload helpers." }),
			createElement("li", { text: "Can cycle visible category items with auto-send controls." })
		]));
		return createElement("div", {
			className: "ctrlem-db-tab-panel ctrlem-db-info-panel",
			attrs: { role: "tabpanel" }
		}, [createElement("div", { className: "ctrlem-db-settings-section" }, children)]);
	}
	function createSettingsTools(viewModel, actions) {
		const importAllInput = createElement("input", {
			id: UI_IDS.dbManagerImportAll,
			type: "file",
			attrs: {
				accept: ".json,application/json",
				hidden: ""
			}
		});
		importAllInput.addEventListener("change", () => {
			actions.importAllCategories(importAllInput.files?.[0]);
			importAllInput.value = "";
		});
		const exportAllButton = createElement("button", {
			className: "btn btn-sm btn-secondary",
			text: "Export all (json)",
			type: "button"
		});
		const importAllButton = createElement("button", {
			className: "btn btn-sm btn-secondary",
			text: "Import all (json)",
			type: "button"
		});
		const restoreDefaultsButton = createElement("button", {
			className: "btn btn-sm btn-secondary",
			text: "Restore Defaults",
			type: "button"
		});
		exportAllButton.addEventListener("click", actions.exportAll);
		importAllButton.addEventListener("click", () => importAllInput.click());
		restoreDefaultsButton.addEventListener("click", actions.restoreDefaults);
		const imgbbApiKey = createElement("input", {
			className: "ctrlem-db-settings-input",
			type: "password",
			value: viewModel.uploaderSettings?.imgbbApiKey || "",
			attrs: {
				placeholder: "ImgBB API key",
				autocomplete: "off"
			}
		});
		const catboxUserhash = createElement("input", {
			className: "ctrlem-db-settings-input",
			type: "password",
			value: viewModel.uploaderSettings?.catboxUserhash || "",
			attrs: {
				placeholder: "Catbox userhash",
				autocomplete: "off"
			}
		});
		const hideCtrlEmUploader = createElement("input", {
			type: "checkbox",
			checked: viewModel.uploaderSettings?.hideCtrlEmUploader === true
		});
		const autoDownloadSendOrDeleteImages = createElement("input", {
			type: "checkbox",
			checked: viewModel.uploaderSettings?.autoDownloadSendOrDeleteImages !== false
		});
		imgbbApiKey.addEventListener("input", () => actions.setUploaderSetting("imgbbApiKey", imgbbApiKey.value));
		catboxUserhash.addEventListener("input", () => actions.setUploaderSetting("catboxUserhash", catboxUserhash.value));
		hideCtrlEmUploader.addEventListener("change", () => actions.setUploaderSetting("hideCtrlEmUploader", hideCtrlEmUploader.checked));
		autoDownloadSendOrDeleteImages.addEventListener("change", () => {
			actions.setUploaderSetting("autoDownloadSendOrDeleteImages", autoDownloadSendOrDeleteImages.checked);
		});
		return createElement("div", {
			className: "ctrlem-db-tab-panel ctrlem-db-settings-panel",
			attrs: { role: "tabpanel" }
		}, [
			createElement("div", { className: "ctrlem-db-settings-section" }, [
				createElement("div", {
					className: "ctrlem-db-settings-title",
					text: "Uploader settings"
				}),
				createElement("label", { className: "ctrlem-db-settings-field" }, [createElement("span", { text: "ImgBB API key" }), imgbbApiKey]),
				createElement("label", { className: "ctrlem-db-settings-field" }, [createElement("span", { text: "Catbox userhash (optional)" }), catboxUserhash]),
				createElement("label", { className: "ctrlem-db-settings-field ctrlem-db-settings-check" }, [hideCtrlEmUploader, createElement("span", { text: "Hide CtrlEm uploader box" })]),
				createElement("label", { className: "ctrlem-db-settings-field ctrlem-db-settings-check" }, [autoDownloadSendOrDeleteImages, createElement("span", { text: "Auto-download Send or Delete images" })])
			]),
			createElement("div", { className: "ctrlem-db-settings-section" }, [createBrokenLinkTools(viewModel, actions)]),
			createElement("div", { className: "ctrlem-db-settings-section ctrlem-db-database-section" }, [createElement("div", {
				className: "ctrlem-db-settings-title",
				text: "Database"
			}), createElement("div", { className: "ctrlem-db-import-actions" }, [
				exportAllButton,
				importAllButton,
				restoreDefaultsButton,
				importAllInput
			])])
		]);
	}
	var APP_CSS = `
.ctrlem-db-hidden-site-ui {
  display: none !important;
}

.ctrlem-db-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.ctrlem-db-head-copy {
  min-width: 0;
}

.ctrlem-db-button {
  flex: 0 0 auto;
  min-width: 44px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.75rem;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-primary, #fff);
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1;
  transition: var(--transition, all 0.2s ease);
}

.ctrlem-db-button:hover,
.ctrlem-db-button:focus-visible,
.ctrlem-db-button.is-active {
  border-color: var(--accent-primary, #5865f2);
  background: var(--accent-light, rgba(88, 101, 242, 0.1));
  outline: none;
}

.ctrlem-db-phrase-list {
  display: grid;
  gap: 8px;
  max-height: 180px;
  margin: 10px 0 0;
  overflow-y: auto;
  padding-right: 2px;
}

.ctrlem-db-text-picker {
  display: grid;
  gap: 8px;
  max-height: none;
}

.ctrlem-db-text-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ctrlem-db-text-select {
  width: 100%;
}

.ctrlem-db-category {
  overflow: hidden;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-secondary, #1a1a1a);
}

.ctrlem-db-category-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-bottom: 1px solid var(--border-color, #333);
  background: transparent;
  color: var(--text-secondary, #b0b0b0);
  cursor: pointer;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.3;
  text-align: left;
}

.ctrlem-db-category-title:hover,
.ctrlem-db-category-title:focus-visible {
  background: var(--accent-light, rgba(88, 101, 242, 0.1));
  color: var(--text-primary, #fff);
  outline: none;
}

.ctrlem-db-category.is-collapsed .ctrlem-db-category-title {
  border-bottom-color: transparent;
}

.ctrlem-db-category-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ctrlem-db-category-meta {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.ctrlem-db-category-count {
  color: var(--text-muted, #666);
  font-weight: 600;
}

.ctrlem-db-category-chevron {
  display: inline-block;
  color: var(--text-muted, #666);
  transition: transform 0.15s ease;
}

.ctrlem-db-category-title[aria-expanded="false"] .ctrlem-db-category-chevron {
  transform: rotate(-90deg);
}

.ctrlem-db-rows {
  display: grid;
}

.ctrlem-db-text-picker .ctrlem-db-rows {
  max-height: 180px;
  overflow-y: auto;
}

.ctrlem-db-rows[hidden] {
  display: none;
}

.ctrlem-db-row {
  width: 100%;
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  border-left: 2px solid transparent;
  background: transparent;
  color: var(--text-primary, #fff);
  cursor: pointer;
  font: inherit;
  font-size: 0.84rem;
  line-height: 1.35;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  transition: var(--transition, all 0.2s ease);
  white-space: nowrap;
}

.ctrlem-db-row:last-child {
  border-bottom: 0;
}

.ctrlem-db-row:hover,
.ctrlem-db-row:focus-visible,
.ctrlem-db-row.is-selected {
  border-left-color: var(--accent-primary, #5865f2);
  background: var(--accent-light, rgba(88, 101, 242, 0.1));
  outline: none;
}

.ctrlem-db-media-picker {
  display: grid;
  gap: 8px;
  margin: 0 0 10px;
}

.ctrlem-db-media-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ctrlem-db-media-select {
  width: 100%;
}

.ctrlem-db-category-toolbar select {
  min-width: 0;
  flex: 1 1 auto;
}

.ctrlem-db-category-tool-button {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  display: inline-grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-primary, #fff);
  cursor: pointer;
  font: inherit;
  font-size: 0.92rem;
  font-weight: 800;
  line-height: 1;
}

.ctrlem-db-category-tool-button:hover,
.ctrlem-db-category-tool-button:focus-visible {
  border-color: var(--accent-primary, #5865f2);
  background: var(--accent-light, rgba(88, 101, 242, 0.1));
  outline: none;
}

.ctrlem-db-category-tool-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.ctrlem-db-preview-toggle {
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  color: var(--text-secondary, #b0b0b0);
  font-size: 0.74rem;
  font-weight: 700;
  white-space: nowrap;
}

.ctrlem-db-preview-toggle::after {
  content: attr(data-tooltip);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  z-index: 4;
  max-width: 180px;
  padding: 0.28rem 0.45rem;
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-primary, #fff);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.32);
  font-size: 0.7rem;
  line-height: 1.2;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 2px);
  transition: opacity 0.05s ease, transform 0.05s ease;
  white-space: nowrap;
}

.ctrlem-db-preview-toggle:hover::after,
.ctrlem-db-preview-toggle:focus-within::after {
  opacity: 1;
  transform: translate(-50%, 0);
}

.ctrlem-db-preview-toggle-input {
  accent-color: var(--accent-primary, #5865f2);
}

.ctrlem-db-preview-toggle:has(.ctrlem-db-preview-toggle-input:disabled) {
  cursor: not-allowed;
  opacity: 0.55;
}

.ctrlem-db-media-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: calc(64px * 4 + 8px * 3);
  overflow-y: auto;
  scrollbar-width: thin;
}

.ctrlem-db-media-grid::-webkit-scrollbar {
  width: 6px;
}

.ctrlem-db-media-tile {
  position: relative;
  width: 64px;
  height: 64px;
  overflow: hidden;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 6px;
  background: var(--bg-secondary, #1a1a1a);
  color: var(--text-primary, #fff);
  cursor: pointer;
  transition: var(--transition, all 0.2s ease);
}

.ctrlem-db-media-tile:hover,
.ctrlem-db-media-tile:focus-visible,
.ctrlem-db-media-tile.is-selected {
  border-color: var(--accent-primary, #5865f2);
  outline: none;
}

.ctrlem-db-media-tile.is-selected {
  box-shadow: 0 0 0 2px rgba(88, 101, 242, 0.3);
}

.ctrlem-db-media-tile.is-deleting {
  opacity: 0.55;
  pointer-events: none;
}

.ctrlem-db-media-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ctrlem-db-media-tile.no-preview {
  display: grid;
  place-items: center;
  padding: 5px;
}

.ctrlem-db-media-url-label {
  display: -webkit-box;
  max-width: 100%;
  overflow: hidden;
  color: var(--text-secondary, #b0b0b0);
  font-size: 0.62rem;
  line-height: 1.15;
  overflow-wrap: anywhere;
  text-align: center;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.ctrlem-db-media-delete {
  position: absolute;
  top: 3px;
  right: 3px;
  z-index: 3;
  width: 20px;
  height: 20px;
  display: inline-grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 800;
  line-height: 1;
}

.ctrlem-db-media-delete:hover,
.ctrlem-db-media-delete:focus-visible {
  border-color: var(--danger, #ed4245);
  background: var(--danger, #ed4245);
  outline: none;
}

.ctrlem-db-autosend-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ctrlem-db-autosend-group > [data-send] {
  flex: 1 1 auto;
}

.ctrlem-db-auto-send-button {
  flex: 0 0 38px;
  min-width: 38px;
  height: 32px;
  display: inline-grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-primary, #fff);
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1;
  transition: var(--transition, all 0.2s ease);
}

.ctrlem-db-auto-send-button:hover,
.ctrlem-db-auto-send-button:focus-visible,
.ctrlem-db-auto-send-button.is-active {
  border-color: var(--accent-primary, #5865f2);
  background: var(--accent-light, rgba(88, 101, 242, 0.1));
  outline: none;
}

.ctrlem-db-auto-send-button.is-active {
  color: var(--success, #57f287);
}

.ctrlem-db-autosend-sec {
  flex: 0 0 auto;
  color: var(--text-muted, #666);
  font-size: 0.78rem;
  font-weight: 700;
}

#toast-container {
  bottom: var(--ctrlem-db-toast-bottom, 2rem) !important;
}

.ctrlem-db-autosend-manager {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 999998;
  width: min(720px, calc(100vw - 32px));
  display: grid;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-secondary, #1a1a1a);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.34);
  color: var(--text-primary, #fff);
  font: inherit;
  font-size: 0.78rem;
}

.ctrlem-db-autosend-head {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
}

.ctrlem-db-autosend-note {
  min-width: 0;
  overflow: hidden;
  color: var(--text-secondary, #b0b0b0);
  font-size: 0.72rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ctrlem-db-autosend-rows {
  display: grid;
  gap: 6px;
}

.ctrlem-db-autosend-manager.is-collapsed .ctrlem-db-autosend-rows {
  display: none;
}

.ctrlem-db-autosend-row {
  min-width: 0;
  min-height: 38px;
  display: grid;
  grid-template-columns: minmax(68px, 92px) minmax(92px, 1fr) minmax(58px, 78px) minmax(86px, 1fr) minmax(78px, 110px) 38px auto;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: rgba(255, 255, 255, 0.035);
  animation: ctrlem-db-autosend-row-in 0.16s ease-out;
  transition: transform 0.16s ease, opacity 0.16s ease, border-color 0.16s ease;
}

.ctrlem-db-autosend-row.is-manual {
  border-color: rgba(87, 242, 135, 0.45);
}

.ctrlem-db-autosend-kind,
.ctrlem-db-autosend-profile,
.ctrlem-db-autosend-category,
.ctrlem-db-autosend-code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ctrlem-db-autosend-kind {
  min-height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.16rem 0.38rem;
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-secondary, #b0b0b0);
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
}

.ctrlem-db-autosend-profile {
  color: var(--text-primary, #fff);
  font-weight: 800;
}

.ctrlem-db-row-label {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ctrlem-db-row-preview {
  flex: 0 0 auto;
  min-height: 24px;
  padding: 0.18rem 0.45rem;
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-secondary, #b0b0b0);
  cursor: pointer;
  font: inherit;
  font-size: 0.7rem;
  font-weight: 800;
  line-height: 1;
}

.ctrlem-db-row-preview:hover,
.ctrlem-db-row-preview:focus-visible {
  border-color: var(--accent-primary, #5865f2);
  color: var(--text-primary, #fff);
  outline: none;
}

.ctrlem-db-autosend-category {
  font-weight: 800;
}

.ctrlem-db-autosend-code {
  color: var(--text-secondary, #b0b0b0);
  font-weight: 700;
}

.ctrlem-db-autosend-cooldown {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
}

.ctrlem-db-autosend-progress {
  display: block;
  width: 0%;
  height: 100%;
  border-radius: inherit;
  background: var(--accent-primary, #5865f2);
  transition: width 0.18s linear;
}

.ctrlem-db-autosend-row.is-manual .ctrlem-db-autosend-progress {
  background: var(--success, #57f287);
}

.ctrlem-db-autosend-wait {
  color: var(--text-muted, #666);
  font-size: 0.72rem;
  font-weight: 800;
  text-align: right;
}

.ctrlem-db-autosend-wait.is-open-tab {
  color: var(--accent-primary, #5865f2);
  cursor: pointer;
  text-decoration: underline;
}

.ctrlem-db-autosend-mini-button {
  min-width: 54px;
  min-height: 24px;
  padding: 0.22rem 0.45rem;
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-primary, #fff);
  cursor: pointer;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 800;
  line-height: 1;
}

.ctrlem-db-autosend-mini-button:hover,
.ctrlem-db-autosend-mini-button:focus-visible {
  border-color: var(--accent-primary, #5865f2);
  background: var(--accent-light, rgba(88, 101, 242, 0.1));
  outline: none;
}

.ctrlem-db-autosend-stop:hover,
.ctrlem-db-autosend-stop:focus-visible {
  border-color: var(--danger, #ed4245);
  color: var(--danger, #ed4245);
}

.ctrlem-db-autosend-stop-all:hover,
.ctrlem-db-autosend-stop-all:focus-visible {
  border-color: var(--danger, #ed4245);
  color: var(--danger, #ed4245);
}

@keyframes ctrlem-db-autosend-row-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.ctrlem-db-interval-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted, #666);
  font-size: 0.8rem;
}

.ctrlem-db-interval-input {
  width: 64px;
  min-height: 32px;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-primary, #fff);
  font: inherit;
}

.ctrlem-db-manager {
  padding: 1rem 1.25rem;
  display: grid;
  gap: 12px;
}

.ctrlem-db-manager[hidden] {
  display: none !important;
}

.ctrlem-db-type-row,
.ctrlem-db-manager-actions,
.ctrlem-db-export-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.ctrlem-db-type-option {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-secondary, #b0b0b0);
  cursor: pointer;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
}

.ctrlem-db-type-option.is-active {
  border-color: var(--accent-primary, #5865f2);
  background: var(--accent-light, rgba(88, 101, 242, 0.1));
  color: var(--text-primary, #fff);
}

.ctrlem-db-manager-layout {
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
  gap: 12px;
}

.ctrlem-db-manager-layout.is-single-panel {
  grid-template-columns: 1fr;
}

.ctrlem-db-manager-side,
.ctrlem-db-manager-editor,
.ctrlem-db-manager-workspace {
  min-width: 0;
}

.ctrlem-db-manager-side {
  display: grid;
  gap: 8px;
  align-content: start;
}

.ctrlem-db-side-title {
  color: var(--text-primary, #fff);
  font-size: 0.86rem;
  font-weight: 800;
}

.ctrlem-db-category-list {
  display: grid;
  gap: 6px;
  max-height: 380px;
  overflow: auto;
}

.ctrlem-db-side-actions,
.ctrlem-db-import-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.ctrlem-db-side-note {
  color: var(--text-muted, #666);
  font-size: 0.76rem;
  line-height: 1.35;
}

.ctrlem-db-category-item {
  width: 100%;
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-primary, #fff);
  cursor: grab;
  font: inherit;
  font-size: 0.82rem;
  line-height: 1.2;
  text-align: left;
}

.ctrlem-db-category-item:active {
  cursor: grabbing;
}

.ctrlem-db-category-item:hover,
.ctrlem-db-category-item:focus-visible,
.ctrlem-db-category-item.is-selected {
  border-color: var(--accent-primary, #5865f2);
  background: var(--accent-light, rgba(88, 101, 242, 0.1));
  outline: none;
}

.ctrlem-db-category-item.is-dragging {
  opacity: 0.55;
}

.ctrlem-db-category-item.is-drop-target {
  border-color: var(--success, #57f287);
}

.ctrlem-db-category-item-main {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.ctrlem-db-drag-handle {
  flex: 0 0 auto;
  color: var(--text-muted, #666);
  font-size: 0.88rem;
  font-weight: 800;
  letter-spacing: 0;
}

.ctrlem-db-category-item-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ctrlem-db-category-item-count {
  flex: 0 0 auto;
  color: var(--text-muted, #666);
  font-size: 0.72rem;
  font-weight: 700;
}

.ctrlem-db-manager-editor {
  display: grid;
  gap: 10px;
}

.ctrlem-db-manager-workspace {
  display: grid;
  align-content: start;
  gap: 10px;
}

.ctrlem-db-tab-panel {
  min-width: 0;
  display: grid;
  gap: 10px;
}

.ctrlem-db-editor-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.ctrlem-db-category-name-input {
  flex: 1 1 220px;
  min-width: 180px;
  min-height: 34px;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-primary, #fff);
  font: inherit;
  font-size: 0.82rem;
}

.ctrlem-db-category-name-input:focus {
  border-color: var(--accent-primary, #5865f2);
  outline: none;
}

.ctrlem-db-manager-actions {
  justify-content: space-between;
}

.ctrlem-db-save-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.ctrlem-db-manager-topbar {
  display: grid;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color, #333);
}

.ctrlem-db-editor-save-row {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
}

.ctrlem-db-editor-autosave-toggle {
  flex: 0 0 auto;
}

.ctrlem-db-topbar-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.ctrlem-db-autosave-label {
  font-size: 0.8rem;
}

.ctrlem-db-brand-link {
  position: relative;
  color: rgba(112, 154, 220, 0.82);
  text-decoration: none;
}

.ctrlem-db-brand-link:hover,
.ctrlem-db-brand-link:focus-visible {
  color: rgba(138, 174, 230, 0.92);
  outline: none;
  text-decoration: underline;
}

.ctrlem-db-brand-tooltip {
  position: fixed;
  z-index: 999999;
  width: max-content;
  max-width: min(320px, calc(100vw - 32px));
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  background: var(--bg-primary, #0d0d0d);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.32);
  color: var(--text-primary, #fff);
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.3;
  pointer-events: none;
  text-align: left;
  white-space: normal;
}

.ctrlem-db-brand-strateg {
  font-weight: 700;
}

.ctrlem-db-brand-tag {
  font-weight: 600;
}

.ctrlem-db-uploaders {
  display: grid;
  gap: 8px;
}

.ctrlem-db-uploader-target {
  color: var(--text-muted, #666);
  font-size: 0.78rem;
}

.ctrlem-db-uploader {
  overflow: hidden;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-secondary, #1a1a1a);
}

.ctrlem-db-uploader-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 34px;
  padding: 0.5rem 0.65rem;
  cursor: pointer;
  color: var(--text-primary, #fff);
  font-size: 0.82rem;
  font-weight: 700;
  list-style: none;
}

.ctrlem-db-uploader-summary::-webkit-details-marker {
  display: none;
}

.ctrlem-db-uploader-summary::after {
  content: 'v';
  flex: 0 0 auto;
  color: var(--text-muted, #666);
  font-size: 0.78rem;
  transition: transform 0.15s ease;
}

.ctrlem-db-uploader[open] > .ctrlem-db-uploader-summary {
  border-bottom: 1px solid var(--border-color, #333);
}

.ctrlem-db-uploader[open] > .ctrlem-db-uploader-summary::after {
  transform: rotate(180deg);
}

.ctrlem-db-uploader-summary:hover,
.ctrlem-db-uploader-summary:focus-visible {
  background: var(--accent-light, rgba(88, 101, 242, 0.1));
  outline: none;
}

.ctrlem-db-uploader-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ctrlem-db-uploader-meta {
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--text-muted, #666);
  font-size: 0.72rem;
  font-weight: 700;
}

.ctrlem-db-uploader-body {
  display: grid;
  gap: 8px;
  padding: 0.65rem;
}

.ctrlem-db-uploader-fields,
.ctrlem-db-uploader-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.ctrlem-db-uploader-input {
  flex: 1 1 220px;
  min-width: 180px;
  min-height: 32px;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-primary, #fff);
  font: inherit;
  font-size: 0.82rem;
}

.ctrlem-db-uploader-file {
  flex: 2 1 260px;
  min-width: 220px;
  color: var(--text-secondary, #b0b0b0);
  font-size: 0.82rem;
}

.ctrlem-db-uploader-note {
  flex: 1 1 220px;
  color: var(--text-muted, #666);
  font-size: 0.78rem;
}

.ctrlem-db-uploader-results {
  width: 100%;
  min-height: 66px;
  max-height: 150px;
  padding: 0.55rem 0.65rem;
  overflow: auto;
  resize: vertical;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-primary, #fff);
  font: 0.8rem/1.4 Consolas, 'Courier New', monospace;
  white-space: pre;
}

.ctrlem-db-uploader-status {
  min-height: 17px;
  color: var(--text-muted, #666);
  font-size: 0.76rem;
}

.ctrlem-db-uploader-status[data-level="error"] {
  color: var(--danger, #ed4245);
}

.ctrlem-db-uploader-status[data-level="success"] {
  color: var(--success, #57f287);
}

.ctrlem-db-link-check-tools {
  display: grid;
  gap: 8px;
  margin: 0;
}

.ctrlem-db-link-check-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.ctrlem-db-link-check-copy {
  color: var(--text-muted, #666);
  font-size: 0.78rem;
  line-height: 1.35;
}

.ctrlem-db-link-check-scope {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: 8px;
}

.ctrlem-db-link-check-all-toggle {
  min-height: 34px;
}

.ctrlem-db-link-check-field {
  display: grid;
  gap: 4px;
  min-width: 150px;
  color: var(--text-secondary, #b0b0b0);
  font-size: 0.76rem;
}

.ctrlem-db-link-check-select {
  width: 100%;
  min-height: 34px;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-primary, #fff);
  font: inherit;
  font-size: 0.8rem;
}

.ctrlem-db-link-check-select:focus {
  border-color: var(--accent-primary, #5865f2);
  outline: none;
}

.ctrlem-db-link-check-status {
  flex: 1 1 180px;
  min-height: 17px;
  color: var(--text-muted, #666);
  font-size: 0.76rem;
}

.ctrlem-db-link-check-status[data-level="error"] {
  color: var(--danger, #ed4245);
}

.ctrlem-db-link-check-status[data-level="success"] {
  color: var(--success, #57f287);
}

.ctrlem-db-link-check-progress {
  display: grid;
  gap: 6px;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-primary, #0d0d0d);
}

.ctrlem-db-link-check-row {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  color: var(--text-muted, #666);
  font-size: 0.76rem;
}

.ctrlem-db-link-check-row strong {
  min-width: 0;
  overflow: hidden;
  color: var(--text-secondary, #b0b0b0);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ctrlem-db-link-check-results {
  width: 100%;
  min-height: 84px;
  max-height: 170px;
  padding: 0.55rem 0.65rem;
  overflow: auto;
  resize: vertical;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-primary, #fff);
  font: 0.8rem/1.4 Consolas, 'Courier New', monospace;
  white-space: pre;
}

.ctrlem-db-settings-panel,
.ctrlem-db-settings-section {
  display: grid;
  gap: 10px;
}

.ctrlem-db-settings-section {
  padding: 0.75rem;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-secondary, #1a1a1a);
}

.ctrlem-db-settings-title {
  color: var(--text-primary, #fff);
  font-size: 0.84rem;
  font-weight: 700;
}

.ctrlem-db-database-section {
  justify-items: center;
  text-align: center;
}

.ctrlem-db-database-section .ctrlem-db-import-actions {
  justify-content: center;
}

.ctrlem-db-settings-field {
  display: grid;
  gap: 5px;
  color: var(--text-secondary, #b0b0b0);
  font-size: 0.78rem;
}

.ctrlem-db-settings-check {
  display: flex;
  align-items: center;
}

.ctrlem-db-info-copy,
.ctrlem-db-info-list,
.ctrlem-db-editor-help {
  margin: 0;
  color: var(--text-muted, #666);
  font-size: 0.78rem;
  line-height: 1.45;
}

.ctrlem-db-info-list,
.ctrlem-db-editor-help {
  padding-left: 1.1rem;
}

.ctrlem-db-settings-input,
.ctrlem-db-imgbb-key-input {
  width: 100%;
  min-height: 34px;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-primary, #fff);
  font: inherit;
  font-size: 0.82rem;
}

.ctrlem-db-command-upload {
  display: grid;
  gap: 8px;
  margin: 10px 0;
}

.ctrlem-db-command-upload-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 34px;
  padding: 0.42rem 0.55rem;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-secondary, #1a1a1a);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: var(--transition, all 0.2s ease);
}

.ctrlem-db-command-upload-head:hover,
.ctrlem-db-command-upload-head:focus-visible {
  border-color: var(--accent-primary, #5865f2);
  background: var(--accent-light, rgba(88, 101, 242, 0.1));
}

.ctrlem-db-command-upload-head:focus-visible {
  outline: 2px solid rgba(88, 101, 242, 0.35);
  outline-offset: 1px;
}

.ctrlem-db-command-upload-title {
  color: var(--text-primary, #fff);
  font-size: 0.82rem;
  font-weight: 700;
}

.ctrlem-db-command-upload-target {
  margin-left: auto;
  color: var(--text-muted, #666);
  font-size: 0.74rem;
}

.ctrlem-db-command-upload-chevron {
  flex: 0 0 auto;
  color: var(--text-muted, #666);
  font-size: 0.74rem;
  font-weight: 800;
  transition: transform 0.15s ease;
}

.ctrlem-db-command-upload.is-collapsed .ctrlem-db-command-upload-chevron {
  transform: rotate(-90deg);
}

.ctrlem-db-command-upload-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.ctrlem-db-command-upload-recommendation {
  margin: 0;
  color: var(--text-muted, #666);
  font-size: 0.76rem;
  line-height: 1.35;
}

.ctrlem-db-command-upload.is-collapsed .ctrlem-db-command-upload-recommendation {
  display: none;
}

.ctrlem-db-command-upload-grid[hidden] {
  display: none;
}

.ctrlem-db-upload-card {
  min-width: 0;
  display: grid;
  gap: 8px;
  align-content: start;
  padding: 0.65rem;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-secondary, #1a1a1a);
}

.ctrlem-db-upload-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.ctrlem-db-upload-card-title {
  color: var(--text-primary, #fff);
  font-size: 0.82rem;
  font-weight: 700;
}

.ctrlem-db-upload-card-note {
  color: var(--text-muted, #666);
  font-size: 0.72rem;
  line-height: 1.3;
  text-align: right;
}

.ctrlem-db-command-upload-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.ctrlem-db-command-upload-file {
  flex: 1 1 180px;
  min-width: 0;
  color: var(--text-secondary, #b0b0b0);
  font-size: 0.78rem;
}

.ctrlem-db-external-dropzone {
  min-height: 92px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0.65rem;
  border: 2px dashed var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-secondary, #b0b0b0);
  cursor: pointer;
  text-align: center;
  transition: var(--transition, all 0.2s ease);
}

.ctrlem-db-external-dropzone:hover,
.ctrlem-db-external-dropzone:focus-visible,
.ctrlem-db-external-dropzone.drag-active {
  border-color: var(--accent-primary, #5865f2);
  background: var(--accent-light, rgba(88, 101, 242, 0.1));
  outline: none;
}

.ctrlem-db-external-dropzone.is-busy {
  cursor: wait;
  opacity: 0.72;
}

.ctrlem-db-external-dropzone-icon {
  display: inline-grid;
  place-items: center;
  min-width: 42px;
  min-height: 22px;
  color: var(--text-muted, #666);
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
}

.ctrlem-db-external-dropzone-main {
  color: var(--text-secondary, #b0b0b0);
  font-size: 0.82rem;
  line-height: 1.3;
}

.ctrlem-db-external-browse {
  color: var(--accent-primary, #5865f2);
  font-weight: 700;
  text-decoration: underline;
}

.ctrlem-db-external-dropzone-hint {
  color: var(--text-muted, #666);
  font-size: 0.7rem;
  line-height: 1.25;
}

.ctrlem-db-imgbb-key-status {
  min-height: 17px;
  color: var(--text-muted, #666);
  font-size: 0.74rem;
}

.ctrlem-db-imgbb-key-status[data-level="error"] {
  color: var(--danger, #ed4245);
}

.ctrlem-db-imgbb-key-status[data-level="success"] {
  color: var(--success, #57f287);
}

.ctrlem-db-upload-native-card .upload-dropzone {
  min-height: 92px;
  margin: 0;
  padding: 0.65rem;
}

.ctrlem-db-upload-dropzone {
  --ctrlem-upload-accent: var(--accent-primary, #5865f2);
  --ctrlem-upload-border: var(--border-color, #333);
  border-color: var(--ctrlem-upload-border);
  cursor: pointer;
  transition: var(--transition, all 0.2s ease);
}

.ctrlem-db-upload-dropzone[data-tool="ctrlem"] {
  --ctrlem-upload-accent: #57f287;
  --ctrlem-upload-border: rgba(87, 242, 135, 0.45);
}

.ctrlem-db-upload-dropzone[data-tool="imgbb"] {
  --ctrlem-upload-accent: #4ea1ff;
  --ctrlem-upload-border: rgba(78, 161, 255, 0.48);
}

.ctrlem-db-upload-dropzone[data-tool="catbox"] {
  --ctrlem-upload-accent: #ffb347;
  --ctrlem-upload-border: rgba(255, 179, 71, 0.5);
}

.ctrlem-db-upload-dropzone[data-tool="vidhosting"] {
  --ctrlem-upload-accent: #d685ff;
  --ctrlem-upload-border: rgba(214, 133, 255, 0.5);
}

.ctrlem-db-upload-dropzone:hover,
.ctrlem-db-upload-dropzone:focus-visible,
.ctrlem-db-upload-dropzone.drag-active {
  border-color: var(--ctrlem-upload-accent);
  background: var(--accent-light, rgba(88, 101, 242, 0.1));
  outline: none;
}

.ctrlem-db-upload-dropzone.is-busy {
  cursor: wait;
  opacity: 0.72;
  position: relative;
  overflow: hidden;
  animation: ctrlem-db-pulse-border 1.2s ease-in-out infinite;
}

.ctrlem-db-upload-dropzone.is-busy::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.06) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: ctrlem-db-shimmer 1.5s ease-in-out infinite;
  pointer-events: none;
}

.ctrlem-db-upload-dropzone.is-busy .ctrlem-db-upload-dropzone-main,
.ctrlem-db-upload-dropzone.is-busy .upload-hint,
.ctrlem-db-upload-dropzone.is-busy svg {
  position: relative;
  z-index: 2;
}

.ctrlem-db-upload-dropzone.is-busy svg {
  animation: ctrlem-db-spin 1.2s linear infinite;
}

.ctrlem-db-upload-dropzone.flash-success {
  border-color: var(--success, #57f287) !important;
  background: rgba(87, 242, 135, 0.08) !important;
  transition: border-color 0.3s ease, background 0.3s ease;
}

.ctrlem-db-upload-dropzone.flash-error {
  border-color: var(--danger, #ed4245) !important;
  background: rgba(237, 66, 69, 0.08) !important;
  transition: border-color 0.3s ease, background 0.3s ease;
}

.ctrlem-db-upload-dropzone.is-disabled {
  cursor: pointer;
  opacity: 0.72;
}

.ctrlem-db-upload-dropzone.is-disabled:hover,
.ctrlem-db-upload-dropzone.is-disabled:focus-visible {
  opacity: 1;
}

.ctrlem-db-upload-native-card .upload-dropzone svg {
  width: 22px;
  height: 22px;
  color: var(--ctrlem-upload-accent, currentColor);
}

.ctrlem-db-upload-native-card .upload-hint {
  font-size: 0.7rem;
  line-height: 1.25;
}

.ctrlem-db-upload-dropzone-main {
  color: var(--text-secondary, #b0b0b0);
  font-size: 0.82rem;
  line-height: 1.3;
}

.ctrlem-db-upload-tool-label {
  color: var(--ctrlem-upload-accent, var(--accent-primary, #5865f2));
  font-weight: 800;
}

.ctrlem-db-upload-dropzone .upload-browse-label {
  color: var(--ctrlem-upload-accent, var(--accent-primary, #5865f2));
  cursor: pointer;
  font-weight: 700;
  text-decoration: underline;
}

.ctrlem-db-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 999999;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.62);
}

.ctrlem-db-modal {
  width: min(420px, 100%);
  display: grid;
  gap: 10px;
  padding: 1rem;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-secondary, #1a1a1a);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
}

.ctrlem-db-modal-title {
  color: var(--text-primary, #fff);
  font-size: 0.95rem;
  font-weight: 800;
}

.ctrlem-db-modal-copy {
  margin: 0;
  color: var(--text-secondary, #b0b0b0);
  font-size: 0.8rem;
  line-height: 1.45;
}

.ctrlem-db-media-preview-modal {
  width: min(560px, 100%);
}

.ctrlem-db-media-preview-url {
  min-width: 0;
  display: block;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  background: var(--bg-primary, #0d0d0d);
  overflow-wrap: anywhere;
  color: var(--accent-primary, #5865f2);
  font-size: 0.76rem;
}

.ctrlem-db-media-preview-name {
  width: 100%;
  min-height: 34px;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-primary, #fff);
  font: inherit;
  font-size: 0.82rem;
}

.ctrlem-db-media-preview-status {
  min-height: 17px;
  color: var(--text-muted, #666);
  font-size: 0.74rem;
}

.ctrlem-db-media-preview-status[data-level="error"] {
  color: var(--danger, #ed4245);
}

.ctrlem-db-media-preview-status[data-level="success"] {
  color: var(--success, #57f287);
}

.ctrlem-db-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.ctrlem-db-upload-session {
  width: min(620px, 100%);
  max-height: min(680px, calc(100vh - 32px));
  overflow: auto;
}

.ctrlem-db-upload-session-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 240px);
  gap: 12px;
  align-items: end;
}

.ctrlem-db-upload-session-category {
  display: grid;
  gap: 5px;
  color: var(--text-secondary, #b0b0b0);
  font-size: 0.74rem;
}

.ctrlem-db-upload-session-select {
  width: 100%;
  min-height: 34px;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-primary, #fff);
  font: inherit;
  font-size: 0.82rem;
}

.ctrlem-db-upload-session-list {
  display: grid;
  gap: 6px;
}

.ctrlem-db-upload-session-progress {
  color: var(--text-muted, #666);
  font-size: 0.74rem;
  font-weight: 700;
  min-height: 18px;
}

.ctrlem-db-upload-session-row {
  display: grid;
  grid-template-columns: minmax(110px, 1fr) 1fr minmax(0, 1.35fr);
  gap: 8px;
  align-items: center;
  min-height: 52px;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-primary, #0d0d0d);
  transition: border-color 0.25s ease, background 0.25s ease;
}

.ctrlem-db-upload-session-row.is-uploading {
  border-color: var(--accent-primary, #5865f2);
  background: rgba(88, 101, 242, 0.06);
  animation: ctrlem-db-row-pulse 1.2s ease-in-out infinite;
}

.ctrlem-db-upload-session-row.is-uploaded {
  border-color: var(--success, #57f287);
  background: rgba(87, 242, 135, 0.06);
}

.ctrlem-db-upload-session-row.is-failed {
  border-color: var(--danger, #ed4245);
  background: rgba(237, 66, 69, 0.06);
  animation: ctrlem-db-shake 0.4s ease-in-out;
}

.ctrlem-db-upload-progress-bar {
  width: 100%;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
}

.ctrlem-db-upload-progress-fill {
  display: block;
  width: 0%;
  height: 100%;
  border-radius: inherit;
  background: var(--accent-primary, #5865f2);
  transition: width 0.3s ease;
}

.ctrlem-db-upload-session-row.is-uploading .ctrlem-db-upload-progress-fill {
  width: 60%;
  animation: ctrlem-db-indeterminate 1.4s ease-in-out infinite;
}

.ctrlem-db-upload-session-row.is-uploaded .ctrlem-db-upload-progress-fill {
  width: 100%;
  background: var(--success, #57f287);
}

.ctrlem-db-upload-session-row.is-failed .ctrlem-db-upload-progress-fill {
  width: 100%;
  background: var(--danger, #ed4245);
}

.ctrlem-db-upload-session-state-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border-radius: 50%;
  font-size: 0.65rem;
  font-weight: 800;
  line-height: 1;
}

.ctrlem-db-upload-session-row.is-uploaded .ctrlem-db-upload-session-state-icon {
  background: var(--success, #57f287);
  color: #fff;
  animation: ctrlem-db-check-in 0.3s ease-out;
}

.ctrlem-db-upload-session-row.is-failed .ctrlem-db-upload-session-state-icon {
  background: var(--danger, #ed4245);
  color: #fff;
}

.ctrlem-db-upload-speed {
  color: var(--text-muted, #666);
  font-size: 0.65rem;
  white-space: nowrap;
}

.ctrlem-db-upload-session-file,
.ctrlem-db-upload-session-detail {
  min-width: 0;
  overflow-wrap: anywhere;
}

.ctrlem-db-upload-session-file {
  color: var(--text-primary, #fff);
  font-size: 0.8rem;
  font-weight: 700;
}

.ctrlem-db-upload-session-state {
  color: var(--text-muted, #666);
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}

.ctrlem-db-upload-session-row[data-status="uploaded"] .ctrlem-db-upload-session-state,
.ctrlem-db-upload-session-note {
  color: var(--success, #57f287);
}

.ctrlem-db-upload-session-note.is-duplicate {
  color: var(--text-muted, #666);
}

.ctrlem-db-upload-session-row[data-status="failed"] .ctrlem-db-upload-session-state,
.ctrlem-db-upload-session-error {
  color: var(--danger, #ed4245);
}

.ctrlem-db-upload-session-detail {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--text-muted, #666);
  font-size: 0.74rem;
}

.ctrlem-db-upload-session-detail a {
  max-width: 100%;
  color: var(--accent-primary, #5865f2);
}

.ctrlem-db-upload-session-status {
  min-height: 18px;
  color: var(--text-muted, #666);
  font-size: 0.76rem;
}

.ctrlem-db-upload-session-status[data-level="error"] {
  color: var(--danger, #ed4245);
}

.ctrlem-db-upload-session-status[data-level="success"] {
  color: var(--success, #57f287);
}

.ctrlem-db-upload-session-cancel {
  opacity: 0.78;
}

.ctrlem-db-manager-textarea {
  width: 100%;
  min-height: 280px;
  max-height: 520px;
  padding: 0.75rem 0.85rem;
  overflow: auto;
  resize: vertical;
  border: 1px solid var(--border-color, #333);
  border-radius: var(--border-radius, 8px);
  background: var(--bg-primary, #0d0d0d);
  color: var(--text-primary, #fff);
  font: 0.85rem/1.45 Consolas, 'Courier New', monospace;
  transition: var(--transition, all 0.2s ease);
  white-space: pre;
  word-wrap: normal;
}

.ctrlem-db-manager-textarea:focus {
  outline: none;
  border-color: var(--accent-primary, #5865f2);
}

.ctrlem-db-status {
  min-height: 18px;
  color: var(--text-muted, #666);
  font-size: 0.78rem;
  line-height: 1.35;
}

.ctrlem-db-empty {
  margin: 10px 0 0;
  color: var(--text-muted, #666);
  font-size: 0.8rem;
}

@media (max-width: 980px) {
  .ctrlem-db-manager-layout {
    grid-template-columns: 1fr;
  }

  .ctrlem-db-manager-actions,
  .ctrlem-db-topbar-controls {
    align-items: flex-start;
    flex-direction: column;
  }

  .ctrlem-db-status {
    width: 100%;
    text-align: left;
  }

  .ctrlem-db-command-upload-grid {
    grid-template-columns: 1fr;
  }

  .ctrlem-db-autosend-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .ctrlem-db-autosend-kind,
  .ctrlem-db-autosend-code,
  .ctrlem-db-autosend-category,
  .ctrlem-db-autosend-wait {
    grid-column: auto;
  }

  .ctrlem-db-autosend-profile {
    grid-column: 1 / 2;
  }

  .ctrlem-db-autosend-cooldown {
    grid-column: 1 / -1;
    width: 100%;
  }
  
  .ctrlem-db-upload-session-head,
  .ctrlem-db-upload-session-row {
    grid-template-columns: 1fr;
  }
  }
  
  /* ── Upload feedback animations ── */
  
  @keyframes ctrlem-db-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  
  @keyframes ctrlem-db-pulse-border {
    0%, 100% { border-color: var(--ctrlem-upload-border, var(--border-color, #333)); }
    50% { border-color: var(--ctrlem-upload-accent, var(--accent-primary, #5865f2)); }
  }
  
  @keyframes ctrlem-db-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  @keyframes ctrlem-db-row-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(88, 101, 242, 0); }
    50% { box-shadow: 0 0 0 4px rgba(88, 101, 242, 0.15); }
  }
  
  @keyframes ctrlem-db-indeterminate {
    0% { transform: translateX(-100%); }
    50% { transform: translateX(0%); }
    100% { transform: translateX(100%); }
  }
  
  @keyframes ctrlem-db-check-in {
    0% { transform: scale(0); opacity: 0; }
    60% { transform: scale(1.2); }
    100% { transform: scale(1); opacity: 1; }
  }
  
  @keyframes ctrlem-db-shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-4px); }
    40% { transform: translateX(4px); }
    60% { transform: translateX(-3px); }
    80% { transform: translateX(3px); }
  }
  
  /* ── Upload toast notifications ── */
  
  .ctrlem-db-toast-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 999999;
    display: grid;
    gap: 8px;
    pointer-events: none;
  }
  
  .ctrlem-db-toast {
    min-width: 200px;
    max-width: 340px;
    padding: 0.65rem 0.85rem;
    border: 1px solid var(--border-color, #333);
    border-radius: var(--border-radius, 8px);
    background: var(--bg-secondary, #1a1a1a);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    color: var(--text-primary, #fff);
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1.35;
    pointer-events: auto;
    animation: ctrlem-db-toast-in 0.25s ease-out;
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  
  .ctrlem-db-toast.is-leaving {
    opacity: 0;
    transform: translateX(20px);
  }
  
  .ctrlem-db-toast.is-success {
    border-color: var(--success, #57f287);
  }
  
  .ctrlem-db-toast.is-error {
    border-color: var(--danger, #ed4245);
  }
  
  .ctrlem-db-toast.is-warning {
    border-color: var(--accent-primary, #5865f2);
  }
  
  @keyframes ctrlem-db-toast-in {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  `;
	function addStyles() {
		const gmAddStyle = globalThis.GM_addStyle;
		if (typeof gmAddStyle === "function") {
			gmAddStyle(APP_CSS);
			return;
		}
		const style = createElement("style", { attrs: { "data-ctrlem-db": "styles" } });
		style.textContent = APP_CSS;
		document.head.appendChild(style);
	}
	function getUploadPanelId(commandKey) {
		return `${UI_IDS.uploadPrefix}-${commandKey}`;
	}
	var STATUS = Object.freeze({
		QUEUED: "Queued",
		UPLOADING: "Uploading",
		UPLOADED: "Uploaded",
		FAILED: "Failed"
	});
	var UPLOAD_DELAY_MS = USER_CONFIG.upload.delayMs;
	var CTRLEM_IMAGE_MAX_BYTES = USER_CONFIG.upload.ctrlemImageMaxBytes;
	var CTRLEM_SOUND_MAX_BYTES = USER_CONFIG.upload.ctrlemSoundMaxBytes;
	var CTRLEM_IMAGE_TYPES = new Set([
		"image/jpeg",
		"image/png",
		"image/gif",
		"image/webp"
	]);
	var CTRLEM_SOUND_TYPES = new Set([
		"audio/mpeg",
		"audio/wav",
		"audio/ogg",
		"audio/mp4",
		"audio/x-m4a",
		"audio/flac",
		"audio/webm",
		"audio/opus"
	]);
	function getToolLabel(tool) {
		if (tool === "ctrlem") return "CtrlEm";
		if (tool === "imgbb") return "ImgBB";
		if (tool === "catbox") return "Catbox";
		if (tool === "vidhosting") return "VidHosting";
		return tool;
	}
	function getMediaLabel(config) {
		if (config.type === RecordType.IMAGE) return "image";
		if (config.type === RecordType.SOUND) return "audio";
		if (config.type === RecordType.VIDEO) return "video";
		return "file";
	}
	function getAccept(config, tool) {
		if (tool === "imgbb") return "image/jpeg,image/png,image/gif,image/webp";
		if (tool === "vidhosting") return "video/*";
		if (tool === "catbox" && config.type === RecordType.SOUND) return "audio/*";
		if (tool === "catbox" && config.type === RecordType.VIDEO) return "video/*";
		return "";
	}
	function isAcceptedFile(config, tool, file) {
		if (tool === "imgbb") return file.type.startsWith("image/");
		if (tool === "vidhosting") return file.type.startsWith("video/");
		if (tool === "catbox" && config.type === RecordType.SOUND) return file.type.startsWith("audio/");
		if (tool === "catbox" && config.type === RecordType.VIDEO) return file.type.startsWith("video/");
		return true;
	}
	function getToolNote(config, tool) {
		if (tool === "ctrlem" && config.type === RecordType.IMAGE) return "Max 5MB - JPG, PNG, GIF, WebP";
		if (tool === "ctrlem" && config.type === RecordType.SOUND) return "Max 15MB - MP3, WAV, OGG, M4A";
		if (tool === "imgbb") return "Max 32MB - JPG, PNG, GIF, WebP - Requires key";
		if (tool === "catbox") return config.type === RecordType.SOUND ? "Audio files - Optional userhash in Settings" : "Video files - Optional userhash in Settings";
		if (tool === "vidhosting") return "Video files";
		return "";
	}
	function getUploadTargetText(config) {
		if (config.type === RecordType.IMAGE) return "Upload images and gifs - expand/collapse";
		if (config.type === RecordType.SOUND) return "Upload sounds - expand/collapse";
		if (config.type === RecordType.VIDEO) return "Upload videos - expand/collapse";
		return "Upload files - expand/collapse";
	}
	function delay(ms) {
		return new Promise((resolve) => window.setTimeout(resolve, ms));
	}
	function getCtrlEmValidationError(config, file) {
		if (config.type === RecordType.IMAGE) {
			if (file.size > CTRLEM_IMAGE_MAX_BYTES) return "Image must be under 5MB.";
			if (!CTRLEM_IMAGE_TYPES.has(file.type)) return "Only JPG, PNG, GIF, and WebP images are allowed.";
		}
		if (config.type === RecordType.SOUND) {
			if (file.size > CTRLEM_SOUND_MAX_BYTES) return "Audio must be under 15MB.";
			if (!CTRLEM_SOUND_TYPES.has(file.type)) return "Only MP3, WAV, OGG, M4A, FLAC audio allowed.";
		}
		return "";
	}
	async function uploadCtrlEmFile(config, file) {
		const validationError = getCtrlEmValidationError(config, file);
		if (validationError) throw new Error(validationError);
		const formData = new FormData();
		const isSound = config.type === RecordType.SOUND;
		formData.append(isSound ? "sound" : "image", file);
		const response = await fetch(isSound ? "/api/upload/sound" : "/api/upload/image", {
			method: "POST",
			body: formData,
			credentials: "same-origin"
		});
		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(error?.error || "Upload failed");
		}
		const data = await response.json();
		const url = String(data?.url || "");
		if (!url) throw new Error("CtrlEm upload did not return a URL.");
		return url.startsWith("http") ? url : `${window.location.origin}${url}`;
	}
	function createUploadIcon() {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", "24");
		svg.setAttribute("height", "24");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("fill", "none");
		svg.setAttribute("stroke", "currentColor");
		svg.setAttribute("stroke-width", "2");
		[
			["path", { d: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" }],
			["polyline", { points: "17 8 12 3 7 8" }],
			["line", {
				x1: "12",
				y1: "3",
				x2: "12",
				y2: "15"
			}]
		].forEach(([tagName, attrs]) => {
			const child = document.createElementNS("http://www.w3.org/2000/svg", tagName);
			Object.entries(attrs).forEach(([name, value]) => child.setAttribute(name, String(value)));
			svg.appendChild(child);
		});
		return svg;
	}
	function getCategorySelect(config, actions) {
		const categories = actions.getUploadCategories(config);
		const target = actions.getUploadTarget(config);
		const select = createElement("select", {
			className: "ctrlem-db-upload-session-select",
			attrs: { "aria-label": "Upload category" }
		});
		categories.forEach((category) => {
			const option = createElement("option", {
				value: category.id,
				text: category.name
			});
			option.selected = category.id === target.id;
			select.appendChild(option);
		});
		if (!select.value && categories[0]) select.value = categories[0].id;
		return select;
	}
	function createUploadSession(options) {
		const { config, source, files, actions } = options;
		const totalFiles = files.length;
		const items = files.map((file, index) => ({
			file,
			fileName: file?.name || `${getMediaLabel(config)} ${index + 1}`,
			status: STATUS.QUEUED,
			url: "",
			error: "",
			appended: false,
			duplicate: false,
			row: null,
			statusEl: null,
			detailEl: null,
			progressBarEl: null,
			progressFillEl: null,
			stateIconEl: null,
			speedEl: null
		}));
		const categorySelect = getCategorySelect(config, actions);
		const list = createElement("div", { className: "ctrlem-db-upload-session-list" });
		const progressEl = createElement("div", {
			className: "ctrlem-db-upload-session-progress",
			attrs: { "aria-live": "polite" }
		});
		const status = createElement("div", {
			className: "ctrlem-db-upload-session-status",
			attrs: { "aria-live": "polite" }
		});
		const addButton = createElement("button", {
			className: "btn btn-primary",
			text: "Add links",
			type: "button",
			attrs: { disabled: "" }
		});
		const cancelButton = createElement("button", {
			className: "btn btn-sm btn-secondary ctrlem-db-upload-session-cancel",
			text: "Cancel",
			type: "button"
		});
		const updateProgressCounter = () => {
			progressEl.textContent = `${items.filter((item) => item.status === STATUS.UPLOADED || item.status === STATUS.FAILED).length} of ${totalFiles} files processed`;
		};
		const modal = createElement("div", {
			className: "ctrlem-db-modal-backdrop ctrlem-db-upload-session-backdrop",
			attrs: {
				role: "dialog",
				"aria-modal": "true",
				"aria-label": `${config.label} upload status`
			}
		}, [createElement("div", { className: "ctrlem-db-modal ctrlem-db-upload-session" }, [
			createElement("div", { className: "ctrlem-db-upload-session-head" }, [createElement("div", {
				className: "ctrlem-db-modal-title",
				text: `${source} upload`
			}), createElement("label", { className: "ctrlem-db-upload-session-category" }, [createElement("span", { text: "Category" }), categorySelect])]),
			progressEl,
			list,
			status,
			createElement("div", { className: "ctrlem-db-modal-actions" }, [cancelButton, addButton])
		])]);
		const renderItem = (item) => {
			item.row.dataset.status = String(item.status).toLowerCase();
			item.row.classList.remove("is-uploading", "is-uploaded", "is-failed");
			if (item.status === STATUS.UPLOADING) item.row.classList.add("is-uploading");
			else if (item.status === STATUS.UPLOADED) item.row.classList.add("is-uploaded");
			else if (item.status === STATUS.FAILED) item.row.classList.add("is-failed");
			item.statusEl.replaceChildren();
			if (item.status === STATUS.UPLOADED) {
				item.stateIconEl = createElement("span", {
					className: "ctrlem-db-upload-session-state-icon",
					text: "✓"
				});
				item.statusEl.appendChild(item.stateIconEl);
				item.statusEl.appendChild(document.createTextNode(" Uploaded"));
			} else if (item.status === STATUS.FAILED) {
				item.stateIconEl = createElement("span", {
					className: "ctrlem-db-upload-session-state-icon",
					text: "✕"
				});
				item.statusEl.appendChild(item.stateIconEl);
				item.statusEl.appendChild(document.createTextNode(" Failed"));
			} else if (item.status === STATUS.UPLOADING) item.statusEl.textContent = "Uploading...";
			else item.statusEl.textContent = item.status;
			item.detailEl.replaceChildren();
			if (item.url) item.detailEl.appendChild(createElement("a", {
				text: item.url,
				attrs: {
					href: item.url,
					target: "_blank",
					rel: "noopener noreferrer"
				}
			}));
			if (item.error) item.detailEl.appendChild(createElement("span", {
				className: "ctrlem-db-upload-session-error",
				text: item.error
			}));
			if (item.duplicate) item.detailEl.appendChild(createElement("span", {
				className: "ctrlem-db-upload-session-note is-duplicate",
				text: "already exists"
			}));
			if (item.appended) item.detailEl.appendChild(createElement("span", {
				className: "ctrlem-db-upload-session-note",
				text: "added"
			}));
			if (item.speedEl && item.speedEl.textContent) item.detailEl.appendChild(item.speedEl);
			updateProgressCounter();
		};
		const updateActions = () => {
			addButton.disabled = !items.some((item) => item.status === STATUS.UPLOADED && item.url);
		};
		items.forEach((item) => {
			const progressFill = createElement("span", { className: "ctrlem-db-upload-progress-fill" });
			const progressBar = createElement("div", { className: "ctrlem-db-upload-progress-bar" }, [progressFill]);
			item.progressBarEl = progressBar;
			item.progressFillEl = progressFill;
			const stateCol = createElement("div", { className: "ctrlem-db-upload-session-state" });
			item.speedEl = createElement("span", { className: "ctrlem-db-upload-speed" });
			item.row = createElement("div", { className: "ctrlem-db-upload-session-row" }, [
				createElement("div", {
					className: "ctrlem-db-upload-session-file",
					text: item.fileName
				}),
				progressBar,
				stateCol
			]);
			item.statusEl = stateCol;
			item.detailEl = createElement("div", { className: "ctrlem-db-upload-session-detail" });
			item.row.appendChild(item.detailEl);
			list.appendChild(item.row);
			renderItem(item);
		});
		const close = () => modal.remove();
		const setItemStatus = (item, nextStatus, patch = {}) => {
			Object.assign(item, patch, { status: nextStatus });
			renderItem(item);
			updateActions();
		};
		const setItemProgress = (item, progress = {}) => {
			if (progress.statusText !== void 0 && item.statusEl) item.statusEl.textContent = progress.statusText;
			if (progress.speed !== void 0 && item.speedEl) item.speedEl.textContent = progress.speed;
		};
		const addLinks = async () => {
			const uploadedItems = items.filter((item) => item.status === STATUS.UPLOADED && item.url);
			if (uploadedItems.length === 0) return;
			addButton.disabled = true;
			cancelButton.disabled = true;
			status.textContent = "Adding links...";
			status.dataset.level = "info";
			let appended = 0;
			for (const item of uploadedItems) {
				const result = await actions.appendUploadedUrl({
					config,
					url: item.url,
					fileName: item.fileName,
					targetCategoryId: categorySelect.value,
					source
				});
				item.appended = Boolean(result.appended);
				item.duplicate = !result.appended;
				if (result.appended) appended += 1;
				renderItem(item);
			}
			status.textContent = appended > 0 ? `Added ${appended} link${appended === 1 ? "" : "s"}.` : "No new links added.";
			status.dataset.level = appended > 0 ? "success" : "info";
			cancelButton.disabled = false;
			if (appended > 0) window.setTimeout(close, USER_CONFIG.ui.uploadSessionCloseDelayMs);
			else updateActions();
		};
		addButton.addEventListener("click", () => {
			addLinks().catch((error) => {
				status.textContent = error?.message || String(error);
				status.dataset.level = "error";
				cancelButton.disabled = false;
				updateActions();
			});
		});
		cancelButton.addEventListener("click", close);
		modal.addEventListener("click", (event) => {
			if (event.target === modal) close();
		});
		document.body.appendChild(modal);
		return {
			items,
			modal,
			setItemStatus,
			setItemProgress,
			setStatus(message, level = "info") {
				status.textContent = message;
				status.dataset.level = level;
			}
		};
	}
	function decorateNativeDropzone(dropzone) {
		dropzone.classList.remove("ctrlem-db-hidden-site-ui");
		dropzone.classList.add("ctrlem-db-upload-dropzone");
		dropzone.dataset.tool = "ctrlem";
		dropzone.querySelector("input[type=\"file\"]")?.setAttribute("multiple", "");
		const main = Array.from(dropzone.querySelectorAll("span")).find((span) => !span.classList.contains("upload-hint"));
		if (main && !main.querySelector(".ctrlem-db-upload-tool-label")) main.prepend(createElement("span", {
			className: "ctrlem-db-upload-tool-label",
			text: `[${getToolLabel("ctrlem")}] Upload `
		}));
	}
	function createNativeTool(config, input, dropzone, actions) {
		decorateNativeDropzone(dropzone);
		const fileInput = dropzone.querySelector("input[type=\"file\"]");
		let isBusy = false;
		const uploadFiles = async (files) => {
			if (isBusy || files.length === 0) return;
			const session = createUploadSession({
				config,
				source: getToolLabel("ctrlem"),
				files,
				actions
			});
			isBusy = true;
			dropzone.classList.add("is-busy");
			session.setStatus("Uploading files...");
			for (let index = 0; index < session.items.length; index += 1) {
				const item = session.items[index];
				if (index > 0) {
					session.setStatus(`Waiting ${UPLOAD_DELAY_MS / 1e3}s before next upload...`);
					await delay(UPLOAD_DELAY_MS);
				}
				session.setItemStatus(item, STATUS.UPLOADING);
				const startTime = Date.now();
				const fileSizeMB = item.file.size / (1024 * 1024);
				let speedInterval = null;
				if (item.file.size > 1024 * 1024) speedInterval = window.setInterval(() => {
					const elapsed = (Date.now() - startTime) / 1e3;
					if (elapsed < 1) return;
					const speed = fileSizeMB / elapsed;
					session.setItemProgress(item, {
						statusText: `Uploading... (${elapsed.toFixed(0)}s)`,
						speed: speed > .1 ? `${speed.toFixed(1)} MB/s` : ""
					});
				}, 500);
				try {
					const url = await uploadCtrlEmFile(config, item.file);
					if (speedInterval) window.clearInterval(speedInterval);
					input.value = url;
					session.setItemStatus(item, STATUS.UPLOADED, { url });
				} catch (error) {
					if (speedInterval) window.clearInterval(speedInterval);
					session.setItemStatus(item, STATUS.FAILED, { error: error?.message || String(error) });
				}
			}
			isBusy = false;
			dropzone.classList.remove("is-busy");
			if (fileInput) fileInput.value = "";
			const successful = session.items.filter((item) => item.status === STATUS.UPLOADED).length;
			const failed = session.items.filter((item) => item.status === STATUS.FAILED).length;
			if (successful > 0 && failed === 0) {
				dropzone.classList.add("flash-success");
				window.setTimeout(() => dropzone.classList.remove("flash-success"), 1200);
			} else if (failed > 0 && successful === 0) {
				dropzone.classList.add("flash-error");
				window.setTimeout(() => dropzone.classList.remove("flash-error"), 1200);
			}
			session.setStatus(successful > 0 ? "Upload finished. Review links, choose a category, then add them." : "No files uploaded.", successful > 0 ? "success" : "error");
			showUploadToast(successful, failed);
		};
		dropzone.addEventListener("drop", (event) => {
			event.preventDefault();
			event.stopImmediatePropagation();
			dropzone.classList.remove("drag-active");
			uploadFiles(Array.from(event.dataTransfer?.files || []));
		}, true);
		fileInput?.addEventListener("change", (event) => {
			event.stopImmediatePropagation();
			uploadFiles(Array.from(fileInput.files || []));
		}, true);
		return [dropzone];
	}
	function createImgBBDisabledTool(actions) {
		const openPrompt = () => actions.openImgBBKeyPrompt();
		const dropzone = createElement("div", {
			className: "upload-dropzone ctrlem-db-upload-dropzone is-disabled",
			attrs: {
				role: "button",
				tabindex: "0",
				"aria-label": "Set ImgBB API key before uploading"
			},
			dataset: { tool: "imgbb" }
		}, [
			createUploadIcon(),
			createElement("span", { className: "ctrlem-db-upload-dropzone-main" }, [createElement("span", {
				className: "ctrlem-db-upload-tool-label",
				text: "[ImgBB] "
			}), createElement("span", { text: "Set API key before uploading" })]),
			createElement("span", {
				className: "upload-hint",
				text: "Click to open ImgBB key settings"
			})
		]);
		dropzone.addEventListener("click", openPrompt);
		dropzone.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			openPrompt();
		});
		dropzone.addEventListener("dragover", (event) => event.preventDefault());
		dropzone.addEventListener("drop", (event) => {
			event.preventDefault();
			openPrompt();
		});
		return [dropzone];
	}
	function createExternalTool(config, tool, input, actions) {
		if (tool === "imgbb" && !String(actions.getUploaderSettings().imgbbApiKey || "").trim()) return createImgBBDisabledTool(actions);
		const label = getToolLabel(tool);
		const fileInputId = `file-${config.key}-${tool}`;
		const fileInput = createElement("input", {
			className: "ctrlem-db-command-upload-file",
			type: "file",
			attrs: {
				accept: getAccept(config, tool),
				multiple: "",
				id: fileInputId,
				style: "display:none"
			}
		});
		const browseLabel = createElement("label", {
			className: "upload-browse-label",
			text: "browse",
			attrs: { for: fileInputId }
		});
		browseLabel.addEventListener("click", (event) => event.stopPropagation());
		const dropzone = createElement("div", {
			className: "upload-dropzone ctrlem-db-upload-dropzone",
			attrs: {
				role: "button",
				tabindex: "0"
			},
			dataset: {
				uploadFor: config.key,
				tool
			}
		}, [
			createUploadIcon(),
			createElement("span", { className: "ctrlem-db-upload-dropzone-main" }, [
				createElement("span", {
					className: "ctrlem-db-upload-tool-label",
					text: `[${label}] Upload `
				}),
				createElement("span", { text: `Drag & drop ${getMediaLabel(config)} or ` }),
				browseLabel
			]),
			createElement("span", {
				className: "upload-hint",
				text: getToolNote(config, tool)
			}),
			fileInput,
			createElement("div", {
				className: "upload-spinner",
				attrs: { style: "display:none" },
				text: "Uploading..."
			})
		]);
		let isBusy = false;
		const setBusy = (busy) => {
			isBusy = busy;
			fileInput.disabled = busy;
			dropzone.classList.toggle("is-busy", busy);
			dropzone.setAttribute("aria-disabled", String(busy));
		};
		const uploadFiles = async (files) => {
			if (isBusy || files.length === 0) return;
			const session = createUploadSession({
				config,
				source: label,
				files,
				actions
			});
			setBusy(true);
			session.setStatus("Uploading files...");
			for (const item of session.items) {
				if (!isAcceptedFile(config, tool, item.file)) {
					session.setItemStatus(item, STATUS.FAILED, { error: `${item.fileName}: not accepted by ${label}.` });
					continue;
				}
				session.setItemStatus(item, STATUS.UPLOADING);
				const startTime = Date.now();
				const fileSizeMB = item.file.size / (1024 * 1024);
				let speedInterval = null;
				if (item.file.size > 1024 * 1024) speedInterval = window.setInterval(() => {
					const elapsed = (Date.now() - startTime) / 1e3;
					if (elapsed < 1) return;
					const speed = fileSizeMB / elapsed;
					session.setItemProgress(item, {
						statusText: `Uploading... (${elapsed.toFixed(0)}s)`,
						speed: speed > .1 ? `${speed.toFixed(1)} MB/s` : ""
					});
				}, 500);
				try {
					const url = await actions.uploadContentFile({
						config,
						tool,
						file: item.file
					});
					if (speedInterval) window.clearInterval(speedInterval);
					session.setItemStatus(item, STATUS.UPLOADED, { url });
					input.value = url;
					input.dispatchEvent(new Event("input", { bubbles: true }));
					input.dispatchEvent(new Event("change", { bubbles: true }));
				} catch (error) {
					if (speedInterval) window.clearInterval(speedInterval);
					session.setItemStatus(item, STATUS.FAILED, { error: error?.message || String(error) });
				}
			}
			setBusy(false);
			fileInput.value = "";
			const successful = session.items.filter((item) => item.status === STATUS.UPLOADED).length;
			const failed = session.items.filter((item) => item.status === STATUS.FAILED).length;
			if (successful > 0 && failed === 0) {
				dropzone.classList.add("flash-success");
				window.setTimeout(() => dropzone.classList.remove("flash-success"), 1200);
			} else if (failed > 0 && successful === 0) {
				dropzone.classList.add("flash-error");
				window.setTimeout(() => dropzone.classList.remove("flash-error"), 1200);
			}
			session.setStatus(successful > 0 ? "Upload finished. Review links, choose a category, then add them." : "No files uploaded.", successful > 0 ? "success" : "error");
			showUploadToast(successful, failed);
		};
		dropzone.addEventListener("click", () => {
			if (!isBusy) fileInput.click();
		});
		dropzone.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			if (!isBusy) fileInput.click();
		});
		dropzone.addEventListener("dragover", (event) => {
			event.preventDefault();
			if (!isBusy) dropzone.classList.add("drag-active");
		});
		dropzone.addEventListener("dragenter", (event) => {
			event.preventDefault();
			if (!isBusy) dropzone.classList.add("drag-active");
		});
		dropzone.addEventListener("dragleave", () => {
			dropzone.classList.remove("drag-active");
		});
		dropzone.addEventListener("drop", (event) => {
			event.preventDefault();
			dropzone.classList.remove("drag-active");
			uploadFiles(Array.from(event.dataTransfer?.files || []));
		});
		fileInput.addEventListener("change", () => {
			uploadFiles(Array.from(fileInput.files || []));
		});
		return [dropzone];
	}
	function showUploadToast(successful, failed) {
		if (successful === 0 && failed === 0) return;
		let container = document.querySelector(".ctrlem-db-toast-container");
		if (!container) {
			container = createElement("div", { className: "ctrlem-db-toast-container" });
			document.body.appendChild(container);
		}
		let text;
		let level;
		if (failed === 0) {
			text = `✓ All ${successful} file${successful === 1 ? "" : "s"} uploaded successfully`;
			level = "is-success";
		} else if (successful === 0) {
			text = `✕ All ${failed} file${failed === 1 ? "" : "s"} failed to upload`;
			level = "is-error";
		} else {
			text = `⚠ ${successful} uploaded, ${failed} failed`;
			level = "is-warning";
		}
		const toast = createElement("div", {
			className: `ctrlem-db-toast ${level}`,
			text
		});
		container.appendChild(toast);
		window.setTimeout(() => {
			toast.classList.add("is-leaving");
			window.setTimeout(() => toast.remove(), 250);
		}, 3500);
	}
	function createUploadPanel(options) {
		const { config, input, nativeDropzone, uiState = {}, onUiStateChange, actions } = options;
		const grid = createElement("div", { className: "ctrlem-db-command-upload-grid" });
		const cardChildren = [];
		const isCollapsed = uiState.collapsed !== false;
		const tools = config.tools || [];
		const hideCtrlEmUploader = actions.getUploaderSettings?.().hideCtrlEmUploader === true;
		if (nativeDropzone && (!tools.includes("ctrlem") || hideCtrlEmUploader)) nativeDropzone.classList.add("ctrlem-db-hidden-site-ui");
		tools.forEach((tool) => {
			if (tool === "ctrlem") {
				if (nativeDropzone && !hideCtrlEmUploader) cardChildren.push(...createNativeTool(config, input, nativeDropzone, actions));
				return;
			}
			cardChildren.push(...createExternalTool(config, tool, input, actions));
		});
		grid.appendChild(createElement("div", { className: "ctrlem-db-upload-card ctrlem-db-upload-native-card" }, cardChildren));
		const bodyId = `${getUploadPanelId(config.key)}-body`;
		grid.id = bodyId;
		grid.hidden = isCollapsed;
		const panel = createElement("div", {
			id: getUploadPanelId(config.key),
			className: `ctrlem-db-command-upload${isCollapsed ? " is-collapsed" : ""}`,
			attrs: { "aria-label": `${config.label} upload tools` },
			dataset: {
				command: config.key,
				type: config.type
			}
		}, [
			createElement("button", {
				className: "ctrlem-db-command-upload-head",
				type: "button",
				attrs: {
					"aria-expanded": String(!isCollapsed),
					"aria-controls": bodyId
				}
			}, [
				createElement("span", {
					className: "ctrlem-db-command-upload-title",
					text: "Upload"
				}),
				createElement("span", {
					className: "ctrlem-db-command-upload-target",
					text: getUploadTargetText(config)
				}),
				createElement("span", {
					className: "ctrlem-db-command-upload-chevron",
					text: "v"
				})
			]),
			createElement("div", {
				className: "ctrlem-db-command-upload-recommendation",
				text: "Recommended: use ImgBB/Catbox first for faster uploads and longer-lived links."
			}),
			grid
		]);
		const button = panel.querySelector(".ctrlem-db-command-upload-head");
		button.addEventListener("click", () => {
			const nextCollapsed = !grid.hidden;
			grid.hidden = nextCollapsed;
			panel.classList.toggle("is-collapsed", nextCollapsed);
			button.setAttribute("aria-expanded", String(!nextCollapsed));
			onUiStateChange?.({ collapsed: nextCollapsed });
		});
		return panel;
	}
	var LINK_CHECK_MEDIA_TYPES = [
		RecordType.IMAGE,
		RecordType.SOUND,
		RecordType.VIDEO
	];
	function createDbManagerBrandLink() {
		const tooltipText = "Test on me, and I will always be glad to have your attention. Thank you for using it. Have a great mood!";
		const link = createElement("a", {
			className: "ctrlem-db-brand-link",
			attrs: {
				href: "https://ctrlem.com/u/KPD0M",
				target: "_blank",
				rel: "noopener noreferrer",
				"data-tooltip": tooltipText
			}
		}, [
			createElement("span", {
				className: "ctrlem-db-brand-strateg",
				text: "Strateg"
			}),
			createElement("span", { text: " " }),
			createElement("span", {
				className: "ctrlem-db-brand-tag",
				text: ""
			})
		]);
		let tooltip = null;
		const hideTooltip = () => {
			tooltip?.remove();
			tooltip = null;
		};
		const showTooltip = () => {
			hideTooltip();
			tooltip = createElement("div", {
				className: "ctrlem-db-brand-tooltip",
				text: tooltipText
			});
			document.body.appendChild(tooltip);
			const linkRect = link.getBoundingClientRect();
			const tooltipRect = tooltip.getBoundingClientRect();
			const top = Math.max(8, linkRect.top - tooltipRect.height - 8);
			const left = Math.min(window.innerWidth - tooltipRect.width - 8, Math.max(8, linkRect.left + linkRect.width / 2 - tooltipRect.width / 2));
			tooltip.style.top = `${top}px`;
			tooltip.style.left = `${left}px`;
		};
		link.addEventListener("mouseenter", showTooltip);
		link.addEventListener("mouseleave", hideTooltip);
		link.addEventListener("focus", showTooltip);
		link.addEventListener("blur", hideTooltip);
		link.addEventListener("click", hideTooltip);
		return createElement("span", { className: "ctrlem-db-brand" }, [createElement("span", { text: "DB Userscript by " }), link]);
	}
	var CtrlEmDbApp = class {
		dbState = createSeedState();
		uiState = createUiState();
		saveTimer = 0;
		uiSaveTimer = 0;
		uploaderSettingsSaveTimer = 0;
		mediaRenderToken = 0;
		sendOrDeleteDownloadArms = [];
		pendingMediaMounts = new Set();
		linkCheckState = {
			categoryId: "",
			scopeAll: true,
			scopeType: RecordType.IMAGE,
			scopeCategoryId: "",
			isBusy: false,
			checked: 0,
			total: 0,
			brokenCount: 0,
			currentType: "",
			currentCategoryName: "",
			currentUrl: "",
			broken: [],
			statusMessage: "",
			statusLevel: "info"
		};
		uploaderSettings = {
			imgbbApiKey: "",
			catboxUserhash: "",
			hideCtrlEmUploader: false,
			autoDownloadSendOrDeleteImages: true
		};
		managerSelection = {
			isOpen: false,
			selectedCategoryByType: {},
			originalTitle: "",
			originalDescription: "",
			editorCommandKey: ""
		};
		site = new CtrlEmSite(log);
		imageCache = new ImageCache(log);
		autoSend = new AutoSendController({
			getState: () => this.dbState,
			selectTextItem: (input, list, button, options) => this.selectTextItem(input, list, button, options),
			selectMediaItem: (input, picker, button, options) => this.selectMediaItem(input, picker, button, options),
			getPickerUiState: (commandKey) => this.getCommandPickerUiState(commandKey),
			captureFocusState: () => this.captureFocusState(),
			restoreFocusState: (state) => this.restoreFocusState(state),
			setAutoSendInterval: (seconds) => this.setAutoSendInterval(seconds, { status: false }),
			setMinimumRequestInterval: (seconds) => this.setMinimumRequestInterval(seconds, { status: false }),
			notifySite: (message, level = "info") => this.site.notify(message, level),
			log
		});
		managerActions = {
			save: () => this.saveDbState("manual save"),
			setAutoSave: (enabled) => this.setAutoSave(enabled),
			setAutoSendInterval: (seconds) => this.setAutoSendInterval(seconds),
			setMinimumRequestInterval: (seconds) => this.setMinimumRequestInterval(seconds),
			updateEditorContent: (content) => this.updateEditorContent(content),
			importCategories: (files) => this.importCategoriesFromFiles(files),
			importAllCategories: (file) => this.importAllCategoriesFromFile(file),
			renameCategory: () => this.renameSelectedCategory(),
			deleteCategory: () => this.deleteSelectedCategory(),
			exportCategory: () => this.exportSelectedCategory(),
			exportAll: () => this.exportAllCategories(),
			restoreDefaults: () => this.restoreDefaultCategories(),
			addCategory: () => this.addCategory(),
			selectCategory: (categoryId) => this.selectManagerCategory(categoryId),
			reorderCategory: (sourceId, targetId) => this.reorderCategory(sourceId, targetId),
			renameCategoryTo: (name) => this.renameSelectedCategoryTo(name),
			setActiveType: (type) => this.setActiveType(type),
			setActiveTab: (tab) => this.setActiveTab(tab),
			setCategoryListScroll: (scrollTop) => this.setCategoryListScroll(scrollTop),
			setUploaderSetting: (name, value) => this.setUploaderSetting(name, value),
			getUploaderSettings: () => this.uploaderSettings,
			getUploadTarget: (config) => this.getUploadTarget(config),
			getUploadCategories: (config) => this.getUploadCategories(config),
			uploadContentFile: (request) => this.uploadContentFile(request),
			uploadCommandFile: (request) => this.uploadCommandFile(request),
			appendUploadedUrl: (request) => this.appendUploadedUrl(request),
			openImgBBKeyPrompt: () => this.openImgBBKeyPrompt(),
			setLinkCheckScope: (patch) => this.setLinkCheckScope(patch),
			checkBrokenLinks: () => this.checkBrokenLinks(),
			removeBrokenLinks: () => this.removeBrokenLinks()
		};
		async start() {
			await this.loadDbState();
			log("info", "Script started", {
				href: window.location.href,
				summary: getDatabaseSummary(this.dbState)
			});
			addStyles();
			this.mountUi("initial");
			this.startObserver();
		}
		async loadDbState() {
			const [stored, storedUi, storedUploaderSettings] = await Promise.all([
				readStoredState(),
				readStoredUiState(),
				readStoredUploaderSettings()
			]);
			this.dbState = normalizeDbState(stored || createSeedState());
			this.uiState = normalizeUiState(storedUi || createUiState());
			this.restoreUploaderSettings(storedUploaderSettings);
			resetManagerSelections(this.dbState, this.managerSelection);
			this.restoreManagerSelectionsFromUiState();
			log("info", "DB state loaded", getDatabaseSummary(this.dbState));
		}
		restoreUploaderSettings(settings) {
			const source = settings && typeof settings === "object" ? settings : {};
			Object.assign(this.uploaderSettings, {
				imgbbApiKey: String(source.imgbbApiKey || ""),
				catboxUserhash: String(source.catboxUserhash || ""),
				hideCtrlEmUploader: source.hideCtrlEmUploader === true,
				autoDownloadSendOrDeleteImages: source.autoDownloadSendOrDeleteImages !== false
			});
		}
		getSelectedCategory(type) {
			return getSelectedCategory(this.dbState, this.managerSelection, type);
		}
		restoreManagerSelectionsFromUiState() {
			TYPE_ORDER.forEach((type) => {
				const storedId = this.uiState.manager.selectedCategoryByType[type];
				if (storedId) this.managerSelection.selectedCategoryByType[type] = storedId;
				const selected = this.getSelectedCategory(type);
				this.uiState.manager.selectedCategoryByType[type] = selected?.id || "";
			});
		}
		scheduleUiStateSave(reason = "ui changed") {
			window.clearTimeout(this.uiSaveTimer);
			this.uiSaveTimer = window.setTimeout(() => {
				writeStoredUiState(clonePlain(this.uiState)).catch((error) => {
					log("warn", "Failed to save UI state", {
						reason,
						message: error?.message || String(error)
					});
				});
			}, USER_CONFIG.ui.saveDelayMs);
		}
		scheduleUploaderSettingsSave(reason = "uploader settings changed") {
			window.clearTimeout(this.uploaderSettingsSaveTimer);
			this.uploaderSettingsSaveTimer = window.setTimeout(() => {
				writeStoredUploaderSettings(clonePlain(this.uploaderSettings)).catch((error) => {
					log("warn", "Failed to save uploader settings", {
						reason,
						message: error?.message || String(error)
					});
				});
			}, USER_CONFIG.ui.saveDelayMs);
		}
		setManagerSelectedCategory(type, categoryId) {
			this.managerSelection.selectedCategoryByType[type] = categoryId;
			this.uiState.manager.selectedCategoryByType[type] = categoryId;
			this.scheduleUiStateSave("manager category selected");
		}
		getCommandPickerUiState(commandKey) {
			return getPickerUiState(this.uiState, commandKey);
		}
		updateCommandPickerUiState(commandKey, patch) {
			if (!commandKey) return;
			Object.assign(this.getCommandPickerUiState(commandKey), patch);
			this.scheduleUiStateSave("picker state changed");
		}
		getCommandUploadUiState(commandKey) {
			return getUploadUiState(this.uiState, commandKey);
		}
		updateCommandUploadUiState(commandKey, patch) {
			if (!commandKey) return;
			Object.assign(this.getCommandUploadUiState(commandKey), patch);
			this.scheduleUiStateSave("upload panel state changed");
		}
		captureFocusState() {
			const element = document.activeElement;
			if (!element || element === document.body || element === document.documentElement) return null;
			return {
				element,
				selectionStart: typeof element.selectionStart === "number" ? element.selectionStart : null,
				selectionEnd: typeof element.selectionEnd === "number" ? element.selectionEnd : null,
				selectionDirection: typeof element.selectionDirection === "string" ? element.selectionDirection : void 0
			};
		}
		restoreFocusState(state) {
			const element = state?.element;
			if (!element?.isConnected) return;
			try {
				if (document.activeElement !== element) element.focus({ preventScroll: true });
				if (state.selectionStart !== null && typeof element.setSelectionRange === "function") element.setSelectionRange(state.selectionStart, state.selectionEnd, state.selectionDirection);
			} catch {}
		}
		getProfileTitle() {
			const heading = document.querySelector(".profile-details h1");
			if (!heading) return "";
			const clone = heading.cloneNode(true);
			clone.querySelectorAll(".verified-badge, [title=\"Verified\"]").forEach((element) => element.remove());
			return String(clone.textContent || "").replace(/\s+/g, " ").trim();
		}
		getManagerViewModel() {
			const selectedCategory = this.getSelectedCategory(this.dbState.activeType);
			this.normalizeLinkCheckScope();
			return {
				activeType: this.dbState.activeType,
				autoSave: this.dbState.autoSave,
				autoSendIntervalSeconds: this.dbState.autoSendIntervalSeconds,
				minimumRequestIntervalSeconds: this.dbState.minimumRequestIntervalSeconds,
				categories: getUserCategories(this.dbState, this.dbState.activeType),
				selectedCategory,
				profileTitle: this.getProfileTitle(),
				uploaderSettings: this.uploaderSettings,
				uiState: this.uiState.manager,
				linkCheck: this.linkCheckState,
				linkCheckCategories: LINK_CHECK_MEDIA_TYPES.reduce((result, type) => {
					result[type] = getUserCategories(this.dbState, type).map((category) => ({
						id: category.id,
						name: category.name
					}));
					return result;
				}, {})
			};
		}
		flushEditorToState() {
			const textarea = document.getElementById(UI_IDS.dbManagerTextarea);
			if (!textarea || !this.managerSelection.isOpen) return;
			const category = this.getSelectedCategory(this.dbState.activeType);
			if (category) category.content = textarea.value;
		}
		syncEditorTextarea() {
			if (!this.managerSelection.isOpen) return;
			const textarea = document.getElementById(UI_IDS.dbManagerTextarea);
			const category = this.getSelectedCategory(this.dbState.activeType);
			if (textarea && category && textarea.value !== category.content) textarea.value = category.content;
		}
		async saveDbState(reason = "manual", options = {}) {
			const { flushEditor = true, refreshConsumers = true, syncTextarea = true } = options;
			try {
				if (flushEditor) this.flushEditorToState();
				this.dbState.autoSendIntervalSeconds = clampAutoSendInterval(this.dbState.autoSendIntervalSeconds);
				this.dbState.minimumRequestIntervalSeconds = clampMinimumRequestInterval(this.dbState.minimumRequestIntervalSeconds);
				normalizeAllCategoryContent(this.dbState);
				if (syncTextarea) this.syncEditorTextarea();
				await writeStoredState(clonePlain(this.dbState));
				log("info", "DB state saved", {
					reason,
					summary: getDatabaseSummary(this.dbState)
				});
				setManagerStatus(`Saved: ${reason}`, "success");
				this.renderCategoryList();
				if (refreshConsumers) this.refreshDbConsumers(reason);
				return true;
			} catch (error) {
				log("error", "Failed to save DB state", {
					reason,
					message: error?.message || String(error)
				});
				setManagerStatus("Save failed. Check console logs.", "error");
				return false;
			}
		}
		scheduleDataCommit(reason) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = window.setTimeout(async () => {
				this.flushEditorToState();
				if (this.dbState?.autoSave) {
					await this.saveDbState(reason, { syncTextarea: false });
					return;
				}
				this.renderCategoryList();
				this.refreshDbConsumers(reason);
			}, AUTOSAVE_DELAY);
		}
		refreshDbConsumers(reason = "refresh") {
			this.mediaRenderToken += 1;
			Object.values(TEXT_COMMANDS).forEach((config) => {
				document.getElementById(getTextPickerId(config.key))?.remove();
			});
			this.mountTextPickers();
			Object.values(MEDIA_COMMANDS).forEach((config) => {
				this.refreshMediaPicker(config);
			});
			this.mountUploadPanels();
			log("debug", "DB consumers refreshed", { reason });
		}
		async captureInputValue(config) {
			const input = document.querySelector(config.inputSelector);
			const value = String(input?.value || "").trim();
			if (!input || !isCaptureValueValid(config, value)) return false;
			if (input.dataset.ctrlemDbSelectedSource === "default" && input.dataset.ctrlemDbSelectedValue === value) return false;
			if (hasStoredValue(this.dbState, config.type, value)) return false;
			const category = appendInputValue(this.dbState, this.managerSelection, config.type, value);
			this.uiState.manager.selectedCategoryByType[config.type] = this.managerSelection.selectedCategoryByType[config.type] || category.id;
			this.scheduleUiStateSave("input category captured");
			if (this.managerSelection.isOpen && this.dbState.activeType === config.type && this.managerSelection.selectedCategoryByType[config.type] === category.id) {
				const textarea = document.getElementById(UI_IDS.dbManagerTextarea);
				if (textarea) textarea.value = category.content;
			}
			await this.saveDbState(`input captured: ${config.key}`);
			log("info", "Input captured", {
				command: config.key,
				type: config.type
			});
			return true;
		}
		mountDatabaseButton() {
			if (document.getElementById(UI_IDS.dbButton)) return false;
			const head = document.querySelector(CONFIG.selectors.commandsHead);
			if (!head) {
				log("debug", "Commands panel header was not found yet");
				return false;
			}
			let textBlock = head.querySelector(":scope > .ctrlem-db-head-copy");
			if (!textBlock) {
				const title = head.querySelector(":scope > h2");
				const description = head.querySelector(":scope > p");
				textBlock = createElement("div", { className: "ctrlem-db-head-copy" });
				if (title) textBlock.appendChild(title);
				if (description) textBlock.appendChild(description);
				head.prepend(textBlock);
			}
			const button = createElement("button", {
				id: UI_IDS.dbButton,
				className: "ctrlem-db-button",
				text: "DB",
				title: "Open DB manager",
				type: "button",
				attrs: {
					"aria-label": "Open DB manager",
					"aria-pressed": "false"
				}
			});
			button.addEventListener("click", () => this.toggleDbManager());
			head.classList.add("ctrlem-db-head");
			head.appendChild(button);
			log("info", "DB button mounted", { selector: CONFIG.selectors.commandsHead });
			return true;
		}
		setDbButtonActive(isActive) {
			const button = document.getElementById(UI_IDS.dbButton);
			if (!button) return;
			button.classList.toggle("is-active", isActive);
			button.setAttribute("aria-pressed", String(isActive));
		}
		markInputSelection(input, options) {
			input.dataset.ctrlemDbSelectedValue = options.value || "";
			input.dataset.ctrlemDbSelectedType = options.type || "";
			input.dataset.ctrlemDbSelectedSource = options.source || "saved";
		}
		selectTextItem(input, list, button, options = {}) {
			const value = button.dataset.value || "";
			const rows = list.querySelector(".ctrlem-db-rows");
			this.markInputSelection(input, {
				value,
				type: button.dataset.type,
				source: "saved"
			});
			input.value = value;
			input.dispatchEvent(new Event("input", { bubbles: true }));
			input.dispatchEvent(new Event("change", { bubbles: true }));
			if (options.focus !== false) this.focusWithoutScroll(input);
			else this.restoreFocusState(options.focusState);
			list.querySelectorAll(".ctrlem-db-row.is-selected").forEach((row) => {
				row.classList.remove("is-selected");
			});
			button.classList.add("is-selected");
			this.updateCommandPickerUiState(button.dataset.command || "", {
				categoryId: button.dataset.categoryId || list.dataset.categoryId || "",
				categoryName: button.dataset.category || list.dataset.category || "",
				value,
				itemIndex: Number(button.dataset.index || -1),
				scrollTop: rows?.scrollTop || 0
			});
			log("info", "Text item selected", {
				command: button.dataset.command,
				type: button.dataset.type,
				category: button.dataset.category,
				length: value.length
			});
		}
		getCommandPickerElement(commandKey) {
			return document.getElementById(getMediaPickerId(commandKey)) || document.getElementById(getTextPickerId(commandKey));
		}
		focusWithoutScroll(element) {
			try {
				element.focus({ preventScroll: true });
			} catch {
				element.focus();
			}
		}
		ensurePasteUrlSeparator(panel, input) {
			let separator = panel.querySelector(".upload-separator");
			if (!separator) separator = createElement("div", { className: "upload-separator" });
			separator.replaceChildren(createElement("span", { text: "or paste a URL" }));
			if (separator.nextElementSibling !== input) input.insertAdjacentElement("beforebegin", separator);
			return separator;
		}
		insertTextPicker(panel, config, input, picker) {
			if (UPLOAD_COMMANDS[config.key]) {
				const separator = this.ensurePasteUrlSeparator(panel, input);
				const uploadPanel = document.getElementById(getUploadPanelId(config.key));
				if (uploadPanel && panel.contains(uploadPanel)) {
					uploadPanel.insertAdjacentElement("beforebegin", picker);
					return;
				}
				separator.insertAdjacentElement("beforebegin", picker);
				return;
			}
			input.insertAdjacentElement("afterend", picker);
		}
		mountTextPicker(config) {
			const pickerId = getTextPickerId(config.key);
			if (document.getElementById(pickerId)) return false;
			const panel = document.querySelector(config.panelSelector);
			const input = document.querySelector(config.inputSelector);
			if (!panel || !input || !panel.contains(input)) {
				log("debug", "Text command input was not found yet", {
					command: config.key,
					panel: Boolean(panel),
					input: Boolean(input)
				});
				return false;
			}
			const picker = createTextPicker({
				config,
				input,
				categories: getCategories(this.dbState, config.type),
				uiState: this.getCommandPickerUiState(config.key),
				onSelect: ({ input: sourceInput, list, button }) => this.selectTextItem(sourceInput, list, button),
				onPreview: ({ button }) => this.openMediaPreview(button),
				onCategoryChange: (details) => log("info", "Text category changed", details),
				onUiStateChange: (patch) => this.updateCommandPickerUiState(config.key, patch),
				onAddCategory: () => this.addCategory(config.type, config.key),
				onRenameCategory: (categoryId) => this.openCategoryEditor(config.type, categoryId, config.key)
			});
			this.insertTextPicker(panel, config, input, picker);
			log("info", "Text picker mounted", {
				command: config.key,
				type: config.type,
				selector: config.inputSelector,
				summary: getDatabaseSummary(this.dbState)[config.type]
			});
			return true;
		}
		mountTextPickers() {
			return Object.values(TEXT_COMMANDS).map((config) => this.mountTextPicker(config)).some(Boolean);
		}
		selectMediaItem(input, picker, button, options = {}) {
			const url = button.dataset.url || "";
			const grid = picker.querySelector(".ctrlem-db-media-grid");
			this.markInputSelection(input, {
				value: url,
				type: button.dataset.type,
				source: button.dataset.source || "saved"
			});
			input.value = url;
			input.dispatchEvent(new Event("input", { bubbles: true }));
			input.dispatchEvent(new Event("change", { bubbles: true }));
			if (options.focus !== false) this.focusWithoutScroll(input);
			else this.restoreFocusState(options.focusState);
			picker.querySelectorAll(".ctrlem-db-media-tile.is-selected").forEach((tile) => {
				tile.classList.remove("is-selected");
			});
			button.classList.add("is-selected");
			this.updateCommandPickerUiState(button.dataset.command || "", {
				categoryId: button.dataset.categoryId || picker.dataset.categoryId || "",
				categoryName: button.dataset.category || picker.dataset.category || "",
				value: url,
				itemIndex: Number(button.dataset.index || -1),
				scrollTop: grid?.scrollTop || 0
			});
			log("info", "Media selected", {
				command: button.dataset.command,
				type: button.dataset.type,
				category: button.dataset.category,
				url
			});
		}
		async getMediaCategories(config) {
			const categories = getStaticMediaCategories(this.dbState, config.type);
			if (config.type !== RecordType.IMAGE) return categories;
			const defaultItems = await this.site.getDefaultImageItems(config.key);
			if (defaultItems.length === 0) return categories;
			return [...categories, {
				id: "default",
				name: "Default",
				items: defaultItems,
				isDefault: true
			}];
		}
		insertMediaPicker(panel, input, picker) {
			const separator = this.ensurePasteUrlSeparator(panel, input);
			const uploadPanel = document.getElementById(getUploadPanelId(picker.dataset.command || ""));
			if (uploadPanel && panel.contains(uploadPanel)) {
				uploadPanel.insertAdjacentElement("beforebegin", picker);
				return;
			}
			separator.insertAdjacentElement("beforebegin", picker);
		}
		async refreshMediaPicker(config) {
			const pickerId = getMediaPickerId(config.key);
			const picker = document.getElementById(pickerId);
			const panel = document.querySelector(config.panelSelector);
			const input = document.querySelector(config.inputSelector);
			const canMount = panel && input && panel.contains(input);
			if (panel) this.site.hideMediaUi(config, panel);
			if (!picker) {
				if (canMount && !this.pendingMediaMounts.has(config.key)) this.mountMediaPicker(config);
				return Boolean(canMount);
			}
			if (!canMount || !panel.contains(picker) || picker.ctrlemDbInput !== input) {
				picker.remove();
				if (canMount && !this.pendingMediaMounts.has(config.key)) this.mountMediaPicker(config);
				return true;
			}
			const renderToken = this.mediaRenderToken;
			const categories = await this.getMediaCategories(config);
			if (renderToken !== this.mediaRenderToken || !picker.isConnected) return false;
			if (updateMediaPicker(picker, {
				categories,
				input,
				uiState: this.getCommandPickerUiState(config.key)
			})) return true;
			picker.remove();
			if (!this.pendingMediaMounts.has(config.key)) this.mountMediaPicker(config);
			return true;
		}
		async mountMediaPicker(config) {
			const pickerId = getMediaPickerId(config.key);
			if (document.getElementById(pickerId) || this.pendingMediaMounts.has(config.key)) return false;
			const renderToken = this.mediaRenderToken;
			const panel = document.querySelector(config.panelSelector);
			const input = document.querySelector(config.inputSelector);
			if (!panel || !input || !panel.contains(input)) {
				log("debug", "Media command input was not found yet", {
					command: config.key,
					panel: Boolean(panel),
					input: Boolean(input)
				});
				return false;
			}
			this.pendingMediaMounts.add(config.key);
			try {
				const categories = await this.getMediaCategories(config);
				if (renderToken !== this.mediaRenderToken) return false;
				if (!panel.isConnected || !input.isConnected || document.getElementById(pickerId)) return false;
				const picker = createMediaPicker({
					config,
					categories,
					input,
					uiState: this.getCommandPickerUiState(config.key),
					onSelect: ({ input: sourceInput, picker: sourcePicker, button }) => this.selectMediaItem(sourceInput, sourcePicker, button),
					onDelete: ({ item, tile }) => this.site.deleteDefaultImageItem(item, tile, () => this.refreshDbConsumers("default image deleted")),
					onCategoryChange: (details) => log("info", "Media category changed", details),
					onUiStateChange: (patch) => this.updateCommandPickerUiState(config.key, patch),
					onAddCategory: () => this.addCategory(config.type, config.key),
					onRenameCategory: (categoryId) => this.openCategoryEditor(config.type, categoryId, config.key),
					onPreviewToggle: (categoryId, enabled) => this.setImagePreviewsEnabled(categoryId, enabled),
					setImagePreviewSource: (image, sourceUrl, cacheKey) => this.imageCache.setImagePreviewSource(image, sourceUrl, cacheKey)
				});
				picker.ctrlemDbInput = input;
				this.insertMediaPicker(panel, input, picker);
				log("info", "Media picker mounted", {
					command: config.key,
					type: config.type,
					categories: categories.length,
					items: categories.reduce((count, category) => count + category.items.length, 0)
				});
				return true;
			} catch (error) {
				log("error", "Failed to mount media picker", {
					command: config.key,
					message: error?.message || String(error)
				});
				return false;
			} finally {
				this.pendingMediaMounts.delete(config.key);
				if (renderToken !== this.mediaRenderToken && !document.getElementById(pickerId)) window.setTimeout(() => this.mountMediaPicker(config), 0);
			}
		}
		mountMediaPickers() {
			let changed = false;
			Object.values(MEDIA_COMMANDS).forEach((config) => {
				const panel = document.querySelector(config.panelSelector);
				if (panel) changed = this.site.hideMediaUi(config, panel) || changed;
				const input = document.querySelector(config.inputSelector);
				const canMount = panel && input && panel.contains(input);
				const isMissing = !document.getElementById(getMediaPickerId(config.key));
				const isPending = this.pendingMediaMounts.has(config.key);
				if (canMount && isMissing && !isPending) {
					changed = true;
					this.mountMediaPicker(config);
				}
			});
			return changed;
		}
		insertUploadPanel(panel, config, uploadPanel, input) {
			const picker = this.getCommandPickerElement(config.key);
			if (picker && panel.contains(picker)) {
				picker.insertAdjacentElement("afterend", uploadPanel);
				return;
			}
			this.ensurePasteUrlSeparator(panel, input).insertAdjacentElement("beforebegin", uploadPanel);
		}
		mountUploadPanel(config) {
			if (document.getElementById(getUploadPanelId(config.key))) return false;
			const panel = document.querySelector(config.panelSelector);
			const input = document.querySelector(config.inputSelector);
			if (!panel || !input || !panel.contains(input)) return false;
			const nativeDropzone = config.nativeDropzoneSelector ? panel.querySelector(config.nativeDropzoneSelector) : null;
			const uploadPanel = createUploadPanel({
				config,
				input,
				nativeDropzone,
				uiState: this.getCommandUploadUiState(config.key),
				onUiStateChange: (patch) => this.updateCommandUploadUiState(config.key, patch),
				actions: this.managerActions
			});
			this.insertUploadPanel(panel, config, uploadPanel, input);
			log("info", "Upload panel mounted", {
				command: config.key,
				tools: config.tools,
				native: Boolean(nativeDropzone)
			});
			return true;
		}
		mountUploadPanels() {
			return Object.values(UPLOAD_COMMANDS).map((config) => this.mountUploadPanel(config)).some(Boolean);
		}
		getSendOrDeleteDownloadFilename(src) {
			const timestamp = new Date().toISOString().slice(0, 19).replace("T", "-").replace(/:/g, "-");
			let extension = "png";
			try {
				const match = new URL(src, window.location.href).pathname.match(/\.([a-z0-9]{2,5})$/i);
				if (match) extension = match[1].toLowerCase();
			} catch {
				const match = src.split("?")[0].match(/\.([a-z0-9]{2,5})$/i);
				if (match) extension = match[1].toLowerCase();
			}
			return `sendOrDelete-${timestamp}.${extension}`;
		}
		downloadSendOrDeleteImage(src) {
			const url = new URL(src, window.location.href).href;
			const name = this.getSendOrDeleteDownloadFilename(url);
			const gmDownload = globalThis.GM_download;
			if (typeof gmDownload === "function") {
				gmDownload({
					url,
					name,
					saveAs: false
				});
				return;
			}
			const link = createElement("a", { attrs: {
				href: url,
				download: name
			} });
			document.body.appendChild(link);
			link.click();
			link.remove();
		}
		getSendOrDeleteResponseSignature(item) {
			const image = item.querySelector(".response-image[src]");
			if (image?.src) return `image:${new URL(image.src, window.location.href).href}`;
			return `text:${String(item.querySelector(".response-body")?.textContent || item.textContent || "").trim()}`;
		}
		getCurrentSendOrDeleteResponseCounts() {
			const container = document.querySelector(CONFIG.selectors.resultsContainer);
			const counts = new Map();
			if (!container) return counts;
			container.querySelectorAll(".response-item").forEach((item) => {
				if (String(item.querySelector(".response-badge")?.textContent || "").trim().toLowerCase() !== "sendordelete") return;
				const signature = this.getSendOrDeleteResponseSignature(item);
				counts.set(signature, (counts.get(signature) || 0) + 1);
			});
			return counts;
		}
		armSendOrDeleteDownload() {
			if (this.uploaderSettings.autoDownloadSendOrDeleteImages === false) return;
			this.sendOrDeleteDownloadArms.push({
				baseline: this.getCurrentSendOrDeleteResponseCounts(),
				armedAt: Date.now()
			});
			log("debug", "Send or Delete image download armed", { pending: this.sendOrDeleteDownloadArms.length });
		}
		mountSendOrDeleteDownloadTrigger() {
			if (document.documentElement.dataset.ctrlemDbSendOrDeleteDownloadTrigger === "true") return false;
			document.documentElement.dataset.ctrlemDbSendOrDeleteDownloadTrigger = "true";
			document.addEventListener("click", (event) => {
				if (!(event.target instanceof Element)) return;
				const button = event.target.closest("[data-send=\"sendOrDelete\"]");
				if (!button || button.disabled) return;
				this.armSendOrDeleteDownload();
			}, true);
			return true;
		}
		scanSendOrDeleteResponses() {
			const container = document.querySelector(CONFIG.selectors.resultsContainer);
			if (!container || this.sendOrDeleteDownloadArms.length === 0) return false;
			let downloaded = false;
			const shouldDownload = this.uploaderSettings.autoDownloadSendOrDeleteImages !== false;
			const seen = new Map();
			container.querySelectorAll(".response-item").forEach((item) => {
				if (this.sendOrDeleteDownloadArms.length === 0) return;
				if (String(item.querySelector(".response-badge")?.textContent || "").trim().toLowerCase() !== "sendordelete") return;
				const signature = this.getSendOrDeleteResponseSignature(item);
				const seenCount = (seen.get(signature) || 0) + 1;
				seen.set(signature, seenCount);
				if (item.dataset.ctrlemDbSendOrDeleteDownloaded === "true") return;
				const armIndex = this.sendOrDeleteDownloadArms.findIndex((arm) => seenCount > (arm.baseline.get(signature) || 0));
				if (armIndex < 0) return;
				item.dataset.ctrlemDbSendOrDeleteDownloaded = "true";
				this.sendOrDeleteDownloadArms.splice(armIndex, 1);
				this.sendOrDeleteDownloadArms.forEach((arm) => {
					arm.baseline.set(signature, (arm.baseline.get(signature) || 0) + 1);
				});
				const image = item.querySelector(".response-image[src]");
				if (!shouldDownload || !image?.src) return;
				this.downloadSendOrDeleteImage(image.src);
				downloaded = true;
				log("info", "Send or Delete image download started", { src: image.src });
			});
			return downloaded;
		}
		toggleDbManager() {
			if (this.managerSelection.isOpen) {
				this.closeDbManager();
				return;
			}
			this.openDbManager();
		}
		openDbManager() {
			const parts = this.site.getResultsParts();
			if (!parts.panel || !parts.head || !parts.title || !parts.description) {
				log("warn", "Results panel was not found for DB manager");
				return;
			}
			if (!this.managerSelection.originalTitle) {
				this.managerSelection.originalTitle = parts.title.textContent || "Results";
				this.managerSelection.originalDescription = parts.description.textContent || "";
			}
			this.ensureDbManagerRoot(parts.head);
			this.renderDbManager();
			parts.title.replaceChildren(createDbManagerBrandLink());
			parts.description.textContent = "Edit links, phrases, images, sounds, and videos.";
			parts.actions?.classList.add("ctrlem-db-hidden-site-ui");
			parts.pagination?.classList.add("ctrlem-db-hidden-site-ui");
			const root = document.getElementById(UI_IDS.dbManager);
			if (root) root.hidden = false;
			this.managerSelection.isOpen = true;
			this.setDbButtonActive(true);
			log("info", "DB manager opened");
		}
		closeDbManager() {
			const parts = this.site.getResultsParts();
			const root = document.getElementById(UI_IDS.dbManager);
			this.flushEditorToState();
			if (this.dbState?.autoSave) this.saveDbState("manager closed");
			else this.refreshDbConsumers("manager closed");
			if (root) root.hidden = true;
			if (parts.title) parts.title.textContent = this.managerSelection.originalTitle || "Results";
			if (parts.description) parts.description.textContent = this.managerSelection.originalDescription || "";
			parts.actions?.classList.remove("ctrlem-db-hidden-site-ui");
			parts.pagination?.classList.remove("ctrlem-db-hidden-site-ui");
			this.managerSelection.isOpen = false;
			this.managerSelection.editorCommandKey = "";
			this.setDbButtonActive(false);
			log("info", "DB manager closed");
		}
		ensureDbManagerRoot(head) {
			let root = document.getElementById(UI_IDS.dbManager);
			if (root) return root;
			root = createElement("div", {
				id: UI_IDS.dbManager,
				className: "ctrlem-db-manager",
				attrs: { hidden: "" }
			});
			head.insertAdjacentElement("afterend", root);
			return root;
		}
		renderDbManager() {
			const root = document.getElementById(UI_IDS.dbManager);
			if (!root) return;
			renderDbManager(root, this.getManagerViewModel(), this.managerActions);
		}
		renderCategoryList() {
			const list = document.getElementById(UI_IDS.dbManagerCategoryList);
			if (!list) return;
			renderCategoryList(list, this.getManagerViewModel(), this.managerActions);
		}
		setActiveType(type) {
			this.flushEditorToState();
			this.dbState.activeType = normalizeType(type);
			this.uiState.manager.activeTab = "editor";
			const selected = this.getSelectedCategory(this.dbState.activeType);
			if (selected) this.setManagerSelectedCategory(this.dbState.activeType, selected.id);
			this.renderDbManager();
			this.scheduleUiStateSave("manager type changed");
			this.saveAndRefreshAfterStructuralChange("type changed");
			log("info", "Manager type changed", { type: this.dbState.activeType });
		}
		setActiveTab(tab) {
			if (![
				"editor",
				"settings",
				"info"
			].includes(tab)) return;
			this.flushEditorToState();
			this.uiState.manager.activeTab = tab;
			this.renderDbManager();
			this.scheduleUiStateSave("manager tab changed");
			log("info", "Manager tab changed", { tab });
		}
		setCategoryListScroll(scrollTop) {
			this.uiState.manager.categoryListScrollTop = Math.max(0, Number(scrollTop) || 0);
			this.scheduleUiStateSave("category list scrolled");
		}
		selectManagerCategory(categoryId) {
			this.flushEditorToState();
			this.setManagerSelectedCategory(this.dbState.activeType, categoryId);
			this.renderDbManager();
			if (this.dbState.autoSave) this.saveDbState("category selected");
			log("info", "Category selected", {
				type: this.dbState.activeType,
				categoryId
			});
		}
		setAutoSave(enabled) {
			this.dbState.autoSave = enabled;
			log("info", "Auto-save toggled", { enabled: this.dbState.autoSave });
			this.saveDbState("auto-save toggled");
			setManagerStatus(this.dbState.autoSave ? "Auto-save enabled" : "Auto-save disabled", "info");
		}
		setAutoSendInterval(seconds, options = {}) {
			const nextInterval = clampAutoSendInterval(seconds);
			this.dbState.autoSendIntervalSeconds = nextInterval;
			log("info", "Auto-send interval changed", { seconds: nextInterval });
			this.saveDbState("auto-send interval changed");
			this.autoSend.syncIntervalInputs();
			if (options.status !== false) setManagerStatus(`Auto-send interval: ${nextInterval}s`, "info");
		}
		setMinimumRequestInterval(seconds, options = {}) {
			const nextInterval = clampMinimumRequestInterval(seconds);
			this.dbState.minimumRequestIntervalSeconds = nextInterval;
			log("info", "Auto-send minimum request interval changed", { seconds: nextInterval });
			this.saveDbState("auto-send minimum request interval changed");
			if (options.status !== false) setManagerStatus(`Auto-send min request interval: ${nextInterval}s`, "info");
		}
		setUploaderSetting(name, value) {
			if (!Object.prototype.hasOwnProperty.call(this.uploaderSettings, name)) return;
			this.uploaderSettings[name] = typeof this.uploaderSettings[name] === "boolean" ? value === true || value === "true" : String(value || "");
			if (name === "autoDownloadSendOrDeleteImages" && this.uploaderSettings[name] === false) this.sendOrDeleteDownloadArms = [];
			this.scheduleUploaderSettingsSave();
		}
		normalizeLinkCheckScope() {
			const scopeAll = this.linkCheckState.scopeAll !== false;
			const scopeType = LINK_CHECK_MEDIA_TYPES.includes(this.linkCheckState.scopeType) ? this.linkCheckState.scopeType : RecordType.IMAGE;
			const categories = getUserCategories(this.dbState, scopeType);
			const selectedCategory = categories.find((category) => category.id === this.linkCheckState.scopeCategoryId) || categories[0] || null;
			Object.assign(this.linkCheckState, {
				scopeAll,
				scopeType,
				scopeCategoryId: selectedCategory?.id || ""
			});
			return {
				scopeAll,
				scopeType,
				scopeCategoryId: selectedCategory?.id || "",
				category: selectedCategory
			};
		}
		setLinkCheckScope(patch) {
			if (this.linkCheckState.isBusy) return;
			if (typeof patch?.scopeAll === "boolean") this.linkCheckState.scopeAll = patch.scopeAll;
			if (LINK_CHECK_MEDIA_TYPES.includes(patch?.scopeType)) {
				this.linkCheckState.scopeType = patch.scopeType;
				if (patch.scopeCategoryId === void 0) this.linkCheckState.scopeCategoryId = "";
			}
			if (patch?.scopeCategoryId !== void 0) this.linkCheckState.scopeCategoryId = String(patch.scopeCategoryId || "");
			this.normalizeLinkCheckScope();
			this.renderDbManager();
		}
		async renameMediaItem(details, name) {
			const type = String(details?.type || "");
			if (type !== RecordType.SOUND && type !== RecordType.VIDEO) return false;
			const url = String(details?.value || "").trim();
			if (!url) return false;
			const categories = getUserCategories(this.dbState, type);
			const category = categories.find((item) => item.id === details?.categoryId) || categories.find((item) => item.name === details?.category);
			if (!category) return false;
			const lines = parseLines(category.content);
			const requestedIndex = Number(details?.index);
			let lineIndex = Number.isFinite(requestedIndex) && requestedIndex >= 0 && getRecordKey(type, lines[requestedIndex]) === url ? requestedIndex : -1;
			if (lineIndex < 0) lineIndex = lines.findIndex((line) => getRecordKey(type, line) === url);
			if (lineIndex < 0) return false;
			const cleanName = String(name || "").trim();
			lines[lineIndex] = cleanName ? `${url} ${cleanName}` : url;
			category.content = formatCategoryContent(lines.join("\n"));
			this.updateCommandPickerUiState(details?.command || "", {
				categoryId: category.id,
				categoryName: category.name,
				value: url,
				itemIndex: lineIndex
			});
			if (this.managerSelection.isOpen && this.dbState.activeType === type && this.managerSelection.selectedCategoryByType[type] === category.id) {
				const textarea = document.getElementById(UI_IDS.dbManagerTextarea);
				if (textarea) textarea.value = category.content;
			}
			await this.saveDbState("media renamed", { flushEditor: false });
			this.site.notify("Media renamed", "success");
			return true;
		}
		openMediaPreview(button) {
			const type = String(button?.dataset?.type || "");
			const url = String(button?.dataset?.value || "").trim();
			if (!url || type !== RecordType.SOUND && type !== RecordType.VIDEO) return;
			const opened = window.open(url, "_blank", "noopener,noreferrer");
			const title = type === RecordType.SOUND ? "Sound preview" : "Video preview";
			const nameInput = createElement("input", {
				className: "ctrlem-db-media-preview-name",
				value: button.dataset.label || "",
				attrs: {
					placeholder: "Display name",
					autocomplete: "off"
				}
			});
			const status = createElement("div", {
				className: "ctrlem-db-media-preview-status",
				attrs: { "aria-live": "polite" }
			});
			const closeButton = createElement("button", {
				className: "btn btn-sm btn-secondary",
				text: "Cancel",
				type: "button"
			});
			const saveButton = createElement("button", {
				className: "btn btn-sm btn-primary",
				text: "Save name",
				type: "button"
			});
			const modal = createElement("div", {
				className: "ctrlem-db-modal-backdrop ctrlem-db-media-preview-backdrop",
				attrs: {
					role: "dialog",
					"aria-modal": "true",
					"aria-label": title
				}
			}, [createElement("div", { className: "ctrlem-db-modal ctrlem-db-media-preview-modal" }, [
				createElement("div", {
					className: "ctrlem-db-modal-title",
					text: title
				}),
				createElement("a", {
					className: "ctrlem-db-media-preview-url",
					text: url,
					attrs: {
						href: url,
						target: "_blank",
						rel: "noopener noreferrer"
					}
				}),
				nameInput,
				status,
				createElement("div", { className: "ctrlem-db-modal-actions" }, [closeButton, saveButton])
			])]);
			const close = () => {
				modal.remove();
			};
			status.textContent = opened ? "Your preview was opened in a new tab. You can rename the link or close this window." : "Your preview can be opened from the link above. You can rename the link or close this window.";
			const save = async () => {
				saveButton.disabled = true;
				status.textContent = "Saving...";
				status.dataset.level = "info";
				if (!await this.renameMediaItem(button.dataset, nameInput.value)) {
					saveButton.disabled = false;
					status.textContent = "Media item was not found.";
					status.dataset.level = "error";
					return;
				}
				button.dataset.label = nameInput.value.trim();
				close();
			};
			closeButton.addEventListener("click", close);
			saveButton.addEventListener("click", () => {
				save().catch((error) => {
					saveButton.disabled = false;
					status.textContent = error?.message || String(error);
					status.dataset.level = "error";
				});
			});
			nameInput.addEventListener("keydown", (event) => {
				if (event.key === "Enter") saveButton.click();
				if (event.key === "Escape") close();
			});
			modal.addEventListener("click", (event) => {
				if (event.target === modal) close();
			});
			document.body.appendChild(modal);
			window.setTimeout(() => this.focusWithoutScroll(nameInput), 0);
		}
		openImgBBKeyPrompt() {
			document.getElementById(UI_IDS.imgbbKeyModal)?.remove();
			const input = createElement("input", {
				className: "ctrlem-db-imgbb-key-input",
				type: "password",
				value: this.uploaderSettings.imgbbApiKey || "",
				attrs: {
					placeholder: "ImgBB API key",
					autocomplete: "off"
				}
			});
			const status = createElement("div", {
				className: "ctrlem-db-imgbb-key-status",
				attrs: { "aria-live": "polite" }
			});
			const closeButton = createElement("button", {
				className: "btn btn-sm btn-secondary",
				text: "Cancel",
				type: "button"
			});
			const saveButton = createElement("button", {
				className: "btn btn-sm btn-primary",
				text: "Save key",
				type: "button"
			});
			const modal = createElement("div", {
				id: UI_IDS.imgbbKeyModal,
				className: "ctrlem-db-modal-backdrop",
				attrs: {
					role: "dialog",
					"aria-modal": "true",
					"aria-label": "ImgBB API key"
				}
			}, [createElement("div", { className: "ctrlem-db-modal" }, [
				createElement("div", {
					className: "ctrlem-db-modal-title",
					text: "ImgBB API key"
				}),
				createElement("p", {
					className: "ctrlem-db-modal-copy",
					text: "ImgBB needs an API key for full media uploading above CtrlEm small-file limits."
				}),
				input,
				status,
				createElement("div", { className: "ctrlem-db-modal-actions" }, [closeButton, saveButton])
			])]);
			const close = () => modal.remove();
			const save = () => {
				const value = input.value.trim();
				if (!value) {
					status.textContent = "Enter an ImgBB API key.";
					status.dataset.level = "error";
					return;
				}
				this.setUploaderSetting("imgbbApiKey", value);
				status.textContent = "Saved.";
				status.dataset.level = "success";
				window.setTimeout(close, USER_CONFIG.ui.modalCloseDelayMs);
			};
			closeButton.addEventListener("click", close);
			saveButton.addEventListener("click", save);
			input.addEventListener("keydown", (event) => {
				if (event.key === "Enter") save();
				if (event.key === "Escape") close();
			});
			modal.addEventListener("click", (event) => {
				if (event.target === modal) close();
			});
			document.body.appendChild(modal);
			window.setTimeout(() => input.focus(), 0);
		}
		async uploadContentFile(request) {
			const tool = String(request?.tool || "");
			const file = request?.file;
			if (!file) throw new Error("File is required");
			try {
				if (tool === "imgbb") {
					const url = await uploadImageToImgBB(file, request?.apiKey || this.uploaderSettings.imgbbApiKey);
					log("info", "ImgBB upload completed", {
						name: file.name,
						url
					});
					return url;
				}
				if (tool === "catbox") {
					const url = await uploadFileToCatbox(file, request?.userhash || this.uploaderSettings.catboxUserhash);
					log("info", "Catbox upload completed", {
						name: file.name,
						url
					});
					return url;
				}
				if (tool === "vidhosting") {
					const url = await uploadVideoToVidHosting(file);
					log("info", "VidHosting upload completed", {
						name: file.name,
						url
					});
					return url;
				}
				throw new Error(`Unknown upload tool: ${tool}`);
			} catch (error) {
				log("error", "Content upload failed", {
					tool,
					name: file.name,
					message: error?.message || String(error)
				});
				throw error;
			}
		}
		getUploadTarget(config) {
			const categories = getUserCategories(this.dbState, config.type);
			const selectedId = this.getCommandPickerUiState(config.key).categoryId || this.managerSelection.selectedCategoryByType[config.type];
			const category = categories.find((item) => item.id === selectedId) || categories[0];
			return {
				id: category?.id || "",
				name: category?.name || "Current category",
				type: config.type
			};
		}
		getUploadCategories(config) {
			return getUserCategories(this.dbState, config.type).map((category) => ({
				id: category.id,
				name: category.name,
				type: config.type
			}));
		}
		async appendUploadedUrl(request) {
			const config = request?.config || {};
			const url = String(request?.url || "").trim();
			const fileName = String(request?.fileName || "").trim();
			const value = String(request?.value || request?.line || ((config.type === RecordType.SOUND || config.type === RecordType.VIDEO) && fileName ? `${url} ${fileName}` : url)).trim();
			const categories = getUserCategories(this.dbState, config.type);
			const category = categories.find((item) => item.id === request?.targetCategoryId) || categories.find((item) => item.id === this.getCommandPickerUiState(config.key).categoryId) || categories[0];
			if (!category || !url || !value) return {
				appended: false,
				categoryName: category?.name || "Current category"
			};
			const existing = parseLines(category.content);
			const existingKeys = new Set(existing.map((line) => getRecordKey(config.type, line)));
			const key = getRecordKey(config.type, value);
			const appended = Boolean(key && !existingKeys.has(key));
			if (appended) {
				category.content = formatCategoryContent([...existing, value].join("\n"));
				this.updateCommandPickerUiState(config.key, {
					categoryId: category.id,
					categoryName: category.name,
					value: url,
					itemIndex: existing.length
				});
				if (this.managerSelection.isOpen && this.dbState.activeType === config.type && this.managerSelection.selectedCategoryByType[config.type] === category.id) {
					const textarea = document.getElementById(UI_IDS.dbManagerTextarea);
					if (textarea) textarea.value = category.content;
				}
				if (this.dbState.autoSave) await this.saveDbState(`${config.label || config.key} upload appended`, { flushEditor: false });
				else {
					this.renderCategoryList();
					this.refreshDbConsumers(`${config.label || config.key} upload appended`);
				}
			}
			log("info", "Uploaded URL handled", {
				command: config.key,
				source: request?.source,
				category: category.name,
				appended,
				url
			});
			return {
				appended,
				categoryName: category.name,
				url,
				value
			};
		}
		async uploadCommandFile(request) {
			const url = await this.uploadContentFile(request);
			return this.appendUploadedUrl({
				config: request.config,
				url,
				targetCategoryId: request.targetCategoryId,
				source: request.tool
			});
		}
		resetLinkCheckState(categoryId = "", patch = {}) {
			const scopeAll = this.linkCheckState.scopeAll !== false;
			const scopeType = LINK_CHECK_MEDIA_TYPES.includes(this.linkCheckState.scopeType) ? this.linkCheckState.scopeType : RecordType.IMAGE;
			const scopeCategoryId = String(this.linkCheckState.scopeCategoryId || "");
			Object.assign(this.linkCheckState, {
				categoryId,
				scopeAll,
				scopeType,
				scopeCategoryId,
				isBusy: false,
				checked: 0,
				total: 0,
				brokenCount: 0,
				currentType: "",
				currentCategoryName: "",
				currentUrl: "",
				broken: [],
				statusMessage: "",
				statusLevel: "info",
				token: "",
				...patch
			});
		}
		async checkBrokenLinks() {
			this.flushEditorToState();
			const scope = this.normalizeLinkCheckScope();
			const targets = scope.scopeAll ? LINK_CHECK_MEDIA_TYPES.flatMap((type) => getUserCategories(this.dbState, type).map((category) => ({
				type,
				category
			}))) : scope.category ? [{
				type: scope.scopeType,
				category: scope.category
			}] : [];
			const total = targets.reduce((count, target) => count + getCategoryDataLines(target.category.content).length, 0);
			const token = createId("link-check");
			this.resetLinkCheckState("", {
				isBusy: true,
				total,
				statusMessage: "Checking media links...",
				token
			});
			this.renderDbManager();
			setManagerStatus("Checking media links...", "info");
			try {
				const broken = [];
				let checked = 0;
				for (const target of targets) {
					const result = await findBrokenMediaLinks(target.type, target.category.content, (progress) => {
						if (this.linkCheckState.token !== token) return;
						Object.assign(this.linkCheckState, {
							checked: checked + progress.checked,
							total,
							brokenCount: broken.length + progress.brokenCount,
							currentType: target.type,
							currentCategoryName: target.category.name,
							currentUrl: progress.currentUrl || "",
							statusMessage: `Checked links: ${checked + progress.checked}/${total}. Broken: ${broken.length + progress.brokenCount}`,
							statusLevel: "info"
						});
						setManagerStatus(`Checked links: ${checked + progress.checked}/${total}. Broken: ${broken.length + progress.brokenCount}`, "info");
						this.renderDbManager();
					});
					if (this.linkCheckState.token !== token) return;
					checked += result.checked;
					broken.push(...result.broken.map((item) => ({
						...item,
						type: target.type,
						categoryId: target.category.id,
						categoryName: target.category.name
					})));
				}
				if (this.linkCheckState.token !== token) return;
				Object.assign(this.linkCheckState, {
					isBusy: false,
					checked,
					total,
					brokenCount: broken.length,
					currentType: "",
					currentCategoryName: "",
					currentUrl: "",
					broken,
					statusMessage: broken.length > 0 ? `Broken links found: ${broken.length}/${total}` : `No broken links found: ${total}`,
					statusLevel: broken.length > 0 ? "error" : "success"
				});
				this.renderDbManager();
				setManagerStatus(this.linkCheckState.statusMessage, this.linkCheckState.statusLevel);
				log("info", "Broken media link check completed", {
					scope: scope.scopeAll ? "all" : `${scope.scopeType}:${scope.scopeCategoryId}`,
					total,
					broken: broken.length
				});
			} catch (error) {
				if (this.linkCheckState.token !== token) return;
				Object.assign(this.linkCheckState, {
					isBusy: false,
					currentType: "",
					currentCategoryName: "",
					currentUrl: "",
					statusMessage: `Link check failed: ${error?.message || String(error)}`,
					statusLevel: "error"
				});
				this.renderDbManager();
				setManagerStatus("Link check failed. Check console logs.", "error");
				log("error", "Broken media link check failed", { message: error?.message || String(error) });
			}
		}
		async removeBrokenLinks() {
			this.flushEditorToState();
			const broken = Array.isArray(this.linkCheckState.broken) ? this.linkCheckState.broken : [];
			if (broken.length === 0) {
				setManagerStatus("No broken links to remove", "info");
				return;
			}
			if (!window.confirm(`Remove ${broken.length} broken link(s) from media database?`)) return;
			const brokenByCategory = new Map();
			broken.forEach((item) => {
				if (!item?.type || !item?.categoryId || !item?.line) return;
				const key = `${item.type}:${item.categoryId}`;
				const group = brokenByCategory.get(key) || {
					type: item.type,
					categoryId: item.categoryId,
					lines: new Set()
				};
				group.lines.add(item.line);
				brokenByCategory.set(key, group);
			});
			let removedCount = 0;
			let shouldSyncEditor = false;
			brokenByCategory.forEach((group) => {
				const category = getUserCategories(this.dbState, group.type).find((item) => item.id === group.categoryId);
				if (!category) return;
				const beforeLines = parseLines(category.content);
				const afterLines = beforeLines.filter((line) => !group.lines.has(line));
				const categoryRemovedCount = beforeLines.length - afterLines.length;
				if (categoryRemovedCount === 0) return;
				removedCount += categoryRemovedCount;
				category.content = formatCategoryContent(afterLines.join("\n"));
				shouldSyncEditor = shouldSyncEditor || this.managerSelection.isOpen && this.dbState.activeType === group.type && this.managerSelection.selectedCategoryByType[group.type] === category.id;
			});
			if (shouldSyncEditor) this.syncEditorTextarea();
			const brokenUrls = [...new Set(broken.map((item) => String(item.url || "")).filter(Boolean))];
			this.imageCache.deleteUrls(brokenUrls).catch((error) => {
				log("debug", "Broken link cache cleanup skipped", { message: error?.message || String(error) });
			});
			await this.saveDbState("broken links removed", { flushEditor: false });
			this.resetLinkCheckState("", {
				statusMessage: `Removed broken links: ${removedCount}`,
				statusLevel: removedCount > 0 ? "success" : "info"
			});
			this.renderDbManager();
			setManagerStatus(`Removed broken links: ${removedCount}`, removedCount > 0 ? "success" : "info");
			log("info", "Broken media links removed", { removed: removedCount });
		}
		updateEditorContent(content) {
			const category = this.getSelectedCategory(this.dbState.activeType);
			if (category) category.content = content;
			if (category?.id && [
				RecordType.IMAGE,
				RecordType.SOUND,
				RecordType.VIDEO
			].includes(this.dbState.activeType) && (this.linkCheckState.broken.length > 0 || this.linkCheckState.statusMessage)) this.resetLinkCheckState("", { statusMessage: "Category changed. Run the check again." });
			this.scheduleDataCommit("editor input");
		}
		addCategory(type = this.dbState.activeType, commandKey = "") {
			this.flushEditorToState();
			const normalizedType = normalizeType(type);
			const nextName = window.prompt("Category name", "");
			if (nextName === null) return;
			const cleanName = nextName.trim();
			if (!cleanName) {
				log("warn", "Category add cancelled: empty name");
				setManagerStatus("Add cancelled: empty category name.", "error");
				return;
			}
			const category = {
				id: createId(normalizedType),
				name: makeUniqueCategoryName(this.dbState, normalizedType, cleanName),
				content: ""
			};
			getUserCategories(this.dbState, normalizedType).push(category);
			this.setManagerSelectedCategory(normalizedType, category.id);
			if (commandKey) {
				this.updateCommandPickerUiState(commandKey, {
					categoryId: category.id,
					categoryName: category.name,
					itemIndex: -1,
					scrollTop: 0
				});
				if (this.managerSelection.isOpen && this.dbState.activeType === normalizedType) this.renderDbManager();
			} else {
				this.uiState.manager.activeTab = "editor";
				this.renderDbManager();
				this.focusManagerTextarea();
			}
			this.saveAndRefreshAfterStructuralChange("category added");
			log("info", "Category added", {
				type: normalizedType,
				category: category.name
			});
		}
		renameSelectedCategory() {
			this.renameCategory(this.dbState.activeType);
		}
		renameSelectedCategoryTo(name) {
			this.flushEditorToState();
			const type = this.dbState.activeType;
			const category = this.getSelectedCategory(type);
			if (!category) return "";
			const cleanName = String(name || "").trim();
			if (!cleanName) {
				log("warn", "Category rename cancelled: empty name");
				setManagerStatus("Rename cancelled: empty category name.", "error");
				return category.name;
			}
			const nextName = makeUniqueCategoryName(this.dbState, type, cleanName, category.id);
			if (nextName === category.name) return category.name;
			category.name = nextName;
			this.setManagerSelectedCategory(type, category.id);
			this.renderDbManager();
			this.saveAndRefreshAfterStructuralChange("category renamed");
			log("info", "Category renamed", {
				type,
				category: category.name
			});
			return category.name;
		}
		renameCategory(type = this.dbState.activeType, categoryId = "", commandKey = "") {
			this.flushEditorToState();
			const normalizedType = normalizeType(type);
			const category = categoryId ? getUserCategories(this.dbState, normalizedType).find((item) => item.id === categoryId) : this.getSelectedCategory(normalizedType);
			if (!category) return;
			const nextName = window.prompt("Category name", category.name);
			if (nextName === null) return;
			const cleanName = nextName.trim();
			if (!cleanName) {
				log("warn", "Category rename cancelled: empty name");
				setManagerStatus("Rename cancelled: empty category name.", "error");
				return;
			}
			category.name = makeUniqueCategoryName(this.dbState, normalizedType, cleanName, category.id);
			this.setManagerSelectedCategory(normalizedType, category.id);
			if (commandKey) this.updateCommandPickerUiState(commandKey, {
				categoryId: category.id,
				categoryName: category.name
			});
			this.renderDbManager();
			this.saveAndRefreshAfterStructuralChange("category renamed");
			log("info", "Category renamed", {
				type: normalizedType,
				category: category.name
			});
		}
		openCategoryEditor(type = this.dbState.activeType, categoryId = "", commandKey = "") {
			this.flushEditorToState();
			const normalizedType = normalizeType(type);
			const category = categoryId ? getUserCategories(this.dbState, normalizedType).find((item) => item.id === categoryId) : this.getSelectedCategory(normalizedType);
			if (!category) return;
			if (this.managerSelection.isOpen && this.dbState.activeType === normalizedType && this.uiState.manager.activeTab === "editor" && this.managerSelection.selectedCategoryByType[normalizedType] === category.id && this.managerSelection.editorCommandKey === commandKey) {
				this.closeDbManager();
				return;
			}
			this.dbState.activeType = normalizedType;
			this.uiState.manager.activeTab = "editor";
			this.setManagerSelectedCategory(normalizedType, category.id);
			if (commandKey) this.updateCommandPickerUiState(commandKey, {
				categoryId: category.id,
				categoryName: category.name
			});
			if (this.managerSelection.isOpen) this.renderDbManager();
			else this.openDbManager();
			this.managerSelection.editorCommandKey = commandKey;
			this.focusManagerCategoryName();
			log("info", "Category editor opened", {
				type: normalizedType,
				category: category.name
			});
		}
		setImagePreviewsEnabled(categoryId, enabled) {
			this.flushEditorToState();
			const category = getUserCategories(this.dbState, RecordType.IMAGE).find((item) => item.id === categoryId);
			if (!category) return;
			const dataLines = parseLines(category.content).filter((line) => !isNoPreviewsMarker(line));
			const shouldEnable = enabled && getCategoryDataLines(category.content).length <= IMAGE_PREVIEW_MAX_ITEMS;
			category.content = formatCategoryContent(shouldEnable ? dataLines.join("\n") : [NO_PREVIEWS_MARKER, ...dataLines].join("\n"));
			this.setManagerSelectedCategory(RecordType.IMAGE, category.id);
			if (this.managerSelection.isOpen && this.dbState.activeType === RecordType.IMAGE && this.managerSelection.selectedCategoryByType[RecordType.IMAGE] === category.id) this.syncEditorTextarea();
			this.saveAndRefreshAfterStructuralChange("image previews toggled");
			log("info", "Image previews toggled", {
				category: category.name,
				enabled: shouldEnable
			});
		}
		deleteSelectedCategory() {
			const type = this.dbState.activeType;
			const categories = getUserCategories(this.dbState, type);
			const category = this.getSelectedCategory(type);
			if (!category) return;
			if (!window.confirm(`Delete category "${category.name}"?`)) return;
			const oldIndex = categories.findIndex((item) => item.id === category.id);
			if (oldIndex >= 0) categories.splice(oldIndex, 1);
			if (categories.length === 0) categories.push(createEmptyCategory(type));
			const nextIndex = Math.max(0, Math.min(oldIndex, categories.length - 1));
			this.setManagerSelectedCategory(type, categories[nextIndex].id);
			this.renderDbManager();
			this.saveAndRefreshAfterStructuralChange("category deleted");
			log("info", "Category deleted", {
				type,
				category: category.name
			});
		}
		reorderCategory(sourceId, targetId) {
			const type = this.dbState.activeType;
			if (!sourceId || !targetId || sourceId === targetId) return;
			const categories = getUserCategories(this.dbState, type);
			const sourceIndex = categories.findIndex((category) => category.id === sourceId);
			const targetIndex = categories.findIndex((category) => category.id === targetId);
			if (sourceIndex < 0 || targetIndex < 0) return;
			const [moved] = categories.splice(sourceIndex, 1);
			categories.splice(targetIndex, 0, moved);
			this.setManagerSelectedCategory(type, moved.id);
			this.renderCategoryList();
			this.saveAndRefreshAfterStructuralChange("category reordered");
			log("info", "Category reordered", {
				type,
				category: moved.name,
				targetId
			});
		}
		saveAndRefreshAfterStructuralChange(reason) {
			this.flushEditorToState();
			if (this.dbState.autoSave) {
				this.saveDbState(reason);
				return;
			}
			this.renderCategoryList();
			this.refreshDbConsumers(reason);
		}
		focusManagerTextarea() {
			window.setTimeout(() => {
				const textarea = document.getElementById(UI_IDS.dbManagerTextarea);
				if (textarea) textarea.focus();
			}, 0);
		}
		focusManagerCategoryName() {
			window.setTimeout(() => {
				const input = document.querySelector(".ctrlem-db-category-name-input");
				if (!input) return;
				input.focus();
				input.select?.();
			}, 0);
		}
		exportSelectedCategory() {
			this.flushEditorToState();
			const type = this.dbState.activeType;
			const category = this.getSelectedCategory(type);
			if (!category) return;
			const filename = `${getSafeFileName(type, "type")}-${getSafeFileName(category.name, "category")}.txt`;
			downloadTextFile(filename, formatCategoryContent(category.content), "text/plain;charset=utf-8");
			setManagerStatus(`Exported category: ${category.name}`, "success");
			log("info", "Category exported", {
				type,
				category: category.name,
				filename
			});
		}
		exportAllCategories() {
			this.flushEditorToState();
			const filename = `ctrlem-db-${new Date().toISOString().slice(0, 10)}.json`;
			downloadTextFile(filename, JSON.stringify(createExportPayload(this.dbState), null, 2), "application/json;charset=utf-8");
			setManagerStatus("Exported all categories", "success");
			log("info", "All categories exported", { filename });
		}
		async replaceAllCategories(rawState, reason, successMessage) {
			const keepAutoSave = this.dbState?.autoSave !== false;
			const keepAutoSendInterval = clampAutoSendInterval(this.dbState?.autoSendIntervalSeconds);
			const keepMinimumRequestInterval = clampMinimumRequestInterval(this.dbState?.minimumRequestIntervalSeconds);
			this.dbState = normalizeDbState(rawState);
			this.dbState.autoSave = keepAutoSave;
			if (rawState?.autoSendIntervalSeconds === void 0) this.dbState.autoSendIntervalSeconds = keepAutoSendInterval;
			if (rawState?.minimumRequestIntervalSeconds === void 0) this.dbState.minimumRequestIntervalSeconds = keepMinimumRequestInterval;
			resetManagerSelections(this.dbState, this.managerSelection);
			this.restoreManagerSelectionsFromUiState();
			this.scheduleUiStateSave("manager selections restored");
			this.renderDbManager();
			await this.saveDbState(reason, { flushEditor: false });
			setManagerStatus(successMessage, "success");
			log("info", successMessage, getDatabaseSummary(this.dbState));
		}
		async importAllCategoriesFromFile(file) {
			if (!file) return;
			try {
				const text = await file.text();
				const parsed = JSON.parse(text);
				if (!parsed?.types || typeof parsed.types !== "object") throw new Error("JSON must contain a \"types\" object");
				await this.replaceAllCategories(parsed, "all categories imported", "Imported all categories from JSON");
			} catch (error) {
				setManagerStatus("Import all failed. Select a valid DB JSON export.", "error");
				log("error", "Failed to import all categories", {
					name: file.name,
					message: error?.message || String(error)
				});
			}
		}
		async restoreDefaultCategories() {
			await this.replaceAllCategories(createSeedState(), "defaults restored", "Restored default categories");
		}
		async importCategoriesFromFiles(files) {
			if (!files.length) return;
			this.flushEditorToState();
			let importedCount = 0;
			let firstImported = null;
			for (const file of files) try {
				parseImportFile(file, await file.text(), this.dbState.activeType, log).forEach((addition) => {
					const type = normalizeType(addition.type || this.dbState.activeType);
					const category = {
						id: createId(type),
						name: makeUniqueCategoryName(this.dbState, type, addition.name),
						content: formatCategoryContent(addition.content)
					};
					getUserCategories(this.dbState, type).push(category);
					importedCount += 1;
					if (!firstImported) firstImported = {
						type,
						id: category.id
					};
				});
			} catch (error) {
				log("error", "Failed to import file", {
					name: file.name,
					message: error?.message || String(error)
				});
			}
			if (firstImported) {
				this.dbState.activeType = firstImported.type;
				this.setManagerSelectedCategory(firstImported.type, firstImported.id);
			}
			this.renderDbManager();
			this.saveAndRefreshAfterStructuralChange("categories imported");
			setManagerStatus(`Imported categories: ${importedCount}`, importedCount ? "success" : "error");
			log("info", "Categories imported", {
				count: importedCount,
				files: files.length
			});
		}
		mountUi(reason) {
			if ([
				this.mountDatabaseButton(),
				mountInputCapture({
					captureInputValue: (config) => this.captureInputValue(config),
					log
				}),
				this.mountTextPickers(),
				this.mountMediaPickers(),
				this.mountUploadPanels(),
				this.mountSendOrDeleteDownloadTrigger(),
				this.autoSend.mountControls(),
				this.autoSend.renderManager(),
				this.scanSendOrDeleteResponses()
			].some(Boolean)) log("debug", "UI mount pass completed", { reason });
		}
		debounce(callback, delay) {
			let timer = 0;
			return () => {
				window.clearTimeout(timer);
				timer = window.setTimeout(callback, delay);
			};
		}
		startObserver() {
			if (!document.body) return;
			new MutationObserver(this.debounce(() => {
				this.mountUi("dom-mutation");
			}, USER_CONFIG.ui.domObserverDelayMs)).observe(document.body, {
				childList: true,
				subtree: true
			});
			log("debug", "DOM observer started");
		}
	};
	async function bootCtrlEmDb() {
		await new CtrlEmDbApp().start();
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => {
		bootCtrlEmDb();
	}, { once: true });
	else bootCtrlEmDb();
})();
