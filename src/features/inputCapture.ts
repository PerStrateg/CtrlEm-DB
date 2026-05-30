import { INPUT_CAPTURE_COMMANDS, RecordType, USER_CONFIG } from '../domain/constants';
import { isHttpUrl } from '../domain/content';

export function isCaptureValueValid(config: any, value: string): boolean {
  if (!value) return false;

  if (
    config.type === RecordType.LINKS
    || config.type === RecordType.IMAGE
    || config.type === RecordType.SOUND
    || config.type === RecordType.VIDEO
  ) {
    return isHttpUrl(value);
  }

  if (config.key !== 'writeForMe') return true;

  const count = Number.parseInt((document.querySelector(config.countSelector) as any)?.value || '1', 10);
  return value.length <= USER_CONFIG.inputCapture.maxTextLength
    && count >= USER_CONFIG.inputCapture.countMin
    && count <= USER_CONFIG.inputCapture.countMax;
}

export function mountInputCapture(options: any): boolean {
  const { captureInputValue, log } = options;
  if (document.documentElement.dataset.ctrlemDbInputCapture === 'true') return false;
  document.documentElement.dataset.ctrlemDbInputCapture = 'true';

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;

    const button: any = event.target.closest('[data-send]');
    if (!button) return;
    if (button.disabled) return;

    const config = (INPUT_CAPTURE_COMMANDS as any)[button.dataset.send];
    if (!config) return;

    captureInputValue(config).catch((error: any) => {
      log('error', 'Failed to capture input', {
        command: config.key,
        message: error?.message || String(error),
      });
    });
  }, true);

  log('debug', 'Input capture mounted');
  return true;
}
