---
name: Parallax
description: Reference checks on a VC fund, from the founders who already took its money. The funds are stars; fly to one to see its portfolio.
colors:
  void: "oklch(0.11 0.02 268)"
  glass: "oklch(0.17 0.02 268 / 0.9)"
  glass-raised: "oklch(0.22 0.022 268 / 0.92)"
  line: "oklch(0.36 0.025 268 / 0.7)"
  text: "oklch(0.92 0.01 260)"
  muted: "oklch(0.7 0.02 260)"
  faint: "oklch(0.56 0.02 262)"
  starlight: "oklch(0.94 0.035 85)"
  window-light: "#ffd082"
  cardinal: "#d65c54"
  fact-news: "oklch(0.7 0.15 32)"
  fact-quiet: "oklch(0.82 0.12 82)"
  fact-recent: "oklch(0.78 0.1 185)"
  fact-none: "oklch(0.58 0.015 262)"
typography:
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 500
    lineHeight: 1.3
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  pill: "999px"
  control: "12px"
  card: "14px"
  panel: "18px"
spacing:
  edge: "16px"
  gap: "8px"
  panel: "18px"
components:
  pill-glass:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    height: "46px"
  search:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    height: "48px"
  button-primary:
    backgroundColor: "{colors.starlight}"
    textColor: "{colors.void}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
  info-card:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "18px"
  founder-row:
    backgroundColor: "oklch(0.2 0.02 268 / 0.6)"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "11px 13px"
  source-chip:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.mono}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: Parallax

## 1. Overview

**Creative North Star: "The Observatory"**

A clear winter night above a Finnish horizon, seen through Stellarium Web. The home page is the sky itself: a 3D celestial sphere you rotate by dragging, with the Milky Way, a treeline, wooden houses with warm lit windows, and red cardinal points on the horizon. The funds are the brightest stars, labelled with their portfolio size. Stellarium's chrome frames it: a round menu top left, a centred search pill, the brand pill top right, a location and field-of-view pill bottom left, an icon toolbar bottom centre and a live clock bottom right.

Searching flies you to a fund: the camera turns to the star and zooms in while the other stars streak past, then a soft flash. The fund's portfolio assembles around it as a true 3D system you can turn and zoom: each company is a lit planet, its orbit radius is the time since its last recorded round, its colour is the neutral fact group, its size is the founders found. A Stellarium-style selection card on the left shows the fund and its behaviour profile (counts with their denominators and lower-bound notes); the founders to call sit in a panel on the right.

The system rejects verdict UIs, neon sci-fi HUDs, glassy SaaS cards, and dashboards. The sky is quiet; motion has a reason (rotation, flight, arrival) and stops for reduced-motion users.

**Key Characteristics:**
- Canvas sky (`components/sky/engine.ts`): stereographic projection for the sphere, perspective camera for the system.
- Dark translucent pills and panels over the sky; starlight is the only accent colour for actions.
- Fact colours are muted and always paired with a label; never good or bad.
- Every count shows "n / of"; every fact links to its source.

## 2. Colors: The Night Palette

A blue-violet night with one warm light source (starlight) and four quiet fact colours.

### Primary
- **Starlight** (oklch(0.94 0.035 85)): the fund stars, the Fly button, primary actions, the live dot.

### Secondary
- **Window light** (#ffd082): lit windows on the horizon only. Never used in the UI.
- **Cardinal red** (#d65c54): the N, E, S, W markers only, as in Stellarium.

### Tertiary: fact colours
- **Fact News** (oklch(0.7 0.15 32)): news found (acquisition, shutdown, layoffs). Planets also carry a ring.
- **Fact Quiet** (oklch(0.82 0.12 82)): no recorded round in 24+ months.
- **Fact Recent** (oklch(0.78 0.1 185)): raised again recently.
- **Fact None** (oklch(0.58 0.015 262)): checked, no founder confirmed.

### Neutral
- **Void** (oklch(0.11 0.02 268)): behind everything.
- **Glass / Glass raised**: pills, cards, tooltips.
- **Text / Muted / Faint**: primary, secondary and tertiary text.
- **Line**: borders on glass.

### Named Rules
**The One Light Rule.** Starlight is the only UI accent. Fact colours never style buttons or alerts.

## 3. Typography

**Body Font:** Geist (via next/font)
**Label/Mono Font:** Geist Mono, for counts, dates, sources and the field of view

**Character:** Stellarium-plain sans for the chrome, so the sky carries the personality.

### Hierarchy
- **Title** (600, 26px): the fund name in the selection card.
- **Body** (400, 14.5px): descriptions, founder rows.
- **Label** (500, 13.5px): buttons, list headings.
- **Mono** (400, 11 to 13px): counts, dates, source chips, FOV, clock.

## 4. Elevation

Flat translucent layers over the sky; no drop shadows. Depth lives in the canvas: the sphere's projection, the system's perspective, planet shading toward the star, and fog on far planets.

### Named Rules
**The Sky Is The Depth Rule.** UI panels stay flat; only the canvas has depth.

## 5. Components

### Chrome (Stellarium layout)
- **Menu:** round 46px glass button, top left.
- **Search:** centred glass pill with a starlight "Fly" button; opens a suggestion list (funds in the sky, then live Cala matches). Combobox semantics, arrow keys and Enter.
- **Brand:** glass pill top right with the Parallax mark.
- **Location / FOV:** glass pill bottom left ("Helsinki · FOV 110°" or "System view").
- **Toolbar:** bottom centre; sky mode has labels, grid, reset, full screen; system mode has back, the three fact filters, orbit rings, full screen.
- **Clock:** glass pill bottom right.

### Selection card
- Left panel, 360px, glass. Type line in mono, fund name, description, a definition list of counts with their denominators and notes, the neutral caption, the stream progress, and actions (Fly / Return to sky, Full report).

### Founders panel
- Right panel, 380px, glass. Founder rows expand to facts with dated source chips, the founder's evidence and sources, three questions, Copy questions and LinkedIn.

### Sky canvas
- Fund stars: halo, diffraction spikes, label with portfolio size; selection ring on click.
- Horizon: treeline with clearings, Finnish houses (gable, chimney, sauna) with flickering lit windows.
- System: dotted orbit rings labelled 1, 2, 4, 8 years and "no recorded round"; planets revealed one by one with a ripple.

## 6. Do's and Don'ts

### Do:
- **Do** keep every number as "n / of" with its note ("lower bound", "where the lead is known").
- **Do** keep the list view at /report/[id] in sync; it is the accessible, printable form of the same report.
- **Do** switch off rotation, flicker, flight streaks and the flash under prefers-reduced-motion.

### Don't:
- **Don't** colour anything as good or bad, rank funds, or say "failed".
- **Don't** add neon glows, gradients on text, or HUD chrome.
- **Don't** put long reading text on the canvas; it belongs in the panels.
- **Don't** use CSS modules here: the Turbopack Tailwind rule renames `*.css`, so styles live in `app/globals.css` under the `px-` prefix.
