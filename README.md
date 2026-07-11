# AirportOps

AirportOps is a dependency-free static ES module application for airport operations decision support. The frontend reads operational rows exported from the Postgres operational database (`database/export/operational-rows.json`) when that export is present, and falls back to deterministic fixtures otherwise — so the frontend and domain systems can always be exercised without live airport integrations. The header of the Stratus surface shows which source is active (`PG EXPORT` or `FIXTURES`).

## Prerequisites

- Node.js with the built-in test runner available.
- Python 3 for serving the static frontend locally.
- Optional: Postgres plus `psql` if you want to load the operational database schema and fixture seed data.

## Run the Frontend Application

From the repository root:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

The frontend entrypoint is `index.html`, which loads `src/app/index.js` and `src/app/styles.css`. The app shell renders the **Stratus digital-twin surface** — a flow map, timeline scrubber over the 120-minute forecast horizon, zone-inspection panel, live-vs-simulate modes, and the Beagle decision copilot. Every value it shows is composed from the operational-database reader plus the monitoring, prediction, simulation, and decision-support modules; the flow map is laid out from the seeded zone/path graph (`src/app/mapLayout.js`), so it reflects whatever the migrations and seeds contain.

If port `8000` is already in use, choose another port:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

## Run the Back-End Domain Systems

There is no separate long-running backend service in the current implementation. The backend systems are domain modules under `src/`:

- `src/operational-state`
- `src/operational-database`
- `src/monitoring`
- `src/prediction`
- `src/simulation`
- `src/decision-support`
- `src/contracts`

Run the deterministic backend/domain checks with:

```bash
npm test
```

The package-level check currently delegates to the same test command:

```bash
npm run check
```

## Optional Operational Database Setup

The operational-database bounded context includes Postgres migrations and deterministic seed data in `database/`. To load them into a local database, set `DATABASE_URL` to your Postgres connection string, then run the files in order:

```bash
psql "$DATABASE_URL" -f database/migrations/0001_operational_database.sql
psql "$DATABASE_URL" -f database/migrations/0002_staffing_rearrangement_context.sql
psql "$DATABASE_URL" -f database/migrations/0003_floor_plan_zones.sql
psql "$DATABASE_URL" -f database/migrations/0004_prediction_refresh_cadence.sql
psql "$DATABASE_URL" -f database/seeds/0001_fixture_operational_snapshot.sql
psql "$DATABASE_URL" -f database/seeds/0002_staffing_rearrangement_context.sql
psql "$DATABASE_URL" -f database/seeds/0003_floor_plan_zones.sql
psql "$DATABASE_URL" -f database/seeds/0004_snapshot_variants.sql
```

The frontend does not connect to Postgres directly (the boundary rule keeps SQL inside the operational-database context). Instead, `database/export-rows.mjs` exports the seeded rows as contract-shaped JSON the browser fetches. Loading Postgres stays optional: without the export, the reader falls back to fixture-shaped rows.

To create/verify the seed data in one step, run:

```bash
npm run seed
```

This applies the migration and seed SQL when `DATABASE_URL` (and `psql`) are available, exports the Postgres rows and asserts each exported snapshot is exactly equal to its fixture counterpart, and always exercises the JavaScript seed path through the operational-database reader — asserting the snapshot series (`normal → peak → stale`) drives the expected monitoring, forecast, and recommendation behaviour the Stratus animation relies on.

### Export Postgres rows for the frontend

```bash
DATABASE_URL=... npm run export:rows
```

This writes `database/export/operational-rows.json` (a generated file — never hand-edit it), which the app shell fetches at boot with `cache: no-store`. If `psql` is not on your PATH (for example when Postgres runs in Docker), point the tooling at any psql-compatible command:

```bash
PSQL_COMMAND="docker exec -i airportops-pg psql" DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run seed
```

### Regenerate the variant seed

`database/seeds/0004_snapshot_variants.sql` is generated from the fixtures so the SQL and JavaScript data can never drift (a test enforces this). After changing `src/fixtures/deterministicAdapters.js`, run:

```bash
npm run generate:seeds
```

## Full Repository Check

Before handing off changes, run the deterministic project gate:

```bash
./.beryl/scripts/check.sh
```

This includes Markdown sanity checks, component validation, secret checks, test-manifest validation, and affected project checks.
