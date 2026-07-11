import { assertScenarioProjection, deepFreeze } from "../contracts/index.js";

export class SimulationService {
  project(snapshot, forecast, decisions = defaultScenarioDecisions()) {
    validateScenarioDecisions(snapshot, decisions);

    const counterBoostByZone = new Map();
    const movementReliefByZone = new Map();

    for (const decision of decisions) {
      if (decision.type === "counter-capacity") {
        counterBoostByZone.set(decision.zoneId, (counterBoostByZone.get(decision.zoneId) ?? 0) + decision.openDelta * 18);
      }
      if (decision.type === "passenger-movement") {
        movementReliefByZone.set(decision.fromZoneId, (movementReliefByZone.get(decision.fromZoneId) ?? 0) + decision.passengers);
      }
    }

    const points = forecast.points.map((point) => ({
      minute: point.minute,
      zones: point.zones.map((zone) => {
        const counterRelief = counterBoostByZone.get(zone.zoneId) ?? 0;
        const movementRelief = movementReliefByZone.get(zone.zoneId) ?? 0;
        const expectedOccupancy = Math.max(0, zone.expectedOccupancy - counterRelief - movementRelief);
        const sourceZone = snapshot.zones.find((candidate) => candidate.zoneId === zone.zoneId);
        const queuePressure = Number((expectedOccupancy / sourceZone.capacity).toFixed(2));

        return {
          ...zone,
          expectedOccupancy: Math.round(expectedOccupancy),
          queuePressure,
          status: queuePressure >= 0.9 ? "critical" : queuePressure >= 0.72 ? "watch" : "normal",
        };
      }),
    }));

    const deltaFromBaseline = forecast.points[forecast.points.length - 1].zones.map((zone) => {
      const projected = points[points.length - 1].zones.find((candidate) => candidate.zoneId === zone.zoneId);
      return {
        zoneId: zone.zoneId,
        occupancyDelta: projected.expectedOccupancy - zone.expectedOccupancy,
        queuePressureDelta: Number((projected.queuePressure - zone.queuePressure).toFixed(2)),
      };
    });

    const projection = {
      scenarioId: "fixture-counter-move-shift",
      decisions,
      points,
      deltaFromBaseline,
      confidence: {
        score: Number((forecast.confidence.score * 0.9).toFixed(2)),
        basis: "forecast confidence adjusted for scenario assumptions",
      },
    };

    assertScenarioProjection(projection);
    return deepFreeze(projection);
  }
}

export function defaultScenarioDecisions() {
  return [
    { type: "counter-capacity", zoneId: "check-in-a", openDelta: 2 },
    { type: "counter-capacity", zoneId: "immigration-east", openDelta: 2 },
    { type: "counter-capacity", zoneId: "security-north", openDelta: 1 },
    { type: "passenger-movement", fromZoneId: "security-north", toZoneId: "departure-hall", passengers: 55 },
    { type: "shift-timing", role: "security", startDeltaMinutes: -20 },
  ];
}

function validateScenarioDecisions(snapshot, decisions) {
  const zoneIds = new Set(snapshot.zones.map((zone) => zone.zoneId));
  for (const decision of decisions) {
    if (decision.zoneId && !zoneIds.has(decision.zoneId)) {
      throw new Error(`ScenarioDecision references unknown zone: ${decision.zoneId}`);
    }
    if (decision.fromZoneId && !zoneIds.has(decision.fromZoneId)) {
      throw new Error(`ScenarioDecision references unknown origin zone: ${decision.fromZoneId}`);
    }
    if (decision.toZoneId && !zoneIds.has(decision.toZoneId)) {
      throw new Error(`ScenarioDecision references unknown destination zone: ${decision.toZoneId}`);
    }
  }
}

export const simulationService = new SimulationService();
