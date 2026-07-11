# AirportOps

AirportOps is a dependency-free static ES module application for airport operations decision support. The current repository runs from deterministic fixtures by default, so the frontend and domain systems can be exercised without live airport integrations.

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

The frontend entrypoint is `index.html`, which loads `src/app/index.js` and `src/app/styles.css`. The app shell composes the operational state, monitoring, prediction, simulation, and decision-support modules from deterministic fixture data.

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
psql "$DATABASE_URL" -f database/seeds/0001_fixture_operational_snapshot.sql
psql "$DATABASE_URL" -f database/seeds/0002_staffing_rearrangement_context.sql
psql "$DATABASE_URL" -f database/seeds/0003_floor_plan_zones.sql
```

The JavaScript operational database reader currently uses fixture-shaped rows by default, so loading Postgres is optional for local application and test runs.

## Full Repository Check

Before handing off changes, run the deterministic project gate:

```bash
./.beryl/scripts/check.sh
```

This includes Markdown sanity checks, component validation, secret checks, test-manifest validation, and affected project checks.
