# Architecture

## Organizing Boundary

The system is split into domain modules that communicate through public entry points. Infrastructure adapters translate external data into domain values. The application shell is the composition root: it wires modules together and owns navigation/presentation state, but it does not calculate passenger flow or recommendations.

## Repository Topology (Hard Requirement)

Each bounded context in `.beryl/agent` maps to an independent repository in the final product:

- `airport-ops-operational-state`
- `airport-ops-prediction`
- `airport-ops-monitoring`
- `airport-ops-simulation`
- `airport-ops-decision-support`
- `airport-ops-operational-database`
- `airport-ops-app-shell`

Shared contracts for these repositories live in `airport-ops-contracts` and include `OperationalSnapshot`, `QueueState`, `CounterUtilization`, `CrowdingEvent`, `OperationalAlert`, `FlowForecast`, `ScenarioProjection`, `DecisionOption`, and all shared value-object schemas.

The current monorepo folder structure (`src/operational-state`, etc.) is treated as staging layout only; implementation boundaries must remain compatible with eventual repo separation.

## Bounded Contexts

| Context | Owns | Does Not Own | Public Entry Point |
| --- | --- | --- | --- |
| Operational State | Airport topology, zones, counters, staff, flights, observations, freshness, confidence, and validated `OperationalSnapshot` | Forecast algorithms, UI state, vendor records, recommendation text | `airport-ops-operational-state` repository package interface |
| Prediction | Baseline passenger-flow, queue-pressure, and staffing-demand forecasts; forecast confidence | Raw vendor payloads, scenario decisions, UI rendering, AI prose | `airport-ops-prediction` repository package interface |
| Monitoring | Live map read model, queue states, counter utilization, crowding events, operational alerts, zone status, movement display, landing transition state, and detail selection | Canonical operational data, forecast calculation, scenario mutation | `airport-ops-monitoring` repository package interface |
| Simulation | Scenario decision validation, short-horizon projections, baseline comparison, and time-slider data | Live-state ingestion, recommendation ranking, external command execution | `airport-ops-simulation` repository package interface |
| Decision Support | Ranked `DecisionOption` values, recommendations, questions, rationale, and assistant state | Forecast calculation, simulation calculation, direct vendor calls, automatic execution | `airport-ops-decision-support` repository package interface |
| Operational Database | Postgres schema, migrations, persisted operational rows, seed data, immutable snapshot assembly, and database reader APIs | Forecast algorithms, simulation algorithms, monitoring analytics, recommendation ranking, UI rendering | `airport-ops-operational-database` repository package interface |

The application shell is not a bounded context. It composes the public entry points above and is expected at `src/app/index.ts` or the equivalent project composition root.

## Shared Contracts

These contracts are the only cross-context data required for the first build:

```text
OperationalSnapshot
  asOf: Instant
  airport: AirportLayout
    paths: ZonePath[]
    transferRules: ZoneRoleTransferRule[]
  zones: ZoneState[]
  counters: CounterState[]
    maxOpen: Count
    openLeadMinutes: DurationEstimate
    observedAt: Instant
    confidence: Confidence
  staff: StaffState[]
    coverageUnits: Count
    observedAt: Instant
    confidence: Confidence
  flights: FlightState[]
  passengerFlows: PassengerFlow[]
  observations: ObservationMetadata[]

QueueState
  zoneId: ZoneId
  queueLength: CountEstimate
  estimatedWaitMinutes: DurationEstimate
  serviceRatePerMinute: ServiceRate
  observedAt: Instant
  freshness: Freshness
  confidence: Confidence

CounterUtilization
  zoneId: ZoneId
  openCounters: Count
  availableCounters: Count
  busyCounters: CountEstimate
  utilizationRatio: Ratio
  status: underused | normal | saturated | overloaded
  confidence: Confidence

CrowdingEvent
  eventId: EventId
  zoneId: ZoneId
  severity: watch | critical
  threshold: ThresholdDescription
  detectedAt: Instant
  confidence: Confidence

OperationalAlert
  alertId: AlertId
  zoneId: ZoneId
  type: AlertType
  severity: watch | critical
  lifecycleState: new | acknowledged | escalated | resolved | stale
  evidence: Evidence[]
  confidence: Confidence

FlowForecast
  generatedAt: Instant
  horizon: TimeWindow
  points: ForecastPoint[]
  confidence: Confidence
  assumptions: Assumption[]

ScenarioProjection
  scenarioId: ScenarioId
  decisions: ScenarioDecision[]
  points: ProjectionPoint[]
  deltaFromBaseline: ProjectionDelta[]
  confidence: Confidence

DecisionOption
  optionId: OptionId
  decision: ScenarioDecision
  affectedZones: ZoneId[]
  timeWindow: TimeWindow
  expectedImpact: ImpactSummary
  rationale: Rationale[]
  confidence: Confidence
```

The implementation language may change the syntax, but not the ownership or semantics of these contracts without an ADR.

## Dependency Direction

```text
External systems
    -> infrastructure adapters
    -> Operational Database / persisted operational rows
    -> Operational State / OperationalSnapshot
    -> Monitoring analytics / QueueState / CounterUtilization / OperationalAlert
    -> Prediction / FlowForecast
    -> Monitoring read model
    -> Simulation / ScenarioProjection
    -> Decision Support / DecisionOption
    -> application shell and UI modules
```

Monitoring may read `OperationalSnapshot`, monitoring analytics values, and `FlowForecast`. Simulation may read `OperationalSnapshot` and `FlowForecast`. Decision Support may read `OperationalSnapshot`, `FlowForecast`, `ScenarioProjection`, and explicit `OperationalAlert` values passed through public interfaces. No feature context imports another context's internal files, and Monitoring, Simulation, and Decision Support do not call one another directly.

Repository boundary: each arrow crossing a bounded-context line must pass through a stable public package contract and optional API surface published by that repository. No repository may depend on another repository’s internals or test fixtures.

## Ports And Adapters

Keep external access behind ports owned by the relevant domain/application boundary:

- `FlightScheduleAdapter` maps flight schedules and passenger-load estimates.
- `ManpowerAdapter` maps roles, assignments, shifts, and rest constraints.
- `OccupancyAdapter` maps aggregated camera/floor-plate observations.
- `AirportMapAdapter` provides cached topology and render geometry.
- `IntelligenceAdapter` turns already-computed options into explanations or questions.
- `Clock` supplies deterministic time to snapshots and simulations.

Adapters may depend on SDKs, HTTP clients, persistence, and vendor types. Domain modules may depend only on port interfaces and domain contracts.

## Boundary Rules

0. Bounded context boundaries are also repository boundaries in the final product; independent versioning and releases are required.
1. A context may import only another context's public entry point.
2. Internal files of another context are forbidden imports.
3. External APIs, SDKs, persistence details, and UI frameworks must be accessed through adapters or application composition code.
4. Domain logic must not depend directly on HTTP objects, ORM records, UI state, map objects, or vendor client types.
5. `OperationalSnapshot`, `FlowForecast`, `ScenarioProjection`, and `DecisionOption` must carry freshness/confidence where uncertainty can affect a decision.
6. Simulation decisions are immutable scenario inputs; they must not mutate live operational state.
7. AI output is explanatory and advisory. It cannot introduce a recommendation that is not traceable to a forecast, projection, rule, or explicit operator input.
8. Simulation, monitoring, prediction, and decision support must not query Postgres tables directly; they consume `OperationalSnapshot` and other public contracts assembled by the operational-database context.

## Forbidden Import Policy

- `src/operational-state/**` -> `src/prediction/**`, `src/simulation/**`, `src/monitoring/**`, `src/decision-support/**`
- `src/prediction/**` -> `src/simulation/**`, `src/decision-support/**`, `src/monitoring/**`
- `src/monitoring/**` -> `src/simulation/**`, `src/decision-support/**`
- `src/simulation/**` -> `src/decision-support/**`
- Any domain context -> `infrastructure/**` internals or vendor SDKs
- Any domain context -> application UI state or component internals

Repository-level equivalent (final product):
- `airport-ops-operational-state` may only depend on `airport-ops-contracts` and `airport-ops-operational-state` public API.
- `airport-ops-prediction` may only depend on `airport-ops-contracts`, `airport-ops-operational-state` public API, and its own package internals.
- `airport-ops-monitoring` may only depend on `airport-ops-contracts`, `airport-ops-operational-state` public API, and `airport-ops-prediction` public API.
- `airport-ops-simulation` may only depend on `airport-ops-contracts`, `airport-ops-operational-state` public API, and `airport-ops-prediction` public API.
- `airport-ops-decision-support` may only depend on `airport-ops-contracts`, `airport-ops-operational-state` public API, `airport-ops-prediction` public API, and `airport-ops-simulation` public API.
- `airport-ops-operational-database` may only depend on `airport-ops-contracts`, Postgres migrations/seeds it owns, and adapter outputs that have been normalized into operational rows.

## First Public Interfaces To Implement

1. `OperationalStateReader.getSnapshot(at)`
2. `PredictionService.forecast(snapshot, request)`
3. `MonitoringViewModel.from(snapshot, forecast)`
4. `SimulationService.project(snapshot, forecast, decisions)`
5. `DecisionSupportService.options(snapshot, forecast, projections, operationalAlerts)`

These interfaces should be backed by deterministic fixture adapters before live integrations or AI providers are added.
