// AgentCore gateway posture: SHAPE ONLY. Field names follow what was seen in the product binary; every value here is invented.
// ARNs use the obviously fake account id 000000000000. Hosts end in .example. UNVERIFIED against the real product.

export const POSTURE_LABEL = 'Shape only - field values invented - UNVERIFIED against the real product';

export const POSTURE = {
  label: POSTURE_LABEL,
  gateways: [
    {
      name: 'orders-gateway', status: 'READY', region: 'us-east-1',
      authorizerType: 'CUSTOM_JWT',
      jwtDiscoveryUrl: 'https://idp.example/.well-known/openid-configuration',
      allowedAudiences: ['https://mcp.example/orders/mcp'],
      linkedAgents: ['agent-orders-01', 'agent-support-02'],
      policyEngine: { arn: 'arn:aws:bedrock-agentcore:us-east-1:000000000000:policy-engine/pe-demo-001', mode: 'ENFORCE' },
      scorecard: { score: 92, grade: 'A', findings: [] },
      wafFailureMode: 'FAIL_CLOSED',
    },
    {
      name: 'reports-gateway', status: 'READY', region: 'us-east-1',
      authorizerType: 'CUSTOM_JWT',
      jwtDiscoveryUrl: 'https://idp.example/.well-known/openid-configuration',
      allowedAudiences: ['https://mcp.example/reports/mcp', 'https://mcp.example/legacy/mcp'],
      linkedAgents: ['agent-reports-03'],
      policyEngine: { arn: 'arn:aws:bedrock-agentcore:us-east-1:000000000000:policy-engine/pe-demo-002', mode: 'LOG_ONLY' },
      scorecard: { score: 61, grade: 'C', findings: ['policy engine is LOG_ONLY, not enforcing', 'two allowed audiences'] },
      wafFailureMode: 'FAIL_OPEN',
    },
    {
      name: 'sandbox-gateway', status: 'UPDATING', region: 'eu-west-1',
      authorizerType: 'NONE',
      jwtDiscoveryUrl: null,
      allowedAudiences: [],
      linkedAgents: [],
      policyEngine: null,
      scorecard: { score: 20, grade: 'F', findings: ['no authorizer', 'no policy engine attached', 'no linked agents'] },
      wafFailureMode: 'FAIL_OPEN',
    },
  ],
  policyEngines: [
    { name: 'pe-demo-001', arn: 'arn:aws:bedrock-agentcore:us-east-1:000000000000:policy-engine/pe-demo-001', policyCount: 14, attachedGateways: ['orders-gateway'], kmsKeyArn: 'arn:aws:kms:us-east-1:000000000000:key/00000000-0000-0000-0000-000000000001', orphaned: false, status: 'ACTIVE' },
    { name: 'pe-demo-002', arn: 'arn:aws:bedrock-agentcore:us-east-1:000000000000:policy-engine/pe-demo-002', policyCount: 3, attachedGateways: ['reports-gateway'], kmsKeyArn: null, orphaned: false, status: 'ACTIVE' },
    { name: 'pe-demo-003', arn: 'arn:aws:bedrock-agentcore:us-east-1:000000000000:policy-engine/pe-demo-003', policyCount: 7, attachedGateways: [], kmsKeyArn: 'arn:aws:kms:us-east-1:000000000000:key/00000000-0000-0000-0000-000000000002', orphaned: true, status: 'ACTIVE' },
  ],
  account: {
    accountId: '000000000000',
    gatewayBypassPosture: { bypassPossible: true, reason: 'sandbox-gateway has no authorizer; its target is also reachable directly at https://tools.example/sandbox', affectedGateways: ['sandbox-gateway'] },
    scorecard: { score: 58, grade: 'C', gatewayCount: 3, enforcingCount: 1 },
  },
};
