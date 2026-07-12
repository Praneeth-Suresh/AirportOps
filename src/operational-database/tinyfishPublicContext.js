import { cloneContract } from "../contracts/index.js";

export const TINYFISH_PUBLIC_CONTEXT_SOURCE = "tinyfish-public-web";

const DEFAULT_CONFIDENCE = {
  score: 0.72,
  basis: "TinyFish browser-rendered public web context",
};

export class TinyFishPublicContextAdapter {
  constructor(updateSource = createFixtureTinyFishPublicUpdates) {
    this.updateSource = updateSource;
  }

  enrichRowsBundle(rowsBundle) {
    const updates = typeof this.updateSource === "function"
      ? this.updateSource(rowsBundle)
      : this.updateSource;
    return enrichRowsBundleWithTinyFishPublicContext(rowsBundle, updates);
  }
}

export function createTinyFishPublicContextAdapter(updateSource) {
  return new TinyFishPublicContextAdapter(updateSource);
}

export function createFixtureTinyFishPublicUpdates(rowsBundle) {
  const snapshotRow = selectPreferredSnapshotRow(rowsBundle);
  if (!snapshotRow) return [];

  return [
    {
      snapshotId: snapshotRow.snapshotId,
      observedAt: "2026-07-11T09:19:30+07:00",
      zoneId: "check-in-a",
      flightId: "SQ-981",
      severity: "watch",
      title: "SQ-981 public gate advisory",
      summary: "Public airline status page reports SQ-981 boarding demand building near Check-in A.",
      url: "https://airline.example.test/status/SQ-981",
      evidence: ["TinyFish read a browser-rendered airline status page updated at 09:19"],
      confidence: {
        score: 0.74,
        basis: "TinyFish browser-rendered public airline page",
      },
    },
  ];
}

export function enrichRowsBundleWithTinyFishPublicContext(rowsBundle, updates = []) {
  assertRowsBundle(rowsBundle);
  const enriched = cloneContract(rowsBundle);
  const normalizedUpdates = updates.map((update, index) => normalizeTinyFishPublicUpdate(update, enriched, index));
  const existingKeys = new Set(
    (enriched.observations ?? []).flatMap((observation) =>
      (observation.publicUpdates ?? []).map((update) => publicUpdateKey(observation.snapshotId, update.updateId)),
    ),
  );
  const observations = normalizedUpdates
    .filter((update) => !existingKeys.has(publicUpdateKey(update.snapshotId, update.updateId)))
    .map((update) => ({
      snapshotId: update.snapshotId,
      source: TINYFISH_PUBLIC_CONTEXT_SOURCE,
      observedAt: update.observedAt,
      confidence: update.confidence,
      publicUpdates: [
        {
          updateId: update.updateId,
          provider: "TinyFish",
          title: update.title,
          summary: update.summary,
          url: update.url,
          zoneId: update.zoneId,
          flightId: update.flightId,
          severity: update.severity,
          evidence: update.evidence,
          freshness: update.freshness,
          confidence: update.confidence,
        },
      ],
    }));

  return {
    ...enriched,
    observations: [...(enriched.observations ?? []), ...observations],
  };
}

export function normalizeTinyFishPublicUpdate(update, rowsBundle, index = 0) {
  assertObject(update, "TinyFishPublicUpdate");
  const snapshotId = update.snapshotId ?? resolveSnapshotId(rowsBundle, update.observedAt);
  assertString(snapshotId, "TinyFishPublicUpdate.snapshotId");
  assertKnownSnapshot(rowsBundle, snapshotId);
  assertString(update.observedAt, "TinyFishPublicUpdate.observedAt");
  assertString(update.zoneId, "TinyFishPublicUpdate.zoneId");
  assertKnownZone(rowsBundle, snapshotId, update.zoneId);
  if (update.flightId !== undefined) {
    assertString(update.flightId, "TinyFishPublicUpdate.flightId");
    assertKnownFlight(rowsBundle, snapshotId, update.flightId);
  }
  assertString(update.title, "TinyFishPublicUpdate.title");
  assertString(update.summary, "TinyFishPublicUpdate.summary");

  const confidence = update.confidence ?? DEFAULT_CONFIDENCE;
  assertConfidence(confidence, "TinyFishPublicUpdate.confidence");

  const severity = update.severity ?? "watch";
  if (!["watch", "critical"].includes(severity)) {
    throw new Error(`TinyFishPublicUpdate severity must be watch or critical: ${severity}`);
  }

  return {
    updateId: update.updateId ?? `tinyfish-${safeId(update.flightId ?? update.zoneId)}-${index + 1}`,
    snapshotId,
    observedAt: update.observedAt,
    zoneId: update.zoneId,
    flightId: update.flightId,
    severity,
    title: update.title,
    summary: update.summary,
    url: update.url ?? "",
    evidence: update.evidence ?? [],
    freshness: update.freshness ?? { observedAt: update.observedAt, status: "fresh" },
    confidence,
  };
}

function selectPreferredSnapshotRow(rowsBundle) {
  return rowsBundle.operationalSnapshots?.find((row) => row.asOf === "2026-07-11T09:20:00+07:00")
    ?? rowsBundle.operationalSnapshots?.[0];
}

function resolveSnapshotId(rowsBundle, observedAt) {
  if (observedAt) {
    const exact = rowsBundle.operationalSnapshots?.find((row) => row.asOf === observedAt);
    if (exact) return exact.snapshotId;
  }
  return selectPreferredSnapshotRow(rowsBundle)?.snapshotId;
}

function assertRowsBundle(rowsBundle) {
  assertObject(rowsBundle, "OperationalRowsBundle");
  if (!Array.isArray(rowsBundle.operationalSnapshots) || rowsBundle.operationalSnapshots.length === 0) {
    throw new Error("OperationalRowsBundle must include operationalSnapshots");
  }
}

function assertKnownSnapshot(rowsBundle, snapshotId) {
  if (!rowsBundle.operationalSnapshots.some((row) => row.snapshotId === snapshotId)) {
    throw new Error(`TinyFishPublicUpdate references unknown snapshot: ${snapshotId}`);
  }
}

function assertKnownZone(rowsBundle, snapshotId, zoneId) {
  const snapshotZoneIds = new Set(
    (rowsBundle.zoneStates ?? [])
      .filter((row) => row.snapshotId === snapshotId)
      .map((row) => row.zoneId),
  );
  const knownZoneIds = snapshotZoneIds.size > 0
    ? snapshotZoneIds
    : new Set((rowsBundle.zones ?? []).map((row) => row.zoneId));
  if (!knownZoneIds.has(zoneId)) {
    throw new Error(`TinyFishPublicUpdate references unknown zone: ${zoneId}`);
  }
}

function assertKnownFlight(rowsBundle, snapshotId, flightId) {
  const knownFlightIds = new Set(
    (rowsBundle.flightStates ?? [])
      .filter((row) => row.snapshotId === snapshotId)
      .map((row) => row.flightId),
  );
  if (!knownFlightIds.has(flightId)) {
    throw new Error(`TinyFishPublicUpdate references unknown flight: ${flightId}`);
  }
}

function publicUpdateKey(snapshotId, updateId) {
  return `${snapshotId}:${updateId}`;
}

function safeId(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertConfidence(value, label) {
  assertObject(value, label);
  if (typeof value.score !== "number" || Number.isNaN(value.score)) {
    throw new Error(`${label}.score must be a valid number`);
  }
  if (value.score < 0 || value.score > 1) {
    throw new Error(`${label}.score must be between 0 and 1`);
  }
  assertString(value.basis, `${label}.basis`);
}
