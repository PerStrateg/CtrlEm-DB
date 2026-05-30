import { CONFIG, LOG_PREFIX } from './domain/constants';

export function log(level: string, message: string, details?: unknown): void {
  if (!CONFIG.debug && level !== 'warn' && level !== 'error') return;

  const target = (console as any)[level] || console.log;
  if (details === undefined) {
    target.call(console, LOG_PREFIX, message);
    return;
  }
  target.call(console, LOG_PREFIX, message, details);
}
