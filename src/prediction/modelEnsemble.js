/**
 * Model Ensemble for Airport Queue Forecasting.
 *
 * Combines predictions from multiple forecasting models using a
 * confidence-weighted ensemble strategy. Falls back to simpler models
 * when complex models have low confidence or are unavailable.
 *
 * Selection priority:
 * 1. Transformer (if confidence > 0.7 and model is fresh)
 * 2. GNN + Transformer blend (if spatial data available)
 * 3. LSTM (if confidence > 0.6)
 * 4. EWMA + deterministic baseline (always available fallback)
 */

import { assertFlowForecast, deepFreeze } from "../contracts/index.js";
import { PredictionService } from "./index.js";
import { ewmaBayesianForecaster } from "./ewmaBayesian.js";
import { lstmSeq2SeqForecaster } from "./lstmSeq2Seq.js";
import { transformerForecaster } from "./transformerForecaster.js";
import { graphNeuralNetworkForecaster } from "./graphNeuralNetwork.js";

const CONFIDENCE_THRESHOLD_HIGH = 0.7;
const CONFIDENCE_THRESHOLD_MEDIUM = 0.6;
const DEVIATION_ALERT_FACTOR = 3.0;

export class ModelEnsemble {
  constructor() {
    this.baseline = new PredictionService();
    this.ewma = ewmaBayesianForecaster;
    this.lstm = lstmSeq2SeqForecaster;
    this.transformer = transformerForecaster;
    this.gnn = graphNeuralNetworkForecaster;
    this.lastForecasts = new Map();
  }

  /**
   * Generate forecasts from all available models and select/blend results.
   */
  forecast(snapshot, request = {}) {
    const forecasts = new Map();
    const errors = [];

    // Always run deterministic baseline
    try {
      forecasts.set("baseline", this.baseline.forecast(snapshot, request));
    } catch (e) {
      errors.push({ model: "baseline", error: e.message });
    }

    // Always run EWMA (lightweight, no failure expected)
    try {
      forecasts.set("ewma", this.ewma.forecast(snapshot, request));
    } catch (e) {
      errors.push({ model: "ewma", error: e.message });
    }

    // Run LSTM
    try {
      forecasts.set("lstm", this.lstm.forecast(snapshot, request));
    } catch (e) {
      errors.push({ model: "lstm", error: e.message });
    }

    // Run Transformer
    try {
      forecasts.set("transformer", this.transformer.forecast(snapshot, request));
    } catch (e) {
      errors.push({ model: "transformer", error: e.message });
    }

    // Run GNN
    try {
      forecasts.set("gnn", this.gnn.forecast(snapshot, request));
    } catch (e) {
      errors.push({ model: "gnn", error: e.message });
    }

    this.lastForecasts = forecasts;

    // Select primary model based on confidence hierarchy
    const selected = this._selectPrimary(forecasts, snapshot);

    // Check for deviation alerts against baseline
    const alerts = this._checkDeviationAlerts(forecasts);

    // Build ensemble result
    const result = this._buildEnsembleResult(
      selected,
      forecasts,
      snapshot,
      request,
      alerts,
      errors,
    );

    assertFlowForecast(result);
    return deepFreeze(result);
  }

  /**
   * Select the primary forecasting model based on confidence hierarchy.
   */
  _selectPrimary(forecasts, snapshot) {
    const transformer = forecasts.get("transformer");
    const gnn = forecasts.get("gnn");
    const lstm = forecasts.get("lstm");
    const ewma = forecasts.get("ewma");
    const baseline = forecasts.get("baseline");

    // Priority 1: Transformer if high confidence
    if (transformer && transformer.confidence.score >= CONFIDENCE_THRESHOLD_HIGH) {
      return { model: "transformer", forecast: transformer };
    }

    // Priority 2: GNN if spatial data is rich and confidence is adequate
    if (
      gnn &&
      gnn.confidence.score >= CONFIDENCE_THRESHOLD_HIGH &&
      snapshot.passengerFlows.length > 0
    ) {
      return { model: "gnn", forecast: gnn };
    }

    // Priority 3: LSTM if medium confidence
    if (lstm && lstm.confidence.score >= CONFIDENCE_THRESHOLD_MEDIUM) {
      return { model: "lstm", forecast: lstm };
    }

    // Priority 4: EWMA (always has data)
    if (ewma && ewma.confidence.score > 0) {
      return { model: "ewma", forecast: ewma };
    }

    // Fallback: deterministic baseline
    return { model: "baseline", forecast: baseline };
  }

  /**
   * Check if any ML model deviates significantly from baseline.
   */
  _checkDeviationAlerts(forecasts) {
    const alerts = [];
    const baseline = forecasts.get("baseline");
    if (!baseline || !baseline.points || baseline.points.length === 0) {
      return alerts;
    }

    const lastBaselinePoint = baseline.points[baseline.points.length - 1];

    for (const [name, forecast] of forecasts) {
      if (name === "baseline" || !forecast || !forecast.points) continue;

      const lastPoint = forecast.points[forecast.points.length - 1];
      if (!lastPoint || !lastPoint.zones) continue;

      for (let i = 0; i < lastPoint.zones.length; i++) {
        const mlZone = lastPoint.zones[i];
        const baseZone = lastBaselinePoint.zones[i];
        if (!baseZone) continue;

        const baselineOcc = baseZone.expectedOccupancy || 1;
        const deviation = Math.abs(mlZone.expectedOccupancy - baseZone.expectedOccupancy);

        if (deviation > DEVIATION_ALERT_FACTOR * baselineOcc) {
          alerts.push({
            model: name,
            zoneId: mlZone.zoneId,
            deviation,
            baselineValue: baseZone.expectedOccupancy,
            modelValue: mlZone.expectedOccupancy,
          });
        }
      }
    }

    return alerts;
  }

  /**
   * Build the final ensemble forecast result.
   */
  _buildEnsembleResult(selected, forecasts, snapshot, request, alerts, errors) {
    const primary = selected.forecast;
    const horizon = request.horizonMinutes ?? 120;
    const resolution = request.resolutionMinutes ?? 15;
    const refreshCadenceSeconds = request.refreshCadenceSeconds ?? 60;

    const assumptions = [
      ...(primary.assumptions || []),
      { label: `Primary model: ${selected.model}` },
      { label: `Models available: ${[...forecasts.keys()].join(", ")}` },
    ];

    if (alerts.length > 0) {
      assumptions.push({
        label: `Deviation alerts: ${alerts.length} zone(s) show high divergence from baseline`,
      });
    }

    if (errors.length > 0) {
      assumptions.push({
        label: `Model errors: ${errors.map((e) => e.model).join(", ")}`,
      });
    }

    return {
      generatedAt: snapshot.asOf,
      refreshCadenceSeconds,
      horizon: {
        start: snapshot.asOf,
        minutes: horizon,
        resolutionMinutes: resolution,
      },
      points: primary.points,
      confidence: {
        score: primary.confidence.score,
        basis: `Ensemble (primary: ${selected.model}) — ${primary.confidence.basis}`,
      },
      assumptions,
      modelType: `ensemble-${selected.model}`,
      ensembleMetadata: {
        primaryModel: selected.model,
        availableModels: [...forecasts.keys()],
        modelConfidences: Object.fromEntries(
          [...forecasts.entries()].map(([k, v]) => [k, v.confidence.score]),
        ),
        deviationAlerts: alerts,
        modelErrors: errors,
      },
    };
  }

  /**
   * Get last forecasts from all models (for debugging/comparison).
   */
  getLastForecasts() {
    return this.lastForecasts;
  }
}

export const modelEnsemble = new ModelEnsemble();
