#!/usr/bin/env node
/*
 * Seed runner + animation-behaviour check.
 *
 * "Create seed data by running the existing scripts": the operational database
 * ships as SQL migrations + seeds under database/. When a Postgres target is
 * configured (DATABASE_URL) and `psql` is available, this applies those files
 * in order. The browser app, however, reads the SAME seed shape through the
 * JavaScript operational-database reader (fixtures mirror the seed rows), so
 * this script always exercises that JS seed path and asserts the values the
 * Stratus animation depends on — proving the frontend is wired to the seeded
 * database contract, not to invented data.
 *
 * Usage:  npm run seed            (verify JS seed path; apply SQL if possible)
 *         DATABASE_URL=... npm run seed
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createOperationalDatabaseReader,
  createOperationalDatabaseRowsFromSnapshot,
} from "../src/operational-database/index.js";
import { createFixtureSnapshotSeries } from "../src/fixtures/deterministicAdapters.js";
import { canonicalizeSnapshotForComparison, exportRows } from "./export-rows.mjs";
import { predictionService } from "../src/prediction/index.js";
import { MonitoringViewModel } from "../src/monitoring/index.js";
import { defaultScenarioDecisions, simulationService } from "../src/simulation/index.js";
import { decisionSupportService } from "../src/decision-support/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const VARIANTS = ["normal", "peak", "stale"];
const MIGRATIONS = [
  "migrations/0001_operational_database.sql",
  "migrations/0002_staffing_rearrangement_context.sql",
  "migrations/0003_floor_plan_zones.sql",
  "migrations/0004_prediction_refresh_cadence.sql",
];
const SEEDS = [
  "seeds/0001_fixture_operational_snapshot.sql",
  "seeds/0002_staffing_rearrangement_context.sql",
  "seeds/0003_floor_plan_zones.sql",
  "seeds/0004_snapshot_variants.sql",
];

let failures = 0;
function assert(label, condition, detail = "") {
  const mark = condition ? "  ok  " : " FAIL ";
  if (!condition) failures += 1;
  console.log(`[${mark}] ${label}${detail ? ` — ${detail}` : ""}`);
}

// --- 1. Apply the SQL scripts to Postgres when a target is available ---------

function psqlCommand() {
  return (process.env.PSQL_COMMAND ?? "psql").split(" ").filter(Boolean);
}

function psqlAvailable() {
  const command = psqlCommand();
  try {
    execFileSync(command[0], [...command.slice(1), "--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function applySqlScripts() {
  const url = process.env.DATABASE_URL;
  console.log("\n── Apply SQL migrations + seeds ──────────────────────────────");
  if (!url) {
    console.log("  · DATABASE_URL not set — skipping psql apply (JS seed path below is authoritative for the app).");
    return;
  }
  if (!psqlAvailable()) {
    console.log("  · psql not found on PATH — skipping psql apply.");
    return;
  }
  for (const file of [...MIGRATIONS, ...SEEDS]) {
    const path = join(HERE, file);
    if (!existsSync(path)) {
      console.log(`  · missing ${file} — skipped`);
      continue;
    }
    console.log(`  · psql -f ${file}`);
    const command = psqlCommand();
    // Stream the file through stdin so psql works even when it runs in a
    // container without access to the host filesystem.
    execFileSync(command[0], [...command.slice(1), url, "-v", "ON_ERROR_STOP=1", "-f", "-"], {
      input: readFileSync(path),
      stdio: ["pipe", "inherit", "inherit"],
    });
  }
  console.log("  ✓ SQL migrations + seeds applied.");
}

// --- 2b. Prove Postgres-assembled snapshots match the fixture snapshots ------

function verifyPostgresParity() {
  console.log("\n── Postgres ↔ fixture snapshot parity ───────────────────────");
  if (!process.env.DATABASE_URL || !psqlAvailable()) {
    console.log("  · DATABASE_URL/psql unavailable — skipping Postgres parity export.");
    return;
  }

  const { snapshots, exportPath } = exportRows();
  console.log(`  · exported ${snapshots.length} snapshot(s) to ${exportPath}`);

  const series = createFixtureSnapshotSeries();
  assert("Postgres exports one snapshot per fixture variant", snapshots.length === series.length);

  series.forEach((fixtureSnapshot, index) => {
    const variant = VARIANTS[index];
    const exported = snapshots.find(({ snapshot }) => snapshot.asOf === fixtureSnapshot.asOf);
    assert(`Postgres has the ${variant} snapshot (asOf ${fixtureSnapshot.asOf})`, Boolean(exported));
    if (!exported) return;

    const fixtureReader = createOperationalDatabaseReader(() =>
      createOperationalDatabaseRowsFromSnapshot(fixtureSnapshot, exported.snapshotId),
    );
    const fixtureAssembled = fixtureReader.getSnapshot();
    const parity =
      JSON.stringify(canonicalizeSnapshotForComparison(exported.snapshot)) ===
      JSON.stringify(canonicalizeSnapshotForComparison(fixtureAssembled));
    assert(`Postgres ${variant} snapshot matches the fixture snapshot exactly`, parity);
  });
}

// --- 2. Cross-check the SQL seed against the JS fixture the app reads --------

function crossCheckSqlSeed(peakSnapshot) {
  console.log("\n── Seed ↔ database linkage ───────────────────────────────────");
  const seedSql = readFileSync(join(HERE, "seeds/0001_fixture_operational_snapshot.sql"), "utf8");
  const match = /fixture-peak[^,]*',\s*'check-in-a',\s*(\d+),/.exec(seedSql);
  const sqlOccupancy = match ? Number(match[1]) : null;
  const jsOccupancy = peakSnapshot.zones.find((z) => z.zoneId === "check-in-a").occupancy;
  assert(
    "SQL seed check-in-a occupancy matches JS peak snapshot",
    sqlOccupancy === jsOccupancy,
    `sql=${sqlOccupancy} js=${jsOccupancy}`,
  );
  assert("SQL seed pins the fixture-peak snapshot id", seedSql.includes("fixture-peak-2026-07-11T09:20:00+07:00"));
}

// --- 3. Run the JS seed path and verify the animation behaviour -------------

function readSnapshot(index) {
  const series = createFixtureSnapshotSeries();
  const reader = createOperationalDatabaseReader(() =>
    createOperationalDatabaseRowsFromSnapshot(series[index], `seed-${VARIANTS[index]}-${series[index].asOf}`),
  );
  return reader.getSnapshot();
}

function frameFor(index) {
  const snapshot = readSnapshot(index);
  const forecast = predictionService.forecast(snapshot);
  const monitoring = MonitoringViewModel.from(snapshot, forecast);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const options = decisionSupportService.options(snapshot, forecast, projection, monitoring.analytics.operationalAlerts);
  return { snapshot, forecast, monitoring, projection, options };
}

function verifyAnimation() {
  console.log("\n── Seeded animation behaviour (operational-database reader) ──");

  const frames = VARIANTS.map((_, index) => frameFor(index));
  const checkIn = frames.map((frame) =>
    frame.monitoring.analytics.queueStates.find((q) => q.zoneId === "check-in-a"),
  );

  console.log("  snapshot   check-in-a queue / wait / severity / freshness   alerts");
  frames.forEach((frame, i) => {
    const q = checkIn[i];
    console.log(
      `  ${VARIANTS[i].padEnd(9)} ${String(q.queueLength).padStart(3)} / ${q.estimatedWaitMinutes}m / ${q.severity.padEnd(8)} / ${q.freshness.status.padEnd(6)}   ${frame.monitoring.analytics.operationalAlerts.length}`,
    );
  });

  // The behaviours the Stratus map + timeline + copilot rely on:
  assert("normal check-in-a queue is 54", checkIn[0].queueLength === 54);
  assert("peak check-in-a queue is 138", checkIn[1].queueLength === 138);
  assert("peak check-in-a wait is 5m", checkIn[1].estimatedWaitMinutes === 5);
  assert("peak check-in-a is critical", checkIn[1].severity === "critical");
  assert("queue rises from normal → peak (crowding animates)", checkIn[1].queueLength > checkIn[0].queueLength);
  assert("stale snapshot marks check-in-a stale (freshness animates)", checkIn[2].freshness.status === "stale");

  const peak = frames[1];
  assert("peak snapshot raises operational alerts", peak.monitoring.analytics.operationalAlerts.length > 0);
  assert(
    "forecast spans the 120-min horizon at 15-min resolution",
    peak.forecast.points.map((p) => p.minute).join(",") === "0,15,30,45,60,75,90,105,120",
  );
  assert("decision-support surfaces at least one recommendation", peak.options.length >= 1);
  assert(
    "a recommendation targets the pressured check-in zone",
    peak.options.some((o) => o.affectedZones.includes("check-in-a")),
  );

  const departureZones = peak.snapshot.zones.length;
  assert("full floor plan is seeded (all zones present)", departureZones >= 21, `${departureZones} zones`);

  crossCheckSqlSeed(peak.snapshot);
}

// --- run ---------------------------------------------------------------------

console.log("Stratus seed runner — creating/verifying operational seed data.");
applySqlScripts();
verifyPostgresParity();
verifyAnimation();

console.log(
  `\n${failures === 0 ? "✓ Seed data is present and the animation has the expected behaviour." : `✗ ${failures} check(s) failed.`}\n`,
);
process.exit(failures === 0 ? 0 : 1);
