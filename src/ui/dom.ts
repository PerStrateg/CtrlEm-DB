import { USER_CONFIG } from '../domain/constants';

export function createElement(tagName: string, options: any = {}, children: Node[] = []): any {
  const element: any = document.createElement(tagName);

  if (options.id) element.id = options.id;
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  if (options.value !== undefined) element.value = options.value;
  if (options.title) element.title = options.title;
  if (options.type) element.type = options.type;
  if (options.checked !== undefined) element.checked = Boolean(options.checked);
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([name, value]) => {
      element.setAttribute(name, value);
    });
  }
  if (options.dataset) {
    Object.entries(options.dataset).forEach(([name, value]) => {
      element.dataset[name] = value;
    });
  }

  children.forEach((child) => element.appendChild(child));
  return element;
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = createElement('a', {
    attrs: {
      href: url,
      download: filename,
    },
  });

  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), USER_CONFIG.ui.modalCloseDelayMs);
}
