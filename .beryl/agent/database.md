# Operational Database Guide

This file is the agent-facing entry point for database work in this repository. Read it before changing Postgres schema, seeds, persistence readers, or any data path used by simulation, monitoring, prediction, or decision support.

## Current Decision

Postgres is the selected operational database. It is owned by a separate bounded context named `operational-database`.

The durable architecture decision is recorded in [ADR 0004](adr/0004-postgres-operational-database-context.md).

## Boundary Rule

The operational-database context owns persistence. Other contexts must not query Postgres tables directly.

Allowed flow:

```text
Postgres rows
  -> operational-database public reader
  -> OperationalSnapshot
  -> prediction / monitoring / simulation / decision support
  -> user-facing outputs
```

Forbidden flow:

```text
simulation / prediction / monitoring / decision support
  -> SQL tables or migration internals
```

When a downstream context needs data, expose it through a public reader or shared contract. Do not leak table shape into feature contexts.

## Repo Locations

| Purpose | Location |
| --- | --- |
| Postgres schema | `database/migrations/` |
| Pilot seed data | `database/seeds/` |
| Database bounded context | `src/operational-database/` |
| Shared contract validators | `src/contracts/` |
| Integration tests | `tests/airport-ops-flow.test.js` |
| Architecture decision | `.beryl/agent/adr/0004-postgres-operational-database-context.md` |

## What The Database Stores

The schema is organized around immutable operational snapshots and the data needed to assemble them:

- Airport layout: airports, zones, valid paths, geometry placeholders.
- Live operating state: zone occupancy, counters, staff, flights, passenger flows, observations.
- Sensor-derived metrics: queue length, density, active service load, busy counters.
- Forecast and simulation support: forecasts, scenarios, scenario decisions.
- Operations evidence: alerts, evidence, confidence, freshness, timestamps.

Passenger visibility must remain aggregated. Do not add facial recognition, personal identity, ticket identity, or unnecessary passenger-level records.

## Public Contract Shape

The first reader surface is `OperationalDatabaseReader.getSnapshot(snapshotId)`.

It assembles database-shaped rows into an `OperationalSnapshot`:

```text
OperationalSnapshot
  asOf
  airport
  zones
  counters
  staff
  flights
  passengerFlows
  observations
```

The reader validates the assembled snapshot with the shared contract validator and freezes the result. Simulation decisions must not mutate this live state.

## Current Implementation State

The repo has schema and seed SQL, plus a deterministic row-source reader. It does not yet open a live Postgres connection.

Implemented:

- `database/migrations/0001_operational_database.sql`
- `database/seeds/0001_fixture_operational_snapshot.sql`
- `src/operational-database/index.js`
- Integration coverage proving the database reader can drive prediction, monitoring, simulation, and decision support.

Not implemented yet:

- `pg` dependency or connection pool.
- Migration runner.
- `DATABASE_URL` configuration.
- Runtime SQL queries against a live Postgres instance.
- PostGIS or TimescaleDB extensions.

Add those in a separate approved slice so connection management, environment configuration, and migration execution can be tested explicitly.

## Schema Change Rules

When changing database shape:

1. Keep `OperationalSnapshot` as the contract boundary unless an ADR changes it.
2. Add a migration instead of editing existing applied migration intent.
3. Update seed data when the deterministic pilot path needs the new field.
4. Update the operational-database reader before downstream contexts depend on the new data.
5. Add or update integration tests that prove the reader still drives the full decision path.
6. Preserve `freshness` and `confidence` for values that affect operational decisions.
7. Keep staff, flight, queue, counter, and movement records traceable to a snapshot.

## Verification

For database-context changes, run:

```bash
npm test
./.beryl/scripts/check-affected.sh --worktree
./.beryl/scripts/check.sh
```

If tests change intentionally, run:

```bash
./.beryl/scripts/update-test-manifest.sh
```

Then rerun the affected and aggregate checks.

## Common Agent Pitfalls

- Do not import `src/operational-database/` internals from simulation, monitoring, prediction, or decision support.
- Do not make the application shell calculate database-derived domain values.
- Do not replace `OperationalSnapshot` with raw SQL rows in downstream modules.
- Do not add passenger identity data.
- Do not present scenario projections as live operational state.
- Do not add a live Postgres dependency without adding deterministic tests and documenting required environment variables.
