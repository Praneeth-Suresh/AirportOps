import { assertFlowForecast, deepFreeze } from "../contracts/index.js";

export class PredictionService {
  forecast(snapshot, request = { horizonMinutes: 120, resolutionMinutes: 30 }) {
    const points = [];
    const resolution = request.resolutionMinutes ?? 30;
    const horizon = request.horizonMinutes ?? 120;

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

export const predictionService = new PredictionService();
