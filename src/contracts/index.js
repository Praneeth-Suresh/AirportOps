export const CONNECTION_ORDER = [
  "adapters",
  "operational-state",
  "prediction",
  "monitoring",
  "simulation",
  "decision-support",
  "app-shell",
];

export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

export function cloneContract(value) {
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function assertOperationalSnapshot(snapshot) {
  assertObject(snapshot, "OperationalSnapshot");
  assertString(snapshot.asOf, "OperationalSnapshot.asOf");
  assertArray(snapshot.zones, "OperationalSnapshot.zones");
  assertArray(snapshot.counters, "OperationalSnapshot.counters");
  assertArray(snapshot.staff, "OperationalSnapshot.staff");
  assertArray(snapshot.flights, "OperationalSnapshot.flights");
  assertArray(snapshot.passengerFlows, "OperationalSnapshot.passengerFlows");
  assertArray(snapshot.observations, "OperationalSnapshot.observations");

  const zoneIds = new Set(snapshot.zones.map((zone) => zone.zoneId));
  assertArray(snapshot.airport.paths, "AirportLayout.paths");
  if (snapshot.airport.transferRules) {
    assertArray(snapshot.airport.transferRules, "AirportLayout.transferRules");
  }

  for (const zone of snapshot.zones) {
    assertString(zone.zoneId, "Zone.zoneId");
    assertNumber(zone.occupancy, `${zone.zoneId}.occupancy`);
    assertNumber(zone.capacity, `${zone.zoneId}.capacity`);
    assertConfidence(zone.confidence, `${zone.zoneId}.confidence`);
  }

  for (const flow of snapshot.passengerFlows) {
    if (!zoneIds.has(flow.fromZoneId) || !zoneIds.has(flow.toZoneId)) {
      throw new Error(`PassengerFlow references an unknown zone: ${flow.fromZoneId} -> ${flow.toZoneId}`);
    }
    assertNumber(flow.estimatedCount, "PassengerFlow.estimatedCount");
  }

  for (const counter of snapshot.counters) {
    assertString(counter.counterId, "CounterState.counterId");
    assertString(counter.zoneId, "CounterState.zoneId");
    if (!zoneIds.has(counter.zoneId)) {
      throw new Error(`CounterState ${counter.counterId} references unknown zone: ${counter.zoneId}`);
    }
    assertNumber(counter.open, `${counter.counterId}.open`);
    assertNumber(counter.available, `${counter.counterId}.available`);
    assertNumber(counter.maxOpen, `${counter.counterId}.maxOpen`);
    assertNumber(counter.openLeadMinutes, `${counter.counterId}.openLeadMinutes`);
    assertString(counter.roleRequired, `${counter.counterId}.roleRequired`);
    assertString(counter.observedAt, `${counter.counterId}.observedAt`);
    assertConfidence(counter.confidence, `${counter.counterId}.confidence`);
    if (counter.maxOpen < counter.open) {
      throw new Error(`CounterState ${counter.counterId} maxOpen must cover open counters`);
    }
  }

  for (const staff of snapshot.staff) {
    assertString(staff.staffId, "StaffState.staffId");
    assertString(staff.role, `${staff.staffId}.role`);
    assertString(staff.zoneId, `${staff.staffId}.zoneId`);
    if (!zoneIds.has(staff.zoneId)) {
      throw new Error(`StaffState ${staff.staffId} references unknown zone: ${staff.zoneId}`);
    }
    assertString(staff.availability, `${staff.staffId}.availability`);
    assertNumber(staff.coverageUnits, `${staff.staffId}.coverageUnits`);
    assertNumber(staff.restMinutesDue, `${staff.staffId}.restMinutesDue`);
    assertString(staff.observedAt, `${staff.staffId}.observedAt`);
    assertConfidence(staff.confidence, `${staff.staffId}.confidence`);
  }

  for (const rule of snapshot.airport.transferRules ?? []) {
    assertString(rule.role, "TransferRule.role");
    assertString(rule.fromZoneId, "TransferRule.fromZoneId");
    assertString(rule.toZoneId, "TransferRule.toZoneId");
    assertNumber(rule.transferMinutes, "TransferRule.transferMinutes");
    if (!zoneIds.has(rule.fromZoneId) || !zoneIds.has(rule.toZoneId)) {
      throw new Error(`TransferRule references an unknown zone: ${rule.fromZoneId} -> ${rule.toZoneId}`);
    }
  }
}

export function assertFlowForecast(forecast) {
  assertObject(forecast, "FlowForecast");
  assertString(forecast.generatedAt, "FlowForecast.generatedAt");
  assertNumber(forecast.refreshCadenceSeconds, "FlowForecast.refreshCadenceSeconds");
  assertObject(forecast.horizon, "FlowForecast.horizon");
  assertArray(forecast.points, "FlowForecast.points");
  assertConfidence(forecast.confidence, "FlowForecast.confidence");
}

export function assertScenarioProjection(projection) {
  assertObject(projection, "ScenarioProjection");
  assertString(projection.scenarioId, "ScenarioProjection.scenarioId");
  assertArray(projection.decisions, "ScenarioProjection.decisions");
  assertArray(projection.points, "ScenarioProjection.points");
  assertArray(projection.deltaFromBaseline, "ScenarioProjection.deltaFromBaseline");
  assertConfidence(projection.confidence, "ScenarioProjection.confidence");
}

export function assertDecisionOptions(options) {
  assertArray(options, "DecisionOption[]");
  for (const option of options) {
    assertString(option.optionId, "DecisionOption.optionId");
    assertNumber(option.rank, "DecisionOption.rank");
    assertObject(option.decision, "DecisionOption.decision");
    assertString(option.decision.type, "DecisionOption.decision.type");
    assertArray(option.affectedZones, "DecisionOption.affectedZones");
    assertObject(option.timeWindow, "DecisionOption.timeWindow");
    assertObject(option.expectedImpact, "DecisionOption.expectedImpact");
    assertNumber(option.expectedImpact.queuePressureDrop, "DecisionOption.expectedImpact.queuePressureDrop");
    assertNumber(option.expectedImpact.passengersRelieved, "DecisionOption.expectedImpact.passengersRelieved");
    assertNumber(option.expectedImpact.estimatedWaitMinutesReduced, "DecisionOption.expectedImpact.estimatedWaitMinutesReduced");
    assertString(option.expectedImpact.label, "DecisionOption.expectedImpact.label");
    assertArray(option.rationale, "DecisionOption.rationale");
    assertConfidence(option.confidence, "DecisionOption.confidence");
    assertString(option.confidence.basis, "DecisionOption.confidence.basis");
    if (option.relatedAlertId !== undefined && option.relatedAlertId !== null) {
      assertString(option.relatedAlertId, "DecisionOption.relatedAlertId");
    }
  }
}

export function assertDecisionSupportRequest(request) {
  assertObject(request, "DecisionSupportRequest");
  assertObject(request.snapshot, "DecisionSupportRequest.snapshot");
  assertObject(request.forecast, "DecisionSupportRequest.forecast");
  if (request.projections !== undefined) {
    assertArray(request.projections, "DecisionSupportRequest.projections");
  }
  if (request.operationalAlerts !== undefined) {
    assertArray(request.operationalAlerts, "DecisionSupportRequest.operationalAlerts");
  }
  if (request.queueStates !== undefined) {
    assertArray(request.queueStates, "DecisionSupportRequest.queueStates");
  }
  if (request.counterUtilizations !== undefined) {
    assertArray(request.counterUtilizations, "DecisionSupportRequest.counterUtilizations");
  }
  if (request.staffingContexts !== undefined) {
    assertArray(request.staffingContexts, "DecisionSupportRequest.staffingContexts");
  }
}

export function assertMonitoringAnalytics(analytics) {
  assertObject(analytics, "MonitoringAnalytics");
  assertString(analytics.generatedAt, "MonitoringAnalytics.generatedAt");
  assertArray(analytics.queueStates, "MonitoringAnalytics.queueStates");
  assertArray(analytics.counterUtilizations, "MonitoringAnalytics.counterUtilizations");
  assertArray(analytics.staffingContexts, "MonitoringAnalytics.staffingContexts");
  assertArray(analytics.crowdingEvents, "MonitoringAnalytics.crowdingEvents");
  assertArray(analytics.operationalAlerts, "MonitoringAnalytics.operationalAlerts");

  for (const queue of analytics.queueStates) {
    assertString(queue.zoneId, "QueueState.zoneId");
    assertNumber(queue.queueLength, "QueueState.queueLength");
    assertNumber(queue.estimatedWaitMinutes, "QueueState.estimatedWaitMinutes");
    assertNumber(queue.serviceRatePerMinute, "QueueState.serviceRatePerMinute");
    assertString(queue.observedAt, "QueueState.observedAt");
    assertConfidence(queue.confidence, "QueueState.confidence");
  }

  for (const utilization of analytics.counterUtilizations) {
    assertString(utilization.zoneId, "CounterUtilization.zoneId");
    assertNumber(utilization.openCounters, "CounterUtilization.openCounters");
    assertNumber(utilization.availableCounters, "CounterUtilization.availableCounters");
    assertNumber(utilization.utilizationRatio, "CounterUtilization.utilizationRatio");
    assertString(utilization.status, "CounterUtilization.status");
    assertConfidence(utilization.confidence, "CounterUtilization.confidence");
  }

  for (const context of analytics.staffingContexts) {
    assertString(context.zoneId, "StaffingContext.zoneId");
    assertString(context.roleRequired, "StaffingContext.roleRequired");
    assertNumber(context.activeCoverageUnits, "StaffingContext.activeCoverageUnits");
    assertNumber(context.requiredCoverageUnits, "StaffingContext.requiredCoverageUnits");
    assertNumber(context.staffingGap, "StaffingContext.staffingGap");
    assertArray(context.reliefCandidates, "StaffingContext.reliefCandidates");
    assertConfidence(context.confidence, "StaffingContext.confidence");
  }

  for (const event of analytics.crowdingEvents) {
    assertString(event.eventId, "CrowdingEvent.eventId");
    assertString(event.zoneId, "CrowdingEvent.zoneId");
    assertString(event.severity, "CrowdingEvent.severity");
    assertString(event.detectedAt, "CrowdingEvent.detectedAt");
    assertConfidence(event.confidence, "CrowdingEvent.confidence");
  }

  for (const alert of analytics.operationalAlerts) {
    assertString(alert.alertId, "OperationalAlert.alertId");
    assertString(alert.zoneId, "OperationalAlert.zoneId");
    assertString(alert.type, "OperationalAlert.type");
    assertString(alert.severity, "OperationalAlert.severity");
    assertString(alert.lifecycleState, "OperationalAlert.lifecycleState");
    assertString(alert.message, "OperationalAlert.message");
    assertConfidence(alert.confidence, "OperationalAlert.confidence");
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertNumber(value, label) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${label} must be a valid number`);
  }
}

function assertConfidence(value, label) {
  assertObject(value, label);
  assertNumber(value.score, `${label}.score`);
  if (value.score < 0 || value.score > 1) {
    throw new Error(`${label}.score must be between 0 and 1`);
  }
}
