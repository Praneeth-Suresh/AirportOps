/*
 * Map layout + floor-plan schematics for the Airport Flow Ops surface.
 *
 * The imported design pinned its zones onto two AI-generated floor-plan PNGs.
 * Those assets can't be shipped (they exceed the design API's 256 KiB fetch cap
 * and truncate), so the terminal floor is redrawn here as self-contained,
 * theme-aware inline SVG in the design's 1448x1086 coordinate space — a
 * Departures level and an Arrivals level. The full seeded zone set is then
 * placed on those floors by function (check-in islands, immigration halls,
 * baggage carousel, gate piers, curbside), and each zone's live data comes from
 * the operational pipeline.
 *
 * Pure module (no DOM) so it can be exercised directly under node --test.
 */

export const MAP_VIEWBOX = { w: 1448, h: 1086 };

const NODE_HIT_W = 188;
const NODE_HIT_H = 90;

// Departures level = landside + processing + gates; Arrivals level = the inbound
// immigration / baggage / customs chain. Split by zone type.
const DEPARTURE_TYPES = new Set(["entrance", "check-in", "security", "departure"]);
const ARRIVAL_TYPES = new Set(["arrival", "immigration"]);

export function viewForZoneType(zoneType) {
  if (ARRIVAL_TYPES.has(zoneType)) return "arrival";
  return "departure";
}

export function zonesForView(zones, view) {
  return zones.filter((zone) => viewForZoneType(zone.type) === view);
}

// Hand-authored positions [cx, cy] in the 1448x1086 floor space, matching the
// floor-plan regions drawn below.
const POSITIONS = {
  departure: {
    "terminal-entrance-east": [500, 980],
    "terminal-entrance-west": [948, 980],
    "check-in-a": [566, 520],
    "check-in-b": [882, 520],
    "bag-drop-a": [330, 470],
    "departure-hall": [724, 250],
    "security-north": [430, 712],
    "security-south": [1018, 712],
    "transfer-corridor": [724, 712],
    "departure-gate-a": [284, 410],
    "departure-gate-c": [284, 636],
    "departure-gate-b": [1104, 410],
    "departure-gate-d": [1104, 636],
  },
  arrival: {
    "arrival-gate-a": [360, 176],
    "arrival-gate-b": [1088, 176],
    "immigration-east": [392, 470],
    "immigration-west": [1056, 470],
    "baggage-hall": [724, 372],
    "customs-hall": [724, 690],
    "baggage-reclaim-north": [560, 858],
    "baggage-reclaim-south": [888, 858],
    "arrivals-hall": [724, 986],
  },
};

export function computeMapLayout(zones, paths, view) {
  const nodes = zonesForView(zones, view);
  const table = POSITIONS[view] || {};
  const positions = {};

  nodes.forEach((zone, index) => {
    const point = table[zone.zoneId] || fallbackPoint(index, nodes.length);
    const [cx, cy] = point;
    positions[zone.zoneId] = {
      zoneId: zone.zoneId,
      cx,
      cy,
      chipLeft: Number(((cx / MAP_VIEWBOX.w) * 100).toFixed(2)),
      chipTop: Number(((cy / MAP_VIEWBOX.h) * 100).toFixed(2)),
      hitX: Math.round(cx - NODE_HIT_W / 2),
      hitY: Math.round(cy - NODE_HIT_H / 2),
      hitW: NODE_HIT_W,
      hitH: NODE_HIT_H,
    };
  });

  const idSet = new Set(nodes.map((zone) => zone.zoneId));
  const edges = paths
    .filter(([from, to]) => idSet.has(from) && idSet.has(to) && positions[from] && positions[to])
    .map(([from, to]) => ({
      from,
      to,
      x1: positions[from].cx,
      y1: positions[from].cy,
      x2: positions[to].cx,
      y2: positions[to].cy,
    }));

  return { view, positions, edges };
}

function fallbackPoint(index, count) {
  const cols = Math.ceil(Math.sqrt(count));
  const col = index % cols;
  const row = Math.floor(index / cols);
  return [220 + col * 320, 220 + row * 260];
}

export function mapBackgroundSvg(layout) {
  return layout.view === "arrival" ? arrivalFloor() : departureFloor();
}

// --- SVG floor-plan primitives ----------------------------------------------

const STROKE = 'stroke="var(--text3)"';
const INK = 'stroke="var(--text2)"';

function wall(d, opacity = 0.6) {
  return `<path d="${d}" fill="none" ${STROKE} stroke-opacity="${opacity}" stroke-width="2.4" stroke-linejoin="round"/>`;
}
function box(x, y, w, h, r = 4, opacity = 0.55) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" ${STROKE} stroke-opacity="${opacity}" stroke-width="2"/>`;
}
function bank(x, y, count, cw, ch, gap, vertical = false) {
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const bx = vertical ? x : x + i * (cw + gap);
    const by = vertical ? y + i * (ch + gap) : y;
    items.push(`<rect x="${bx}" y="${by}" width="${cw}" height="${ch}" rx="3" fill="none" ${INK} stroke-opacity="0.7" stroke-width="1.8"/>`);
  }
  return items.join("");
}
// All wayfinding icons share one 26x26 rounded frame and a single stroke weight
// so they read as a consistent set (drawn in a local 0..26 coordinate space).
const ICON = 26;
function iconBox(x, y, inner, opacity = 0.7) {
  return `<g transform="translate(${x} ${y})" fill="none" ${STROKE} stroke-opacity="${opacity}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="0.5" y="0.5" width="${ICON - 1}" height="${ICON - 1}" rx="5"/>${inner}</g>`;
}
function escalator(x, y) {
  return iconBox(x, y, '<path d="M6 20 L18 8"/><path d="M13.5 8 H18 V12.5"/><path d="M8.6 18.4 l1.5 -1.5 M11.5 15.5 l1.5 -1.5 M14.4 12.6 l1.5 -1.5"/>');
}
function elevator(x, y) {
  return iconBox(x, y, '<path d="M13 5.5 l-3.4 4.4 h6.8 z" fill="var(--text3)" stroke="none"/><path d="M13 20.5 l-3.4 -4.4 h6.8 z" fill="var(--text3)" stroke="none"/>');
}
function restroom(x, y) {
  return iconBox(x, y, '<line x1="13" y1="5.5" x2="13" y2="20.5" stroke-opacity="0.45"/><circle cx="8.6" cy="8" r="1.7"/><path d="M8.6 10.4 v5 M6.4 12 h4.4 M7.1 20 v-4.6 M10.1 20 v-4.6"/><circle cx="17.4" cy="8" r="1.7"/><path d="M17.4 10.4 l-2.3 5 h4.6 z M15.9 20 v-4.6 M18.9 20 v-4.6"/>');
}
function info(x, y) {
  return iconBox(x, y, '<circle cx="13" cy="8.4" r="1.4" fill="var(--text3)" stroke="none"/><path d="M13 12 V20"/>');
}
function baggage(x, y) {
  return `<g transform="translate(${x} ${y})" fill="none" ${STROKE} stroke-opacity="0.7" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="13" width="28" height="17" rx="3"/><path d="M11 13 V9.5 a2.5 2.5 0 0 1 2.5 -2.5 h9 a2.5 2.5 0 0 1 2.5 2.5 V13"/><path d="M13 13 V30 M23 13 V30"/></g>`;
}
function diamond(x, y) {
  return `<path d="M${x + 13} ${y + 5} L${x + 20} ${y + 13} L${x + 13} ${y + 21} L${x + 6} ${y + 13} Z" fill="none" ${STROKE} stroke-opacity="0.5" stroke-width="1.6"/>`;
}
function plane(cx, cy, scale, rot) {
  return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${scale})"><path d="M0 -18 C2 -18 3 -16 3 -12 L3 -4 L16 4 L16 8 L3 5 L3 13 L7 16 L7 19 L0 17 L-7 19 L-7 16 L-3 13 L-3 5 L-16 8 L-16 4 L-3 -4 L-3 -12 C-3 -16 -2 -18 0 -18 Z" fill="none" ${STROKE} stroke-opacity="0.5" stroke-width="1.8"/></g>`;
}
function transport(x, y, kind) {
  const glyph = kind === "taxi"
    ? `<rect x="${x + 5}" y="${y + 12}" width="18" height="8" rx="2"/><path d="M${x + 8} ${y + 12} l2 -5 h8 l2 5"/><circle cx="${x + 10}" cy="${y + 21}" r="2"/><circle cx="${x + 18}" cy="${y + 21}" r="2"/>`
    : kind === "bus"
      ? `<rect x="${x + 5}" y="${y + 6}" width="18" height="14" rx="2"/><path d="M${x + 5} ${y + 15} h18 M${x + 9} ${y + 6} v9 M${x + 14} ${y + 6} v9 M${x + 19} ${y + 6} v9"/><circle cx="${x + 10}" cy="${y + 21}" r="1.8"/><circle cx="${x + 18}" cy="${y + 21}" r="1.8"/>`
      : `<path d="M${x + 5} ${y + 17} l2 -5 h14 l2 5 v3 h-18 z"/><path d="M${x + 8} ${y + 12} l1 -4 h10 l1 4"/><circle cx="${x + 10}" cy="${y + 20}" r="1.8"/><circle cx="${x + 18}" cy="${y + 20}" r="1.8"/>`;
  return `<g fill="none" ${STROKE} stroke-opacity="0.75" stroke-width="1.6"><rect x="${x}" y="${y}" width="28" height="28" rx="5" stroke-dasharray="4 4" stroke-opacity="0.4"/>${glyph}</g>`;
}
function arrow(x1, y1, x2, y2) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const ah = 7;
  const ax = x2 - ah * Math.cos(ang - Math.PI / 6);
  const ay = y2 - ah * Math.sin(ang - Math.PI / 6);
  const bx = x2 - ah * Math.cos(ang + Math.PI / 6);
  const by = y2 - ah * Math.sin(ang + Math.PI / 6);
  return `<g ${STROKE} stroke-opacity="0.4" stroke-width="1.6" fill="none"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-dasharray="5 6"/><path d="M${ax.toFixed(1)} ${ay.toFixed(1)} L${x2} ${y2} L${bx.toFixed(1)} ${by.toFixed(1)}"/></g>`;
}

// --- Departures floor (design image 3) --------------------------------------

function departureFloor() {
  const parts = [];
  // Outer envelope: central body + landside notch.
  parts.push(wall("M120 120 H1328 V300 H1240 V760 H1328 V966 H120 V760 H208 V300 H120 Z", 0.5));
  // Top corner rooms (baggage / lounges) + top concourse band.
  parts.push(box(120, 120, 150, 150, 4, 0.5));
  parts.push(box(1178, 120, 150, 150, 4, 0.5));
  parts.push(baggage(176, 172), baggage(1234, 172)); // baggage carts in corner rooms
  parts.push(box(300, 150, 848, 120, 6, 0.5)); // concourse band
  parts.push(escalator(346, 186), restroom(468, 186), diamond(590, 186), elevator(700, 186), diamond(812, 186), restroom(922, 186), escalator(1044, 186));
  // Central check-in hall + islands.
  parts.push(box(408, 386, 632, 300, 8, 0.55));
  parts.push(`<line x1="448" y1="452" x2="1000" y2="452" ${STROKE} stroke-opacity="0.45" stroke-width="1.6"/>`);
  for (let i = 0; i < 7; i += 1) {
    parts.push(bank(452 + i * 84, 486, 5, 46, 22, 8, true));
  }
  // Left + right gate piers with planes.
  parts.push(wall("M120 330 L60 360 V706 L120 736", 0.45));
  parts.push(wall("M1328 330 L1388 360 V706 L1328 736", 0.45));
  parts.push(plane(78, 410, 2.1, 90), plane(78, 636, 2.1, 90));
  parts.push(plane(1370, 410, 2.1, -90), plane(1370, 636, 2.1, -90));
  parts.push(box(208, 360, 150, 150, 6, 0.4), box(1090, 360, 150, 150, 6, 0.4));
  parts.push(escalator(262, 420), escalator(1144, 420));
  // Lower processing pods + landside.
  parts.push(box(360, 760, 300, 150, 6, 0.5), box(788, 760, 300, 150, 6, 0.5));
  parts.push(escalator(408, 800), restroom(478, 800), info(724, 800), restroom(948, 800), escalator(1018, 800));
  parts.push(box(430, 918, 588, 60, 6, 0.45)); // curbside walk
  // Curbside transport.
  parts.push(transport(430, 992, "taxi"), transport(710, 992, "bus"), transport(990, 992, "car"));
  // Flow arrows landside -> check-in -> concourse -> gates.
  parts.push(arrow(560, 906, 566, 700), arrow(882, 906, 882, 700));
  parts.push(arrow(724, 384, 724, 288), arrow(430, 452, 250, 452), arrow(1018, 452, 1198, 452));
  return `<g>${parts.join("")}</g>`;
}

// --- Arrivals floor (design image 2) ----------------------------------------

function arrivalFloor() {
  const parts = [];
  // Top air-bridge / gate line with jet bridges.
  parts.push(wall("M120 96 H540 L580 128 H868 L908 96 H1328", 0.5));
  for (const x of [250, 330, 980, 1060]) {
    parts.push(`<rect x="${x}" y="82" width="26" height="26" rx="3" fill="none" ${STROKE} stroke-opacity="0.5" stroke-width="1.8"/>`);
  }
  parts.push(arrow(300, 150, 300, 210), arrow(1010, 150, 1010, 210));
  // Landing-side outer walk.
  parts.push(wall("M120 96 V300 H60 V690 H150", 0.4));
  parts.push(wall("M40 300 V690", 0.3));
  // Two immigration halls (counter banks) + center core.
  parts.push(box(150, 300, 470, 360, 8, 0.55)); // IMM-A hall
  parts.push(box(828, 300, 470, 360, 8, 0.55)); // IMM-B hall
  parts.push(box(640, 300, 168, 360, 8, 0.5)); // center core
  // Counter booths (rounded) in each hall.
  parts.push(bank(210, 336, 3, 118, 40, 22));
  parts.push(bank(858, 336, 3, 118, 40, 22));
  // Officer / gate glyphs + downward arrows through halls.
  parts.push(elevator(711, 352), info(711, 456)); // center core
  parts.push(escalator(432, 356), escalator(990, 356)); // hall escalators
  parts.push(restroom(300, 600), restroom(1122, 600)); // hall restrooms
  parts.push(arrow(392, 560, 392, 700), arrow(1056, 560, 1056, 700));
  parts.push(arrow(724, 470, 724, 632));
  // Baggage carousel loop.
  parts.push(`<rect x="300" y="780" width="848" height="180" rx="90" fill="none" ${STROKE} stroke-opacity="0.55" stroke-width="2.4"/>`);
  parts.push(`<rect x="360" y="838" width="728" height="64" rx="32" fill="none" ${INK} stroke-opacity="0.5" stroke-width="1.8"/>`);
  for (let i = 1; i < 6; i += 1) {
    const x = 360 + i * (728 / 6);
    parts.push(`<line x1="${x.toFixed(0)}" y1="838" x2="${x.toFixed(0)}" y2="902" ${INK} stroke-opacity="0.4" stroke-width="1.5"/>`);
  }
  // Customs band + arrivals hall / curbside.
  parts.push(box(560, 662, 328, 60, 6, 0.45)); // customs
  parts.push(arrow(724, 722, 724, 780));
  parts.push(arrow(560, 902, 560, 662), arrow(888, 902, 888, 662));
  // Curbside transport at the corners + bottom.
  parts.push(transport(150, 660, "bus"), transport(1270, 660, "car"));
  parts.push(transport(556, 998, "taxi"), transport(864, 998, "car"));
  return `<g>${parts.join("")}</g>`;
}
