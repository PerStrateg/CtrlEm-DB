import { bootCtrlEmDb } from './app';

const storagePrefix = 'ctrlem-db-dev:';

(globalThis as any).GM_getValue = (key: string, fallback: any) => {
  try {
    const raw = window.localStorage.getItem(`${storagePrefix}${key}`);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};

(globalThis as any).GM_setValue = (key: string, value: any) => {
  window.localStorage.setItem(`${storagePrefix}${key}`, JSON.stringify(value));
};

(globalThis as any).GM_addStyle = (css: string) => {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
};

(globalThis as any).GM_xmlhttpRequest = (details: any) => {
  window.fetch(details.url, {
    method: details.method || 'GET',
    headers: details.headers,
    body: details.data,
    credentials: 'omit',
  })
    .then(async (response) => {
      details.onload?.({
        status: response.status,
        responseText: await response.text(),
        finalUrl: response.url,
      });
    })
    .catch((error) => details.onerror?.(error));
};

(window as any).showToast = (message: string, level = 'info') => {
  console.log(`[CtrlEm dev toast:${level}] ${message}`);
};

const nativeFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;

  if (url.includes('/api/uploads/')) {
    return Promise.resolve(new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  }

  return nativeFetch(input, init);
};

bootCtrlEmDb();
