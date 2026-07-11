import { assertDecisionOptions, deepFreeze } from "../contracts/index.js";

export class DecisionSupportService {
  options(snapshot, forecast, projections, operationalAlerts = []) {
    const projection = Array.isArray(projections) ? projections[0] : projections;
    const finalForecast = forecast.points[forecast.points.length - 1];
    const finalProjection = projection.points[projection.points.length - 1];

    const options = finalForecast.zones
      .filter((zone) => zone.queuePressure >= 0.72)
      .map((zone, index) => {
        const projectedZone = finalProjection.zones.find((candidate) => candidate.zoneId === zone.zoneId) ?? zone;
        const zoneState = snapshot.zones.find((candidate) => candidate.zoneId === zone.zoneId);
        const pressureDrop = Number((zone.queuePressure - projectedZone.queuePressure).toFixed(2));
        const relatedAlert = operationalAlerts.find((alert) => alert.zoneId === zone.zoneId);

        return {
          optionId: `option-${index + 1}`,
          rank: index + 1,
          relatedAlertId: relatedAlert?.alertId,
          decision: chooseDecision(zone.zoneId, pressureDrop),
          affectedZones: [zone.zoneId],
          timeWindow: forecast.horizon,
          expectedImpact: {
            queuePressureDrop: pressureDrop,
            passengersRelieved: Math.max(0, zone.expectedOccupancy - projectedZone.expectedOccupancy),
            estimatedWaitMinutesReduced: Math.max(1, Math.round(pressureDrop * 8)),
            label: `${zoneState.label}: ${Math.max(0, Math.round(pressureDrop * 100))}% pressure reduction`,
          },
          rationale: [
            ...(relatedAlert ? [{ label: `Triggered by ${relatedAlert.type} alert ${relatedAlert.alertId}` }] : []),
            { label: `${zoneState.label} is forecast at ${(zone.queuePressure * 100).toFixed(0)}% of capacity` },
            { label: "Scenario comparison shows measurable queue-pressure relief" },
          ],
          confidence: {
            score: Math.min(forecast.confidence.score, projection.confidence.score),
            basis: "forecast and scenario confidence",
          },
        };
      })
      .sort((a, b) => b.expectedImpact.queuePressureDrop - a.expectedImpact.queuePressureDrop || a.rank - b.rank);

    assertDecisionOptions(options);
    return deepFreeze(options);
  }
}

function chooseDecision(zoneId, pressureDrop) {
  if (zoneId.includes("security")) {
    return { type: "shift-timing", role: "security", startDeltaMinutes: -20, pressureDrop };
  }
  if (zoneId.includes("immigration") || zoneId.includes("check-in") || zoneId.includes("bag-drop")) {
    return { type: "counter-capacity", zoneId, openDelta: 2, pressureDrop };
  }
  return { type: "passenger-movement", fromZoneId: zoneId, toZoneId: "nearest-valid-zone", passengers: 40, pressureDrop };
}

export const decisionSupportService = new DecisionSupportService();
