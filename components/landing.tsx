"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { SkyFund } from "@/components/sky/engine";

const Rocket = ({ at, rot = 0 }: { at: string; rot?: number }) => (
  <g transform={`translate(${at}) rotate(${rot})`}>
    <path d="M0-15C7-7 7 4 5 10H-5C-7 4-7-7 0-15Z" />
    <path d="M-5 3-11 13-5 10M5 3 11 13 5 10" />
    <circle cx="0" cy="-3" r="2.2" />
  </g>
);
const Dots = ({ at }: { at: [number, number][] }) => (
  <g fill="currentColor" stroke="none" opacity="0.55">
    {at.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 ? 0.9 : 1.4} />)}
  </g>
);

/** The story, one frame each. Line art only: the sky stays the picture, these are diagrams of it. */
const PANELS: { tag: string; title: string; text: string; quote?: string; art: ReactNode }[] = [
  {
    tag: "Day 0",
    title: "The term sheet",
    text: "A fund offers to lead your round. Its website shows the winners. So does its deck. You sign.",
    art: (
      <>
        <Dots at={[[30, 24], [58, 70], [196, 30], [214, 84], [176, 100]]} />
        <rect x="88" y="14" width="64" height="92" rx="3" />
        <path d="M98 30h44M98 42h44M98 54h30" opacity="0.5" />
        <path d="M98 88c6-12 9 6 14-4s7 8 12-2 6 4 14 2" />
        <path d="M98 96h44" opacity="0.5" />
      </>
    ),
  },
  {
    tag: "Month 1",
    title: "Launch",
    text: "The money lands and the team doubles. You plan the next two years around one promise.",
    quote: "We back our founders all the way.",
    art: (
      <>
        <Dots at={[[24, 20], [70, 44], [210, 18], [190, 60], [40, 84]]} />
        <path d="M20 106h200" opacity="0.5" />
        <path d="M120 104V58" strokeDasharray="2 5" />
        <Rocket at="120 38" />
        <path d="M150 104C196 84 206 40 176 12" strokeDasharray="1 6" opacity="0.5" />
      </>
    ),
  },
  {
    tag: "Month 14",
    title: "Radio silence",
    text: "Growth is slower than planned. You ask about the bridge round they talked about. Replies take a week. Then they stop.",
    art: (
      <>
        <Dots at={[[20, 30], [104, 16], [150, 96], [226, 22]]} />
        <Rocket at="52 70" rot={62} />
        <path d="M76 52a26 26 0 0 1 0 36" opacity="0.9" />
        <path d="M92 42a42 42 0 0 1 0 56" opacity="0.55" />
        <path d="M108 32a58 58 0 0 1 0 76" opacity="0.25" />
        <circle cx="196" cy="70" r="9" />
        <path d="M196 79v16M184 95h24" />
        <path d="M134 70h36" strokeDasharray="2 6" opacity="0.4" />
      </>
    ),
  },
  {
    tag: "Month 16",
    title: "The signal",
    text: "Every new investor asks the same question. When the honest answer is no, they pass, one by one.",
    quote: "Is your lead investing again?",
    art: (
      <>
        <Dots at={[[22, 18], [120, 104], [228, 60]]} />
        <Rocket at="44 60" rot={90} />
        {[24, 60, 96].map((y) => (
          <g key={y}>
            <path d={`M70 60 L168 ${y}`} strokeDasharray="2 6" opacity="0.5" />
            <path d={`M172 ${y - 7}v14`} />
            <circle cx="194" cy={y} r="8" opacity="0.6" />
          </g>
        ))}
      </>
    ),
  },
  {
    tag: "Month 20",
    title: "Out of fuel",
    text: "Six months of runway becomes none. A working product and a good team drift to a stop.",
    art: (
      <>
        <Dots at={[[26, 26], [60, 92], [214, 96]]} />
        <path d="M70 96a50 50 0 0 1 100 0" />
        <path d="M70 96h8M162 96h8M120 46v8M85 61l5 5M155 61l-5 5" opacity="0.6" />
        <path d="M120 96 80 84" strokeWidth="2.2" />
        <circle cx="120" cy="96" r="3" fill="currentColor" />
        <Rocket at="198 36" rot={128} />
      </>
    ),
  },
  {
    tag: "All along",
    title: "Other founders to ask",
    text: "Public records can help you find founders outside the fund’s chosen references. Ask about their experience; a funding date cannot tell the whole story.",
    art: (
      <>
        <Dots at={[[16, 96], [228, 16], [120, 12]]} />
        <path d="M28 44 70 76 112 40 150 84 190 52 216 88" opacity="0.5" />
        <g fill="currentColor" stroke="none">
          {[[28, 44], [70, 76], [112, 40], [150, 84], [190, 52], [216, 88]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === 2 ? 4 : 2.4} />)}
        </g>
        <g stroke="var(--quiet)">
          <circle cx="70" cy="76" r="9" /><circle cx="150" cy="84" r="9" /><circle cx="216" cy="88" r="9" />
        </g>
      </>
    ),
  },
];

const STEPS = [
  { title: "Name the fund", text: "Type any VC fund. Parallax maps the recorded portfolio in Cala and researches contacts, with the coverage shown on each report." },
  { title: "See the whole system", text: "Every portfolio company becomes a planet around the fund's star. The further out it orbits, the longer since its last recorded round." },
  { title: "Call the founders", text: "Where a founder is confirmed: who they are, the dated facts with their sources, and three questions to ask on the call." },
];

const SLIDES = ["Start", "The problem", "The problem, continued", "How it works", "Made possible by", "Fly"];
const clampSlide = (n: number) => Math.max(0, Math.min(SLIDES.length - 1, n));

/** The landing page: a deck of slides on a veil over the live sky. The Fly button is a porthole in the veil; flying zooms through it. */
export function Landing({ funds, onEnter, onSkip }: { funds: SkyFund[]; onEnter: (query: string) => void; onSkip: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [going, setGoing] = useState(false);
  const [slide, setSlide] = useState(0);
  const shown = useRef(0);
  const wheel = useRef({ last: 0, lock: 0, spent: 0, inner: 0, sum: 0 });
  const touch = useRef<{ y: number; top: boolean; bottom: boolean } | null>(null);
  const step = (d: number) => setSlide((n) => clampSlide(n + d));

  // a return visit (/#sky, e.g. back from a report) goes straight to the sky; CSS :target hides the veil before hydration
  useLayoutEffect(() => {
    if (location.hash === "#sky") onSkip();
  }, [onSkip]);

  // the porthole of the slide on show is a hole in the veil, so the live sky shows through; it closes for a slide change and opens on the new one
  useEffect(() => {
    const el = root.current!;
    const sec = el.querySelectorAll<HTMLElement>("section")[slide];
    let settled = false;
    const place = () => {
      const port = sec.querySelector<HTMLElement>(".lp-port");
      if (!settled || !port) return;
      const r = port.getBoundingClientRect();
      el.style.setProperty("--hx", `${r.left + r.width / 2}px`);
      el.style.setProperty("--hy", `${r.top + r.height / 2}px`);
      el.style.setProperty("--hr", `${port.clientWidth / 2}px`);
    };
    el.style.setProperty("--hr", "0px");
    // measured once the slide has stopped moving
    const t = setTimeout(() => {
      settled = true;
      place();
    }, 660);
    const ro = new ResizeObserver(place);
    ro.observe(el);
    ro.observe(sec.firstElementChild!);
    el.addEventListener("scroll", place, true); // a slide taller than a small screen scrolls inside itself
    document.fonts.ready.then(place);
    if (shown.current !== slide) {
      shown.current = slide;
      sec.focus({ preventScroll: true }); // the control that had focus is on the slide that left
    }
    return () => {
      clearTimeout(t);
      ro.disconnect();
      el.removeEventListener("scroll", place, true);
    };
  }, [slide]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (root.current?.inert || (e.target as HTMLElement).closest?.("input") || e.ctrlKey || e.metaKey || e.altKey) return;
      const d = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      setSlide((n) => clampSlide(n + d));
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  /** Can the slide on show still scroll inside itself that way? Then the gesture belongs to it, not to the deck. */
  const room = () => {
    const sec = root.current!.querySelectorAll<HTMLElement>("section")[slide];
    return { top: sec.scrollTop <= 2, bottom: sec.scrollTop + sec.clientHeight >= sec.scrollHeight - 2 };
  };
  /**
   * One slide per wheel gesture and direction. A trackpad sends many small deltas, so a swipe is judged on their running
   * sum; and it keeps sending fading momentum for a second or more after the fingers leave, so once the deck has moved
   * one way, further movement that way is ignored until the stream pauses. Movement the other way is a new swipe.
   */
  function onWheel(e: WheelEvent) {
    const w = wheel.current;
    if (!e.deltaY) return;
    if (e.timeStamp - w.last > 160) Object.assign(w, { spent: 0, inner: 0, sum: 0 }); // a pause: everything starts afresh
    w.last = e.timeStamp;
    const dir = Math.sign(e.deltaY), sec = root.current!.querySelectorAll<HTMLElement>("section")[slide];
    const left = dir > 0 ? sec.scrollHeight - sec.clientHeight - sec.scrollTop : sec.scrollTop; // what the slide can still scroll that way
    if (left > 2) {
      // the slide is scrolling inside itself; more than a sliver of it and the rest of this swipe is the slide's own
      if (left > 40) w.inner = dir;
      w.sum = 0;
      return;
    }
    if (w.spent === dir || w.inner === dir || e.timeStamp < w.lock) return;
    w.sum = Math.sign(w.sum) === dir ? w.sum + e.deltaY : e.deltaY;
    if (Math.abs(w.sum) < 40) return;
    Object.assign(w, { spent: dir, sum: 0, lock: e.timeStamp + 600 });
    step(dir);
  }

  async function go(port: HTMLElement) {
    if (going) return;
    setGoing(true);
    const el = root.current!;
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const r = port.getBoundingClientRect();
      const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
      const far = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      el.style.transformOrigin = `${x}px ${y}px`;
      // the "Fly" text fades first (CSS, .lp-go), then the camera goes through the window
      const zoom = { transform: ["scale(1)", `scale(${(far / (port.clientWidth / 2)) * 1.08})`] };
      await el.animate(zoom, { duration: 450, delay: 80, easing: "cubic-bezier(0.7, 0, 0.84, 0)", fill: "forwards" }).finished;
    }
    onEnter(q.trim());
  }

  const on = (i: number) => ({ "data-on": slide === i ? "" : undefined, tabIndex: -1 });
  const panels = (from: number) => (
    <ol className={from ? "lp-panels lp-rev" : "lp-panels"} start={from + 1}>
      {PANELS.slice(from, from + 3).map((p, i) => (
        <li key={p.title} className="lp-panel">
          <span className="lp-tag">{String(from + i + 1).padStart(2, "0")} · {p.tag}</span>
          <svg viewBox="0 0 240 120" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{p.art}</svg>
          <h3>{p.title}</h3>
          <p>{p.text}</p>
          {p.quote && <q>{p.quote}</q>}
        </li>
      ))}
    </ol>
  );

  return (
    <div
      ref={root}
      className={going ? "lp lp-go" : "lp"}
      inert={going}
      onWheel={(e) => onWheel(e.nativeEvent)}
      onTouchStart={(e) => (touch.current = { y: e.touches[0].clientY, ...room() })}
      onTouchEnd={(e) => {
        const t = touch.current, dy = t ? t.y - e.changedTouches[0].clientY : 0;
        touch.current = null;
        if (t && Math.abs(dy) > 60 && (dy > 0 ? t.bottom : t.top)) step(dy > 0 ? 1 : -1);
      }}
    >
      <main>
        <section className="lp-hero" aria-label="Parallax" {...on(0)}>
          <div className="lp-in">
            <p className="lp-eyebrow"><b>Parallax</b> · reference checks for VC funds</p>
            <h1>Every fund shows you its brightest stars. <em>See the whole sky.</em></h1>
            <p className="lp-lede">
              Before you take a fund&apos;s money, hear from the founders who already did. Name a fund: Parallax maps the recorded portfolio and
              tells you which founders to call, why, and what to ask.
            </p>
            <div className="lp-row">
              <form
                id="lp-form"
                className="lp-search"
                role="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  go(e.currentTarget.parentElement!.querySelector<HTMLElement>(".lp-port")!);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <input value={q} onChange={(e) => setQ(e.target.value)} list="lp-funds" placeholder="Which fund are you about to sign with?" aria-label="Search a venture fund" autoComplete="off" />
                <datalist id="lp-funds">{funds.map((f) => <option key={f.id} value={f.name} />)}</datalist>
              </form>
              <button className="lp-port" form="lp-form" aria-label={q.trim() ? `Fly to ${q.trim()}` : "Fly to the sky"}><span>Fly</span></button>
            </div>
            <p className="lp-try">
              In the sky tonight:
              {funds.map((f) => (
                <button key={f.id} type="button" aria-pressed={q === f.name} onClick={() => setQ(f.name)}>{f.name}</button>
              ))}
            </p>
          </div>
          <button type="button" className="lp-scroll" onClick={() => step(1)}>
            Why it matters
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 5v14M6 13l6 6 6-6" /></svg>
          </button>
        </section>

        <section aria-labelledby="lp-story-h" {...on(1)}>
          <div className="lp-in">
            <p className="lp-eyebrow">The problem</p>
            <h2 id="lp-story-h">A term sheet is only the beginning.</h2>
            <p className="lp-lede">The fund chooses the references you meet. Other founders may have different experiences. An illustrative scenario:</p>
            {panels(0)}
          </div>
        </section>

        <section aria-label="The problem, continued" {...on(2)}>
          <div className="lp-in">
            <p className="lp-eyebrow">The problem · continued</p>
            {panels(3)}
            <p className="lp-punch">Hear more than one experience before you sign. <em>Parallax finds them for you.</em></p>
          </div>
        </section>

        <section aria-labelledby="lp-how-h" {...on(3)}>
          <div className="lp-in">
            <p className="lp-eyebrow">How it works</p>
            <h2 id="lp-how-h">From a fund&apos;s name to a call list.</h2>
            <ol className="lp-steps">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span>{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
            <ul className="lp-legend" aria-label="What a planet's colour means">
              <li><i style={{ background: "var(--news)" }} />News found</li>
              <li><i style={{ background: "var(--quiet)" }} />No recorded round in 24+ months</li>
              <li><i style={{ background: "var(--recent)" }} />Raised again recently</li>
            </ul>
            <p className="lp-note">
              Facts, never verdicts: every fact links to its source, and a missing round is not evidence of failure. It is a reason to ask.
            </p>
            <p className="lp-name">
              <b>Why &ldquo;Parallax&rdquo;?</b> Astronomers measure a star&apos;s true distance by looking at it from a second position. For a fund, the second
              position is the founders it already backed.
            </p>
          </div>
        </section>

        <section className="lp-by" aria-labelledby="lp-by-h" {...on(4)}>
          <div className="lp-in">
            <h2 id="lp-by-h" className="lp-eyebrow">Made possible by</h2>
            <div className="lp-marks">
              <a href="https://cala.ai" target="_blank" rel="noopener noreferrer">
                <b>Cala</b>
                <span>The knowledge graph. Funds, their portfolios and every recorded round.</span>
              </a>
              <a href="https://exa.ai" target="_blank" rel="noopener noreferrer">
                <b>Exa</b>
                <span>The web search. Looks for each company&apos;s founders and finds the news, with a source for every fact.</span>
              </a>
            </div>
            <p className="lp-note">Call questions are drafted by Gemini, only from the retrieved facts. Built at Junction 2026.</p>
          </div>
        </section>

        <section className="lp-end" aria-labelledby="lp-end-h" {...on(5)}>
          <div className="lp-in">
            <h2 id="lp-end-h">Before you sign, look up.</h2>
            <button type="button" className="lp-port" aria-label="Fly to the sky" onClick={(e) => go(e.currentTarget)}><span>Fly</span></button>
          </div>
        </section>
      </main>
      <nav className="lp-dots" aria-label="Slides">
        {SLIDES.map((name, i) => (
          <button key={name} type="button" aria-label={`${i + 1} of ${SLIDES.length}: ${name}`} aria-current={slide === i} onClick={() => setSlide(i)} />
        ))}
      </nav>
    </div>
  );
}
