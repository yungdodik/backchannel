// Parallax sky engine: a canvas-only renderer with no React inside.
// Mode "sky": a Stellarium-style celestial sphere (stereographic projection) with the funds as stars.
// Mode "system": a perspective 3D scene of one fund, its portfolio companies orbiting it.
// Orbit radius = time since the last recorded round (a fact, never a verdict, D6).
import type { CallGroup } from "@/lib/types";

export type Group = CallGroup | "none" | "pending";

export interface SkyFund {
  id: string;
  name: string;
  companies?: number;
  calls?: number;
}

export interface SkyCompany {
  id: string;
  name: string;
  last?: string; // YYYY-MM
  months: number | null; // since the last recorded round
  founders: number;
  group: Group;
}

export interface EngineCallbacks {
  onSelectFund(id: string | null): void;
  onSelectCompany(id: string): void;
  onArrive(id: string): void;
  onReturned(): void;
  onView(text: string): void;
}

type Vec = [number, number, number];
type Pt = [number, number, number];
type Mode = "sky" | "flying" | "system";

const D2R = Math.PI / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const out4 = (t: number) => 1 - Math.pow(1 - t, 4);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dir = (az: number, alt: number): Vec => {
  const a = az * D2R, h = alt * D2R;
  return [Math.cos(h) * Math.sin(a), Math.sin(h), Math.cos(h) * Math.cos(a)];
};
function rnd(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) | 0) >>> 0) / 4294967296;
}
export function hash(s: string, k = 0) {
  let h = 2166136261 ^ k;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}

const RGB: Record<Group, [number, number, number]> = {
  news_event: [236, 120, 92],
  no_recent_round: [238, 196, 104],
  recent_round: [96, 214, 206],
  none: [132, 136, 156],
  pending: [96, 100, 120],
};
const RINGS: [number | null, string][] = [[12, "1 yr"], [24, "2 yr"], [48, "4 yr"], [96, "8 yr"], [null, "no recorded round"]];
const radiusFor = (mo: number | null) => (mo == null ? 1 : 0.22 + 0.72 * Math.sqrt(Math.min(mo, 144) / 144));

interface Star { v: Vec; m: number; t: number; hue: number; band?: boolean }
interface FundStar extends SkyFund { az: number; alt: number; v: Vec; p?: Pt | null; r: number }
interface Planet { c: SkyCompany; ang: number; y: number; size: number; speed: number; born: number; x?: number; yy?: number; r?: number }
interface House { az: number; w: number; wall: number; roof: number; chimney: boolean; windows: { u: number; v: number; lit: boolean; t: number }[] }
interface Flight { t0: number; dur: number; from: View; to: View; p: number; streak: number; dir: 1 | -1 }
interface View { yaw: number; pitch: number; fov: number }

export class SkyEngine {
  private cx: CanvasRenderingContext2D;
  private sans = "system-ui, sans-serif";
  private mono = "ui-monospace, monospace";
  private W = 0;
  private H = 0;
  private raf = 0;
  private lastT = 0;
  private mode: Mode = "sky";
  private home: View;
  private view: View;
  private vel = { yaw: 0, pitch: 0 };
  private orb = { yaw: 0.55, pitch: 0.42, dist: 3.1 };
  private orbVel = { yaw: 0, pitch: 0 };
  private stars: Star[] = [];
  private band: { B: Vec; C: Vec } = { B: [1, 0, 0], C: [0, 1, 0] };
  private tree: number[] = [];
  private houses: House[] = [];
  private funds: FundStar[] = [];
  private target: FundStar | null = null;
  private selFund: string | null = null;
  private hovered: FundStar | Planet | null = null;
  private flight: Flight | null = null;
  private planets = new Map<string, Planet>();
  private queue: SkyCompany[] = [];
  private nextReveal = 0;
  private sysStart = 0;
  private spin = 0;
  private flash = 0;
  private selCo: string | null = null;
  private drag: { x: number; y: number; lx: number; ly: number; moved: boolean } | null = null;
  labels = true;
  grid = false;
  orbits = true;
  filters: Record<Group, boolean> = { news_event: true, no_recent_round: true, recent_round: true, none: true, pending: true };

  constructor(
    private canvas: HTMLCanvasElement,
    private tip: HTMLElement,
    private cb: EngineCallbacks,
    private reduce: boolean,
  ) {
    this.cx = canvas.getContext("2d")!;
    const css = getComputedStyle(document.documentElement);
    const fam = (v: string, fb: string) => (css.getPropertyValue(v).trim() ? `${css.getPropertyValue(v).trim()}, ${fb}` : fb);
    this.sans = fam("--font-geist-sans", this.sans);
    this.mono = fam("--font-geist-mono", this.mono);
    const narrow = innerWidth < 700;
    this.home = narrow ? { yaw: 0, pitch: 36, fov: 100 } : { yaw: 0, pitch: 24, fov: 110 };
    this.view = { ...this.home };
    this.build();
    this.size();
    addEventListener("resize", this.size);
    canvas.addEventListener("pointerdown", this.down);
    canvas.addEventListener("pointermove", this.move);
    canvas.addEventListener("pointerup", this.up);
    canvas.addEventListener("pointerleave", this.leave);
    canvas.addEventListener("wheel", this.wheel, { passive: false });
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    removeEventListener("resize", this.size);
    this.canvas.removeEventListener("pointerdown", this.down);
    this.canvas.removeEventListener("pointermove", this.move);
    this.canvas.removeEventListener("pointerup", this.up);
    this.canvas.removeEventListener("pointerleave", this.leave);
    this.canvas.removeEventListener("wheel", this.wheel);
  }

  /* ---------------- public API ---------------- */

  setFunds(list: SkyFund[]) {
    const narrow = innerWidth < 700;
    const spots = narrow
      ? [[12, 47], [-12, 62], [17, 30], [-8, 22], [-17, 38]]
      : [[16, 40], [-28, 52], [52, 26], [2, 20], [-50, 27]];
    this.funds = list.map((f, i) => {
      const [az, alt] = spots[i] ?? [lerp(-60, 70, hash(f.id)), lerp(18, 60, hash(f.id, 3))];
      const old = this.funds.find((o) => o.id === f.id);
      return { ...f, az, alt, v: dir(az, alt), r: old?.r ?? 16 };
    });
    if (this.target) this.target = this.funds.find((f) => f.id === this.target!.id) ?? this.target;
  }

  /** Fly from the sky to a fund's star; the system appears on arrival. */
  flyTo(id: string) {
    const s = this.funds.find((f) => f.id === id);
    if (!s || this.flight) return;
    if (this.mode === "system") this.clearSystem();
    this.selFund = null;
    this.target = s;
    this.mode = "flying";
    this.hovered = null;
    delete this.tip.dataset.on;
    this.vel = { yaw: 0, pitch: 0 };
    const dy = ((((s.az - this.view.yaw) % 360) + 540) % 360) - 180; // shortest way round
    this.flight = { t0: performance.now(), dur: this.reduce ? 1 : 2700, from: { ...this.view }, to: { yaw: this.view.yaw + dy, pitch: s.alt, fov: 2.2 }, p: 0, streak: 0, dir: 1 };
  }

  flyOut() {
    if (this.flight || this.mode !== "system" || !this.target) return;
    this.clearSystem();
    this.mode = "flying";
    this.flight = { t0: performance.now(), dur: this.reduce ? 1 : 1900, from: { ...this.view }, to: { yaw: this.target.az, pitch: this.home.pitch, fov: this.home.fov }, p: 0, streak: 0, dir: -1 };
  }

  /** Sync the portfolio. New companies are revealed one by one; known ones update in place. */
  setCompanies(list: SkyCompany[]) {
    for (const c of list) {
      const p = this.planets.get(c.id);
      if (p) p.c = c;
      else if (!this.queue.some((q) => q.id === c.id)) this.queue.push(c);
      else this.queue = this.queue.map((q) => (q.id === c.id ? c : q));
    }
  }

  selectCompany(id: string | null) {
    this.selCo = id;
  }

  resetView() {
    this.view = { ...this.home };
  }

  /* ---------------- world ---------------- */

  private build() {
    const r = rnd(11);
    for (let i = 0; i < 5200; i++) {
      const u = r() * 2 - 1, th = r() * 6.283, s = Math.sqrt(1 - u * u);
      this.stars.push({ v: [s * Math.cos(th), u, s * Math.sin(th)], m: Math.pow(r(), 3), t: r() * 6, hue: r() });
    }
    // Milky Way: a dense band of faint stars around a tilted great circle
    const n0: Vec = [0.38, 0.86, -0.34], ln = Math.hypot(...n0), N = n0.map((x) => x / ln) as Vec;
    const b0: Vec = [0, N[2], -N[1]], lb = Math.hypot(...b0), B = b0.map((x) => x / lb) as Vec;
    const C: Vec = [N[1] * B[2] - N[2] * B[1], N[2] * B[0] - N[0] * B[2], N[0] * B[1] - N[1] * B[0]];
    this.band = { B, C };
    for (let i = 0; i < 6500; i++) {
      const th = r() * 6.283, off = (r() + r() + r() - 1.5) * 0.16;
      const v = [0, 1, 2].map((j) => B[j] * Math.cos(th) + C[j] * Math.sin(th) + N[j] * off);
      const l = Math.hypot(...v);
      this.stars.push({ v: v.map((x) => x / l) as Vec, m: Math.pow(r(), 5) * 0.6, t: r() * 6, hue: 0.2 + r() * 0.6, band: true });
    }
    // Finnish houses on the horizon: gabled wooden houses and saunas with lit windows
    const hr = rnd(23);
    const spotsAz = [-38, -31, -9, -3, 8, 27, 34, 61, 118, 164, 171, 236, 300, 322];
    this.houses = spotsAz.map((az) => {
      const w = 2.4 + hr() * 2.6, wall = 1.2 + hr() * 1, sauna = hr() < 0.3;
      const cols = sauna ? 1 : 1 + Math.floor(hr() * 3);
      const windows = Array.from({ length: cols }, (_, i) => ({ u: (i + 1) / (cols + 1), v: 0.45, lit: hr() < 0.78, t: hr() * 100 }));
      return { az, w: sauna ? w * 0.6 : w, wall: sauna ? wall * 0.75 : wall, roof: (sauna ? 0.6 : 1) + hr() * 0.8, chimney: sauna || hr() < 0.5, windows };
    });
    // treeline in degrees of altitude, lowered into clearings around the houses
    const tr = rnd(5);
    let h = 1;
    for (let az = 0; az <= 360; az += 1.5) {
      h = clamp(h + (tr() - 0.5) * 0.9, 0.3, 3.2);
      const spike = tr() < 0.06 ? 1.5 + tr() * 3 : 0;
      const near = Math.min(...this.houses.map((ho) => Math.abs(((((az - ho.az) % 360) + 540) % 360) - 180) - ho.w));
      const clearing = clamp(near / 3, 0.15, 1);
      this.tree.push((h + spike) * clearing);
    }
  }

  private size = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.W = innerWidth;
    this.H = innerHeight;
    this.canvas.width = this.W * dpr;
    this.canvas.height = this.H * dpr;
    this.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  /* ---------------- projections ---------------- */

  private project(v: Vec, fov = this.view.fov): Pt | null {
    const y0 = this.view.yaw * D2R, p0 = this.view.pitch * D2R;
    const x1 = v[0] * Math.cos(y0) - v[2] * Math.sin(y0), z1 = v[0] * Math.sin(y0) + v[2] * Math.cos(y0), y1 = v[1];
    const y2 = y1 * Math.cos(p0) - z1 * Math.sin(p0), z2 = y1 * Math.sin(p0) + z1 * Math.cos(p0);
    if (z2 < -0.55) return null;
    const k = (Math.max(Math.min(this.W, this.H), this.H * 0.72) * 0.5) / Math.tan((fov * D2R) / 4);
    return [this.W / 2 + (k * x1) / (1 + z2), this.H / 2 - (k * y2) / (1 + z2), z2];
  }

  private camBasis() {
    const { yaw, pitch, dist } = this.orb, cp = Math.cos(pitch);
    const C: Vec = [dist * cp * Math.sin(yaw), dist * Math.sin(pitch), dist * cp * Math.cos(yaw)];
    const f = C.map((x) => -x / dist) as Vec;
    const r0: Vec = [f[2], 0, -f[0]], lr = Math.hypot(...r0), r = r0.map((x) => x / lr) as Vec;
    const u: Vec = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    return { C, f, r, u };
  }

  private p3(P: Vec, B: ReturnType<SkyEngine["camBasis"]>, cxp: number, cyp: number, F: number): Pt | null {
    const d = [P[0] - B.C[0], P[1] - B.C[1], P[2] - B.C[2]];
    const z = d[0] * B.f[0] + d[1] * B.f[1] + d[2] * B.f[2];
    if (z < 0.05) return null;
    const x = d[0] * B.r[0] + d[1] * B.r[1] + d[2] * B.r[2], y = d[0] * B.u[0] + d[1] * B.u[1] + d[2] * B.u[2];
    return [cxp + (F * x) / z, cyp - (F * y) / z, z];
  }

  private sysCenter(): [number, number] {
    return [this.W / 2, this.W < 860 ? this.H * 0.4 : this.H * 0.5];
  }

  /* ---------------- drawing ---------------- */

  private frame = (t: number) => {
    try {
      this.draw(t);
    } catch (e) {
      console.error(e);
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private draw(t: number) {
    const dt = Math.min(64, t - this.lastT) || 16;
    this.lastT = t;
    if (this.flight) this.stepFlight(t);
    if (!this.drag && !this.flight && !this.reduce) {
      if (this.mode === "sky") {
        this.view.yaw += this.vel.yaw;
        this.view.pitch = clamp(this.view.pitch + this.vel.pitch, -4, 88);
        this.vel.yaw *= 0.93;
        this.vel.pitch *= 0.93;
      }
      if (this.mode === "system") {
        this.orb.yaw += this.orbVel.yaw + 0.00004 * dt;
        this.orb.pitch = clamp(this.orb.pitch + this.orbVel.pitch, 0.06, 1.45);
        this.orbVel.yaw *= 0.94;
        this.orbVel.pitch *= 0.94;
      }
    }
    if (this.mode === "system") {
      if (!this.reduce) this.spin += dt / 1000;
      this.reveal(t);
    }
    const cx = this.cx;
    cx.clearRect(0, 0, this.W, this.H);
    if (this.mode === "system" && this.target) {
      // backdrop: a wider view around the star that turns with the system (parallax)
      const saved = { ...this.view };
      this.view = { yaw: this.target.az + this.orb.yaw * 24, pitch: clamp(this.target.alt + (this.orb.pitch - 0.42) * 30, -80, 88), fov: 75 };
      this.drawSphere(t, 0);
      this.view = saved;
    } else this.drawSphere(t, this.flight && !this.reduce ? this.flight.streak : 0);
    if (this.grid && this.mode === "sky") this.drawGrid();
    if (this.mode !== "system") this.drawFunds(t, this.labels && this.mode === "sky");
    this.drawSystem(t);
    this.drawGround(t, this.mode === "sky" ? 1 : this.flight ? clamp(1 - this.flight.p * 2.2, 0, 1) : 0);
    if (this.flash && !this.reduce) {
      const k = (t - this.flash) / 650;
      if (k < 1 && k >= 0) {
        const [x0, y0] = this.sysCenter(), rr = Math.max(this.W, this.H) * (0.12 + k * 0.9);
        const g = cx.createRadialGradient(x0, y0, 0, x0, y0, rr);
        g.addColorStop(0, `rgba(255,246,226,${0.85 * (1 - k)})`);
        g.addColorStop(1, "rgba(255,246,226,0)");
        cx.fillStyle = g;
        cx.fillRect(0, 0, this.W, this.H);
      } else if (k >= 1) this.flash = 0;
    }
  }

  private drawSphere(t: number, streak: number) {
    const cx = this.cx, { W, H } = this;
    const hz = this.project(dir(this.view.yaw, 0)), gy = hz ? hz[1] : H * 1.2;
    const g = cx.createLinearGradient(0, Math.min(0, gy - H), 0, Math.max(H, gy));
    g.addColorStop(0, "#04060d");
    g.addColorStop(0.75, "#0d1328");
    g.addColorStop(1, "#1d2747");
    cx.fillStyle = g;
    cx.fillRect(0, 0, W, H);
    const { B, C } = this.band;
    for (let k = 0; k < 24; k++) {
      const th = (k / 24) * 6.283;
      const p = this.project([0, 1, 2].map((j) => B[j] * Math.cos(th) + C[j] * Math.sin(th)) as Vec);
      if (!p) continue;
      const rad = Math.min(W, H) * 0.22 * (110 / this.view.fov);
      const gl = cx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad);
      gl.addColorStop(0, "rgba(150,165,220,.07)");
      gl.addColorStop(1, "rgba(150,165,220,0)");
      cx.fillStyle = gl;
      cx.fillRect(p[0] - rad, p[1] - rad, rad * 2, rad * 2);
    }
    const zoom = Math.max(1, 110 / this.view.fov);
    for (const s of this.stars) {
      const p = this.project(s.v);
      if (!p || p[0] < -20 || p[0] > W + 20 || p[1] < -20 || p[1] > H + 20) continue;
      const tw = this.reduce ? 1 : 0.72 + 0.28 * Math.sin(t / 700 + s.t);
      const a = (s.band ? 0.25 + s.m : 0.3 + s.m * 0.7) * tw;
      const c = s.hue < 0.12 ? "255,212,170" : s.hue > 0.88 ? "175,198,255" : "255,248,236";
      const r = (0.35 + s.m * 1.5) * Math.min(zoom, 2.6) ** 0.5;
      if (streak) {
        const q = this.project(s.v, this.view.fov * streak);
        if (q) {
          cx.strokeStyle = `rgba(${c},${a})`;
          cx.lineWidth = r;
          cx.beginPath();
          cx.moveTo(q[0], q[1]);
          cx.lineTo(p[0], p[1]);
          cx.stroke();
          continue;
        }
      }
      cx.fillStyle = `rgba(${c},${a})`;
      cx.beginPath();
      cx.arc(p[0], p[1], r, 0, 6.283);
      cx.fill();
    }
  }

  private quad(a: Pt | null, b: Pt | null, c: Pt | null, d: Pt | null) {
    if (!a || !b || !c || !d) return false;
    const cx = this.cx;
    cx.moveTo(a[0], a[1]);
    cx.lineTo(b[0], b[1]);
    cx.lineTo(c[0], c[1]);
    cx.lineTo(d[0], d[1]);
    cx.closePath();
    return true;
  }

  private drawGround(t: number, fade: number) {
    if (fade <= 0) return;
    const cx = this.cx, P = (az: number, alt: number) => this.project(dir(az, alt));
    cx.save();
    cx.globalAlpha = fade;
    for (let alt = 0; alt < 18; alt += 3) {
      cx.fillStyle = `rgba(70,96,170,${0.11 * (1 - alt / 18)})`;
      cx.beginPath();
      let any = false;
      for (let az = 0; az < 360; az += 6) any = this.quad(P(az, alt), P(az + 6, alt), P(az + 6, alt + 3), P(az, alt + 3)) || any;
      if (any) cx.fill();
    }
    cx.fillStyle = "#020307";
    cx.beginPath();
    for (let i = 0; i < this.tree.length - 1; i++) {
      const az = i * 1.5;
      for (let alt = -90; alt < 0; alt += 15) {
        const top = alt + 15 >= 0 ? this.tree[i] : alt + 15, top2 = alt + 15 >= 0 ? this.tree[i + 1] : alt + 15;
        this.quad(P(az, alt), P(az + 1.6, alt), P(az + 1.6, top2), P(az, top));
      }
    }
    // houses: wall + gable roof + chimney, same silhouette colour as the ground
    for (const h of this.houses) {
      const a0 = h.az - h.w / 2, a1 = h.az + h.w / 2, base = -0.4;
      this.quad(P(a0, base), P(a1, base), P(a1, h.wall), P(a0, h.wall));
      const l = P(a0 - h.w * 0.08, h.wall), r = P(a1 + h.w * 0.08, h.wall), top = P(h.az, h.wall + h.roof);
      if (l && r && top) {
        cx.moveTo(l[0], l[1]);
        cx.lineTo(top[0], top[1]);
        cx.lineTo(r[0], r[1]);
        cx.closePath();
      }
      if (h.chimney) {
        const c0 = h.az + h.w * 0.18, cw = h.w * 0.09;
        this.quad(P(c0, h.wall), P(c0 + cw, h.wall), P(c0 + cw, h.wall + h.roof * 0.95), P(c0, h.wall + h.roof * 0.95));
      }
    }
    cx.fill();
    // lit windows: warm light with a soft glow, flickering now and then
    for (const h of this.houses) {
      const a0 = h.az - h.w / 2;
      for (const wdw of h.windows) {
        if (!wdw.lit) continue;
        const flick = this.reduce ? 1 : 0.85 + 0.15 * Math.sin(t / 900 + wdw.t) * (Math.sin(t / 3100 + wdw.t * 2) > 0.97 ? 3 : 1);
        const wa = a0 + h.w * wdw.u, ww = Math.min(0.42, h.w * 0.16), wh = h.wall * 0.34, wv = h.wall * wdw.v - wh / 2;
        const p = P(wa, wv + wh / 2);
        if (!p) continue;
        const q1 = P(wa - ww / 2, wv), q2 = P(wa + ww / 2, wv + wh);
        if (!q1 || !q2) continue;
        const gw = Math.max(6, Math.abs(q2[0] - q1[0]) * 3);
        const g = cx.createRadialGradient(p[0], p[1], 0, p[0], p[1], gw);
        g.addColorStop(0, `rgba(255,190,110,${0.38 * flick})`);
        g.addColorStop(1, "rgba(255,190,110,0)");
        cx.fillStyle = g;
        cx.fillRect(p[0] - gw, p[1] - gw, gw * 2, gw * 2);
        cx.fillStyle = `rgba(255,208,130,${0.95 * flick})`;
        cx.beginPath();
        this.quad(P(wa - ww / 2, wv), P(wa + ww / 2, wv), P(wa + ww / 2, wv + wh), P(wa - ww / 2, wv + wh));
        cx.fill();
        // window cross
        cx.strokeStyle = "rgba(2,3,7,.85)";
        cx.lineWidth = 1;
        const m1 = P(wa, wv), m2 = P(wa, wv + wh), m3 = P(wa - ww / 2, wv + wh / 2), m4 = P(wa + ww / 2, wv + wh / 2);
        if (m1 && m2 && m3 && m4 && Math.abs(q2[0] - q1[0]) > 5) {
          cx.beginPath();
          cx.moveTo(m1[0], m1[1]);
          cx.lineTo(m2[0], m2[1]);
          cx.moveTo(m3[0], m3[1]);
          cx.lineTo(m4[0], m4[1]);
          cx.stroke();
        }
      }
    }
    cx.font = "600 19px " + this.sans;
    cx.textAlign = "center";
    cx.fillStyle = "rgba(214,92,84,.95)";
    for (const [az, l] of [[0, "N"], [90, "E"], [180, "S"], [270, "W"]] as const) {
      const p = P(az, 0);
      if (!p || p[2] < 0) continue;
      cx.beginPath();
      cx.arc(p[0], p[1] + 10, 2.5, 0, 6.283);
      cx.fill();
      cx.fillText(l, p[0], p[1] + 34);
    }
    cx.restore();
  }

  private drawGrid() {
    const cx = this.cx;
    cx.strokeStyle = "rgba(120,160,255,.16)";
    cx.lineWidth = 1;
    const line = (pts: (Pt | null)[]) => {
      cx.beginPath();
      let pen = false;
      for (const p of pts) {
        if (!p) { pen = false; continue; }
        if (pen) cx.lineTo(p[0], p[1]);
        else cx.moveTo(p[0], p[1]);
        pen = true;
      }
      cx.stroke();
    };
    for (let alt = 0; alt < 90; alt += 15) line(Array.from({ length: 121 }, (_, i) => this.project(dir(i * 3, alt))));
    for (let az = 0; az < 360; az += 15) line(Array.from({ length: 31 }, (_, i) => this.project(dir(az, i * 3))));
  }

  private drawFunds(t: number, showLabels: boolean) {
    const cx = this.cx, zoom = Math.max(1, 110 / this.view.fov);
    for (const s of this.funds) {
      const p = this.project(s.v);
      s.p = null;
      if (!p || p[0] < -100 || p[0] > this.W + 100 || p[1] < -100 || p[1] > this.H + 100) continue;
      const mag = s.companies ?? 30;
      const R = (3 + mag / 16) * Math.min(zoom, 40) ** 0.55 * (this.reduce ? 1 : 1 + 0.06 * Math.sin(t / 600 + hash(s.id) * 9));
      const halo = cx.createRadialGradient(p[0], p[1], 0, p[0], p[1], R * 5);
      halo.addColorStop(0, "rgba(255,236,196,.6)");
      halo.addColorStop(0.3, "rgba(255,220,160,.18)");
      halo.addColorStop(1, "rgba(255,220,160,0)");
      cx.fillStyle = halo;
      cx.beginPath();
      cx.arc(p[0], p[1], R * 5, 0, 6.283);
      cx.fill();
      cx.strokeStyle = "rgba(255,244,222,.35)";
      cx.lineWidth = 1;
      cx.beginPath();
      cx.moveTo(p[0] - R * 3.4, p[1]);
      cx.lineTo(p[0] + R * 3.4, p[1]);
      cx.moveTo(p[0], p[1] - R * 3.4);
      cx.lineTo(p[0], p[1] + R * 3.4);
      cx.stroke();
      cx.fillStyle = "#fff7e6";
      cx.beginPath();
      cx.arc(p[0], p[1], Math.max(2.2, R * 0.45), 0, 6.283);
      cx.fill();
      if (showLabels) {
        const left = p[0] > this.W - 190, lx = left ? p[0] - R * 3.6 - 6 : p[0] + R * 3.6 + 6;
        cx.textAlign = left ? "right" : "left";
        cx.font = "500 14px " + this.sans;
        cx.fillStyle = this.hovered === s ? "#fff" : "rgba(230,232,245,.88)";
        cx.fillText(s.name, lx, p[1] - 3);
        if (s.companies != null) {
          cx.font = "400 11.5px " + this.mono;
          cx.fillStyle = "rgba(170,175,200,.75)";
          cx.fillText(`${s.companies} companies`, lx, p[1] + 12);
        }
        cx.textAlign = "left";
      }
      if (this.selFund === s.id) {
        cx.strokeStyle = "rgba(255,170,140,.9)";
        cx.lineWidth = 1.5;
        const k = R * 2.4;
        for (let q = 0; q < 4; q++) {
          const a = (q * Math.PI) / 2 + Math.PI / 4;
          cx.beginPath();
          cx.arc(p[0], p[1], k, a - 0.35, a + 0.35);
          cx.stroke();
        }
      }
      s.p = p;
      s.r = Math.max(16, R * 2.2);
    }
  }

  private reveal(t: number) {
    while (this.queue.length && t >= this.nextReveal) {
      const c = this.queue.shift()!;
      const r = (k: number) => hash(c.id, k);
      this.planets.set(c.id, { c, ang: r(0) * 6.283, y: (r(7) - 0.5) * 0.14, size: 0.012, speed: 0.05 + 0.12 / (1 + (c.months ?? 150) / 18), born: t });
      this.nextReveal = Math.max(t, this.nextReveal) + (this.reduce ? 0 : 75);
    }
  }

  private drawSystem(t: number) {
    if (this.mode !== "system") return;
    const cx = this.cx, k = out4(clamp((t - this.sysStart) / 1100, 0, 1));
    if (k <= 0) return;
    const B = this.camBasis(), [cxp, cyp] = this.sysCenter(), F = Math.min(this.W, this.H) * (this.W < 860 ? 1.25 : 1.05) * k;
    if (this.orbits) {
      cx.font = "11px " + this.mono;
      cx.textAlign = "center";
      for (const [mo, lab] of RINGS) {
        const r = radiusFor(mo);
        cx.strokeStyle = mo == null ? "rgba(170,180,215,.10)" : "rgba(170,180,215,.2)";
        cx.setLineDash(mo == null ? [1, 7] : [2, 6]);
        cx.beginPath();
        let pen = false, top: Pt | null = null;
        for (let a = 0; a <= 64; a++) {
          const th = (a / 64) * 6.283, q = this.p3([Math.cos(th) * r, 0, Math.sin(th) * r], B, cxp, cyp, F);
          if (!q) { pen = false; continue; }
          if (pen) cx.lineTo(q[0], q[1]);
          else cx.moveTo(q[0], q[1]);
          pen = true;
          if (!top || q[1] < top[1]) top = q;
        }
        cx.stroke();
        cx.setLineDash([]);
        if (top && this.orb.pitch > 0.22 && (this.W >= 860 || mo === 24 || mo === 96 || mo == null)) {
          cx.fillStyle = "rgba(170,180,215,.55)";
          cx.fillText(lab, top[0], top[1] - 6);
        }
      }
      cx.textAlign = "left";
    }
    const items: { p?: Planet; q: Pt }[] = [];
    for (const p of this.planets.values()) {
      const r = radiusFor(p.c.months), a = p.ang + this.spin * p.speed;
      const q = this.p3([Math.cos(a) * r, p.y * r, Math.sin(a) * r], B, cxp, cyp, F);
      if (q) items.push({ p, q });
    }
    const sq = this.p3([0, 0, 0], B, cxp, cyp, F);
    if (sq) items.push({ q: sq });
    items.sort((a, b) => b.q[2] - a.q[2]);
    for (const it of items) {
      const [x, y, z] = it.q;
      if (!it.p) {
        const R = (F * 0.055) / z, h = cx.createRadialGradient(x, y, 0, x, y, R * 6);
        h.addColorStop(0, "rgba(255,240,205,.95)");
        h.addColorStop(0.2, "rgba(255,226,170,.45)");
        h.addColorStop(1, "rgba(255,226,170,0)");
        cx.fillStyle = h;
        cx.beginPath();
        cx.arc(x, y, R * 6, 0, 6.283);
        cx.fill();
        cx.fillStyle = "#fff8ea";
        cx.beginPath();
        cx.arc(x, y, R, 0, 6.283);
        cx.fill();
        continue;
      }
      const p = it.p, c = p.c, age = out4(clamp((t - p.born) / 700, 0, 1)), [R_, G_, B_] = RGB[c.group];
      const dim = this.filters[c.group] ? (c.group === "pending" ? 0.5 : 1) : 0.12;
      const size = 0.012 + Math.min(c.founders, 4) * 0.006;
      const s = Math.max(1.6, (F * size) / z) * (0.4 + 0.6 * age) * (this.hovered === p || this.selCo === c.id ? 1.45 : 1);
      const fog = clamp(1.25 - (z - this.orb.dist) * 0.35, 0.45, 1);
      if (age < 1) {
        cx.strokeStyle = `rgba(${R_},${G_},${B_},${(1 - age) * 0.7})`;
        cx.lineWidth = 1.4;
        cx.beginPath();
        cx.arc(x, y, s + 20 * age, 0, 6.283);
        cx.stroke();
      }
      const h = cx.createRadialGradient(x, y, 0, x, y, s * 3);
      h.addColorStop(0, `rgba(${R_},${G_},${B_},${0.32 * dim * fog})`);
      h.addColorStop(1, `rgba(${R_},${G_},${B_},0)`);
      cx.fillStyle = h;
      cx.beginPath();
      cx.arc(x, y, s * 3, 0, 6.283);
      cx.fill();
      const lx = (sq ? sq[0] : cxp) - x, ly = (sq ? sq[1] : cyp) - y, ll = Math.hypot(lx, ly) || 1;
      const sh = cx.createRadialGradient(x + (lx / ll) * s * 0.45, y + (ly / ll) * s * 0.45, s * 0.1, x, y, s);
      sh.addColorStop(0, `rgba(${Math.min(255, R_ + 50)},${Math.min(255, G_ + 50)},${Math.min(255, B_ + 50)},${dim * fog})`);
      sh.addColorStop(1, `rgba(${(R_ * 0.45) | 0},${(G_ * 0.45) | 0},${(B_ * 0.45) | 0},${dim * fog})`);
      cx.fillStyle = sh;
      cx.beginPath();
      cx.arc(x, y, s, 0, 6.283);
      cx.fill();
      if (c.group === "news_event") {
        cx.strokeStyle = `rgba(${R_},${G_},${B_},${0.85 * dim})`;
        cx.lineWidth = 1;
        cx.beginPath();
        cx.ellipse(x, y, s * 2.1, s * 0.55, -0.35, 0, 6.283);
        cx.stroke();
      }
      if (this.selCo === c.id) {
        cx.strokeStyle = "rgba(255,170,140,.95)";
        cx.lineWidth = 1.5;
        for (let q = 0; q < 4; q++) {
          const a = (q * Math.PI) / 2 + Math.PI / 4;
          cx.beginPath();
          cx.arc(x, y, s + 9, a - 0.4, a + 0.4);
          cx.stroke();
        }
        if (sq) {
          cx.strokeStyle = "rgba(255,244,222,.22)";
          cx.setLineDash([3, 5]);
          cx.beginPath();
          cx.moveTo(sq[0], sq[1]);
          cx.lineTo(x, y);
          cx.stroke();
          cx.setLineDash([]);
        }
      }
      p.x = x;
      p.yy = y;
      p.r = Math.max(12, s + 6);
    }
  }

  /* ---------------- flight ---------------- */

  private stepFlight(t: number) {
    const f = this.flight!, p = clamp((t - f.t0) / f.dur, 0, 1);
    f.p = f.dir > 0 ? p : 1 - p;
    const aim = f.dir > 0 ? out4(clamp(p * 1.6, 0, 1)) : ease(p), zoom = f.dir > 0 ? ease(clamp((p - 0.15) / 0.85, 0, 1)) : ease(p);
    this.view.yaw = lerp(f.from.yaw, f.to.yaw, aim);
    this.view.pitch = lerp(f.from.pitch, f.to.pitch, aim);
    this.view.fov = Math.exp(lerp(Math.log(f.from.fov), Math.log(f.to.fov), zoom));
    f.streak = 1 + Math.sin(Math.PI * (f.dir > 0 ? zoom : p)) * (f.dir > 0 ? 0.35 : 0.2);
    this.cb.onView(`FOV ${this.view.fov.toFixed(this.view.fov < 10 ? 1 : 0)}°`);
    if (p < 1) return;
    this.flight = null;
    if (f.dir > 0 && this.target) {
      this.mode = "system";
      this.orb = { yaw: 0.55, pitch: 0.42, dist: 3.1 };
      this.sysStart = t;
      this.nextReveal = t + (this.reduce ? 0 : 450);
      this.flash = t;
      this.cb.onView("System view");
      this.cb.onArrive(this.target.id);
    } else {
      this.mode = "sky";
      this.target = null;
      this.cb.onReturned();
    }
  }

  private clearSystem() {
    this.planets.clear();
    this.queue = [];
    this.selCo = null;
  }

  /* ---------------- pointer ---------------- */

  private down = (e: PointerEvent) => {
    if (this.mode === "flying") return;
    this.drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.dataset.dragging = "1";
  };

  private move = (e: PointerEvent) => {
    const d = this.drag;
    if (d) {
      const dx = e.clientX - d.lx, dy = e.clientY - d.ly;
      d.lx = e.clientX;
      d.ly = e.clientY;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) d.moved = true;
      if (this.mode === "sky") {
        const s = (this.view.fov / Math.min(this.W, this.H)) * 0.9;
        this.view.yaw -= dx * s;
        this.view.pitch = clamp(this.view.pitch + dy * s, -4, 88);
        this.vel = { yaw: -dx * s * 0.6, pitch: dy * s * 0.6 };
      } else if (this.mode === "system") {
        this.orb.yaw -= dx * 0.006;
        this.orb.pitch = clamp(this.orb.pitch + dy * 0.005, 0.06, 1.45);
        this.orbVel = { yaw: -dx * 0.003, pitch: dy * 0.0025 };
      }
      delete this.tip.dataset.on;
      return;
    }
    this.hoverAt(e.clientX, e.clientY);
  };

  private up = (e: PointerEvent) => {
    const was = this.drag;
    this.drag = null;
    delete this.canvas.dataset.dragging;
    if (was?.moved) return;
    this.hoverAt(e.clientX, e.clientY);
    const h = this.hovered;
    if (this.mode === "sky") {
      this.selFund = h && "az" in h ? h.id : null;
      this.cb.onSelectFund(this.selFund);
    } else if (this.mode === "system" && h && "c" in h) {
      this.selCo = h.c.id;
      this.cb.onSelectCompany(h.c.id);
    }
  };

  private leave = () => {
    this.hovered = null;
    delete this.tip.dataset.on;
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.mode === "sky") {
      this.view.fov = clamp(this.view.fov * Math.exp(e.deltaY * 0.0012), 25, 150);
      this.cb.onView(`FOV ${this.view.fov.toFixed(0)}°`);
    } else if (this.mode === "system") this.orb.dist = clamp(this.orb.dist * Math.exp(e.deltaY * 0.0012), 1.7, 6);
  };

  private hoverAt(x: number, y: number) {
    let best: FundStar | Planet | null = null, bd = 1e9;
    if (this.mode === "sky") {
      for (const s of this.funds) {
        if (!s.p) continue;
        const d = Math.hypot(s.p[0] - x, s.p[1] - y);
        if (d < s.r && d < bd) { bd = d; best = s; }
      }
    } else if (this.mode === "system") {
      for (const p of this.planets.values()) {
        if (p.x == null || p.yy == null || p.r == null) continue;
        const d = Math.hypot(p.x - x, p.yy - y);
        if (d < p.r && d < bd) { bd = d; best = p; }
      }
    }
    this.hovered = best;
    this.canvas.style.cursor = best ? "pointer" : "";
    const tip = this.tip;
    if (!best) { delete tip.dataset.on; return; }
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    if ("az" in best) {
      const meta = [best.companies != null && `${best.companies} portfolio companies`, best.calls != null && `${best.calls} founders to call`].filter(Boolean).join(" · ");
      tip.innerHTML = `${esc(best.name)}<small>${meta || "Click to select, or fly to it"}</small>`;
    } else {
      const c = best.c, LBL: Record<Group, string> = { news_event: "News found", no_recent_round: "No round 24m+", recent_round: "Raised recently", none: "No founder confirmed", pending: "Being checked" };
      tip.innerHTML = `${esc(c.name)}<small>${c.last ? "last round " + c.last : "no recorded round"} · ${c.founders} founder${c.founders === 1 ? "" : "s"} · ${LBL[c.group]}</small>`;
    }
    tip.style.left = Math.min(x + 16, this.W - 300) + "px";
    tip.style.top = y + 16 + "px";
    tip.dataset.on = "1";
  }
}
