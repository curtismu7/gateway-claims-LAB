import { fillDeep } from './cast.js';
import { ACTION_KINDS, CHECKS, CONSOLE_FACTS, CONSOLE_INTRO, CONSOLE_TITLE, ENGINE_MODES, FIELD_ROWS, MAX_AUDIT, PROBE_KINDS, WAF_MODES } from './consoleData.js';
import { CLAIM_TAGS, NO_LIVE, RELEASE_BANNER, WHY } from './releaseClaims.js';

export const buildConsoleStory = (cast) => fillDeep({
  title: CONSOLE_TITLE, intro: CONSOLE_INTRO, facts: CONSOLE_FACTS, fieldRows: FIELD_ROWS, checks: CHECKS.map(([id, name, rule]) => ({ id, name, rule })),
  actions: ACTION_KINDS, probes: PROBE_KINDS, wafModes: WAF_MODES, engineModes: ENGINE_MODES, auditCap: MAX_AUDIT,
  tags: CLAIM_TAGS, banner: RELEASE_BANNER, noLive: NO_LIVE, why: WHY.console,
}, cast);
