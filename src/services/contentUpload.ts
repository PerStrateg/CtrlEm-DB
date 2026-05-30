import { USER_CONFIG } from '../domain/constants';

const IMGBB_MAX_BYTES = USER_CONFIG.upload.imgbbMaxBytes;
const VIDHOSTING_MAX_BYTES = USER_CONFIG.upload.vidhostingMaxBytes;

type UploadResponse = {
  status: number;
  text: string;
};

function getErrorMessage(error: any): string {
  return error?.message || String(error || 'Unknown error');
}

function parseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function createHttpError(service: string, response: UploadResponse, fallback = 'Upload failed'): Error {
  const body = response.text.trim();
  return new Error(`${service}: ${body || `${fallback} (HTTP ${response.status})`}`);
}

async function postFormData(url: string, formData: FormData): Promise<UploadResponse> {
  const gmXmlHttpRequest = (globalThis as any).GM_xmlhttpRequest;

  if (typeof gmXmlHttpRequest === 'function') {
    console.log('[CtrlEm DB] Using GM_xmlhttpRequest for', url);
    return new Promise((resolve, reject) => {
      gmXmlHttpRequest({
        method: 'POST',
        url,
        data: formData,
        timeout: USER_CONFIG.upload.externalRequestTimeoutMs,
        onload: (response: any) => {
          console.log('[CtrlEm DB] GM_xmlhttpRequest onload', { url, status: response.status, textLength: String(response.responseText || '').length });
          resolve({
            status: Number(response.status || 0),
            text: String(response.responseText || ''),
          });
        },
        onerror: (error: any) => {
          console.log('[CtrlEm DB] GM_xmlhttpRequest onerror', { url, error: getErrorMessage(error) });
          reject(new Error(getErrorMessage(error)));
        },
        ontimeout: () => {
          console.log('[CtrlEm DB] GM_xmlhttpRequest ontimeout', { url, timeout: USER_CONFIG.upload.externalRequestTimeoutMs });
          reject(new Error('Request timed out'));
        },
      });
    });
  }

  console.log('[CtrlEm DB] Using fetch for', url);
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  return {
    status: response.status,
    text: await response.text(),
  };
}

export async function uploadImageToImgBB(file: File, apiKey: string): Promise<string> {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('ImgBB API key is required');
  if (file.size > IMGBB_MAX_BYTES) throw new Error(`${file.name}: ImgBB limit is 32 MB`);

  const endpoint = new URL('https://api.imgbb.com/1/upload');
  endpoint.searchParams.set('key', key);

  const formData = new FormData();
  formData.append('image', file, file.name);

  const response = await postFormData(endpoint.toString(), formData);
  const payload = parseJson(response.text);

  if (response.status < 200 || response.status >= 300 || !payload?.success || !payload?.data?.url) {
    const message = payload?.error?.message || payload?.error || payload?.status_txt || response.text;
    throw new Error(`ImgBB: ${message || `Upload failed (HTTP ${response.status})`}`);
  }

  return String(payload.data.url);
}

export async function uploadFileToCatbox(file: File, userhash = ''): Promise<string> {
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  if (userhash.trim()) formData.append('userhash', userhash.trim());
  formData.append('fileToUpload', file, file.name);

  console.log('[CtrlEm DB] Catbox upload starting', { name: file.name, size: file.size, type: file.type });
  const startTime = Date.now();
  const response = await postFormData('https://catbox.moe/user/api.php', formData);
  const elapsed = Date.now() - startTime;
  const url = response.text.trim();

  console.log('[CtrlEm DB] Catbox upload response', { name: file.name, status: response.status, elapsed, url: url.slice(0, 100) });

  if (response.status < 200 || response.status >= 300 || !/^https?:\/\//i.test(url)) {
    throw createHttpError('Catbox', response);
  }

  return url;
}

export async function uploadVideoToVidHosting(file: File): Promise<string> {
  if (file.size > VIDHOSTING_MAX_BYTES) throw new Error(`${file.name}: VidHosting limit is 100 MB`);

  const formData = new FormData();
  formData.append('file', file, file.name);

  console.log('[CtrlEm DB] VidHosting upload starting', { name: file.name, size: file.size, type: file.type });
  const startTime = Date.now();
  const response = await postFormData('https://upload.vidhosting.in/', formData);
  const elapsed = Date.now() - startTime;
  const payload = parseJson(response.text);

  console.log('[CtrlEm DB] VidHosting upload response', {
    name: file.name,
    status: response.status,
    elapsed,
    isJson: !!payload,
    responsePreview: response.text.slice(0, 500),
  });

  if (response.status < 200 || response.status >= 300 || !payload?.success || !payload?.url) {
    const message = payload?.error || payload?.message || response.text;
    throw new Error(`VidHosting: ${message || `Upload failed (HTTP ${response.status})`}`);
  }

  let url = String(payload.url);
  if (url.includes('stream.vidhosting.in') && !url.includes('/videos/')) {
    url = url.replace('stream.vidhosting.in/', 'stream.vidhosting.in/videos/');
  }
  return url;
}
