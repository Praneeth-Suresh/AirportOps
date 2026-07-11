# Agent Rules

## Always-On Operating Defaults

1. Route work through `.beryl/agent/task-routing.md` and the matching workflow skill before editing.
2. Treat ratified feature implementation as `adding-features` work by default.
3. Use `.beryl/agent/session-state.md` only for temporary session-specific state and clear it when complete.
4. After implementation edits, run the configured formatter, narrow checks, and `./.beryl/scripts/check.sh`.
5. Never weaken tests to make implementation pass.
6. If tests change intentionally, run `./.beryl/scripts/update-test-manifest.sh` and explain the test and manifest changes.
7. Do not use sub-agents unless the user explicitly asks for them.

## Project-Specific Build Rules

1. Build the connection layer before feature screens or AI behavior.
2. Define and test `OperationalSnapshot`, `FlowForecast`, `ScenarioProjection`, and `DecisionOption` before connecting live adapters.
3. Keep monitoring, simulation, and decision support as separate modules with explicit public entry points.
4. Route all external systems through adapters. Domain modules must not import vendor SDKs, HTTP objects, ORM records, or UI component internals.
5. Use the dependency direction recorded in `architecture.md`; do not make monitoring, simulation, and decision support call one another directly.
6. Treat counter, passenger-movement, and shift changes as immutable simulation inputs until a separately approved execution workflow exists.
7. Preserve data freshness and confidence through every prediction, projection, and recommendation.
8. Implement deterministic rule-based behavior before adding an AI/LLM provider.
9. Keep passenger visibility aggregated and avoid personally identifying analytics.
10. For P2 pilot-scoped work, build monitoring primitives for queue length, estimated wait time, check-in counter utilization, abnormal crowding, and operational alerts before advanced AI explanation or assistant polish.
11. Use terms from `.beryl/agent/ubiquitous-language.md` in code, tests, and documentation.
12. In the final product, each bounded context is a separate repository and must be independently buildable and testable. Cross-context communication must use public APIs and shared contracts only.

## Before Coding

1. Read the routing file, matching workflow skill, and relevant canonical files.
2. Identify the bounded context and public entry point affected.
3. State success checks: expected artifact, narrow command, broader command, generated/browser evidence when applicable, and user-visible behavior.
4. State commit boundaries before implementation.
5. Confirm a user-ratified plan exists before feature implementation.
6. For ambiguous boundary decisions, update the design tree or create an ADR before coding.

## While Coding

1. Work in one vertical slice at a time.
2. Define public contracts and validators before implementation details where possible.
3. Do not reach into another bounded context's internals.
4. Keep live state immutable from simulation and recommendation code.
5. Do not expose feature-slice bookkeeping to the user.
6. For web app or HTML/CSS work, use Microsoft Playwright MCP for browser verification.

## Before Finishing

1. Run the configured formatter, narrow checks, task-specific checks, and `./.beryl/scripts/check.sh`.
2. Update the glossary, design tree, architecture, or ADR when durable design knowledge changes.
3. Report changed files by commit boundary, checks run, checks skipped/unavailable, test-manifest changes, skills used, and temporary session-state status.
