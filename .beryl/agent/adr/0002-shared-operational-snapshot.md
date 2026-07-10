# ADR 0002: Shared Operational Snapshot And Staged Prediction Architecture

## Status

Accepted

## Date

2026-07-11

## Context

The product needs separate monitoring, simulation, and AI decision-support modules that work together. They depend on the same flight, passenger, staff, counter, zone, and sensor information, but those inputs arrive from different external systems and may be stale or incomplete.

Without a shared contract, each module could create a different version of current airport state. That would make the map, time-slider projections, and recommendations disagree. Direct calls between feature modules would also couple the UI to prediction and AI implementation details.

## Decision

Use a validated, immutable `OperationalSnapshot` as the canonical connection contract for the product.

- Infrastructure adapters normalize external systems into operational values and observations.
- Operational State owns snapshot validation, topology, assignments, constraints, freshness, and confidence.
- Prediction reads a snapshot and returns a `FlowForecast`.
- Monitoring reads the snapshot and forecast to build a live view model.
- Simulation reads the snapshot and forecast and returns a `ScenarioProjection` without mutating live state.
- Decision Support reads the snapshot, forecast, and projections and returns traceable `DecisionOption` values.
- The application shell composes public interfaces. Feature modules do not import one another's internals or call one another directly.
- Deterministic rule-based prediction and recommendations are required before hosted ML or AI services are introduced.

## Consequences

- **Benefit:** All views and recommendations use the same point-in-time data and can expose freshness and confidence consistently.
- **Benefit:** External integrations and AI providers can be replaced without changing domain modules.
- **Benefit:** Contract and fixture tests can prove the connections before live systems exist.
- **Tradeoff:** Snapshot validation and versioning add implementation work before the visual features.
- **Tradeoff:** Some data will be estimates; the UI must make uncertainty visible instead of hiding it.
- **Follow-up:** Record changes to the snapshot shape, module ownership, or adapter contracts in a new ADR or an update to this decision.
