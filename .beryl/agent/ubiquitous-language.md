# Ubiquitous Language

| Business Term | Technical Symbol | Definition | Constraints | Avoid |
| --- | --- | --- | --- | --- |
| Airport zone | `Zone` | A bounded operational area such as departure, arrival, immigration, security, entrance, or exit | Must have a stable identifier and valid inbound/outbound paths | `Area`, `Section` when referring to the domain object |
| Operational state | `OperationalSnapshot` | A validated point-in-time view of airport topology, passengers, flights, staff, counters, and observations | Immutable; includes `asOf`, freshness, and confidence metadata | `Data`, `CurrentState` |
| Observation | `Observation` | An aggregated measurement or event from a sensor or operational system | Must identify source, timestamp, and confidence; never implies personal identity | `TrackingRecord`, `RawEvent` in domain code |
| Passenger flow | `PassengerFlow` | Aggregated movement of passengers between zones during a time interval | No individual identity; has origin, destination, interval, and count/estimate | `CustomerPath`, `PersonMovement` |
| Queue pressure | `QueuePressure` | Estimated operational pressure caused by waiting passengers relative to capacity and service rate | Must carry an estimate and confidence, not an unqualified exact count | `Busy` as the only state |
| Queue length | `QueueState.queueLength` | Estimated number of passengers currently waiting in a zone queue | Must identify source, observation time, freshness, and confidence | Exact individual count |
| Estimated wait time | `QueueState.estimatedWaitMinutes` | Estimated minutes a passenger will wait based on queue length and service rate | Must be presented as an estimate with confidence | Guaranteed wait |
| Counter utilization | `CounterUtilization` | How much of an open counter bank is actively used in a zone | Must distinguish open, available, busy, underused, saturated, and overloaded states | Raw counter count |
| Crowding event | `CrowdingEvent` | Detected abnormal queue or density condition in an operational zone | Must include severity, threshold, detected time, freshness, confidence, and evidence | Generic busy flag |
| Operational alert | `OperationalAlert` | Lifecycle-managed alert shown to operations teams for queue, crowding, counter, or data-quality issues | Must include type, severity, lifecycle state, evidence, freshness, and confidence | Recommendation |
| Staff member | `StaffState` | Operational representation of available manpower and current assignment | Contains role and availability constraints; excludes unnecessary HR details | `Employee` when only operational state is needed |
| Counter capacity | `CounterCapacity` | Number of service counters open and usable in a zone for a time window | Must respect zone and role constraints | `CounterCount` without open/usable meaning |
| Flight state | `FlightState` | Scheduled or estimated flight event with arrival/departure timing and passenger-load estimate | Must distinguish scheduled, estimated, landed, and departed | `Plane` for the operational record |
| Forecast | `FlowForecast` | Predicted passenger flow, queue pressure, or staffing demand over a time horizon | Must include horizon, assumptions, freshness, and confidence | `Prediction` when the returned contract is meant |
| Scenario decision | `ScenarioDecision` | A proposed counter, passenger-movement, or shift change used only as simulation input | Must be validated and must not mutate live state | `Action` when it is not executed |
| Scenario projection | `ScenarioProjection` | Predicted result of applying scenario decisions to a baseline forecast | Must identify the scenario and delta from baseline | `SimulationResult` |
| Decision option | `DecisionOption` | A ranked, explainable option an operator could consider | Must identify impact, time window, affected zones, rationale, and confidence | `AIAnswer`, `Suggestion` |
| Recommendation | `Recommendation` | Human-readable advisory content derived from one or more decision options | Advisory only; must be traceable to supporting evidence | `Command`, `Instruction` |
| Confidence | `Confidence` | A bounded indication of how much an output can be trusted given its inputs | Must not be presented as certainty; should expose contributing assumptions | `Accuracy` unless measured against outcomes |
| Freshness | `Freshness` | How current an input or output is relative to its timestamp and expected update interval | Stale values must be visible to operators and affect confidence | `Live` as an unqualified claim |
| Simulation horizon | `TimeWindow` | The start, end, and resolution used for forecasting or scenario projection | Must distinguish historical, current, and projected time | `Timeline` without semantic time bounds |
| Website shell | `WebsiteShell` | The user-facing website composition layer for monitoring, simulation, and assistant views | Owns navigation and presentation state only; does not calculate forecasts, projections, or recommendations | `Frontend` when domain ownership matters |
| Operations surface | `OperationsSurface` | Dense, task-focused UI used by airport operators during active operations | Must support fast scanning, drill-in details, and clear live/scenario separation | `LandingPage`, `HeroPage` |
| Scalability priority | `ScalabilityPriority` | Product constraint that favors separable contexts, versioned contracts, adapter isolation, and stateless composition before advanced UI polish or AI sophistication | Must be visible in build sequence and acceptance checks | `PerformanceLater` |
| Live state | `LiveState` | Current validated operational data from an `OperationalSnapshot` | Must be visually distinct from forecasts and scenarios | `Realtime` when freshness is not guaranteed |
| Forecast state | `ForecastState` | Predicted near-term operational state from a `FlowForecast` | Must expose horizon, confidence, and assumptions | `FutureData` |
| Scenario state | `ScenarioState` | Projected operational state from a `ScenarioProjection` after applying scenario decisions | Must never be mistaken for live state or automatically applied | `WhatIfData` |
| AI assistant | `DecisionAssistant` | The presentation and orchestration layer that explains options and asks questions | Cannot calculate authoritative forecasts or execute decisions | `Agent` when referring to the pet UI |
| Adapter | `Adapter` | Boundary object that translates an external system into internal ports and contracts | Vendor types must stop at the adapter boundary | `ServiceHelper` |
| Bounded context | `BoundedContext` | A domain boundary with explicit ownership, language, and public entry point | Internal state is not imported by other contexts | `Module` when boundary ownership matters |
| Vertical slice | `VerticalSlice` | The smallest end-to-end behavior change through the required public boundaries | Must be testable in isolation | `BigRefactor` |
| Design concept | `DesignConcept` | The shared organizing model guiding architecture and implementation choices | Must remain coherent across contexts | `Idea`, `GeneralModel` |
| Design tree | `DesignTree` | Living map of open and settled design decisions | Updated when design moves | `PlanDump` |
| Feedback loop | `FeedbackLoop` | Generate-check-fix cycle using deterministic tools | Must include real tool output when implementation begins | `TryAgainLoop` |
| Success check | `SuccessCheck` | Pre-coding acceptance condition that proves a plan or feature worked | Names artifact, command, evidence, and user-visible behavior | `LooksGood` |
| Commit boundary | `CommitBoundary` | Proposed repo-history unit for implementation work | One purpose, expected files, and validating check command | `LargeMixedCommit` |
| Contracts repository | `ContractsRepository` | Shared package/repository containing public contracts consumed across bounded contexts | Must be source of truth for cross-context schemas and versioned compatibility | `SharedFolder` inside a service |
| Context repository | `ContextRepository` | A standalone repository containing one bounded context implementation | Must provide a public entry interface and preserve independence from other contexts | `ModuleFolder` |
| Inter-repo contract | `InterRepoContract` | The contract-based payload passed across repositories | Must be versioned, backward-compatible, and include freshness/confidence | `DirectObjectMutation` |
| Generated output | `GeneratedOutput` | Built artifact or output users or downstream tooling receive | Must be checked for static-site changes | `SourceOnlyVerification` |
| ADR | `ADR` | Architecture Decision Record for durable decisions | Required for lasting boundary, data, adapter, or test-strategy changes | `RandomNote` |
