/*
 * Stratus Digital Twin — Airport Flow Ops app shell.
 *
 * This is the composition root. It reads the live OperationalSnapshot through
 * the operational-database reader (whose schema is defined by
 * database/migrations and populated by database/seeds — mirrored into the
 * deterministic fixtures the browser runs on), then derives:
 *
 *   snapshot  -> monitoring   (queue / counter / staffing / alerts)
 *             -> prediction   (120 min forecast horizon)
 *             -> simulation   (scenario projection for Simulate mode)
 *             -> decision-support (ranked recommendations for the copilot)
 *
 * Every number on screen traces back to that pipeline; nothing is invented in
 * the view. The imported "Airport Flow Ops" design is reproduced here in the
 * repository's dependency-free ES-module style (template strings + delegated
 * DOM events) instead of the design-preview runtime it shipped with.
 */

import {
  createOperationalDatabaseReader,
  createOperationalDatabaseRowsFromSnapshot,
} from "../operational-database/index.js";
import { DEFAULT_PREDICTION_REFRESH_CADENCE_SECONDS, predictionService } from "../prediction/index.js";
import { MonitoringViewModel } from "../monitoring/index.js";
import { defaultScenarioDecisions, simulationService } from "../simulation/index.js";
import { decisionSupportService } from "../decision-support/index.js";
import { createFixtureSnapshotSeries } from "../fixtures/deterministicAdapters.js";
import { computeMapLayout, mapBackgroundSvg, zonesForView, MAP_VIEWBOX } from "./mapLayout.js";
import { OTTO_SIDE_SVG, OTTO_FACE_SVG } from "./ottoAssets.js";

const ACCENT = "#29a3ff";
const LIGHTBLUE = "#7cc4ff"; // "current time" timestamp accent
const OK = "#32c783";
const WARN = "#f5b942";
const BUSY = "#f05b61";
// Personnel colours are chosen so the three groups read apart at a glance:
// passengers are cool blue dots, staff roles are a warm gold/coral family, and
// "other personnel" (customs) is violet — none of them blue or zone-green.
const PAX_COLOR = ACCENT; // passengers — cool blue
const ROLE_COLOR = {
  "immigration-officer": "#ffd15c", // gold   (staff)
  security: "#ff8a5c", // coral  (staff)
  "ground-staff": "#f0a63c", // amber  (staff — warm, kept clear of the violet below)
  "customs-officer": "#b892ff", // violet (other personnel)
};

// Muted map-layer variants of the OK/WARN status colours so green/yellow zones
// recede against the dark floor and red stays the eye's first stop. The vivid
// OK/WARN are kept for panels (cards, hover, legend).
const OK_MAP = "#4f8a70"; // muted green
const WARN_MAP = "#b08a43"; // muted amber

const SNAPSHOT_VARIANTS = ["normal", "peak", "stale"];
const snapshotSeries = createFixtureSnapshotSeries();
const LIVE_REFRESH_MS = 5000; // demo cadence for pulling a fresh live snapshot

// One reader over the whole series; the row source closes over the current
// live index so getSnapshot() always returns the active snapshot.
const databaseReader = createOperationalDatabaseReader(() =>
  createOperationalDatabaseRowsFromSnapshot(
    snapshotSeries[state.snapshotIndex],
    `live-${SNAPSHOT_VARIANTS[state.snapshotIndex]}-${snapshotSeries[state.snapshotIndex].asOf}`,
  ),
);

const app = typeof document !== "undefined" ? document.querySelector("#app") : null;

const state = {
  snapshotIndex: 1, // start at the peak snapshot (matches the SQL seed)
  minute: 0, // forecast-horizon position [0..120]
  view: "departure",
  mode: "live", // live | sim
  selected: null,
  tool: null,
  otto: false, // Otto AI explanation expanded in the selected zone's card
  theme: "dark",
  zoom: 1,
  panX: 0,
  panY: 0,
  hover: null,
  layers: { pax: true, staff: true, heat: true },
  simDecisions: {}, // zoneId -> staged additional open counters
  simMovements: [], // { from, to, passengers }
  simShiftStaggered: false,
  appliedDecisions: {},
  appliedMovements: [],
  appliedShiftStaggered: false,
  playing: false,
  speed: 1,
  booted: false,
  tick: 0,
  lastRefresh: 0,
  log: [],
};

let lastFrame = null; // latest computed frame, for event handlers
const dragState = { active: false, x: 0, y: 0, px: 0, py: 0 };

// --- small helpers ----------------------------------------------------------

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseClockMinutes(iso) {
  // Use the wall-clock portion of the ISO timestamp (HH:MM) so we render the
  // operator-facing local time without timezone drift.
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function hhmm(totalMinutes) {
  const m = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function labelize(value) {
  return String(value).replaceAll("-", " ");
}

function pct(ratio) {
  return `${Math.round(ratio * 100)}%`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// Triangle-exclamation glyph used to flag critical (red) zones and queues, so
// the highest-severity state reads at a glance instead of just a coloured dot.
function warnTriangle(color, size = 13) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:none; filter:drop-shadow(0 0 4px ${color});"><path d="M12 3 2.4 20.2h19.2L12 3Z"/><path d="M12 9.5v4.6M12 17.6v.2"/></svg>`;
}

// Status marker: a triangle-exclamation for critical zones, otherwise the
// familiar coloured status dot at the requested pixel size.
function zoneMarker(status, color, dotPx = 6) {
  if (status === "critical") return warnTriangle(color, dotPx + 6);
  return `<span style="width:${dotPx}px; height:${dotPx}px; border-radius:50%; background:${color}; box-shadow:0 0 6px ${color}; display:inline-block; flex:none;"></span>`;
}

// --- scenario staging -------------------------------------------------------

function activeDecisionState() {
  return state.mode === "sim"
    ? { counters: state.simDecisions, movements: state.simMovements, shift: state.simShiftStaggered }
    : { counters: state.appliedDecisions, movements: state.appliedMovements, shift: state.appliedShiftStaggered };
}

function decisionsFor(snapshot, set) {
  const decisions = [];
  for (const [zoneId, delta] of Object.entries(set.counters)) {
    const counter = snapshot.counters.find((c) => c.zoneId === zoneId);
    if (!counter) continue;
    const capped = clamp(delta, 0, counter.maxOpen - counter.open);
    if (capped > 0) decisions.push({ type: "counter-capacity", zoneId, openDelta: capped });
  }
  const zoneIds = new Set(snapshot.zones.map((z) => z.zoneId));
  for (const move of set.movements) {
    if (zoneIds.has(move.from) && zoneIds.has(move.to)) {
      decisions.push({ type: "passenger-movement", fromZoneId: move.from, toZoneId: move.to, passengers: move.passengers });
    }
  }
  if (set.shift) decisions.push({ type: "shift-timing", role: "security", startDeltaMinutes: -20 });
  return decisions;
}

function draftCount() {
  const counters = Object.values(state.simDecisions).filter((d) => d > 0).length;
  return counters + state.simMovements.length + (state.simShiftStaggered ? 1 : 0);
}

function enterSim() {
  state.mode = "sim";
  state.simDecisions = { ...state.appliedDecisions };
  state.simMovements = state.appliedMovements.map((m) => ({ ...m }));
  state.simShiftStaggered = state.appliedShiftStaggered;
}

function goLive() {
  state.mode = "live";
}

function confirmDecisions() {
  state.appliedDecisions = { ...state.simDecisions };
  state.appliedMovements = state.simMovements.map((m) => ({ ...m }));
  state.appliedShiftStaggered = state.simShiftStaggered;
  state.mode = "live";
  state.log = [{ time: hhmm(currentClockMinutes()), txt: "Decisions committed to live snapshot", dot: OK }, ...state.log].slice(0, 3);
}

function stageCounter(zoneId, delta) {
  if (state.mode !== "sim") enterSim();
  const snapshot = lastFrame.snapshot;
  const counter = snapshot.counters.find((c) => c.zoneId === zoneId);
  if (!counter) return;
  const maxDelta = counter.maxOpen - counter.open;
  const current = state.simDecisions[zoneId] ?? 0;
  state.simDecisions[zoneId] = clamp(current + delta, 0, maxDelta);
}

function applyOption(option) {
  if (state.mode !== "sim") enterSim();
  const decision = option.decision;
  if (decision.type === "counter-capacity") {
    stageCounter(decision.zoneId, decision.openDelta ?? 1);
  } else if (decision.type === "staff-reassignment") {
    // Moving same-role staff exists to open relief capacity in the target zone.
    stageCounter(decision.toZoneId, 1);
  } else if (decision.type === "passenger-movement") {
    state.simMovements = [
      ...state.simMovements,
      { from: decision.fromZoneId, to: decision.toZoneId, passengers: decision.passengers ?? 40 },
    ];
  } else if (decision.type === "shift-timing") {
    state.simShiftStaggered = true;
  }
}

function currentClockMinutes() {
  const snapshot = snapshotSeries[state.snapshotIndex];
  return parseClockMinutes(snapshot.asOf) + state.minute;
}

// --- frame computation (pure data from the pipeline) ------------------------

function computeFrame() {
  const snapshot = databaseReader.getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const monitoring = MonitoringViewModel.from(snapshot, forecast);
  const alerts = monitoring.analytics.operationalAlerts;

  // Recommendations come from the canonical decision path (default scenario
  // decisions target the pressured zones), exactly like the domain tests.
  const baselineProjection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const options = decisionSupportService.options(snapshot, forecast, baselineProjection, alerts);

  // The map/timeline animate the active scenario across the forecast horizon.
  const activeSet = activeDecisionState();
  let projection;
  try {
    projection = simulationService.project(snapshot, forecast, decisionsFor(snapshot, activeSet));
  } catch {
    projection = simulationService.project(snapshot, forecast, []);
  }
  const projectionPoint =
    projection.points.find((p) => p.minute === state.minute) ?? projection.points[0];
  const nextPoint =
    projection.points.find((p) => p.minute === state.minute + 20) ??
    projection.points.find((p) => p.minute === state.minute + 15) ??
    projectionPoint;

  const layout = computeMapLayout(snapshot.zones, snapshot.airport.paths, state.view);
  const viewZones = zonesForView(snapshot.zones, state.view);

  const mapZones = viewZones.map((zone) => {
    const pos = layout.positions[zone.zoneId];
    const proj = projectionPoint.zones.find((z) => z.zoneId === zone.zoneId);
    const next = nextPoint.zones.find((z) => z.zoneId === zone.zoneId);
    const mon = monitoring.zones.find((z) => z.zoneId === zone.zoneId);
    const queue = mon.queueState;
    const util = mon.counterUtilization;
    const staffing = mon.staffingContext;
    const status = proj.status;
    const color = status === "critical" ? BUSY : status === "watch" ? WARN : OK;
    // Muted variant for map-layer glow/dots so green/yellow zones recede.
    const mapColor = status === "critical" ? BUSY : status === "watch" ? WARN_MAP : OK_MAP;
    const loadPct = Math.round(proj.queuePressure * 100);
    const forecastDelta = Math.round((next.queuePressure - proj.queuePressure) * 100);
    const staffHere = snapshot.staff.filter((s) => s.zoneId === zone.zoneId);
    const paxCount = state.booted ? clamp(Math.round(proj.expectedOccupancy / 42), 3, 30) : 0;
    return {
      zoneId: zone.zoneId,
      label: zone.label,
      type: zone.type,
      capacity: zone.capacity,
      roleRequired: util?.zoneId ? staffing?.roleRequired : mon.staffingContext?.roleRequired,
      cx: pos.cx,
      cy: pos.cy,
      chipLeft: pos.chipLeft,
      chipTop: pos.chipTop,
      hit: pos,
      status,
      color,
      mapColor,
      loadPct,
      forecastDelta,
      projOccupancy: proj.expectedOccupancy,
      occupancy: zone.occupancy,
      queueLength: queue.queueLength,
      wait: queue.estimatedWaitMinutes,
      density: queue.densityPerSquareMeter,
      severity: queue.severity,
      confidence: mon.confidence,
      freshness: mon.freshness,
      alert: mon.alert,
      bottleneck: mon.bottleneck,
      utilization: util,
      staffing,
      openCounters: util ? util.openCounters : null,
      staffHere,
      paxCount,
      // Critical stays loud; watch/normal glow is dialled down so red leads.
      heatOpacity: status === "critical" ? 0.28 : status === "watch" ? 0.085 : 0.035,
    };
  });

  const kpiPax = snapshot.zones.reduce((total, z) => total + z.occupancy, 0);
  const kpiStaff = snapshot.staff.length;
  const kpiWait = mapZones.reduce((max, z) => Math.max(max, z.wait), 0);
  const kpiAlerts = alerts.length;
  const freshCount = mapZones.filter((z) => z.freshness.status === "fresh").length;

  return {
    snapshot,
    forecast,
    monitoring,
    projection,
    projectionPoint,
    options,
    layout,
    mapZones,
    alerts,
    kpiPax,
    kpiStaff,
    kpiWait,
    kpiAlerts,
    freshCount,
  };
}

// --- render -----------------------------------------------------------------

function renderToString() {
  const frame = computeFrame();
  lastFrame = frame;

  const { snapshot, monitoring, mapZones, alerts, options } = frame;
  const clockMinutes = currentClockMinutes();
  const isSim = state.mode === "sim";
  const selectedZone = state.selected ? mapZones.find((z) => z.zoneId === state.selected) : null;

  return `
    <div data-theme="${state.theme}" style="height:100vh; display:grid; grid-template-rows:58px 1fr 82px; overflow:hidden; background:var(--bg-app); color:var(--text);">
      ${renderCommandBar(frame, clockMinutes, isSim)}
      <main style="position:relative; min-height:0; overflow:hidden; background:var(--panel2);">
        ${renderMap(frame, isSim)}
        ${renderToolRail(frame)}
        ${isSim ? renderSimBanner() : ""}
        ${renderInsightPanel(frame, selectedZone, isSim)}
        ${isSim ? renderSimDock(frame) : ""}
        ${renderBoot()}
      </main>
      ${renderTimeline(frame, clockMinutes, isSim)}
    </div>
  `;
}

function render() {
  if (!app) return;
  app.innerHTML = renderToString();
  wireEvents();
}

function renderCommandBar(frame, clockMinutes, isSim) {
  const { snapshot, kpiPax, kpiAlerts, mapZones } = frame;
  const allFresh = frame.freshCount === mapZones.length;
  const freshColor = allFresh ? OK : WARN;
  const alertColor = kpiAlerts > 0 ? BUSY : OK;
  const viewLabel = state.view === "arrival" ? "Arrivals" : "Departures";
  const viewBtns = [
    { key: "departure", label: "Departures" },
    { key: "arrival", label: "Arrivals" },
  ]
    .map(
      (v) =>
        `<button data-view="${v.key}" style="padding:7px 14px; border:none; background:${state.view === v.key ? "var(--hover)" : "transparent"}; color:${state.view === v.key ? "var(--text)" : "var(--text3)"}; cursor:pointer; font-size:12px; font-weight:500;">${v.label}</button>`,
    )
    .join("");
  const modeBtns = [
    { key: "live", label: "Live", dot: BUSY },
    { key: "sim", label: "Simulate", dot: WARN },
  ]
    .map((m) => {
      const activeBg = m.key === "sim" ? WARN : "var(--hover)";
      const activeFg = m.key === "sim" ? "#04121f" : "var(--text)";
      return `<button data-mode="${m.key}" style="display:flex; align-items:center; gap:6px; padding:7px 13px; border:none; background:${state.mode === m.key ? activeBg : "transparent"}; color:${state.mode === m.key ? activeFg : "var(--text3)"}; cursor:pointer; font-size:12px; font-weight:600;"><span style="width:6px; height:6px; border-radius:50%; background:${m.dot};"></span>${m.label}</button>`;
    })
    .join("");

  return `
    <header style="display:flex; align-items:center; gap:16px; padding:0 18px; background:var(--panel2); border-bottom:1px solid var(--border);">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:26px; height:26px; border:1.5px solid ${ACCENT}; border-radius:5px; display:flex; align-items:center; justify-content:center;">
          <div style="width:11px; height:11px; background:${ACCENT}; border-radius:2px; box-shadow:0 0 9px rgba(41,163,255,.7); animation:livedot 2s infinite;"></div>
        </div>
        <span style="font-weight:700; font-size:15px;">Stratus</span>
        <span style="font-size:11px; color:var(--text3);">Digital Twin</span>
      </div>
      <div style="width:1px; height:26px; background:var(--border);"></div>
      <div style="display:flex; align-items:center; gap:20px;">
        <div><div style="font-size:9px; color:var(--text3); letter-spacing:.05em;">TERMINAL</div><div style="font-size:12px; font-weight:500;">${snapshot.airport.airportId} · T1 ${viewLabel}</div></div>
        <div><div style="font-size:9px; color:${LIGHTBLUE}; letter-spacing:.05em;">CURRENT TIME</div><div class="mono" style="font-size:12px; font-weight:600; color:${LIGHTBLUE};">${hhmm(parseClockMinutes(snapshot.asOf))}</div></div>
        <div><div style="font-size:9px; color:var(--text3); letter-spacing:.05em;">OCCUPANCY</div><div class="mono" style="font-size:12px;">${kpiPax.toLocaleString("en")}</div></div>
        <div><div style="font-size:9px; color:var(--text3); letter-spacing:.05em;">ALERTS</div><div class="mono" style="font-size:12px; color:${alertColor};">${kpiAlerts}</div></div>
      </div>
      <div style="flex:1;"></div>
      <div style="display:flex; border:1px solid var(--border); border-radius:6px; overflow:hidden;">${viewBtns}</div>
      <div style="display:flex; border:1px solid var(--border); border-radius:6px; overflow:hidden;">${modeBtns}</div>
      <div style="display:flex; align-items:center; gap:6px; padding:6px 10px; border:1px solid ${allFresh ? "rgba(50,199,131,.4)" : "rgba(245,185,66,.4)"}; border-radius:6px; font-size:11px; color:${freshColor};">
        <span style="width:6px; height:6px; border-radius:50%; background:${freshColor};"></span>${allFresh ? "All fresh" : `${frame.freshCount}/${mapZones.length} fresh`}
      </div>
    </header>
  `;
}

function renderMap(frame, isSim) {
  const { snapshot, layout, mapZones } = frame;
  const invZoom = Math.round((1 / state.zoom) * 1000) / 1000;
  const grabCursor = state.zoom > 1 ? (dragState.active ? "grabbing" : "grab") : "default";

  const heat = state.layers.heat
    ? mapZones
        .map((z) => `<circle cx="${z.cx}" cy="${z.cy}" r="104" fill="${z.mapColor}" fill-opacity="${z.heatOpacity}" filter="url(#soft)"></circle>`)
        .join("")
    : "";
  const busyRings = mapZones
    .filter((z) => z.status === "critical")
    .map((z) => `<circle cx="${z.cx}" cy="${z.cy}" r="60" fill="none" stroke="${z.color}" stroke-width="2.5" stroke-dasharray="5 7" style="animation:softpulse 1.4s infinite; filter:drop-shadow(0 0 5px ${z.color});"></circle>`)
    .join("");

  const passengers = state.layers.pax
    ? mapZones
        .flatMap((z) => {
          const dots = [];
          const seed = z.zoneId.length;
          for (let i = 0; i < z.paxCount; i += 1) {
            const rx = ((Math.sin((seed + i) * 12.9898) * 43758.5453) % 1 + 1) % 1;
            const ry = ((Math.sin((seed + i) * 78.233) * 43758.5453) % 1 + 1) % 1;
            const x = z.hit.hitX + 12 + rx * (z.hit.hitW - 24) + Math.sin(state.tick * 0.9 + i) * 3;
            const y = z.hit.hitY + 12 + ry * (z.hit.hitH - 24) + Math.cos(state.tick * 0.8 + i) * 3;
            dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${PAX_COLOR}" filter="url(#glow)"></circle>`);
          }
          return dots;
        })
        .join("")
    : "";

  const staff = state.layers.staff && state.booted
    ? mapZones
        .flatMap((z) => {
          const n = z.staffHere.length;
          if (n === 0) return [];
          const span = z.hit.hitW - 30;
          return z.staffHere.map((s, i) => {
            const x = z.hit.hitX + 15 + (i + 0.5) * (span / n);
            const y = z.cy + 30 + Math.sin(state.tick + i) * 1.6;
            return `<rect x="${(x - 5.5).toFixed(1)}" y="${(y - 5.5).toFixed(1)}" width="11" height="11" rx="2" fill="${ROLE_COLOR[s.role] || "#8aa0b2"}" stroke="var(--bg-app)" stroke-width="1.5"></rect>`;
          });
        })
        .join("")
    : "";

  const nodeDots = mapZones
    .map((z) => `<circle cx="${z.cx}" cy="${z.cy}" r="3.5" fill="${z.mapColor}" filter="url(#glow)"></circle>`)
    .join("");

  const chips = mapZones
    .map((z) => {
      const statusBorder = z.status === "critical" ? BUSY : z.status === "watch" ? "rgba(176,138,67,.5)" : "var(--border2)";
      const selRing = z.zoneId === state.selected ? "box-shadow:0 0 0 2px " + z.mapColor + ";" : "";
      const base = `position:absolute; left:${z.chipLeft}%; top:${z.chipTop}%; transform:translate(-50%,-50%) scale(${invZoom}); cursor:pointer; z-index:4; background:var(--chip-bg); backdrop-filter:blur(3px); border:1px solid ${statusBorder};`;
      return `
      <div data-zone-chip="${z.zoneId}" style="${base} display:flex; align-items:center; gap:7px; border-radius:5px; padding:4px 9px; white-space:nowrap; ${selRing}">
        ${zoneMarker(z.status, z.mapColor, 6)}
        <span style="font-size:11px; font-weight:600; color:var(--text);">${z.label}</span>
        <span class="mono" style="font-size:11px; font-weight:600; color:${z.mapColor};">${z.loadPct}%</span>
      </div>`;
    })
    .join("");

  // Layer 2 (hover preview) still works while Layer 3 (a selected zone's detail
  // panel) is open — you can quick-view other zones — except the selected zone
  // itself, whose stats already fill the detail panel.
  const hover = state.hover && state.hover !== state.selected ? mapZones.find((z) => z.zoneId === state.hover) : null;
  const hoverTip = hover ? renderHoverTip(hover, invZoom) : "";

  return `
    <div data-pan style="position:absolute; inset:0; cursor:${grabCursor}; overflow:hidden;">
      <div style="position:absolute; inset:0; background:var(--map-grad);"></div>
      <div style="position:absolute; inset:0; transform:translate(${state.panX}px, ${state.panY}px) scale(${state.zoom}); transform-origin:center center;">
        <svg viewBox="0 0 ${MAP_VIEWBOX.w} ${MAP_VIEWBOX.h}" preserveAspectRatio="xMidYMid meet" style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none;">
          <defs>
            <filter id="soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="34"></feGaussianBlur></filter>
            <filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3" result="b"></feGaussianBlur><feMerge><feMergeNode in="b"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge></filter>
          </defs>
          ${mapBackgroundSvg(layout)}
          <g opacity="${state.layers.heat ? 1 : 0}">${heat}</g>
          ${busyRings}
          <g opacity="${state.layers.pax ? 1 : 0}">${passengers}</g>
          <g opacity="${state.layers.staff ? 1 : 0}">${staff}</g>
          ${nodeDots}
        </svg>
        ${chips}
        ${hoverTip}
      </div>
    </div>
  `;
}

function renderHoverTip(hover, invZoom) {
  // Zones near the top of the floor (e.g. Departure Hall) can't place the tip
  // above the chip — it would be clipped by the map's overflow. Flip those below.
  const nearTop = hover.chipTop < 30;
  const tx = hover.chipLeft > 62
    ? "translate(-106%,-50%)"
    : hover.chipLeft < 22
      ? "translate(6%,-50%)"
      : nearTop
        ? "translate(-50%,18%)"
        : "translate(-50%,-118%)";
  // Layer 2 — a concise hover preview: title + load, then Wait · Queue.
  return `
    <div style="position:absolute; left:${hover.chipLeft}%; top:${hover.chipTop}%; transform:${tx} scale(${invZoom}); z-index:10; pointer-events:none; width:192px; background:var(--panel); border:1px solid ${hover.color}; border-radius:8px; box-shadow:0 10px 30px var(--scrim); padding:9px 11px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span style="display:flex; align-items:center; gap:7px; min-width:0;">
          ${zoneMarker(hover.status, hover.color, 7)}
          <span style="font-size:12px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${hover.label}</span>
        </span>
        <span class="mono" style="font-size:15px; font-weight:600; color:${hover.color}; flex:none;">${hover.loadPct}%</span>
      </div>
      <div style="display:flex; align-items:center; gap:8px; margin-top:6px; font-size:11px; color:var(--text3);">
        <span>Wait <span class="mono" style="color:${hover.color};">${hover.wait}m</span></span>
        <span style="color:var(--border2);">·</span>
        <span>Queue <span class="mono" style="color:var(--text);">${hover.queueLength}</span></span>
      </div>
    </div>
  `;
}

const TOOL_META = [
  { key: "overview", label: "Overview", icon: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' },
  { key: "zones", label: "Zones", icon: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>' },
  { key: "layers", label: "Layers", icon: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h16M4 12h16M4 16h16"/></svg>' },
  { key: "staffing", label: "Staffing", icon: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><path d="M4 20c0-3 2.5-5 5-5s5 2 5 5"/><circle cx="17" cy="9" r="2.2"/><path d="M15 20c0-2.5 1.5-4 4-4"/></svg>' },
  { key: "flights", label: "Flights", icon: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15l-8-3.5V5.5a1.5 1.5 0 0 0-3 0V11L2 15v2l8-2v4l-2 1.2V22l3.5-1 3.5 1v-1.8L13 19v-4l8 2Z"/></svg>' },
  { key: "incidents", label: "Incidents", icon: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v5M12 17.5v.5"/></svg>' },
];

function renderToolRail(frame) {
  const railButtons = TOOL_META.map((t) => {
    const active = state.tool === t.key;
    const badge = t.key === "incidents" && frame.kpiAlerts > 0;
    return `<button data-tool="${t.key}" title="${t.label}" style="width:38px; height:38px; border:none; border-radius:7px; background:${active ? ACCENT : "transparent"}; color:${active ? "#04121f" : "var(--text2)"}; cursor:pointer; display:flex; align-items:center; justify-content:center; position:relative;"><span style="width:19px; height:19px; display:flex;">${t.icon}</span>${badge ? `<span style="position:absolute; top:5px; right:5px; width:6px; height:6px; border-radius:50%; background:${BUSY}; box-shadow:0 0 5px ${BUSY};"></span>` : ""}</button>`;
  }).join("");

  const themeIcon = state.theme === "dark"
    ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>'
    : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';

  return `
    <div style="position:absolute; left:14px; top:14px; bottom:14px; z-index:12; display:flex; gap:10px; align-items:stretch;">
      <div style="width:52px; background:var(--panel); border:1px solid var(--border); border-radius:9px; padding:7px; display:flex; flex-direction:column; gap:4px;">
        ${railButtons}
        <div style="flex:1;"></div>
        <div style="height:1px; background:var(--border); margin:2px 3px;"></div>
        <button data-action="zoom-in" title="Zoom in" style="width:38px; height:32px; border:none; border-radius:7px; background:transparent; color:var(--text2); cursor:pointer; font-size:17px;">+</button>
        <div class="mono" style="text-align:center; font-size:9px; color:var(--text3);">${Math.round(state.zoom * 100)}%</div>
        <button data-action="zoom-out" title="Zoom out" style="width:38px; height:32px; border:none; border-radius:7px; background:transparent; color:var(--text2); cursor:pointer; font-size:19px;">−</button>
        <button data-action="zoom-reset" title="Reset view" style="width:38px; height:30px; border:none; border-radius:7px; background:transparent; color:var(--text3); cursor:pointer; display:flex; align-items:center; justify-content:center;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9V4h5M21 9V4h-5M3 15v5h5M21 15v5h-5"/></svg></button>
        <div style="height:1px; background:var(--border); margin:2px 3px;"></div>
        <button data-action="toggle-theme" title="Toggle theme" style="width:38px; height:34px; border:none; border-radius:7px; background:var(--hover); color:var(--text2); cursor:pointer; display:flex; align-items:center; justify-content:center;">${themeIcon}</button>
      </div>
      ${state.tool ? renderDrawer(frame) : ""}
    </div>
  `;
}

function renderDrawer(frame) {
  const titles = { overview: "Overview", zones: "Zones", layers: "Map Layers", staffing: "Staffing", flights: "Inbound Flights", incidents: "Incidents" };
  return `
    <div style="width:250px; background:var(--panel); border:1px solid var(--border); border-radius:9px; display:flex; flex-direction:column; animation:drawin .18s ease; overflow:hidden;">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:11px 13px; border-bottom:1px solid var(--border);">
        <span style="font-size:12px; font-weight:600;">${titles[state.tool] || ""}</span>
        <button data-action="close-drawer" style="border:none; background:none; color:var(--text3); cursor:pointer; font-size:15px;">✕</button>
      </div>
      <div style="overflow-y:auto; padding:11px 12px 14px;">${renderDrawerBody(frame)}</div>
    </div>
  `;
}

function renderDrawerBody(frame) {
  const { mapZones, kpiPax, kpiStaff, kpiWait, kpiAlerts, alerts, snapshot } = frame;
  if (state.tool === "overview") {
    const stats = [
      { k: "Occupancy", v: kpiPax.toLocaleString("en"), color: "var(--text)" },
      { k: "On shift", v: kpiStaff, color: "var(--text)" },
      { k: "Max wait", v: `${kpiWait}m`, color: kpiWait > 6 ? BUSY : kpiWait > 3 ? WARN : "var(--text)" },
      { k: "Alerts", v: kpiAlerts, color: kpiAlerts > 0 ? BUSY : OK },
    ];
    return `<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">${stats
      .map((s) => `<div style="background:var(--panel2); border:1px solid var(--border); border-radius:7px; padding:9px 10px;"><div style="font-size:10px; color:var(--text3);">${s.k}</div><div class="mono" style="font-size:19px; font-weight:600; margin-top:3px; color:${s.color};">${s.v}</div></div>`)
      .join("")}</div>`;
  }
  if (state.tool === "zones") {
    return `<div style="display:flex; flex-direction:column; gap:6px;">${mapZones
      .map(
        (z) => `<div data-zone-chip="${z.zoneId}" style="background:${z.zoneId === state.selected ? "var(--hover)" : "var(--panel2)"}; border:1px solid ${z.status === "critical" ? BUSY : "var(--border)"}; border-radius:7px; padding:9px 10px; cursor:pointer;"><div style="display:flex; align-items:center; justify-content:space-between;"><span style="display:flex; align-items:center; gap:7px;"><span style="width:6px; height:6px; border-radius:50%; background:${z.color};"></span><span style="font-size:12px; font-weight:500;">${z.label}</span></span><span class="mono" style="font-size:12px; font-weight:600; color:${z.color};">${z.loadPct}%</span></div><div style="height:3px; background:var(--border); border-radius:2px; margin-top:7px; overflow:hidden;"><div style="height:100%; width:${Math.min(100, z.loadPct)}%; background:${z.color};"></div></div></div>`,
      )
      .join("")}</div>`;
  }
  if (state.tool === "layers") {
    const layerMeta = [
      { key: "pax", label: "Passengers", swatch: PAX_COLOR },
      { key: "staff", label: "Manpower", swatch: ROLE_COLOR["immigration-officer"] },
      { key: "heat", label: "Congestion heat", swatch: BUSY },
    ];
    return `<div style="display:flex; flex-direction:column; gap:7px;">${layerMeta
      .map((l) => {
        const on = state.layers[l.key];
        return `<button data-layer="${l.key}" style="display:flex; align-items:center; justify-content:space-between; padding:9px 10px; border:1px solid var(--border); border-radius:7px; background:${on ? "var(--hover)" : "var(--panel2)"}; cursor:pointer;"><span style="display:flex; align-items:center; gap:8px;"><span style="width:9px; height:9px; border-radius:2px; background:${l.swatch}; opacity:${on ? 1 : 0.3};"></span><span style="font-size:12px; color:${on ? "var(--text)" : "var(--text3)"};">${l.label}</span></span><span style="font-size:10px; color:${on ? ACCENT : "var(--text3)"};">${on ? "on" : "off"}</span></button>`;
      })
      .join("")}</div>`;
  }
  if (state.tool === "staffing") {
    const isSim = state.mode === "sim";
    const shiftBtns = [
      { key: "standard", label: "Standard", sub: "2 fixed blocks", active: !state.simShiftStaggered },
      { key: "staggered", label: "Staggered", sub: "peak-smoothed", active: state.simShiftStaggered },
    ]
      .map(
        (s) => `<button data-shift="${s.key}" style="padding:8px; border:1px solid ${s.active ? ACCENT : "var(--border)"}; border-radius:7px; background:${s.active ? ACCENT : "var(--panel2)"}; color:${s.active ? "#04121f" : "var(--text)"}; cursor:pointer; text-align:left;"><div style="font-size:11px; font-weight:600;">${s.label}</div><div style="font-size:9px; color:${s.active ? "#04121f" : "var(--text3)"}; margin-top:2px;">${s.sub}</div></button>`,
      )
      .join("");
    const rows = mapZones
      .filter((z) => z.staffing)
      .map((z) => {
        const gap = z.staffing.staffingGap;
        return `<div style="display:flex; align-items:center; justify-content:space-between; font-size:11px; padding:6px 8px; background:var(--panel2); border:1px solid var(--border); border-radius:6px;"><span style="color:var(--text2);">${z.label}</span><span class="mono" style="color:${gap > 0 ? BUSY : OK};">${z.staffing.activeCoverageUnits}/${z.staffing.requiredCoverageUnits} · gap ${gap}</span></div>`;
      })
      .join("");
    return `
      <div style="font-size:10px; color:var(--text3); margin-bottom:7px;">Shift pattern <span style="color:${isSim ? WARN : "var(--text3)"};">· ${isSim ? "draft" : "live · read-only"}</span></div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:7px; opacity:${isSim ? 1 : 0.4}; pointer-events:${isSim ? "auto" : "none"};">${shiftBtns}</div>
      <div style="font-size:10px; color:var(--text3); margin:13px 0 7px;">Coverage by zone</div>
      <div style="display:flex; flex-direction:column; gap:5px;">${rows}</div>
    `;
  }
  if (state.tool === "flights") {
    const flights = [...snapshot.flights].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return `<div style="display:flex; flex-direction:column; gap:6px;">${flights
      .map(
        (f) => `<div style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; background:var(--panel2); border:1px solid var(--border); border-radius:7px;"><div><div class="mono" style="font-size:12px; font-weight:600;">${f.flightId}</div><div style="font-size:10px; color:var(--text3);">${labelize(f.gateZoneId)} · ${f.status}</div></div><div style="text-align:right;"><div class="mono" style="font-size:12px; color:${ACCENT};">${hhmm(parseClockMinutes(f.scheduledAt))}</div><div style="font-size:10px; color:var(--text3);">${f.estimatedPassengers} pax</div></div></div>`,
      )
      .join("")}</div>`;
  }
  if (state.tool === "incidents") {
    if (alerts.length === 0) {
      return `<div style="padding:14px 10px; text-align:center; font-size:11px; color:var(--text3);">No active incidents. All zones within thresholds.</div>`;
    }
    return `<div style="display:flex; flex-direction:column; gap:6px;">${alerts
      .map((a) => {
        const color = a.severity === "critical" ? BUSY : WARN;
        return `<div data-alert="${a.zoneId}" style="cursor:pointer; padding:9px 10px; background:var(--panel2); border:1px solid var(--border); border-left:3px solid ${color}; border-radius:6px;"><div style="display:flex; align-items:center; justify-content:space-between;"><span style="font-size:12px; font-weight:600;">${labelize(a.zoneId)}</span><span class="mono" style="font-size:10px; color:${color};">${a.severity}</span></div><div style="font-size:10px; color:var(--text2); margin-top:3px;">${escapeHtml(a.message)}</div></div>`;
      })
      .join("")}</div>`;
  }
  return "";
}

function renderSimBanner() {
  return `
    <div style="position:absolute; top:16px; left:50%; transform:translateX(-50%); z-index:11; display:flex; align-items:center; gap:8px; background:rgba(245,185,66,.14); border:1px solid rgba(245,185,66,.5); border-radius:7px; padding:6px 13px;">
      <span style="width:7px; height:7px; border-radius:50%; background:${WARN}; animation:draftpulse 1.3s infinite;"></span>
      <span style="font-size:11px; font-weight:600; color:#b77f16;">Simulation — projected view</span>
    </div>
  `;
}

function renderInsightPanel(frame, selectedZone, isSim) {
  const body = selectedZone ? renderZoneDetail(frame, selectedZone, isSim) : renderTerminalStatus(frame, isSim);
  return `<div style="position:absolute; right:14px; top:14px; bottom:14px; width:312px; z-index:11; display:flex; flex-direction:column; pointer-events:none;">${body}</div>`;
}

function renderZoneDetail(frame, zone, isSim) {
  const staffing = zone.staffing;
  const util = zone.utilization;
  const option = frame.options.find((o) => o.affectedZones.includes(zone.zoneId));
  const forecastColor = zone.forecastDelta > 6 ? BUSY : zone.forecastDelta > 0 ? WARN : OK;
  const canAdjust = !!util;
  const crowd = [
    { k: "OCCUPANCY", v: `${zone.occupancy} / ${zone.capacity}`, color: "var(--text)" },
    { k: "QUEUE", v: `${zone.queueLength} pax`, color: zone.color },
    { k: "DENSITY", v: `${zone.density}/m²`, color: zone.density > 2.2 ? BUSY : "var(--text)" },
    { k: "SERVICE", v: `${util ? util.busyCounters : "—"}${util ? "/" + util.openCounters : ""} busy`, color: "var(--text)" },
    { k: "OPEN", v: `${util ? util.openCounters : 0} open`, color: "var(--text)" },
    { k: "UTIL", v: util ? util.utilizationRatio.toFixed(2) : "n/a", color: zone.color },
  ];
  return `
    <div style="pointer-events:auto; max-height:100%; background:var(--panel); border:1px solid var(--border2); border-radius:9px; display:flex; flex-direction:column; animation:panelin .18s ease; overflow:hidden;">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; padding:13px 14px; border-bottom:1px solid var(--border);">
        <div><div style="display:flex; align-items:center; gap:8px;">${zoneMarker(zone.status, zone.color, 8)}<span style="font-size:15px; font-weight:600;">${zone.label}</span></div><div style="font-size:10px; color:var(--text3); margin-top:3px;">${zone.type} · ${staffing ? staffing.roleRequired : "no counter bank"}</div></div>
        <button data-action="close-sel" style="border:none; background:none; color:var(--text3); cursor:pointer; font-size:15px;">✕</button>
      </div>
      <div style="overflow-y:auto; padding:13px 14px 16px;">
        <div style="display:flex; align-items:baseline; gap:12px; margin-bottom:14px;">
          <div><div class="mono" style="font-size:30px; font-weight:600; line-height:1; color:${zone.color};">${zone.loadPct}%</div><div style="font-size:10px; color:var(--text3); margin-top:3px;">current load</div></div>
          <div style="flex:1;"></div>
          <div style="text-align:right;"><div class="mono" style="font-size:19px; font-weight:600; color:${zone.color};">${zone.wait}m</div><div style="font-size:10px; color:var(--text3); margin-top:2px;">est wait</div></div>
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; padding:9px 11px; background:var(--panel2); border:1px solid var(--border); border-radius:6px; margin-bottom:8px;"><span style="font-size:11px; color:var(--text2);">Forecast · 20 min</span><span class="mono" style="font-size:13px; font-weight:600; color:${forecastColor};">${zone.forecastDelta >= 0 ? "+" : ""}${zone.forecastDelta}% load</span></div>
        <div style="display:flex; align-items:center; justify-content:space-between; padding:9px 11px; background:var(--panel2); border:1px solid var(--border); border-radius:6px; margin-bottom:8px;"><span style="font-size:11px; color:var(--text2);">Staff allocated</span><span class="mono" style="font-size:13px; font-weight:600;">${staffing ? staffing.activeCoverageUnits + " / " + staffing.requiredCoverageUnits + " req" : zone.staffHere.length + " on floor"}</span></div>
        ${ottoBlock(zone, option, isSim)}
        <div style="font-size:10px; color:var(--text3); letter-spacing:.06em; text-transform:uppercase; margin-bottom:8px;">Crowd metrics</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1px; background:var(--border); border:1px solid var(--border); border-radius:6px; overflow:hidden;">${crowd
          .map((m) => `<div style="background:var(--panel2); padding:8px 10px;"><div style="font-size:9px; color:var(--text3);">${m.k}</div><div class="mono" style="font-size:13px; font-weight:600; margin-top:2px; color:${m.color};">${m.v}</div></div>`)
          .join("")}</div>
        <div style="display:flex; gap:7px; margin-top:12px; opacity:${isSim && canAdjust ? 1 : 0.4}; pointer-events:${isSim && canAdjust ? "auto" : "none"};">
          <button data-counter-dec="${zone.zoneId}" style="flex:1; padding:9px; border:1px solid var(--border2); border-radius:6px; background:var(--hover); color:var(--text); cursor:pointer; font-size:11px;">− Close counter</button>
          <button data-counter-inc="${zone.zoneId}" style="flex:1; padding:9px; border:1px solid var(--border2); border-radius:6px; background:var(--hover); color:var(--text); cursor:pointer; font-size:11px;">+ Open counter</button>
        </div>
        <div style="font-size:10px; color:var(--text3); margin-top:10px;">Freshness ${zone.freshness.status} · confidence <span class="mono">${pct(zone.confidence.score)}</span>${staffing ? ` · rest due <span class="mono">${staffing.reliefCandidates[0]?.transferMinutes ?? 0}m relief</span>` : ""}</div>
      </div>
    </div>
  `;
}

function renderTerminalStatus(frame, isSim) {
  const { snapshot, kpiPax, kpiStaff, kpiWait, kpiAlerts, alerts, monitoring, mapZones, options } = frame;
  const statusColor = kpiAlerts > 0 ? BUSY : OK;
  const nextFlight = [...snapshot.flights].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).find((f) => true);
  const feed = buildFeed(frame);
  // Terminal-wide Otto: speak about the most pressured zone.
  const worst = [...mapZones].filter((z) => z.status !== "normal").sort((a, b) => b.loadPct - a.loadPct)[0] || null;
  const worstOption = worst ? options.find((o) => o.affectedZones.includes(worst.zoneId)) || options[0] || null : null;
  return `
    <div style="pointer-events:auto; max-height:100%; background:var(--panel); border:1px solid var(--border); border-radius:9px; display:flex; flex-direction:column; overflow:hidden;">
      <div style="padding:13px 14px; border-bottom:1px solid var(--border);">
        <div style="display:flex; align-items:center; justify-content:space-between;"><span style="font-size:12px; font-weight:600;">Terminal Status</span><span style="display:flex; align-items:center; gap:6px; font-size:10px; color:${statusColor};"><span style="width:6px; height:6px; border-radius:50%; background:${statusColor};"></span>${kpiAlerts > 0 ? "Degraded" : "Nominal"}</span></div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-top:12px;">
          <div><div class="mono" style="font-size:18px; font-weight:600;">${kpiPax.toLocaleString("en")}</div><div style="font-size:9px; color:var(--text3);">in terminal</div></div>
          <div><div class="mono" style="font-size:18px; font-weight:600; color:${kpiWait > 6 ? BUSY : kpiWait > 3 ? WARN : "var(--text)"};">${kpiWait}m</div><div style="font-size:9px; color:var(--text3);">max wait</div></div>
          <div><div class="mono" style="font-size:18px; font-weight:600;">${kpiStaff}</div><div style="font-size:9px; color:var(--text3);">on shift</div></div>
        </div>
      </div>
      <div style="overflow-y:auto; padding:13px 14px 14px;">
        <div style="display:flex; align-items:center; gap:9px; padding:10px 11px; background:var(--panel2); border:1px dashed var(--border2); border-radius:7px; margin-bottom:14px;">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.8"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          <span style="font-size:11px; color:var(--text2); line-height:1.4;">Hover any zone on the map for live queue stats, or click to inspect.</span>
        </div>
        ${ottoBlock(worst, worstOption, isSim)}
        ${nextFlight ? `<div style="font-size:10px; color:var(--text3); letter-spacing:.06em; text-transform:uppercase; margin-bottom:8px;">Next Movement</div>
        <div style="display:flex; align-items:center; justify-content:space-between; padding:9px 11px; background:var(--panel2); border:1px solid var(--border); border-radius:7px; margin-bottom:16px;"><div><div class="mono" style="font-size:13px; font-weight:600;">${nextFlight.flightId}</div><div style="font-size:10px; color:var(--text3);">${labelize(nextFlight.gateZoneId)} · ${nextFlight.estimatedPassengers} pax</div></div><div class="mono" style="font-size:15px; color:${ACCENT};">${hhmm(parseClockMinutes(nextFlight.scheduledAt))}</div></div>` : ""}
        <div style="font-size:10px; color:var(--text3); letter-spacing:.06em; text-transform:uppercase; margin-bottom:8px;">Recent Events</div>
        <div style="display:flex; flex-direction:column; gap:8px;">${feed
          .map((f) => `<div style="display:flex; gap:8px; align-items:baseline; font-size:11px; line-height:1.35;"><span class="mono" style="color:var(--text3); flex:none;">${f.time}</span><span style="width:5px; height:5px; border-radius:50%; background:${f.dot}; flex:none; margin-top:5px;"></span><span style="color:var(--text2);">${escapeHtml(f.txt)}</span></div>`)
          .join("")}</div>
      </div>
    </div>
  `;
}

function buildFeed(frame) {
  const clock = hhmm(currentClockMinutes());
  const feed = [...state.log];
  frame.alerts.forEach((a) => {
    feed.push({ time: clock, txt: `${labelize(a.zoneId)} ${a.severity === "critical" ? "abnormal crowding" : "queue build-up"}`, dot: a.severity === "critical" ? BUSY : WARN });
  });
  if (frame.options[0]) feed.push({ time: clock, txt: `Recommendation · ${describeDecision(frame.options[0].decision)}`, dot: ACCENT });
  const ambient = [
    `Queue state recomputed · ${frame.mapZones.length} zones`,
    "Counter utilization normalized",
    `Snapshot ${clock} sealed`,
    "Flow forecast +30m generated",
    "Staff rest windows validated",
    `Refresh cadence ${DEFAULT_PREDICTION_REFRESH_CADENCE_SECONDS}s`,
  ];
  for (let i = 0; feed.length < 6; i += 1) {
    feed.push({ time: hhmm(currentClockMinutes() - i), txt: ambient[(state.tick + i) % ambient.length], dot: "var(--text3)" });
  }
  return feed.slice(0, 6);
}

// Otto — the ops copilot, embedded in every Level-3 card. The side-profile
// otter avatar plus an "Ask Otto" toggle that reveals a Problem → How to solve
// it → Why explanation, the "Why" drawn straight from the decision-support
// rationale so it reads as how the AI actually derived the recommendation.
function ottoBlock(zone, option, isSim) {
  const status = zone ? zone.status : "normal";
  const alert = status === "critical";
  const tag = alert ? "ALERT" : status === "watch" ? "WATCH" : "CALM";
  const tagColor = alert ? BUSY : status === "watch" ? WARN : OK;
  return `
    <div style="border:1px solid ${alert ? "rgba(240,91,97,.4)" : "var(--border)"}; border-radius:8px; background:var(--panel2); overflow:hidden; margin:6px 0 14px;">
      <div style="display:flex; align-items:center; gap:10px; padding:9px 11px;">
        <div style="flex:none; animation:floaty 3.4s ease-in-out infinite;">${OTTO_SIDE_SVG}</div>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:6px;"><span style="font-size:12px; font-weight:600;">Otto AI</span><span style="font-size:8px; letter-spacing:.05em; color:#04121f; background:${tagColor}; padding:2px 5px; border-radius:3px; font-weight:700;">${tag}</span></div>
          <div style="font-size:9px; color:var(--text3); margin-top:2px;">otter ops copilot</div>
        </div>
        <button data-action="toggle-otto" style="flex:none; padding:6px 12px; border:none; border-radius:6px; background:${LIGHTBLUE}; color:#04121f; cursor:pointer; font-size:11px; font-weight:700;">${state.otto ? "Hide" : "Ask Otto"}</button>
      </div>
      ${state.otto ? ottoExplanation(zone, option, isSim) : ""}
    </div>`;
}

function ottoExplanation(zone, option, isSim) {
  const problem = zone
    ? (zone.status === "normal"
        ? `${zone.label} is steady at ${zone.loadPct}% load — queue ${zone.queueLength}, ~${zone.wait}m wait — within thresholds.`
        : `In ${zone.label}, ${zone.status === "critical" ? "abnormal crowding" : "a queue build-up"} is forming: ${zone.loadPct}% load, ${zone.queueLength} in queue, ~${zone.wait}m wait${zone.forecastDelta > 0 ? `, trending +${zone.forecastDelta}% over the next 20 min` : ""}.`)
    : "All zones are within thresholds right now.";
  const fix = option ? `${describeDecision(option.decision)}.` : "Hold — no action needed; keep monitoring.";
  const impact = option
    ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:7px;">
        <span class="mono" style="font-size:9px; padding:2px 6px; background:var(--hover); border-radius:3px; color:${OK};">−${option.expectedImpact.estimatedWaitMinutesReduced}m wait</span>
        <span class="mono" style="font-size:9px; padding:2px 6px; background:var(--hover); border-radius:3px; color:${OK};">−${Math.round(option.expectedImpact.queuePressureDrop * 100)}% pressure</span>
        <span class="mono" style="font-size:9px; padding:2px 6px; background:var(--hover); border-radius:3px; color:${ACCENT};">+${option.expectedImpact.passengersRelieved} relieved</span>
      </div>`
    : "";
  const why = option && option.rationale && option.rationale.length
    ? option.rationale.slice(0, 4).map((r) => `<li style="margin-bottom:3px;">${escapeHtml(r.label)}</li>`).join("")
    : `<li>${zone && zone.status === "normal" ? "Queue, wait and utilisation are all under alert thresholds." : "Otto is watching this zone; no strong recommendation yet."}</li>`;
  return `
    <div style="border-top:1px solid var(--border); padding:11px 12px; font-size:11px; line-height:1.5;">
      <div style="margin-bottom:9px;"><span style="color:${BUSY}; font-weight:700; text-transform:uppercase; font-size:9px; letter-spacing:.06em;">Problem</span><div style="color:var(--text); margin-top:2px;">${escapeHtml(problem)}</div></div>
      <div style="margin-bottom:9px;"><span style="color:${OK}; font-weight:700; text-transform:uppercase; font-size:9px; letter-spacing:.06em;">How to solve it</span><div style="color:var(--text); margin-top:2px;">${escapeHtml(fix)}</div>${impact}</div>
      <div><span style="color:${LIGHTBLUE}; font-weight:700; text-transform:uppercase; font-size:9px; letter-spacing:.06em;">Why · how Otto derived it</span><ul style="margin:4px 0 0; padding-left:16px; color:var(--text2);">${why}</ul></div>
      ${option ? `<button data-apply-option="${option.optionId}" style="width:100%; margin-top:11px; padding:8px; border:none; border-radius:6px; background:${ACCENT}; color:#ffffff; cursor:pointer; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em;">${isSim ? "Apply to draft" : "Simulate"}</button>` : ""}
    </div>`;
}

function renderSimDock(frame) {
  const count = draftCount();
  const draftMsg = count > 0 ? `Simulation draft · ${count} change${count > 1 ? "s" : ""} staged` : "No changes yet — adjust counters, staff or shift";
  return `
    <div style="position:absolute; left:calc(50% - 156px); bottom:16px; transform:translateX(-50%); z-index:13; display:flex; align-items:center; gap:12px; background:var(--panel); border:1px solid rgba(245,185,66,.5); border-radius:9px; padding:8px 10px 8px 14px; box-shadow:0 10px 34px var(--scrim);">
      <span style="font-size:12px; color:${count > 0 ? "#b77f16" : "var(--text3)"};">${draftMsg}</span>
      <button data-action="discard" style="padding:8px 14px; border:1px solid var(--border2); border-radius:6px; background:var(--hover); color:var(--text); cursor:pointer; font-size:11px;">Discard</button>
      <button data-action="confirm" style="display:flex; align-items:center; gap:7px; padding:8px 16px; border:none; border-radius:6px; background:${count > 0 ? OK : "var(--hover)"}; color:${count > 0 ? "#04160c" : "var(--text3)"}; cursor:${count > 0 ? "pointer" : "default"}; font-size:11px; font-weight:600; opacity:${count > 0 ? 1 : 0.6};">✓ Confirm decisions</button>
    </div>
  `;
}

function renderBoot() {
  return `
    <div style="position:absolute; inset:0; background:#080b0e; z-index:20; display:flex; align-items:center; justify-content:center; opacity:${state.booted ? 0 : 1}; transition:opacity 1.1s ease; pointer-events:none; overflow:hidden;">
      <div style="position:absolute; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,${ACCENT},transparent); animation:scan 2.2s linear infinite;"></div>
      <div style="text-align:center;"><div style="font-size:12px; letter-spacing:.4em; color:${ACCENT};">ACQUIRING SIGNAL</div><div class="mono" style="font-size:10px; color:#687683; margin-top:9px;">FLOOR SENSORS · GATES LIVE</div></div>
    </div>
  `;
}

function renderTimeline(frame, clockMinutes, isSim) {
  const isNow = state.minute === 0;
  const clockColor = isNow ? LIGHTBLUE : "var(--text)";
  const stateLabel = isNow
    ? `<span style="color:${LIGHTBLUE};">CURRENT TIME</span>`
    : `<span style="color:${WARN};">+${state.minute}m · FORECAST</span>`;
  const scrubLabel = isNow
    ? `<span style="color:${LIGHTBLUE};">Now</span> — drag the timeline right to simulate ahead`
    : `Forecast +${state.minute} min · a simulation of how the terminal is likely to react, projected from past patterns${isSim ? " · scenario applied" : ""}`;
  // Legend of what the map colours and markers mean.
  const legend = [
    { t: "tri", c: BUSY, label: "Critical — act now" },
    { t: "dot", c: WARN_MAP, label: "Watch — building" },
    { t: "dot", c: OK_MAP, label: "Normal" },
    { t: "dot", c: PAX_COLOR, label: "Passengers" },
    { t: "sq", c: ROLE_COLOR["immigration-officer"], label: "Staff" },
    { t: "sq", c: ROLE_COLOR["customs-officer"], label: "Other personnel" },
  ];
  const legendHtml = legend
    .map((l) => {
      const swatch = l.t === "tri"
        ? warnTriangle(l.c, 12)
        : l.t === "sq"
          ? `<span style="width:9px; height:9px; border-radius:2px; background:${l.c}; display:inline-block; flex:none;"></span>`
          : `<span style="width:9px; height:9px; border-radius:50%; background:${l.c}; display:inline-block; flex:none;"></span>`;
      return `<span style="display:flex; align-items:center; gap:5px; font-size:9px; color:var(--text2); white-space:nowrap;">${swatch}${l.label}</span>`;
    })
    .join("");
  return `
    <footer style="display:flex; align-items:center; gap:16px; padding:0 18px; background:var(--panel2); border-top:1px solid var(--border);">
      <div style="display:flex; align-items:center; gap:8px;">
        <button data-action="toggle-play" style="width:36px; height:36px; border:1px solid var(--border2); border-radius:7px; background:${state.playing ? ACCENT : "var(--hover)"}; color:${state.playing ? "#04121f" : "var(--text)"}; cursor:pointer; font-size:12px; display:flex; align-items:center; justify-content:center;">${state.playing ? "❚❚" : "▶"}</button>
        <button data-action="cycle-speed" class="mono" style="height:36px; padding:0 12px; border:1px solid var(--border2); border-radius:7px; background:var(--hover); color:var(--text2); cursor:pointer; font-size:11px;">${state.speed}×</button>
      </div>
      <div style="text-align:center; min-width:82px;">
        <div class="mono" style="font-size:20px; font-weight:600; line-height:1; color:${clockColor};">${hhmm(clockMinutes)}</div>
        <div style="font-size:8px; margin-top:3px; letter-spacing:.06em; font-weight:700;">${stateLabel}</div>
      </div>
      <div style="flex:1; position:relative; padding-top:15px;">
        <div style="position:absolute; top:0; left:0; font-size:9px; color:var(--text2);">${scrubLabel}</div>
        <input type="range" min="0" max="120" step="15" value="${state.minute}" data-scrub style="position:relative;">
        <div class="mono" style="display:flex; justify-content:space-between; font-size:9px; color:var(--text3); margin-top:6px;"><span style="color:${LIGHTBLUE};">NOW</span><span>+30</span><span>+60</span><span>+90</span><span>+120m</span></div>
      </div>
      <div style="min-width:250px;">
        <div style="font-size:9px; color:var(--text3); letter-spacing:.06em; text-transform:uppercase; margin-bottom:5px;">Legend</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px 12px;">${legendHtml}</div>
      </div>
    </footer>
  `;
}

// Human-readable label for a decision-support decision (mirrors the rationale
// the decision-support context produces).
function describeDecision(decision) {
  if (decision.type === "staff-reassignment") {
    return `Reassign ${decision.coverageUnits ?? 1} ${decision.role} unit(s) from ${labelize(decision.fromZoneId)} in ${decision.transferMinutes}m`;
  }
  if (decision.type === "counter-capacity") {
    return `Open ${decision.openDelta} ${decision.roleRequired ?? ""} counter(s) within ${decision.openLeadMinutes ?? "—"}m`.replace(/\s+/g, " ");
  }
  if (decision.type === "shift-timing") {
    return `Stagger ${decision.role} shift ${Math.abs(decision.startDeltaMinutes)}m earlier`;
  }
  if (decision.type === "passenger-movement") {
    return `Divert ${decision.passengers} pax from ${labelize(decision.fromZoneId)} to ${labelize(decision.toZoneId)}`;
  }
  return "Hold — monitor";
}

// --- event wiring -----------------------------------------------------------

function wireEvents() {
  // Layer 1 → Layer 2: hover fires only on the visible map chip/icon (scoped to
  // the map so the drawer's zone list doesn't spawn map tooltips). It keeps
  // working while a zone is selected so you can quick-view other zones; only the
  // selected zone's own preview is skipped (its stats are already in Layer 3).
  app.querySelectorAll("[data-pan] [data-zone-chip]").forEach((el) => {
    const id = el.getAttribute("data-zone-chip");
    el.addEventListener("mouseenter", () => {
      if (state.hover === id || id === state.selected) return;
      state.hover = id;
      render();
    });
    el.addEventListener("mouseleave", () => {
      if (state.hover === id) {
        state.hover = null;
        render();
      }
    });
  });
  // Layer 1 → Layer 3: clicking any chip (map or drawer list) inspects the zone.
  app.querySelectorAll("[data-zone-chip]").forEach((el) => {
    el.addEventListener("click", () => selectZone(el.getAttribute("data-zone-chip")));
  });
  app.querySelectorAll("[data-alert]").forEach((el) => {
    el.addEventListener("click", () => selectZone(el.getAttribute("data-alert")));
  });
  app.querySelectorAll("[data-view]").forEach((el) => {
    el.addEventListener("click", () => {
      state.view = el.getAttribute("data-view");
      state.selected = null;
      state.hover = null;
      render();
    });
  });
  app.querySelectorAll("[data-mode]").forEach((el) => {
    el.addEventListener("click", () => {
      if (el.getAttribute("data-mode") === "sim") enterSim();
      else goLive();
      render();
    });
  });
  app.querySelectorAll("[data-tool]").forEach((el) => {
    el.addEventListener("click", () => {
      const key = el.getAttribute("data-tool");
      state.tool = state.tool === key ? null : key;
      render();
    });
  });
  app.querySelectorAll("[data-layer]").forEach((el) => {
    el.addEventListener("click", () => {
      const key = el.getAttribute("data-layer");
      state.layers[key] = !state.layers[key];
      render();
    });
  });
  app.querySelectorAll("[data-shift]").forEach((el) => {
    el.addEventListener("click", () => {
      if (state.mode !== "sim") enterSim();
      state.simShiftStaggered = el.getAttribute("data-shift") === "staggered";
      render();
    });
  });
  app.querySelectorAll("[data-counter-inc]").forEach((el) => {
    el.addEventListener("click", () => {
      stageCounter(el.getAttribute("data-counter-inc"), 1);
      render();
    });
  });
  app.querySelectorAll("[data-counter-dec]").forEach((el) => {
    el.addEventListener("click", () => {
      stageCounter(el.getAttribute("data-counter-dec"), -1);
      render();
    });
  });
  app.querySelectorAll("[data-apply-option]").forEach((el) => {
    el.addEventListener("click", () => {
      const option = lastFrame.options.find((o) => o.optionId === el.getAttribute("data-apply-option"));
      if (option) {
        applyOption(option);
        render();
      }
    });
  });
  const scrub = app.querySelector("[data-scrub]");
  if (scrub) {
    scrub.addEventListener("input", (event) => {
      state.minute = Number(event.target.value);
      state.playing = false;
      render();
    });
  }

  const actions = {
    "toggle-theme": () => (state.theme = state.theme === "dark" ? "light" : "dark"),
    "toggle-otto": () => (state.otto = !state.otto),
    "close-drawer": () => (state.tool = null),
    "close-sel": () => {
      state.selected = null;
      state.otto = false;
    },
    "zoom-in": () => (state.zoom = clamp(state.zoom * 1.3, 1, 3.2)),
    "zoom-out": () => zoomOut(),
    "zoom-reset": () => resetView(),
    "toggle-play": () => (state.playing = !state.playing),
    "cycle-speed": () => (state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1),
    confirm: () => {
      if (draftCount() > 0) confirmDecisions();
    },
    discard: () => goLive(),
  };
  app.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", () => {
      const fn = actions[el.getAttribute("data-action")];
      if (fn) {
        fn();
        render();
      }
    });
  });

  const pan = app.querySelector("[data-pan]");
  if (pan) {
    pan.addEventListener("mousedown", (event) => {
      if (state.zoom <= 1) return;
      dragState.active = true;
      dragState.x = event.clientX;
      dragState.y = event.clientY;
      dragState.px = state.panX;
      dragState.py = state.panY;
    });
    pan.addEventListener("wheel", (event) => {
      event.preventDefault();
      const dir = event.deltaY < 0 ? 1.12 : 0.892;
      const z = clamp(state.zoom * dir, 1, 3.2);
      if (z <= 1.001) resetView();
      else state.zoom = z;
      render();
    }, { passive: false });
  }
}

function selectZone(zoneId) {
  state.selected = zoneId;
  state.tool = null;
  state.hover = null; // clear the just-hovered tip; other zones still preview on hover
  render();
}

function zoomOut() {
  const z = clamp(state.zoom / 1.3, 1, 3.2);
  if (z <= 1.001) resetView();
  else state.zoom = z;
}

function resetView() {
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
}

// --- lifecycle --------------------------------------------------------------

function init() {
  render();

  document.addEventListener("mousemove", (event) => {
    if (!dragState.active) return;
    const dx = event.clientX - dragState.x;
    const dy = event.clientY - dragState.y;
    const maxX = (state.zoom - 1) * 430;
    const maxY = (state.zoom - 1) * 270;
    state.panX = clamp(dragState.px + dx, -maxX, maxX);
    state.panY = clamp(dragState.py + dy, -maxY, maxY);
    render();
  });
  document.addEventListener("mouseup", () => {
    dragState.active = false;
  });

  globalThis.setTimeout(() => {
    state.booted = true;
    render();
  }, 1600);

  // Only the play head drives re-renders. Paused (the default) is fully idle —
  // no per-second innerHTML rebuild — while CSS-driven motion (pulse rings,
  // flow dashes, the floating Otto avatar) keeps running on its own.
  globalThis.setInterval(() => {
    if (!state.playing) {
      return;
    }
    state.tick += 1;
    state.minute += 15 * state.speed;
    if (state.minute > 120) {
      state.minute = 0;
      // Each completed horizon loop pulls the next live snapshot, reproducing
      // the seeded normal -> peak -> stale monitoring progression.
      if (state.mode === "live") {
        state.snapshotIndex = (state.snapshotIndex + 1) % snapshotSeries.length;
      }
    }
    render();
  }, 1000);
}

if (app) {
  init();
}

// Test seam: these are pure (no DOM) and let the seed / render checks exercise
// the full data path and template output under node --test without a browser.
export { state, computeFrame, renderToString };
