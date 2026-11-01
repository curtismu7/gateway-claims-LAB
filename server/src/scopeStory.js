import { fillDeep } from './cast.js';
import { AGENT_URL, GUARDED_TOOL, NEED_SCOPE, SCOPE_FACTS, SCOPE_INTRO, SCOPE_SECTIONS, SCOPE_TITLE, TIER_RULES } from './scopeData.js';
import { ScopeInputError, evaluateAtmSelection, evaluateCedarScope, evaluateTiers } from './scopeGate.js';

export const buildScopeStory = (cast) => fillDeep({ title: SCOPE_TITLE, intro: SCOPE_INTRO, sections: SCOPE_SECTIONS, facts: SCOPE_FACTS }, cast);

/** Find a scenario (with its section) by id in the cast-filled story, or null. */
export function findScopeScenario(story, id) {
  for (const section of story.sections) {
    const scenario = typeof id === 'string' ? section.scenarios.find((s) => s.id === id) : null;
    if (scenario) return { section, scenario };
  }
  return null;
}

/** Run one scenario. `scope` (optional text) replaces the scenario's scope so a visitor can try their own. Throws ScopeInputError. */
export function evaluateScopeScenario(story, id, scope, cast) {
  const found = findScopeScenario(story, id);
  if (!found) throw new ScopeInputError('unknown_scenario', 'no such scenario');
  const { section, scenario } = found;
  const useScope = scope === undefined ? scenario.scope : scope;
  const agentUrl = fillDeep(AGENT_URL, cast);
  if (section.kind === 'cedar') return { kind: 'cedar', input: { tool: scenario.tool, scope: useScope, state: scenario.state }, result: evaluateCedarScope({ tool: scenario.tool, scope: useScope, state: scenario.state, guardedTool: GUARDED_TOOL, needScope: NEED_SCOPE }) };
  if (section.kind === 'pf') return { kind: 'pf', input: { scope: useScope, resource: scenario.resource }, result: evaluateAtmSelection({ scope: useScope, resource: scenario.resource, agentUrl }) };
  return { kind: 'tiers', input: { scope: useScope }, result: evaluateTiers({ scope: useScope, rules: TIER_RULES }) };
}
