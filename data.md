# Airport Operations Data Processing

This file separates the two classes of database data used by the airport operations simulation:

1. **Ingested airport data:** values that arrive from airport systems, sensors, schedules, rosters, or manual feeds.
2. **Processed operational data:** validated, normalized, derived, or aggregated values used by monitoring, prediction, simulation, decision support, and user-facing views.

The operational database boundary is documented in `.beryl/agent/database.md`. Downstream contexts must consume public contracts such as `OperationalSnapshot`, not raw SQL tables.

## Data Class 1: Ingested Airport Data

Ingested data is source-owned. It should preserve source identity, observed time, freshness, confidence, and enough payload detail to reprocess later. It may be incomplete, stale, duplicated, or vendor-shaped.

| Data group | Example source | Incoming fields | Notes |
| --- | --- | --- | --- |
| Airport layout feed | Map/GIS/layout service | `airport_id`, `airport_name`, `terminal_id`, `map_version`, `zone_id`, `zone_label`, `zone_type`, `zone_capacity`, `zone_geometry`, `path_from_zone_id`, `path_to_zone_id`, `path_geometry`, `travel_time_minutes` | Mostly slow-changing reference data. Geometry may remain JSON until PostGIS is added. |
| Occupancy sensor feed | Camera aggregate, floor plates, edge analytics | `source`, `sensor_id`, `zone_id`, `observed_at`, `occupancy_count`, `density_per_square_meter`, `queue_length`, `active_service_load_per_minute`, `busy_counters`, `confidence_score`, `confidence_basis`, `raw_payload` | Must stay aggregated. Do not ingest passenger identity or face data. |
| Counter status feed | Check-in, bag drop, immigration, security systems | `counter_id`, `zone_id`, `counter_type`, `open_count`, `available_count`, `busy_count`, `out_of_service_count`, `max_open_count`, `open_lead_minutes`, `role_required`, `observed_at`, `source`, `confidence_score` | Incoming systems may report counters individually or as a bank; normalize to a counter bank per zone when needed. |
| Staff/manpower feed | Roster or workforce system | `staff_id` or `staff_group_id`, `role`, `zone_id`, `availability`, `coverage_units`, `shift_starts_at`, `shift_ends_at`, `break_status`, `rest_minutes_due`, `assignment_source`, `observed_at`, `confidence_score` | Operational staff state only. `coverage_units` can represent a staff group without storing unnecessary HR identity. |
| Staff transfer rules | Workforce policy or operations configuration | `airport_id`, `role`, `from_zone_id`, `to_zone_id`, `transfer_minutes`, `allowed`, `reason` | Static or slowly changing feasibility rules for simulator-only staff rearrangements. |
| Flight operations feed | Flight schedule or airport operations system | `flight_id`, `airline`, `flight_type`, `status`, `scheduled_at`, `estimated_at`, `actual_at`, `gate_zone_id`, `stand_id`, `estimated_passengers`, `load_factor`, `source`, `confidence_score` | Flight load can be estimated and must carry confidence. |
| Passenger flow feed | Sensor analytics or modelled flow feed | `from_zone_id`, `to_zone_id`, `interval_start`, `interval_minutes`, `estimated_count`, `source`, `confidence_score` | Aggregated movement only. |
| Manual operations input | Duty operator or planner | `input_id`, `operator_id`, `input_type`, `zone_id`, `value`, `reason`, `created_at`, `expires_at` | Use for manual overrides or missing source data. Keep audit trail. |
| Source health feed | Adapter/runtime monitoring | `source`, `status`, `last_successful_update_at`, `last_failed_update_at`, `latency_ms`, `error_code`, `confidence_impact` | Used to mark data stale or lower confidence. |

## Data Class 2: Processed Operational Data

Processed data is product-owned. It is created from ingested data by validation, normalization, aggregation, derivation, forecasting, simulation, or alerting. It should be traceable to source observations and immutable snapshots.

| Processed data | Database target | Fields | Created from |
| --- | --- | --- | --- |
| Airport reference model | `airports`, `zones`, `zone_paths` | `airport_id`, `name`, `map_version`, `zone_id`, `label`, `zone_type`, `capacity`, `service_rate_per_minute`, `geometry`, `from_zone_id`, `to_zone_id`, `travel_time_minutes` | Layout feed plus configured service-rate rules. |
| Operational snapshot | `operational_snapshots` | `snapshot_id`, `airport_id`, `as_of`, `contract_version`, `created_at` | Processing clock plus latest valid source records for the airport. |
| Zone state | `zone_states` | `snapshot_id`, `zone_id`, `occupancy`, `confidence_score`, `confidence_basis`, `observed_at`, `freshness_status` | Occupancy feeds, manual overrides, source health. |
| Counter state | `counter_states` | `snapshot_id`, `counter_id`, `zone_id`, `open_count`, `available_count`, `max_open_count`, `open_lead_minutes`, `role_required`, `observed_at`, `confidence_score`, `confidence_basis` | Counter status feed and counter-role reference rules. |
| Staff state | `staff_states` | `snapshot_id`, `staff_id`, `role`, `zone_id`, `availability`, `coverage_units`, `rest_minutes_due`, `shift_starts_at`, `shift_ends_at`, `observed_at`, `confidence_score`, `confidence_basis` | Manpower feed plus rest/shift policy normalization. |
| Zone-role transfer rule | `zone_role_transfer_rules` | `airport_id`, `role`, `from_zone_id`, `to_zone_id`, `transfer_minutes`, `allowed`, `reason` | Operations-approved movement feasibility for same-role staff relief. |
| Flight state | `flight_states` | `snapshot_id`, `flight_id`, `flight_type`, `status`, `estimated_passengers`, `scheduled_at`, `gate_zone_id` | Flight operations feed. |
| Passenger flow | `passenger_flows` | `snapshot_id`, `from_zone_id`, `to_zone_id`, `interval_minutes`, `estimated_count` | Passenger flow feed, sensor observations, valid path rules. |
| Observation record | `observations` | `snapshot_id`, `source`, `observed_at`, `confidence_score`, `confidence_basis`, `payload` | Any source feed retained for traceability. |
| Observation metric | `observation_metrics` | `observation_id`, `zone_id`, `queue_length`, `density_per_square_meter`, `active_service_load_per_minute`, `busy_counters` | Sensor observations normalized into metric fields. |
| Queue state | `QueueState` contract, optionally persisted later | `zone_id`, `queue_length`, `estimated_wait_minutes`, `service_rate_per_minute`, `observed_at`, `freshness`, `confidence`, `severity` | Observation metrics plus zone service rate and freshness rules. |
| Counter utilization | `CounterUtilization` contract, optionally persisted later | `zone_id`, `open_counters`, `available_counters`, `busy_counters`, `utilization_ratio`, `status`, `confidence` | Counter state plus observation metric busy counters. |
| Crowding event | `CrowdingEvent` contract, optionally persisted later | `event_id`, `zone_id`, `type`, `severity`, `threshold`, `current_metric`, `detected_at`, `confidence`, `freshness` | Queue state, density, and threshold rules. |
| Operational alert | `operational_alerts` | `alert_id`, `snapshot_id`, `zone_id`, `alert_type`, `severity`, `lifecycle_state`, `message`, `evidence`, `detected_at`, `confidence_score`, `confidence_basis`, `freshness` | Crowding events, counter utilization, stale-data checks, staff/capacity rules. |
| Flow forecast | `flow_forecasts` and future forecast-point table | `forecast_id`, `snapshot_id`, `generated_at`, `horizon_start`, `horizon_minutes`, `resolution_minutes`, `confidence_score`, `confidence_basis`, `assumptions` | Operational snapshot plus prediction model. |
| Scenario | `scenarios` | `scenario_id`, `snapshot_id`, `forecast_id`, `name`, `status`, `created_at` | Operator-created simulation request. |
| Scenario decision | `scenario_decisions` | `scenario_id`, `decision_type`, `decision_payload` | Operator scenario inputs such as counter changes, passenger movement, or shift timing. |
| Scenario projection | `ScenarioProjection` contract, optionally persisted later | `scenario_id`, `decisions`, `points`, `delta_from_baseline`, `confidence` | Scenario decisions applied to baseline forecast. |
| Decision option | `DecisionOption` contract, optionally persisted later | `option_id`, `decision`, `affected_zones`, `time_window`, `expected_impact`, `rationale`, `confidence` | Alerts, forecast, scenario projection, operational rules. |

## Simulator Data To Showcase

The simulator should prioritize the data that explains current queue pressure, staffing feasibility, and the specific rearrangement being suggested. These values should be visible per selected zone and repeated in recommendation rationale when they drive a decision.

| Simulator display group | Fields to show | Source contract or derivation |
| --- | --- | --- |
| Crowd level | `occupancy`, `capacity`, `queue_length`, `estimated_wait_minutes`, `density_per_square_meter`, `queue_pressure`, `freshness`, `confidence` | `OperationalSnapshot`, `QueueState`, `FlowForecast` |
| Crowd movement | `incoming_passenger_flow`, `outgoing_passenger_flow`, `interval_minutes`, `affected_flights` | `PassengerFlow`, `FlightState`, forecast points |
| Counter capacity | `open_counters`, `available_counters`, `max_open_count`, `open_counter_capacity`, `open_lead_minutes`, `busy_counters`, `utilization_ratio`, `role_required` | `CounterState`, `CounterUtilization` |
| Staffing context | `role_required`, `active_coverage_units`, `required_coverage_units`, `staffing_gap`, `relief_coverage_units`, `relief_candidates`, `rest_minutes_due`, `shift_starts_at`, `shift_ends_at`, `freshness`, `confidence` | `StaffState`, `zone_role_transfer_rules`, monitoring staffing context |
| Rearrangement option | `decision_type`, `from_zone_id`, `to_zone_id`, `open_delta`, `coverage_units`, `transfer_minutes`, `expected_wait_minutes_reduced`, `queue_pressure_drop`, `passengers_relieved`, `confidence`, `rationale` | `ScenarioDecision`, `ScenarioProjection`, `DecisionOption` |

### Database vs Derived Data Judgment

The database should persist facts, source-derived operational state, and static feasibility constraints:

- Persist `max_open_count`, `open_lead_minutes`, counter freshness, and counter confidence in `counter_states`.
- Persist `coverage_units`, staff freshness, and staff confidence in `staff_states`.
- Persist same-role transfer feasibility in `zone_role_transfer_rules`.
- Keep queue state, counter utilization, staffing context, scenario projection, and decision options as derived contracts unless operational audit requirements later require storing them.

The simulator should not query these tables directly. It should receive the fields through `OperationalSnapshot`, then use monitoring, simulation, and decision-support public interfaces to derive queue-management recommendations.

## How Each Processed Field Is Created

### Airport Reference Model

| Processed field | Creation rule |
| --- | --- |
| `airport_id` | Use the stable airport code from the layout or operations feed. |
| `name` | Use the airport display name from the layout feed. |
| `map_version` | Use the source layout version; update only when airport topology changes. |
| `zone_id` | Use the stable source zone identifier, normalized to the project naming convention. |
| `label` | Use the operator-facing zone name from the layout feed. |
| `zone_type` | Map source classifications to supported domain values such as `entrance`, `check-in`, `security`, `immigration`, `arrival`, or `departure`. |
| `capacity` | Use configured safe capacity for the zone; if source capacity is missing, use operations-approved fallback configuration. |
| `service_rate_per_minute` | Derive from configured zone service rules, active counter capacity, or historical observed throughput. |
| `geometry` | Store source geometry as JSON until spatial extensions are introduced. |
| `from_zone_id`, `to_zone_id` | Create from valid passenger movement paths in the layout feed. |
| `travel_time_minutes` | Use map/path metadata when available; otherwise calculate from path distance and configured walking-speed assumptions. |

### Operational Snapshot

| Processed field | Creation rule |
| --- | --- |
| `snapshot_id` | Generate a stable ID from airport, snapshot time, and sequence/version. |
| `airport_id` | Link to the airport reference record. |
| `as_of` | Use the processing clock time for the point-in-time snapshot. |
| `contract_version` | Use the current shared contract version, initially `v1`. |
| `created_at` | Use database insertion time. |

### Zone State

| Processed field | Creation rule |
| --- | --- |
| `occupancy` | Prefer latest valid occupancy count for the zone; if multiple sources exist, combine by source priority and confidence. |
| `confidence_score` | Start from source confidence, then reduce for stale data, conflicting sources, missing sensor coverage, or manual fallback. |
| `confidence_basis` | Summarize the source and any adjustment, for example `edge queue analytics and counter activity`. |
| `observed_at` | Use the timestamp of the source observation that contributed most to the zone state. |
| `freshness_status` | Compare `as_of - observed_at` to source-specific thresholds: fresh, watch, or stale. |

### Counter State

| Processed field | Creation rule |
| --- | --- |
| `counter_id` | Use source counter-bank ID or create a stable zone/type counter-bank ID. |
| `zone_id` | Map the counter to its owning airport zone. |
| `open_count` | Count counters or lanes currently open in the source system. |
| `available_count` | Count physically or operationally available counters, excluding out-of-service counters. |
| `max_open_count` | Cap counters that can be opened in the current operating context; usually less than or equal to physical availability when policies or works limit use. |
| `open_lead_minutes` | Estimate how long it takes to open additional counters in this zone. |
| `role_required` | Map counter type to required staff role, such as `ground-staff`, `security`, or `immigration-officer`. |
| `observed_at`, `confidence_score`, `confidence_basis` | Preserve the counter feed timestamp and trust basis because counter availability affects recommendations. |

### Staff State

| Processed field | Creation rule |
| --- | --- |
| `staff_id` | Use the operational staff identifier or staff-group identifier. Avoid unnecessary HR identifiers. |
| `role` | Normalize roster role into the domain role set. |
| `zone_id` | Use current assignment; if missing, use last confirmed assignment and lower confidence in downstream outputs. |
| `availability` | Normalize roster state into values such as `active`, `available`, `resting`, or `unavailable`. |
| `coverage_units` | Normalize a staff member or staff group into the number of operational positions they can cover. |
| `rest_minutes_due` | Calculate from shift policy, last break time, and current `as_of` time. |
| `shift_starts_at`, `shift_ends_at` | Copy from roster feed after timezone normalization. |
| `observed_at`, `confidence_score`, `confidence_basis` | Preserve roster freshness and confidence because stale staffing data must reduce recommendation confidence. |

### Zone-Role Transfer Rules

| Processed field | Creation rule |
| --- | --- |
| `airport_id` | Link the rule to the airport operating model. |
| `role` | Use the domain role that is allowed to transfer, such as `ground-staff`, `security`, or `immigration-officer`. |
| `from_zone_id`, `to_zone_id` | Use known zones only; transfer rules are directional because operational access can differ by route. |
| `transfer_minutes` | Use configured walking/approval time for moving staff between zones. |
| `allowed` | Mark false for known invalid transfers while retaining the policy reason. |
| `reason` | Explain the operational basis, such as same landside pool or arrival-side relief. |

### Flight State

| Processed field | Creation rule |
| --- | --- |
| `flight_id` | Use the stable flight operations identifier. |
| `flight_type` | Map source movement type to `arrival` or `departure`. |
| `status` | Normalize schedule state, such as `scheduled`, `estimated`, `landed`, `boarding-soon`, or `departed`. |
| `estimated_passengers` | Use load estimate from flight feed; if unavailable, estimate from aircraft type, route, historical load, or configured fallback and lower confidence. |
| `scheduled_at` | Use scheduled or best known operational time, normalized to ISO timestamp. |
| `gate_zone_id` | Map gate, stand, or arrival point to a known `zone_id`. |

### Passenger Flow

| Processed field | Creation rule |
| --- | --- |
| `from_zone_id` | Use origin zone from flow feed; validate against known zones and valid paths. |
| `to_zone_id` | Use destination zone from flow feed; validate against known zones and valid paths. |
| `interval_minutes` | Convert source interval to minutes. |
| `estimated_count` | Use aggregated movement count; if inferred from sensors, round to an integer and carry confidence through observation records. |

### Observation Record And Metrics

| Processed field | Creation rule |
| --- | --- |
| `source` | Use normalized adapter/source name such as `edge-queue-analytics`, `camera-aggregate`, `floor-plate`, or `roster`. |
| `observed_at` | Use source event time, not ingestion time. |
| `confidence_score` | Use adapter-provided confidence or calculate from source quality, latency, and coverage. |
| `confidence_basis` | Explain why the confidence score was assigned. |
| `payload` | Store source-specific aggregated payload for traceability and reprocessing. |
| `queue_length` | Use source queue estimate when available; otherwise estimate from occupancy minus recent service capacity. |
| `density_per_square_meter` | Use source density estimate or calculate `occupancy / observable_area_square_meters` when the area is known. |
| `active_service_load_per_minute` | Use source throughput or calculate from completed-service observations over the interval. |
| `busy_counters` | Use counter activity feed; if unavailable, estimate from queue length and open counters. |

### Queue State

| Processed field | Creation rule |
| --- | --- |
| `queue_length` | Prefer `observation_metrics.queue_length`; fallback to `max(0, occupancy - service_rate_per_minute * queue_clearance_window)` when no queue metric exists. |
| `estimated_wait_minutes` | Calculate `ceil(queue_length / service_rate_per_minute)` when service rate is greater than zero. |
| `service_rate_per_minute` | Use active service load metric when present; otherwise use zone configured service rate. |
| `severity` | Mark `critical` when queue, wait, or density exceeds critical thresholds; mark `watch` for lower warning thresholds; otherwise `normal`. |
| `freshness` | Copy from the source observation or zone state freshness. |
| `confidence` | Copy or reduce the source confidence based on staleness and fallback usage. |

### Counter Utilization

| Processed field | Creation rule |
| --- | --- |
| `open_counters` | Copy from `counter_states.open_count`. |
| `available_counters` | Copy from `counter_states.available_count`. |
| `busy_counters` | Prefer `observation_metrics.busy_counters`; fallback to an estimate from queue length and open counters. |
| `utilization_ratio` | Calculate `busy_counters / open_counters`; use zero when no counters are open. |
| `status` | Classify by utilization and pressure: `underused`, `normal`, `saturated`, or `overloaded`. |
| `confidence` | Use source metric confidence or counter-state confidence once available. |

### Crowding Event

| Processed field | Creation rule |
| --- | --- |
| `event_id` | Generate from event type, zone, and detection window. |
| `type` | Use `abnormal-crowding` for critical conditions and `queue-build-up` for warning conditions. |
| `severity` | Copy from queue/crowding threshold result. |
| `threshold` | Record the threshold that was crossed, such as `queue >= 120 or wait >= 5 min`. |
| `current_metric` | Format the measured queue, wait, or density value used as evidence. |
| `detected_at` | Use the contributing observation timestamp. |
| `confidence` | Copy from the contributing queue or density metric. |
| `freshness` | Copy from the contributing observation or zone state. |

### Operational Alert

| Processed field | Creation rule |
| --- | --- |
| `alert_id` | Generate from alert type, zone, and active alert lifecycle. |
| `alert_type` | Map triggering condition to `crowding`, `counter-saturation`, `data-quality`, `staff-shortage`, or similar alert type. |
| `severity` | Use the highest severity of triggering evidence. |
| `lifecycle_state` | Start as `new`; mark `stale` when evidence is stale; update to `acknowledged`, `escalated`, or `resolved` from operator workflow. |
| `message` | Create operator-readable summary from zone label and key metric. |
| `evidence` | Store machine-readable supporting values such as queue length, wait time, utilization, and source timestamp. |
| `detected_at` | Use the earliest timestamp when the triggering condition was detected. |
| `confidence_score`, `confidence_basis` | Derive from the weakest material evidence and state why. |
| `freshness` | Preserve the freshness state of the evidence that produced the alert. |

### Forecast

| Processed field | Creation rule |
| --- | --- |
| `forecast_id` | Generate from snapshot ID, forecast request, model version, and generation time. |
| `generated_at` | Use processing clock time. |
| `horizon_start` | Usually snapshot `as_of`; may be a requested simulation start time. |
| `horizon_minutes` | Use forecast request, initially near-term operations horizon. |
| `resolution_minutes` | Use forecast request interval, such as 15 or 30 minutes. |
| `confidence_score` | Start from the minimum or weighted confidence of input snapshot values, then adjust for model reliability. |
| `confidence_basis` | Record input and model assumptions. |
| `assumptions` | Store assumptions such as latest movement continuing or open counters maintaining service rate. |

### Scenario And Scenario Decision

| Processed field | Creation rule |
| --- | --- |
| `scenario_id` | Generate when an operator starts a scenario. |
| `snapshot_id` | Reference the immutable live snapshot used as baseline. |
| `forecast_id` | Reference the baseline forecast when one exists. |
| `name` | Use operator-supplied name or generate from decision types and time. |
| `status` | Start as `draft`; move to `running`, `completed`, or `archived`. |
| `decision_type` | Normalize operator input to `counter-capacity`, `passenger-movement`, or `shift-timing`. |
| `decision_payload` | Store the validated decision values, such as zone, counter delta, passenger count, role, or timing delta. |

### Scenario Projection

| Processed field | Creation rule |
| --- | --- |
| `points` | Apply scenario decisions to each forecast point without mutating live snapshot data. |
| `delta_from_baseline` | Calculate projected value minus baseline value for occupancy, queue pressure, wait time, and staffing demand. |
| `confidence` | Start from forecast confidence and reduce for scenario assumptions or unsupported decisions. |

### Decision Option

| Processed field | Creation rule |
| --- | --- |
| `option_id` | Generate from scenario decision and affected zone/time window. |
| `decision` | Use the scenario decision that produced measurable improvement. |
| `affected_zones` | Use zones changed by the decision or zones with projected improvement. |
| `time_window` | Use the forecast or scenario interval where the impact occurs. |
| `expected_impact` | Calculate from scenario delta, such as queue-pressure drop, wait-time reduction, passengers relieved, staffing gap, and open counter capacity. |
| `rationale` | Combine alert evidence, forecast pressure, staffing feasibility, transfer rules, scenario improvement, and constraints. |
| `confidence` | Use the lower of supporting alert, forecast, and projection confidence values. |

## Processing Plan

### Phase 1: Ingest And Preserve Source Data

1. Receive airport source payloads through adapters.
2. Validate payload shape at the adapter boundary.
3. Normalize source names, timestamps, zones, counters, roles, and flight identifiers.
4. Store source observations with `source`, `observed_at`, `confidence`, and aggregated `payload`.
5. Reject or quarantine records that reference unknown airport zones unless a controlled layout update is being processed.

### Phase 2: Normalize Reference Data

1. Upsert airport and zone records from the layout feed.
2. Upsert valid zone paths.
3. Load configured capacities, service rates, role requirements, and threshold rules.
4. Verify all counters, staff assignments, gates, and flows reference known zones.

### Phase 3: Build The Operational Snapshot

1. Select the latest valid source records for the snapshot time.
2. Build one `operational_snapshots` row.
3. Build `zone_states` from occupancy and freshness processing.
4. Build `counter_states` from counter feeds.
5. Build `staff_states` from manpower feeds and rest rules.
6. Build `flight_states` from flight operations feeds.
7. Build `passenger_flows` from aggregated movement observations.
8. Store observation and metric rows that explain the snapshot.
9. Assemble and validate `OperationalSnapshot` through the operational-database public reader.

### Phase 4: Derive Monitoring Analytics

1. Calculate queue state per relevant zone.
2. Calculate counter utilization per counter bank or service zone.
3. Detect crowding events from queue, wait, and density thresholds.
4. Create operational alerts for crowding, counter saturation, stale data, and capacity issues.
5. Preserve evidence, confidence, freshness, and lifecycle state.

### Phase 5: Generate Forecasts

1. Feed the validated `OperationalSnapshot` to the prediction service.
2. Generate forecast points across the selected horizon and resolution.
3. Calculate expected occupancy, queue pressure, staffing demand, and status per zone.
4. Store forecast metadata and assumptions.
5. Preserve confidence and input snapshot traceability.

### Phase 6: Run Simulation Scenarios

1. Store scenario metadata and validated scenario decisions.
2. Validate decisions against known zones, valid movement paths, role rules, counter limits, and rest constraints.
3. Apply decisions to forecast points, not live state.
4. Calculate projected values and deltas from baseline.
5. Mark scenario outputs clearly as scenario state.

### Phase 7: Produce Decision Options

1. Compare alerts, forecast pressure, and scenario deltas.
2. Rank options by expected impact, urgency, feasibility, and confidence.
3. Attach rationale and evidence for each option.
4. Expose options as advisory only; do not execute staff, counter, or passenger-routing changes automatically.

### Phase 8: Audit And Reprocessing

1. Keep every processed value traceable to a snapshot, source observation, forecast, or scenario.
2. Preserve source payloads that are needed to rebuild processed outputs.
3. Reprocess affected snapshots when source mapping, thresholds, or model versions change.
4. Store model version and contract version with processed outputs.

## Floor Plan Zone Reference

The following zones represent the full Suvarnabhumi terminal layout as identified from the operational floor plan. Every zone must exist in the `zones` table, the fixture snapshot, and the operational database seed to allow the simulation to retrieve crowd data across the entire airport.

### Departure Level (Level 4)

| Zone ID | Label | Type | Capacity | Service Rate/min | Purpose |
| --- | --- | --- | --- | --- | --- |
| `terminal-entrance-east` | Terminal Entrance East | entrance | 520 | 32 | East landside entrance for departing passengers |
| `terminal-entrance-west` | Terminal Entrance West | entrance | 520 | 32 | West landside entrance for departing passengers |
| `check-in-a` | Check-in A | check-in | 760 | 36 | Check-in island A (east wing) |
| `check-in-b` | Check-in B | check-in | 760 | 36 | Check-in island B (west wing) |
| `bag-drop-a` | Bag Drop A | check-in | 420 | 24 | Self-service bag drop east |
| `departure-hall` | Departure Hall | departure | 900 | 40 | Central departure concourse above check-in |
| `security-north` | Security North | security | 650 | 25 | North security screening checkpoint |
| `security-south` | Security South | security | 650 | 25 | South security screening checkpoint |
| `departure-gate-a` | Departure Gate A | departure | 680 | 32 | Concourse A gate area |
| `departure-gate-b` | Departure Gate B | departure | 680 | 32 | Concourse B gate area |
| `departure-gate-c` | Departure Gate C | departure | 680 | 32 | Concourse C gate area |
| `departure-gate-d` | Departure Gate D | departure | 680 | 32 | Concourse D gate area |
| `transfer-corridor` | Transfer Corridor | departure | 400 | 30 | Airside transfer passage between concourses |

### Arrival Level (Level 2)

| Zone ID | Label | Type | Capacity | Service Rate/min | Purpose |
| --- | --- | --- | --- | --- | --- |
| `arrival-gate-a` | Arrival Gate A | arrival | 620 | 34 | Arrival gate area east |
| `arrival-gate-b` | Arrival Gate B | arrival | 620 | 34 | Arrival gate area west |
| `immigration-east` | Immigration East | immigration | 720 | 22 | East immigration passport control |
| `immigration-west` | Immigration West | immigration | 720 | 22 | West immigration passport control |
| `baggage-reclaim-north` | Baggage Reclaim North | arrival | 480 | 28 | North baggage carousel hall |
| `baggage-reclaim-south` | Baggage Reclaim South | arrival | 480 | 28 | South baggage carousel hall |
| `customs-hall` | Customs Hall | arrival | 400 | 35 | Customs inspection area |
| `arrivals-hall` | Arrivals Hall | arrival | 600 | 40 | Meeters and greeters hall |

### Passenger Flow Paths (Departure)

```text
terminal-entrance-east -> check-in-a
terminal-entrance-west -> check-in-b
terminal-entrance-east -> departure-hall
terminal-entrance-west -> departure-hall
check-in-a -> bag-drop-a
check-in-b -> bag-drop-a
bag-drop-a -> security-north
departure-hall -> security-north
departure-hall -> security-south
security-north -> departure-gate-a
security-north -> departure-gate-c
security-south -> departure-gate-b
security-south -> departure-gate-d
departure-gate-a -> transfer-corridor
departure-gate-b -> transfer-corridor
departure-gate-c -> transfer-corridor
departure-gate-d -> transfer-corridor
```

### Passenger Flow Paths (Arrival)

```text
arrival-gate-a -> immigration-east
arrival-gate-b -> immigration-west
immigration-east -> baggage-reclaim-north
immigration-west -> baggage-reclaim-south
baggage-reclaim-north -> customs-hall
baggage-reclaim-south -> customs-hall
customs-hall -> arrivals-hall
```

### Zone Type Classification

| Zone type | Description | Crowd monitoring priority |
| --- | --- | --- |
| `entrance` | Terminal landside entry point | Medium — flow volume tracking |
| `check-in` | Check-in counters and bag drop | High — queue pressure and counter utilization |
| `security` | Security screening checkpoint | High — queue pressure and throughput |
| `immigration` | Passport control (arrival or departure) | High — queue pressure and officer utilization |
| `departure` | Departure gate, hall, or transfer area | Medium — boarding readiness and crowding |
| `arrival` | Arrival gate, baggage, customs, or meeters hall | Medium — flow tracking and crowding events |

### Crowd Data Points Per Zone

Every zone supports the following crowd data through the existing schema:

- `occupancy` — current estimated passenger count (zone_states)
- `capacity` — safe maximum occupancy (zones reference table)
- `queue_length` — estimated queue size (observation_metrics)
- `density_per_square_meter` — crowding density (observation_metrics)
- `active_service_load_per_minute` — throughput rate (observation_metrics)
- `busy_counters` — active service points (observation_metrics)
- `confidence_score` — trust in the measurement (zone_states)
- `freshness_status` — data currency (zone_states)
- `service_rate_per_minute` — configured throughput (zones reference table)
- Incoming and outgoing `passenger_flows` (passenger_flows table)

## Minimum Acceptance Checks For Future Implementation

When this processing plan becomes executable code, the smallest useful checks are:

```bash
npm test
./.beryl/scripts/check-affected.sh --worktree
./.beryl/scripts/check.sh
```

The first implementation test should prove this path:

```text
ingested source rows
  -> processed operational snapshot
  -> monitoring analytics
  -> forecast
  -> scenario projection
  -> decision option
```
