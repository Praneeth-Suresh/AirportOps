import { assertDecisionOptions, deepFreeze } from "../contracts/index.js";

export class DecisionSupportService {
  /**
   * Named-object interface (target):
   *   options({ snapshot, forecast, projections, operationalAlerts, queueStates, counterUtilizations, staffingContexts })
   *
   * Positional interface (backward compat):
   *   options(snapshot, forecast, projections, operationalAlerts)
   */
  options(snapshotOrRequest, forecast, projections, operationalAlerts) {
    const request = normalizeRequest(snapshotOrRequest, forecast, projections, operationalAlerts);
    const { snapshot } = request;

    // Phase 2: Build zone pressure context
    const zoneContexts = buildZoneContexts(request);

    // Phase 3: Build feasibility for candidate zones
    const candidateZones = zoneContexts.filter((ctx) => ctx.isCandidate);

    // Phase 4: Generate candidate options with scenario impact
    const candidateOptions = generateCandidateOptions(candidateZones, request);

    // Phase 5: Score, rank, and build rationale
    const rankedOptions = scoreAndRank(candidateOptions, request);

    assertDecisionOptions(rankedOptions);
    return deepFreeze(rankedOptions);
  }
}

// --- Request normalization (backward compat) ---

function normalizeRequest(snapshotOrRequest, forecast, projections, operationalAlerts) {
  if (forecast !== undefined) {
    // Positional call: options(snapshot, forecast, projections, alerts)
    return {
      snapshot: snapshotOrRequest,
      forecast,
      projections: Array.isArray(projections) ? projections : [projections],
      operationalAlerts: operationalAlerts ?? [],
      queueStates: [],
      counterUtilizations: [],
      staffingContexts: [],
    };
  }
  // Named-object call: options({ snapshot, forecast, ... })
  const req = snapshotOrRequest;
  return {
    snapshot: req.snapshot,
    forecast: req.forecast,
    projections: Array.isArray(req.projections) ? req.projections : (req.projections ? [req.projections] : []),
    operationalAlerts: req.operationalAlerts ?? [],
    queueStates: req.queueStates ?? [],
    counterUtilizations: req.counterUtilizations ?? [],
    staffingContexts: req.staffingContexts ?? [],
  };
}

// --- Phase 2: Zone Context Builder ---

function buildZoneContexts(request) {
  const { snapshot, forecast, operationalAlerts, queueStates, counterUtilizations, staffingContexts } = request;
  const finalForecastPoint = forecast.points[forecast.points.length - 1];

  return snapshot.zones.map((zone) => {
    const forecastZone = finalForecastPoint.zones.find((fz) => fz.zoneId === zone.zoneId);
    const alert = operationalAlerts.find((a) => a.zoneId === zone.zoneId);
    const queueState = queueStates.find((q) => q.zoneId === zone.zoneId);
    const counterUtil = counterUtilizations.find((c) => c.zoneId === zone.zoneId);
    const staffCtx = staffingContexts.find((s) => s.zoneId === zone.zoneId);
    const counter = snapshot.counters.find((c) => c.zoneId === zone.zoneId);

    // Derive staffing gap from snapshot if not provided by monitoring analytics
    const feasibility = buildFeasibility(snapshot, zone.zoneId);

    const isCandidate = !!(
      (forecastZone && forecastZone.queuePressure >= 0.72)
      || (queueState && (queueState.severity === "watch" || queueState.severity === "critical"))
      || (alert && (alert.severity === "watch" || alert.severity === "critical"))
      || (counterUtil && (counterUtil.status === "saturated" || counterUtil.status === "overloaded"))
      || (feasibility.staffingGap > 0)
    );

    return {
      zoneId: zone.zoneId,
      zone,
      forecastZone,
      alert,
      queueState,
      counterUtil,
      staffCtx,
      counter,
      feasibility,
      isCandidate,
    };
  });
}

// --- Phase 3: Feasibility Engine ---

function buildFeasibility(snapshot, zoneId) {
  const counter = snapshot.counters.find((c) => c.zoneId === zoneId);
  if (!counter) {
    return {
      type: "no-counter",
      roleRequired: null,
      staffingGap: 0,
      openCounterCapacity: 0,
      reliefCoverageUnits: 0,
      reliefCandidates: [],
      openLeadMinutes: 0,
      confidence: { score: 0.72, basis: "no counter bank in zone" },
      label: "No counter bank is available; use passenger routing relief",
      counterFeasible: false,
      staffFeasible: false,
      passengerMovementFeasible: true,
      shiftTimingFeasible: false,
    };
  }

  const roleRequired = counter.roleRequired;
  const activeCoverageUnits = sumCoverage(snapshot.staff.filter((s) =>
    s.zoneId === zoneId && s.role === roleRequired && s.availability === "active",
  ));
  const requiredCoverageUnits = counter.open;
  const staffingGap = Math.max(0, requiredCoverageUnits - activeCoverageUnits);
  const openCounterCapacity = Math.max(0, counter.maxOpen - counter.open);

  // Relief candidates: same role, available/active, sufficient rest, transfer rule exists
  const reliefCandidates = snapshot.staff
    .filter((s) => s.zoneId !== zoneId)
    .filter((s) => s.role === roleRequired)
    .filter((s) => s.availability === "available" || s.availability === "active")
    .filter((s) => s.restMinutesDue >= 30)
    .map((s) => {
      const transferRule = findTransferRule(snapshot, s, zoneId);
      // Check origin zone pressure before suggesting move
      const originZone = snapshot.zones.find((z) => z.zoneId === s.zoneId);
      const originPressure = originZone ? originZone.occupancy / originZone.capacity : 0;
      return {
        staffId: s.staffId,
        fromZoneId: s.zoneId,
        coverageUnits: s.coverageUnits,
        transferMinutes: transferRule?.transferMinutes ?? 15,
        hasTransferRule: !!transferRule,
        originPressure,
        confidence: s.confidence,
      };
    })
    .sort((a, b) =>
      a.transferMinutes - b.transferMinutes
      || b.coverageUnits - a.coverageUnits
      || b.confidence.score - a.confidence.score
      || a.originPressure - b.originPressure,
    );

  const reliefCoverageUnits = sumCoverage(reliefCandidates);
  const topCandidate = reliefCandidates[0];

  // Feasibility flags
  const staffFeasible = staffingGap > 0 && reliefCandidates.length > 0;
  const counterFeasible = openCounterCapacity > 0;

  // Passenger movement feasibility: valid paths exist from this zone
  const validPaths = snapshot.airport.paths.filter((path) => path[0] === zoneId);
  const passengerMovementFeasible = validPaths.length > 0;

  // Shift timing feasibility: staff in zone with shift flexibility
  const zoneStaff = snapshot.staff.filter((s) => s.zoneId === zoneId && s.role === roleRequired);
  const shiftTimingFeasible = zoneStaff.some((s) => s.shiftStartsAt && s.shiftEndsAt);

  const label = staffingGap > 0 && topCandidate
    ? `${staffingGap} ${roleRequired} coverage unit(s) short; ${topCandidate.coverageUnits} can move from ${topCandidate.fromZoneId} in ${topCandidate.transferMinutes} min`
    : openCounterCapacity > 0
      ? `${openCounterCapacity} counter(s) can open within ${counter.openLeadMinutes} min using ${roleRequired}`
      : `No spare ${roleRequired} counter capacity in this zone`;

  return {
    type: roleRequired,
    roleRequired,
    staffingGap,
    openCounterCapacity,
    reliefCoverageUnits,
    reliefCandidates,
    openLeadMinutes: counter.openLeadMinutes,
    confidence: counter.confidence,
    label,
    counterFeasible,
    staffFeasible,
    passengerMovementFeasible,
    shiftTimingFeasible,
  };
}

// --- Phase 4: Scenario Impact Evaluator ---

function generateCandidateOptions(candidateZones, request) {
  const { snapshot, forecast, projections } = request;
  const finalForecastPoint = forecast.points[forecast.points.length - 1];
  const options = [];

  for (const ctx of candidateZones) {
    const { zoneId, zone, forecastZone, feasibility, alert, queueState, counterUtil } = ctx;
    if (!forecastZone) continue;

    // Find best matching projection for this zone
    const impactResult = evaluateScenarioImpact(zoneId, forecastZone, projections, snapshot);

    // Skip zones with no measurable improvement from any projection
    if (impactResult.queuePressureDrop <= 0) continue;

    // Generate the appropriate decision type based on priority order
    const decision = chooseDecision(zoneId, impactResult.queuePressureDrop, feasibility, snapshot, forecast);

    options.push({
      zoneId,
      zone,
      forecastZone,
      feasibility,
      alert,
      queueState,
      counterUtil,
      decision,
      impact: impactResult,
    });
  }

  return options;
}

function evaluateScenarioImpact(zoneId, forecastZone, projections, snapshot) {
  let bestPressureDrop = 0;
  let bestPassengersRelieved = 0;
  let bestWaitReduction = 0;

  for (const projection of projections) {
    const finalProjectionPoint = projection.points[projection.points.length - 1];
    if (!finalProjectionPoint) continue;

    const projectedZone = finalProjectionPoint.zones.find((z) => z.zoneId === zoneId);
    if (!projectedZone) continue;

    const pressureDrop = Number((forecastZone.queuePressure - projectedZone.queuePressure).toFixed(2));
    const passengersRelieved = Math.max(0, forecastZone.expectedOccupancy - projectedZone.expectedOccupancy);

    // Estimate wait reduction from pressure drop and service rate
    const zoneState = snapshot.zones.find((z) => z.zoneId === zoneId);
    const serviceRate = zoneState?.serviceRatePerMinute ?? 30;
    const waitReduction = pressureDrop > 0
      ? Math.max(1, Math.round(passengersRelieved / serviceRate))
      : 0;

    if (pressureDrop > bestPressureDrop) {
      bestPressureDrop = pressureDrop;
      bestPassengersRelieved = passengersRelieved;
      bestWaitReduction = waitReduction;
    }
  }

  return {
    queuePressureDrop: bestPressureDrop,
    passengersRelieved: bestPassengersRelieved,
    estimatedWaitMinutesReduced: bestWaitReduction,
  };
}

function chooseDecision(zoneId, pressureDrop, feasibility, snapshot, forecast) {
  // Priority 1: Staff reassignment when staffing gap blocks relief and valid staff can move
  if (feasibility.staffFeasible) {
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

  // Priority 2: Counter capacity when counters can open and staff coverage exists
  if (feasibility.counterFeasible) {
    return {
      type: "counter-capacity",
      zoneId,
      openDelta: Math.min(2, feasibility.openCounterCapacity),
      roleRequired: feasibility.roleRequired,
      openLeadMinutes: feasibility.openLeadMinutes,
      pressureDrop,
    };
  }

  // Priority 3: Passenger movement when staff/counter relief not feasible
  if (feasibility.passengerMovementFeasible) {
    const validPath = snapshot.airport.paths.find((path) => path[0] === zoneId);
    const toZoneId = validPath ? validPath[1] : "nearest-valid-zone";
    // Check destination zone can absorb load
    const destZone = snapshot.zones.find((z) => z.zoneId === toZoneId);
    const destCapacity = destZone ? destZone.capacity - destZone.occupancy : 40;
    const passengers = Math.min(40, Math.max(10, destCapacity));
    return {
      type: "passenger-movement",
      fromZoneId: zoneId,
      toZoneId,
      passengers,
      pressureDrop,
    };
  }

  // Priority 4: Shift timing when pressure is forecast but not yet critical
  if (feasibility.shiftTimingFeasible) {
    return {
      type: "shift-timing",
      role: feasibility.roleRequired,
      zoneId,
      startDeltaMinutes: -15,
      endDeltaMinutes: 0,
      pressureDrop,
    };
  }

  // Fallback: passenger movement with generic target
  return {
    type: "passenger-movement",
    fromZoneId: zoneId,
    toZoneId: "nearest-valid-zone",
    passengers: 40,
    pressureDrop,
  };
}

// --- Phase 5: Scoring, Ranking, and Rationale ---

function scoreAndRank(candidateOptions, request) {
  const { forecast } = request;

  const scored = candidateOptions.map((candidate, index) => {
    const { zoneId, zone, forecastZone, feasibility, alert, decision, impact } = candidate;

    // Calculate scoring components
    const impactScore = calculateImpactScore(impact);
    const urgencyScore = calculateUrgencyScore(alert, forecastZone);
    const feasibilityScore = calculateFeasibilityScore(feasibility, decision);
    const confidenceScore = calculateConfidenceScore(candidate, request);
    const riskPenalty = calculateRiskPenalty(candidate, request);

    const totalScore = impactScore + urgencyScore + feasibilityScore + confidenceScore - riskPenalty;

    return {
      ...candidate,
      score: totalScore,
      impactScore,
      urgencyScore,
      feasibilityScore,
      confidenceScore: confidenceScore,
      riskPenalty,
    };
  });

  // Sort by score descending, then pressure drop, then severity, then optionId
  scored.sort((a, b) =>
    b.score - a.score
    || b.impact.queuePressureDrop - a.impact.queuePressureDrop
    || severityWeight(b.alert?.severity) - severityWeight(a.alert?.severity)
    || a.zoneId.localeCompare(b.zoneId),
  );

  // Build final DecisionOption output
  return scored.map((candidate, rank) => {
    const optionId = buildOptionId(candidate.decision, candidate.zoneId, rank);
    const confidence = buildConfidence(candidate, request);
    const rationale = buildRationale(candidate, request);

    return {
      optionId,
      rank: rank + 1,
      relatedAlertId: candidate.alert?.alertId ?? null,
      decision: candidate.decision,
      affectedZones: [candidate.zoneId],
      timeWindow: forecast.horizon,
      expectedImpact: {
        queuePressureDrop: candidate.impact.queuePressureDrop,
        passengersRelieved: candidate.impact.passengersRelieved,
        estimatedWaitMinutesReduced: candidate.impact.estimatedWaitMinutesReduced,
        staffingGap: candidate.feasibility.staffingGap,
        openCounterCapacity: candidate.feasibility.openCounterCapacity,
        reliefCoverageUnits: candidate.feasibility.reliefCoverageUnits,
        label: `${candidate.zone.label}: ${Math.max(0, Math.round(candidate.impact.queuePressureDrop * 100))}% pressure reduction`,
      },
      rationale,
      confidence,
    };
  });
}

function calculateImpactScore(impact) {
  // Normalize pressure drop to 0-40 scale
  const pressureScore = Math.min(40, impact.queuePressureDrop * 100);
  // Passengers relieved: 0-30 scale
  const passengerScore = Math.min(30, impact.passengersRelieved / 10);
  // Wait reduction: 0-30 scale
  const waitScore = Math.min(30, impact.estimatedWaitMinutesReduced * 5);
  return pressureScore + passengerScore + waitScore;
}

function calculateUrgencyScore(alert, forecastZone) {
  let score = 0;
  if (alert) {
    if (alert.severity === "critical") score += 30;
    else if (alert.severity === "watch") score += 15;
    if (alert.lifecycleState === "new" || alert.lifecycleState === "escalated") score += 10;
  }
  if (forecastZone) {
    if (forecastZone.queuePressure >= 0.9) score += 20;
    else if (forecastZone.queuePressure >= 0.8) score += 10;
  }
  return score;
}

function calculateFeasibilityScore(feasibility, decision) {
  let score = 0;
  if (decision.type === "staff-reassignment") {
    // Higher when transfer is fast and candidate has a real transfer rule
    const candidate = feasibility.reliefCandidates[0];
    if (candidate) {
      score += candidate.hasTransferRule ? 20 : 5;
      score += Math.max(0, 15 - candidate.transferMinutes);
    }
  } else if (decision.type === "counter-capacity") {
    score += Math.min(20, feasibility.openCounterCapacity * 5);
    score += Math.max(0, 15 - feasibility.openLeadMinutes);
  } else if (decision.type === "passenger-movement") {
    score += 10; // Base feasibility for movement
  } else if (decision.type === "shift-timing") {
    score += 8; // Lower feasibility since it's future-oriented
  }
  return score;
}

function calculateConfidenceScore(candidate, request) {
  const { forecast } = request;
  const scores = [
    forecast.confidence.score,
    candidate.feasibility.confidence.score,
  ];
  if (candidate.alert) scores.push(candidate.alert.confidence.score);
  const minConfidence = Math.min(...scores);
  return minConfidence * 20; // Scale to 0-20
}

function calculateRiskPenalty(candidate, request) {
  let penalty = 0;
  const { feasibility, zone } = candidate;

  // Stale data penalty
  if (zone.freshness?.status === "stale") penalty += 10;
  if (zone.freshness?.status === "watch") penalty += 3;

  // Origin zone pressure penalty for staff reassignment
  if (candidate.decision.type === "staff-reassignment" && feasibility.reliefCandidates[0]) {
    const originPressure = feasibility.reliefCandidates[0].originPressure;
    if (originPressure >= 0.8) penalty += 15;
    else if (originPressure >= 0.6) penalty += 5;
  }

  // Missing transfer rule penalty
  if (candidate.decision.type === "staff-reassignment" && feasibility.reliefCandidates[0] && !feasibility.reliefCandidates[0].hasTransferRule) {
    penalty += 8;
  }

  return penalty;
}

function severityWeight(severity) {
  if (severity === "critical") return 2;
  if (severity === "watch") return 1;
  return 0;
}

function buildOptionId(decision, zoneId, rank) {
  return `option-${decision.type}-${zoneId}-${rank + 1}`;
}

function buildConfidence(candidate, request) {
  const { forecast } = request;
  const scores = [forecast.confidence.score];
  const bases = [];

  // Collect all relevant confidence inputs
  if (candidate.alert) {
    scores.push(candidate.alert.confidence.score);
  }

  scores.push(candidate.feasibility.confidence.score);

  // Find weakest confidence from projections
  for (const projection of request.projections) {
    scores.push(projection.confidence.score);
  }

  const minScore = Math.min(...scores);

  // Apply reductions
  let adjustedScore = minScore;
  if (candidate.zone.freshness?.status === "stale") {
    adjustedScore *= 0.85;
    bases.push("stale observations reduce trust");
  }
  if (candidate.zone.freshness?.status === "watch") {
    adjustedScore *= 0.95;
  }

  // Determine limiting factor
  let limitingFactor = "forecast confidence";
  if (candidate.alert && candidate.alert.confidence.score === minScore) {
    limitingFactor = "alert confidence";
  } else if (candidate.feasibility.confidence.score === minScore) {
    limitingFactor = "counter and roster confidence";
  }
  for (const projection of request.projections) {
    if (projection.confidence.score === minScore) {
      limitingFactor = "scenario projection confidence";
    }
  }

  const basisParts = [`limited by ${limitingFactor}`, ...bases];

  return {
    score: Number(adjustedScore.toFixed(2)),
    basis: basisParts.join("; "),
  };
}

function buildRationale(candidate, request) {
  const { zone, forecastZone, feasibility, alert, impact } = candidate;
  const rationale = [];

  // Triggering alert
  if (alert) {
    rationale.push({ label: `Triggered by ${alert.type} alert ${alert.alertId} (${alert.severity})` });
  }

  // Forecast pressure
  if (forecastZone) {
    rationale.push({ label: `${zone.label} is forecast at ${(forecastZone.queuePressure * 100).toFixed(0)}% queue pressure within the horizon` });
  }

  // Queue state from monitoring (if provided)
  const queueState = candidate.queueState;
  if (queueState) {
    rationale.push({ label: `Queue length: ${queueState.queueLength} passengers, ${queueState.estimatedWaitMinutes} min estimated wait` });
  }

  // Counter utilization (if provided)
  const counterUtil = candidate.counterUtil;
  if (counterUtil) {
    rationale.push({ label: `Counter utilization: ${Math.round(counterUtil.utilizationRatio * 100)}% (${counterUtil.status})` });
  }

  // Feasibility detail
  rationale.push({ label: feasibility.label });

  // Scenario impact
  if (impact.queuePressureDrop > 0) {
    rationale.push({ label: "Scenario comparison shows measurable queue-pressure relief" });
  }

  // Freshness caveat
  if (zone.freshness?.status === "stale") {
    rationale.push({ label: "Caution: source observations are stale; confidence is reduced" });
  }

  return rationale;
}

// --- Helpers ---

function findTransferRule(snapshot, staff, toZoneId) {
  return snapshot.airport.transferRules?.find((rule) => (
    rule.allowed
    && rule.role === staff.role
    && rule.fromZoneId === staff.zoneId
    && rule.toZoneId === toZoneId
  ));
}

function sumCoverage(staffLike) {
  return staffLike.reduce((total, item) => total + (item.coverageUnits ?? 0), 0);
}

export const decisionSupportService = new DecisionSupportService();
