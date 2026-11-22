# Sentinel (AirportOps)

Sentinel is an airport operations dashboard prototype built for the AABW
2026 hackathon. It shows passenger flow, queue pressure, and counter
utilization on a terminal map, then lets you preview a response without
changing the active snapshot. This is a demonstration, not a live airport
deployment.

## Try the fixture demo

From the repository root, start a static server with Python 3. No npm
install, database, or API key is needed to use this path.

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000/?source=fixtures>. This forces deterministic
fixtures even though a seeded database export is tracked in the repository.
The header shows **FIX + TINYFISH**, where the TinyFish context also comes
from built-in fixtures, and the live-update button is disabled.

1. Start on **Live**, which means the active fixture snapshot in this demo.
   Click a terminal zone to inspect its queues, wait times, and alerts.
2. Use the timeline to inspect the 120-minute forecast.
3. Switch to **Simulate** to explore changes as a separate scenario.

The fixture demo exercises the same domain pipeline as the export-based mode:

```mermaid
flowchart LR
    A[Deterministic snapshot] --> B[Terminal map and monitoring]
    A --> C[120-minute forecast]
    A --> D[Separate scenario projection]
    C --> E[Decision recommendations]
    D --> E
```

The default URL without `?source=fixtures` loads the bundled Postgres-shaped
seed export if present, otherwise falls back to deterministic fixture rows.
A **PG EXPORT** badge does not imply a connection to a live airport or database.

The frontend entrypoint is `index.html` with the composition root in
`src/app/index.js`. See [ALGORITHMS.md](ALGORITHMS.md) for implementation
details and the [pitch](pitch/script.md) for the hackathon context.

If port `8000` is busy, change it in the server command and browser URL.

## Optional integrations

### Run the TinyFish live-update demo

For the hackathon demo, run the local Node server so the browser can request live TinyFish Search results without seeing your API key:

```bash
TINYFISH_API_KEY=... npm run demo:tinyfish
```

Then open:

```text
http://localhost:8000/
```

Press **Fetch live updates** in the sentinel header. The browser calls the local `/api/tinyfish/public-context` route, and that route calls `GET https://api.search.tinyfish.ai` with the `X-API-Key` header. The returned search results are normalized into `tinyfish-public-web` observations with freshness and confidence before the monitoring panel renders them.

Optional environment overrides:

```bash
PORT=8080 TINYFISH_SEARCH_QUERY="latest airport passenger congestion Vietnam" TINYFISH_API_KEY=... npm run demo:tinyfish
```

## Run the Back-End Domain Systems

Node.js is needed for the test runner and optional TinyFish demo. There is no separate long-running backend service for the domain logic. The backend systems are domain modules under `src/`:

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

This applies the migration and seed SQL when `DATABASE_URL` (and `psql`) are available, exports the Postgres rows and asserts each exported snapshot is exactly equal to its fixture counterpart, and always exercises the JavaScript seed path through the operational-database reader — asserting the snapshot series (`normal → peak → stale`) drives the expected monitoring, forecast, and recommendation behaviour the sentinel animation relies on.

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
