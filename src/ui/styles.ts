import { createElement } from './dom';

export const APP_CSS = `
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

export function addStyles(): void {
  const gmAddStyle = (globalThis as any).GM_addStyle;
  if (typeof gmAddStyle === 'function') {
    gmAddStyle(APP_CSS);
    return;
  }

  const style = createElement('style', { attrs: { 'data-ctrlem-db': 'styles' } });
  style.textContent = APP_CSS;
  document.head.appendChild(style);
}
