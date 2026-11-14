"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { fundsUrl, reportUrl } from "@/components/api-urls";
import { Landing } from "@/components/landing";
import { deriveReport } from "@/components/report-state";
import { SkyEngine, type Group, type SkyCompany, type SkyFund } from "@/components/sky/engine";
import { useReportStream } from "@/components/use-report-stream";
import { profile } from "@/lib/fund-profile";
import type { CallGroup, CallListEntry, FundMatch } from "@/lib/types";

type Phase = "sky" | "flying" | "system";
type SearchState = { kind: "idle" } | { kind: "loading" } | { kind: "error" } | { kind: "results"; matches: FundMatch[] };

const GROUPS: { g: CallGroup; label: string; color: string }[] = [
  { g: "news_event", label: "News found", color: "var(--news)" },
  { g: "no_recent_round", label: "No recorded round in 24+ months", color: "var(--quiet)" },
  { g: "recent_round", label: "Raised again recently", color: "var(--recent)" },
];
const SEVERITY: Record<CallGroup, number> = { news_event: 0, no_recent_round: 1, recent_round: 2 };
const groupColor = (g: Group) => GROUPS.find((x) => x.g === g)?.color ?? "var(--none)";
/** While the landing page is up the sky looks high and close, at stars only; entering tilts back down and zooms out. */
const LIFT = { pitch: 40, zoom: 0.6 };
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
const monthsSince = (iso: string | undefined, now: Date) =>
  iso ? (now.getFullYear() - +iso.slice(0, 4)) * 12 + (now.getMonth() + 1 - +iso.slice(5, 7)) : null;
const domain = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const Icon = {
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  arrow: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  back: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5M11 6l-6 6 6 6" /></svg>,
  labels: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M4 6h10M4 12h16M4 18h7" /></svg>,
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></svg>,
  reset: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4" /></svg>,
  orbits: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><ellipse cx="12" cy="12" rx="10" ry="5" /><circle cx="12" cy="12" r="2.2" fill="currentColor" /><circle cx="20" cy="10" r="1.4" fill="currentColor" /></svg>,
  full: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>,
  logo: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><circle cx="12" cy="12" r="2.4" fill="currentColor" /><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-20 12 12)" /></svg>,
};

let toastSeq = 0; // each toast gets its own id, so a newer one is not cleared by an older one's timer

/** Parallax: the funds as stars on a 3D sky; search flies to one, and its portfolio appears around it. */
export function ParallaxApp({ funds }: { funds: SkyFund[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const engine = useRef<SkyEngine | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [extra, setExtra] = useState<SkyFund[]>([]);
  const allFunds = useMemo(() => [...funds, ...extra.filter((e) => !funds.some((f) => f.id === e.id))], [funds, extra]);
  const [landing, setLanding] = useState(true);
  const landingOn = useRef(true);
  const [settling, setSettling] = useState(false); // the camera pull-back after the landing page; the sky stays inert until it ends
  const focusSky = useRef(false);
  const [phase, setPhase] = useState<Phase>("sky");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selCo, setSelCo] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [hl, setHl] = useState<{ fund: string | null; key: string; ids: Set<string> } | null>(null);
  const [q, setQ] = useState("");
  const [suggest, setSuggest] = useState(false);
  const [sIdx, setSIdx] = useState(-1);
  const [search, setSearch] = useState<SearchState>({ kind: "idle" });
  const [viewText, setViewText] = useState("FOV 80°");
  const [labels, setLabels] = useState(true);
  const [grid, setGrid] = useState(false);
  const [orbits, setOrbits] = useState(true);
  const [filters, setFilters] = useState<Record<CallGroup, boolean>>({ news_event: true, no_recent_round: true, recent_round: true });
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [visited, setVisited] = useState(false); // a first flight has happened: the opening explanation is no longer needed
  const [touchedFund, setTouchedFund] = useState<string | null>(null); // the fund whose call list the visitor has opened or closed by hand
  const [clock, setClock] = useState<{ t: string; d: string } | null>(null);
  const [mountedAt, setMountedAt] = useState<number | null>(null);

  // the report streams from the moment the flight starts, so data is ready on arrival
  const { events } = useReportStream(targetId && phase !== "sky" ? reportUrl(targetId) : null);
  const report = useMemo(() => deriveReport(events), [events]);
  const target = allFunds.find((f) => f.id === targetId);

  const say = (text: string) => {
    const id = ++toastSeq;
    setToast({ id, text });
    // the fade is CSS; under reduced motion there is none, so clear it here too
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2800);
  };

  /* ---------- engine lifecycle ---------- */
  const cb = useRef({
    onSelectFund: (id: string | null) => setSelectedId(id),
    onSelectCompany: (id: string) => selectCompany(id),
    onArrive: () => {
      setPhase("system");
      say("Signal found. Mapping the portfolio…");
    },
    onReturned: () => {
      setPhase("sky");
      setTargetId(null);
      say("Back in the sky. Drag to look around.");
    },
    onView: (t: string) => setViewText(t),
  });
  useEffect(() => {
    if (!canvas.current || !tip.current) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const e = new SkyEngine(canvas.current, tip.current, {
      onSelectFund: (id) => cb.current.onSelectFund(id),
      onSelectCompany: (id) => cb.current.onSelectCompany(id),
      onArrive: () => cb.current.onArrive(),
      onReturned: () => cb.current.onReturned(),
      onView: (t) => cb.current.onView(t),
    }, reduce);
    engine.current = e;
    if (location.hash !== "#sky") {
      e.turn(0, LIFT.pitch);
      e.zoom(LIFT.zoom);
    }
    return () => e.destroy();
  }, []);
  useEffect(() => engine.current?.setFunds(allFunds), [allFunds]);
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    e.labels = labels && !landing; // no fund names ghosting behind the landing copy
    e.grid = grid;
    e.orbits = orbits;
    e.filters = { ...e.filters, ...filters };
  }, [labels, grid, orbits, filters, landing]);

  /* ---------- the portfolio as planets ---------- */
  const skyCompanies = useMemo<SkyCompany[]>(() => {
    const now = new Date(report.report?.generatedAt ?? mountedAt ?? 0);
    const worst = new Map<string, CallGroup>();
    for (const e of report.entries) {
      const w = worst.get(e.companyId);
      if (!w || SEVERITY[e.group] < SEVERITY[w]) worst.set(e.companyId, e.group);
    }
    return report.companies.map((c) => ({
      id: c.calaId,
      name: c.name,
      last: c.lastRoundDate?.slice(0, 7),
      months: monthsSince(c.lastRoundDate, now),
      founders: c.founders.length,
      group: c.state === "pending" ? "pending" : (worst.get(c.calaId) ?? "none"),
    }));
  }, [report, mountedAt]);
  useEffect(() => {
    if (phase === "system") engine.current?.setCompanies(skyCompanies);
  }, [phase, skyCompanies]);

  useEffect(() => {
    const ids = hl && hl.fund === targetId ? hl.ids : null;
    if (engine.current) engine.current.highlight = ids;
    if (ids) listRef.current?.querySelector('[data-hl="true"]')?.scrollIntoView({ block: "nearest" });
  }, [hl, targetId]);

  /* ---------- clock + keys ---------- */
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setMountedAt((m) => m ?? d.getTime());
      setClock({ t: d.toLocaleTimeString("en-GB"), d: d.toISOString().slice(0, 10) });
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (landingOn.current || e.target === input.current) return;
      if (e.key === "/") {
        e.preventDefault();
        input.current?.focus();
      }
      if (e.key === "Escape") engine.current?.flyOut();
      if ((e.target as HTMLElement).closest?.("input, textarea, button, a, .px-list") || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "+" || e.key === "=") engine.current?.zoom(0.85);
      if (e.key === "-") engine.current?.zoom(1 / 0.85);
      const arrow = { ArrowLeft: [-6, 0], ArrowRight: [6, 0], ArrowUp: [0, 4], ArrowDown: [0, -4] }[e.key];
      if (arrow) {
        e.preventDefault();
        engine.current?.turn(arrow[0], arrow[1]);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  /* ---------- actions ---------- */
  function flyTo(f: SkyFund) {
    if (phase === "flying") return;
    if (!allFunds.some((x) => x.id === f.id)) setExtra((xs) => [...xs, f]);
    setQ(f.name);
    setSuggest(false);
    input.current?.blur();
    setSelectedId(null);
    setSelCo(null);
    setOpen(new Set());
    setVisited(true);
    setTargetId(f.id);
    setPhase("flying");
    say(`Flying to ${f.name}…`);
    // let setFunds() place a newly found star before the engine aims at it
    requestAnimationFrame(() => engine.current?.flyTo(f.id));
  }
  const skipLanding = useCallback(() => {
    landingOn.current = false;
    setLanding(false);
  }, []);
  /** Leave the landing page: the camera pulls back from the stars to the horizon view, then goes on to the fund that was asked for. */
  function enter(text: string) {
    skipLanding();
    setSettling(true);
    focusSky.current = true;
    history.replaceState(null, "", "#sky");
    const then = () => {
      setSettling(false);
      engine.current?.resetView();
      if (!norm(text)) return;
      const f = allFunds.find((x) => norm(x.name).includes(norm(text)));
      if (f) return flyTo(f);
      setQ(text);
      lookup(text);
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return then();
    let t0 = 0, prev = 0;
    const step = (t: number) => {
      t0 ||= t;
      const p = Math.min(1, (t - t0) / 1600), eased = 1 - (1 - p) ** 3;
      engine.current?.turn(0, -LIFT.pitch * (eased - prev));
      engine.current?.zoom(LIFT.zoom ** (prev - eased));
      prev = eased;
      if (p < 1) requestAnimationFrame(step);
      else then();
    };
    requestAnimationFrame(step);
  }
  // the Fly button that had focus is gone with the landing page: hand focus to the sky once it is usable
  useEffect(() => {
    if (landing || settling || !focusSky.current) return;
    focusSky.current = false;
    document.getElementById("sky")?.focus({ preventScroll: true });
  }, [landing, settling]);
  function selectCompany(id: string) {
    setSelCo(id);
    engine.current?.selectCompany(id);
    setTouchedFund(targetId);
    setOpen((o) => new Set([...o, ...(autoKey ? [autoKey] : []), ...report.entries.filter((e) => e.companyId === id).map((e) => `${e.companyId}:${e.founder.name}`)]));
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-cid="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" }));
  }
  useEffect(() => {
    cb.current.onSelectCompany = selectCompany;
    // the selected fund's name goes into the search bar, ready for Fly
    cb.current.onSelectFund = (id) => {
      setSelectedId(id);
      const f = allFunds.find((x) => x.id === id);
      if (f) setQ(f.name);
    };
  });

  const matches = allFunds.filter((f) => !norm(q) || norm(f.name).includes(norm(q)));
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const pick = matches[Math.max(0, sIdx)];
    if (pick && (sIdx >= 0 || norm(q))) return flyTo(pick);
    return lookup(q);
  }
  async function lookup(text: string) {
    setSuggest(true);
    if (norm(text).length < 2) return;
    setSearch({ kind: "loading" });
    try {
      const res = await fetch(fundsUrl(text.trim()));
      if (!res.ok) throw new Error(String(res.status));
      setSearch({ kind: "results", matches: (await res.json()) as FundMatch[] });
    } catch {
      setSearch({ kind: "error" });
    }
  }
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setSuggest(true);
      const n = matches.length || 1;
      setSIdx((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
    }
    if (e.key === "Escape") input.current?.blur();
  }
  async function copy(entry: CallListEntry, btn: HTMLButtonElement) {
    const text = entry.questions.map((x, i) => `${i + 1}. ${x}`).join("\n");
    const done = (label: string) => {
      btn.textContent = label;
      setTimeout(() => (btn.textContent = "Copy questions"), 2000);
    };
    try {
      await navigator.clipboard.writeText(text);
      done("Copied");
    } catch {
      done("Copy failed");
    }
  }

  /* ---------- derived numbers ---------- */
  const fp = report.report ? profile(report.report) : null;
  const companiesN = report.companies.length;
  const checked = report.checked;
  const planned = Math.min(report.planned ?? companiesN, companiesN); // a capped live run checks fewer than the portfolio holds
  // progress line: done, stopped by an error, a bar once the company list is known, a spinner before that
  const done = report.complete !== undefined;
  const progState = done ? "done" : report.error ? "stopped" : companiesN ? "bar" : "wait";
  const pct = done ? 100 : planned ? Math.round((100 * checked) / planned) : 0;
  // the latest pipeline message, unless the company list arrived after it ("Reading the fund's portfolio…" is then stale)
  const note = events.findLastIndex((e) => e.type === "progress") > events.findLastIndex((e) => e.type === "portfolio") ? report.progress : undefined;
  const newsN = skyCompanies.filter((c) => c.group === "news_event").length;
  const selectedFund = allFunds.find((f) => f.id === selectedId);
  const visible = report.entries.filter((e) => filters[e.group]);
  const sel = skyCompanies.find((c) => c.id === selCo);
  // D29: shown in a founder's open entry, or at the top of the list for a selected company with no entry there
  // Indicators (issue #22): a count picks out the planets and call-list entries behind it. Tagged with the fund, so a new flight starts clear.
  const companyOfRound = new Map(report.companies.flatMap((c) => c.rounds.map((r) => [r.calaId, c.calaId] as const)));
  const hlIds = hl && hl.fund === targetId ? hl.ids : null;
  // the first founder's card opens by itself on arrival, so the reasons and the questions are on screen without a click
  const first = report.entries.find((e) => filters[e.group]);
  const autoKey = first && touchedFund !== targetId ? `${first.companyId}:${first.founder.name}` : null;
  const demoFund = allFunds.find((f) => /icebreaker/i.test(f.name)) ?? allFunds[0];
  const mapKey = (
    <ul>
      <li><i style={{ background: "var(--news)" }} />News found</li>
      <li><i style={{ background: "var(--quiet)" }} />No round in 2+ years</li>
      <li><i style={{ background: "var(--recent)" }} />Raised recently</li>
      <li><i style={{ background: "var(--none)" }} />No founder found</li>
    </ul>
  );
  const count = (key: string, ids: string[], label: string, text: ReactNode) => (
    <button
      className="px-count"
      aria-pressed={!!hlIds && hl?.key === key}
      aria-label={`${label}: show on the map and in the call list`}
      disabled={!ids.length}
      onClick={() => {
        const on = !(hlIds && hl?.key === key);
        const set = new Set(ids.map((id) => companyOfRound.get(id) ?? id));
        setHl(on ? { fund: targetId, key, ids: set } : null);
      }}
    >
      {text}
    </button>
  );
  const overviewOf = (companyId: string | null) => {
    const o = report.companies.find((c) => c.calaId === companyId)?.overview;
    return o && (
      <div className="px-det">
        <p className="px-desc">{o.text}</p>
        <details className="px-note">
          <summary>AI overview by Gemini, written only from these {o.sources.length} sources</summary>
          <span className="px-chips">
            {o.sources.map((src) => (
              <a key={src.url} className="px-chip" href={src.url} target="_blank" rel="noopener noreferrer">
                {[domain(src.url), src.date?.slice(0, 7)].filter(Boolean).join(" · ")}
              </a>
            ))}
          </span>
        </details>
      </div>
    );
  };

  return (
    <>
    {landing && <Landing funds={funds} onEnter={enter} onSkip={skipLanding} />}
    <div className="px-app" id="sky" tabIndex={-1} inert={landing || settling}>
      <canvas ref={canvas} className="px-sky" aria-label="Sky map of venture funds. Drag to rotate; use the search to fly to a fund." />
      <div ref={tip} className="px-tip" aria-hidden />

      {/* the logo is the way home: back to the sky from a fund, or back to the opening view when already there */}
      <button
        className="px-ui px-glass px-brand"
        aria-label={phase === "sky" ? "Parallax: reset the sky view" : "Parallax: return to the sky"}
        onClick={() => (phase === "sky" ? engine.current?.resetView() : engine.current?.flyOut())}
      >
        {Icon.logo}<span>Parallax</span>
      </button>

      <div className="px-ui px-glass px-searchbar">
        <form role="search" onSubmit={onSubmit}>
          {Icon.search}
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSIdx(-1);
              setSearch({ kind: "idle" });
              setSuggest(true);
            }}
            onFocus={() => setSuggest(true)}
            onBlur={() => setTimeout(() => setSuggest(false), 150)}
            onKeyDown={onKeyDown}
            placeholder="Which fund do you want to reference-check?"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-label="Search a venture fund"
            aria-expanded={suggest}
            aria-controls="fund-suggestions"
            aria-activedescendant={suggest && sIdx >= 0 ? `fund-opt-${sIdx}` : undefined}
          />
          <button className="px-fly" aria-label="Fly to fund">{Icon.arrow}Fly</button>
        </form>
        {suggest && (
          <div className="px-sugg" id="fund-suggestions" role="listbox" aria-label="Funds">
            {!norm(q) && <div className="px-hint">Funds in the sky</div>}
            {matches.map((f, i) => (
              <button key={f.id} id={`fund-opt-${i}`} tabIndex={-1} type="button" role="option" aria-selected={i === sIdx} className="px-option" onMouseDown={(e) => e.preventDefault()} onClick={() => flyTo(f)}>
                <i /><span>{f.name}</span><small>{f.companies != null ? `${f.companies} companies` : "not checked yet"}</small>
              </button>
            ))}
            {search.kind === "loading" && <div className="px-hint">Searching…</div>}
            {search.kind === "error" && <div className="px-warn" role="alert">Could not search funds. Please try again.</div>}
            {search.kind === "results" &&
              (search.matches.length ? (
                <>
                  <div className="px-hint">
                    {search.matches.some((m) => m.companies !== 0)
                      ? "Not checked yet. A first check reads the fund's portfolio live and takes a few minutes."
                      : "None of these has any investments on record, so there is nothing to check."}
                  </div>
                  {search.matches.map((m) => {
                    // no investments on record: a report would be empty, so the row says so and does not fly
                    const empty = m.companies === 0;
                    return (
                      <button key={m.calaId} type="button" role="option" aria-selected={false} aria-disabled={empty} className="px-option" onMouseDown={(e) => e.preventDefault()} onClick={() => empty || flyTo({ id: m.calaId, name: m.name })}>
                        <i /><span>{m.name}{m.description && <em>{m.description}</em>}</span><small>{m.companies == null ? "not counted" : empty ? "nothing to show" : `${m.companies}${m.companies >= 200 ? "+" : ""} companies`}</small>
                      </button>
                    );
                  })}
                </>
              ) : (
                <div className="px-warn">No matching funds</div>
              ))}
            {norm(q) && !matches.length && search.kind === "idle" && <div className="px-hint">Press Enter to search all funds</div>}
          </div>
        )}
      </div>

      {phase === "sky" && selectedFund && (
        <section className="px-ui px-glass px-info" aria-label={selectedFund.name}>
          <div className="px-type">{selectedFund.companies != null ? "Venture fund" : "Investor · not checked yet"}</div>
          <h1>{selectedFund.name}</h1>
          <dl>
            {selectedFund.companies != null && (<><dt>Portfolio companies</dt><dd>{selectedFund.companies}</dd></>)}
            {selectedFund.calls != null && (<><dt>Founders to call</dt><dd>{selectedFund.calls}</dd></>)}
          </dl>
          <div className="px-acts">
            <button className="px-btn px-primary" onClick={() => flyTo(selectedFund)}>Fly to {selectedFund.name}</button>
            <Link className="px-btn" href={`/report/${selectedFund.id}`}>Full report</Link>
          </div>
        </section>
      )}

      {phase === "system" && target && (
        <section className="px-ui px-glass px-info px-compact" aria-label={report.fund?.name ?? target.name} aria-live="polite">
          <div className="px-type">{target.companies != null ? "Venture fund" : "Investor · checked live"}</div>
          <h1>{report.fund?.name ?? target.name}</h1>
          {report.fund?.description && <p className="px-desc">{report.fund.description}</p>}
          {/* headline counts, then one block per fact about follow-on funding: number, share bar, what it is measured against */}
          <dl className="px-tiles px-three">
            <div><dt>Companies</dt><dd>{companiesN || "…"}</dd></div>
            <div><dt>Founders to call</dt><dd>{report.entries.length}</dd></div>
            <div style={{ "--c": "var(--news)" } as CSSProperties}><dt>With news</dt><dd>{newsN}</dd></div>
          </dl>
          {fp && (
            <>
              <h2 className="px-sec">Follow-on funding</h2>
              <dl className="px-tiles">
                {([
                  ["quiet", "No round in 2+ years", "", fp.noRoundIn24Months, "var(--quiet)"],
                  ["later", "Fund backed again", "at least this many", fp.namedInLaterRound, "var(--recent)"],
                  ["led", "Rounds led", "where the lead is known", fp.ledRounds, "var(--star)"],
                ] as const).map(([key, label, basis, c, color]) => (
                  <div key={key} style={{ "--c": color } as CSSProperties}>
                    <dt>{label}{basis && <small>{basis}</small>}</dt>
                    <dd>
                      {count(key, c.ids, label, <>{c.n} <small>of {c.of}</small></>)}
                      <i className="px-meter" aria-hidden><i style={{ width: `${c.of ? (100 * c.n) / c.of : 0}%` }} /></i>
                    </dd>
                  </div>
                ))}
                {fp.medianMonthsBetweenRounds != null && (
                  <div>
                    <dt>Between rounds<small>median</small></dt>
                    <dd>{Math.round(fp.medianMonthsBetweenRounds)} <small>months</small></dd>
                  </div>
                )}
              </dl>
            </>
          )}
          {fp && fp.topCoInvestors.length > 0 && (
            <details className="px-more">
              <summary>Top co-investors</summary>
              <dl>
                {fp.topCoInvestors.slice(0, 5).map((c) => (
                  <Fragment key={c.name}><dt>{c.name}</dt><dd>{count(`co:${c.name}`, c.roundIds, `Rounds with ${c.name}`, <>{c.roundIds.length} <small>{c.roundIds.length > 1 ? "rounds" : "round"}</small></>)}</dd></Fragment>
                ))}
              </dl>
            </details>
          )}
          {fp && fp.partners.length > 0 && (
            <details className="px-more">
              <summary>Fund partners<small>quoted in news</small></summary>
              <dl>
                {fp.partners.slice(0, 5).map((p) => (
                  <Fragment key={p.name}><dt>{p.name}{p.title && <small>{p.title}</small>}</dt><dd>{count(`partner:${p.name}`, p.roundIds, `Rounds where ${p.name} is quoted`, <>{p.roundIds.length} <small>{p.roundIds.length > 1 ? "rounds" : "round"}</small></>)}</dd></Fragment>
                ))}
              </dl>
            </details>
          )}
          <p className="px-note">A missing round is not evidence of failure.</p>
          {report.error && <div className="px-alert" role="alert">{report.error}</div>}
          <div className="px-prog" data-state={progState}>
            {(done || companiesN > 0) && (
              <>
                <span className="px-bar" role="progressbar" aria-label="Companies checked" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                  <i style={{ width: `${pct}%` }} />
                </span>
                <b aria-hidden>{pct}%</b>
              </>
            )}
            {/* the words carry the progress for screen readers: the panel is a polite live region */}
            <p>
              {progState === "wait" && <i className="px-spin" aria-hidden />}
              {progState === "done" && <i className="px-ok" aria-hidden />}
              {progState === "done"
                ? `Done · ${checked} of ${companiesN} companies checked${report.complete ? "" : " · partial report"}`
                : progState === "wait"
                  ? (report.progress ?? "Connecting…")
                  : `${progState === "stopped" ? "Stopped · " : ""}${checked} of ${planned} companies checked${note && progState === "bar" ? ` · ${note}` : ""}`}
            </p>
          </div>
          <div className="px-acts">
            <button className="px-btn" onClick={() => engine.current?.flyOut()}>Return to sky</button>
            <Link className="px-btn" href={`/report/${target.id}`}>Full report</Link>
          </div>
        </section>
      )}

      {phase === "sky" && !landing && !settling && !visited && !selectedFund && !suggest && demoFund && (
        <section className="px-ui px-glass px-pitch" aria-label="What Parallax is">
          <p><b>Reference checks for VC funds.</b> Each bright star is a fund: pick one to see its portfolio and the founders worth calling before you sign.</p>
          <button className="px-btn px-primary" onClick={() => flyTo(demoFund)}>Try {demoFund.name}</button>
        </section>
      )}

      {phase === "system" && (
        <div className="px-ui px-glass px-key px-key-float" role="note" aria-label="How to read the map">
          <p>Each planet is a portfolio company. Further from the star = longer since its last round.</p>
          {mapKey}
        </div>
      )}

      {phase === "system" && (
        <aside className="px-ui px-glass px-drawer" aria-label="Founders to call">
          <div className="px-dh">
            <h2>Founders to call</h2>
            <p>
              {sel
                ? `${sel.name}: ${sel.founders ? `${sel.founders} founder${sel.founders > 1 ? "s" : ""}` : "no founder confirmed"} · last round ${sel.last ?? "not on record"}`
                : "Drag to rotate the system. Click a planet, or pick a founder."}
            </p>
            <div className="px-key px-key-inline" role="note" aria-label="How to read the map">
              {mapKey}
              <p>Further from the star = longer since the last round.</p>
            </div>
          </div>
          <div className="px-list" ref={listRef} tabIndex={0}>
            {report.complete !== undefined && report.entries.length === 0 && (
              <p className="px-empty">No founders to call yet. None of the checked portfolio companies had a dated round or news with a founder we could confirm.</p>
            )}
            {!visible.some((e) => e.companyId === selCo) && overviewOf(selCo)}
            {visible.map((e) => {
              const key = `${e.companyId}:${e.founder.name}`, isOpen = open.has(key) || key === autoKey;
              const c = skyCompanies.find((x) => x.id === e.companyId);
              return (
                <div key={key} className="px-who" data-cid={e.companyId} data-hl={selCo === e.companyId || !!hlIds?.has(e.companyId)}>
                  <button
                    className="px-row"
                    aria-expanded={isOpen}
                    onClick={() => {
                      setTouchedFund(targetId);
                      setOpen((o) => {
                        const n = new Set(o);
                        if (autoKey) n.add(autoKey); // the card that opened by itself is now the visitor's to keep or close
                        if (isOpen) n.delete(key);
                        else n.add(key);
                        return n;
                      });
                      if (!isOpen) {
                        setSelCo(e.companyId);
                        engine.current?.selectCompany(e.companyId);
                      }
                    }}
                  >
                    <i style={{ background: groupColor(e.group) }} />
                    <span><b>{e.founder.name}</b><span>{e.companyName}</span></span>
                    <small>{c?.last ?? "no date"}</small>
                  </button>
                  {isOpen && overviewOf(e.companyId)}
                  {isOpen && (
                    <div className="px-det">
                      <ul>
                        {e.why.map((w, i) => (
                          <li key={i}>
                            {w.date && <time>{w.date.slice(0, 7)}</time>}
                            {w.text}
                            <div className="px-chips">
                              {w.sources.map((src) => (
                                <a key={src.url} className="px-chip" href={src.url} target="_blank" rel="noopener noreferrer">
                                  {[domain(src.url), src.date?.slice(0, 7)].filter(Boolean).join(" · ")}
                                </a>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                      <p className="px-desc">
                        {e.founder.evidence ? `${e.founder.evidence} · ` : ""}confirmed via {e.founder.via === "cala" ? "Cala" : "web"}
                        {e.founder.sources.length > 0 && (
                          <span className="px-chips">
                            {e.founder.sources.map((src) => (
                              <a key={src.url} className="px-chip" href={src.url} target="_blank" rel="noopener noreferrer">{domain(src.url)}</a>
                            ))}
                          </span>
                        )}
                      </p>
                      <h4>Ask on the call</h4>
                      <ol>{e.questions.map((x, i) => <li key={i}>{x}</li>)}</ol>
                      <div className="px-acts">
                        <button className="px-btn px-primary" onClick={(ev) => copy(e, ev.currentTarget)}>Copy questions</button>
                        {e.founder.linkedinUrl && <a className="px-btn" href={e.founder.linkedinUrl} target="_blank" rel="noopener noreferrer">LinkedIn</a>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      )}

      <div className="px-ui px-glass px-botleft">Helsinki <small>{viewText}</small></div>
      <nav className="px-ui px-glass px-tools" aria-label="View options">
        {phase === "system" ? (
          <>
            <button className="px-tool" data-tip="Return to sky" aria-label="Return to sky" onClick={() => engine.current?.flyOut()}>{Icon.back}</button>
            {GROUPS.map(({ g, label, color }) => (
              <button key={g} className="px-tool" data-tip={label} aria-label={label} aria-pressed={filters[g]} onClick={() => setFilters((f) => ({ ...f, [g]: !f[g] }))}>
                <span className="px-dot" style={{ background: color }} />
              </button>
            ))}
            <button className="px-tool" data-tip="Orbit rings" aria-label="Orbit rings" aria-pressed={orbits} onClick={() => setOrbits((v) => !v)}>{Icon.orbits}</button>
          </>
        ) : (
          <>
            <button className="px-tool" data-tip="Fund labels" aria-label="Fund labels" aria-pressed={labels} onClick={() => setLabels((v) => !v)}>{Icon.labels}</button>
            <button className="px-tool" data-tip="Sky grid" aria-label="Sky grid" aria-pressed={grid} onClick={() => setGrid((v) => !v)}>{Icon.grid}</button>
            <button className="px-tool" data-tip="Reset view" aria-label="Reset view" onClick={() => engine.current?.resetView()}>{Icon.reset}</button>
          </>
        )}
        <button className="px-tool" data-tip="Full screen" aria-label="Full screen" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}>{Icon.full}</button>
      </nav>
      <div className="px-ui px-glass px-botright" aria-hidden>
        <b>{clock?.t ?? "--:--:--"}</b>
        <small>{clock?.d ?? ""}</small>
      </div>
      {toast && (
        <div key={toast.id} className="px-ui px-glass px-toast" role="status">{toast.text}</div>
      )}
    </div>
    </>
  );
}
