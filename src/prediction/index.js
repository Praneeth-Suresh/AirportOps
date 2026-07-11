import { assertFlowForecast, deepFreeze } from "../contracts/index.js";

export const DEFAULT_PREDICTION_REFRESH_CADENCE_SECONDS = 60;
export const DEFAULT_FORECAST_REQUEST = {
  horizonMinutes: 120,
  resolutionMinutes: 15,
  refreshCadenceSeconds: DEFAULT_PREDICTION_REFRESH_CADENCE_SECONDS,
};

export class PredictionService {
  forecast(snapshot, request = DEFAULT_FORECAST_REQUEST) {
    const points = [];
    const resolution = request.resolutionMinutes ?? DEFAULT_FORECAST_REQUEST.resolutionMinutes;
    const horizon = request.horizonMinutes ?? DEFAULT_FORECAST_REQUEST.horizonMinutes;
    const refreshCadenceSeconds = request.refreshCadenceSeconds ?? DEFAULT_PREDICTION_REFRESH_CADENCE_SECONDS;

    for (let minute = 0; minute <= horizon; minute += resolution) {
      points.push({
        minute,
        zones: snapshot.zones.map((zone) => {
          const incoming = snapshot.passengerFlows
            .filter((flow) => flow.toZoneId === zone.zoneId)
            .reduce((total, flow) => total + flow.estimatedCount, 0);
          const outbound = snapshot.passengerFlows
            .filter((flow) => flow.fromZoneId === zone.zoneId)
            .reduce((total, flow) => total + flow.estimatedCount, 0);
          const pressure = Math.max(0, zone.occupancy + incoming * (minute / 60) - outbound * (minute / 90));
          const ratio = pressure / zone.capacity;

          return {
            zoneId: zone.zoneId,
            expectedOccupancy: Math.round(pressure),
            queuePressure: Number(ratio.toFixed(2)),
            staffingDemand: Math.max(1, Math.ceil(pressure / Math.max(zone.serviceRatePerMinute * 20, 1))),
            status: ratio >= 0.9 ? "critical" : ratio >= 0.72 ? "watch" : "normal",
          };
        }),
      });
    }

    const minConfidence = Math.min(...snapshot.zones.map((zone) => zone.confidence.score));
    const forecast = {
      generatedAt: snapshot.asOf,
      refreshCadenceSeconds,
      horizon: { start: snapshot.asOf, minutes: horizon, resolutionMinutes: resolution },
      points,
      confidence: { score: Number((minConfidence * 0.94).toFixed(2)), basis: "fixture baseline model" },
      assumptions: [
        { label: "Passenger movement follows latest aggregated observations" },
        { label: "Open counters maintain current service rate" },
      ],
    };

    assertFlowForecast(forecast);
    return deepFreeze(forecast);
  }
}

export class PredictionRefreshService {
  constructor({
    snapshotReader,
    predictionService = new PredictionService(),
    request = DEFAULT_FORECAST_REQUEST,
    scheduler = globalThis,
  } = {}) {
    if (!snapshotReader || typeof snapshotReader.getSnapshot !== "function") {
      throw new Error("PredictionRefreshService requires a snapshotReader with getSnapshot()");
    }

    this.snapshotReader = snapshotReader;
    this.predictionService = predictionService;
    this.request = {
      ...DEFAULT_FORECAST_REQUEST,
      ...request,
    };
    this.scheduler = scheduler;
    this.latestSnapshot = undefined;
    this.latestForecast = undefined;
    this.intervalId = undefined;
  }

  refreshNow() {
    const snapshot = this.snapshotReader.getSnapshot();
    const forecast = this.predictionService.forecast(snapshot, this.request);
    this.latestSnapshot = snapshot;
    this.latestForecast = forecast;
    return forecast;
  }

  getLatestSnapshot() {
    return this.latestSnapshot;
  }

  getLatestForecast() {
    return this.latestForecast;
  }

  start() {
    if (this.intervalId !== undefined) {
      return this.intervalId;
    }

    this.refreshNow();
    this.intervalId = this.scheduler.setInterval(
      () => this.refreshNow(),
      this.request.refreshCadenceSeconds * 1000,
    );
    return this.intervalId;
  }

  stop() {
    if (this.intervalId === undefined) {
      return;
    }

    this.scheduler.clearInterval(this.intervalId);
    this.intervalId = undefined;
  }
}

export const predictionService = new PredictionService();
