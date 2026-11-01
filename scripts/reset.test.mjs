import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, startHttpServer } from '../server/src/app.js';
import { createHealth } from '../server/src/health.js';
import { createWorkspaces } from '../server/src/workspaces.js';
import { createConsoleStore } from '../server/src/consoleStore.js';
import { DEFAULT_CAST } from '../server/src/cast.js';
import { reset } from './reset.mjs';

test('the reset script clears the default workspace (runs and the modelled gateway), leaves another workspace alone, and refuses a non-loopback host', async () => {
  const workspaces = createWorkspaces(); const consoles = createConsoleStore();
  const health = createHealth({ runChecks: async () => [], intervalMs: 3_600_000 });
  const { server, url } = await startHttpServer({ port: 0, host: '127.0.0.1', app: createApp({ health, workspaces, consoles }) });
  try {
    const base = url.replace(/\/$/, '');
    workspaces.record('default', { scenario: 'allowed', decision: 'allow' }); workspaces.record('other', { scenario: 'allowed', decision: 'allow' });
    consoles.lab('default', 'retail', DEFAULT_CAST).act({ kind: 'set-waf', mode: 'fail-closed' });
    consoles.lab('other', 'retail', DEFAULT_CAST).act({ kind: 'set-waf', mode: 'fail-closed' });
    assert.deepEqual(await reset(base), { reset: 'ok', workspace: 'default' });
    assert.equal(workspaces.runs('default').runs.length, 0);
    assert.equal(consoles.peek('default', 'retail', DEFAULT_CAST).gw.wafFailureMode, 'fail-open', 'the modelled gateway is back as it was');
    assert.equal(workspaces.runs('other').runs.length, 1, 'another workspace is untouched');
    assert.equal(consoles.peek('other', 'retail', DEFAULT_CAST).gw.wafFailureMode, 'fail-closed');
    await assert.rejects(reset('http://example.invalid:5150'), /loopback only/);
  } finally { health.stop(); await new Promise((r) => server.close(r)); }
});
