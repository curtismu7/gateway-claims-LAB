import test from 'node:test';
import assert from 'node:assert/strict';
import { modeFrom } from '../src/config.js';
import { NO_LIVE } from '../src/releaseClaims.js';

test('the mode defaults to mock; live is refused with the honest message; anything else is refused, never a silent fallback', () => {
  assert.equal(modeFrom({}), 'mock');
  assert.equal(modeFrom({ GCLAB_MODE: '' }), 'mock');
  assert.equal(modeFrom({ GCLAB_MODE: 'mock' }), 'mock');
  assert.throws(() => modeFrom({ GCLAB_MODE: 'live' }), (e) => /GCLAB_MODE=live is not available/.test(e.message) && e.message.includes(NO_LIVE));
  for (const GCLAB_MODE of ['prod', 'Mock', 'x']) assert.throws(() => modeFrom({ GCLAB_MODE }), /not available/, GCLAB_MODE);
});

test('a bare MODE in the environment is not read: another app\'s MODE must not switch this one', () => {
  assert.equal(modeFrom({ MODE: 'live' }), 'mock');
  assert.equal(modeFrom({ MODE: 'prod' }), 'mock');
});
