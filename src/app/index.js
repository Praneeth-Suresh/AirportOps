import { createOperationalStateReader } from "../operational-state/index.js";
import { predictionService } from "../prediction/index.js";
import { MonitoringViewModel } from "../monitoring/index.js";
import { defaultScenarioDecisions, simulationService } from "../simulation/index.js";
import { decisionSupportService } from "../decision-support/index.js";

const reader = createOperationalStateReader();
const snapshot = reader.getSnapshot();
const forecast = predictionService.forecast(snapshot);
const decisions = defaultScenarioDecisions();
const projection = simulationService.project(snapshot, forecast, decisions);
const options = decisionSupportService.options(snapshot, forecast, projection);
const monitoring = MonitoringViewModel.from(snapshot, forecast);

const app = document.querySelector("#app");
let selectedZoneId = "immigration-east";
let selectedMinute = 60;

function render() {
  const selectedPoint = projection.points.find((point) => point.minute === selectedMinute) ?? projection.points[0];
  const selectedZone = monitoring.zones.find((zone) => zone.zoneId === selectedZoneId);
  const projectedZone = selectedPoint.zones.find((zone) => zone.zoneId === selectedZoneId);
  const topOption = options[0];

  app.innerHTML = `
    <section class="status-rail" aria-label="Airport operating status">
      <div>
        <p class="eyebrow">Operations surface</p>
        <h1>Passenger movement decision board</h1>
      </div>
      <div class="status-cluster">
        <span class="status-pill live">Live snapshot ${formatTime(snapshot.asOf)}</span>
        <span class="status-pill forecast">Forecast ${forecast.horizon.minutes} min</span>
        <span class="status-pill scenario">Scenario ${selectedMinute} min</span>
      </div>
    </section>

    <section class="workspace">
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
          <div><span>${selectedZone.occupancy}</span><small>Live passengers</small></div>
          <div><span>${projectedZone.expectedOccupancy}</span><small>Scenario count</small></div>
          <div><span>${Math.round(projectedZone.queuePressure * 100)}%</span><small>Queue pressure</small></div>
          <div><span>${selectedZone.staffCount}</span><small>Staff on zone</small></div>
        </div>
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
      aria-label="${zone.label}, ${zone.status}, ${Math.round(zone.queuePressure * 100)} percent pressure"
    >
      <strong>${zone.label}</strong>
      <span>${Math.round(zone.queuePressure * 100)}%</span>
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
      : `Start ${decision.role} shift ${Math.abs(decision.startDeltaMinutes)} min earlier`;
  return `<div class="decision-chip">${label}</div>`;
}

function renderOption(option) {
  return `
    <article class="option-card">
      <strong>${option.expectedImpact.label}</strong>
      <span>${option.expectedImpact.passengersRelieved} passengers relieved, confidence ${Math.round(option.confidence.score * 100)}%</span>
    </article>
  `;
}

function labelize(value) {
  return value.replaceAll("-", " ");
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

render();
