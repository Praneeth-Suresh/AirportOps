# Design Tree

## Current Design Concept

The application is a connected decision-support system. A single validated `OperationalSnapshot` is the shared starting point for monitoring, prediction, simulation, and recommendations. Each module owns one transformation or user-facing concern and communicates only through explicit public contracts. External systems are replaceable adapters, and the application shell composes module outputs without owning domain calculations.

The first public interface is a website for airport operations users. The website is an operational control surface, not a marketing site: it should prioritize fast scanning, confident decisions, dense but readable information, and clear distinction between live state, forecast state, simulated state, and AI-assisted advice.

Scalability is the first design priority. The initial build must make the system easy to split, scale, and replace by preserving independent bounded contexts, versioned contracts, deterministic fixtures, adapter boundaries, and a presentation shell that does not own domain calculations.

## Initial Project Design Plan

1. Establish the shared contracts repository shape for `OperationalSnapshot`, `FlowForecast`, `ScenarioProjection`, and `DecisionOption`.
2. Build deterministic fixture adapters for flights, manpower, airport layout, occupancy, clock, and AI fallback so the whole website can run without live integrations.
3. Implement the operational-state context first, including snapshot validation, freshness, confidence, airport topology, zones, counters, staff, flights, and passenger-flow observations.
4. Implement a monitoring analytics slice that derives queue length, estimated wait time, check-in counter utilization, abnormal crowding events, operational bottlenecks, and real-time alert candidates from the snapshot.
5. Implement the prediction context behind `PredictionService.forecast(snapshot, request)` with a deterministic baseline for flow, queue pressure, wait-time trend, and staffing demand.
6. Implement the monitoring website module as the first visible screen: airport map, staff dots, passenger-flow treatment, landing transition, zone status, queue/wait/counter-utilization metrics, alerts, and details drawer.
7. Implement the simulation context behind `SimulationService.project(snapshot, forecast, decisions)` with counter, movement, and shift-timing scenario inputs.
8. Implement the decision-support context behind `DecisionSupportService.options(snapshot, forecast, projections)` using rule-based ranked options before any AI provider.
9. Implement the simulation website module: time slider, scenario controls, projected deltas, and clear scenario/live-state labeling.
10. Implement the assistant website module: visual assistant surface, recommendations, questions, rationale, confidence, freshness, and drill-in details.
11. Add integration, contract, and browser verification around the full website path: fixture snapshot -> monitoring analytics -> forecast -> monitoring -> simulation -> decision options -> rendered UI.
12. Add a Postgres-backed operational-database bounded context so simulation and analysis consumers receive contract-shaped snapshots from persisted operational rows rather than database internals.

## Open Decisions

| Decision | Options | Current Lean | Why |
| --- | --- | --- | --- |
| What is the first prediction implementation? | Rules and statistical baseline; hosted ML model; hybrid | Rules and statistical baseline behind a model port | It is deterministic, testable, and gives the AI layer a trustworthy fallback |
| How are live observations delivered? | Polling; event stream; hybrid | Hybrid, starting with polling adapters | It supports a simple first build while leaving room for real-time updates |
| What is the initial simulation horizon? | 30 minutes; 2 hours; full operating day | 2 hours with configurable resolution | It is useful for duty decisions without pretending to solve long-range planning |
| What occupancy data is available? | Camera analytics; floor plates; manual counts; combination | Aggregated camera/floor-plate signals with manual fixture fallback | The prediction contract should not depend on one sensor type |
| Which map technology renders the airport? | Existing airport map; GIS provider; static layout first | Static/cached airport layout first behind a map adapter | Domain behavior must not be coupled to a map vendor |
| How should recommendations be approved? | Read-only suggestions; in-app acknowledgement; external command | Read-only suggestions for the first build | Avoids accidental operational control and keeps scope bounded |
| How are bounded contexts released? | Shared monorepo; separate packages; separate repositories | Separate repositories per bounded context plus shared contracts repository | Enables independent team ownership, CI, and release cycles |
| Which website runtime should host the first UI? | Static ES modules; React/Vite; Next.js; server-rendered app; dashboard framework | Static ES modules until routing/server needs are proven | No dependency install is required, local checks are fast, and the bounded-context public APIs remain framework-agnostic |
| How should scalability be protected in the first build? | Scale UI only; scale backend only; contracts and repos first | Contracts, bounded-context APIs, fixture adapters, and stateless UI composition first | The product can scale teams, services, traffic, and integrations without rewriting the UI |

## Settled Decisions

| Decision | Choice | Date | ADR |
| --- | --- | --- | --- |
| How do modules share operational data? | A validated `OperationalSnapshot` is the canonical connection contract | 2026-07-11 | [ADR 0002](adr/0002-shared-operational-snapshot.md) |
| What is the dependency direction? | Adapters feed operational state; prediction reads state; simulation and monitoring read predictions; decision support reads all analytical outputs | 2026-07-11 | [ADR 0002](adr/0002-shared-operational-snapshot.md) |
| Are decisions executed automatically? | No; counter, movement, and shift changes are scenario inputs until explicitly approved and integrated later | 2026-07-11 | [ADR 0002](adr/0002-shared-operational-snapshot.md) |
| What is the first AI behavior? | Deterministic recommendations first, AI explanation/ranking through an adapter second | 2026-07-11 | [ADR 0002](adr/0002-shared-operational-snapshot.md) |
| Repository structure for bounded contexts | Independent repositories per bounded context with a shared contracts repository | 2026-07-11 | [ADR 0003](adr/0003-bounded-context-repositories.md) |
| Operational persistence | Postgres is owned by a separate operational-database bounded context that assembles public contracts | 2026-07-11 | [ADR 0004](adr/0004-postgres-operational-database-context.md) |
| Queue rearrangement feasibility data | Persist staff coverage, staff freshness, counter opening limits, and zone-role transfer rules; derive recommendations from snapshots | 2026-07-11 | [ADR 0005](adr/0005-staffing-rearrangement-context.md) |
| First public interface | Website app shell composed from bounded-context public APIs | 2026-07-11 | none yet |
| Primary design priority | Scalability before visual polish or AI sophistication | 2026-07-11 | none yet |
| Initial website runtime | Dependency-free static ES modules with Node's built-in test runner | 2026-07-11 | none yet |
| How the website consumes Postgres data | Export bridge: `database/export-rows.mjs` (psql, zero npm deps) writes a contract-shaped rows bundle to `database/export/operational-rows.json`; the app shell fetches it (`cache: no-store`) before first render and falls back to fixture rows when absent. SQL never leaves the operational-database context; a live API server is a possible follow-up slice reusing the same export SQL | 2026-07-12 | none yet |

## Pressure Points

- Sensor data may be delayed, unavailable, or inconsistent across zones; freshness and confidence must travel with every output.
- Passenger flow is aggregated and inferred, so the UI must avoid implying exact individual tracking.
- Staff movement and shift suggestions must respect role eligibility, rest periods, and zone constraints.
- The visual AI pet is a presentation choice; recommendation logic must remain usable without the pet or an AI provider.
- The time slider must distinguish observed history, current state, and projected scenario time.
- Live state and scenario state must never be merged silently in the same read model.
- Scalability work can become invisible to users; each infrastructure slice must still produce a demonstrable website behavior from fixtures.
- Website performance must hold when zones, counters, flights, passengers, and staff counts grow; expensive calculations belong in domain contexts, not rendering components.

## Build Sequence

1. Contracts repository shape, ports, validators, deterministic fixtures, and the snapshot read path.
2. Operational-state context with scalable snapshot validation and read access.
3. Monitoring analytics for queue length, estimated wait time, check-in counter utilization, abnormal crowding events, bottleneck classification, and real-time alert candidates.
4. Baseline flow, queue-pressure, wait-time trend, and staffing-demand predictions.
5. Browser-visible monitoring workflow backed by fixture data before simulation or AI assistant polish.
6. Scenario projection and comparison.
7. Rule-based decision options, followed by AI-assisted explanations.
8. Website app shell that composes monitoring, simulation, and assistant views through public interfaces only.
9. Browser-visible simulation and assistant workflows backed by fixture data before live integrations.

## Recording Rule (Design Tree vs ADR)

Add or update this file when:

- A decision is still evolving.
- You are comparing options before implementation.
- The choice may still change after one or two implementation iterations.

Create an ADR when:

- The decision changes module boundaries, persistence shape, adapter contracts, security model, naming conventions used across contexts, or test strategy.
- Future contributors are likely to revisit the choice without clear repo history.
