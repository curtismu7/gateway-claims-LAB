// Mode configuration. GCLAB_MODE is the one key this app reads (never a bare MODE: the shared settings file is read by every standalone app, and another
// app's MODE must not switch this one). This app has a mock mode only. Asking for live is an error with an honest message, never a silent fallback.
import { NO_LIVE } from './releaseClaims.js';

export const MODES = ['mock'];
export function modeFrom(env = process.env) {
  const raw = env.GCLAB_MODE;
  const m = raw === undefined || raw === '' ? 'mock' : raw;
  if (m === 'live') throw new Error(`GCLAB_MODE=live is not available: ${NO_LIVE}`);
  if (!MODES.includes(m)) throw new Error(`GCLAB_MODE=${String(m).slice(0, 20)} is not available: this app has a mock mode only`);
  return m;
}
