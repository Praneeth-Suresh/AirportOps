import { createOperationalDatabaseReader, createOperationalDatabaseRowsFromSnapshot } from "../operational-database/index.js";
import { DEFAULT_PREDICTION_REFRESH_CADENCE_SECONDS, PredictionRefreshService } from "../prediction/index.js";
import { MonitoringViewModel } from "../monitoring/index.js";
import { defaultScenarioDecisions, simulationService } from "../simulation/index.js";
import { decisionSupportService } from "../decision-support/index.js";
import { createFixtureSnapshotSeries } from "../fixtures/deterministicAdapters.js";

const app = document.querySelector("#app");
const snapshotSeries = createFixtureSnapshotSeries();
let snapshotIndex = 1;
let selectedZoneId = "check-in-a";
let selectedAlertId;
let selectedMinute = 60;
const databaseReader = createOperationalDatabaseReader(() => (
  createOperationalDatabaseRowsFromSnapshot(snapshotSeries[snapshotIndex], `fixture-snapshot-${snapshotIndex}`)
));
const predictionRefreshService = new PredictionRefreshService({ snapshotReader: databaseReader });

function render() {
  const forecast = predictionRefreshService.refreshNow();
  const snapshot = predictionRefreshService.getLatestSnapshot();
  const monitoring = MonitoringViewModel.from(snapshot, forecast);
  const decisions = defaultScenarioDecisions();
  const projection = simulationService.project(snapshot, forecast, decisions);
  const options = decisionSupportService.options(snapshot, forecast, projection, monitoring.analytics.operationalAlerts);
  const selectedPoint = projection.points.find((point) => point.minute === selectedMinute) ?? projection.points[0];
  const selectedZone = monitoring.zones.find((zone) => zone.zoneId === selectedZoneId);
  const projectedZone = selectedPoint.zones.find((zone) => zone.zoneId === selectedZoneId);
  const selectedAlert = monitoring.analytics.operationalAlerts.find((alert) => alert.alertId === selectedAlertId)
    ?? monitoring.analytics.operationalAlerts[0];
  const topOption = options.find((option) => option.relatedAlertId === selectedAlert?.alertId) ?? options[0];
  selectedAlertId = selectedAlert?.alertId;

  app.innerHTML = `
    <section class="status-rail" aria-label="Airport operating status">
      <div>
        <p class="eyebrow">Operations surface</p>
        <h1>Check-in flow monitor</h1>
      </div>
      <div class="status-cluster">
        <span class="status-pill live">Updated ${formatTime(snapshot.asOf)}</span>
        <button class="icon-button" type="button" data-refresh aria-label="Advance fixture snapshot">Refresh</button>
        <span class="status-pill forecast">Forecast ${forecast.horizon.minutes} min</span>
        <span class="status-pill scenario">${monitoring.analytics.refreshCadenceSeconds}s cadence</span>
      </div>
    </section>

    <section class="workspace">
      <section class="alert-panel" aria-label="Real-time operational alerts">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Real-time alerts</p>
            <h2>${monitoring.analytics.operationalAlerts.length} active monitoring alert(s)</h2>
          </div>
          <span class="status-pill ${selectedAlert?.severity ?? "watch"}">${selectedAlert?.severity ?? "normal"}</span>
        </div>
        <div class="alert-list">
          ${monitoring.analytics.operationalAlerts.map(renderAlert).join("")}
        </div>
      </section>

      <section class="map-panel" aria-label="Monitoring map">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Monitoring</p>
            <h2>${monitoring.activeFlight.flightId} ${monitoring.landingState === "lit-after-landing" ? "landed" : "inbound"}</h2>
          </div>
          <span class="aircraft-mark" aria-label="Aircraft landing path"></span>
        </div>
        <div class="airport-map ${monitoring.landingState}">
          ${monitoring.zones.map(renderZone).join("")}
          ${monitoring.flows.map(renderFlow).join("")}
          ${monitoring.staff.map(renderStaff).join("")}
        </div>
      </section>

      <aside class="details-panel" aria-label="Selected zone details">
        <p class="eyebrow">Zone details</p>
        <h2>${selectedZone.label}</h2>
        <div class="metric-grid">
          <div><span>${selectedZone.queueState.queueLength}</span><small>Queue length</small></div>
          <div><span>${selectedZone.queueState.estimatedWaitMinutes}m</span><small>Estimated wait</small></div>
          <div><span>${formatUtilization(selectedZone.counterUtilization)}</span><small>Counter utilization</small></div>
          <div><span>${formatStaffingGap(selectedZone.staffingContext)}</span><small>Staffing gap</small></div>
          <div><span>${formatReliefCoverage(selectedZone.staffingContext)}</span><small>Relief coverage</small></div>
          <div><span>${formatOpenCapacity(selectedZone.staffingContext)}</span><small>Openable counters</small></div>
          <div><span>${selectedZone.alert?.severity ?? selectedZone.status}</span><small>Alert state</small></div>
        </div>
        <p class="bottleneck">${selectedZone.bottleneck.label}</p>
        <p class="staffing-note">${formatStaffingContext(selectedZone.staffingContext)}</p>
        <p class="freshness">${selectedZone.freshness.status.toUpperCase()} observation, confidence ${Math.round(selectedZone.confidence.score * 100)}%</p>
      </aside>

      <section class="simulation-panel" aria-label="Simulation controls">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Simulation</p>
            <h2>Counter, movement, and shift choices</h2>
          </div>
          <output>${selectedMinute} min</output>
        </div>
        <input class="time-slider" type="range" min="0" max="120" step="30" value="${selectedMinute}" aria-label="Simulation time" />
        <p class="supporting-note">${projectedZone.expectedOccupancy} projected passengers at ${selectedMinute} min. Simulation remains separate from live monitoring.</p>
        <div class="decision-list">
          ${decisions.map(renderDecision).join("")}
        </div>
      </section>

      <aside class="assistant-panel" aria-label="AI assisted options">
        <div class="assistant-head">
          <span class="assistant-mark" aria-hidden="true"></span>
          <div>
            <p class="eyebrow">Decision assistant</p>
            <h2>${topOption.expectedImpact.label}</h2>
          </div>
        </div>
        <p>${topOption.rationale.map((item) => item.label).join(". ")}.</p>
        <div class="recommendations">
          ${options.map(renderOption).join("")}
        </div>
      </aside>
    </section>
  `;

  app.querySelectorAll("[data-zone-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedZoneId = button.dataset.zoneId;
      render();
    });
  });

  app.querySelectorAll("[data-alert-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedAlertId = button.dataset.alertId;
      selectedZoneId = button.dataset.zoneId;
      render();
    });
  });

  app.querySelector("[data-refresh]").addEventListener("click", () => {
    snapshotIndex = (snapshotIndex + 1) % snapshotSeries.length;
    render();
  });

  app.querySelector(".time-slider").addEventListener("input", (event) => {
    selectedMinute = Number(event.target.value);
    render();
  });
}

function renderZone(zone) {
  return `
    <button
      class="zone zone-${zone.zoneId} ${zone.status} ${zone.zoneId === selectedZoneId ? "selected" : ""}"
      data-zone-id="${zone.zoneId}"
      style="--pressure:${zone.queuePressure}"
      aria-label="${zone.label}, ${zone.status}, ${zone.queueState.queueLength} passengers, ${zone.queueState.estimatedWaitMinutes} minute wait"
    >
      <strong>${zone.label}</strong>
      <span>${zone.queueState.estimatedWaitMinutes}m</span>
      <small>${zone.queueState.queueLength} pax · ${formatUtilization(zone.counterUtilization)}</small>
    </button>
  `;
}

function renderFlow(flow) {
  const routeClass = `${flow.fromZoneId}-to-${flow.toZoneId}`.replaceAll("-gate", "").replaceAll("-hall", "");
  return `<span class="flow flow-${routeClass}" aria-hidden="true"></span>`;
}

function renderStaff(staff) {
  return `<span class="staff-dot staff-${staff.staffId}" title="${staff.role} in ${staff.zoneId}"></span>`;
}

function renderDecision(decision) {
  const label = decision.type === "counter-capacity"
    ? `Open ${decision.openDelta} counter(s) at ${labelize(decision.zoneId)}`
    : decision.type === "passenger-movement"
      ? `Move ${decision.passengers} passengers from ${labelize(decision.fromZoneId)}`
      : decision.type === "staff-reassignment"
        ? `Move ${decision.coverageUnits} ${decision.role} unit(s) from ${labelize(decision.fromZoneId)}`
        : `Start ${decision.role} shift ${Math.abs(decision.startDeltaMinutes)} min earlier`;
  return `<div class="decision-chip">${label}</div>`;
}

function renderOption(option) {
  return `
    <article class="option-card">
      <strong>${option.expectedImpact.label}</strong>
      <span>${renderOptionDecision(option.decision)}. ${option.expectedImpact.passengersRelieved} passengers relieved, ${option.expectedImpact.estimatedWaitMinutesReduced} min wait reduction, confidence ${Math.round(option.confidence.score * 100)}%</span>
    </article>
  `;
}

function renderAlert(alert) {
  return `
    <button
      class="alert-card ${alert.severity} ${alert.alertId === selectedAlertId ? "selected" : ""}"
      type="button"
      data-alert-id="${alert.alertId}"
      data-zone-id="${alert.zoneId}"
      aria-label="${alert.severity} alert for ${labelize(alert.zoneId)}"
    >
      <strong>${alert.message}</strong>
      <span>${alert.type} · ${alert.lifecycleState} · confidence ${Math.round(alert.confidence.score * 100)}%</span>
    </button>
  `;
}

function labelize(value) {
  return value.replaceAll("-", " ");
}

function formatUtilization(counterUtilization) {
  if (!counterUtilization) {
    return "n/a";
  }
  return `${Math.round(counterUtilization.utilizationRatio * 100)}%`;
}

function formatStaffingGap(staffingContext) {
  if (!staffingContext) {
    return "n/a";
  }
  return `${staffingContext.staffingGap}`;
}

function formatReliefCoverage(staffingContext) {
  if (!staffingContext) {
    return "n/a";
  }
  return `${staffingContext.reliefCoverageUnits}`;
}

function formatOpenCapacity(staffingContext) {
  if (!staffingContext) {
    return "n/a";
  }
  return `${staffingContext.openCounterCapacity}`;
}

function formatStaffingContext(staffingContext) {
  if (!staffingContext) {
    return "No staffed counter bank in this zone";
  }
  const candidate = staffingContext.reliefCandidates[0];
  const relief = candidate
    ? `${candidate.coverageUnits} ${staffingContext.roleRequired} unit(s) from ${labelize(candidate.fromZoneId)} in ${candidate.transferMinutes} min`
    : `no same-role relief candidate`;
  return `${staffingContext.activeCoverageUnits}/${staffingContext.requiredCoverageUnits} ${staffingContext.roleRequired} coverage active; ${relief}.`;
}

function renderOptionDecision(decision) {
  if (decision.type === "staff-reassignment") {
    return `Reassign ${decision.coverageUnits} ${decision.role} unit(s) from ${labelize(decision.fromZoneId)} in ${decision.transferMinutes} min`;
  }
  if (decision.type === "counter-capacity") {
    return `Open ${decision.openDelta} ${decision.roleRequired} counter(s) within ${decision.openLeadMinutes} min`;
  }
  if (decision.type === "shift-timing") {
    return `Start ${decision.role} shift ${Math.abs(decision.startDeltaMinutes)} min earlier`;
  }
  return `Route ${decision.passengers} passengers from ${labelize(decision.fromZoneId)}`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

render();

globalThis.setInterval(() => {
  snapshotIndex = (snapshotIndex + 1) % snapshotSeries.length;
  render();
}, DEFAULT_PREDICTION_REFRESH_CADENCE_SECONDS * 1000);
