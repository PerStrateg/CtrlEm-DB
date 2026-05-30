import { bootCtrlEmDb } from './app';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    bootCtrlEmDb();
  }, { once: true });
} else {
  bootCtrlEmDb();
}
