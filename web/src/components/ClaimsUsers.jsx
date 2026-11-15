import { useCallback, useEffect, useRef, useState } from "react";
import Json from "./Json";
import ActionButton from "./ActionButton";
import ClaimTag, { TagLegend } from "./ClaimTag";
import { FlatTable, Hops } from "./ClaimGate";
import { evaluateClaimsUsers, getJson } from "../api";
import { visible } from "../safeText";

const CHECK_WORD = { true: "passed", false: "refused", null: "not reached" };
const STATE = { true: "green", false: "red" };

function Verdict({ run, story }) {
  const allow = run.decision === "allow";
  return (
    <div className={`verdict verdict--${allow ? "allow" : "deny"}`} data-testid="cu-verdict" role="status">
      <strong className="verdict__word">{allow ? "ALLOW" : "DENY"}</strong>{" "}
      <span>{run.status === null ? "the console refused to save the identity, so nothing was called" : `HTTP ${run.status}`}{run.code ? `, ${visible(run.code)}` : ""}</span>
      {run.expected && <span> (expected {run.expected.toUpperCase()})</span>}
      <p data-testid="cu-tool-count">{allow ? `${run.toolCount} of ${story.tools.length} tools granted.` : "No tool is granted."}</p>
      <ol className="gc-checks" data-testid="cu-checks">
        {run.checks.map((c) => (
          <li key={c.id} data-state={STATE[String(c.ok)]} data-check={c.id}>
            <span className="gc-checks__state">{c.label}: {CHECK_WORD[String(c.ok)]}.</span> <ClaimTag tag={c.tag} tags={story.tags} /> {visible(c.detail)}
          </li>
        ))}
      </ol>
      {run.log.length > 0 && (
        <>
          <p className="muted">What the gateway log would say (mock):</p>
          <ul className="verdict__reasons" data-testid="cu-log">{run.log.map((l, i) => <li key={i}><code>{visible(l)}</code></li>)}</ul>
        </>
      )}
    </div>
  );
}

function EndUser({ run, tags }) {
  const e = run.endUser;
  if (!e) return <p className="muted" data-testid="cu-enduser">Not reached: an earlier step refused first.</p>;
  const lookup = e.resolved === null ? "No: Opaque never looks the person up" : e.resolved ? "Yes: found in the mock directory" : "Yes: not found";
  const groups = e.directoryGroups === null ? "none: there is no Privilege user" : e.directoryGroups.length ? e.directoryGroups.map(visible).join(", ") : "none";
  return (
    <dl className="kv" data-testid="cu-enduser">
      <dt>End-user setting</dt><dd>{e.mode === "resolved" ? "Resolved" : "Opaque"}, End-user claim <code>{visible(e.claim)}</code></dd>
      <dt>Person named by the token</dt><dd><code>{visible(e.value)}</code></dd>
      <dt>Looked up</dt><dd>{lookup}</dd>
      <dt>Directory groups (not from the token)</dt><dd>{groups}</dd>
      <dt>Cedar group rules (principal in Group)</dt><dd>{e.cedarGroupRulesApply ? "apply to this person" : "do not apply: there is no Privilege user to be in a group"} <ClaimTag tag="reading" tags={tags} /></dd>
    </dl>
  );
}

function Tiers({ story, run }) {
  const byId = run && run.tiers ? Object.fromEntries(run.tiers.map((t) => [t.id, t])) : {};
  const granted = new Set(run ? run.tools : []);
  return (
    <>
      <div className="scroll">
        <table className="tbl" data-testid="cu-tiers">
          <thead><tr><th scope="col">Tier</th><th scope="col">Claim by path: any one of</th><th scope="col">In this token</th><th scope="col">Result</th><th scope="col">Tools it grants</th></tr></thead>
          <tbody>
            {story.tiers.map((t) => {
              const r = byId[t.id];
              return (
                <tr key={t.id} data-state={r ? (r.ok ? "match" : "no-match") : "not-run"}>
                  <th scope="row">{t.label}</th>
                  <td>{t.claims.map((c) => <div key={c.path}><code>{c.path}</code>: {c.anyOf.join(" or ")}</div>)}</td>
                  <td>{r ? r.claims.map((c) => <div key={c.path}><code>{visible(c.path)}</code>: {c.found.length ? c.found.map(visible).join(", ") : "(not in the token)"}</div>) : "not evaluated"}</td>
                  <td>{r ? (r.ok ? "matched" : "no match") : "not reached"}</td>
                  <td>{t.tools.length === story.tools.length ? `all ${t.tools.length}` : t.tools.join(", ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">Tools in this run (granted ones have a green edge):</p>
      <p data-testid="cu-tools">{story.tools.map((n) => <span key={n} className={granted.has(n) ? "tag tag--ok" : "tag"} data-granted={granted.has(n)}>{n}</span>)}</p>
    </>
  );
}

function CustomEditor({ story, scenario, onRun, vertical, resetSignal }) {
  const initial = () => ({
    claims: JSON.stringify(scenario.token.claims, null, 2), kid: scenario.token.kid,
    subject: scenario.identity?.subject ?? story.defaults.subject, endUserClaim: scenario.identity?.endUser?.claim ?? story.defaults.endUserClaim, endUserMode: scenario.identity?.endUser?.mode ?? story.defaults.endUserMode,
  });
  const [f, setF] = useState(initial);
  const [error, setError] = useState(null);
  useEffect(() => { setF(initial()); setError(null); }, [scenario.id, resetSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const run = async () => {
    setError(null);
    let token;
    try { token = JSON.parse(f.claims); } catch { return setError("Token claims are not valid JSON."); }
    const res = await evaluateClaimsUsers({ vertical, token, kid: f.kid, subject: f.subject, endUserClaim: f.endUserClaim, endUserMode: f.endUserMode }).catch(() => ({ ok: false, status: 0, body: {} }));
    if (!res.ok) return setError(`${res.body.error || `HTTP ${res.status}`}${res.body.detail ? `: ${res.body.detail}` : ""}`);
    onRun(res.body);
  };
  return (
    <section className="panel" aria-labelledby="cu-custom-h" data-testid="cu-custom">
      <h2 id="cu-custom-h">Try your own token</h2>
      <p className="muted">Edit the claims or three of the identity&apos;s settings and evaluate. Input is bounded: 8 KB, depth 6, 200 claims, {story.limits.subject} characters for the text boxes. RequiredClaims, Audience and the tiers stay as shown. Typed text that looks like a credential is refused or masked.</p>
      <label htmlFor="cu-claims">Token claims (JSON)</label>
      <textarea id="cu-claims" rows={12} value={f.claims} onChange={set("claims")} spellCheck={false} />
      <label htmlFor="cu-kid">Signing key id in the token header (the issuer publishes: {story.identity.publishedKeys.join(", ")})</label>
      <input id="cu-kid" type="text" value={f.kid} maxLength={story.limits.kid} spellCheck={false} autoComplete="off" onChange={set("kid")} />
      <label htmlFor="cu-subject">Subject (use * and ? as wildcards)</label>
      <input id="cu-subject" type="text" value={f.subject} maxLength={story.limits.subject} spellCheck={false} autoComplete="off" onChange={set("subject")} />
      <label htmlFor="cu-claim">End-user claim (a dotted claim path, default sub)</label>
      <input id="cu-claim" type="text" value={f.endUserClaim} maxLength={64} spellCheck={false} autoComplete="off" onChange={set("endUserClaim")} />
      <label htmlFor="cu-mode">End user</label>
      <select id="cu-mode" value={f.endUserMode} onChange={set("endUserMode")}>
        <option value="opaque">Opaque (record the person, never look them up)</option>
        <option value="resolved">Resolved (the person must be a Privilege user)</option>
      </select>
      <p><ActionButton onClick={run}>Evaluate custom</ActionButton></p>
      {error && <p className="field-error" role="alert" data-testid="cu-custom-error">{error}</p>}
    </section>
  );
}

export default function ClaimsUsers({ vertical, resetSignal }) {
  const [story, setStory] = useState(null);
  const [error, setError] = useState(null);
  const [id, setId] = useState(null);
  const [mode, setMode] = useState(""); // "" = the scenario's own setting
  const [run, setRun] = useState(null);
  const [fail, setFail] = useState(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    let live = true;
    getJson(`/api/claims-users?vertical=${encodeURIComponent(vertical)}`).then((j) => { if (live) { setStory(j); setId(j.sections[0].scenarios[0].id); setError(null); } }, (e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [vertical]);

  const exec = useCallback(async (sid, m) => {
    const mine = ++seq.current; setBusy(true); setFail(null);
    const out = await evaluateClaimsUsers({ scenario: sid, vertical, ...(m ? { endUserMode: m } : {}) }).catch(() => ({ ok: false, status: 0, body: {} }));
    if (mine !== seq.current) return; // a newer request is in flight: this answer is stale
    setBusy(false);
    if (out.ok) setRun(out.body); else { setRun(null); setFail(`Could not evaluate (${out.body.error || out.status}${out.body.detail ? `: ${out.body.detail}` : ""}).`); }
  }, [vertical]);

  useEffect(() => { if (id) { setMode(""); exec(id, ""); } }, [id, resetSignal, exec]);

  if (error) return <p className="field-error" role="alert">Could not load the users and groups from claims tab ({error}).</p>;
  if (!story || !id) return <p className="muted">Loading...</p>;
  const all = story.sections.flatMap((s) => s.scenarios);
  const sc = all.find((s) => s.id === id) || all[0];
  return (
    <div className="gate gate--one release-tab" data-testid="cu-tab">
      <section className="panel">
        <h2>{story.title}</h2>
        <p>{story.intro}</p>
        <p className="muted" data-testid="cu-no-live">{story.noLive}</p>
        <TagLegend tags={story.tags} />
      </section>
      <section className="panel" aria-labelledby="cu-run-h">
        <h2 id="cu-run-h">Run a token</h2>
        {story.sections.map((s) => (
          <div key={s.id} data-testid={`cu-section-${s.id}`}>
            <h3>{s.title}</h3>
            <p className="muted">{s.intro}</p>
            <div className="seg" role="group" aria-label={s.title}>
              {s.scenarios.map((x) => <button key={x.id} type="button" aria-pressed={x.id === id} onClick={() => setId(x.id)}>{x.title}</button>)}
            </div>
          </div>
        ))}
        <p><ClaimTag tag={sc.evidence} tags={story.tags} /> <span className="lesson" data-testid="cu-lesson">{sc.lesson}</span></p>
        <label htmlFor="cu-run-mode">End-user setting for this run</label>
        <select id="cu-run-mode" value={mode} onChange={(e) => { setMode(e.target.value); exec(id, e.target.value); }}>
          <option value="">The scenario&apos;s own</option>
          <option value="opaque">Opaque</option>
          <option value="resolved">Resolved</option>
        </select>
        {fail && <p className="field-error" role="alert" data-testid="cu-fail">{fail}</p>}
        {busy && !run && <p className="muted">Running...</p>}
        {run && <Verdict run={run} story={story} />}
      </section>
      {run && (
        <>
          <section className="panel" aria-labelledby="cu-user-h">
            <h2 id="cu-user-h">The end user</h2>
            <EndUser run={run} tags={story.tags} />
          </section>
          <section className="panel" aria-labelledby="cu-tier-h">
            <h2 id="cu-tier-h">The grant tiers</h2>
            <p className="muted">Each tier names a claim by path. Any one listed value matches; every claim in a tier must match; a tier grants only its own tools. <ClaimTag tag="unverified" tags={story.tags} /></p>
            <Tiers story={story} run={run} />
          </section>
          <section className="panel" aria-labelledby="cu-tok-h">
            <h2 id="cu-tok-h">The token (MOCK-ISSUED)</h2>
            <p className="muted">Mock-issued by this lab and shown raw, for education. No real signature exists: the signing key check is a key id in a list.</p>
            {run.token ? (
              <>
                <h3>Header</h3><Json value={run.token.header} label="Token header" hot={["kid"]} />
                <h3>Payload (claims)</h3><Json value={run.token.claims} label="Token payload" testId="cu-claims-json" hot={["groups", "realm_access"]} />
                <h3>Signature</h3><Json value={run.token.signature} label="Token signature" />
              </>
            ) : <p className="muted" data-testid="cu-typed-note">A token you typed is not repeated here: the table below shows each claim as the server read it, with any credential-looking value masked.</p>}
            <FlatTable flat={run.flat} />
          </section>
          <section className="panel" aria-labelledby="cu-hops-h">
            <h2 id="cu-hops-h">Mock hops</h2>
            <Hops hops={run.hops} traceId={run.traceId} />
          </section>
        </>
      )}
      <section className="panel" aria-labelledby="cu-id-h">
        <h2 id="cu-id-h">The identity in this run (a mock Federated Identity)</h2>
        <p className="muted">Privilege calls it a Federated Identity; the console API object is still NonHumanIdentity. Field names are the console swagger&apos;s (schema only); every value is invented.</p>
        <div className="scroll">
          <table className="tbl" data-testid="cu-identity">
            <thead><tr><th scope="col">Field</th><th scope="col">Value</th><th scope="col">How well we know it</th></tr></thead>
            <tbody>
              {(run ? run.identityView : story.identityRows).map((r) => (
                <tr key={r.id} data-changed={r.changed ? "true" : undefined}>
                  <th scope="row"><code>{r.field}</code></th>
                  <td><code>{visible(r.value)}</code>{r.changed && <> <span className="tag tag--warn">changed in this run</span></>}<br /><span className="muted">{r.note}</span></td>
                  <td><ClaimTag tag={r.tag} tags={story.tags} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>The mock Privilege directory (what Resolved looks up)</h3>
        <div className="scroll">
          <table className="tbl" data-testid="cu-directory">
            <thead><tr><th scope="col">User</th><th scope="col">Directory groups</th></tr></thead>
            <tbody>{story.directory.map((u) => <tr key={u.user}><th scope="row"><code>{u.user}</code></th><td>{u.groups.length ? u.groups.join(", ") : "none"}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className="panel" aria-labelledby="cu-routes-h" data-testid="cu-routes">
        <h2 id="cu-routes-h">Two routes: register people, or read claims</h2>
        <p className="muted">{story.sibling}</p>
        <div className="scroll">
          <table className="tbl" data-testid="cu-route-rows">
            <thead><tr><th scope="col">Question</th><th scope="col">Register in PingOne</th><th scope="col">Claims</th><th scope="col">How well we know it</th></tr></thead>
            <tbody>{story.routes.rows.map((r) => <tr key={r.id}><th scope="row">{r.question}</th><td>{r.register}</td><td>{r.claims}</td><td><ClaimTag tag={r.tag} tags={story.tags} /></td></tr>)}</tbody>
          </table>
        </div>
        <h3>When each applies</h3>
        <dl className="kv" data-testid="cu-when">
          <dt>Register in PingOne</dt><dd><ul>{story.routes.when.register.map((t) => <li key={t}>{t}</li>)}</ul></dd>
          <dt>Claims</dt><dd><ul>{story.routes.when.claims.map((t) => <li key={t}>{t}</li>)}</ul></dd>
        </dl>
        <h3>The Cedar point</h3>
        <Json value={story.cedar.policy} label="Cedar group rule" testId="cu-cedar" />
        <ul className="facts" data-testid="cu-cedar-facts">
          {story.cedar.facts.map((f) => <li key={f.id}><ClaimTag tag={f.tag} tags={story.tags} /> {f.text} <span className="muted">Source: {f.source}.</span></li>)}
        </ul>
      </section>
      <CustomEditor story={story} scenario={sc} vertical={vertical} resetSignal={resetSignal} onRun={setRun} />
      <section className="panel" aria-labelledby="cu-facts-h">
        <h2 id="cu-facts-h">What we know, and how well</h2>
        <ul className="facts" data-testid="cu-facts">
          {story.facts.map((f) => <li key={f.id}><ClaimTag tag={f.tag} tags={story.tags} /> {f.text} <span className="muted">Source: {f.source}.</span></li>)}
        </ul>
      </section>
    </div>
  );
}
