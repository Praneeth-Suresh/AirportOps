const STATUS_RANK = { normal: 0, watch: 1, critical: 2 };

export const CCTV_CAMERAS = [
  {
    cameraId: "cam-checkin-east-01",
    label: "Check-in East",
    floor: "Departures",
    lens: "PTZ-12 4K wide",
    source: "camera-aggregate",
    edge: true,
    zoneIds: ["check-in-a", "bag-drop-a"],
  },
  {
    cameraId: "cam-checkin-west-02",
    label: "Check-in West",
    floor: "Departures",
    lens: "Fixed 1080p wide",
    source: "camera-aggregate",
    zoneIds: ["check-in-b", "departure-hall"],
  },
  {
    cameraId: "cam-entrance-01",
    label: "Landside Entrance",
    floor: "Departures",
    lens: "Dual entrance overview",
    source: "camera-aggregate",
    zoneIds: ["terminal-entrance-east", "terminal-entrance-west"],
  },
  {
    cameraId: "cam-security-01",
    label: "Security Screening",
    floor: "Departures",
    lens: "Queue corridor overhead",
    source: "edge-queue-analytics",
    zoneIds: ["security-north", "transfer-corridor", "security-south"],
  },
  {
    cameraId: "cam-gates-dep-01",
    label: "Departure Gates",
    floor: "Departures",
    lens: "Concourse overview",
    source: "camera-aggregate",
    zoneIds: ["departure-gate-a", "departure-gate-b", "departure-gate-c", "departure-gate-d"],
  },
  {
    cameraId: "cam-immigration-01",
    label: "Immigration Hall",
    floor: "Arrivals",
    lens: "Officer bank overview",
    source: "camera-aggregate",
    zoneIds: ["immigration-east", "immigration-west"],
  },
  {
    cameraId: "cam-baggage-01",
    label: "Baggage Reclaim",
    floor: "Arrivals",
    lens: "Carousel hall wide",
    source: "camera-aggregate",
    zoneIds: ["baggage-hall", "baggage-reclaim-north", "baggage-reclaim-south"],
  },
  {
    cameraId: "cam-customs-01",
    label: "Customs",
    floor: "Arrivals",
    lens: "Exit lane overhead",
    source: "camera-aggregate",
    zoneIds: ["customs-hall"],
  },
  {
    cameraId: "cam-arrivals-01",
    label: "Arrivals Hall",
    floor: "Arrivals",
    lens: "Meet-and-greet overview",
    source: "camera-aggregate",
    zoneIds: ["arrival-gate-a", "arrival-gate-b", "arrivals-hall"],
  },
];

export function camerasForView(mapZones, options = {}) {
  const dataSource = options.dataSource ?? "fixtures";
  const byId = new Map(mapZones.map((zone) => [zone.zoneId, zone]));
  return CCTV_CAMERAS.map((camera) => buildCameraView(camera, byId, dataSource)).filter(Boolean);
}

export function cameraForId(mapZones, cameraId, options = {}) {
  return camerasForView(mapZones, options).find((camera) => camera.cameraId === cameraId) ?? null;
}

function buildCameraView(camera, zoneById, dataSource) {
  const zones = camera.zoneIds.map((zoneId) => zoneById.get(zoneId)).filter(Boolean);
  if (zones.length === 0) return null;

  const peopleInView = zones.reduce((total, zone) => total + zone.occupancy, 0);
  const worst = zones.reduce(
    (currentWorst, zone) => (STATUS_RANK[zone.status] > STATUS_RANK[currentWorst.status] ? zone : currentWorst),
    zones[0],
  );
  const allFresh = zones.every((zone) => zone.freshness.status === "fresh");
  const insight = buildCameraInsight(zones);

  return {
    ...camera,
    zones,
    peopleInView,
    color: worst.color,
    status: worst.status,
    allFresh,
    isEdgeLive: camera.edge && dataSource.startsWith("edge"),
    detectionBoxes: buildDetectionBoxes(camera, zones),
    insight,
  };
}

function buildCameraInsight(zones) {
  const counterZones = zones.filter((zone) => zone.utilization);
  const openCounters = counterZones.reduce((total, zone) => total + zone.utilization.openCounters, 0);
  const busyCounters = counterZones.reduce((total, zone) => total + zone.utilization.busyCounters, 0);
  const queueLength = zones.reduce((total, zone) => total + zone.queueLength, 0);
  const maxWait = zones.reduce((max, zone) => Math.max(max, zone.wait), 0);
  const density = weightedAverage(zones, "density", "occupancy");
  const serviceLoadPerMinute = zones.reduce(
    (total, zone) => total + (zone.serviceRatePerMinute ?? zone.utilization?.busyCounters ?? 0),
    0,
  );
  const confidenceScore = Math.min(...zones.map((zone) => zone.confidence.score));
  const freshness = zones.some((zone) => zone.freshness.status === "stale")
    ? "stale"
    : zones.some((zone) => zone.freshness.status === "watch")
      ? "watch"
      : "fresh";

  return {
    occupancy: zones.reduce((total, zone) => total + zone.occupancy, 0),
    capacity: zones.reduce((total, zone) => total + zone.capacity, 0),
    queueLength,
    estimatedWaitMinutes: maxWait,
    densityPerSquareMeter: Number(density.toFixed(1)),
    activeServiceLoadPerMinute: Number(serviceLoadPerMinute.toFixed(1)),
    busyCounters,
    openCounters,
    counterUtilization: openCounters > 0 ? Number((busyCounters / openCounters).toFixed(2)) : null,
    freshness,
    confidence: {
      score: Number(confidenceScore.toFixed(2)),
      basis: "lowest confidence across covered camera zones",
    },
  };
}

function weightedAverage(items, valueKey, weightKey) {
  const totalWeight = items.reduce((total, item) => total + Math.max(1, item[weightKey] ?? 0), 0);
  if (totalWeight === 0) return 0;
  return items.reduce((total, item) => total + (item[valueKey] ?? 0) * Math.max(1, item[weightKey] ?? 0), 0) / totalWeight;
}

function buildDetectionBoxes(camera, zones) {
  const zoneBoxes = zones.flatMap((zone, zoneIndex) => {
    const count = Math.max(2, Math.min(8, Math.round(zone.occupancy / 115)));
    return Array.from({ length: count }, (_, index) => {
      const seed = stableSeed(`${camera.cameraId}:${zone.zoneId}:${index}`);
      const column = index % 4;
      const row = Math.floor(index / 4);
      const left = 7 + column * 22 + normalized(seed, 0) * 7 + zoneIndex * 2;
      const top = 18 + row * 27 + normalized(seed, 1) * 8 + zoneIndex * 5;
      const width = 7 + normalized(seed, 2) * 5;
      const height = 17 + normalized(seed, 3) * 7;
      const confidence = 0.78 + normalized(seed, 4) * 0.18;
      return {
        detectionId: `${zone.zoneId}-pax-${String(index + 1).padStart(2, "0")}`,
        zoneId: zone.zoneId,
        label: "person",
        left: Number(Math.min(90, left).toFixed(1)),
        top: Number(Math.min(82, top).toFixed(1)),
        width: Number(width.toFixed(1)),
        height: Number(height.toFixed(1)),
        confidence: Number(confidence.toFixed(2)),
      };
    });
  });
  return zoneBoxes.slice(0, 18);
}

function stableSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalized(seed, offset) {
  const next = Math.sin((seed + offset * 1013) * 12.9898) * 43758.5453;
  return next - Math.floor(next);
}
