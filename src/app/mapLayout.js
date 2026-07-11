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
// All wayfinding icons share one rounded frame and a single stroke weight so
// they read as a consistent set. Inner glyphs are drawn in a local 0..26 space
// then scaled up about their centre so they stay legible on the wide floor;
// stroke-width is divided by the scale so line weight stays constant.
const ICON = 26;
const ICON_SCALE = 1.5;
function iconBox(x, y, inner, opacity = 0.7) {
  const c = ICON / 2;
  return `<g transform="translate(${x} ${y}) translate(${c} ${c}) scale(${ICON_SCALE}) translate(${-c} ${-c})" fill="none" ${STROKE} stroke-opacity="${opacity}" stroke-width="${(1.7 / ICON_SCALE).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"><rect x="0.5" y="0.5" width="${ICON - 1}" height="${ICON - 1}" rx="5"/>${inner}</g>`;
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
  return `<g transform="translate(${x} ${y}) translate(18 17) scale(1.35) translate(-18 -17)" fill="none" ${STROKE} stroke-opacity="0.7" stroke-width="${(1.8 / 1.35).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="13" width="28" height="17" rx="3"/><path d="M11 13 V9.5 a2.5 2.5 0 0 1 2.5 -2.5 h9 a2.5 2.5 0 0 1 2.5 2.5 V13"/><path d="M13 13 V30 M23 13 V30"/></g>`;
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
  return `<g transform="translate(${x + 14} ${y + 14}) scale(1.3) translate(${-(x + 14)} ${-(y + 14)})" fill="none" ${STROKE} stroke-opacity="0.75" stroke-width="${(1.6 / 1.3).toFixed(2)}"><rect x="${x}" y="${y}" width="28" height="28" rx="5" stroke-dasharray="4 4" stroke-opacity="0.4"/>${glyph}</g>`;
}
function arrow(x1, y1, x2, y2) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const ah = 7;
  const ax = x2 - ah * Math.cos(ang - Math.PI / 6);
  const ay = y2 - ah * Math.sin(ang - Math.PI / 6);
  const bx = x2 - ah * Math.cos(ang + Math.PI / 6);
  const by = y2 - ah * Math.sin(ang + Math.PI / 6);
  return `<g ${STROKE} stroke-opacity="0.5" stroke-width="1.7" fill="none"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-dasharray="5 6"/><path d="M${ax.toFixed(1)} ${ay.toFixed(1)} L${x2} ${y2} L${bx.toFixed(1)} ${by.toFixed(1)}"/></g>`;
}
// Gate pier: a solid jet-bridge finger from a gate lounge out to its aircraft
// stand, ending in an arrowhead that marks the boarding direction (out to the
// apron, toward the parked plane).
function gatePier(x1, y1, x2, y2) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const ah = 9;
  const ax = x2 - ah * Math.cos(ang - Math.PI / 6);
  const ay = y2 - ah * Math.sin(ang - Math.PI / 6);
  const bx = x2 - ah * Math.cos(ang + Math.PI / 6);
  const by = y2 - ah * Math.sin(ang + Math.PI / 6);
  return `<g ${INK} stroke-opacity="0.6" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><path d="M${ax.toFixed(1)} ${ay.toFixed(1)} L${x2} ${y2} L${bx.toFixed(1)} ${by.toFixed(1)}"/></g>`;
}
// Gate letter tag, drawn faint in a lounge corner so it reads as wayfinding
// signage rather than competing with the live zone chip at the lounge centre.
function gateTag(x, y, label) {
  return `<text x="${x}" y="${y}" fill="var(--text3)" font-size="18" font-weight="600" font-family="IBM Plex Mono, monospace" opacity="0.6">${label}</text>`;
}
// Immigration desk booth: a rounded counter capsule with a marked officer
// position, drawn in rows across each arrivals immigration hall.
function immigrationDesk(x, y, w = 122, h = 40) {
  const midY = y + h / 2;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="none" ${INK} stroke-opacity="0.7" stroke-width="1.8"/>`
    + `<rect x="${x + w / 2 - 6}" y="${midY - 6}" width="12" height="12" rx="2" fill="var(--text2)" fill-opacity="0.5"/>`;
}
// Staircase glyph (descent to the ground floor).
function stairs(x, y) {
  return iconBox(x, y, '<path d="M6.5 20 h3.5 v-3.5 h3.5 v-3.5 h3.5 v-3.5 h1.5"/>');
}
// Customs / baggage-inspection check: a small case under a magnifier.
function customs(x, y) {
  return iconBox(x, y, '<rect x="5.5" y="11" width="8" height="6" rx="1"/><path d="M7.5 11 V9.2 a1.8 1.8 0 0 1 3.6 0 V11"/><circle cx="16.5" cy="14.5" r="3"/><path d="M18.7 16.7 L21 19"/>');
}
// Circled currency-exchange marker.
function exchange(x, y, r = 12.5) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="none" ${STROKE} stroke-opacity="0.7" stroke-width="1.6"/>`
    + `<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="15" font-weight="600" font-family="IBM Plex Mono, monospace" fill="var(--text3)">$</text>`;
}
// Circled first-aid marker.
function firstAid(x, y, r = 12.5) {
  return `<g fill="none" ${STROKE} stroke-opacity="0.7" stroke-width="1.6"><circle cx="${x}" cy="${y}" r="${r}"/><path d="M${x} ${y - 6} v12 M${x - 6} ${y} h12"/></g>`;
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
  // Apron taxiway guide lines outside each pier.
  parts.push(`<line x1="40" y1="360" x2="40" y2="706" ${STROKE} stroke-opacity="0.22" stroke-dasharray="10 12" stroke-width="1.6"/>`);
  parts.push(`<line x1="1408" y1="360" x2="1408" y2="706" ${STROKE} stroke-opacity="0.22" stroke-dasharray="10 12" stroke-width="1.6"/>`);
  // Parked aircraft, nose out to the apron, splayed off each gate stand.
  parts.push(plane(80, 400, 2.0, -90), plane(80, 672, 2.0, -90));
  parts.push(plane(1368, 400, 2.0, 90), plane(1368, 672, 2.0, 90));
  // Four gate lounges — A/C on the left pier, B/D on the right — each linked to
  // its aircraft stand by a jet-bridge arrow pointing out, tagged with its letter.
  parts.push(box(208, 360, 150, 150, 6, 0.4), box(208, 561, 150, 150, 6, 0.4));
  parts.push(box(1090, 360, 150, 150, 6, 0.4), box(1090, 561, 150, 150, 6, 0.4));
  parts.push(gatePier(210, 452, 122, 410), gatePier(210, 620, 122, 662));
  parts.push(gatePier(1238, 452, 1326, 410), gatePier(1238, 620, 1326, 662));
  parts.push(escalator(304, 468), escalator(304, 669), escalator(1186, 468), escalator(1186, 669));
  parts.push(gateTag(226, 392, "A"), gateTag(226, 593, "C"), gateTag(1108, 392, "B"), gateTag(1108, 593, "D"));
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

  // --- 1F arrivals concourse (top) with the central descent notch to GF ----
  parts.push(wall("M120 96 H560 L600 132 H848 L888 96 H1328", 0.5));
  // Jet-bridge gate stands along the top wall, each with a boarding door and a
  // down-arrow into the concourse.
  const topGates = [188, 300, 412, 524, 924, 1036, 1148, 1260];
  for (const x of topGates) {
    parts.push(`<rect x="${x}" y="80" width="26" height="26" rx="3" fill="none" ${STROKE} stroke-opacity="0.5" stroke-width="1.8"/>`);
    parts.push(arrow(x + 13, 118, x + 13, 148));
  }
  // Directional flow converging on the central descent.
  parts.push(arrow(320, 210, 470, 210), arrow(1128, 210, 978, 210));

  // Landing-side outer walk (angled corridor) with up-flow toward the halls.
  parts.push(wall("M120 96 V300 H60 V690 H150", 0.4));
  parts.push(wall("M40 300 V690", 0.3));
  parts.push(arrow(88, 470, 88, 356), arrow(150, 250, 214, 250));

  // Central descent core: escalator + stairs + escalator down to the ground
  // floor, with information desks below.
  parts.push(escalator(632, 150), stairs(724, 150), escalator(790, 150));
  parts.push(info(676, 232), info(746, 232));

  // --- Immigration halls (IMM-A left, IMM-B right) + centre customs core ----
  parts.push(box(150, 300, 470, 360, 8, 0.55)); // IMM-A hall
  parts.push(box(828, 300, 470, 360, 8, 0.55)); // IMM-B hall
  parts.push(box(640, 300, 168, 360, 8, 0.5)); // centre core

  // Immigration desk booths — three per hall, each with a marked officer.
  parts.push(immigrationDesk(176, 338), immigrationDesk(314, 338), immigrationDesk(452, 338));
  parts.push(immigrationDesk(854, 338), immigrationDesk(992, 338), immigrationDesk(1130, 338));
  // Baggage-claim tag at each hall's landing edge.
  parts.push(baggage(160, 396), baggage(1240, 396));
  // Service-band divider splitting each hall's immigration area from services.
  parts.push(`<line x1="168" y1="548" x2="602" y2="548" ${STROKE} stroke-opacity="0.3" stroke-width="1.5"/>`);
  parts.push(`<line x1="846" y1="548" x2="1280" y2="548" ${STROKE} stroke-opacity="0.3" stroke-width="1.5"/>`);
  // Long processing-flow lines the length of each hall (desks → services → exit).
  parts.push(arrow(300, 398, 300, 640), arrow(1120, 398, 1120, 640));

  // Hall service rows: currency exchange, first-aid, restroom, car service.
  parts.push(exchange(214, 600), firstAid(300, 600), restroom(348, 588), transport(452, 574, "car"));
  parts.push(exchange(1234, 600), firstAid(1148, 600), restroom(1076, 588), transport(968, 574, "car"));

  // Centre core: customs office, hall inspection points, lift, restroom, info.
  parts.push(box(662, 452, 124, 92, 6, 0.45)); // customs office
  parts.push(customs(586, 466), customs(834, 466)); // hall → customs inspection
  parts.push(elevator(658, 306), restroom(750, 306));
  parts.push(info(712, 566));
  parts.push(arrow(724, 306, 724, 452), arrow(724, 452, 724, 640));

  // --- Baggage carousel (GF) ----------------------------------------------
  parts.push(`<rect x="300" y="784" width="848" height="184" rx="92" fill="none" ${STROKE} stroke-opacity="0.55" stroke-width="2.4"/>`);
  parts.push(`<rect x="356" y="836" width="736" height="76" rx="38" fill="none" ${INK} stroke-opacity="0.5" stroke-width="1.8"/>`);
  // Belt spine + slats so the carousel reads as a moving reclaim belt.
  parts.push(`<line x1="374" y1="874" x2="1074" y2="874" ${INK} stroke-opacity="0.28" stroke-width="1.4" stroke-dasharray="3 7"/>`);
  for (let i = 1; i < 10; i += 1) {
    const x = 356 + i * (736 / 10);
    parts.push(`<line x1="${x.toFixed(0)}" y1="838" x2="${x.toFixed(0)}" y2="910" ${INK} stroke-opacity="0.3" stroke-width="1.4"/>`);
  }
  // Routing lines from each hall down and inward to the carousel feed points.
  parts.push(`<path d="M300 640 V702 H560" fill="none" ${STROKE} stroke-opacity="0.32" stroke-width="1.5" stroke-dasharray="5 7"/>`);
  parts.push(`<path d="M1120 640 V702 H888" fill="none" ${STROKE} stroke-opacity="0.32" stroke-width="1.5" stroke-dasharray="5 7"/>`);
  // Down-flow from customs into the reclaim hall + curbside exit.
  parts.push(arrow(560, 700, 560, 784), arrow(888, 700, 888, 784));
  parts.push(arrow(724, 700, 724, 784), arrow(724, 968, 724, 1012));

  // Curbside transport: bus + car at the corners, taxi + car at the exit.
  parts.push(transport(150, 700, "bus"), transport(1270, 700, "car"));
  parts.push(transport(556, 1006, "taxi"), transport(864, 1006, "car"));

  return `<g>${parts.join("")}</g>`;
}
