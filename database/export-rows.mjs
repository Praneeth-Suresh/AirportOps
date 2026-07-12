#!/usr/bin/env node
/*
 * Export Postgres operational rows to the rows-bundle JSON the browser app
 * consumes through the operational-database reader.
 *
 * The bundle shape mirrors createOperationalDatabaseRowsFromSnapshot exactly:
 * { airports, zones, zonePaths, zoneRoleTransferRules, operationalSnapshots,
 *   zoneStates, counterStates, staffStates, flightStates, passengerFlows,
 *   observations }.
 *
 * SQL stays inside this operational-database-owned script: column names are
 * aliased to the camelCase contract fields, confidence/freshness are composed
 * into nested objects, timestamps are rendered as ISO strings with the +07:00
 * airport offset, and only whitelisted columns are selected so no table
 * internals leak into the frozen snapshot contract.
 *
 * Usage:  DATABASE_URL=... npm run export:rows
 *         PSQL_COMMAND="docker exec -i my-pg psql" DATABASE_URL=... npm run export:rows
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createOperationalDatabaseReader } from "../src/operational-database/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const EXPORT_PATH = join(HERE, "export", "operational-rows.json");

const TS = (column) =>
  `to_char(${column} AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD"T"HH24:MI:SS') || '+07:00'`;

const CONFIDENCE = (prefix = "") =>
  `jsonb_build_object('score', ${prefix}confidence_score, 'basis', ${prefix}confidence_basis)`;

export const COLLECTION_QUERIES = {
  airports: `SELECT airport_id AS "airportId", name, map_version AS "mapVersion"
FROM airport_ops.airports
ORDER BY airport_id`,
  zones: `SELECT zone_id AS "zoneId", airport_id AS "airportId", label, zone_type AS "type",
  capacity, service_rate_per_minute AS "serviceRatePerMinute"
FROM airport_ops.zones
ORDER BY zone_id`,
  zonePaths: `SELECT airport_id AS "airportId", from_zone_id AS "fromZoneId", to_zone_id AS "toZoneId"
FROM airport_ops.zone_paths
ORDER BY from_zone_id, to_zone_id`,
  zoneRoleTransferRules: `SELECT airport_id AS "airportId", role, from_zone_id AS "fromZoneId",
  to_zone_id AS "toZoneId", transfer_minutes AS "transferMinutes", allowed
FROM airport_ops.zone_role_transfer_rules
ORDER BY role, from_zone_id, to_zone_id`,
  operationalSnapshots: `SELECT snapshot_id AS "snapshotId", airport_id AS "airportId",
  ${TS("as_of")} AS "asOf", contract_version AS "contractVersion"
FROM airport_ops.operational_snapshots
ORDER BY as_of, snapshot_id`,
  zoneStates: `SELECT snapshot_id AS "snapshotId", zone_id AS "zoneId", occupancy,
  ${CONFIDENCE()} AS confidence,
  jsonb_build_object('observedAt', ${TS("observed_at")}, 'status', freshness_status) AS freshness
FROM airport_ops.zone_states
ORDER BY snapshot_id, zone_id`,
  counterStates: `SELECT snapshot_id AS "snapshotId", counter_id AS "counterId", zone_id AS "zoneId",
  open_count AS "open", available_count AS "available", max_open_count AS "maxOpen",
  open_lead_minutes AS "openLeadMinutes", role_required AS "roleRequired",
  ${TS("observed_at")} AS "observedAt", ${CONFIDENCE()} AS confidence
FROM airport_ops.counter_states
ORDER BY snapshot_id, counter_id`,
  staffStates: `SELECT snapshot_id AS "snapshotId", staff_id AS "staffId", role, zone_id AS "zoneId",
  availability, coverage_units AS "coverageUnits", rest_minutes_due AS "restMinutesDue",
  ${TS("shift_starts_at")} AS "shiftStartsAt", ${TS("shift_ends_at")} AS "shiftEndsAt",
  ${TS("observed_at")} AS "observedAt", ${CONFIDENCE()} AS confidence
FROM airport_ops.staff_states
ORDER BY snapshot_id, staff_id`,
  flightStates: `SELECT snapshot_id AS "snapshotId", flight_id AS "flightId", flight_type AS "type",
  status, estimated_passengers AS "estimatedPassengers", ${TS("scheduled_at")} AS "scheduledAt",
  gate_zone_id AS "gateZoneId"
FROM airport_ops.flight_states
ORDER BY snapshot_id, flight_id`,
  passengerFlows: `SELECT snapshot_id AS "snapshotId", from_zone_id AS "fromZoneId",
  to_zone_id AS "toZoneId", interval_minutes AS "intervalMinutes", estimated_count AS "estimatedCount"
FROM airport_ops.passenger_flows
ORDER BY snapshot_id, from_zone_id, to_zone_id`,
  observations: `SELECT o.snapshot_id AS "snapshotId", o.source, ${TS("o.observed_at")} AS "observedAt",
  ${CONFIDENCE("o.")} AS confidence,
  jsonb_agg(jsonb_build_object(
    'zoneId', m.zone_id,
    'queueLength', m.queue_length,
    'densityPerSquareMeter', m.density_per_square_meter,
    'activeServiceLoadPerMinute', m.active_service_load_per_minute,
    'busyCounters', m.busy_counters
  ) ORDER BY m.observation_metric_id) FILTER (WHERE m.observation_metric_id IS NOT NULL) AS metrics
FROM airport_ops.observations o
LEFT JOIN airport_ops.observation_metrics m USING (observation_id)
GROUP BY o.observation_id, o.snapshot_id, o.source, o.observed_at, o.confidence_score, o.confidence_basis
ORDER BY o.snapshot_id, o.source, o.observed_at`,
};

function resolvePsqlCommand() {
  const raw = process.env.PSQL_COMMAND ?? "psql";
  return raw.split(" ").filter(Boolean);
}

export function createPsqlQueryRunner(databaseUrl) {
  const command = resolvePsqlCommand();
  return function runQuery(_collection, sql) {
    const wrapped = `SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (${sql}) t`;
    const output = execFileSync(
      command[0],
      [...command.slice(1), databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", wrapped],
      { encoding: "utf8" },
    );
    return JSON.parse(output.trim());
  };
}

export function normalizeRowsBundle(bundle) {
  const normalized = { ...bundle };
  normalized.observations = (bundle.observations ?? []).map((observation) => {
    if (observation.metrics === null || observation.metrics === undefined) {
      const { metrics: _metrics, ...withoutMetrics } = observation;
      return withoutMetrics;
    }
    return observation;
  });
  return normalized;
}

export function assembleSnapshotsFromBundle(bundle) {
  const reader = createOperationalDatabaseReader(() => bundle);
  return bundle.operationalSnapshots.map((row) => ({
    snapshotId: row.snapshotId,
    snapshot: reader.getSnapshot(row.snapshotId),
  }));
}

const collator = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// jsonb_build_object reorders object keys, so canonical comparison must be
// key-order-insensitive as well as array-order-insensitive.
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeysDeep(value[key])]),
    );
  }
  return value;
}

export function canonicalizeSnapshotForComparison(snapshot) {
  return sortKeysDeep({
    asOf: snapshot.asOf,
    airport: {
      ...snapshot.airport,
      paths: [...snapshot.airport.paths].sort((a, b) => collator(a.join("|"), b.join("|"))),
      transferRules: [...(snapshot.airport.transferRules ?? [])].sort((a, b) =>
        collator(`${a.role}|${a.fromZoneId}|${a.toZoneId}`, `${b.role}|${b.fromZoneId}|${b.toZoneId}`),
      ),
    },
    zones: [...snapshot.zones].sort((a, b) => collator(a.zoneId, b.zoneId)),
    counters: [...snapshot.counters].sort((a, b) => collator(a.counterId, b.counterId)),
    staff: [...snapshot.staff].sort((a, b) => collator(a.staffId, b.staffId)),
    flights: [...snapshot.flights].sort((a, b) => collator(a.flightId, b.flightId)),
    passengerFlows: [...snapshot.passengerFlows].sort((a, b) =>
      collator(`${a.fromZoneId}|${a.toZoneId}`, `${b.fromZoneId}|${b.toZoneId}`),
    ),
    observations: [...snapshot.observations]
      .map((observation) =>
        observation.metrics
          ? { ...observation, metrics: [...observation.metrics].sort((a, b) => collator(a.zoneId, b.zoneId)) }
          : observation,
      )
      .sort((a, b) => collator(`${a.source}|${a.observedAt}`, `${b.source}|${b.observedAt}`)),
  });
}

export function exportRows({
  runQuery,
  writeFile = defaultWriteFile,
  exportPath = EXPORT_PATH,
} = {}) {
  if (!runQuery) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required to export rows from Postgres.");
    }
    runQuery = createPsqlQueryRunner(databaseUrl);
  }

  const bundle = {};
  for (const [collection, sql] of Object.entries(COLLECTION_QUERIES)) {
    bundle[collection] = runQuery(collection, sql);
  }

  const normalized = normalizeRowsBundle(bundle);
  const assembled = assembleSnapshotsFromBundle(normalized);
  if (!assembled.length) {
    throw new Error("Export produced no operational snapshots.");
  }

  writeFile(exportPath, `${JSON.stringify(normalized, null, 2)}\n`);
  return { bundle: normalized, snapshots: assembled, exportPath };
}

function defaultWriteFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { snapshots, exportPath } = exportRows();
  console.log(`Exported ${snapshots.length} snapshot(s) to ${exportPath}:`);
  for (const { snapshotId, snapshot } of snapshots) {
    console.log(`  - ${snapshotId} (asOf ${snapshot.asOf}, ${snapshot.zones.length} zones)`);
  }
}
