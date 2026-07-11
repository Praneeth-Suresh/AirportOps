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
        const feasibility = buildRearrangementFeasibility(snapshot, zone.zoneId);

        return {
          optionId: `option-${index + 1}`,
          rank: index + 1,
          relatedAlertId: relatedAlert?.alertId,
          decision: chooseDecision(zone.zoneId, pressureDrop, feasibility),
          affectedZones: [zone.zoneId],
          timeWindow: forecast.horizon,
          expectedImpact: {
            queuePressureDrop: pressureDrop,
            passengersRelieved: Math.max(0, zone.expectedOccupancy - projectedZone.expectedOccupancy),
            estimatedWaitMinutesReduced: Math.max(1, Math.round(pressureDrop * 8)),
            staffingGap: feasibility.staffingGap,
            openCounterCapacity: feasibility.openCounterCapacity,
            reliefCoverageUnits: feasibility.reliefCoverageUnits,
            label: `${zoneState.label}: ${Math.max(0, Math.round(pressureDrop * 100))}% pressure reduction`,
          },
          rationale: [
            ...(relatedAlert ? [{ label: `Triggered by ${relatedAlert.type} alert ${relatedAlert.alertId}` }] : []),
            { label: `${zoneState.label} is forecast at ${(zone.queuePressure * 100).toFixed(0)}% of capacity` },
            { label: feasibility.label },
            { label: "Scenario comparison shows measurable queue-pressure relief" },
          ],
          confidence: {
            score: Math.min(forecast.confidence.score, projection.confidence.score, feasibility.confidence.score),
            basis: "forecast and scenario confidence",
          },
        };
      })
      .filter((option) => option.expectedImpact.queuePressureDrop > 0)
      .sort((a, b) => b.expectedImpact.queuePressureDrop - a.expectedImpact.queuePressureDrop || a.rank - b.rank);

    assertDecisionOptions(options);
    return deepFreeze(options);
  }
}

function buildRearrangementFeasibility(snapshot, zoneId) {
  const counter = snapshot.counters.find((candidate) => candidate.zoneId === zoneId);
  if (!counter) {
    return {
      type: "passenger-movement",
      staffingGap: 0,
      openCounterCapacity: 0,
      reliefCoverageUnits: 0,
      reliefCandidates: [],
      confidence: { score: 0.72, basis: "no counter bank in zone" },
      label: "No counter bank is available; use passenger routing relief",
    };
  }

  const activeCoverageUnits = sumCoverage(snapshot.staff.filter((staff) => (
    staff.zoneId === zoneId
    && staff.role === counter.roleRequired
    && staff.availability === "active"
  )));
  const requiredCoverageUnits = counter.open;
  const reliefCandidates = snapshot.staff
    .filter((staff) => staff.zoneId !== zoneId)
    .filter((staff) => staff.role === counter.roleRequired)
    .filter((staff) => staff.availability === "available" || staff.availability === "active")
    .filter((staff) => staff.restMinutesDue >= 30)
    .map((staff) => {
      const transferRule = findTransferRule(snapshot, staff, zoneId);
      return {
        staffId: staff.staffId,
        fromZoneId: staff.zoneId,
        coverageUnits: staff.coverageUnits,
        transferMinutes: transferRule?.transferMinutes ?? 15,
      };
    })
    .sort((a, b) => a.transferMinutes - b.transferMinutes);
  const reliefCoverageUnits = sumCoverage(reliefCandidates);
  const openCounterCapacity = Math.max(0, counter.maxOpen - counter.open);
  const staffingGap = Math.max(0, requiredCoverageUnits - activeCoverageUnits);
  const topCandidate = reliefCandidates[0];
  const label = staffingGap > 0 && topCandidate
    ? `${staffingGap} ${counter.roleRequired} coverage unit(s) short; ${topCandidate.coverageUnits} can move from ${topCandidate.fromZoneId} in ${topCandidate.transferMinutes} min`
    : openCounterCapacity > 0
      ? `${openCounterCapacity} counter(s) can open within ${counter.openLeadMinutes} min using ${counter.roleRequired}`
      : `No spare ${counter.roleRequired} counter capacity in this zone`;

  return {
    type: counter.roleRequired,
    roleRequired: counter.roleRequired,
    staffingGap,
    openCounterCapacity,
    reliefCoverageUnits,
    reliefCandidates,
    openLeadMinutes: counter.openLeadMinutes,
    confidence: counter.confidence,
    label,
  };
}

function chooseDecision(zoneId, pressureDrop, feasibility) {
  if (feasibility.staffingGap > 0 && feasibility.reliefCandidates.length > 0) {
    const candidate = feasibility.reliefCandidates[0];
    return {
      type: "staff-reassignment",
      role: feasibility.roleRequired,
      fromZoneId: candidate.fromZoneId,
      toZoneId: zoneId,
      coverageUnits: Math.min(feasibility.staffingGap, candidate.coverageUnits),
      transferMinutes: candidate.transferMinutes,
      pressureDrop,
    };
  }
  if (feasibility.openCounterCapacity > 0) {
    return {
      type: "counter-capacity",
      zoneId,
      openDelta: Math.min(2, feasibility.openCounterCapacity),
      roleRequired: feasibility.roleRequired,
      openLeadMinutes: feasibility.openLeadMinutes,
      pressureDrop,
    };
  }
  return { type: "passenger-movement", fromZoneId: zoneId, toZoneId: "nearest-valid-zone", passengers: 40, pressureDrop };
}

function findTransferRule(snapshot, staff, toZoneId) {
  return snapshot.airport.transferRules?.find((rule) => (
    rule.allowed
    && rule.role === staff.role
    && rule.fromZoneId === staff.zoneId
    && rule.toZoneId === toZoneId
  ));
}

function sumCoverage(staffLike) {
  return staffLike.reduce((total, staff) => total + (staff.coverageUnits ?? 0), 0);
}

export const decisionSupportService = new DecisionSupportService();
