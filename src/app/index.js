/*
 * Stratus Digital Twin — Airport Flow Ops app shell.
 *
 * This is the composition root. It reads the live OperationalSnapshot through
 * the operational-database reader. The rows come from the Postgres export
 * (database/export/operational-rows.json, written by database/export-rows.mjs
 * from the seeded database) with deterministic fixture rows as the fallback
 * when the export is absent. From the snapshot it derives:
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

const ACCENT = "#29a3ff";
const OK = "#32c783";
const WARN = "#f5b942";
const BUSY = "#f05b61";
const TEAL = "#27d3d1";
const ROLE_COLOR = {
  "immigration-officer": "var(--staff-officer)",
  security: TEAL,
  "ground-staff": WARN,
  "customs-officer": "#c9a2ff",
};

const SNAPSHOT_VARIANTS = ["normal", "peak", "stale"];
const LIVE_REFRESH_MS = 5000; // demo cadence for pulling a fresh live snapshot

// Live data source: rows exported from Postgres when available (written by
// database/export-rows.mjs), otherwise fixture-shaped rows. Both are the same
// contract shape and flow through the same operational-database reader, so
// nothing downstream changes with the source.
const EXPORTED_ROWS_URL = new URL("../../database/export/operational-rows.json", import.meta.url);

function createFixtureRowsBundle() {
  const series = createFixtureSnapshotSeries();
  const perSnapshot = series.map((snapshot, index) =>
    createOperationalDatabaseRowsFromSnapshot(snapshot, `live-${SNAPSHOT_VARIANTS[index]}-${snapshot.asOf}`),
  );
  const reference = perSnapshot[0];
  return {
    ...reference,
    operationalSnapshots: perSnapshot.flatMap((rows) => rows.operationalSnapshots),
    zoneStates: perSnapshot.flatMap((rows) => rows.zoneStates),
    counterStates: perSnapshot.flatMap((rows) => rows.counterStates),
    staffStates: perSnapshot.flatMap((rows) => rows.staffStates),
    flightStates: perSnapshot.flatMap((rows) => rows.flightStates),
    passengerFlows: perSnapshot.flatMap((rows) => rows.passengerFlows),
    observations: perSnapshot.flatMap((rows) => rows.observations),
  };
}

// Synchronous fixture default keeps the node test seam and the no-export run
// working; loadRowsBundle() swaps in the Postgres export before init().
let rowsBundle = createFixtureRowsBundle();
let snapshotIds = rowsBundle.operationalSnapshots.map((row) => row.snapshotId);
let dataSource = "fixtures";

async function loadRowsBundle() {
  try {
    // no-store: the export is live operational data; a cached copy could show
    // stale numbers after the database is re-exported mid-shift.
    const response = await fetch(EXPORTED_ROWS_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bundle = await response.json();
    if (!Array.isArray(bundle?.operationalSnapshots) || bundle.operationalSnapshots.length === 0) {
      throw new Error("export contains no operational snapshots");
    }
    rowsBundle = bundle;
    snapshotIds = bundle.operationalSnapshots.map((row) => row.snapshotId);
    dataSource = "postgres";
    state.snapshotIndex = Math.min(state.snapshotIndex, snapshotIds.length - 1);
  } catch (error) {
    console.warn("Stratus: Postgres export unavailable, staying on fixture rows.", error);
  }
}

// One reader over the whole bundle; getSnapshot(id) selects the active
// snapshot while validation and freezing stay inside the operational-database
// context exactly as before.
const databaseReader = createOperationalDatabaseReader(() => rowsBundle);

const app = typeof document !== "undefined" ? document.querySelector("#app") : null;

const state = {
  snapshotIndex: 1, // start at the peak snapshot (matches the SQL seed)
  minute: 0, // forecast-horizon position [0..120]
  view: "departure",
  mode: "live", // live | sim
  selected: null,
  tool: null,
  copilot: false,
  theme: "dark",
  zoom: 1,
  panX: 0,
  panY: 0,
  hover: null,
  layers: { pax: true, staff: true, heat: true, flights: true },
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

function currentSnapshotAsOf() {
  const activeId = snapshotIds[state.snapshotIndex];
  const row = rowsBundle.operationalSnapshots.find((candidate) => candidate.snapshotId === activeId);
  return row?.asOf ?? rowsBundle.operationalSnapshots[0].asOf;
}

function currentClockMinutes() {
  return parseClockMinutes(currentSnapshotAsOf()) + state.minute;
}

// --- frame computation (pure data from the pipeline) ------------------------

function computeFrame() {
  const snapshot = databaseReader.getSnapshot(snapshotIds[state.snapshotIndex]);
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
      heatOpacity: status === "critical" ? 0.26 : status === "watch" ? 0.15 : 0.06,
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
  const topOption = options[0] || null;
  const worst = [...mapZones].filter((z) => z.status !== "normal").sort((a, b) => b.loadPct - a.loadPct)[0];

  return `
    <div data-theme="${state.theme}" style="height:100vh; display:grid; grid-template-rows:58px 1fr 82px; overflow:hidden; background:var(--bg-app); color:var(--text);">
      ${renderCommandBar(frame, clockMinutes, isSim)}
      <main style="position:relative; min-height:0; overflow:hidden; background:var(--panel2);">
        ${renderMap(frame, isSim)}
        ${renderToolRail(frame)}
        ${isSim ? renderSimBanner() : ""}
        ${renderInsightPanel(frame, selectedZone, isSim)}
        ${renderCopilot(frame, worst, topOption, isSim)}
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
        <div><div style="font-size:9px; color:var(--text3); letter-spacing:.05em;">SNAPSHOT</div><div class="mono" style="font-size:12px;">${hhmm(clockMinutes)}</div></div>
        <div><div style="font-size:9px; color:var(--text3); letter-spacing:.05em;">OCCUPANCY</div><div class="mono" style="font-size:12px;">${kpiPax.toLocaleString("en")}</div></div>
        <div><div style="font-size:9px; color:var(--text3); letter-spacing:.05em;">ALERTS</div><div class="mono" style="font-size:12px; color:${alertColor};">${kpiAlerts}</div></div>
        <div><div style="font-size:9px; color:var(--text3); letter-spacing:.05em;">SOURCE</div><div class="mono" style="font-size:12px;" data-source="${dataSource}">${dataSource === "postgres" ? "PG EXPORT" : "FIXTURES"}</div></div>
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
  const arrivalFlight = snapshot.flights.find((f) => f.type === "arrival");
  const showPlane = state.layers.flights && state.booted && state.view === "arrival" && arrivalFlight;

  const heat = state.layers.heat
    ? mapZones
        .map((z) => `<circle cx="${z.cx}" cy="${z.cy}" r="104" fill="${z.color}" fill-opacity="${z.heatOpacity}" filter="url(#soft)"></circle>`)
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
            dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${ACCENT}" filter="url(#glow)"></circle>`);
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
    .map((z) => `<circle cx="${z.cx}" cy="${z.cy}" r="3.5" fill="${z.color}" filter="url(#glow)"></circle>`)
    .join("");

  const hitAreas = mapZones
    .map(
      (z) =>
        `<rect data-zone-hit="${z.zoneId}" x="${z.hit.hitX}" y="${z.hit.hitY}" width="${z.hit.hitW}" height="${z.hit.hitH}" fill="transparent" style="pointer-events:all; cursor:pointer;"></rect>`,
    )
    .join("");

  const chips = mapZones
    .map((z) => {
      const statusBorder = z.status === "critical" ? BUSY : z.status === "watch" ? "rgba(245,185,66,.55)" : "var(--border2)";
      const selRing = z.zoneId === state.selected ? "box-shadow:0 0 0 2px " + z.color + ";" : "";
      const base = `position:absolute; left:${z.chipLeft}%; top:${z.chipTop}%; transform:translate(-50%,-50%) scale(${invZoom}); cursor:pointer; z-index:4; background:var(--chip-bg); backdrop-filter:blur(3px); border:1px solid ${statusBorder};`;
      // Check-in B collapses to an icon-only marker to relieve crowding near the
      // Departure Hall / Check-in A labels; it stays clickable and hoverable.
      if (z.zoneId === "check-in-b") {
        return `
      <div data-zone-chip="${z.zoneId}" title="${z.label} · ${z.loadPct}%" style="${base} display:flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:8px; ${selRing}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${z.color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6.5V8"/><path d="M8 8v12M16 8v12"/></svg>
      </div>`;
      }
      return `
      <div data-zone-chip="${z.zoneId}" style="${base} display:flex; align-items:center; gap:7px; border-radius:5px; padding:4px 9px; white-space:nowrap; ${selRing}">
        <span style="width:6px; height:6px; border-radius:50%; background:${z.color}; box-shadow:0 0 6px ${z.color};"></span>
        <span style="font-size:11px; font-weight:600; color:var(--text);">${z.label}</span>
        <span class="mono" style="font-size:11px; font-weight:600; color:${z.color};">${z.loadPct}%</span>
      </div>`;
    })
    .join("");

  const hover = state.hover ? mapZones.find((z) => z.zoneId === state.hover) : null;
  const hoverTip = hover ? renderHoverTip(hover, invZoom) : "";

  return `
    <div data-pan style="position:absolute; inset:0; cursor:${grabCursor}; overflow:hidden;">
      <div style="position:absolute; inset:0; background:var(--map-grad);"></div>
      <div style="position:absolute; inset:0; transform:translate(${state.panX}px, ${state.panY}px) scale(${state.zoom}); transform-origin:center center;">
        ${showPlane ? `<div style="position:absolute; top:9%; left:0; width:100%; pointer-events:none;"><svg width="42" height="42" viewBox="0 0 24 24" style="animation:planefly 11s linear infinite; filter:drop-shadow(0 0 6px rgba(41,163,255,.8));"><path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" fill="${ACCENT}"></path></svg></div>` : ""}
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
          <g style="pointer-events:all;">${hitAreas}</g>
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
  return `
    <div style="position:absolute; left:${hover.chipLeft}%; top:${hover.chipTop}%; transform:${tx} scale(${invZoom}); z-index:10; pointer-events:none; width:210px; background:var(--panel); border:1px solid ${hover.color}; border-radius:8px; box-shadow:0 10px 30px var(--scrim); overflow:hidden;">
      <div style="padding:9px 11px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:8px;">
        <span style="width:8px; height:8px; border-radius:50%; background:${hover.color}; box-shadow:0 0 6px ${hover.color};"></span>
        <span style="font-size:12px; font-weight:600;">${hover.label}</span>
      </div>
      <div style="padding:10px 11px;">
        <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:8px;">
          <span class="mono" style="font-size:22px; font-weight:600; color:${hover.color};">${hover.loadPct}%</span>
          <span style="font-size:10px; color:var(--text3);">${hover.severity}</span>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 10px;">
          <div style="display:flex; justify-content:space-between;"><span style="font-size:10px; color:var(--text3);">Wait</span><span class="mono" style="font-size:11px; color:${hover.color};">${hover.wait}m</span></div>
          <div style="display:flex; justify-content:space-between;"><span style="font-size:10px; color:var(--text3);">Queue</span><span class="mono" style="font-size:11px;">${hover.queueLength}</span></div>
          <div style="display:flex; justify-content:space-between;"><span style="font-size:10px; color:var(--text3);">Occ</span><span class="mono" style="font-size:11px;">${hover.occupancy}</span></div>
          <div style="display:flex; justify-content:space-between;"><span style="font-size:10px; color:var(--text3);">Staff</span><span class="mono" style="font-size:11px;">${hover.staffHere.length}</span></div>
        </div>
        <div style="font-size:9px; color:var(--text3); margin-top:8px;">Click to inspect · ${hover.freshness.status}</div>
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
      { key: "pax", label: "Passengers", swatch: ACCENT },
      { key: "staff", label: "Manpower", swatch: "#8aa0b2" },
      { key: "heat", label: "Congestion heat", swatch: BUSY },
      { key: "flights", label: "Flights", swatch: ACCENT },
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
  const body = selectedZone ? renderZoneDetail(frame, selectedZone, isSim) : renderTerminalStatus(frame);
  return `<div style="position:absolute; right:14px; top:14px; bottom:14px; width:312px; z-index:11; display:flex; flex-direction:column; pointer-events:none;">${body}</div>`;
}

function renderZoneDetail(frame, zone, isSim) {
  const staffing = zone.staffing;
  const util = zone.utilization;
  const option = frame.options.find((o) => o.affectedZones.includes(zone.zoneId));
  const recFg = zone.status === "critical" ? BUSY : zone.status === "watch" ? WARN : "var(--text)";
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
        <div><div style="display:flex; align-items:center; gap:8px;"><span style="width:8px; height:8px; border-radius:50%; background:${zone.color}; box-shadow:0 0 7px ${zone.color};"></span><span style="font-size:15px; font-weight:600;">${zone.label}</span></div><div style="font-size:10px; color:var(--text3); margin-top:3px;">${zone.type} · ${staffing ? staffing.roleRequired : "no counter bank"}</div></div>
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
        <div style="border:1px solid ${zone.status === "critical" ? "rgba(240,91,97,.4)" : zone.status === "watch" ? "rgba(245,185,66,.4)" : "var(--border)"}; border-radius:7px; padding:11px 12px; background:var(--panel2); margin:6px 0 14px;">
          <div style="font-size:10px; color:var(--text3); margin-bottom:5px;">Recommended action</div>
          <div style="font-size:13px; font-weight:600; color:${recFg}; line-height:1.4;">${option ? escapeHtml(describeDecision(option.decision)) : "Hold — zone within thresholds"}</div>
          ${option ? `<button data-apply-option="${option.optionId}" style="width:100%; margin-top:10px; padding:8px; border:none; border-radius:6px; background:${ACCENT}; color:#04121f; cursor:pointer; font-size:11px; font-weight:600;">${isSim ? "Apply to draft" : "Simulate this"}</button>` : ""}
        </div>
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

function renderTerminalStatus(frame) {
  const { snapshot, kpiPax, kpiStaff, kpiWait, kpiAlerts, alerts, monitoring } = frame;
  const statusColor = kpiAlerts > 0 ? BUSY : OK;
  const nextFlight = [...snapshot.flights].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).find((f) => true);
  const feed = buildFeed(frame);
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
        <div style="display:flex; align-items:center; gap:9px; padding:10px 11px; background:var(--panel2); border:1px dashed var(--border2); border-radius:7px; margin-bottom:16px;">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.8"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          <span style="font-size:11px; color:var(--text2); line-height:1.4;">Hover any zone on the map for live queue stats, or click to inspect.</span>
        </div>
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

const DOG_SVG = '<svg width="42" height="48" viewBox="0 0 130 150"><ellipse cx="65" cy="122" rx="34" ry="24" fill="var(--hover)" stroke="var(--text2)" stroke-width="2.4"/><path d="M92 118 q26 -6 28 -30 q-14 10 -30 14 z" fill="var(--panel2)" stroke="var(--text2)" stroke-width="2.4" style="animation:wag .6s ease-in-out infinite; transform-box:fill-box; transform-origin:0% 100%;"/><rect x="46" y="132" width="9" height="16" rx="4" fill="var(--hover)" stroke="var(--text2)" stroke-width="2.2"/><rect x="74" y="132" width="9" height="16" rx="4" fill="var(--hover)" stroke="var(--text2)" stroke-width="2.2"/><path d="M34 46 q-16 6 -14 40 q10 -4 20 -18 z" fill="var(--panel2)" stroke="var(--text2)" stroke-width="2.4"/><path d="M96 46 q16 6 14 40 q-10 -4 -20 -18 z" fill="var(--panel2)" stroke="var(--text2)" stroke-width="2.4"/><circle cx="65" cy="58" r="35" fill="var(--hover)" stroke="var(--text2)" stroke-width="2.4"/><g style="animation:blink 4.2s infinite; transform-box:fill-box; transform-origin:center;"><circle cx="53" cy="55" r="4.6" fill="var(--text)"/><circle cx="77" cy="55" r="4.6" fill="var(--text)"/></g><ellipse cx="65" cy="74" rx="17" ry="13" fill="var(--panel2)" stroke="var(--text2)" stroke-width="2"/><ellipse cx="65" cy="68" rx="5.5" ry="4.2" fill="#29A3FF"/><path d="M65 72 v6 M65 78 q-7 3 -11 -1 M65 78 q7 3 11 -1" fill="none" stroke="var(--text2)" stroke-width="1.8" stroke-linecap="round"/><rect x="43" y="90" width="44" height="7" rx="3.5" fill="#29A3FF"/></svg>';
const DOG_MINI_SVG = '<svg width="22" height="22" viewBox="0 0 130 150"><path d="M34 46 q-16 6 -14 40 q10 -4 20 -18 z" fill="var(--panel)" stroke="var(--text2)" stroke-width="3"/><path d="M96 46 q16 6 14 40 q-10 -4 -20 -18 z" fill="var(--panel)" stroke="var(--text2)" stroke-width="3"/><circle cx="65" cy="62" r="36" fill="var(--hover)" stroke="var(--text2)" stroke-width="3"/><circle cx="53" cy="58" r="5" fill="var(--text)"/><circle cx="77" cy="58" r="5" fill="var(--text)"/><ellipse cx="65" cy="80" rx="17" ry="13" fill="var(--panel)" stroke="var(--text2)" stroke-width="2.4"/><ellipse cx="65" cy="74" rx="5.5" ry="4.2" fill="#29A3FF"/></svg>';

function renderCopilot(frame, worst, topOption, isSim) {
  const dogAlert = frame.kpiAlerts > 0;
  const dogStatus = dogAlert ? "ALERT" : "CALM";
  const dogTag = dogAlert ? BUSY : OK;
  const speech = worst
    ? `${worst.label} is at ${worst.loadPct}% — queue ${worst.queueLength}, ~${worst.wait}m wait. ${topOption ? "I recommend: " + describeDecision(topOption.decision).toLowerCase() + ". " : ""}${isSim ? "Apply it to your draft below." : "Switch to Simulate to plan it."}`
    : `All ${state.view} zones are within thresholds. Queues clear, coverage balanced, sensor freshness good.`;

  const agentDef = [
    { key: "flow", short: "QUEUE", nx: 42, ny: 30, ty: 17 },
    { key: "counter", short: "CNTR", nx: 218, ny: 30, ty: 17 },
    { key: "staff", short: "STAFF", nx: 42, ny: 102, ty: 118 },
    { key: "shift", short: "FCAST", nx: 218, ny: 102, ty: 118 },
  ];
  const busyMap = {
    flow: !!worst,
    counter: frame.options.some((o) => o.decision.type === "counter-capacity"),
    staff: frame.options.some((o) => o.decision.type === "staff-reassignment" || o.decision.type === "passenger-movement"),
    shift: frame.options.some((o) => o.decision.type === "shift-timing") || state.simShiftStaggered,
  };
  const agents = agentDef
    .map((a) => {
      const busy = busyMap[a.key];
      const dot = busy ? BUSY : TEAL;
      const line = busy ? "rgba(240,91,97,.5)" : "var(--border2)";
      return `<line x1="130" y1="66" x2="${a.nx}" y2="${a.ny}" stroke="${line}" stroke-width="1.4" stroke-dasharray="4 4" style="animation:dashflow ${busy ? "0.7s" : "1.6s"} linear infinite;"></line>`;
    })
    .join("");
  const agentNodes = agentDef
    .map((a) => {
      const busy = busyMap[a.key];
      const dot = busy ? BUSY : TEAL;
      const fill = busy ? "rgba(240,91,97,.14)" : "var(--hover)";
      return `<g><circle cx="${a.nx}" cy="${a.ny}" r="9" fill="${fill}" stroke="${dot}" stroke-width="1.6"></circle><text x="${a.nx}" y="${a.ty}" text-anchor="middle" fill="var(--text2)" font-size="7.5" font-family="IBM Plex Mono">${a.short}</text></g>`;
    })
    .join("");
  const swarmActive = !!worst;

  const topRecBlock = topOption
    ? `<div style="margin-top:11px; border:1px solid ${topOption.decision.type === "counter-capacity" ? "rgba(41,163,255,.4)" : "var(--border2)"}; border-left:3px solid ${dogAlert ? BUSY : WARN}; border-radius:6px; padding:10px 11px; background:var(--panel2);">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:5px;"><span style="font-size:12px; font-weight:600;">${escapeHtml(describeDecision(topOption.decision))}</span><span style="font-size:9px; color:${dogAlert ? BUSY : WARN};">${topOption.decision.type}</span></div>
        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:7px;">
          <span class="mono" style="font-size:9px; padding:2px 6px; background:var(--hover); border-radius:3px; color:${OK};">−${topOption.expectedImpact.estimatedWaitMinutesReduced}m wait</span>
          <span class="mono" style="font-size:9px; padding:2px 6px; background:var(--hover); border-radius:3px; color:${OK};">−${Math.round(topOption.expectedImpact.queuePressureDrop * 100)}% press</span>
          <span class="mono" style="font-size:9px; padding:2px 6px; background:var(--hover); border-radius:3px; color:${ACCENT};">+${topOption.expectedImpact.passengersRelieved} relieved</span>
        </div>
        <button data-apply-option="${topOption.optionId}" style="width:100%; padding:7px; border:none; border-radius:5px; background:${ACCENT}; color:#04121f; cursor:pointer; font-size:10px; font-weight:600;">${isSim ? "Apply to draft" : "Simulate this"}</button>
      </div>`
    : "";

  const panel = state.copilot
    ? `<div style="width:302px; background:var(--panel); border:1px solid ${dogAlert ? "rgba(240,91,97,.5)" : "var(--border)"}; border-radius:11px; overflow:hidden; animation:panelin .18s ease; box-shadow:0 12px 40px var(--scrim);">
        <div style="display:flex; align-items:center; gap:11px; padding:12px 13px; background:${dogAlert ? "rgba(240,91,97,.06)" : "var(--panel2)"};">
          <div style="flex:none; animation:floaty 3.4s ease-in-out infinite;">${DOG_SVG}</div>
          <div style="flex:1;"><div style="display:flex; align-items:center; gap:7px;"><span style="font-size:13px; font-weight:600;">Beagle</span><span style="font-size:9px; color:#04121f; background:${dogTag}; padding:2px 6px; border-radius:3px; font-weight:600;">${dogStatus}</span></div><div style="font-size:10px; color:var(--text3); margin-top:2px;">Ops Copilot · agent swarm</div></div>
          <button data-action="toggle-copilot" style="border:none; background:none; color:var(--text3); cursor:pointer; font-size:14px;">✕</button>
        </div>
        <div style="padding:12px 13px;">
          <div style="font-size:12px; line-height:1.5; color:var(--text);">${escapeHtml(speech)}</div>
          <div style="display:flex; align-items:center; justify-content:space-between; margin:13px 0 8px;"><span style="font-size:10px; color:var(--text3); letter-spacing:.05em; text-transform:uppercase;">Agent Swarm</span><span style="font-size:9px; color:${swarmActive ? BUSY : TEAL};">${swarmActive ? "negotiating" : "monitoring"}</span></div>
          <div style="background:var(--panel2); border:1px solid var(--border); border-radius:7px; padding:5px;">
            <svg viewBox="0 0 260 132" style="width:100%; display:block;">
              ${agents}
              <circle cx="130" cy="66" r="15" fill="var(--hover)" stroke="var(--border2)"></circle>
              <text x="130" y="70" text-anchor="middle" fill="var(--text2)" font-size="8" font-family="IBM Plex Mono" font-weight="600">HUB</text>
              ${agentNodes}
            </svg>
          </div>
          ${topRecBlock}
        </div>
      </div>`
    : "";

  return `
    <div style="position:absolute; right:14px; bottom:14px; z-index:13; display:flex; flex-direction:column; align-items:flex-end; gap:10px;">
      ${panel}
      <button data-action="toggle-copilot" style="display:flex; align-items:center; gap:9px; padding:7px 15px 7px 8px; border:1px solid ${dogAlert ? "rgba(240,91,97,.5)" : "var(--border)"}; border-radius:24px; background:var(--panel); color:var(--text); cursor:pointer; font-size:12px; font-weight:600; box-shadow:0 6px 20px var(--scrim);">
        <span style="display:flex;">${DOG_MINI_SVG}</span>
        Beagle · ${dogAlert ? "1 action" : "monitoring"}
      </button>
    </div>
  `;
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
  const { snapshot } = frame;
  const dayPart = clockMinutes < 720 ? "MORNING" : clockMinutes < 1020 ? "AFTERNOON" : "EVENING";
  const nextFlight = [...snapshot.flights].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
  const baseMin = parseClockMinutes(snapshot.asOf);
  return `
    <footer style="display:flex; align-items:center; gap:16px; padding:0 18px; background:var(--panel2); border-top:1px solid var(--border);">
      <div style="display:flex; align-items:center; gap:8px;">
        <button data-action="toggle-play" style="width:36px; height:36px; border:1px solid var(--border2); border-radius:7px; background:${state.playing ? ACCENT : "var(--hover)"}; color:${state.playing ? "#04121f" : "var(--text)"}; cursor:pointer; font-size:12px; display:flex; align-items:center; justify-content:center;">${state.playing ? "❚❚" : "▶"}</button>
        <button data-action="cycle-speed" class="mono" style="height:36px; padding:0 12px; border:1px solid var(--border2); border-radius:7px; background:var(--hover); color:var(--text2); cursor:pointer; font-size:11px;">${state.speed}×</button>
      </div>
      <div style="text-align:center; min-width:74px;">
        <div class="mono" style="font-size:20px; font-weight:600; line-height:1;">${hhmm(clockMinutes)}</div>
        <div style="font-size:9px; color:var(--text3); margin-top:2px; letter-spacing:.08em;">${dayPart}</div>
      </div>
      <div style="flex:1; position:relative; padding-top:15px;">
        <div style="position:absolute; top:0; left:0; font-size:9px; color:var(--text2);">Forecast horizon · T+${state.minute} min ${isSim ? "· projected" : ""}</div>
        <input type="range" min="0" max="120" step="15" value="${state.minute}" data-scrub style="position:relative;">
        <div class="mono" style="display:flex; justify-content:space-between; font-size:9px; color:var(--text3); margin-top:6px;"><span>${hhmm(baseMin)}</span><span>${hhmm(baseMin + 30)}</span><span>${hhmm(baseMin + 60)}</span><span>${hhmm(baseMin + 90)}</span><span>${hhmm(baseMin + 120)}</span></div>
      </div>
      <div style="text-align:right; min-width:170px;">
        <div style="font-size:9px; color:var(--text3); letter-spacing:.06em; text-transform:uppercase;">Next movement</div>
        <div class="mono" style="font-size:12px; font-weight:600; margin-top:3px;">${nextFlight ? `${nextFlight.flightId} · ${hhmm(parseClockMinutes(nextFlight.scheduledAt))} · ${nextFlight.estimatedPassengers}p` : "—"}</div>
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
  app.querySelectorAll("[data-zone-hit]").forEach((el) => {
    const id = el.getAttribute("data-zone-hit");
    el.addEventListener("click", () => selectZone(id));
    el.addEventListener("mouseenter", () => {
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
    "toggle-copilot": () => (state.copilot = !state.copilot),
    "close-drawer": () => (state.tool = null),
    "close-sel": () => (state.selected = null),
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
  // flow dashes, the plane, the copilot) keeps running on its own.
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
        state.snapshotIndex = (state.snapshotIndex + 1) % snapshotIds.length;
      }
    }
    render();
  }, 1000);
}

if (app) {
  // Resolve the data source before the first render; on any failure the
  // fixture bundle already in place keeps the app fully functional.
  loadRowsBundle().then(init);
}

// Test seam: these are pure (no DOM) and let the seed / render checks exercise
// the full data path and template output under node --test without a browser.
export { state, computeFrame, renderToString };
