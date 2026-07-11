import assert from "node:assert/strict";
import test from "node:test";
import { createOperationalStateReader } from "../src/operational-state/index.js";
import { createFixtureSnapshotSeries } from "../src/fixtures/deterministicAdapters.js";
import { predictionService } from "../src/prediction/index.js";
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

test("simulation rejects scenario decisions for unknown zones", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);

  assert.throws(
    () => simulationService.project(snapshot, forecast, [{ type: "counter-capacity", zoneId: "missing-zone", openDelta: 1 }]),
    /unknown zone/,
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
});
