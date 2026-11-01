import { AG_FACTS, AG_INTRO, AG_SECTIONS, AG_TITLE, AG_VERSION, ANALYZE_VIEWS, MANAGE_ACTIONS } from './agentcoreData.js';
import { GovInputError, classifyGatewayCaller, evaluateRuntimeBypass } from './agentcoreGov.js';

export const buildAgentcoreStory = () => ({ title: AG_TITLE, intro: AG_INTRO, version: AG_VERSION, facts: AG_FACTS, manage: MANAGE_ACTIONS, analyze: ANALYZE_VIEWS, sections: AG_SECTIONS });

/** Run one scenario by id. Throws GovInputError. */
export function evaluateAgentcoreScenario(id) {
  for (const section of AG_SECTIONS) {
    const s = typeof id === 'string' ? section.scenarios.find((x) => x.id === id) : null;
    if (!s) continue;
    if (section.kind === 'bypass') return { kind: 'bypass', input: { statements: s.statements, gatewayOnly: s.gatewayOnly }, result: evaluateRuntimeBypass({ statements: s.statements, gatewayOnly: s.gatewayOnly }) };
    return { kind: 'caller', input: { authorizerType: s.authorizerType, targets: s.targets }, result: classifyGatewayCaller({ authorizerType: s.authorizerType, targets: s.targets }) };
  }
  throw new GovInputError('unknown_scenario', 'no such scenario');
}
