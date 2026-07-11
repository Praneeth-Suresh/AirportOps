import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createOperationalDatabaseReader,
  createOperationalDatabaseRowsFromSnapshot,
} from "../src/operational-database/index.js";
import {
  TINYFISH_PUBLIC_CONTEXT_SOURCE,
  createTinyFishPublicContextAdapter,
} from "../src/operational-database/tinyfishPublicContext.js";
import { createFixtureSnapshotSeries } from "../src/fixtures/deterministicAdapters.js";
import {
  COLLECTION_QUERIES,
  canonicalizeSnapshotForComparison,
  exportRows,
} from "../database/export-rows.mjs";
import { generateVariantSeedSql } from "../database/generate-variant-seeds.mjs";

const VARIANTS = ["normal", "peak", "stale"];

function fixtureSeries() {
  return createFixtureSnapshotSeries();
}

function fixtureSnapshotId(variant, snapshot) {
  return `fixture-${variant}-${snapshot.asOf}`;
}

// Simulates what the Postgres export queries return: shared reference rows once,
// per-snapshot state rows concatenated, and metrics-less observations carrying
// an explicit null metrics key (the SQL LEFT JOIN aggregate produces null).
function fakePostgresBundle() {
  const series = fixtureSeries();
  const perSnapshot = series.map((snapshot, index) =>
    createOperationalDatabaseRowsFromSnapshot(snapshot, fixtureSnapshotId(VARIANTS[index], snapshot)),
  );
  const reference = perSnapshot[0];
  return {
    airports: reference.airports,
    zones: reference.zones,
    zonePaths: reference.zonePaths,
    zoneRoleTransferRules: reference.zoneRoleTransferRules,
    operationalSnapshots: perSnapshot.flatMap((rows) => rows.operationalSnapshots),
    zoneStates: perSnapshot.flatMap((rows) => rows.zoneStates),
    counterStates: perSnapshot.flatMap((rows) => rows.counterStates),
    staffStates: perSnapshot.flatMap((rows) => rows.staffStates),
    flightStates: perSnapshot.flatMap((rows) => rows.flightStates),
    passengerFlows: perSnapshot.flatMap((rows) => rows.passengerFlows),
    observations: perSnapshot.flatMap((rows) =>
      rows.observations.map((observation) => (observation.metrics ? observation : { ...observation, metrics: null })),
    ),
  };
}

function runFakeExport(bundle = fakePostgresBundle()) {
  const written = {};
  const result = exportRows({
    runQuery: (collection) => {
      assert.ok(collection in COLLECTION_QUERIES, `unknown collection queried: ${collection}`);
      return bundle[collection];
    },
    writeFile: (path, contents) => {
      written.path = path;
      written.contents = contents;
    },
  });
  return { result, written };
}

test("export assembles all three snapshot variants into valid contract snapshots", () => {
  const { result, written } = runFakeExport();

  assert.equal(result.snapshots.length, 3);
  for (const { snapshot } of result.snapshots) {
    assert.equal(snapshot.zones.length, 22);
    assert.ok(Object.isFrozen(snapshot));
  }

  const peak = result.snapshots.find(({ snapshot }) => snapshot.asOf === "2026-07-11T09:20:00+07:00");
  assert.equal(peak.snapshot.zones.find((zone) => zone.zoneId === "check-in-a").occupancy, 720);

  const parsed = JSON.parse(written.contents);
  assert.equal(parsed.operationalSnapshots.length, 3);
  assert.equal(parsed.zoneStates.length, 66);
});

test("exported observations omit the metrics key when the SQL aggregate is null", () => {
  const { written } = runFakeExport();
  const parsed = JSON.parse(written.contents);

  const withMetrics = parsed.observations.filter((observation) => "metrics" in observation);
  const withoutMetrics = parsed.observations.filter((observation) => !("metrics" in observation));

  assert.equal(withMetrics.length, 3);
  assert.equal(withoutMetrics.length, 9);
  assert.ok(withMetrics.every((observation) => observation.source === "edge-queue-analytics"));
});

test("postgres-shaped rows assemble snapshots identical to fixture-assembled snapshots", () => {
  const { result } = runFakeExport();
  const series = fixtureSeries();

  series.forEach((fixtureSnapshot, index) => {
    const exported = result.snapshots.find(({ snapshot }) => snapshot.asOf === fixtureSnapshot.asOf);
    assert.ok(exported, `missing exported snapshot for ${VARIANTS[index]}`);

    const fixtureAssembled = createOperationalDatabaseReader(() =>
      createOperationalDatabaseRowsFromSnapshot(fixtureSnapshot, exported.snapshotId),
    ).getSnapshot();

    assert.deepEqual(
      canonicalizeSnapshotForComparison(exported.snapshot),
      canonicalizeSnapshotForComparison(fixtureAssembled),
    );
  });
});

test("tinyfish adapter appends public-web observations without mutating source rows", () => {
  const bundle = fakePostgresBundle();
  const peakSnapshotId = bundle.operationalSnapshots[1].snapshotId;
  const adapter = createTinyFishPublicContextAdapter(() => [
    {
      snapshotId: peakSnapshotId,
      observedAt: "2026-07-11T09:19:30+07:00",
      zoneId: "check-in-a",
      flightId: "SQ-981",
      severity: "watch",
      title: "SQ-981 public gate advisory",
      summary: "Public airline status page reports SQ-981 boarding demand building near Check-in A.",
      url: "https://airline.example.test/status/SQ-981",
      evidence: ["browser-rendered airline page updated at 09:19"],
      confidence: { score: 0.74, basis: "TinyFish browser-rendered public airline page" },
    },
  ]);

  const originalObservationCount = bundle.observations.length;
  const enriched = adapter.enrichRowsBundle(bundle);

  assert.equal(bundle.observations.length, originalObservationCount);
  assert.equal(enriched.observations.length, originalObservationCount + 1);

  const observation = enriched.observations.at(-1);
  assert.equal(observation.source, TINYFISH_PUBLIC_CONTEXT_SOURCE);
  assert.equal(observation.observedAt, "2026-07-11T09:19:30+07:00");
  assert.equal(observation.publicUpdates[0].zoneId, "check-in-a");
  assert.equal(observation.publicUpdates[0].flightId, "SQ-981");
  assert.equal(observation.confidence.score, 0.74);

  const snapshot = createOperationalDatabaseReader(() => enriched).getSnapshot(peakSnapshotId);
  assert.ok(snapshot.observations.some((candidate) => candidate.source === TINYFISH_PUBLIC_CONTEXT_SOURCE));
});

test("tinyfish adapter rejects public updates for unknown zones", () => {
  const bundle = fakePostgresBundle();
  const adapter = createTinyFishPublicContextAdapter(() => [
    {
      snapshotId: bundle.operationalSnapshots[1].snapshotId,
      observedAt: "2026-07-11T09:19:30+07:00",
      zoneId: "unknown-zone",
      title: "Unknown zone advisory",
      summary: "This update should not enter the operational snapshot.",
      confidence: { score: 0.7, basis: "TinyFish browser-rendered public page" },
    },
  ]);

  assert.throws(() => adapter.enrichRowsBundle(bundle), /unknown zone/);
});

test("export fails loudly when a zone state row is missing", () => {
  const bundle = fakePostgresBundle();
  bundle.zoneStates = bundle.zoneStates.filter(
    (state) => !(state.zoneId === "customs-hall" && state.snapshotId.startsWith("fixture-stale")),
  );

  assert.throws(() => runFakeExport(bundle), /missing zone state/);
});

test("generated variant seed SQL is in sync with the fixtures", () => {
  const generated = generateVariantSeedSql();
  const committed = readFileSync(new URL("../database/seeds/0004_snapshot_variants.sql", import.meta.url), "utf8");

  assert.equal(committed, generated, "run `npm run generate:seeds` after changing the fixtures");
  assert.ok(generated.includes("'fixture-normal-2026-07-11T09:10:00+07:00'"));
  assert.ok(generated.includes("'fixture-stale-2026-07-11T09:30:00+07:00'"));
  assert.equal(generated.includes("edge-queue-analytics-west"), false);
  assert.ok(/'immigration-officer', 'arrival-gate-b', 'immigration-west', 6/.test(generated));
});

test("export tooling stays inside the operational-database boundary", () => {
  const source = readFileSync(new URL("../database/export-rows.mjs", import.meta.url), "utf8");

  assert.equal(source.includes("../src/monitoring"), false);
  assert.equal(source.includes("../src/prediction"), false);
  assert.equal(source.includes("../src/simulation"), false);
  assert.equal(source.includes("../src/decision-support"), false);
  assert.ok(source.includes("../src/operational-database/index.js"));
});

test("app shell renders from the fixture bundle when no export is loaded", async () => {
  const { state, computeFrame, renderToString } = await import("../src/app/index.js");

  assert.equal(state.snapshotIndex, 1);
  const frame = computeFrame();
  assert.equal(frame.snapshot.asOf, "2026-07-11T09:20:00+07:00");
  assert.equal(frame.snapshot.zones.find((zone) => zone.zoneId === "check-in-a").occupancy, 720);

  const html = renderToString();
  assert.ok(html.includes('data-source="fixtures+tinyfish"'));
  assert.ok(html.includes("FIX + TINYFISH"));
  assert.ok(html.includes("TinyFish"));
  assert.ok(html.includes("SQ-981 public gate advisory"));
  assert.ok(html.includes("Fetch live updates"));
  assert.ok(html.includes("/api/tinyfish/public-context"));
  assert.equal(html.includes("api.search.tinyfish.ai"), false);
});

test("committed Postgres export drives the monitoring pipeline with the seeded values", async () => {
  const raw = readFileSync(new URL("../database/export/operational-rows.json", import.meta.url), "utf8");
  const bundle = JSON.parse(raw);
  const reader = createOperationalDatabaseReader(() => bundle);

  assert.equal(bundle.operationalSnapshots.length, 3);
  const snapshot = reader.getSnapshot("fixture-peak-2026-07-11T09:20:00+07:00");
  assert.equal(snapshot.zones.length, 22);
  assert.equal(snapshot.zones.find((zone) => zone.zoneId === "check-in-a").occupancy, 720);

  const { predictionService } = await import("../src/prediction/index.js");
  const { MonitoringViewModel } = await import("../src/monitoring/index.js");
  const forecast = predictionService.forecast(snapshot);
  const monitoring = MonitoringViewModel.from(snapshot, forecast);
  const checkIn = monitoring.analytics.queueStates.find((queue) => queue.zoneId === "check-in-a");

  assert.equal(checkIn.queueLength, 138);
  assert.equal(checkIn.severity, "critical");
});
