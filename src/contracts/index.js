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
}

export function assertFlowForecast(forecast) {
  assertObject(forecast, "FlowForecast");
  assertString(forecast.generatedAt, "FlowForecast.generatedAt");
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
    assertObject(option.decision, "DecisionOption.decision");
    assertArray(option.affectedZones, "DecisionOption.affectedZones");
    assertObject(option.timeWindow, "DecisionOption.timeWindow");
    assertObject(option.expectedImpact, "DecisionOption.expectedImpact");
    assertArray(option.rationale, "DecisionOption.rationale");
    assertConfidence(option.confidence, "DecisionOption.confidence");
  }
}

export function assertMonitoringAnalytics(analytics) {
  assertObject(analytics, "MonitoringAnalytics");
  assertString(analytics.generatedAt, "MonitoringAnalytics.generatedAt");
  assertArray(analytics.queueStates, "MonitoringAnalytics.queueStates");
  assertArray(analytics.counterUtilizations, "MonitoringAnalytics.counterUtilizations");
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
