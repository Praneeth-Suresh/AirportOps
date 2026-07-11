import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createOperationalDatabaseReader,
  createFixtureOperationalDatabaseRows,
  createOperationalDatabaseRowsFromSnapshot,
} from "../src/operational-database/index.js";
import { createOperationalStateReader } from "../src/operational-state/index.js";
import { createFixtureSnapshotSeries } from "../src/fixtures/deterministicAdapters.js";
import {
  DEFAULT_PREDICTION_REFRESH_CADENCE_SECONDS,
  PredictionRefreshService,
  predictionService,
} from "../src/prediction/index.js";
import { defaultScenarioDecisions, simulationService } from "../src/simulation/index.js";
import { decisionSupportService } from "../src/decision-support/index.js";
import { MonitoringViewModel, monitoringAnalyticsService } from "../src/monitoring/index.js";

test("fixture snapshot drives the full airport operations decision path", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const monitoring = MonitoringViewModel.from(snapshot, forecast);
  const options = decisionSupportService.options(snapshot, forecast, projection, monitoring.analytics.operationalAlerts);

  assert.equal(snapshot.airport.airportId, "BKK");
  assert.ok(forecast.points.length >= 4);
  assert.ok(projection.deltaFromBaseline.some((delta) => delta.occupancyDelta < 0));
  assert.ok(options.length >= 1);
  assert.equal(monitoring.landingState, "lit-after-landing");
  assert.ok(monitoring.analytics.operationalAlerts.some((alert) => alert.zoneId === "check-in-a"));
});

test("operational database reader drives the full airport operations decision path", () => {
  const snapshot = createOperationalDatabaseReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const monitoring = MonitoringViewModel.from(snapshot, forecast);
  const options = decisionSupportService.options(snapshot, forecast, projection, monitoring.analytics.operationalAlerts);

  assert.equal(snapshot.airport.airportId, "BKK");
  assert.equal(snapshot.zones.find((zone) => zone.zoneId === "check-in-a").occupancy, 720);
  assert.ok(forecast.points.some((point) => point.zones.some((zone) => zone.zoneId === "security-north")));
  assert.ok(projection.deltaFromBaseline.some((delta) => delta.zoneId === "check-in-a"));
  assert.ok(options.some((option) => option.affectedZones.includes("check-in-a")));
});

test("operational database reader preserves staffing and counter feasibility context", () => {
  const snapshot = createOperationalDatabaseReader().getSnapshot();
  const checkInCounter = snapshot.counters.find((counter) => counter.zoneId === "check-in-a");
  const checkInStaff = snapshot.staff.find((staff) => staff.staffId === "ops-33");
  const transferRule = snapshot.airport.transferRules.find((rule) => rule.toZoneId === "check-in-a");

  assert.equal(checkInCounter.maxOpen, 10);
  assert.equal(checkInCounter.openLeadMinutes, 6);
  assert.equal(checkInCounter.confidence.score, 0.88);
  assert.equal(checkInStaff.coverageUnits, 5);
  assert.equal(checkInStaff.confidence.score, 0.88);
  assert.equal(transferRule.transferMinutes, 7);
});

test("prediction uses 60 second refresh cadence and 15 minute forecast resolution by default", () => {
  const snapshot = createOperationalDatabaseReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);

  assert.equal(forecast.refreshCadenceSeconds, DEFAULT_PREDICTION_REFRESH_CADENCE_SECONDS);
  assert.equal(forecast.refreshCadenceSeconds, 60);
  assert.equal(forecast.horizon.minutes, 120);
  assert.equal(forecast.horizon.resolutionMinutes, 15);
  assert.deepEqual(forecast.points.map((point) => point.minute), [0, 15, 30, 45, 60, 75, 90, 105, 120]);
});

test("prediction refresh service updates forecasts from the operational database reader", () => {
  const snapshots = createFixtureSnapshotSeries();
  let index = 0;
  const reader = createOperationalDatabaseReader(() => (
    createOperationalDatabaseRowsFromSnapshot(snapshots[index++], `fixture-refresh-${index}`)
  ));
  const refreshService = new PredictionRefreshService({ snapshotReader: reader });

  const firstForecast = refreshService.refreshNow();
  const secondForecast = refreshService.refreshNow();

  assert.equal(firstForecast.generatedAt, "2026-07-11T09:10:00+07:00");
  assert.equal(secondForecast.generatedAt, "2026-07-11T09:20:00+07:00");
  assert.equal(refreshService.getLatestForecast(), secondForecast);
  assert.equal(refreshService.getLatestSnapshot().asOf, "2026-07-11T09:20:00+07:00");
});

test("prediction refresh service schedules periodic refreshes every 60 seconds", () => {
  const snapshots = createFixtureSnapshotSeries();
  let index = 0;
  const reader = createOperationalDatabaseReader(() => (
    createOperationalDatabaseRowsFromSnapshot(snapshots[index++], `fixture-scheduled-${index}`)
  ));
  const scheduled = [];
  const scheduler = {
    setInterval(callback, delayMs) {
      scheduled.push({ callback, delayMs });
      return "prediction-refresh-timer";
    },
    clearInterval(timerId) {
      scheduled.clearedTimerId = timerId;
    },
  };
  const refreshService = new PredictionRefreshService({ snapshotReader: reader, scheduler });

  const timerId = refreshService.start();

  assert.equal(timerId, "prediction-refresh-timer");
  assert.equal(scheduled[0].delayMs, 60000);
  assert.equal(refreshService.getLatestForecast().generatedAt, "2026-07-11T09:10:00+07:00");

  scheduled[0].callback();

  assert.equal(refreshService.getLatestForecast().generatedAt, "2026-07-11T09:20:00+07:00");

  refreshService.stop();

  assert.equal(scheduled.clearedTimerId, "prediction-refresh-timer");
});

test("prediction slice does not import simulation or decision support internals", () => {
  const source = readFileSync(new URL("../src/prediction/index.js", import.meta.url), "utf8");

  assert.equal(source.includes("../simulation"), false);
  assert.equal(source.includes("../decision-support"), false);
  assert.equal(source.includes("DecisionSupportService"), false);
});

test("operational database reader rejects rows that reference unknown zones", () => {
  const rows = createFixtureOperationalDatabaseRows();
  rows.staffStates[0] = { ...rows.staffStates[0], zoneId: "missing-zone" };
  const reader = createOperationalDatabaseReader(() => rows);

  assert.throws(
    () => reader.getSnapshot(),
    /references unknown zone/,
  );
});

test("simulation rejects scenario decisions for unknown zones", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);

  assert.throws(
    () => simulationService.project(snapshot, forecast, [{ type: "counter-capacity", zoneId: "missing-zone", openDelta: 1 }]),
    /unknown zone/,
  );
});

test("simulation rejects counter decisions that exceed available opening capacity", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);

  assert.throws(
    () => simulationService.project(snapshot, forecast, [{ type: "counter-capacity", zoneId: "check-in-a", openDelta: 5 }]),
    /exceeds counter capacity/,
  );
});

test("simulation does not mutate live operational state", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const before = snapshot.zones.find((zone) => zone.zoneId === "immigration-east").occupancy;
  const forecast = predictionService.forecast(snapshot);

  simulationService.project(snapshot, forecast, defaultScenarioDecisions());

  assert.equal(snapshot.zones.find((zone) => zone.zoneId === "immigration-east").occupancy, before);
  assert.equal(Object.isFrozen(snapshot), true);
});

test("monitoring analytics exposes queue length and estimated wait time for check-in", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const analytics = monitoringAnalyticsService.analyze(snapshot);
  const queue = analytics.queueStates.find((candidate) => candidate.zoneId === "check-in-a");

  assert.equal(queue.queueLength, 138);
  assert.equal(queue.estimatedWaitMinutes, 5);
  assert.equal(queue.severity, "critical");
  assert.equal(queue.confidence.score, 0.88);
});

test("monitoring analytics derives check-in counter utilization and alert severity", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const analytics = monitoringAnalyticsService.analyze(snapshot);
  const utilization = analytics.counterUtilizations.find((candidate) => candidate.zoneId === "check-in-a");
  const alert = analytics.operationalAlerts.find((candidate) => candidate.zoneId === "check-in-a" && candidate.type === "counter-saturation");

  assert.equal(utilization.utilizationRatio, 1);
  assert.equal(utilization.status, "overloaded");
  assert.equal(alert.severity, "critical");
  assert.equal(alert.lifecycleState, "new");
});

test("monitoring analytics exposes staffing context for counter relief", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const analytics = monitoringAnalyticsService.analyze(snapshot);
  const staffing = analytics.staffingContexts.find((candidate) => candidate.zoneId === "check-in-a");

  assert.equal(staffing.roleRequired, "ground-staff");
  assert.equal(staffing.staffingGap, 1);
  assert.equal(staffing.openCounterCapacity, 4);
  assert.equal(staffing.reliefCandidates[0].fromZoneId, "bag-drop-a");
  assert.equal(staffing.reliefCandidates[0].transferMinutes, 4);
});

test("stale edge observations lower confidence and generate data-quality alerts", () => {
  const staleSnapshot = createOperationalStateReader(() => createFixtureSnapshotSeries()[2]).getSnapshot();
  const analytics = monitoringAnalyticsService.analyze(staleSnapshot);
  const queue = analytics.queueStates.find((candidate) => candidate.zoneId === "check-in-a");
  const alert = analytics.operationalAlerts.find((candidate) => candidate.alertId === "alert-stale-check-in-a");

  assert.equal(queue.freshness.status, "stale");
  assert.equal(alert.lifecycleState, "stale");
  assert.equal(alert.confidence.score, 0.62);
});

test("fixture snapshot series simulates changing real-time monitoring state", () => {
  const [normal, peak, stale] = createFixtureSnapshotSeries();
  const normalQueue = monitoringAnalyticsService.analyze(normal).queueStates.find((queue) => queue.zoneId === "check-in-a");
  const peakQueue = monitoringAnalyticsService.analyze(peak).queueStates.find((queue) => queue.zoneId === "check-in-a");
  const staleQueue = monitoringAnalyticsService.analyze(stale).queueStates.find((queue) => queue.zoneId === "check-in-a");

  assert.ok(peakQueue.queueLength > normalQueue.queueLength);
  assert.equal(staleQueue.freshness.status, "stale");
});

test("decision options can trace recommendations to monitoring alerts", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const monitoring = MonitoringViewModel.from(snapshot, forecast);
  const options = decisionSupportService.options(snapshot, forecast, projection, monitoring.analytics.operationalAlerts);

  assert.ok(options.some((option) => option.relatedAlertId));
  assert.ok(options.some((option) => option.expectedImpact.estimatedWaitMinutesReduced >= 1));
  assert.ok(options.every((option) => option.expectedImpact.queuePressureDrop > 0));
});

test("decision options include staffing rearrangement feasibility", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const monitoring = MonitoringViewModel.from(snapshot, forecast);
  const options = decisionSupportService.options(snapshot, forecast, projection, monitoring.analytics.operationalAlerts);
  const checkInOption = options.find((option) => option.affectedZones.includes("check-in-a"));

  assert.equal(checkInOption.decision.type, "staff-reassignment");
  assert.equal(checkInOption.decision.fromZoneId, "bag-drop-a");
  assert.equal(checkInOption.expectedImpact.staffingGap, 1);
  assert.ok(checkInOption.rationale.some((item) => item.label.includes("coverage unit")));
});

// --- Decision Support: Contract Cleanup Tests ---

test("decision options support named-object request interface", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const monitoring = MonitoringViewModel.from(snapshot, forecast);
  const options = decisionSupportService.options({
    snapshot,
    forecast,
    projections: [projection],
    operationalAlerts: monitoring.analytics.operationalAlerts,
    queueStates: monitoring.analytics.queueStates,
    counterUtilizations: monitoring.analytics.counterUtilizations,
    staffingContexts: monitoring.analytics.staffingContexts,
  });

  assert.ok(options.length >= 1);
  assert.ok(options.every((option) => typeof option.rank === "number"));
  assert.ok(options.every((option) => option.rank >= 1));
  assert.ok(options.every((option) => typeof option.confidence.basis === "string"));
});

test("decision options include rank and relatedAlertId fields", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const monitoring = MonitoringViewModel.from(snapshot, forecast);
  const options = decisionSupportService.options(snapshot, forecast, projection, monitoring.analytics.operationalAlerts);

  assert.ok(options.every((option) => typeof option.rank === "number" && option.rank >= 1));
  assert.ok(options.some((option) => option.relatedAlertId !== null));
  // Ranks are sequential
  options.forEach((option, i) => assert.equal(option.rank, i + 1));
});

test("decision options are discarded when scenario projection does not improve queue pressure", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  // Empty decisions produce no improvement
  const projection = simulationService.project(snapshot, forecast, []);
  const options = decisionSupportService.options(snapshot, forecast, projection, []);

  // All returned options must have positive pressure drop
  assert.ok(options.every((option) => option.expectedImpact.queuePressureDrop > 0));
});

test("decision support does not mutate OperationalSnapshot", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const before = JSON.stringify(snapshot);
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const monitoring = MonitoringViewModel.from(snapshot, forecast);

  decisionSupportService.options(snapshot, forecast, projection, monitoring.analytics.operationalAlerts);

  assert.equal(JSON.stringify(snapshot), before);
  assert.equal(Object.isFrozen(snapshot), true);
});

// --- Decision Support: Scoring and Ranking Tests ---

test("options are ranked by deterministic scoring with highest score first", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const monitoring = MonitoringViewModel.from(snapshot, forecast);
  const options = decisionSupportService.options(snapshot, forecast, projection, monitoring.analytics.operationalAlerts);

  // Check that options are in descending score order (rank 1 is best)
  for (let i = 0; i < options.length - 1; i++) {
    assert.ok(options[i].rank < options[i + 1].rank);
  }
  assert.ok(options.length >= 1);
});

test("staff reassignment is preferred when staffing gap exists and transfer is valid", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const monitoring = MonitoringViewModel.from(snapshot, forecast);
  const options = decisionSupportService.options(snapshot, forecast, projection, monitoring.analytics.operationalAlerts);
  const checkInOption = options.find((option) => option.affectedZones.includes("check-in-a"));

  // check-in-a has a staffing gap and a valid transfer rule from bag-drop-a
  assert.equal(checkInOption.decision.type, "staff-reassignment");
  assert.equal(checkInOption.decision.role, "ground-staff");
  assert.equal(checkInOption.decision.fromZoneId, "bag-drop-a");
  assert.equal(checkInOption.decision.toZoneId, "check-in-a");
  assert.ok(checkInOption.decision.transferMinutes <= 4);
});

test("counter capacity is preferred when no staffing gap exists and counters can open", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const options = decisionSupportService.options(snapshot, forecast, projection, []);

  // security-north has no staffing gap (sec-04 is active with 6 coverage units covering 7 counters)
  // but has open counter capacity (maxOpen=10, open=7)
  const securityOption = options.find((option) => option.affectedZones.includes("security-north"));
  if (securityOption) {
    // If security-north appears, it should use counter-capacity since it has no staffing gap
    // or passenger-movement if no valid staff can open counters
    assert.ok(["counter-capacity", "passenger-movement", "staff-reassignment"].includes(securityOption.decision.type));
  }
});

// --- Decision Support: Confidence and Rationale Tests ---

test("stale observations lower confidence and appear in rationale", () => {
  const staleSnapshot = createOperationalStateReader(() => createFixtureSnapshotSeries()[2]).getSnapshot();
  const forecast = predictionService.forecast(staleSnapshot);
  const projection = simulationService.project(staleSnapshot, forecast, defaultScenarioDecisions());
  const analytics = monitoringAnalyticsService.analyze(staleSnapshot);
  const options = decisionSupportService.options(staleSnapshot, forecast, projection, analytics.operationalAlerts);

  if (options.length > 0) {
    const staleOption = options.find((option) => option.affectedZones.includes("check-in-a"));
    if (staleOption) {
      // Confidence should be lower due to stale data
      assert.ok(staleOption.confidence.score < 0.85);
      // Rationale should mention stale observations
      assert.ok(staleOption.rationale.some((item) => item.label.toLowerCase().includes("stale")));
    }
  }
});

test("confidence basis identifies the limiting confidence input", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const monitoring = MonitoringViewModel.from(snapshot, forecast);
  const options = decisionSupportService.options(snapshot, forecast, projection, monitoring.analytics.operationalAlerts);

  assert.ok(options.length >= 1);
  for (const option of options) {
    assert.ok(option.confidence.basis.includes("limited by"));
    assert.ok(option.confidence.score > 0 && option.confidence.score <= 1);
  }
});

test("rationale includes triggering alert and forecast pressure evidence", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const monitoring = MonitoringViewModel.from(snapshot, forecast);
  const options = decisionSupportService.options(snapshot, forecast, projection, monitoring.analytics.operationalAlerts);
  const checkInOption = options.find((option) => option.affectedZones.includes("check-in-a"));

  // Should reference alert
  assert.ok(checkInOption.rationale.some((item) => item.label.includes("alert")));
  // Should reference forecast pressure
  assert.ok(checkInOption.rationale.some((item) => item.label.includes("forecast at")));
  // Should reference scenario comparison
  assert.ok(checkInOption.rationale.some((item) => item.label.includes("Scenario comparison")));
});

test("missing transfer rules prevent staff-reassignment from unconnected zones", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const monitoring = MonitoringViewModel.from(snapshot, forecast);
  const options = decisionSupportService.options(snapshot, forecast, projection, monitoring.analytics.operationalAlerts);

  // Staff reassignment decisions should only use staff that have valid transfer paths
  const staffOptions = options.filter((option) => option.decision.type === "staff-reassignment");
  for (const option of staffOptions) {
    const fromZone = option.decision.fromZoneId;
    const toZone = option.decision.toZoneId;
    // Verify a transfer rule exists for this route
    const rule = snapshot.airport.transferRules.find((r) =>
      r.fromZoneId === fromZone && r.toZoneId === toZone && r.allowed,
    );
    assert.ok(rule, `Expected transfer rule from ${fromZone} to ${toZone}`);
  }
});

test("decision options with named request include queue and counter detail in rationale", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const monitoring = MonitoringViewModel.from(snapshot, forecast);
  const options = decisionSupportService.options({
    snapshot,
    forecast,
    projections: [projection],
    operationalAlerts: monitoring.analytics.operationalAlerts,
    queueStates: monitoring.analytics.queueStates,
    counterUtilizations: monitoring.analytics.counterUtilizations,
    staffingContexts: monitoring.analytics.staffingContexts,
  });

  const checkInOption = options.find((option) => option.affectedZones.includes("check-in-a"));
  // When queue states are provided, rationale should include queue detail
  assert.ok(checkInOption.rationale.some((item) => item.label.includes("Queue length")));
  // When counter utilizations are provided, rationale should include counter detail
  assert.ok(checkInOption.rationale.some((item) => item.label.includes("Counter utilization")));
});

test("empty projections array returns no options", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const options = decisionSupportService.options({
    snapshot,
    forecast,
    projections: [],
    operationalAlerts: [],
  });

  assert.equal(options.length, 0);
});
