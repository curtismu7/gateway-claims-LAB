import { useCallback, useEffect, useRef, useState } from "react";
import ClaimGate from "./components/ClaimGate";
import ScopeGate from "./components/ScopeGate";
import AgentcoreGov from "./components/AgentcoreGov";
import OnBehalfOf from "./components/OnBehalfOf";
import AgentcoreConsole from "./components/AgentcoreConsole";
import LatestReleases from "./components/LatestReleases";
import ErrorBoundary from "./components/ErrorBoundary";
import Posture from "./components/Posture";
import DiagramTab from "./components/DiagramTab";
import TalkTrack from "./components/TalkTrack";
import { getJson, resetWorkspace } from "./api";
import { NO_LIVE, RELEASE_BANNER } from "./releaseText";

const THEME_KEY = "gwcl.theme";
const THEMES = [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]];
function initialTheme() {
  try { const t = localStorage.getItem(THEME_KEY); if (t === "light" || t === "dark") return t; } catch { /* storage blocked */ }
  return "auto";
}

export const TABS = [
  { id: "gate", label: "Nested-claim gate" },
  { id: "scope", label: "v1.261027 scope gates" },
  { id: "agentcore", label: "v1.261028 AgentCore" },
  { id: "latest", label: "v1.261029 + v1.261030" },
  { id: "obo", label: "On-behalf-of" },
  { id: "console", label: "AgentCore console" },
  { id: "posture", label: "AgentCore posture" },
  { id: "diagram", label: "Diagram" },
  { id: "talk", label: "Talk track" },
];
// The two H2 2026 release tabs carry their own banner on top of the simulation banner, in presenter mode too.
export const RELEASE_TABS = ["obo", "console"];
// The banner is never blank: until /api/scenarios answers (or if it fails) this fixed text stands in. It names the mode, always mock here.
const TAIL = "Nothing here calls a real gateway, identity provider or tenant.";
export const BANNER_UNKNOWN = `SIMULATED, MOCK mode: a mock PingFederate-style token and a mock Privilege rule. ${TAIL}`;

const hashParts = () => {
  const h = window.location.hash.replace("#", "");
  const m = /^scenario-([a-z0-9-]{1,40})$/.exec(h);
  if (m) return { tab: "gate", scenario: m[1] };
  return { tab: TABS.some((t) => t.id === h) ? h : "gate", scenario: null };
};

export default function App() {
  const [vertical, setVertical] = useState("retail");
  const [story, setStory] = useState(null);
  const [scopeStory, setScopeStory] = useState(null);
  const [agStory, setAgStory] = useState(null);
  const [info, setInfo] = useState(undefined); // undefined = loading, null = failed
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(hashParts().tab);
  const [requested, setRequested] = useState(hashParts().scenario);
  const [presenter, setPresenter] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [resetMsg, setResetMsg] = useState("");
  const [liveMsg, setLiveMsg] = useState(false); // Live was pressed: this app has no Live engine, and says so
  const [theme, setTheme] = useState(initialTheme);
  const tabsRef = useRef(null);

  useEffect(() => { if (theme === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; }, [theme]);

  useEffect(() => { getJson("/api/info").then(setInfo, () => setInfo(null)); }, []);
  useEffect(() => { getJson(`/api/scenarios?vertical=${encodeURIComponent(vertical)}`).then((j) => { setStory(j); setError(null); }, (e) => setError(e.message)); }, [vertical]);
  useEffect(() => { getJson(`/api/scope-gate?vertical=${encodeURIComponent(vertical)}`).then(setScopeStory, () => setScopeStory(null)); }, [vertical]);
  useEffect(() => { getJson("/api/agentcore").then(setAgStory, () => setAgStory(null)); }, []);
  useEffect(() => {
    const on = () => { const p = hashParts(); setTab(p.tab); setRequested(p.scenario); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const select = (id) => { setTab(id); setRequested(null); try { window.history.replaceState(null, "", `#${id}`); } catch { /* ignore */ } };
  const pickScenario = (sid) => { try { window.history.replaceState(null, "", `#scenario-${sid}`); } catch { /* ignore */ } };

  // Keep the active tab fully in view in the scrolling tab strip (375px).
  useEffect(() => {
    const strip = tabsRef.current; const el = document.getElementById(`tab-${tab}`);
    if (!strip || !el) return;
    const left = el.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft || left + el.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = Math.max(0, left - 8);
  }, [tab]);

  useEffect(() => {
    const on = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return; // Cmd/Ctrl/Alt + P is the browser's (print), not ours
      if (e.target && (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable)) return;
      if (e.key === "p" || e.key === "P") setPresenter((v) => !v);
      else if (e.key === "Escape") setPresenter(false);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const pickTheme = (next) => {
    try { if (next === "auto") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, next); } catch { /* not remembered */ }
    setTheme(next);
  };

  const reset = useCallback(async () => {
    const ok = await resetWorkspace().catch(() => false);
    setResetSignal((n) => n + 1);
    setResetMsg(ok ? "Reset: your workspace's evaluations are cleared, the modelled gateway is back as it was, and the diagram boxes are back in place." : "Reset failed on the server; the view was reset.");
  }, []);

  const onKeyTab = (e, i) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    select(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  const banner = story ? story.banner : BANNER_UNKNOWN;
  return (
    <div className={`app${presenter ? " app--presenter" : ""}`}>
      <header>
        <p className="banner" role="status" data-state="mock" data-testid="banner">{banner}</p>
        <div className="head">
          <div>
            <h1 className="head__title">Gateway Claims LAB</h1>
            {!presenter && story && <p className="head__intro">{story.intro}</p>}
          </div>
          <div className="head__tools">
            <div className="seg" role="group" aria-label="Mode">
              <button type="button" aria-pressed="true" onClick={() => setLiveMsg(false)} data-testid="mode-mock">Mock</button>
              <button type="button" aria-pressed="false" aria-describedby={liveMsg ? "live-refusal" : undefined} onClick={() => setLiveMsg(true)} data-testid="mode-live">Live</button>
            </div>
            <span className="chip" data-testid="mode">Mode: {info ? info.mode : "mock"} (no Live engine)</span>
            {!presenter && (
              <label className="inline">Vertical{" "}
                <select value={vertical} onChange={(e) => setVertical(e.target.value)}>
                  {(story ? story.verticals : ["retail"]).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
            )}
            <label className="shell-theme">Theme
              <select value={theme} onChange={(e) => pickTheme(e.target.value)}>
                {THEMES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <button type="button" onClick={reset} data-testid="reset">Reset</button>
            <button type="button" aria-pressed={presenter} onClick={() => setPresenter((v) => !v)} data-testid="presenter">{presenter ? "Exit presenter (Esc)" : "Presenter (P)"}</button>
          </div>
        </div>
        {liveMsg && <p className="muted" id="live-refusal" role="status" data-testid="live-refusal">Live is refused. {(info && info.liveRefusal) || NO_LIVE} The page stays in mock mode.</p>}
      </header>
      <main>
        <p className="sr-only" role="status" aria-live="polite">{resetMsg}</p>
        <div role="tablist" aria-label="Lab sections" className="tabs" ref={tabsRef}>
          {TABS.map((t, i) => (
            <button key={t.id} id={`tab-${t.id}`} role="tab" type="button" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
              onClick={() => select(t.id)} onKeyDown={(e) => onKeyTab(e, i)}>{t.label}</button>
          ))}
        </div>
        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {RELEASE_TABS.includes(tab) && <p className="banner banner--release" role="note" data-testid="release-banner">{RELEASE_BANNER}</p>}
          <ErrorBoundary resetKey={`${tab}|${vertical}`}>
          {error ? <p className="app-error" role="alert">Could not load the lab ({error}). Is the server running?</p> : !story ? <p className="muted">Loading...</p> : (
            <>
              {presenter && tab !== "talk" && (
                <aside className="presenter-say" data-testid="presenter-say" aria-label="Talk track">
                  {story.talkTrack.filter((t) => (tab === "gate" ? ["say-first", "gate", "trap", "unverified"] : tab === "scope" ? ["scope-gates", "unverified"] : tab === "agentcore" ? ["agentcore-gov", "unverified"] : tab === "latest" ? ["latest", "unverified"] : tab === "obo" ? ["obo", "why-obo"] : tab === "console" ? ["console", "why-console"] : tab === "posture" ? ["posture"] : ["gate"]).includes(t.id)).map((t) => <p key={t.id}><strong>{t.title}.</strong> {t.say}</p>)}
                </aside>
              )}
              {tab === "gate" && <ClaimGate key={vertical} story={story} resetSignal={resetSignal} requestedId={requested} onSelect={pickScenario} />}
              {tab === "scope" && (scopeStory ? <ScopeGate key={vertical} scope={scopeStory} resetSignal={resetSignal} /> : <p className="muted">Loading...</p>)}
              {tab === "agentcore" && (agStory ? <AgentcoreGov story={agStory} resetSignal={resetSignal} /> : <p className="muted">Loading...</p>)}
              {tab === "latest" && <LatestReleases />}
              {tab === "obo" && <OnBehalfOf key={vertical} vertical={vertical} resetSignal={resetSignal} />}
              {tab === "console" && <AgentcoreConsole key={vertical} vertical={vertical} resetSignal={resetSignal} />}
              {tab === "posture" && <Posture />}
              {tab === "diagram" && <DiagramTab vertical={vertical} resetSignal={resetSignal} />}
              {tab === "talk" && <TalkTrack talk={story.talkTrack} />}
            </>
          )}
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
