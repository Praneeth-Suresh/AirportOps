#!/usr/bin/env node
/*
 * Generates database/seeds/0004_snapshot_variants.sql from the deterministic
 * fixtures so the SQL seed and the JavaScript fixture path can never drift.
 *
 * The generated seed is authoritative for all three snapshot variants
 * (normal / peak / stale): it upserts reference data (zones, paths, transfer
 * rules) and per-snapshot state, and it rebuilds passenger_flows and
 * observations with DELETE-then-INSERT so re-runs stay idempotent. It also
 * corrects earlier seed drift (observation source split, confidence basis
 * strings, west-wing observed_at values).
 *
 * Usage: node database/generate-variant-seeds.mjs
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createFixtureSnapshotSeries } from "../src/fixtures/deterministicAdapters.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(HERE, "seeds", "0004_snapshot_variants.sql");
const VARIANTS = ["normal", "peak", "stale"];

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNumber(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Expected a number for SQL literal, got: ${value}`);
  }
  return String(value);
}

function sqlBoolean(value) {
  return value ? "true" : "false";
}

function snapshotIdFor(variant, snapshot) {
  return `fixture-${variant}-${snapshot.asOf}`;
}

function valuesBlock(rows) {
  return rows.map((row) => `  (${row.join(", ")})`).join(",\n");
}

export function generateVariantSeedSql(series = createFixtureSnapshotSeries()) {
  const reference = series[0];
  const airport = reference.airport;
  const sections = [];

  sections.push(`-- GENERATED FILE - do not hand-edit.
-- Regenerate with: node database/generate-variant-seeds.mjs
--
-- Authoritative seed for the three fixture snapshot variants the Stratus
-- animation cycles through (normal -> peak -> stale). Values mirror
-- src/fixtures/deterministicAdapters.js exactly; the export/parity checks in
-- database/seed.mjs assert that Postgres-assembled snapshots match the
-- fixture-assembled snapshots.`);

  sections.push(`INSERT INTO airport_ops.airports (airport_id, name, map_version)
VALUES (${sqlString(airport.airportId)}, ${sqlString(airport.name)}, ${sqlString(airport.mapVersion)})
ON CONFLICT (airport_id) DO UPDATE
SET name = EXCLUDED.name,
    map_version = EXCLUDED.map_version;`);

  sections.push(`INSERT INTO airport_ops.zones (zone_id, airport_id, label, zone_type, capacity, service_rate_per_minute)
VALUES
${valuesBlock(
    reference.zones.map((zone) => [
      sqlString(zone.zoneId),
      sqlString(airport.airportId),
      sqlString(zone.label),
      sqlString(zone.type),
      sqlNumber(zone.capacity),
      sqlNumber(zone.serviceRatePerMinute),
    ]),
  )}
ON CONFLICT (zone_id) DO UPDATE
SET label = EXCLUDED.label,
    zone_type = EXCLUDED.zone_type,
    capacity = EXCLUDED.capacity,
    service_rate_per_minute = EXCLUDED.service_rate_per_minute;`);

  sections.push(`INSERT INTO airport_ops.zone_paths (airport_id, from_zone_id, to_zone_id)
VALUES
${valuesBlock(
    airport.paths.map(([fromZoneId, toZoneId]) => [
      sqlString(airport.airportId),
      sqlString(fromZoneId),
      sqlString(toZoneId),
    ]),
  )}
ON CONFLICT (airport_id, from_zone_id, to_zone_id) DO NOTHING;`);

  sections.push(`INSERT INTO airport_ops.zone_role_transfer_rules (airport_id, role, from_zone_id, to_zone_id, transfer_minutes, allowed)
VALUES
${valuesBlock(
    airport.transferRules.map((rule) => [
      sqlString(airport.airportId),
      sqlString(rule.role),
      sqlString(rule.fromZoneId),
      sqlString(rule.toZoneId),
      sqlNumber(rule.transferMinutes),
      sqlBoolean(rule.allowed),
    ]),
  )}
ON CONFLICT (airport_id, role, from_zone_id, to_zone_id) DO UPDATE
SET transfer_minutes = EXCLUDED.transfer_minutes,
    allowed = EXCLUDED.allowed;`);

  sections.push(`INSERT INTO airport_ops.operational_snapshots (snapshot_id, airport_id, as_of, contract_version)
VALUES
${valuesBlock(
    series.map((snapshot, index) => [
      sqlString(snapshotIdFor(VARIANTS[index], snapshot)),
      sqlString(airport.airportId),
      sqlString(snapshot.asOf),
      sqlString("v1"),
    ]),
  )}
ON CONFLICT (snapshot_id) DO UPDATE
SET as_of = EXCLUDED.as_of,
    contract_version = EXCLUDED.contract_version;`);

  series.forEach((snapshot, index) => {
    const variant = VARIANTS[index];
    const snapshotId = snapshotIdFor(variant, snapshot);
    sections.push(`-- ${variant} snapshot state (${snapshot.asOf})`);

    sections.push(`INSERT INTO airport_ops.zone_states (snapshot_id, zone_id, occupancy, confidence_score, confidence_basis, observed_at, freshness_status)
VALUES
${valuesBlock(
      snapshot.zones.map((zone) => [
        sqlString(snapshotId),
        sqlString(zone.zoneId),
        sqlNumber(zone.occupancy),
        sqlNumber(zone.confidence.score),
        sqlString(zone.confidence.basis),
        sqlString(zone.freshness.observedAt),
        sqlString(zone.freshness.status),
      ]),
    )}
ON CONFLICT (snapshot_id, zone_id) DO UPDATE
SET occupancy = EXCLUDED.occupancy,
    confidence_score = EXCLUDED.confidence_score,
    confidence_basis = EXCLUDED.confidence_basis,
    observed_at = EXCLUDED.observed_at,
    freshness_status = EXCLUDED.freshness_status;`);

    sections.push(`INSERT INTO airport_ops.counter_states (snapshot_id, counter_id, zone_id, open_count, available_count, max_open_count, open_lead_minutes, role_required, observed_at, confidence_score, confidence_basis)
VALUES
${valuesBlock(
      snapshot.counters.map((counter) => [
        sqlString(snapshotId),
        sqlString(counter.counterId),
        sqlString(counter.zoneId),
        sqlNumber(counter.open),
        sqlNumber(counter.available),
        sqlNumber(counter.maxOpen),
        sqlNumber(counter.openLeadMinutes),
        sqlString(counter.roleRequired),
        sqlString(counter.observedAt),
        sqlNumber(counter.confidence.score),
        sqlString(counter.confidence.basis),
      ]),
    )}
ON CONFLICT (snapshot_id, counter_id) DO UPDATE
SET zone_id = EXCLUDED.zone_id,
    open_count = EXCLUDED.open_count,
    available_count = EXCLUDED.available_count,
    max_open_count = EXCLUDED.max_open_count,
    open_lead_minutes = EXCLUDED.open_lead_minutes,
    role_required = EXCLUDED.role_required,
    observed_at = EXCLUDED.observed_at,
    confidence_score = EXCLUDED.confidence_score,
    confidence_basis = EXCLUDED.confidence_basis;`);

    sections.push(`INSERT INTO airport_ops.staff_states (snapshot_id, staff_id, role, zone_id, availability, coverage_units, rest_minutes_due, shift_starts_at, shift_ends_at, observed_at, confidence_score, confidence_basis)
VALUES
${valuesBlock(
      snapshot.staff.map((staff) => [
        sqlString(snapshotId),
        sqlString(staff.staffId),
        sqlString(staff.role),
        sqlString(staff.zoneId),
        sqlString(staff.availability),
        sqlNumber(staff.coverageUnits),
        sqlNumber(staff.restMinutesDue),
        sqlString(staff.shiftStartsAt),
        sqlString(staff.shiftEndsAt),
        sqlString(staff.observedAt),
        sqlNumber(staff.confidence.score),
        sqlString(staff.confidence.basis),
      ]),
    )}
ON CONFLICT (snapshot_id, staff_id) DO UPDATE
SET role = EXCLUDED.role,
    zone_id = EXCLUDED.zone_id,
    availability = EXCLUDED.availability,
    coverage_units = EXCLUDED.coverage_units,
    rest_minutes_due = EXCLUDED.rest_minutes_due,
    shift_starts_at = EXCLUDED.shift_starts_at,
    shift_ends_at = EXCLUDED.shift_ends_at,
    observed_at = EXCLUDED.observed_at,
    confidence_score = EXCLUDED.confidence_score,
    confidence_basis = EXCLUDED.confidence_basis;`);

    sections.push(`INSERT INTO airport_ops.flight_states (snapshot_id, flight_id, flight_type, status, estimated_passengers, scheduled_at, gate_zone_id)
VALUES
${valuesBlock(
      snapshot.flights.map((flight) => [
        sqlString(snapshotId),
        sqlString(flight.flightId),
        sqlString(flight.type),
        sqlString(flight.status),
        sqlNumber(flight.estimatedPassengers),
        sqlString(flight.scheduledAt),
        sqlString(flight.gateZoneId),
      ]),
    )}
ON CONFLICT (snapshot_id, flight_id) DO UPDATE
SET flight_type = EXCLUDED.flight_type,
    status = EXCLUDED.status,
    estimated_passengers = EXCLUDED.estimated_passengers,
    scheduled_at = EXCLUDED.scheduled_at,
    gate_zone_id = EXCLUDED.gate_zone_id;`);

    sections.push(`DELETE FROM airport_ops.passenger_flows
WHERE snapshot_id = ${sqlString(snapshotId)};

INSERT INTO airport_ops.passenger_flows (snapshot_id, from_zone_id, to_zone_id, interval_minutes, estimated_count)
VALUES
${valuesBlock(
      snapshot.passengerFlows.map((flow) => [
        sqlString(snapshotId),
        sqlString(flow.fromZoneId),
        sqlString(flow.toZoneId),
        sqlNumber(flow.intervalMinutes),
        sqlNumber(flow.estimatedCount),
      ]),
    )};`);

    const observationStatements = [
      `DELETE FROM airport_ops.observations
WHERE snapshot_id = ${sqlString(snapshotId)};`,
    ];

    const plainObservations = snapshot.observations.filter((observation) => !observation.metrics);
    for (const observation of snapshot.observations) {
      if (!observation.metrics) continue;
      observationStatements.push(`WITH inserted_observation AS (
  INSERT INTO airport_ops.observations (snapshot_id, source, observed_at, confidence_score, confidence_basis, payload)
  VALUES (${sqlString(snapshotId)}, ${sqlString(observation.source)}, ${sqlString(observation.observedAt)}, ${sqlNumber(observation.confidence.score)}, ${sqlString(observation.confidence.basis)}, '{}'::jsonb)
  RETURNING observation_id
)
INSERT INTO airport_ops.observation_metrics (observation_id, zone_id, queue_length, density_per_square_meter, active_service_load_per_minute, busy_counters)
SELECT observation_id, zone_id, queue_length, density_per_square_meter, active_service_load_per_minute, busy_counters
FROM inserted_observation
CROSS JOIN (
  VALUES
${observation.metrics
        .map(
          (metric) =>
            `    (${sqlString(metric.zoneId)}, ${sqlNumber(metric.queueLength)}, ${sqlNumber(metric.densityPerSquareMeter)}, ${sqlNumber(metric.activeServiceLoadPerMinute)}, ${sqlNumber(metric.busyCounters)})`,
        )
        .join(",\n")}
) AS metric(zone_id, queue_length, density_per_square_meter, active_service_load_per_minute, busy_counters);`);
    }

    if (plainObservations.length) {
      observationStatements.push(`INSERT INTO airport_ops.observations (snapshot_id, source, observed_at, confidence_score, confidence_basis, payload)
VALUES
${valuesBlock(
        plainObservations.map((observation) => [
          sqlString(snapshotId),
          sqlString(observation.source),
          sqlString(observation.observedAt),
          sqlNumber(observation.confidence.score),
          sqlString(observation.confidence.basis),
          "'{}'::jsonb",
        ]),
      )};`);
    }

    sections.push(observationStatements.join("\n\n"));
  });

  return `${sections.join("\n\n")}\n`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const sql = generateVariantSeedSql();
  writeFileSync(OUTPUT, sql);
  console.log(`Wrote ${OUTPUT} (${sql.length} bytes)`);
}
