# Changelog

## Unreleased
- Diagram: arrow labels are drawn in a layer above the boxes and placed so none overlaps another label or sits on a box (the walked arrow's label turns bold and coloured and is raised); click a box and it expands in place with its details below its title: its kind, reach (boxes upstream and downstream), and the arrows in and out (each opens that box), on a card with colour that means something (blue where it is, green what it sends to, amber what reaches it). Click again, Close, the empty canvas or Reset collapses it; Copy link and `?box=<id>` open the page with a box expanded. The shared `diagram-kit` (vendored into `web/src/diagram-kit/`, pinned) does the work.

- Verification mark in the header: the shared `VerifyMark` (vendored byte for byte from AI-DEMO-Standalone `shared/verify-mark`, pinned by `web/src/components/VerifyMark.sha256` and `VerifyMark.css.sha256`) shows this lab's own Verified / In progress mark from the demo shelf, inside the top menu beside the Shelf link. It reads the same `GET /api/shelf` call the Shelf link makes, so it shows through the lab-proxy (where that call reaches the shelf) and nothing when the lab is opened on its own port, when the shelf has no mark for it, or when the shelf is unreachable. Tests: a pin test and a header test (web only).

## Users and groups from claims: review fixes (2026-11-15)

- A custom run and a scenario run no longer overwrite each other: whichever request was sent last wins, and an answer that arrives late for an older request is dropped (it could replace the custom run you had just made).
- After a custom run, "End-user setting for this run" shows the setting that run used, not the scenario's own.
- In the Subject pattern `?` is one whole character, so an emoji is matched by one `?`, never by half of it. (How the console counts characters is not measured; this is the lab's reading.)
- Tests: 1 server and 3 web tests added (285 in all); each fix was checked by removing it and seeing a test fail.

## Users and groups from claims (2026-11-15)

- New tab "Users and groups from claims": a mock-only teaching tab that shows Privilege taking the user and the groups from claims in a token, beside the lab that registers people in PingOne. Twelve scenarios in three steps run in order: the identity gate (issuer, signing key, audience, lifetime, Subject with `*` and `?`, required claims by dotted path; traps: `act` as the text `"{}"`, a required claim typed as the audience, an unpublished signing key), the end user (Opaque or Resolved, the console refusal for a pinned Subject), and claim-conditioned grant tiers (all tools, fewer, or a 403). Comparison panel and the Cedar point. Simulation: every value invented, no cryptography.
- Engine `server/src/claimsUsers.js` (pure, bounded; reuses `flattenClaims` and `evaluateClaims`), data `claimsUsersData.js`, story `claimsUsersStory.js`, routes `claimsUsersRoutes.js` (`GET /api/claims-users`, `POST /api/claims-users/evaluate`), web `ClaimsUsers.jsx`. `PATH_RE` in `claims.js` is now exported.
- Tags: measured only where the notes measured it; the owner's statement of 2026-11-15 that any claim can name the user or groups is UNVERIFIED, with its own chip. The banner says it is a simulation, also in presenter mode.
- Typed text: a credential-looking key id, Subject or End-user claim is refused (400); a typed token is not echoed and every typed value shown back is masked. The masking sweeps cover the new endpoints.
- Generated: `docs/talk-track.md` and `content-pack.json` (a card and two glossary terms); the doctor checks the scenarios in every vertical.
- Tests: 29 server, 9 web and 2 script tests added (281 in all). Five of the server tests pin cases an independent review found unpinned: Opaque never looks anyone up (even a person in the directory), exact audience, a missing `iat`, an anchored Subject through the engine, and an exact-case Resolved lookup.

## Moved to the -LAB standard (2026-11-01)

- New clean repo `gateway-claims-LAB` (one commit, no old history), taken from the main branch of the older private repo. The older branch `feat/h2-2026-release-updates` held no unmerged work (its content was already on main).
- New tab "v1.261029 + v1.261030": registry facts, nine readings of the two newer images and the five 2026-11-02 release features not yet measured. All UNVERIFIED, text only (`latestData.js`, `GET /api/latest`).
- Standard: the shared stylesheet is vendored and the app CSS is on tokens; a Mock | Live toggle in the header on every page (Live is refused with a message, there is no Live engine); settings from the one shared file with the single key `GCLAB_MODE`; netguard also guards UDP connect; run buttons use aria-disabled and keep focus; presenter mode ignores modifier keys; the diagram uses the shared diagram controls pattern.
- Removed: the SE k8s manifests and deploy script, the hosted banner and switches, the per-app `.env` loader and `.env.example`, the old diagram components and theme tokens file.
- CI runs on GitHub-hosted runners with the forbidden-strings and gitleaks jobs; Node 26 only.

## Credential masking on the original endpoints (2026-11-01)

- Every JSON answer of every endpoint now passes through the response mask (`server/src/app.js`, `mask.js`), not only the release tabs.
- `POST /api/evaluate` with a custom token and rule: claim names and values, and the checks that quote them, are masked when credential-shaped (`maskTypedDeep`); ordinary input comes back exactly as before. The messages no longer name a claim key (`a value is longer than 512`), and a value quoted inside a check message is masked before it is quoted.
- `POST /api/scope-gate/evaluate`: a scope that looks like a credential is refused with `400 credential_like` (after the size limits, which still answer `too_long` / `too_many`); ordinary scopes are unchanged.
- Detectors: the JSON-key form also matches backslash-escaped quotes. Two fixed lab texts were reworded so the mask leaves them alone (the claim gate's token label, one diagram step).
- The server tests run with `--test-concurrency=2`: with many test files each starting a server, a machine under heavy load hit the HTTP client's 10 s connect timeout.
- Tests: `masking-existing.test.js` sweeps every field, name, query, path, header and unknown key of every original endpoint; ordinary input and every fixed lab text are proven unchanged.

## H2 2026 release updates (2026-10-31)

- New tabs "On-behalf-of" (slide 48) and "AgentCore console" (slide 45): Ping release claims, UNVERIFIED on our tenant, each claim tagged per field (deck claim, console swagger name, lab reading, lab-invented, measured). Mock only (this app has no Live engine). Pure engines `server/src/obo.js` and `consoleLab.js`, routes in `releaseRoutes.js`, Mock walkthrough tables generated from the engine (`npm run mock-table`, drift and HTTP-parity tests), a third diagram (`obo`), talk-track entries with "Why it matters (Ping claims)", content-pack cards and terms.
- Render guard: an error boundary around every tab (keyed by tab and vertical) so a tab that cannot be drawn never blanks the page.
- Typed text on the new endpoints: credential-looking text is refused and never echoed (NFKC, hidden characters deleted, percent-decoding three rounds, JSON keys, glued assignments, mask before truncation); fixed JSON 404 and error handler for every path and method; credential-looking workspace ids are refused (400).
- Rename check: the Federated Identity rename does not apply here (no "Non-Human Identity" text in this repo).

## v1.261028 AgentCore governance (2026-10-28)

- New tab "v1.261028 AgentCore": capability tables read from the binary diff, a runtime-bypass check and a gateway-caller-class check (pure engines in `server/src/agentcoreGov.js`, data in `agentcoreData.js`), `GET /api/agentcore`, `POST /api/agentcore/evaluate`, talk-track entry, 6 server tests and 3 web tests. Everything INFERRED; the real rules were not observed.

## v1.261027 scope gates (2026-10-28)

- New tab "v1.261027 scope gates": Cedar scope gate (Active vs candidate), PingFederate resource parameter trap, RequiredClaims scope tiers. Pure engines in `server/src/scopeGate.js`, data in `scopeData.js`, `GET /api/scope-gate`, `POST /api/scope-gate/evaluate` (scenario id plus optional own scope, bounded), a second diagram-studio/1 diagram (`scope-gate`), talk-track entry, 6 server tests and 4 web tests.

## 0.1.0 (unreleased)
- Step 1 (core, server and data), scaffolded from a sibling demo scaffold: pure `evaluateClaims` (nested dotted-path matching, flatten, bounded input), five claim-gate scenarios as `{{token}}` data in three vertical packs, AgentCore gateway posture mock (shape only), claim-gate diagram as diagram-studio/1 data, workspace-scoped evaluations and Reset, doctor, content pack, k8s manifests (not deployed). The web UI is step 2 (a placeholder page for now).
- Ports 5150-5199.
- Step 2: web UI (claim gate, posture, diagram, talk track, presenter mode), W3C traceparent on every mock hop, talk track as data, claim-gate diagram spacing.
