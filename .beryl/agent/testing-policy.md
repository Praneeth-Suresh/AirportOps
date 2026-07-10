# Testing Policy

## Test Strategy For This Product

The first tests protect connections between modules before any external integration or AI provider is introduced.

### Contract tests

- Validate `OperationalSnapshot` completeness, immutability, zone paths, role constraints, timestamps, freshness, and confidence.
- Validate `FlowForecast`, `ScenarioProjection`, and `DecisionOption` schemas at public entry points.
- Verify that scenario decisions cannot mutate the live snapshot.

### Deterministic domain tests

- Prediction produces stable flow and queue-pressure results from the same fixture snapshot and clock.
- Simulation changes projections when counters, staff movement, or shift timing changes.
- Invalid movement, role mismatch, rest-period violations, and impossible counter capacity are rejected.
- Decision support ranks options using measurable impact and includes rationale and confidence.
- Missing or stale inputs lower confidence and activate the documented fallback behavior.

### Connection tests

- A fixture adapter can produce a snapshot consumed by prediction, monitoring, simulation, and decision support without vendor services.
- The application shell can compose the public module interfaces without importing internal files.
- Monitoring distinguishes live state from forecast and scenario state.
- The assistant can render deterministic recommendations when the intelligence adapter is unavailable.

### Browser tests

When the web runtime exists, use Microsoft Playwright MCP for user-visible behavior:

- The map renders zones, staff dots, blue passenger flow, and red critical states.
- The landing transition changes from dark pre-landing to active post-landing state.
- The time slider changes displayed simulation points without changing live state.
- Selecting a zone or recommendation exposes details, freshness, confidence, and rationale.

## Command Matrix

| Check | Command | Status | Notes |
| --- | --- | --- | --- |
| Markdown sanity | `./.beryl/scripts/check-md.sh` | available | Checks unclosed fences and tabs |
| Test manifest immutability check | `./.beryl/scripts/check-tests-unchanged.sh` | available | Detects changes in configured test scope |
| Affected test gate | `./.beryl/scripts/check-affected.sh --worktree` | available | Selects related tests and uses full-test fallback when configured |
| Aggregate deterministic gate | `./.beryl/scripts/check.sh` | available | Runs repository deterministic checks |
| Format | `not available yet` | unavailable | Add a formatter if the project adopts one |
| Lint | `not available yet` | unavailable | Add lint when the project adopts a lint tool |
| Typecheck | `not available yet` | unavailable | Add typecheck if the project adopts TypeScript |
| Unit tests | `npm test` | available | Uses Node's built-in test runner |
| Integration tests | `npm test` | available | Current fixture connection tests run in the same command |
| E2E smoke | `not available yet` | unavailable | Use Playwright MCP once the web runtime exists |

## Default Loop

1. State the success checks and affected public contract.
2. Add or identify the smallest deterministic contract or behavior test.
3. Implement one vertical slice through the smallest necessary boundary.
4. Run the narrow contract/domain check, then the affected test gate, then `./.beryl/scripts/check.sh`.
5. For UI changes, verify generated output and browser behavior with Playwright MCP.
6. Repair only from actual tool output and record durable boundary changes in the design tree or an ADR.

## Affected Test Gate

`.beryl/agent/affected-tests.conf` uses `npm test` for both related and full test selections. Broad changes to contracts, adapters, persistence, or test strategy must use the full test command.

## Test Modification Rule

Existing tests may not be weakened. Intentional test changes require an explicit behavior/design change, an update via `./.beryl/scripts/update-test-manifest.sh`, and an explanation in the final handoff.

## Mocking Rules

- Mock external systems, clocks, randomness, network calls, and AI providers at adapter boundaries.
- Do not mock domain logic inside the same bounded context.
- Prefer deterministic fixture adapters over mocks for connection tests.
