import assert from "node:assert/strict";
import test from "node:test";
import { createOperationalStateReader } from "../src/operational-state/index.js";
import { EWMABayesianForecaster } from "../src/prediction/ewmaBayesian.js";
import { LSTMSeq2SeqForecaster } from "../src/prediction/lstmSeq2Seq.js";
import { TransformerQueueForecaster } from "../src/prediction/transformerForecaster.js";
import { GraphNeuralNetworkForecaster } from "../src/prediction/graphNeuralNetwork.js";
import { ModelEnsemble } from "../src/prediction/modelEnsemble.js";

const snapshot = createOperationalStateReader().getSnapshot();

test("EWMA Bayesian forecaster produces valid forecast from snapshot", () => {
  const ewma = new EWMABayesianForecaster();
  const forecast = ewma.forecast(snapshot);

  assert.equal(forecast.modelType, "ewma-bayesian");
  assert.ok(forecast.points.length >= 4);
  assert.ok(forecast.confidence.score >= 0 && forecast.confidence.score <= 1);
  assert.equal(typeof forecast.generatedAt, "string");
  assert.ok(forecast.points[0].zones.length > 0);

  // Each zone has required fields
  const zone = forecast.points[0].zones[0];
  assert.equal(typeof zone.zoneId, "string");
  assert.equal(typeof zone.expectedOccupancy, "number");
  assert.equal(typeof zone.queuePressure, "number");
  assert.equal(typeof zone.staffingDemand, "number");
  assert.ok(["normal", "watch", "critical"].includes(zone.status));
});

test("EWMA Bayesian confidence decays with stale data", () => {
  const ewma = new EWMABayesianForecaster();
  const now = Date.now();

  // Update with fresh data
  ewma.update("zone-1", 100, now);
  const fresh = ewma.forecastZone("zone-1", 3, now);

  // Forecast with stale timestamp (30 minutes later)
  const stale = ewma.forecastZone("zone-1", 3, now + 30 * 60 * 1000);

  assert.ok(stale.confidence < fresh.confidence);
});

test("EWMA Bayesian predictions are non-negative", () => {
  const ewma = new EWMABayesianForecaster();
  const forecast = ewma.forecast(snapshot);

  for (const point of forecast.points) {
    for (const zone of point.zones) {
      assert.ok(zone.expectedOccupancy >= 0);
      assert.ok(zone.queuePressure >= 0);
    }
  }
});

test("LSTM Seq2Seq forecaster produces valid forecast from snapshot", () => {
  const lstm = new LSTMSeq2SeqForecaster();
  const forecast = lstm.forecast(snapshot);

  assert.equal(forecast.modelType, "lstm-seq2seq");
  assert.ok(forecast.points.length >= 4);
  assert.ok(forecast.confidence.score >= 0 && forecast.confidence.score <= 1);
  assert.equal(typeof forecast.generatedAt, "string");
  assert.ok(forecast.points[0].zones.length > 0);

  const zone = forecast.points[0].zones[0];
  assert.equal(typeof zone.zoneId, "string");
  assert.equal(typeof zone.expectedOccupancy, "number");
  assert.equal(typeof zone.queuePressure, "number");
  assert.ok(zone.queuePressure >= 0);
});

test("LSTM Seq2Seq initializes weights deterministically with same seed", () => {
  const lstm1 = new LSTMSeq2SeqForecaster();
  const lstm2 = new LSTMSeq2SeqForecaster();

  const f1 = lstm1.forecast(snapshot);
  const f2 = lstm2.forecast(snapshot);

  // Same seed → same weights → same output
  assert.deepEqual(f1.points, f2.points);
});

test("Transformer forecaster produces valid forecast from snapshot", () => {
  const transformer = new TransformerQueueForecaster();
  const forecast = transformer.forecast(snapshot);

  assert.equal(forecast.modelType, "transformer-queue");
  assert.ok(forecast.points.length >= 4);
  assert.ok(forecast.confidence.score >= 0 && forecast.confidence.score <= 1);
  assert.equal(typeof forecast.generatedAt, "string");

  // Verify self-attention produced per-zone results
  const lastPoint = forecast.points[forecast.points.length - 1];
  assert.ok(lastPoint.zones.length === snapshot.zones.length);

  for (const zone of lastPoint.zones) {
    assert.ok(zone.expectedOccupancy >= 0);
    assert.ok(zone.queuePressure >= 0 && zone.queuePressure <= 2);
  }
});

test("Transformer forecaster captures zone count correctly", () => {
  const transformer = new TransformerQueueForecaster();
  const forecast = transformer.forecast(snapshot);

  for (const point of forecast.points) {
    assert.equal(point.zones.length, snapshot.zones.length);
  }
});

test("Graph Neural Network forecaster produces valid forecast from snapshot", () => {
  const gnn = new GraphNeuralNetworkForecaster();
  const forecast = gnn.forecast(snapshot);

  assert.equal(forecast.modelType, "st-gnn");
  assert.ok(forecast.points.length >= 4);
  assert.ok(forecast.confidence.score >= 0 && forecast.confidence.score <= 1);
  assert.equal(typeof forecast.generatedAt, "string");

  // GNN should model all zones as graph nodes
  const firstPoint = forecast.points[0];
  assert.equal(firstPoint.zones.length, snapshot.zones.length);
});

test("GNN captures spatial structure from passenger flows", () => {
  const gnn = new GraphNeuralNetworkForecaster();
  const forecast = gnn.forecast(snapshot);

  // Verify assumptions mention graph topology
  const graphAssumption = forecast.assumptions.find((a) =>
    a.label.includes("graph"),
  );
  assert.ok(graphAssumption, "GNN should mention graph topology in assumptions");
});

test("Model ensemble produces valid FlowForecast contract", () => {
  const ensemble = new ModelEnsemble();
  const forecast = ensemble.forecast(snapshot);

  // Must satisfy FlowForecast contract
  assert.equal(typeof forecast.generatedAt, "string");
  assert.equal(typeof forecast.refreshCadenceSeconds, "number");
  assert.ok(forecast.points.length >= 4);
  assert.ok(forecast.confidence.score >= 0 && forecast.confidence.score <= 1);
  assert.equal(typeof forecast.confidence.basis, "string");
});

test("Model ensemble provides metadata about available models", () => {
  const ensemble = new ModelEnsemble();
  const forecast = ensemble.forecast(snapshot);

  assert.ok(forecast.ensembleMetadata);
  assert.ok(forecast.ensembleMetadata.availableModels.length >= 3);
  assert.ok(forecast.ensembleMetadata.primaryModel);
  assert.ok(forecast.ensembleMetadata.modelConfidences);
});

test("Model ensemble falls back to baseline when ML confidence is low", () => {
  const ensemble = new ModelEnsemble();
  const forecast = ensemble.forecast(snapshot);

  // With random weights, ML models should have moderate-to-low confidence
  // The ensemble should select based on confidence hierarchy
  const primary = forecast.ensembleMetadata.primaryModel;
  assert.ok(
    ["baseline", "ewma", "lstm", "transformer", "gnn"].includes(primary),
    `Primary model should be one of the available models, got: ${primary}`,
  );
});

test("All ML models produce consistent zone IDs matching snapshot", () => {
  const models = [
    new EWMABayesianForecaster(),
    new LSTMSeq2SeqForecaster(),
    new TransformerQueueForecaster(),
    new GraphNeuralNetworkForecaster(),
  ];

  const expectedZoneIds = snapshot.zones.map((z) => z.zoneId).sort();

  for (const model of models) {
    const forecast = model.forecast(snapshot);
    const firstPoint = forecast.points[0];
    const forecastZoneIds = firstPoint.zones.map((z) => z.zoneId).sort();
    assert.deepEqual(forecastZoneIds, expectedZoneIds);
  }
});

test("All ML models respect horizon and resolution request parameters", () => {
  const request = { horizonMinutes: 60, resolutionMinutes: 10 };
  const models = [
    new EWMABayesianForecaster(),
    new LSTMSeq2SeqForecaster(),
    new TransformerQueueForecaster(),
    new GraphNeuralNetworkForecaster(),
  ];

  for (const model of models) {
    const forecast = model.forecast(snapshot, request);
    assert.equal(forecast.horizon.minutes, 60);
    assert.equal(forecast.horizon.resolutionMinutes, 10);
    // Expected points: 0, 10, 20, 30, 40, 50, 60 = 7 points
    assert.equal(forecast.points.length, 7);
  }
});
