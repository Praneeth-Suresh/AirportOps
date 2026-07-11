# Decision Support Slice Plan

This plan defines the Decision Support slice that operates on the logic and data described in `data.md`.

Decision Support turns processed operational data into ranked, explainable, advisory options for airport operators. It must not ingest raw airport feeds directly, query Postgres tables directly, or execute operational changes. It consumes public contracts and returns `DecisionOption` values.

## Purpose

The slice answers one operational question:

```text
Given the current airport state, forecast pressure, alerts, and scenario projections,
what should an operator consider doing next, why, and with what confidence?
```

The output is advisory. Operators remain responsible for approving counter, routing, and staffing changes.

## Boundary

Decision Support owns:

- Ranking candidate options.
- Explaining why an option exists.
- Comparing expected impact, urgency, feasibility, and confidence.
- Producing `DecisionOption` contracts.
- Producing human-readable recommendation text from already-computed evidence.

Decision Support does not own:

- Raw airport ingestion.
- Postgres schema or SQL queries.
- Operational snapshot assembly.
- Forecast calculation.
- Simulation projection calculation.
- Monitoring analytics calculation.
- Automatic execution of staff, counter, or passenger-routing decisions.

Allowed data flow:

```text
OperationalDatabase
  -> OperationalSnapshot
  -> MonitoringAnalytics / OperationalAlert
  -> FlowForecast
  -> ScenarioProjection
  -> DecisionSupportService.options(...)
  -> DecisionOption[]
```

Forbidden data flow:

```text
DecisionSupportService
  -> airport_ops SQL tables
  -> raw airport source payloads
```

## Input Contracts

Decision Support should receive these public values:

| Input | Source | Required fields |
| --- | --- | --- |
| `OperationalSnapshot` | Operational database reader / operational state | `asOf`, `airport.paths`, `airport.transferRules`, `zones`, `counters`, `staff`, `flights`, `passengerFlows`, `observations` |
| `FlowForecast` | Prediction service | `generatedAt`, `horizon`, `points`, `confidence`, `assumptions` |
| `ScenarioProjection[]` | Simulation service | `scenarioId`, `decisions`, `points`, `deltaFromBaseline`, `confidence` |
| `OperationalAlert[]` | Monitoring analytics | `alertId`, `zoneId`, `type`, `severity`, `lifecycleState`, `message`, `evidence`, `confidence`, `freshness` |
| `QueueState[]` | Monitoring analytics, optional but preferred | `zoneId`, `queueLength`, `estimatedWaitMinutes`, `serviceRatePerMinute`, `freshness`, `confidence`, `severity` |
| `CounterUtilization[]` | Monitoring analytics, optional but preferred | `zoneId`, `openCounters`, `availableCounters`, `busyCounters`, `utilizationRatio`, `status`, `confidence` |
| `StaffingContext[]` | Monitoring analytics, optional but preferred | `zoneId`, `roleRequired`, `activeCoverageUnits`, `requiredCoverageUnits`, `staffingGap`, `openCounterCapacity`, `reliefCandidates`, `confidence` |

The current minimal interface already supports:

```js
DecisionSupportService.options(snapshot, forecast, projections, operationalAlerts)
```

The target interface should accept monitoring analytics as a named input object once the slice expands:

```js
DecisionSupportService.options({
  snapshot,
  forecast,
  projections,
  operationalAlerts,
  queueStates,
  counterUtilizations,
  staffingContexts,
})
```

## Output Contract

Decision Support returns `DecisionOption[]`.

Each option should include:

| Field | Meaning |
| --- | --- |
| `optionId` | Stable ID derived from decision type, zone, time window, and scenario/projection. |
| `rank` | Ordered priority among returned options. |
| `relatedAlertId` | Alert that triggered or supports the option, when available. |
| `decision` | Candidate scenario decision, such as counter-capacity, staff-reassignment, or passenger-movement. |
| `affectedZones` | Zones impacted by the proposed option. |
| `timeWindow` | Forecast or scenario window where impact is expected. |
| `expectedImpact` | Queue-pressure drop, wait-time reduction, passengers relieved, staffing effect, and counter-capacity effect. |
| `rationale` | Evidence labels explaining why the option was suggested. |
| `confidence` | Trust score and basis derived from input confidence. |

## Candidate Option Types

### 1. Counter Capacity Option

Use when:

- A zone is forecast at warning or critical queue pressure.
- The zone has available counter capacity.
- Required staff role can support opening more counters.
- Opening lead time is useful within the forecast horizon.

Decision shape:

```text
type: counter-capacity
zoneId
openDelta
roleRequired
openLeadMinutes
pressureDrop
```

Expected impact:

- Reduced queue pressure.
- Reduced estimated wait time.
- Increased service throughput.
- Higher counter utilization until pressure stabilizes.

### 2. Staff Reassignment Option

Use when:

- A pressured zone has a staffing gap.
- Another zone has eligible relief staff.
- Transfer rules allow the move.
- Candidate staff are active or available and not near rest-rule violation.

Decision shape:

```text
type: staff-reassignment
role
fromZoneId
toZoneId
coverageUnits
transferMinutes
pressureDrop
```

Expected impact:

- Reduced staffing gap.
- Ability to open or sustain counters.
- Reduced queue pressure after transfer lead time.

### 3. Passenger Movement Option

Use when:

- Counter or staff relief is not feasible quickly enough.
- Valid movement paths exist.
- A destination zone can absorb passenger load.
- Passenger movement is advisory and operationally valid.

Decision shape:

```text
type: passenger-movement
fromZoneId
toZoneId
passengers
pressureDrop
```

Expected impact:

- Reduced local crowding.
- Shifted passenger pressure to a valid lower-pressure zone.
- Possible effect on downstream queues that must be shown in rationale.

### 4. Shift Timing Option

Use when:

- Forecast shows upcoming pressure within the shift planning window.
- Eligible staff can start earlier or delay rotation within policy.
- Rest and shift constraints remain valid.

Decision shape:

```text
type: shift-timing
role
zoneId
startDeltaMinutes
endDeltaMinutes
pressureDrop
```

Expected impact:

- Better coverage before a predicted surge.
- Reduced staffing-demand gap across forecast points.

## Decision Logic

### Step 1: Build Zone Pressure Context

For each zone:

1. Read current occupancy and capacity from `OperationalSnapshot.zones`.
2. Read queue length and wait time from `QueueState` when available.
3. Read forecast `queuePressure`, `expectedOccupancy`, `staffingDemand`, and `status`.
4. Read alerts for that zone.
5. Mark the zone as a candidate when any condition is true:
   - forecast queue pressure is `>= 0.72`;
   - queue severity is `watch` or `critical`;
   - operational alert severity is `watch` or `critical`;
   - counter utilization is `saturated` or `overloaded`;
   - staffing gap is greater than zero.

### Step 2: Build Feasibility Context

For each candidate zone:

1. Find the counter bank for the zone.
2. Calculate open counter capacity:
   - `openCounterCapacity = max(0, maxOpen - open)`.
3. Calculate active coverage:
   - Sum `coverageUnits` for staff in the zone with the required role and active availability.
4. Calculate required coverage:
   - Use open counters, forecast staffing demand, or monitoring `requiredCoverageUnits`.
5. Calculate staffing gap:
   - `staffingGap = max(0, requiredCoverageUnits - activeCoverageUnits)`.
6. Find relief candidates:
   - same role;
   - active or available;
   - rest time above policy threshold;
   - transfer rule allows movement to the candidate zone.
7. Sort relief candidates by:
   - shortest transfer time;
   - highest coverage units;
   - highest confidence;
   - least negative impact on origin zone.

### Step 3: Compare Scenario Projections

For each scenario projection:

1. Match projection zones to forecast zones.
2. Calculate queue-pressure drop:
   - `forecast.queuePressure - projection.queuePressure`.
3. Calculate passengers relieved:
   - `forecast.expectedOccupancy - projection.expectedOccupancy`.
4. Calculate wait-time reduction:
   - Use explicit projected wait time when available;
   - otherwise estimate from queue-pressure drop and service rate.
5. Discard projections with no measurable improvement.
6. Attach the matching scenario decision as the candidate option decision.

### Step 4: Generate Candidate Options

Generate options in this priority order:

1. Staff reassignment when staffing gap blocks relief and valid staff can move.
2. Counter capacity when counters can be opened and staff coverage exists or can be created.
3. Passenger movement when staffing/counter relief is not feasible or is too slow.
4. Shift timing when pressure is forecast but not yet critical.

The first build can generate one best option per affected zone. Later builds can return multiple alternatives per zone.

### Step 5: Score And Rank Options

Each option gets a numeric ranking score. The exact weights can evolve, but the first deterministic model should be simple:

```text
score =
  impactScore
  + urgencyScore
  + feasibilityScore
  + confidenceScore
  - riskPenalty
```

Suggested components:

| Component | Rule |
| --- | --- |
| `impactScore` | Higher for larger queue-pressure drop, wait-time reduction, and passengers relieved. |
| `urgencyScore` | Higher when alert severity is critical, lifecycle is new/escalated, or forecast pressure is high soon. |
| `feasibilityScore` | Higher when staff/counter resources are available and transfer/opening time is short. |
| `confidenceScore` | Use the minimum or weighted minimum of alert, forecast, projection, staffing, and counter confidence. |
| `riskPenalty` | Increase when data is stale, movement path is uncertain, origin zone would become pressured, or rest constraints are tight. |

Sort by:

1. Highest ranking score.
2. Highest expected queue-pressure drop.
3. Highest severity.
4. Earliest useful time window.
5. Stable `optionId` as a tie-breaker.

### Step 6: Build Rationale

Each option must include rationale that can be shown to the operator. Rationale should cite facts, not generic advice.

Include:

- Triggering alert and severity.
- Forecast pressure and time window.
- Queue length and estimated wait time when available.
- Counter utilization and open capacity.
- Staffing gap and relief candidate details.
- Scenario comparison and expected improvement.
- Confidence/freshness caveat when data is stale or low confidence.

Example rationale:

```text
Check-in A has a critical counter-saturation alert.
Forecast reaches 95% queue pressure within the horizon.
One ground-staff coverage unit is short.
Bag Drop A has eligible ground staff that can transfer in 4 minutes.
Scenario comparison shows a measurable pressure reduction.
```

### Step 7: Calculate Confidence

Confidence should not imply certainty. Use the weakest material input as the default:

```text
confidence.score = min(
  alert.confidence.score,
  forecast.confidence.score,
  projection.confidence.score,
  staffingContext.confidence.score,
  counterUtilization.confidence.score
)
```

Then apply reductions:

- Reduce for stale source observations.
- Reduce for missing queue metrics.
- Reduce for inferred flight passenger loads.
- Reduce for unsupported scenario assumptions.
- Reduce for missing transfer rules or fallback transfer times.

The confidence basis should explain the limiting factor, not just say "model confidence".

## Data Dependencies From `data.md`

Decision Support depends on these processed data classes:

| Processed class | Decision Support use |
| --- | --- |
| `OperationalSnapshot` | Canonical live state, zones, counters, staff, flights, paths, transfer rules. |
| `QueueState` | Queue length, estimated wait, severity, freshness, confidence. |
| `CounterUtilization` | Counter saturation and available capacity. |
| `StaffingContext` | Role requirements, staffing gap, relief candidates, transfer feasibility. |
| `OperationalAlert` | Trigger, severity, lifecycle, evidence. |
| `FlowForecast` | Future queue pressure, occupancy, staffing demand, horizon. |
| `ScenarioProjection` | Expected impact and baseline deltas. |
| `ScenarioDecision` | Candidate operational change being evaluated. |

It should not depend on these raw ingested classes:

- Raw camera payloads.
- Raw floor-plate payloads.
- Raw roster payloads.
- Raw flight feed payloads.
- SQL table records.

## Implementation Plan

### Phase 1: Contract Cleanup

1. Extend the `DecisionOption` validator to check expected impact fields used by the UI and tests.
2. Define a stable `DecisionSupportRequest` shape.
3. Keep backward compatibility with the current positional method until the app shell is updated.
4. Add contract tests for missing projection, missing alert, stale data, and no-improvement cases.

### Phase 2: Zone Context Builder

1. Add a pure function that builds `DecisionZoneContext[]` from snapshot, forecast, alerts, and monitoring analytics.
2. Include pressure, queue, counter, staffing, flight, freshness, and confidence data.
3. Test one normal pressured zone and one zone excluded because it is healthy.

### Phase 3: Feasibility Engine

1. Add deterministic feasibility functions for:
   - counter capacity;
   - staff reassignment;
   - passenger movement;
   - shift timing.
2. Validate transfer rules, role eligibility, rest constraints, and counter max-open constraints.
3. Return feasibility reasons even when an option is rejected.

### Phase 4: Scenario Impact Evaluator

1. Compare each projection against the baseline forecast.
2. Calculate queue-pressure drop, passengers relieved, estimated wait reduction, staffing gap change, and counter capacity effect.
3. Discard options that do not improve the affected zone or that worsen a constrained downstream zone.

### Phase 5: Ranking And Rationale

1. Implement deterministic score calculation.
2. Sort options by score and stable tie-breakers.
3. Generate rationale from concrete evidence.
4. Include confidence basis that identifies the limiting confidence input.

### Phase 6: App-Shell Presentation Contract

1. Ensure every `DecisionOption` contains display-ready labels for:
   - action;
   - affected zone;
   - expected impact;
   - time window;
   - rationale;
   - confidence and freshness caveat.
2. Keep presentation labels separate from ranking logic where possible.
3. Do not let the app shell calculate decision impact.

### Phase 7: Optional AI Explanation Adapter

Only after deterministic options are correct:

1. Add an `IntelligenceAdapter` that rewrites or summarizes already-computed options.
2. Do not let AI invent unsupported options.
3. Require AI output to cite the original option IDs and rationale evidence.
4. Fall back to deterministic text when the adapter is unavailable.

## Acceptance Criteria

- Source-level check: `DecisionSupportService` consumes contract-shaped inputs only and does not import database internals.
- Data check: every option can trace to at least one alert, forecast point, projection delta, or explicit scenario decision.
- Impact check: options with no positive projected impact are not returned.
- Feasibility check: staff-reassignment options respect role, rest, and transfer rules.
- Confidence check: stale or low-confidence inputs lower option confidence and appear in rationale.
- User-visible check: an operator can see what action is suggested, where, why, expected impact, confidence, and supporting evidence.
- Test command: `npm test`.
- Broader command: `./.beryl/scripts/check.sh`.

## Suggested Tests

Add deterministic tests for:

1. Critical alert plus positive projection returns a ranked option.
2. Staff reassignment is preferred when a staffing gap exists and transfer is valid.
3. Counter capacity is preferred when no staffing gap exists and counters can open.
4. Passenger movement is returned when staff and counter relief are infeasible.
5. Options are discarded when scenario projection does not improve queue pressure.
6. Stale queue or roster data lowers confidence.
7. Missing transfer rules prevent staff-reassignment unless an approved fallback exists.
8. Decision Support does not mutate `OperationalSnapshot`.

## Commit Boundaries For Implementation

### Commit 1: Request Shape And Tests

Files:

- `src/decision-support/index.js`
- `src/contracts/index.js`
- `tests/airport-ops-flow.test.js`

Checks:

```bash
npm test
```

### Commit 2: Zone Context And Feasibility

Files:

- `src/decision-support/index.js`
- focused tests in `tests/airport-ops-flow.test.js` or a new decision-support test file

Checks:

```bash
npm test
```

### Commit 3: Ranking, Rationale, Confidence

Files:

- `src/decision-support/index.js`
- tests covering ranking and confidence

Checks:

```bash
npm test
./.beryl/scripts/check-affected.sh --worktree
```

### Commit 4: App-Shell Display Integration

Files:

- `src/app/index.js`
- `src/app/styles.css` only if display layout changes
- browser verification artifacts if the project adds Playwright MCP coverage

Checks:

```bash
npm test
./.beryl/scripts/check.sh
```

## Risks

| Risk | Mitigation |
| --- | --- |
| Decision Support becomes a hidden simulator | Keep projection math in simulation; Decision Support only compares projections and ranks options. |
| Decision Support leaks database dependency | Consume `OperationalSnapshot` and monitoring/prediction/simulation contracts only. |
| AI generates unsupported advice | Add AI only as an explanation adapter over deterministic `DecisionOption` values. |
| Recommendations ignore stale data | Confidence and rationale must surface freshness caveats. |
| Staff reassignment harms the origin zone | Feasibility must check origin zone pressure before suggesting a move. |
| Too many options overwhelm operators | Return a small ranked list, initially one best option per affected zone. |

## First Useful Slice

The first implementation slice should be:

```text
Build a DecisionSupportRequest object from snapshot, forecast, projection, and monitoring analytics;
generate ranked options using deterministic feasibility, impact, and confidence scoring;
prove staff-reassignment, counter-capacity, and no-improvement paths with tests.
```

This is the smallest slice that validates the full data flow from `data.md` into operator-facing decision options.
