import { useEffect, useState } from "react";
import { getJson } from "../api";
import { visible } from "../safeText";

const STATUS_CLASS = { measured: "tag tag--ok", inferred: "tag", UNVERIFIED: "tag tag--warn" };

// Gateway v1.261029 and v1.261030, and the 2026-11-02 release features we have not measured. Text only: nothing here runs.
export default function LatestReleases() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { let live = true; getJson("/api/latest").then((j) => { if (live) setData(j); }, (e) => { if (live) setError(e.message); }); return () => { live = false; }; }, []);
  if (error) return <p className="field-error" role="alert">Could not load the newer-release notes ({error}).</p>;
  if (!data) return <p className="muted">Loading...</p>;
  return (
    <div className="gate release-tab" data-testid="latest-tab">
      <section className="panel">
        <h2>{data.title}</h2>
        <p>{data.intro}</p>
        <p className="banner banner--release" role="note" data-testid="latest-banner">{data.banner}</p>
      </section>
      <section className="panel" aria-labelledby="lt-facts-h">
        <h2 id="lt-facts-h">What we know, and how well</h2>
        <ul className="facts" data-testid="latest-facts">
          {data.facts.map((f) => <li key={f.id}><span className={STATUS_CLASS[f.status] || "tag"}>{f.status}</span> {f.text} <span className="muted">Source: {f.source}.</span></li>)}
        </ul>
      </section>
      <section className="panel" aria-labelledby="lt-table-h">
        <h2 id="lt-table-h">The three images</h2>
        <div className="scroll">
          <table className="tbl" data-testid="latest-table">
            <thead><tr><th scope="col">Tag</th><th scope="col">Built (UTC)</th><th scope="col">Binary bytes</th><th scope="col">Symbols against the one before</th></tr></thead>
            <tbody>{data.table.map((r) => <tr key={r.tag}><th scope="row"><code>{r.tag}</code></th><td>{r.built}</td><td>{r.binary}</td><td>{r.symbols}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="muted">Symbol counts are raw and include compiler temporaries: they show how big the step was, not how many features changed.</p>
      </section>
      <section className="panel" aria-labelledby="lt-since-h">
        <h2 id="lt-since-h">What changed since v1.261028 (lab readings)</h2>
        <p className="muted">Every row is the lab&apos;s reading of a name in the binary. <span className="tag tag--warn">UNVERIFIED</span> Nothing was run.</p>
        <div className="scroll">
          <table className="tbl" data-testid="latest-since">
            <thead><tr><th scope="col">Version</th><th scope="col">Change</th><th scope="col">Seen in the binary</th><th scope="col">Our reading</th></tr></thead>
            <tbody>{data.since.map((r) => (
              <tr key={r.id}><td>{visible(r.version)}</td><th scope="row">{visible(r.change)}</th><td><code>{visible(r.symbols)}</code></td><td>{visible(r.reading)} <span className="tag tag--warn">UNVERIFIED</span></td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <section className="panel" aria-labelledby="lt-nm-h">
        <h2 id="lt-nm-h">The {data.releaseDate} release: not yet measured</h2>
        <p className="muted">Features Ping&apos;s deck names for the release. None is on our tenant, so none is verified. The reading is from the name only; the last column says what a test would need.</p>
        <div className="scroll">
          <table className="tbl" data-testid="latest-not-measured">
            <thead><tr><th scope="col">Feature</th><th scope="col">Our reading</th><th scope="col">A test needs</th></tr></thead>
            <tbody>{data.notMeasured.map((f) => (
              <tr key={f.id}><th scope="row">{visible(f.feature)} <span className="tag tag--warn">UNVERIFIED</span></th><td>{visible(f.reading)}</td><td>{visible(f.test)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <section className="panel" aria-labelledby="lt-re-h">
        <h2 id="lt-re-h">When the release lands: three comparisons to repeat</h2>
        <ol className="facts" data-testid="latest-recheck">{data.recheck.map((x) => <li key={x}>{visible(x)}</li>)}</ol>
      </section>
    </div>
  );
}
