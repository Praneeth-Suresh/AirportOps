import { assertMonitoringAnalytics, deepFreeze } from "../contracts/index.js";

export class MonitoringAnalyticsService {
  analyze(snapshot) {
    const queueStates = snapshot.zones.map((zone) => buildQueueState(snapshot, zone));
    const counterUtilizations = snapshot.counters.map((counter) => buildCounterUtilization(snapshot, counter));
    const staffingContexts = snapshot.counters.map((counter) => buildStaffingContext(snapshot, counter, counterUtilizations));
    const crowdingEvents = queueStates
      .filter((queue) => queue.severity !== "normal")
      .map((queue) => buildCrowdingEvent(snapshot, queue));
    const operationalAlerts = [
      ...crowdingEvents.map((event) => buildCrowdingAlert(snapshot, event, queueStates, counterUtilizations)),
      ...counterUtilizations
        .filter((counter) => counter.status === "overloaded")
        .map((counter) => buildCounterAlert(snapshot, counter)),
      ...queueStates
        .filter((queue) => queue.freshness.status === "stale")
        .map((queue) => buildDataQualityAlert(snapshot, queue)),
    ];

    const analytics = {
      generatedAt: snapshot.asOf,
      refreshCadenceSeconds: 30,
      queueStates,
      counterUtilizations,
      staffingContexts,
      crowdingEvents,
      operationalAlerts: dedupeAlerts(operationalAlerts),
      bottlenecks: queueStates.map((queue) => classifyBottleneck(queue, counterUtilizations)),
    };

    assertMonitoringAnalytics(analytics);
    return deepFreeze(analytics);
  }
}

export class MonitoringViewModel {
  static from(snapshot, forecast) {
    const analytics = monitoringAnalyticsService.analyze(snapshot);
    const currentPoint = forecast.points[0];
    const activeFlight = snapshot.flights.find((flight) => flight.status === "landed") ?? snapshot.flights[0];

    return {
      asOf: snapshot.asOf,
      landingState: activeFlight?.status === "landed" ? "lit-after-landing" : "dark-before-landing",
      activeFlight,
      zones: snapshot.zones.map((zone) => {
        const forecastZone = currentPoint.zones.find((candidate) => candidate.zoneId === zone.zoneId);
        const queueState = analytics.queueStates.find((candidate) => candidate.zoneId === zone.zoneId);
        const counterUtilization = analytics.counterUtilizations.find((candidate) => candidate.zoneId === zone.zoneId);
        const staffingContext = analytics.staffingContexts.find((candidate) => candidate.zoneId === zone.zoneId);
        const bottleneck = analytics.bottlenecks.find((candidate) => candidate.zoneId === zone.zoneId);
        const alert = analytics.operationalAlerts.find((candidate) => candidate.zoneId === zone.zoneId);
        return {
          ...zone,
          queuePressure: forecastZone.queuePressure,
          status: alert?.severity === "critical" ? "critical" : forecastZone.status,
          staffCount: snapshot.staff.filter((staff) => staff.zoneId === zone.zoneId).length,
          queueState,
          counterUtilization,
          staffingContext,
          bottleneck,
          alert,
        };
      }),
      flows: snapshot.passengerFlows,
      staff: snapshot.staff,
      analytics,
    };
  }
}

function buildQueueState(snapshot, zone) {
  const edgeMetric = findEdgeMetric(snapshot, zone.zoneId);
  const queueLength = edgeMetric?.queueLength ?? Math.max(0, Math.round(zone.occupancy - zone.serviceRatePerMinute * 8));
  const serviceRatePerMinute = edgeMetric?.activeServiceLoadPerMinute ?? zone.serviceRatePerMinute;
  const estimatedWaitMinutes = serviceRatePerMinute > 0 ? Math.ceil(queueLength / serviceRatePerMinute) : 0;
  const pressureRatio = zone.capacity > 0 ? zone.occupancy / zone.capacity : 0;
  const density = edgeMetric?.densityPerSquareMeter ?? pressureRatio * 3;
  const severity = queueLength >= 120 || estimatedWaitMinutes >= 5 || density >= 3
    ? "critical"
    : queueLength >= 50 || estimatedWaitMinutes >= 3 || density >= 2
      ? "watch"
      : "normal";

  return {
    zoneId: zone.zoneId,
    queueLength,
    estimatedWaitMinutes,
    serviceRatePerMinute,
    densityPerSquareMeter: Number(density.toFixed(1)),
    observedAt: edgeMetric?.observedAt ?? zone.freshness.observedAt,
    freshness: edgeMetric?.freshness ?? zone.freshness,
    confidence: edgeMetric?.confidence ?? zone.confidence,
    severity,
  };
}

function buildCounterUtilization(snapshot, counter) {
  const edgeMetric = findEdgeMetric(snapshot, counter.zoneId);
  const busyCounters = edgeMetric?.busyCounters ?? Math.min(counter.open, Math.ceil((edgeMetric?.queueLength ?? 0) / 25));
  const utilizationRatio = counter.open > 0 ? Number((busyCounters / counter.open).toFixed(2)) : 0;
  const status = utilizationRatio >= 0.95
    ? "overloaded"
    : utilizationRatio >= 0.8
      ? "saturated"
      : utilizationRatio <= 0.35
        ? "underused"
        : "normal";

  return {
    counterId: counter.counterId,
    zoneId: counter.zoneId,
    openCounters: counter.open,
    availableCounters: counter.available,
    busyCounters,
    utilizationRatio,
    status,
    observedAt: edgeMetric?.observedAt ?? snapshot.asOf,
    freshness: edgeMetric?.freshness ?? { observedAt: snapshot.asOf, status: "watch" },
    confidence: edgeMetric?.confidence ?? { score: 0.72, basis: "derived from counter state" },
  };
}

function buildStaffingContext(snapshot, counter, counterUtilizations) {
  const utilization = counterUtilizations.find((candidate) => candidate.counterId === counter.counterId);
  const activeCoverageUnits = sumCoverage(
    snapshot.staff.filter(
      (staff) => staff.zoneId === counter.zoneId
        && staff.role === counter.roleRequired
        && staff.availability === "active",
    ),
  );
  const requiredCoverageUnits = Math.max(counter.open, utilization?.busyCounters ?? counter.open);
  const reliefCandidates = snapshot.staff
    .filter((staff) => staff.zoneId !== counter.zoneId)
    .filter((staff) => staff.role === counter.roleRequired)
    .filter((staff) => staff.availability === "available" || staff.availability === "active")
    .filter((staff) => staff.restMinutesDue >= 30)
    .map((staff) => {
      const transferRule = findTransferRule(snapshot, staff, counter.zoneId);
      return {
        staffId: staff.staffId,
        fromZoneId: staff.zoneId,
        coverageUnits: staff.coverageUnits,
        availability: staff.availability,
        transferMinutes: transferRule?.transferMinutes ?? 15,
        confidence: staff.confidence,
      };
    })
    .sort((a, b) => a.transferMinutes - b.transferMinutes);
  const reliefCoverageUnits = sumCoverage(reliefCandidates);
  const weakestConfidence = Math.min(
    counter.confidence.score,
    ...snapshot.staff
      .filter((staff) => staff.role === counter.roleRequired)
      .map((staff) => staff.confidence.score),
  );

  return {
    zoneId: counter.zoneId,
    counterId: counter.counterId,
    roleRequired: counter.roleRequired,
    activeCoverageUnits,
    requiredCoverageUnits,
    staffingGap: Math.max(0, requiredCoverageUnits - activeCoverageUnits),
    reliefCoverageUnits,
    reliefCandidates,
    openCounterCapacity: Math.max(0, counter.maxOpen - counter.open),
    openLeadMinutes: counter.openLeadMinutes,
    freshness: { observedAt: counter.observedAt, status: "fresh" },
    confidence: {
      score: Number(weakestConfidence.toFixed(2)),
      basis: "counter and roster confidence",
    },
  };
}

function buildCrowdingEvent(snapshot, queue) {
  return {
    eventId: `crowding-${queue.zoneId}`,
    zoneId: queue.zoneId,
    type: queue.severity === "critical" ? "abnormal-crowding" : "queue-build-up",
    severity: queue.severity,
    threshold: queue.severity === "critical" ? "queue >= 120 or wait >= 5 min" : "queue >= 50 or wait >= 3 min",
    currentMetric: `${queue.queueLength} passengers, ${queue.estimatedWaitMinutes} min wait`,
    detectedAt: queue.observedAt,
    confidence: queue.confidence,
    freshness: queue.freshness,
    recommendedResponse: queue.severity === "critical" ? "Add counters or route passengers to relief zone" : "Monitor and prepare counter relief",
    snapshotAsOf: snapshot.asOf,
  };
}

function buildCrowdingAlert(snapshot, event, queueStates, counterUtilizations) {
  const queue = queueStates.find((candidate) => candidate.zoneId === event.zoneId);
  const utilization = counterUtilizations.find((candidate) => candidate.zoneId === event.zoneId);
  return {
    alertId: `alert-${event.eventId}`,
    zoneId: event.zoneId,
    type: event.type,
    severity: event.severity,
    lifecycleState: event.freshness.status === "stale" ? "stale" : "new",
    message: `${labelForZone(snapshot, event.zoneId)} queue is ${queue.queueLength} passengers with ${queue.estimatedWaitMinutes} min estimated wait`,
    evidence: [
      `${event.currentMetric}`,
      utilization ? `${Math.round(utilization.utilizationRatio * 100)}% counter utilization` : "No counter bank in zone",
    ],
    detectedAt: event.detectedAt,
    confidence: event.confidence,
    freshness: event.freshness,
  };
}

function buildCounterAlert(snapshot, counter) {
  return {
    alertId: `alert-counter-${counter.zoneId}`,
    zoneId: counter.zoneId,
    type: "counter-saturation",
    severity: "critical",
    lifecycleState: counter.freshness.status === "stale" ? "stale" : "new",
    message: `${labelForZone(snapshot, counter.zoneId)} counters are overloaded at ${Math.round(counter.utilizationRatio * 100)}% utilization`,
    evidence: [`${counter.busyCounters}/${counter.openCounters} open counters busy`],
    detectedAt: counter.observedAt,
    confidence: counter.confidence,
    freshness: counter.freshness,
  };
}

function buildDataQualityAlert(snapshot, queue) {
  return {
    alertId: `alert-stale-${queue.zoneId}`,
    zoneId: queue.zoneId,
    type: "sensor-stale",
    severity: "watch",
    lifecycleState: "stale",
    message: `${labelForZone(snapshot, queue.zoneId)} queue analytics are stale`,
    evidence: [`Last edge observation ${queue.observedAt}`],
    detectedAt: snapshot.asOf,
    confidence: { score: Math.min(queue.confidence.score, 0.62), basis: "stale edge analytics" },
    freshness: queue.freshness,
  };
}

function classifyBottleneck(queue, counterUtilizations) {
  const utilization = counterUtilizations.find((candidate) => candidate.zoneId === queue.zoneId);
  const reason = queue.freshness.status === "stale"
    ? "sensor-confidence"
    : utilization?.status === "overloaded"
      ? "counter-utilization"
      : queue.severity === "critical"
        ? "capacity"
        : queue.severity === "watch"
          ? "downstream-flow"
          : "none";

  return {
    zoneId: queue.zoneId,
    reason,
    label: reason === "none" ? "No active bottleneck" : `${reason.replaceAll("-", " ")} bottleneck`,
  };
}

function findEdgeMetric(snapshot, zoneId) {
  const observation = snapshot.observations.find((candidate) => candidate.source === "edge-queue-analytics");
  const metric = observation?.metrics?.find((candidate) => candidate.zoneId === zoneId);
  if (!metric) {
    return undefined;
  }

  const freshness = snapshot.zones.find((zone) => zone.zoneId === zoneId)?.freshness ?? {
    observedAt: observation.observedAt,
    status: "watch",
  };

  return {
    ...metric,
    observedAt: observation.observedAt,
    confidence: observation.confidence,
    freshness,
  };
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

function labelForZone(snapshot, zoneId) {
  return snapshot.zones.find((zone) => zone.zoneId === zoneId)?.label ?? zoneId;
}

function dedupeAlerts(alerts) {
  return [...new Map(alerts.map((alert) => [alert.alertId, alert])).values()];
}

export const monitoringAnalyticsService = new MonitoringAnalyticsService();
