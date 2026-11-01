import { useCallback, useEffect, useRef, useState } from "react";
import Json from "./Json";
import ActionButton from "./ActionButton";
import ClaimTag, { TagLegend, WhyItMatters } from "./ClaimTag";
import { consoleAct, consoleProbe, getJson } from "../api";
import { NO_LIVE } from "../releaseText";
import { visible } from "../safeText";

const word = (green) => (green ? "green" : "not green");

function Scorecard({ view, story }) {
  const sc = view.scorecard;
  return (
    <section className="panel" aria-labelledby="gc-score-h" data-testid="gc-scorecard">
      <h2 id="gc-score-h">Scorecard (computed from the state)</h2>
      <p><strong data-testid="gc-green">{sc.greenCount} of {sc.total} checks green</strong></p>
      <ul className="gc-checks">{sc.checks.map((c) => (
        <li key={c.id} data-state={c.green ? "green" : "red"}>
          <strong>{c.name}</strong> <ClaimTag tag="swagger" tags={story.tags} /> <span className="gc-checks__state">{word(c.green)}</span>
          <span className="muted"> {visible(c.why)}. Rule: {c.rule} </span><ClaimTag tag="reading" tags={story.tags} />
        </li>
      ))}</ul>
    </section>
  );
}

function Controls({ view, story, act, busy }) {
  const g = view.gateway;
  const [typed, setTyped] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const off = busy;
  return (
    <section className="panel" aria-labelledby="gc-ctl-h" data-testid="gc-controls">
      <h2 id="gc-ctl-h">Change the gateway <span className="muted">({visible(g.name)})</span></h2>
      <h3>Tool targets <ClaimTag tag="deck" tags={story.tags} /></h3>
      <ul className="gc-list">{g.targets.map((t) => (
        <li key={t.id}><code>{visible(t.name)}</code> {t.enabled ? "enabled" : "disabled"}{" "}
          <ActionButton off={off} onClick={() => act({ kind: "set-target", target: t.id, enabled: !t.enabled })}>{t.enabled ? "Disable" : "Enable"} {visible(t.name)}</ActionButton></li>
      ))}</ul>
      <h3>WAF failure mode <ClaimTag tag="deck" tags={story.tags} /></h3>
      <div className="seg" role="group" aria-label="WAF failure mode">
        {story.wafModes.map((m) => <button key={m} type="button" aria-disabled={off ? "true" : undefined} aria-pressed={g.wafFailureMode === m} onClick={() => { if (!off && g.wafFailureMode !== m) act({ kind: "set-waf", mode: m }); }}>{m}</button>)}
      </div>
      <h3>Enforcement <ClaimTag tag="deck" tags={story.tags} /></h3>
      <p>Policy engine mode: <strong data-testid="gc-engine-mode">{g.engine.mode}</strong></p>
      {g.engine.mode === "LOG_ONLY" ? (
        <>
          <label htmlFor="gc-confirm">Type the gateway name to enforce</label>
          <input id="gc-confirm" type="text" value={typed} maxLength={80} spellCheck={false} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
          <ActionButton off={off || typed === ""} onClick={() => act({ kind: "set-enforcement", mode: "ENFORCE", confirm: typed }).then((ok) => { if (ok) setTyped(""); })}>Switch to ENFORCE</ActionButton>
        </>
      ) : <ActionButton off={off} onClick={() => act({ kind: "set-enforcement", mode: "LOG_ONLY" })}>Back to LOG_ONLY</ActionButton>}
      <h3>Bypass routes <ClaimTag tag="deck" tags={story.tags} /></h3>
      <ul className="gc-list">{g.runtimes.map((r) => {
        const open = r.resourcePolicy !== "gateway-only" || r.callers.some((c) => c.direct);
        return <li key={r.id}><code>{visible(r.name)}</code> network {r.networkMode}, bypass {open ? "open" : "closed"}{" "}
          <ActionButton off={off || !open} onClick={() => act({ kind: "close-bypass", runtime: r.id })}>Close bypass on {visible(r.name)}</ActionButton></li>;
      })}</ul>
      <h3>Pinned endpoint <ClaimTag tag="deck" tags={story.tags} /></h3>
      <p>Pinned: <code data-testid="gc-pinned">{g.pinnedEndpoint ? visible(g.pinnedEndpoint) : "not pinned"}</code></p>
      <label htmlFor="gc-endpoint">Endpoint to pin (https, a .example or .invalid host)</label>
      <input id="gc-endpoint" type="text" value={endpoint} maxLength={120} spellCheck={false} autoComplete="off" onChange={(e) => setEndpoint(e.target.value)} />
      <ActionButton off={off || endpoint === ""} onClick={() => act({ kind: "pin-endpoint", endpoint })}>Pin endpoint</ActionButton>
      <h3>Sessions <ClaimTag tag="deck" tags={story.tags} /></h3>
      {g.sessions.length === 0 ? <p className="muted">No sessions are open.</p> : <ul className="gc-list">{g.sessions.map((s) => (
        <li key={s.id}><code>{visible(s.id)}</code> {visible(s.principal)}{" "}<ActionButton off={off} onClick={() => act({ kind: "end-session", session: s.id })}>End {visible(s.id)}</ActionButton></li>
      ))}</ul>}
    </section>
  );
}

function Probes({ view, probe, busy, last }) {
  const g = view.gateway;
  const [principal, setPrincipal] = useState("role-lab-unknown");
  const [target, setTarget] = useState("tg-2");
  const [runtime, setRuntime] = useState("rt-1");
  const [dp, setDp] = useState("role-lab-batch-job");
  const known = view.principals.includes(principal) ? principal : view.principals[0];
  return (
    <section className="panel" aria-labelledby="gc-probe-h" data-testid="gc-probes">
      <h2 id="gc-probe-h">Probe the gateway (read-only)</h2>
      <p className="muted">A probe changes nothing. It shows what a call would do with the switches as they are.</p>
      <h3>A call through the gateway</h3>
      <label htmlFor="gc-pr">Principal</label>
      <select id="gc-pr" value={known} onChange={(e) => setPrincipal(e.target.value)}>{view.principals.map((p) => <option key={p} value={p}>{p}</option>)}</select>
      <label htmlFor="gc-tg">Target</label>
      <select id="gc-tg" value={target} onChange={(e) => setTarget(e.target.value)}>{g.targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <ActionButton off={busy} onClick={() => probe({ kind: "gateway-call", principal: known, target })}>Send a call</ActionButton>
      <h3>The firewall is down</h3>
      <ActionButton off={busy} onClick={() => probe({ kind: "waf-outage" })}>WAF outage drill</ActionButton>
      <h3>A call straight to the runtime</h3>
      <label htmlFor="gc-rt">Runtime</label>
      <select id="gc-rt" value={runtime} onChange={(e) => setRuntime(e.target.value)}>{g.runtimes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
      <label htmlFor="gc-dp">Principal</label>
      <select id="gc-dp" value={view.principals.includes(dp) ? dp : view.principals[0]} onChange={(e) => setDp(e.target.value)}>{view.principals.map((p) => <option key={p} value={p}>{p}</option>)}</select>
      <ActionButton off={busy} onClick={() => probe({ kind: "direct-runtime", runtime, principal: view.principals.includes(dp) ? dp : view.principals[0] })}>Call the runtime directly</ActionButton>
      {last.probe && <div className={`verdict verdict--${/^(allowed|passed)/.test(last.probe.outcome) ? "allow" : "deny"}`} role="status" data-testid="gc-probe-result"><strong className="verdict__word">{visible(last.probe.outcome).toUpperCase()}</strong><p>{visible(last.probe.reason)}</p></div>}
    </section>
  );
}

function Walkthroughs({ data, story }) {
  if (!data) return null;
  return (
    <section className="panel" aria-labelledby="gc-wt-h" data-testid="gc-walkthroughs">
      <h2 id="gc-wt-h">Recorded walkthroughs (Mock tables)</h2>
      <p className="muted">{data.source}. Each step ran through the same engine as the controls above.</p>
      {data.walkthroughs.map((w) => (
        <details key={w.id}><summary>{w.title}</summary>
          <p>{w.say}</p>
          <div className="scroll"><table className="tbl"><thead><tr><th scope="col">Step</th><th scope="col">Request</th><th scope="col">Answer</th></tr></thead>
            <tbody>{w.steps.map((s, i) => <tr key={i}><td>{i + 1}</td><td><code>{visible(JSON.stringify(s.params))}</code></td><td>{s.ok ? `HTTP ${s.status}: ${visible(s.result.outcome || s.result.engineMode || s.result.wafFailureMode || s.result.pinnedEndpoint || s.result.target || s.result.runtime || s.result.ended || "done")}${s.result.lockedOut && s.result.lockedOut.length ? `, locked out: ${s.result.lockedOut.map(visible).join(", ")}` : ""}` : `HTTP ${s.status}: refused (${visible(s.code)})`}</td></tr>)}</tbody></table></div>
          <p>Final scorecard: {w.final.scorecard.greenCount} of {w.final.scorecard.total} green.</p>
        </details>
      ))}
      <p className="muted">These are tables generated from the engine, not recordings of a real gateway. <ClaimTag tag="invented" tags={story.tags} /></p>
    </section>
  );
}

export default function AgentcoreConsole({ vertical, resetSignal }) {
  const [data, setData] = useState(null); // { story, ...view }
  const [walk, setWalk] = useState(null);
  const [error, setError] = useState(null);
  const [fail, setFail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState({ act: null, probe: null });
  const seq = useRef(0);

  const load = useCallback(() => {
    const mine = ++seq.current;
    return getJson(`/api/agentcore-console?vertical=${encodeURIComponent(vertical)}`).then((j) => { if (mine === seq.current) { setData(j); setError(null); setLast({ act: null, probe: null }); setFail(null); } }, (e) => { if (mine === seq.current) setError(e.message); });
  }, [vertical]);
  useEffect(() => { load(); }, [load, resetSignal]);
  useEffect(() => { let live = true; getJson(`/api/agentcore-console/walkthroughs?vertical=${encodeURIComponent(vertical)}`).then((j) => { if (live) setWalk(j); }, () => { if (live) setWalk(null); }); return () => { live = false; }; }, [vertical]);

  // Every change goes through here: one at a time, and the answer replaces the state. A refusal keeps the state and shows the server's fixed text.
  const act = useCallback(async (payload) => {
    const mine = ++seq.current; setBusy(true); setFail(null);
    const out = await consoleAct({ ...payload, vertical }).catch(() => ({ ok: false, status: 0, body: {} }));
    if (mine !== seq.current) return false;
    setBusy(false);
    if (!out.ok) { setFail(`Refused (${out.body.error || out.status}): ${out.body.detail || "the change was not made"}`); return false; }
    const { gateway, scorecard, bypassDiff, principals, audit, auditCap } = out.body;
    setData((d) => ({ ...d, gateway, scorecard, bypassDiff, principals, audit, auditCap }));
    setLast((l) => ({ ...l, act: { kind: out.body.kind, ...out.body } }));
    return true;
  }, [vertical]);
  const probe = useCallback(async (payload) => {
    setBusy(true); setFail(null);
    const out = await consoleProbe({ ...payload, vertical }).catch(() => ({ ok: false, status: 0, body: {} }));
    setBusy(false);
    if (!out.ok) { setFail(`Refused (${out.body.error || out.status}): ${out.body.detail || "the probe was not run"}`); return; }
    setLast((l) => ({ ...l, probe: out.body }));
  }, [vertical]);

  if (error) return <p className="field-error" role="alert">Could not load the AgentCore console ({error}).</p>;
  if (!data) return <p className="muted">Loading...</p>;
  const { story } = data;
  const a = last.act;
  return (
    <div className="gate release-tab" data-testid="gc-tab">
      <section className="panel">
        <h2>{story.title}</h2>
        <p>{story.intro}</p>
        <p className="muted" data-testid="gc-no-live">{story.noLive || NO_LIVE}</p>
        <p className="muted">Your changes live in memory for this workspace only. Reset puts the gateway back as it was. {data.audit.length} of {story.auditCap} changes used.</p>
        <TagLegend tags={story.tags} />
      </section>
      <Scorecard view={data} story={story} />
      <Controls view={data} story={story} act={act} busy={busy} />
      <Probes view={data} probe={probe} busy={busy} last={last} />
      <section className="panel" aria-labelledby="gc-last-h">
        <h2 id="gc-last-h">What your last change did</h2>
        {fail && <p className="field-error" role="alert" data-testid="gc-fail">{fail}</p>}
        {a ? (
          <div data-testid="gc-last">
            <p><strong>{visible(a.kind)}</strong>: scorecard {a.scorecardChange.before} to {a.scorecardChange.after} of {a.scorecardChange.total}.</p>
            {a.lockedOut && <p data-testid="gc-locked-out">Locked out by closing the route: {a.lockedOut.length ? a.lockedOut.map(visible).join(", ") : "nobody"}. Still reaching it through the gateway: {a.stillMediated.length ? a.stillMediated.map(visible).join(", ") : "nobody"}.</p>}
            <details><summary>Mock hop (illustration, never sent)</summary><Json value={a.hops.map((h) => `${h.request}\n--> ${h.response}`).join("\n\n")} label="Hop" /></details>
          </div>
        ) : <p className="muted">Nothing changed yet.</p>}
        <h3>Audit trail</h3>
        {data.audit.length === 0 ? <p className="muted">No changes yet.</p> : (
          <ol className="gc-list" data-testid="gc-audit">{data.audit.map((e) => <li key={e.n}><code>{visible(e.kind)}</code>: {e.scorecardBefore} to {e.scorecardAfter} green</li>)}</ol>
        )}
      </section>
      <Walkthroughs data={walk} story={story} />
      <section className="panel" aria-labelledby="gc-fields-h">
        <h2 id="gc-fields-h">Where each part comes from</h2>
        <div className="scroll"><table className="tbl" data-testid="gc-field-rows">
          <thead><tr><th scope="col">Part</th><th scope="col">How well we know it</th></tr></thead>
          <tbody>{story.fieldRows.map((r) => <tr key={r.field}><th scope="row">{r.field}</th><td><ClaimTag tag={r.tag} tags={story.tags} /></td></tr>)}</tbody>
        </table></div>
      </section>
      <section className="panel" aria-labelledby="gc-facts-h">
        <h2 id="gc-facts-h">What we know, and how well</h2>
        <ul className="facts" data-testid="gc-facts">{story.facts.map((f) => <li key={f.id}><ClaimTag tag={f.tag} tags={story.tags} /> {f.text} <span className="muted">Source: {f.source}.</span></li>)}</ul>
      </section>
      <WhyItMatters why={story.why} />
    </div>
  );
}
