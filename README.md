# Gateway Claims LAB

What the Privilege gateway (mcpgw) versions added, shown in mock only: a nested-claim gate, scope gates, AgentCore governance, on-behalf-of, an AgentCore console, and the readings of the newest images with the 2026-11-02 release features we have not measured.

Tier: Demo
Repo: https://github.com/curtismu7/gateway-claims-LAB
Catalog: D99

Catalog D99 is a real catalog id, confirmed by the owner on 2026-10-28 (not a placeholder). **Every Ping release claim here is UNVERIFIED on our tenant.** Nothing in this app calls a real gateway, identity provider, cloud account or tenant, and nothing leaves your machine.

## What is simulated

**Mock mode (the only mode).** Everything runs offline in one process. The tokens are mock-issued by this app and shown raw for education; the rule, the posture data, the modelled AgentCore gateway and the exchange checks are the lab's own models. Every host ends in `.example`, ARNs use the fake account id `000000000000`, and a netguard blocks outbound connections (fetch, sockets, DNS, UDP send and connect) with a self-test and a test that asserts zero attempts. It needs no tenant and no credentials.

**Live mode: there is none.** The header has a Mock | Live toggle on every page. Live is refused with a plain message and the page stays in mock; `GCLAB_MODE=live` stops the server and fails the doctor. A live gateway engine would be owner-run and is not built.

What it shows (tabs):

1. **Nested-claim gate** (gateway v1.261024). A mock PingFederate-style agent token carries an object-valued `act` claim (`act.sub`). A mock Privilege rule has RequiredClaims `client_id` and `act.sub` equal to the registered agent. Five scenarios: allowed; denied (wrong `act.sub`); denied (no `act`); denied (`act` emitted as the text `"{}"` instead of an object, a real trap); denied (wrong `client_id`). The raw decoded token JSON (mock-issued, labelled), the rule and a flattened dotted-path view are shown, plus a custom token and rule editor (bounded input).
2. **v1.261027 scope gates.** Three results measured live on 2026-10-27, replayed with invented values: a Cedar `forbid` on `context.token.scopes` (enforces only when the AI policy State is `Active`; an API-created policy is a candidate and only shadow-evaluates), the PingFederate `resource=` parameter that picks the agent token manager (scope alone gets `token_not_found`), and RequiredClaims on the scope claim (split per value, any-of) giving 9 / 3 tools / 403 tiers.
3. **v1.261028 AgentCore.** Read from a symbol and string diff of the image against v1.261027 (84 symbols added, 2 removed; the console swagger was byte-identical to the 2026-10-26 baseline): the gateway looks able to change AgentCore gateways and grade them. Two mock checks replay the finding wording. All INFERRED from names; nothing was run against an AWS account.
4. **v1.261029 + v1.261030** (new in this version). The registry facts for the two newer images (tags, build dates, binary sizes, symbol counts), nine changes read from the binaries (a rejected approval is not held again, alias handling, a login refusal path, Copilot as a managed coding agent, more AgentCore inventory and rate-limit helpers, workload pinning steered to the runtime, rate-limit delete and resource-policy grading, the second binary, and the finding that no symbol matches any 2026-11-02 release feature), and the **not-yet-measured list** for the 2026-11-02 release (entitlement-aware discovery, aggregate cap, OBO redeem, scope layers, hold), each with our reading of the name and what a test would need. Every reading and every release feature is UNVERIFIED. Text only: nothing on this tab runs.
5. **On-behalf-of** (deck slide 48). The gateway swaps the caller's verified token (RFC 8693) for one minted for the backend; `act` names the caller and an earlier `act` nests beneath it; 13 scenarios, each refusal says which check decided; the backend and the requested scope are editable.
6. **AgentCore console** (deck slide 45). One modelled gateway you change: disable a tool target, switch the WAF fail-open or fail-closed, close a bypass route, pin an endpoint, end a session, flip log-only to enforcing by typing the gateway name; a twelve-check scorecard computed from the state; read-only probes; six recorded walkthroughs.
7. **AgentCore posture** (shape only, field values invented).
8. **Diagram** (ReactFlow, drawn from diagram-studio/1 data loaded by name: nested-claim gate, v1.261027 scope gates, on-behalf-of; movable boxes, Simulate, speed, Reset restores box positions).
9. **Talk track** (generated from data, also in `docs/talk-track.md`), with a "Why it matters (Ping claims)" entry per release tab. Presenter mode (`P`, `Esc` leaves; Cmd/Ctrl/Alt+P is ignored) keeps the simulation banner.

Three vertical packs (retail, health, finance) change every name. Every row on the release tabs carries one tag: deck claim, console swagger name (schema only), lab reading, lab-invented, or measured (our note).

### Sources and status of claims

- The token shape, the "act must be an object, not the text `{}`" trap and the RequiredClaims `client_id` + `act.sub` pin come from a verified working configuration of the PingFederate token recipe (owner notes, verified live 2026-10-26 on gateway v1.261024). Values here are invented.
- The v1.261027 results were measured live on 2026-10-27 and replayed with invented values. Which version first showed each behaviour is UNVERIFIED.
- **UNVERIFIED:** that nested (dotted-path) claim matching is NEW in v1.261024 (inferred from a binary symbol, `workloadid.Claims.FlatClaims`); the posture panel (field names seen in the binary, values and scoring invented); every reading of v1.261028, v1.261029 and v1.261030.
- v1.261029 and v1.261030 content is relayed from owner notes dated 2026-11-01 (the public image registry, a binary symbol diff, an anonymous console swagger re-fetch, one look at the public release notes). This app did not re-run any of it. The registry and swagger facts are labelled `measured` (our note); nothing about the 2026-11-02 release is marked measured or verified.
- The flattening rules, the refusal of claim names that contain a dot (`dotted_claim_name`), the order and codes of the exchange checks, every value of the modelled gateway and the rule behind each scorecard check are this app's own (lab-invented or lab readings).
- Not modelled: the ID-JAG redeem leg, the per-caller token cache, A2A and plain HTTP apps, `ClientSecret` and `PrivateKeyPEM` (write-only, the app holds none).
- Typed text on every endpoint is masked or refused if it looks like a credential. Masking is a heuristic: a short random secret with no keyword before it can be missed, so do not type a real one.

## Run from a clone

Prerequisites: Node 26 or newer. Docker only if you use the Docker form. Mock mode works with no setup at all: no tenant, no credentials, no settings file.

```
git clone https://github.com/curtismu7/gateway-claims-LAB.git
cd gateway-claims-LAB
npm ci
npm run build
npm start
```

Open http://localhost:5150/. Or in one step: `./scripts/run.sh` (installs and builds if needed, runs the doctor, starts). The repo is internal to the owner's `curtismu7` account, so you need access to clone it.

## Settings file

All standalone apps read one settings file, `~/Development/.env`, which must be mode 600. `STANDALONE_ENV` overrides its path. This app needs none of it. It parses the file (`util.parseEnv`) and takes exactly one optional key; no other key from the file ever enters the server's environment:

- `GCLAB_MODE` (optional): `mock` (the default and the only mode that works). `live` is refused. A bare `MODE` in the shared file is ignored, because it may belong to another app.

The shared file holds no `PORT`: the app keeps its port default in code. Admin or worker credentials never belong here and this app uses none. The doctor reports whether the file exists and its mode, and never prints a value.

Optional branding: copy `customer.config.example.json` to `customer.config.json` (git-ignored, read on every request) to set brand, agent id, client id and host.

## Ports, and what to do if the port is taken

```
Ports: gateway-claims-LAB listens on 5150 (set with PORT, default 5150).
Port range for this app: 5150-5199.

If the port is taken:
1. Find what is using it:
   lsof -iTCP:5150 -sTCP:LISTEN -n -P
2. If it is an old copy of this app, stop that process: kill <PID>.
3. If it is something else, stop it, or start this app on another port:
   PORT=<other port> npm start
4. Do not use 8080, 5173, 3000, 4000, 4400, 4510, 4600-4601, 18080, 19080 or 19090.
```

Other variables: `VITE_PORT` (Vite dev server, default 5151, `npm run dev -w web`), `HOST_PORT` (Docker host port, default 5150), `GCLAB_BIND` (the container sets it to `0.0.0.0` inside; the host binds loopback only), `LAB_ALLOWED_HOSTS` (extra host names besides loopback the lab answers to, comma separated, e.g. the shared proxy domain — must point at this Mac), `SHELF_URL` (the demo shelf URL the header "Shelf" button opens; written by `scripts/setup.sh` in the family checkout). Keep all of them inside 5150-5199.

## Mock and live modes

The header has a **Mock / Live** toggle on every page, and the banner and the mode chip show the same mode (mock). Pressing Live changes nothing: it shows why Live is refused (this app has no Live engine) and the page stays in mock. "Your gateway" on the AgentCore console tab is the lab's in-memory model for your workspace, never a call to anything.

## Health, doctor and reset

```
npm run doctor   # checks node, mode, bind, port, settings file, scenarios, labels, tokens, hosts, keys, diagrams, release tabs, mock table, netguard; PORT=5159 npm run doctor to use a spare port
npm run reset    # clears the default workspace (evaluations and the modelled gateway) on a running server; the UI Reset also restores the diagram box positions
```

`GET /api/health` returns `demo-health/1`. State is per workspace: send `X-Workspace` (default `default`, `^[a-z0-9-]{1,40}$`, anything else is a 400); the store is bounded (500 workspaces, 1 hour, 20 runs each). Every mock hop carries a W3C `traceparent`.

Other commands: `npm run talk-track`, `npm run mock-table`, `npm run content-pack` regenerate the generated files (tests fail on drift). See `docs/safety.md`.

| Endpoint | |
| --- | --- |
| `GET /api/scenarios?vertical=retail\|health\|finance` | banner, mock token for each scenario, the rule, labelled facts |
| `POST /api/evaluate` | `{"scenario": "<id>"}` or a custom `{"token": {...}, "rule": {"requiredClaims": [{"path": "act.sub", "equals": "..."}]}}`; bounded input, 400 with a code on bad input; also returns `hops` and `traceId` |
| `GET /api/scope-gate`, `POST /api/scope-gate/evaluate` | the v1.261027 scenarios, with an optional scope text of your own |
| `GET /api/agentcore`, `POST /api/agentcore/evaluate` | the v1.261028 tables and checks |
| `GET /api/latest` | the v1.261029 and v1.261030 readings and the not-yet-measured list |
| `GET /api/obo`, `POST /api/obo/evaluate` | the on-behalf-of story and the 13 scenarios |
| `GET /api/agentcore-console`, `POST /api/agentcore-console/act`, `POST /api/agentcore-console/probe`, `GET /api/agentcore-console/walkthroughs` | the modelled gateway, a change, a read-only probe, the Mock tables generated from the engine |
| `GET /api/posture`, `GET /api/diagram?name=claim-gate\|scope-gate\|obo` | shape-only posture data; diagram-studio/1 data |
| `GET /api/runs`, `POST /api/reset` | this workspace's recent evaluations; clear them (also puts the console gateway back) |
| `GET /api/info` | `{mode, modes, liveRefusal, simulated}` |

The browser logs the deliberate 4xx answers of the AgentCore console (a refused change) as console messages; they are not errors.

## Docker (optional)

```
HOST_PORT=5150 docker compose up --build -d
```

The container publishes to 127.0.0.1 only (a test pins it), runs as a non-root user with a read-only file system and no capabilities. Use OrbStack, not Docker Desktop.

## Tests

```
npm test    # server (node --test), web (vitest), scripts
```

The shared checks are run by hand, because the scripts are not shipped into this repo's CI: `bash <AI-DEMO-Standalone>/scripts/check-drift.sh .`, `bash <AI-DEMO-Standalone>/scripts/check-css.sh .` and `node <demo-kit-base>/scripts/conformance.mjs . --new`. Conformance reports two advisory rule 18 warnings on purpose (the deferred SE k8s build).

On Node 26: 237 tests pass (161 server, 54 web, 22 scripts).

## Troubleshooting

- **"refusing to start" or a failing doctor line.** Run `npm run doctor`; each line says what to fix. `GCLAB_MODE=live` is refused on purpose.
- **Port in use.** See the ports section above.
- **A blank page after `npm start`.** The UI is not built: run `npm run build` (`./scripts/run.sh` does it for you).
- **Red 4xx lines in the browser console on the AgentCore console tab.** A refused change is a deliberate 4xx answer; it is not an error.
- **`npm ci` says Node is too old.** This app needs Node 26 or newer (`nvm use` reads `.nvmrc`).

## Ownership

- Owner: the Ping demo family owner (Demo tier).
- License: MIT (see `LICENSE`).
- Found a problem? Open an issue on the repo.

Not done: no SE k8s build (deferred by the owner, 2026-10-31) and no Live engine. Ping release claims shown here are UNVERIFIED on our tenant; this repository is a simulation, not a statement from Ping.
