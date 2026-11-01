# Talk track

<!-- Generated from server/src/claimsData.js by `npm run talk-track`. Do not edit by hand. -->

## Say first

Everything here is simulated. The token, the rule and the posture data are invented by this app; only their shape follows what we verified.

## Nested-claim gate

The agent gets a token from PingFederate. In the token, act is an object: {"sub": "orders-agent"}. The P1 Privilege Agent App has a rule with two required claims, client_id and act.sub, both equal to the registered agent. Walk the five scenarios: allowed, wrong act.sub, no act, act as the text "{}", wrong client_id.

## The "{}" trap

The PingFederate mapping produced the string "{}" instead of an object, so act.sub does not exist. The fix is the mapping expression (it must produce an object), not the rule.

## Gateway v1.261027: scope gates

Three measured results, replayed with invented values. A Cedar rule blocks SearchIndexTool unless the token carries opensearch:search, but only once the policy State is Active: an API-created policy is a candidate and only shadow-evaluates. Ask PingFederate for the token with resource=<agent app URL>, or a different token manager answers and the gateway cannot find it. And RequiredClaims on the scope claim turns one agent into tiers: admin sees nine tools, read sees three, neither is 403.

## Gateway v1.261028: AgentCore governance

Gateway image v1.261028 (since followed by v1.261029 and v1.261030, see their entry) gained a large block of AgentCore code: ways to change a gateway (enforcement mode, rate limits, policy engines, Cedar policies, runtime gateway-only) and ways to grade it (who can call it, whether a runtime can be reached around the gateway). We read this from the binary; the console API did not change, and nothing was run against a real AgentCore account. The two checks here are our mock readings of the finding wording.

## Gateway v1.261029 and v1.261030, and what we have not measured

Two newer gateway images exist since v1.261028, and the owner's gateway is on the newest. Ping published no release notes for them, so every change on this tab is our reading of a name in the binary, UNVERIFIED. The console API did not change. The 2026-11-02 release features (entitlement-aware discovery, aggregate cap, OBO redeem, scope layers, hold) are Ping claims we have not measured: each row says what a test would need.

## On-behalf-of (Ping release claim)

Ping release claim, UNVERIFIED on our tenant. The deck says the gateway swaps the caller's verified token for one minted for the downstream MCP server (RFC 8693), so the backend validates a token issued to it instead of trusting a shared service account, and the act claim keeps who called. Here that is the lab's own model: pick a scenario and watch which check decides, then change the backend or the requested scope. Every row says whether it is a deck claim, a swagger field name, our reading, our invention or something we measured.

## Why it matters: Intent, Purpose, Behaviour (slide 48; on-behalf-of is one of its six rows) (Ping claims)

Per Ping's deck (slide 48), UNVERIFIED on our tenant. Challenge: A tool name and arguments cannot say what was asked for, whether the agent was ever meant to do it, or whether it normally behaves this way. Policy built on the request alone cannot tell misuse from an agent doing its job. Technical value: Three separable signals: deterministic intent patterns and purpose declarations refuse hard; learned behaviour baselines drive alerts and approval. On-behalf-of gives the backend a token issued to it, with the original caller named in act. Business value: The enforceable declaration "this agent exists to reconcile invoices" unblocks unattended agents in processes that could not otherwise approve them.

## AgentCore gateway governance (Ping release claim)

Ping release claim, UNVERIFIED on our tenant. The deck says that on Bedrock AgentCore the gateway is an object of policy: you can disable a tool target, switch the WAF between fail-open and fail-closed, close a bypass route, pin an endpoint, end a session, and flip enforcement from log-only to enforcing, the last behind a typed confirmation. Here is a model of one gateway you can change. Try the log-only probe, flip to enforcing by typing the name, and probe again; then close the bypass route and see who it locks out. The scorecard is computed from the state, and each row says whether it is a deck claim, a swagger name, our reading or our invention.

## Why it matters: AI Platform Agents (slide 45; "Governing the gateway itself" is one of its rows) (Ping claims)

Per Ping's deck (slide 45), UNVERIFIED on our tenant. Challenge: Agents created in cloud consoles sit outside identity processes: nobody inventoried them and nobody knows what they reach. Each over-privileged agent is a silent breach path that no current review covers. Technical value: Cross-cloud inventory, permission review, 46-finding risk scores and one console to fix or delete. Business value: Cuts agent-audit effort sharply and closes exfiltration paths before they are exploited.

## What we do not claim

That nested matching is NEW in gateway v1.261024 is our inference from binary symbols. It is UNVERIFIED. Which of the scope behaviours first appeared in v1.261027 is not established either, and the v1.261028 AgentCore behaviour is read from names in the binary, never run.

## AgentCore gateway posture

Shape only - field values invented - UNVERIFIED against the real product. These are the questions a posture view answers; we do not claim the real product answers them this way.

## Close

Reset clears your workspace. Nothing was sent anywhere.

## The five scenarios

1. **Allowed: act.sub matches.** client_id and act.sub both equal the registered agent, so the rule passes.
2. **Denied: act.sub is a different agent.** The token is valid and signed, but it acts for another agent. The nested claim decides, not the signature.
3. **Denied: no act claim at all.** Without act there is no act.sub to match. A token that proves only a client is not enough for this rule.
4. **Denied: act emitted as the text "{}".** The real trap: the PingFederate mapping produced the text "{}" instead of an object, so act.sub does not exist. Fix the mapping expression, not the rule.
5. **Denied: wrong client_id.** act.sub is right but client_id names another client. Both required claims must match.

## The on-behalf-of scenarios (Ping release claim, UNVERIFIED on our tenant)

1. **Allowed: a token minted for the backend.** The caller token was issued to the gateway, so the gateway exchanges it. The backend gets a new token. Its aud is the backend, its sub is still the user, and act names the agent that called.
2. **Allowed: the act claim chain grows.** The caller token already carries an act (a planner agent acted first). The exchange puts the current caller outermost and nests the earlier one beneath it, one level per hop (RFC 8693 section 4.1).
3. **Denied: the caller token was not issued to the gateway.** The gateway only exchanges tokens issued to it. A token minted for some other service is refused before the issuer is asked.
4. **Denied: the caller token has expired.** The lab clock is past exp. An expired token is not exchanged.
5. **Denied: a claim was changed after signing.** The scope claim was widened after the token was signed, so the signature the lab recomputes does not match. The lab's signature is a keyed hash, a stand-in for a real one.
6. **Denied: the caller token came from an issuer the gateway does not trust.** Only the configured issuer's tokens are exchanged.
7. **Denied: the caller token names no user.** On behalf of whom? Without a sub there is nobody to carry to the backend, so the lab refuses.
8. **Denied: the same caller token is presented twice.** The first exchange works; the second use of the same jti is refused. Replay protection is a lab-invented check, not a claim about the real gateway.
9. **Denied: the act chain is already as deep as the lab allows.** The exchange would add one more level. The lab caps the chain at three actors.
10. **Denied: no Resource is configured.** Resource becomes the exchanged token's aud (the audience the backend validates). Left blank there is no audience to mint for.
11. **Denied: the Resource is not a backend the gateway knows.** A resource indicator with no exchange config behind it is refused.
12. **Denied: the exchange asks for more scope than the caller holds.** An exchange may narrow what the caller holds, never widen it. The caller holds orders:read and orders:write; admin:all is not among them.
13. **Denied: the scope is not one this backend offers.** The caller holds orders:write, but the reports backend offers only reports:read, so a token for it cannot carry orders:write.

## The AgentCore console walkthroughs (Ping release claim, UNVERIFIED on our tenant)

1. **Harden the gateway, one switch at a time.** Start at the seeded gateway and use the switches the deck names. The scorecard rises with each. It stops short of twelve because this model has no switch for network mode.
2. **Enforcing needs the typed name.** Flipping from log-only to enforcing is refused without the gateway's name, refused with a wrong one, and nothing changes until the right text is typed.
3. **Log-only logs, enforcing blocks.** A principal no policy allows is let through while the engine only logs, and refused once it enforces.
4. **Closing a bypass can lock a caller out.** The batch job reaches the runtime only directly, with no gateway allow. Closing the route reports it as locked out, and its direct call is then refused.
5. **WAF fail-open versus fail-closed.** When the firewall is down, a fail-open gateway lets calls through unscreened and a fail-closed one refuses them.
6. **Disable a tool target.** A disabled target answers no calls, even to a principal a policy allows; enabling it again is a state change, and disabling twice is refused.

## The 2026-11-02 release features we have not measured (Ping claims, UNVERIFIED on our tenant)

1. **Entitlement-aware discovery.** tools/list shows a caller only the tools its entitlements allow (our reading of the name). A test needs: Two agent keys with different entitlements, the same tools/list through the gateway with each, and a comparison of the two lists. Today one key returns 6 tools on v1.261030. Creating the second, lower-entitled key is a tenant write.
2. **Aggregate cap.** A cap counted across calls together, not per key (our reading of the name). A test needs: A low-cap test key and a small burst of calls until the first refusal, with the refusal and the gateway log recorded. Keep the burst small; do not load the live gateway.
3. **OBO redeem.** An agent redeems a delegated (on-behalf-of) token for a call made for a user (our reading of the name). A test needs: A PingFederate token that acts for a user and an agent app set up to accept it. Then redeem it and compare the sub and act claims the backend sees against the nested-claim token on the first tab.
4. **Scope layers.** Tools layered by token scope. We already measured scope tiers with RequiredClaims on v1.261024 (the v1.261027 tab); whether this is the same thing or something new is unknown. A test needs: Repeat the scope-tier run on the new release and compare the tool counts. The baseline is a token with opensearch:admin: 9 tools; a token with opensearch:read: 3 tools; a token with neither (openid alone): 403.
5. **Hold.** A tool call waits for a human to approve it. The v1.261027 diff already shows an approval action and v1.261029 remembers rejections. A test needs: An AI policy that returns the approval action, a call that gets held, then one approve and one reject, and a retry of the rejected call to see whether it is held again or refused.
