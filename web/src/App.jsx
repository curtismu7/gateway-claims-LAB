import { useCallback, useEffect, useState } from "react";
import ClaimGate from "./components/ClaimGate";
import ScopeGate from "./components/ScopeGate";
import ClaimsUsers from "./components/ClaimsUsers";
import AgentcoreGov from "./components/AgentcoreGov";
import OnBehalfOf from "./components/OnBehalfOf";
import AgentcoreConsole from "./components/AgentcoreConsole";
import LatestReleases from "./components/LatestReleases";
import ErrorBoundary from "./components/ErrorBoundary";
import Posture from "./components/Posture";
import DiagramTab from "./components/DiagramTab";
import TopMenu, { applyFontSize } from "./top-menu/TopMenu";
import TalkTrackDialog from "./talk-track/TalkTrackDialog.jsx";
import HelpDialog from "./help-dialog/HelpDialog.jsx";
import { HELP_SECTIONS } from "./helpContent";
import ShelfLink from "./components/ShelfLink";
import VerifyMark from "./components/VerifyMark";
import TalkTrack from "./components/TalkTrack";
import { getJson, postJson, resetWorkspace } from "./api";
import { CLAIMS_USERS_BANNER, NO_LIVE, RELEASE_BANNER } from "./releaseText";

const THEME_KEY = "gwcl.theme";
const THEMES = [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]];
function initialTheme() {
  try { const t = localStorage.getItem(THEME_KEY); if (t === "light" || t === "dark") return t; } catch { /* storage blocked */ }
  return "auto";
}

export const TABS = [
  { id: "gate", label: "Nested-claim gate" },
  { id: "claimsusers", label: "Users and groups from claims" },
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
  const [lastRun, setLastRun] = useState(null); // the gate tab's last run; the diagram tab shows its hops in the expanded boxes
  const [presenter, setPresenter] = useState(false);
  const [talkOpen, setTalkOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [resetMsg, setResetMsg] = useState("");
  const [liveMsg, setLiveMsg] = useState(false); // Live was pressed: this app has no Live engine, and says so
  const [modeBusy, setModeBusy] = useState(false);
  const source = info?.source ?? "mock";
  const realAvailable = info ? info.realAvailable !== false : false;
  const realReason = info?.realReason || "Mock only.";
  // Rule 19: switching is a server call (POST /api/mode with exactly {source}). This lab is mock only, so Real is
  // disabled with the server's reason; a refusal (409) shows the reason and the page stays in mock.
  const switchMode = async (m) => {
    if (modeBusy) return;
    if (m === "real" && !realAvailable) { setLiveMsg(true); return; }
    setModeBusy(true);
    try {
      const r = await postJson("/api/mode", { source: m === "live" ? "real" : "mock" });
      if (!r.ok) { setLiveMsg(true); return; }
      setLiveMsg(false);
      const i = await getJson("/api/info");
      setInfo(i);
    } catch { setLiveMsg(true); } finally { setModeBusy(false); }
  };
  const [theme, setTheme] = useState(initialTheme);
  const [fontStep, setFontStep] = useState(() => { try { const f = localStorage.getItem("gwcl.font"); return ["S","M","L"].includes(f) ? f : "M"; } catch { return "M"; } });

  useEffect(() => { if (theme === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { applyFontSize(fontStep); try { localStorage.setItem("gwcl.font", fontStep); } catch {} }, [fontStep]);

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

  const banner = story ? story.banner : BANNER_UNKNOWN;
  return (
    <div className={`app${presenter ? " app--presenter" : ""}`}>
      <header className="shell-bar">
        <span className="shell-brand">
          <span className="shell-logo" aria-hidden="true">GC</span>
          <h1>Gateway Claims LAB</h1>
          <span className="shell-badge" data-testid="mode" title="Mock only: this lab has no Live engine">{info ? info.mode : "mock"}</span>
        </span>
        <nav className="shell-nav" aria-label="Lab sections">
          {TABS.map((t) => (
            <a key={t.id} href={`#${t.id}`} aria-current={tab === t.id ? "page" : undefined}
              onClick={(e) => { e.preventDefault(); select(t.id); }}>{t.label}</a>
          ))}
        </nav>
        <TopMenu
          postman={{ repo: "curtismu7/gateway-claims-LAB", slug: "gateway-claims-lab" }}
          mode={{ value: source === "real" ? "real" : "mock", onChange: (v) => switchMode(v === "real" ? "live" : "mock"), realAvailable, realHint: realReason }}
          vertical={{ value: vertical, onChange: setVertical, options: story ? story.verticals : ["retail"] }}
          theme={{ value: theme, onChange: pickTheme }}
          fontSize={{ value: fontStep, onChange: setFontStep }}
          present={{ active: presenter, onToggle: () => setPresenter((v) => !v) }}
          talkTrack={{ active: talkOpen, onToggle: () => setTalkOpen((v) => !v) }}
          help={{ onClick: () => setHelpOpen(true), title: "What this lab is, and what is simulated" }}
          version={info?.version || null}
          onReset={reset}
        >
          <ShelfLink />
          <VerifyMark id="gateway-claims-lab" />
        </TopMenu>
      </header>
      <main className="page">
        <p className="banner" role="status" data-state="mock" data-testid="banner">{banner}</p>
        {liveMsg && <p className="muted" id="live-refusal" role="status" data-testid="live-refusal">Live is refused. {(info && info.liveRefusal) || NO_LIVE} The page stays in mock mode.</p>}
        {error && <p className="app-error" role="alert">Could not load the lab ({error}). Is the server running?</p>}
        <p className="sr-only" role="status" aria-live="polite">{resetMsg}</p>
        {!presenter && story && <div className="page-head"><p className="intro">{story.intro}</p></div>}
        <div id={`panel-${tab}`} data-testid="panel">
          {RELEASE_TABS.includes(tab) && <p className="banner banner--release" role="note" data-testid="release-banner">{RELEASE_BANNER}</p>}
          {tab === "claimsusers" && <p className="banner banner--release" role="note" data-testid="cu-banner">{CLAIMS_USERS_BANNER}</p>}
          <ErrorBoundary resetKey={`${tab}|${vertical}`}>
          {error ? null : !story ? <p className="muted">Loading...</p> : (
            <>
              {presenter && tab !== "talk" && (
                <aside className="presenter-say" data-testid="presenter-say" aria-label="Talk track">
                  {story.talkTrack.filter((t) => (tab === "gate" ? ["say-first", "gate", "trap", "unverified"] : tab === "scope" ? ["scope-gates", "unverified"] : tab === "agentcore" ? ["agentcore-gov", "unverified"] : tab === "latest" ? ["latest", "unverified"] : tab === "claimsusers" ? ["claims-users", "unverified"] : tab === "obo" ? ["obo", "why-obo"] : tab === "console" ? ["console", "why-console"] : tab === "posture" ? ["posture"] : ["gate"]).includes(t.id)).map((t) => <p key={t.id}><strong>{t.title}.</strong> {t.say}</p>)}
                </aside>
              )}
              {tab === "gate" && <ClaimGate key={vertical} story={story} resetSignal={resetSignal} requestedId={requested} onSelect={pickScenario} onRun={setLastRun} source={source === "real" ? "real" : "mock"} />}
              {tab === "claimsusers" && <ClaimsUsers key={vertical} vertical={vertical} resetSignal={resetSignal} />}
              {tab === "scope" && (scopeStory ? <ScopeGate key={vertical} scope={scopeStory} resetSignal={resetSignal} /> : <p className="muted">Loading...</p>)}
              {tab === "agentcore" && (agStory ? <AgentcoreGov story={agStory} resetSignal={resetSignal} /> : <p className="muted">Loading...</p>)}
              {tab === "latest" && <LatestReleases />}
              {tab === "obo" && <OnBehalfOf key={vertical} vertical={vertical} resetSignal={resetSignal} />}
              {tab === "console" && <AgentcoreConsole key={vertical} vertical={vertical} resetSignal={resetSignal} />}
              {tab === "posture" && <Posture />}
              {tab === "diagram" && <DiagramTab vertical={vertical} resetSignal={resetSignal} run={lastRun} />}
              {tab === "talk" && <TalkTrack talk={story.talkTrack} />}
            </>
          )}
          </ErrorBoundary>
        </div>
      </main>

      <TalkTrackDialog isOpen={talkOpen} onClose={() => setTalkOpen(false)} talk={story?.talkTrack ?? []} />
      <HelpDialog isOpen={helpOpen} onClose={() => setHelpOpen(false)} sections={HELP_SECTIONS} docsUrl="https://github.com/curtismu7/gateway-claims-LAB#readme" />
    </div>
  );
}
