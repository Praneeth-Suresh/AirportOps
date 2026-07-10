# Project Brief

## Product Goal

Build an airport operations decision-support application for airport managers and duty operators so they can visualise passenger movement, understand current and predicted pressure, and make informed staffing and counter decisions.

The application is decision support, not autonomous control. Operators remain responsible for approving changes to counters, passenger routing, and staff shifts.

## Delivery Topology Requirement (Hard Constraint)

In the final product, each bounded context must be a separate repository:

- `operational-state`
- `prediction`
- `monitoring`
- `simulation`
- `decision-support`
- `app-shell` (composition and presentation shell)

All cross-context communication must go through versioned shared contracts (`OperationalSnapshot`, `FlowForecast`, `ScenarioProjection`, `DecisionOption`) and public context interfaces published by each repository.

No bounded-context repository may import another bounded context implementation or internals. A bounded context may only consume:

1. Its own public interface.
2. The shared contracts package.
3. External systems via its adapters.

This requirement is required to keep each bounded context independently buildable, testable, and releasable.

## Primary Users

- Airport operations managers who need an airport-wide view of demand and available resources.
- Duty operators who need to respond to congestion in specific departure or arrival zones.
- Workforce planners who need to compare staffing and shift options against expected flight demand.

## Primary Workflows

### 1. Monitoring

The monitoring module shows the current airport operating state on a map.

- Staff and manpower are shown as location dots with role and availability state.
- Passengers and passenger flow use blue visual treatment.
- Departure and arrival zones, counters, queues, and movement paths are visible.
- An incoming aircraft is shown flying toward the airport. The initial landing state is dark, then the airport view lights up when the flight lands and passenger movement begins.
- Red indicates busy or critical conditions and must be paired with a label or metric for accessibility.
- Selecting a zone, counter, staff group, or flight opens its details and data freshness/confidence.

Success condition: an operator can identify the busiest zone, the responsible constraint, and the affected upcoming flight without leaving the monitoring view.

### 2. Simulating choices

The simulation module provides short-term passenger-flow projections.

- A time slider selects a point in the near-term horizon.
- The operator can compare the current plan with proposed counter, movement, and shift changes.
- The view shows projected passenger volume, queue pressure, staff demand, and zone-to-zone movement as the slider changes.
- A simulation is clearly labelled as a scenario and cannot silently change live operations.

Success condition: an operator can test a staffing or counter decision and see its projected effect before applying it operationally.

### 3. AI provides options

The decision-support module turns current and simulated conditions into explainable options.

- A visual AI pet, currently a dog/pet motif, presents comments, recommendations, and questions.
- Recommendations identify the affected zone, time window, expected impact, confidence, and reason.
- The operator can select a recommendation to view the supporting details and compare alternatives.
- The assistant uses deterministic rules when AI services are unavailable and never presents a generated suggestion without its data basis.

Success condition: an operator receives a small ranked set of actionable options and can understand why each option was suggested.

## Decisions Enabled

- Counter capacity: how many counters to open in each zone and which zones can be scaled down.
- Passenger movement: whether and how to move people between valid airport zones.
- Shift timing: when staff start, rest, rotate, or end shifts within policy constraints.

These are initially simulation inputs. Applying a decision to an external workforce or airport-control system is out of scope for the first build.

## Data Domains

### Operational state

- Airport layout, zones, gates, counters, entrances, exits, and valid passenger paths.
- Current zone occupancy, queue estimates, throughput, and movement observations.
- Staff location, role, zone assignment, availability, rest time, and shift timing.
- Flight arrival/departure times, estimated passenger count, and peak/non-peak classification.
- Observation timestamp, source, freshness, and confidence for every live or inferred value.

### Passenger visibility

- Camera and floor-plate placement metadata for observing passenger movement.
- Aggregated counts and flows only for the first build; no facial recognition or unnecessary personal identity data.

### Prediction and decision data

- Historical and current observations used to estimate passenger flow and queue pressure.
- Forecast horizon and time resolution.
- Scenario inputs and projected deltas against the current plan.
- Decision constraints such as role eligibility, rest rules, zone capacity, and valid movement paths.

## Module Connections: Build This First

All modules connect through explicit public contracts. No feature module reads another module's internal state.

1. External adapters normalize flight, manpower, camera, map, and clock data into an `OperationalSnapshot`.
2. The prediction module consumes the snapshot and produces a `FlowForecast` with confidence and data freshness.
3. The monitoring module consumes the snapshot and forecast to build the live map view.
4. The simulation module consumes the snapshot and forecast plus scenario decisions to produce a `ScenarioProjection`.
5. The decision-support module consumes the snapshot, forecast, and scenario projections to produce ranked `DecisionOption` values, recommendations, and questions.
6. The application shell composes the monitoring, simulation, and assistant modules and owns navigation and presentation state only.

When this architecture is split to repositories, the same sequence applies across repository boundaries:

1. `app-shell` requests latest `OperationalSnapshot` and `FlowForecast`.
2. `app-shell` renders monitoring from those values and passes scenario requests to `simulation`.
3. `app-shell` requests options from `decision-support` using snapshot + forecast + projections.

The first implementation slice is the contracts, ports, validation, fixture data, and deterministic fallback path. The visual screens and AI provider are built on those connections rather than defining their own data models.

## Technical Delivery Order

1. **Prediction foundation:** define the operational snapshot, normalized event/observation inputs, time windows, confidence model, ports, deterministic fixtures, and snapshot storage/read access.
2. **Prediction features:** implement baseline passenger-flow, queue-pressure, and staffing-demand predictions behind the prediction public interface.
3. **Simulation:** implement short-horizon scenario projection and comparison against the baseline forecast.
4. **Decision support:** implement rule-based options first, then add an AI adapter that explains and ranks options using prediction and simulation outputs.
5. **Application modules:** connect monitoring, simulation controls, and the visual assistant to the shared public contracts.

## External Systems

| System | Why it exists | Interface owner | Failure fallback |
| --- | --- | --- | --- |
| Flight operations or schedule feed | Arrival/departure times and passenger loads | `FlightScheduleAdapter` in infrastructure | Use the last valid schedule and lower confidence |
| Manpower or rostering system | Staff roles, shifts, rest rules, and assignments | `ManpowerAdapter` in infrastructure | Use the last confirmed roster and mark it stale |
| Camera/floor-plate occupancy signals | Aggregated passenger counts and movement observations | `OccupancyAdapter` in infrastructure | Use the prediction model with higher uncertainty |
| Map/tile or airport-layout service | Render airport geometry and valid movement paths | `AirportMapAdapter` in infrastructure | Use a static cached layout |
| AI/LLM service | Explain and rank options and ask follow-up questions | `IntelligenceAdapter` in infrastructure | Use deterministic rule-based recommendations |
| Clock and scheduler | Consistent time for snapshots and simulations | `Clock` port in the application boundary | Use an injected deterministic clock in tests |

## Non-Goals

- Autonomous execution of staff, counter, or passenger-routing changes.
- Replacing HR, rostering, ticketing, immigration, security, or airport identity systems.
- Facial recognition or personally identifying passenger analytics.
- Long-range workforce optimisation beyond the short-term operational horizon.
- Treating AI output as authoritative when supporting data is stale, incomplete, or low confidence.

## Definition Of Done

1. Public contracts exist for `OperationalSnapshot`, `FlowForecast`, `ScenarioProjection`, and `DecisionOption`.
2. The module dependency direction is enforced: adapters -> operational state -> prediction -> simulation/monitoring -> decision support, with the application shell composing outputs.
3. Deterministic fixtures can drive the full connection path without external services.
4. Behavior tests cover a normal flow and edge cases for stale data, missing flight loads, invalid staff movement, and constrained counter capacity.
5. Monitoring, simulation, and assistant views expose data freshness/confidence and distinguish live state from scenarios.
6. The deterministic project gate and relevant project checks pass when the application runtime is configured.
7. No new illegal boundary crossings or direct vendor dependencies exist in domain modules.
