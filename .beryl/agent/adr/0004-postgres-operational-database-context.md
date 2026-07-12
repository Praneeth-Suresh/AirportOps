# ADR 0004: Use Postgres Behind an Operational Database Context

## Status

Accepted

## Date

2026-07-11

## Context

The airport operations product needs durable storage for airport layout, zone states, counters, staff, flights, passenger flows, observations, forecasts, simulation scenarios, alerts, and audit records. Simulation and analysis workflows need this data, but direct database access from those contexts would couple domain logic to persistence tables and make later repository separation harder.

The selected database technology is Postgres. The current implementation still runs without a live Postgres server, so the first slice needs schema artifacts and a deterministic reader that proves persisted operational rows can assemble the existing `OperationalSnapshot` contract.

## Decision

Create a separate operational-database bounded context.

The operational-database context owns:

- Postgres schema and seed artifacts.
- Persisted operational rows.
- Snapshot assembly into `OperationalSnapshot`.
- Public database reader APIs for other contexts.

Simulation, monitoring, prediction, and decision support consume `OperationalSnapshot`, `FlowForecast`, `ScenarioProjection`, `DecisionOption`, and related public contracts. They do not query Postgres tables or import database internals.

## Consequences

- **Benefit:** Postgres persistence can evolve without leaking table shape into simulation or analysis code.
- **Benefit:** Recommendations remain traceable to immutable snapshots and the source observations used to assemble them.
- **Benefit:** The future separate repository topology remains compatible with the current monorepo staging layout.
- **Tradeoff:** The operational-database context must maintain mapping code from relational rows into shared contracts.
- **Tradeoff:** A later live Postgres connection slice must add connection management, migrations execution, and environment configuration.
