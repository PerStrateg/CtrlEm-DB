import { createElement } from './dom';

const TOAST_CLASS_BY_LEVEL: Record<string, string> = {
  success: 'is-success',
  error: 'is-error',
  warning: 'is-warning',
  warn: 'is-warning',
};

export function showCtrlEmDbToast(message: string, level = 'info'): void {
  const text = String(message || '').trim();
  if (!text) return;

  let container: any = document.querySelector('.ctrlem-db-toast-container');
  if (!container) {
    container = createElement('div', { className: 'ctrlem-db-toast-container' });
    document.body.appendChild(container);
  }

  const toast = createElement('div', {
    className: `ctrlem-db-toast ${TOAST_CLASS_BY_LEVEL[level] || ''}`.trim(),
    text,
  });

  container.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add('is-leaving');
    window.setTimeout(() => {
      toast.remove();
      if (!container.childElementCount) container.remove();
    }, 250);
  }, 3500);
}
