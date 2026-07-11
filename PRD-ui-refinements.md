# PRD — Stratus Digital Twin UI Refinements

Status: **DRAFT — awaiting ratification.** No code changes until approved.
Scope: `src/app/index.js`, `src/app/mapLayout.js`, `src/app/styles.css` only.
Hard constraint: do **not** edit fixtures, domain modules, or tests — every number stays pipeline-driven (see `airportops-frontend-stratus` memory). Colors/labels/layout are view-only.

Decisions locked with the user:
- Mascot is renamed **Beagle → Otter** (same dog SVG art retained for now).
- Removing the floating copilot button; copilot is **nested inside each card**. The default (no-zone) Terminal Status card gets a **terminal-wide** copilot summarizing the worst zone.
- **Check-in B** collapses to an **icon-only** map marker (still clickable/hoverable).

---

## Commit boundaries

Six boundaries, each independently verifiable. Ordered so visual-token work lands before the components that consume it.

| # | Boundary | Files | Validating check |
|---|----------|-------|------------------|
| 1 | Map floor-plan realism + Gate C/D boxes | `mapLayout.js` | headless screenshot (departures) |
| 2 | Check-in B → icon-only marker | `index.js` (`renderMap`) | screenshot + click opens card |
| 3 | Hover tooltip no longer clipped | `index.js` (`renderHoverTip`/`renderMap`) | hover Departure Hall, full card visible |
| 4 | Visual hierarchy: red triangle, muted green/yellow | `index.js`, `styles.css` | screenshot, red dominant |
| 5 | Timeline: NOW-anchored, higher contrast, blue bar | `index.js` (`renderTimeline`), `styles.css` | screenshot of footer |
| 6 | Copilot → Otter, nested per-card, structured message | `index.js` | screenshot zone card + terminal card |
| — | Info-card "Simulate" button restyle | folded into #6 (same edits) | screenshot zone card |

---

## 1 — Map floor-plan realism + Gate C/D boxes

**Problem:** "map doesn't look like an airport anymore"; Gate C (and D) chips float with no drawn gate room; user asked for "a square box and put Gate C".

**Current state** (`mapLayout.js` `departureFloor`): gate boxes drawn only at `box(208,360,150,150)` and `box(1090,360,150,150)` — these sit under Gate **A** `[284,410]` and Gate **B** `[1104,410]`. Gates **C** `[284,636]` and **D** `[1104,636]` have no room.

**Changes** (`departureFloor`, and mirror the idea in `arrivalFloor` only if cheap):
1. Add gate rooms for C and D: `box(208,586,150,150)` and `box(1090,586,150,150)`, matching the A/B boxes.
2. Add short jet-bridge connectors from each gate box to its plane glyph (small `wall(...)` stubs) so gate piers read as gates.
3. Add gate labels **A / B / C / D** as faint `<text>` inside each gate box (uses `var(--text3)`, IBM Plex Mono, matching existing glyph tone).
4. Airport legibility pass (low-risk, additive strokes only): apron/runway hatch band outside the left/right piers, and keep the existing flow arrows. No change to zone positions (positions are the click targets).

**Acceptance:** Departures view shows four labelled gate rooms (A–D) each visually tied to a plane; silhouette reads as a terminal. Arrivals view unchanged or improved, never regressed. All 13 departure chips still align to their rooms.

**Open call:** "looks like an airport" is subjective — boundary #1 ships the concrete, low-risk additions above. If you want a bigger redraw, flag it and we scope separately.

---

## 2 — Check-in B → icon-only marker

**Problem:** "reduce Check-in B to an icon." B `[882,520]` crowds Departure Hall `[724,250]`/Check-in A `[566,520]` labels.

**Change** (`index.js` `renderMap`, the `chips` map, ~L454):
- For `zoneId === "check-in-b"` only, render a compact **icon marker** (a check-in/counter glyph in the shared 26px icon style) instead of the `dot + label + percent` chip.
- Marker keeps `data-zone-chip="check-in-b"` so click still opens the card; keeps status-colored border so severity is still readable.
- Hover still works (hit-rect is unchanged in `hitAreas`); the hover tooltip shows the full label + stats.

**Acceptance:** Check-in B is a single small icon on the map; clicking it opens the Check-in B detail card; hovering shows its tooltip. Other zones unchanged.

**Note:** implemented as a per-zone branch, not a general "collapse any zone" system — matches the single-zone request without over-building.

---

## 3 — Hover tooltip clipping fix

**Problem:** "when hover over Departure Hall label, card is cut off." Departure Hall chip is at `top:23%` and the tooltip uses `transform: translate(-50%,-118%)` (`renderHoverTip`, L494), pushing it **above** the chip — where it's clipped by `overflow:hidden` on `<main>` and the pan container.

**Change** (`renderHoverTip`):
- Make vertical placement adaptive like the horizontal logic already is: when `chipTop` is small (near the top, e.g. `< 30`), flip the tooltip to render **below** the chip (`translate(-50%,18%)`) instead of above.
- Keep the existing left/right edge flips.

**Acceptance:** Hovering Departure Hall shows the entire tooltip (header + metrics + footer) with nothing clipped, in both zoom states. Bottom/side zones still place sensibly.

---

## 4 — Visual hierarchy: red triangle + muted green/yellow

**Problem:** "red: triangle exclamation mark"; "green and yellow: reduce contrast so red is more prominent."

Current status colors (`index.js` L31-34, `styles.css` L65-71): `OK #32c783`, `WARN #f5b942`, `BUSY #f05b61`.

**Changes:**
1. **Critical marker = triangle-exclamation.** Where a zone is `critical`, swap the round status dot for a small ⚠-style triangle glyph:
   - Map chips (`renderMap` chips, the leading `<span>` dot, L458).
   - Zone-detail card header dot (`renderZoneDetail`, L681).
   - Copilot/card header status indicator.
   Watch/normal keep the round dot. (Reuses the existing incidents-tool triangle path so it reads as one icon set.)
2. **Mute green + yellow, keep red vivid.** Introduce softened status tokens used for the *visual/marker* layer (heat fills, rings, dots, chip borders, load-percent text on the map) so red is the only high-saturation status:
   - green `#32c783` → muted e.g. `#3f8f6d`
   - yellow `#f5b942` → muted e.g. `#c39a44`
   - red stays `#f05b61` (optionally nudged brighter).
   Keep body text legible: where yellow/green are used as *small text on dark* and contrast would drop too far, retain a readable variant. Final hexes tuned against a headless screenshot.

**Acceptance:** On a screenshot with at least one critical zone, red visibly dominates; green/yellow recede; every critical marker shows a triangle, not a dot. No unreadable text.

**Tradeoff flagged:** muting is applied primarily to the map/marker layer, not blanket-swapped on every `OK`/`WARN` usage, to avoid washing out drawer text and KPIs. If you'd rather mute globally, say so.

---

## 5 — Timeline: NOW-anchored, higher contrast, blue bar

**Problem:** "timeline needs higher contrast"; "make it clear current time is on the left, then we drag it along"; "make the bottom timeline bar lighter/darker blue bg."

Current (`renderTimeline`, L871-897 + range CSS L111-141): faint `--border` track; left side shows a big clock readout; the range is the forecast horizon `T+0..120`.

**Changes:**
1. **NOW anchor.** Add a fixed **"NOW"** pill/tick at the **left end** of the track (T+0 = current snapshot time), making explicit that dragging the thumb rightward scrubs into the forecast. Label the right end "T+120".
2. **Higher-contrast track.** Replace the faint track with a blue gradient (lighter→darker blue) and give the portion left of the thumb a filled "elapsed/now" treatment so the head position is obvious. Thumb stays the accent dot.
3. **Blue footer bar.** Change the footer `background` from `var(--panel2)` to a blue-tinted token (new `--timeline-bg`, defined per theme — a subtly lighter/darker blue than the panel).

**Acceptance:** Footer reads as a blue timeline; a "NOW" marker sits at the left; the drag head and its track fill are high-contrast in both light and dark themes; scrubbing still updates `state.minute` and re-renders.

---

## 6 — Copilot: Otter, nested per-card, structured message (+ info-card button)

**Problem cluster:** rename Beagle→Otter; "beagle is nested in each card, no more overall button"; structured message ("In Departure Gate C, X problem occurs. Here's how you solve it. And why:"); "on the Check-in A card: otter's opinion"; and the info-card button restyle ("change from 'Simulate this' to 'SIMULATE', light blue and white text and caps").

**Changes** (`index.js`):
1. **Rename** every "Beagle" string/label to **"Otter"** (`renderCopilot`; `DOG_SVG`/`DOG_MINI_SVG` kept as-is — art unchanged). Update the `dogAlert`/`dogStatus`/`dogTag` internals only where user-facing text shows.
2. **Remove the floating copilot** (the bottom-right `panel` + toggle `button` block, L839-846) and its `state.copilot` toggle usage. Keep the `renderCopilot` compute logic but repurpose it into a **nested card block**.
3. **Nest per-card:**
   - In **`renderZoneDetail`**: add an **"Otter's opinion"** section inside the card (replaces/absorbs the current "Recommended action" block) that speaks about *that zone*.
   - In **`renderTerminalStatus`** (default, no zone selected): add a **terminal-wide** Otter block summarizing the worst zone (reuses the existing `worst`/`topOption` computation currently feeding the floating panel).
4. **Structured message format** (`speech` builder): rewrite to a three-part, labelled structure:
   - **Problem:** "In {zone label}, {problem} occurs." (e.g. queue/wait facts — the "gives facts" ask).
   - **Fix:** "Here's how you solve it: {recommended action}."
   - **Why:** "{rationale}." (from the decision-support option / describeDecision).
   Facts (load %, queue, wait, forecast Δ) are shown as compact stats alongside the prose.
5. **Info-card button restyle** (same card edit — `renderZoneDetail` L695, and mirror on the copilot rec button L812): change label from `Simulate this` → **`SIMULATE`** (uppercase; in sim mode keep an "APPLY TO DRAFT" equivalent, also caps), background **light blue**, text **white**, uppercase. New button style token so it's consistent.

**Event wiring:** `toggle-copilot` action and the floating button's listeners are removed; per-card content renders inline with existing card, so no new toggles needed. `data-apply-option` handlers stay (buttons just move into the cards).

**Acceptance:**
- No floating bottom-right copilot anywhere.
- Selecting a zone shows an "Otter's opinion" block with Problem / Fix / Why + facts, scoped to that zone; the Simulate button reads "SIMULATE", light-blue with white caps text.
- The default Terminal Status card shows a terminal-wide Otter summary of the worst zone.
- All "Beagle" text now reads "Otter".

---

## Cross-cutting: verification & housekeeping

- **Browser verify** (no Playwright MCP here — see `airportops-windows-gotchas`): serve `src/app/` with `python -m http.server`, capture headless-Chrome screenshots of Departures, Arrivals, a selected zone card, hovered Departure Hall, and the footer, in **both** dark and light themes. Read each PNG and confirm acceptance criteria.
- **Node test seam:** `renderToString`/`computeFrame` stay exported and DOM-free; run `npm run seed` and the node render check to confirm no data-path regressions.
- **check.sh:** run `./.beryl/scripts/check.sh`; the `check-tests` CRLF hash mismatch is a known Windows-only artifact — **do not** run `update-test-manifest.sh` to "fix" it. All other stages must pass.
- **No test/fixture/domain edits.** If any change appears to need one, stop and re-plan.

## Out of scope / open questions
- Otter is the same dog SVG; new otter artwork is **not** in this PRD (say the word to add it).
- Muting is map/marker-layer-scoped by default (see #4 tradeoff).
- "Looks like an airport" ships the concrete additions in #1; a full floor-plan redraw is a separate effort if wanted.
