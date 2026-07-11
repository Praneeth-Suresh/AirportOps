# ADR 0005: Staffing And Counter Feasibility Context For Queue Rearrangements

## Status

Accepted

## Date

2026-07-11

## Context

The simulator needs to show crowd levels and staffing context, then produce queue-management rearrangements that operators can evaluate before applying. Existing snapshots exposed queue, counter, and staff presence, but they did not carry enough feasibility data to explain whether a proposed rearrangement was operationally possible.

Without persisted staffing confidence, coverage units, counter opening limits, and transfer timing, decision support could recommend opening counters or moving staff without proving role coverage, freshness, or movement feasibility.

## Decision

Extend the operational-database and `OperationalSnapshot` data path with staffing and counter feasibility context:

- `counter_states` carries `max_open_count`, `open_lead_minutes`, `observed_at`, `confidence_score`, and `confidence_basis`.
- `staff_states` carries `coverage_units`, `observed_at`, `confidence_score`, and `confidence_basis`.
- `zone_role_transfer_rules` records same-role transfer feasibility between zones.
- The operational-database reader exposes these values through `OperationalSnapshot` instead of allowing downstream contexts to query database tables.
- Monitoring derives per-zone staffing context from the snapshot.
- Decision support uses that context to return only measurable queue-management rearrangements.

## Consequences

- **Benefit:** Simulator recommendations can cite staffing gaps, relief candidates, openable counters, transfer time, confidence, and expected queue-pressure relief.
- **Benefit:** Staff and counter freshness affect recommendations through the existing snapshot contract.
- **Benefit:** Passenger visibility remains aggregated; no passenger identity data is added.
- **Tradeoff:** The snapshot contract now carries more operational feasibility metadata and needs versioning care when split into separate repositories.
- **Tradeoff:** Transfer rules are static fixture/configuration data until a live workforce-policy adapter exists.
