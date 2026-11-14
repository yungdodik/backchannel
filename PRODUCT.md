# Product

## Register

product

## Users

Founders who have a term sheet, or a serious conversation, with a specific VC fund and want to know how that fund behaves after the money lands. Typical moment: the evening before a partner call or a signing deadline, at a laptop, reading carefully, often in a second language (Nordic and European founders around Slush). They are not browsing; they have one fund in mind and a decision to make.

Secondary audience: Junction 2026 judges watching a live demo on a projector. The product must look finished and work live, but founders come first: nothing is added only for the demo.

Job to be done: "Tell me which founders from this fund's portfolio I should call, why each one is worth calling, and what to ask, so I hear the truth from people who already took this fund's money."

## Product Purpose

Parallax (repo: backchannel) turns a fund name into a sourced call list. The name is the astronomy method: a star's true distance is found by looking at it from different vantage points, as a fund's behaviour is found by hearing from different founders. It walks the fund's portfolio in Cala, checks each company's last round and the news (Exa), confirms the founders, and groups them by neutral facts: news found (acquisition, shutdown, layoffs), no recorded round in 24+ months, raised again recently. Gemini only writes three questions grounded in the retrieved facts. A fund behaviour profile (named in a later round, rounds led, co-investors) adds context, always as counts with their evidence.

Success: a founder leaves with 3 to 5 people to call, knows why each one matters, and trusts every fact because every fact links to its source.

## Brand Personality

Calm, exact, discreet. The interface behaves like a well-informed friend who has done the homework and hands it over quietly: no hype, no verdicts, no urgency. The product is a night-sky observatory in the manner of Stellarium Web: the funds are stars above a Finnish horizon, a search flies you to one, and its portfolio appears around it as a system you can turn in your hands.

Emotional goal: relief and confidence. "I know who to call and I can check every claim."

## Anti-references

- Verdict UIs: red/green scorecards, "risk scores", star ratings, "this fund is bad" framing. Facts are neutral (decision D6); a missing round is not a failure.
- Generic AI SaaS: purple gradients, glassmorphism cards, hero-metric templates, identical icon-card grids.
- Investor-database clutter (Crunchbase, PitchBook): dense tables first, ads, paywalls, twenty filters before any answer.
- The look of the other Junction 2026 Cala-track teams: off-white page plus one violet or blue accent plus one grotesk (Grabbit, Perimeter, Pitch List). We must not blend in.
- Dark "hacker terminal" or neon sci-fi styling; it reads as a verdict machine. The sky is a quiet observatory, not a game HUD.

## Design Principles

1. **Show the source, always.** Every fact carries a visible, clickable source and date. No source, no fact on screen.
2. **Facts, never verdicts.** Group and colour by what happened, never by how good or bad it is. Wording stays neutral; counts are lower bounds and say so.
3. **One question first.** The first screen asks one thing (which fund?) and does nothing else. Depth comes after the founder has committed to a fund.
4. **The data is the hero.** The streaming report is the showpiece: planets and founders appear as they are found, not behind a spinner.
5. **Ready to act.** Every call card ends in an action: copy the questions, open LinkedIn. The founder should be able to start calling straight from the page.

## Accessibility & Inclusion

- WCAG 2.2 AA: text contrast 4.5:1 (3:1 for large text and UI boundaries), including text over the hero photo (use a scrim, never rely on the image).
- Full keyboard use; visible focus on every interactive element; the streaming report announces progress politely (aria-live) without stealing focus.
- `prefers-reduced-motion`: all decorative motion off, streaming still works, content never depends on animation.
- Group colours are never the only signal: each group also has a label and a text code; safe for common colour blindness.
- Plain English, short sentences; many users read in a second language.
