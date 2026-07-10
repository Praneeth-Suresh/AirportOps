# ADR 0003: Deliver Bounded Contexts as Separate Repositories

## Status

Accepted

## Date

2026-07-11

## Context

The product requires monitoring, prediction, simulation, and decision-support to evolve independently. Teams must be able to work on each context without waiting on unrelated contexts. We also need to support separate release cycles and avoid cross-context coupling as implementation complexity increases.

Sharing a single monorepo folder structure without explicit repo boundaries risks:

- accidental direct imports between contexts,
- hidden dependency coupling through shared internals,
- difficult parallel releases,
- and unclear ownership during API changes.

## Decision

Each bounded context is delivered as its own repository in the final product.

- `airport-ops-operational-state`
- `airport-ops-prediction`
- `airport-ops-monitoring`
- `airport-ops-simulation`
- `airport-ops-decision-support`
- `airport-ops-app-shell`
- `airport-ops-contracts` (shared contracts and versioned public value objects)

Cross-repository communication is restricted to:

1. shared public contracts from `airport-ops-contracts` and
2. each repository’s explicit public package/API interface.

No repository may import another repository’s implementation internals.

## Consequences

- **Benefit:** Smaller ownership boundaries and independent CI/build pipelines per repository.
- **Benefit:** Bounded contexts can be developed, tested, and released independently.
- **Benefit:** Repos can evolve at different speeds while keeping contracts explicit.
- **Tradeoff:** Additional cross-repo release and versioning discipline is required.
- **Tradeoff:** Initial setup cost is higher for repository tooling and local integration.
- **Tradeoff:** Some refactors may require contract version bumps.
