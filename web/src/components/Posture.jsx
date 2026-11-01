import { useEffect, useState } from "react";
import { getJson } from "../api";

const Yes = ({ v }) => <span className={`tag ${v ? "tag--warn" : "tag--ok"}`}>{v ? "yes" : "no"}</span>;

export default function Posture() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [sel, setSel] = useState(0);
  useEffect(() => { getJson("/api/posture").then(setData, (e) => setError(e.message)); }, []);
  if (error) return <p className="field-error" role="alert">Could not load posture ({error}).</p>;
  if (!data) return <p className="muted">Loading...</p>;
  const g = data.gateways[sel];
  return (
    <div className="posture">
      <p className="panel panel--warn" data-testid="posture-label" role="note"><strong>{data.label}</strong></p>
      <section className="panel" aria-labelledby="gw-h">
        <h2 id="gw-h">Gateways</h2>
        <div className="seg" role="group" aria-label="Gateway">
          {data.gateways.map((x, i) => <button key={x.name} type="button" aria-pressed={i === sel} onClick={() => setSel(i)}>{x.name} <span className="muted">{x.scorecard.grade}</span></button>)}
        </div>
        <dl className="kv" data-testid="gateway-detail">
          <dt>Status</dt><dd>{g.status}</dd>
          <dt>Region</dt><dd>{g.region}</dd>
          <dt>Authorizer type</dt><dd>{g.authorizerType}</dd>
          <dt>JWT discovery URL</dt><dd><code>{g.jwtDiscoveryUrl || "none"}</code></dd>
          <dt>Allowed audiences</dt><dd>{g.allowedAudiences.length ? g.allowedAudiences.map((a) => <code key={a}>{a} </code>) : "none"}</dd>
          <dt>Linked agents</dt><dd>{g.linkedAgents.length ? g.linkedAgents.join(", ") : "none"}</dd>
          <dt>Policy engine</dt><dd>{g.policyEngine ? <><code>{g.policyEngine.arn}</code> mode {g.policyEngine.mode}</> : "none attached"}</dd>
          <dt>WAF failure mode</dt><dd>{g.wafFailureMode}</dd>
          <dt>Scorecard</dt><dd>{g.scorecard.score} / 100 (grade {g.scorecard.grade}){g.scorecard.findings.length ? <ul>{g.scorecard.findings.map((f) => <li key={f}>{f}</li>)}</ul> : " - no findings"}</dd>
        </dl>
      </section>
      <section className="panel" aria-labelledby="pe-h">
        <h2 id="pe-h">Policy engines</h2>
        <div className="scroll">
          <table className="tbl" data-testid="engines">
            <thead><tr><th scope="col">Name</th><th scope="col">Policies</th><th scope="col">Attached gateways</th><th scope="col">KMS key</th><th scope="col">Orphaned</th><th scope="col">Status</th></tr></thead>
            <tbody>{data.policyEngines.map((e) => (
              <tr key={e.name}><th scope="row">{e.name}</th><td>{e.policyCount}</td><td>{e.attachedGateways.length ? e.attachedGateways.join(", ") : "none"}</td><td><code>{e.kmsKeyArn || "none"}</code></td><td><Yes v={e.orphaned} /></td><td>{e.status}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <section className="panel" aria-labelledby="acct-h">
        <h2 id="acct-h">Account</h2>
        <dl className="kv" data-testid="account">
          <dt>Account id</dt><dd><code>{data.account.accountId}</code> (fake)</dd>
          <dt>Gateway bypass possible</dt><dd><Yes v={data.account.gatewayBypassPosture.bypassPossible} /> {data.account.gatewayBypassPosture.reason}</dd>
          <dt>Affected gateways</dt><dd>{data.account.gatewayBypassPosture.affectedGateways.join(", ") || "none"}</dd>
          <dt>Account scorecard</dt><dd>{data.account.scorecard.score} / 100 (grade {data.account.scorecard.grade}); {data.account.scorecard.enforcingCount} of {data.account.scorecard.gatewayCount} gateways enforcing</dd>
        </dl>
      </section>
    </div>
  );
}
