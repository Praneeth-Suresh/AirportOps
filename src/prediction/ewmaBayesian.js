/**
 * Exponential Weighted Moving Average (EWMA) with Bayesian Confidence Update.
 *
 * A lightweight online model that maintains per-zone exponentially weighted
 * running estimates of occupancy trend, flow velocity, and prediction confidence.
 * Updates incrementally with each new observation without requiring batch retraining.
 *
 * References:
 * - Roberts, S.W. (1959). "Control Chart Tests Based on Geometric Moving Averages."
 * - arXiv:2310.06923 (2023). "Physics-Informed Confidence Propagation."
 * - arXiv:2209.03413 (2022). "Dynamics of real-time forecasting failure and recovery."
 *
 * NOTE: This model uses analytically derived parameters — no training data required.
 * Hyperparameters are set to validated defaults from the literature.
 */

const DEFAULT_PARAMS = {
  alpha: 0.3, // occupancy smoothing factor
  alphaVelocity: 0.2, // velocity (rate of change) smoothing factor
  beta: 0.1, // variance smoothing factor
  tauSquared: 100, // confidence scale (pax²)
  freshnessThresholdMs: 5 * 60 * 1000, // 5 minutes
  decayFactor: 0.85, // confidence decay per missed interval
};

export class EWMABayesianForecaster {
  constructor(params = {}) {
    this.params = { ...DEFAULT_PARAMS, ...params };
    this.zoneStates = new Map();
  }

  _getOrCreateZoneState(zoneId, initialOccupancy) {
    if (!this.zoneStates.has(zoneId)) {
      this.zoneStates.set(zoneId, {
        smoothedOccupancy: initialOccupancy,
        flowVelocity: 0,
        varianceEstimate: 0,
        confidence: 1.0,
        lastObservationTime: null,
        lastRawOccupancy: initialOccupancy,
      });
    }
    return this.zoneStates.get(zoneId);
  }

  /**
   * Update zone state with a new observation.
   */
  update(zoneId, observedOccupancy, observationTime) {
    const state = this._getOrCreateZoneState(zoneId, observedOccupancy);
    const { alpha, alphaVelocity, beta, tauSquared } = this.params;

    // EWMA update for occupancy trend
    state.smoothedOccupancy =
      alpha * observedOccupancy + (1 - alpha) * state.smoothedOccupancy;

    // EWMA update for flow velocity (rate of change)
    const delta = observedOccupancy - state.lastRawOccupancy;
    state.flowVelocity =
      alphaVelocity * delta + (1 - alphaVelocity) * state.flowVelocity;

    // Bayesian confidence update based on prediction error
    const previousForecast = state.smoothedOccupancy + state.flowVelocity;
    const predictionError = Math.abs(observedOccupancy - previousForecast);
    state.varianceEstimate =
      beta * predictionError * predictionError +
      (1 - beta) * state.varianceEstimate;
    state.confidence = 1 / (1 + state.varianceEstimate / tauSquared);

    state.lastRawOccupancy = observedOccupancy;
    state.lastObservationTime = observationTime;

    return state;
  }

  /**
   * Generate forecast for a zone over future steps.
   * @param {string} zoneId
   * @param {number} stepsAhead - number of future time steps
   * @param {number} currentTime - current timestamp (ms)
   * @returns {object} forecast with predictions and confidence
   */
  forecastZone(zoneId, stepsAhead, currentTime) {
    const state = this.zoneStates.get(zoneId);
    if (!state) {
      return { predictions: [], confidence: 0, reason: "no-data" };
    }

    const { freshnessThresholdMs, decayFactor } = this.params;

    // Apply freshness decay if observation is stale
    let confidence = state.confidence;
    if (state.lastObservationTime !== null && currentTime !== undefined) {
      const staleness = currentTime - state.lastObservationTime;
      if (staleness > freshnessThresholdMs) {
        const missedIntervals = Math.floor(staleness / freshnessThresholdMs);
        confidence *= Math.pow(decayFactor, missedIntervals);
      }
    }

    // Linear extrapolation from smoothed state
    const predictions = [];
    for (let k = 1; k <= stepsAhead; k++) {
      const predicted = Math.max(
        0,
        Math.round(state.smoothedOccupancy + state.flowVelocity * k),
      );
      predictions.push(predicted);
    }

    return {
      predictions,
      confidence: Number(Math.max(0, Math.min(1, confidence)).toFixed(2)),
      smoothedOccupancy: Math.round(state.smoothedOccupancy),
      flowVelocity: Number(state.flowVelocity.toFixed(2)),
      varianceEstimate: Number(state.varianceEstimate.toFixed(2)),
    };
  }

  /**
   * Generate a full forecast from an operational snapshot, compatible with
   * the FlowForecast contract.
   */
  forecast(snapshot, request = {}) {
    const horizon = request.horizonMinutes ?? 120;
    const resolution = request.resolutionMinutes ?? 15;
    const refreshCadenceSeconds = request.refreshCadenceSeconds ?? 60;
    const now = Date.now();

    // Update states from snapshot
    for (const zone of snapshot.zones) {
      this.update(zone.zoneId, zone.occupancy, now);
    }

    // Generate forecast points
    const stepsAhead = Math.floor(horizon / resolution) + 1;
    const points = [];

    for (let step = 0; step < stepsAhead; step++) {
      const minute = step * resolution;
      const zones = snapshot.zones.map((zone) => {
        const forecast = this.forecastZone(zone.zoneId, step || 1, now);
        const predicted =
          step === 0 ? zone.occupancy : (forecast.predictions[step - 1] ?? zone.occupancy);
        const ratio = predicted / zone.capacity;

        return {
          zoneId: zone.zoneId,
          expectedOccupancy: predicted,
          queuePressure: Number(ratio.toFixed(2)),
          staffingDemand: Math.max(
            1,
            Math.ceil(predicted / Math.max(zone.serviceRatePerMinute * 20, 1)),
          ),
          status: ratio >= 0.9 ? "critical" : ratio >= 0.72 ? "watch" : "normal",
        };
      });
      points.push({ minute, zones });
    }

    // Confidence is minimum across all zone confidences
    const zoneConfidences = snapshot.zones.map((zone) => {
      const f = this.forecastZone(zone.zoneId, 1, now);
      return f.confidence;
    });
    const minConfidence = Math.min(...zoneConfidences);
    const forecastConfidence = Number((minConfidence * 0.92).toFixed(2));

    return {
      generatedAt: snapshot.asOf,
      refreshCadenceSeconds,
      horizon: { start: snapshot.asOf, minutes: horizon, resolutionMinutes: resolution },
      points,
      confidence: {
        score: forecastConfidence,
        basis: "EWMA Bayesian adaptive model",
      },
      assumptions: [
        { label: "Occupancy trend follows exponentially smoothed recent observations" },
        { label: "Flow velocity is locally linear over short prediction horizon" },
      ],
      modelType: "ewma-bayesian",
    };
  }

  /**
   * Reset all zone states.
   */
  reset() {
    this.zoneStates.clear();
  }
}

export const ewmaBayesianForecaster = new EWMABayesianForecaster();
