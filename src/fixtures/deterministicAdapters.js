export function createFixtureSnapshot(step = 1) {
  const snapshots = createFixtureSnapshotSeries();
  return snapshots[Math.min(Math.max(step, 0), snapshots.length - 1)];
}

export function createFixtureSnapshotSeries() {
  return [createSnapshotVariant("normal"), createSnapshotVariant("peak"), createSnapshotVariant("stale")];
}

export function createEdgeAnalyticsObservationAdapter(rawObservation) {
  return {
    source: "edge-queue-analytics",
    observedAt: rawObservation.observedAt,
    confidence: rawObservation.confidence,
    metrics: rawObservation.metrics.map((metric) => ({
      zoneId: metric.zoneId,
      queueLength: metric.queueLength,
      densityPerSquareMeter: metric.densityPerSquareMeter,
      activeServiceLoadPerMinute: metric.activeServiceLoadPerMinute,
      busyCounters: metric.busyCounters,
    })),
  };
}

function createSnapshotVariant(variant) {
  const variantConfig = {
    normal: {
      asOf: "2026-07-11T09:10:00+07:00",
      checkInOccupancy: 360,
      bagDropOccupancy: 180,
      checkInQueueLength: 54,
      bagDropQueueLength: 18,
      checkInDensity: 1.6,
      bagDropDensity: 1.1,
      checkInBusyCounters: 5,
      bagDropBusyCounters: 2,
      observedAt: "2026-07-11T09:09:00+07:00",
      freshnessStatus: "fresh",
      confidenceScore: 0.9,
    },
    peak: {
      asOf: "2026-07-11T09:20:00+07:00",
      checkInOccupancy: 720,
      bagDropOccupancy: 310,
      checkInQueueLength: 138,
      bagDropQueueLength: 46,
      checkInDensity: 3.2,
      bagDropDensity: 1.9,
      checkInBusyCounters: 6,
      bagDropBusyCounters: 3,
      observedAt: "2026-07-11T09:19:00+07:00",
      freshnessStatus: "fresh",
      confidenceScore: 0.88,
    },
    stale: {
      asOf: "2026-07-11T09:30:00+07:00",
      checkInOccupancy: 730,
      bagDropOccupancy: 330,
      checkInQueueLength: 142,
      bagDropQueueLength: 52,
      checkInDensity: 3.3,
      bagDropDensity: 2.1,
      checkInBusyCounters: 6,
      bagDropBusyCounters: 4,
      observedAt: "2026-07-11T09:18:00+07:00",
      freshnessStatus: "stale",
      confidenceScore: 0.62,
    },
  }[variant];

  return {
    asOf: variantConfig.asOf,
    airport: {
      airportId: "BKK",
      name: "Suvarnabhumi Operations Model",
      mapVersion: "fixture-2026-07-11",
      paths: [
        ["arrival-gate-a", "immigration-east"],
        ["immigration-east", "baggage-hall"],
        ["terminal-entrance-east", "check-in-a"],
        ["check-in-a", "bag-drop-a"],
        ["bag-drop-a", "security-north"],
        ["departure-hall", "security-north"],
        ["security-north", "departure-gate-c"],
      ],
      transferRules: [
        { role: "ground-staff", fromZoneId: "departure-hall", toZoneId: "check-in-a", transferMinutes: 7, allowed: true },
        { role: "ground-staff", fromZoneId: "bag-drop-a", toZoneId: "check-in-a", transferMinutes: 4, allowed: true },
        { role: "immigration-officer", fromZoneId: "arrival-gate-a", toZoneId: "immigration-east", transferMinutes: 6, allowed: true },
        { role: "security", fromZoneId: "departure-hall", toZoneId: "security-north", transferMinutes: 8, allowed: true },
      ],
    },
    zones: [
      {
        zoneId: "terminal-entrance-east",
        label: "Terminal Entrance East",
        type: "entrance",
        occupancy: 190,
        capacity: 520,
        serviceRatePerMinute: 32,
        confidence: { score: 0.88, basis: "entrance camera aggregate" },
        freshness: { observedAt: variantConfig.observedAt, status: variantConfig.freshnessStatus },
      },
      {
        zoneId: "check-in-a",
        label: "Check-in A",
        type: "check-in",
        occupancy: variantConfig.checkInOccupancy,
        capacity: 760,
        serviceRatePerMinute: 36,
        confidence: { score: variantConfig.confidenceScore, basis: "edge queue analytics and counter activity" },
        freshness: { observedAt: variantConfig.observedAt, status: variantConfig.freshnessStatus },
      },
      {
        zoneId: "bag-drop-a",
        label: "Bag Drop A",
        type: "check-in",
        occupancy: variantConfig.bagDropOccupancy,
        capacity: 420,
        serviceRatePerMinute: 24,
        confidence: { score: Number((variantConfig.confidenceScore - 0.03).toFixed(2)), basis: "edge queue analytics" },
        freshness: { observedAt: variantConfig.observedAt, status: variantConfig.freshnessStatus },
      },
      {
        zoneId: "arrival-gate-a",
        label: "Arrival Gate A",
        type: "arrival",
        occupancy: 420,
        capacity: 620,
        serviceRatePerMinute: 34,
        confidence: { score: 0.91, basis: "gate counters and flight load" },
        freshness: { observedAt: "2026-07-11T09:18:00+07:00", status: "fresh" },
      },
      {
        zoneId: "immigration-east",
        label: "Immigration East",
        type: "immigration",
        occupancy: 690,
        capacity: 720,
        serviceRatePerMinute: 22,
        confidence: { score: 0.86, basis: "camera aggregate and officer roster" },
        freshness: { observedAt: "2026-07-11T09:17:00+07:00", status: "fresh" },
      },
      {
        zoneId: "baggage-hall",
        label: "Baggage Hall",
        type: "arrival",
        occupancy: 310,
        capacity: 760,
        serviceRatePerMinute: 28,
        confidence: { score: 0.78, basis: "floor-plate aggregate" },
        freshness: { observedAt: "2026-07-11T09:11:00+07:00", status: "watch" },
      },
      {
        zoneId: "departure-hall",
        label: "Departure Hall",
        type: "departure",
        occupancy: 540,
        capacity: 900,
        serviceRatePerMinute: 40,
        confidence: { score: 0.88, basis: "entrance cameras and schedule" },
        freshness: { observedAt: "2026-07-11T09:19:00+07:00", status: "fresh" },
      },
      {
        zoneId: "security-north",
        label: "Security North",
        type: "security",
        occupancy: 610,
        capacity: 650,
        serviceRatePerMinute: 25,
        confidence: { score: 0.83, basis: "security queue camera aggregate" },
        freshness: { observedAt: "2026-07-11T09:13:00+07:00", status: "watch" },
      },
      {
        zoneId: "departure-gate-c",
        label: "Departure Gate C",
        type: "departure",
        occupancy: 260,
        capacity: 680,
        serviceRatePerMinute: 32,
        confidence: { score: 0.8, basis: "boarding area counter" },
        freshness: { observedAt: "2026-07-11T09:18:00+07:00", status: "fresh" },
      },
    ],
    counters: [
      createCounterState("chk-a-01", "check-in-a", 6, 10, "ground-staff", variantConfig.observedAt, variantConfig.confidenceScore, 6),
      createCounterState("bag-a-01", "bag-drop-a", 4, 6, "ground-staff", variantConfig.observedAt, variantConfig.confidenceScore - 0.03, 8),
      createCounterState("imm-e-01", "immigration-east", 9, 12, "immigration-officer", "2026-07-11T09:17:00+07:00", 0.86, 10),
      createCounterState("sec-n-01", "security-north", 7, 10, "security", "2026-07-11T09:13:00+07:00", 0.83, 12),
      createCounterState("dep-h-01", "departure-hall", 8, 14, "ground-staff", "2026-07-11T09:19:00+07:00", 0.88, 10),
    ],
    staff: [
      createStaffState("io-12", "immigration-officer", "immigration-east", "active", 8, 40, "2026-07-11T09:16:00+07:00", 0.9),
      createStaffState("io-18", "immigration-officer", "arrival-gate-a", "available", 3, 75, "2026-07-11T09:16:00+07:00", 0.9),
      createStaffState("sec-04", "security", "security-north", "active", 6, 55, "2026-07-11T09:14:00+07:00", 0.88),
      createStaffState("sec-09", "security", "departure-hall", "available", 2, 90, "2026-07-11T09:14:00+07:00", 0.88),
      createStaffState("ops-21", "ground-staff", "departure-hall", "available", 4, 120, "2026-07-11T09:15:00+07:00", 0.9),
      createStaffState("ops-33", "ground-staff", "check-in-a", "active", 5, 65, variantConfig.observedAt, variantConfig.confidenceScore),
      createStaffState("ops-38", "ground-staff", "bag-drop-a", "active", 3, 85, variantConfig.observedAt, variantConfig.confidenceScore - 0.03),
    ],
    flights: [
      {
        flightId: "AX-417",
        type: "arrival",
        status: "landed",
        estimatedPassengers: 312,
        scheduledAt: "2026-07-11T09:10:00+07:00",
        gateZoneId: "arrival-gate-a",
      },
      {
        flightId: "SQ-981",
        type: "departure",
        status: "boarding-soon",
        estimatedPassengers: 286,
        scheduledAt: "2026-07-11T10:05:00+07:00",
        gateZoneId: "departure-gate-c",
      },
    ],
    passengerFlows: [
      { fromZoneId: "terminal-entrance-east", toZoneId: "check-in-a", intervalMinutes: 15, estimatedCount: variant === "normal" ? 88 : 210 },
      { fromZoneId: "check-in-a", toZoneId: "bag-drop-a", intervalMinutes: 15, estimatedCount: variant === "normal" ? 62 : 130 },
      { fromZoneId: "bag-drop-a", toZoneId: "security-north", intervalMinutes: 15, estimatedCount: variant === "normal" ? 48 : 105 },
      { fromZoneId: "arrival-gate-a", toZoneId: "immigration-east", intervalMinutes: 15, estimatedCount: 260 },
      { fromZoneId: "immigration-east", toZoneId: "baggage-hall", intervalMinutes: 15, estimatedCount: 180 },
      { fromZoneId: "departure-hall", toZoneId: "security-north", intervalMinutes: 15, estimatedCount: 230 },
      { fromZoneId: "security-north", toZoneId: "departure-gate-c", intervalMinutes: 15, estimatedCount: 160 },
    ],
    observations: [
      createEdgeAnalyticsObservationAdapter({
        observedAt: variantConfig.observedAt,
        confidence: { score: variantConfig.confidenceScore, basis: "deterministic edge analytics fixture" },
        metrics: [
          {
            zoneId: "check-in-a",
            queueLength: variantConfig.checkInQueueLength,
            densityPerSquareMeter: variantConfig.checkInDensity,
            activeServiceLoadPerMinute: 34,
            busyCounters: variantConfig.checkInBusyCounters,
          },
          {
            zoneId: "bag-drop-a",
            queueLength: variantConfig.bagDropQueueLength,
            densityPerSquareMeter: variantConfig.bagDropDensity,
            activeServiceLoadPerMinute: 20,
            busyCounters: variantConfig.bagDropBusyCounters,
          },
        ],
      }),
      { source: "camera-aggregate", observedAt: "2026-07-11T09:18:00+07:00", confidence: { score: 0.86, basis: "fixture" } },
      { source: "floor-plate", observedAt: "2026-07-11T09:11:00+07:00", confidence: { score: 0.78, basis: "fixture" } },
      { source: "roster", observedAt: "2026-07-11T08:45:00+07:00", confidence: { score: 0.9, basis: "fixture" } },
    ],
  };
}

function createCounterState(counterId, zoneId, open, available, roleRequired, observedAt, confidenceScore, openLeadMinutes) {
  return {
    counterId,
    zoneId,
    open,
    available,
    maxOpen: available,
    openLeadMinutes,
    roleRequired,
    observedAt,
    confidence: {
      score: Number(confidenceScore.toFixed(2)),
      basis: "counter status feed fixture",
    },
  };
}

function createStaffState(staffId, role, zoneId, availability, coverageUnits, restMinutesDue, observedAt, confidenceScore) {
  return {
    staffId,
    role,
    zoneId,
    availability,
    coverageUnits,
    restMinutesDue,
    shiftStartsAt: "2026-07-11T06:00:00+07:00",
    shiftEndsAt: "2026-07-11T14:00:00+07:00",
    observedAt,
    confidence: {
      score: Number(confidenceScore.toFixed(2)),
      basis: "roster feed fixture",
    },
  };
}
