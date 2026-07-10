import assert from "node:assert/strict";
import test from "node:test";
import { createOperationalStateReader } from "../src/operational-state/index.js";
import { predictionService } from "../src/prediction/index.js";
import { defaultScenarioDecisions, simulationService } from "../src/simulation/index.js";
import { decisionSupportService } from "../src/decision-support/index.js";
import { MonitoringViewModel } from "../src/monitoring/index.js";

test("fixture snapshot drives the full airport operations decision path", () => {
  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const options = decisionSupportService.options(snapshot, forecast, projection);
  const monitoring = MonitoringViewModel.from(snapshot, forecast);

  assert.equal(snapshot.airport.airportId, "BKK");
  assert.ok(forecast.points.length >= 4);
  assert.ok(projection.deltaFromBaseline.some((delta) => delta.occupancyDelta < 0));
  assert.ok(options.length >= 1);
  assert.equal(monitoring.landingState, "lit-after-landing");
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
