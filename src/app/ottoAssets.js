/*
 * Otto — the Stratus operations copilot mascot ("otto's opinions").
 *
 * These are hand-authored, theme-aware inline SVGs recreating the provided
 * "otto's opinions" otter-with-headphones logo in the repository's
 * dependency-free style (the original raster logo can't be embedded from the
 * design attachment, so it is redrawn here as vector so it reskins with the
 * theme tokens like the rest of the surface).
 *
 *   OTTO_FACE_SVG  — front-facing otter in headphones (Otto AI brand mark).
 *   OTTO_SIDE_SVG  — side-profile "smart bot" otter, shown in every zone card.
 *
 * Pure strings (no DOM) so the app shell can inline them into its templates.
 */

// Front-facing otter wearing headphones — the brand mark for the Otto AI voice.
export const OTTO_FACE_SVG = `<svg width="40" height="44" viewBox="0 0 130 140" fill="none">
  <path d="M40 116 q-2 -34 25 -34 q27 0 25 34 q0 20 -25 20 q-25 0 -25 -20 z" fill="var(--hover)" stroke="var(--text2)" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M24 64 A41 41 0 0 1 106 64" fill="none" stroke="var(--text2)" stroke-width="3.4" stroke-linecap="round"/>
  <rect x="14" y="52" width="21" height="32" rx="10" fill="var(--panel2)" stroke="var(--text2)" stroke-width="2.6"/>
  <rect x="95" y="52" width="21" height="32" rx="10" fill="var(--panel2)" stroke="var(--text2)" stroke-width="2.6"/>
  <circle cx="65" cy="60" r="34" fill="var(--hover)" stroke="var(--text2)" stroke-width="2.6"/>
  <path d="M56 30 q3 -9 7 -4 q3 -7 7 -2 q4 -5 6 2" fill="none" stroke="var(--text2)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
  <g style="animation:blink 4.6s infinite; transform-box:fill-box; transform-origin:center;">
    <circle cx="52" cy="57" r="4.6" fill="var(--text)"/>
    <circle cx="78" cy="57" r="4.6" fill="var(--text)"/>
  </g>
  <path d="M46 76 q-7 17 9 21 q10 3 10 -6 q0 9 10 6 q16 -4 9 -21 q-6 -9 -19 -5 q-13 -4 -19 5 z" fill="var(--panel2)" stroke="var(--text2)" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M59 72 q6 -4 12 0 q1 6 -6 8 q-7 -2 -6 -8 z" fill="var(--text)"/>
  <path d="M65 80 v5 M65 85 q-6 3 -10 -1 M65 85 q6 3 10 -1" fill="none" stroke="var(--text2)" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;

// Side-profile otter "smart bot", facing right — embedded in each zone card.
export const OTTO_SIDE_SVG = `<svg width="34" height="34" viewBox="0 0 140 120" fill="none">
  <path d="M30 66 q-16 6 -14 30 q3 20 34 22 q34 2 42 -14 q6 -12 -2 -24 z" fill="var(--hover)" stroke="var(--text2)" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M46 42 A32 32 0 0 1 98 42" fill="none" stroke="var(--text2)" stroke-width="3" stroke-linecap="round"/>
  <rect x="40" y="40" width="17" height="26" rx="8" fill="var(--panel2)" stroke="var(--text2)" stroke-width="2.4"/>
  <circle cx="70" cy="54" r="30" fill="var(--hover)" stroke="var(--text2)" stroke-width="2.4"/>
  <path d="M50 30 q3 -8 7 -3 q3 -6 7 -1" fill="none" stroke="var(--text2)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M92 44 q24 0 26 15 q-2 15 -25 14 q-16 -1 -15 -15 q1 -13 14 -14 z" fill="var(--panel2)" stroke="var(--text2)" stroke-width="2.3" stroke-linejoin="round"/>
  <g style="animation:blink 4.6s infinite; transform-box:fill-box; transform-origin:center;">
    <circle cx="82" cy="49" r="4.2" fill="var(--text)"/>
  </g>
  <ellipse cx="114" cy="57" rx="5" ry="4" fill="var(--text)"/>
  <path d="M108 62 q-5 4 -10 1" fill="none" stroke="var(--text2)" stroke-width="1.7" stroke-linecap="round"/>
</svg>`;

// Small mono badge otter for compact contexts (buttons/tags).
export const OTTO_MINI_SVG = `<svg width="20" height="20" viewBox="0 0 130 140" fill="none">
  <path d="M24 64 A41 41 0 0 1 106 64" fill="none" stroke="var(--text2)" stroke-width="4" stroke-linecap="round"/>
  <rect x="16" y="54" width="20" height="30" rx="9" fill="var(--panel)" stroke="var(--text2)" stroke-width="3"/>
  <rect x="94" y="54" width="20" height="30" rx="9" fill="var(--panel)" stroke="var(--text2)" stroke-width="3"/>
  <circle cx="65" cy="62" r="33" fill="var(--hover)" stroke="var(--text2)" stroke-width="3"/>
  <circle cx="53" cy="59" r="4.6" fill="var(--text)"/>
  <circle cx="77" cy="59" r="4.6" fill="var(--text)"/>
  <path d="M47 78 q-6 15 9 19 q9 3 9 -5 q0 8 9 5 q15 -4 9 -19 q-6 -8 -18 -5 q-12 -3 -18 5 z" fill="var(--panel2)" stroke="var(--text2)" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M60 74 q5 -3 10 0 q1 5 -5 6 q-6 -1 -5 -6 z" fill="var(--text)"/>
</svg>`;
