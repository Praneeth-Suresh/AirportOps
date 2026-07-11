-- Deterministic seed data for floor-plan zones added in migration 0003.
-- Provides zone_states, counter_states, staff_states, passenger_flows, and
-- observation_metrics for the full terminal coverage.

-- Zone states for new zones in the peak fixture snapshot.
INSERT INTO airport_ops.zone_states (
  snapshot_id, zone_id, occupancy, confidence_score, confidence_basis, observed_at, freshness_status
)
VALUES
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'terminal-entrance-west', 170, 0.880, 'entrance camera aggregate', '2026-07-11T09:19:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'check-in-b', 580, 0.860, 'edge queue analytics and counter activity', '2026-07-11T09:18:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'security-south', 520, 0.830, 'security queue camera aggregate', '2026-07-11T09:14:00+07:00', 'watch'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'departure-gate-a', 310, 0.800, 'boarding area counter', '2026-07-11T09:17:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'departure-gate-b', 240, 0.800, 'boarding area counter', '2026-07-11T09:17:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'departure-gate-d', 280, 0.790, 'boarding area counter', '2026-07-11T09:16:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'transfer-corridor', 150, 0.750, 'camera aggregate', '2026-07-11T09:15:00+07:00', 'watch'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'arrival-gate-b', 380, 0.910, 'gate counters and flight load', '2026-07-11T09:18:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'immigration-west', 640, 0.860, 'camera aggregate and officer roster', '2026-07-11T09:17:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'baggage-reclaim-north', 290, 0.780, 'floor-plate aggregate', '2026-07-11T09:12:00+07:00', 'watch'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'baggage-reclaim-south', 260, 0.780, 'floor-plate aggregate', '2026-07-11T09:12:00+07:00', 'watch'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'customs-hall', 220, 0.820, 'customs camera aggregate', '2026-07-11T09:16:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'arrivals-hall', 340, 0.850, 'floor-plate aggregate', '2026-07-11T09:17:00+07:00', 'fresh')
ON CONFLICT (snapshot_id, zone_id) DO UPDATE
SET occupancy = EXCLUDED.occupancy,
    confidence_score = EXCLUDED.confidence_score,
    confidence_basis = EXCLUDED.confidence_basis,
    observed_at = EXCLUDED.observed_at,
    freshness_status = EXCLUDED.freshness_status;

-- Counter states for zones with service counters.
INSERT INTO airport_ops.counter_states (
  snapshot_id, counter_id, zone_id, open_count, available_count, max_open_count,
  open_lead_minutes, role_required, observed_at, confidence_score, confidence_basis
)
VALUES
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'chk-b-01', 'check-in-b', 5, 10, 10, 6, 'ground-staff', '2026-07-11T09:18:00+07:00', 0.860, 'deterministic counter status fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'sec-s-01', 'security-south', 6, 10, 10, 12, 'security', '2026-07-11T09:14:00+07:00', 0.830, 'deterministic counter status fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'imm-w-01', 'immigration-west', 8, 12, 12, 10, 'immigration-officer', '2026-07-11T09:17:00+07:00', 0.860, 'deterministic counter status fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'cus-h-01', 'customs-hall', 5, 8, 8, 8, 'customs-officer', '2026-07-11T09:16:00+07:00', 0.820, 'deterministic counter status fixture')
ON CONFLICT (snapshot_id, counter_id) DO UPDATE
SET zone_id = EXCLUDED.zone_id,
    open_count = EXCLUDED.open_count,
    available_count = EXCLUDED.available_count,
    max_open_count = EXCLUDED.max_open_count,
    open_lead_minutes = EXCLUDED.open_lead_minutes,
    role_required = EXCLUDED.role_required,
    observed_at = EXCLUDED.observed_at,
    confidence_score = EXCLUDED.confidence_score,
    confidence_basis = EXCLUDED.confidence_basis;

-- Staff states for new zones.
INSERT INTO airport_ops.staff_states (
  snapshot_id, staff_id, role, zone_id, availability, coverage_units,
  rest_minutes_due, shift_starts_at, shift_ends_at, observed_at, confidence_score, confidence_basis
)
VALUES
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'ops-44', 'ground-staff', 'check-in-b', 'active', 4, 70, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:18:00+07:00', 0.860, 'deterministic roster fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'sec-11', 'security', 'security-south', 'active', 5, 50, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:14:00+07:00', 0.880, 'deterministic roster fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'io-22', 'immigration-officer', 'immigration-west', 'active', 7, 45, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:17:00+07:00', 0.900, 'deterministic roster fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'io-25', 'immigration-officer', 'arrival-gate-b', 'available', 3, 80, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:17:00+07:00', 0.900, 'deterministic roster fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'cus-02', 'customs-officer', 'customs-hall', 'active', 4, 60, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:16:00+07:00', 0.820, 'deterministic roster fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'ops-51', 'ground-staff', 'arrivals-hall', 'available', 3, 100, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:17:00+07:00', 0.850, 'deterministic roster fixture')
ON CONFLICT (snapshot_id, staff_id) DO UPDATE
SET role = EXCLUDED.role,
    zone_id = EXCLUDED.zone_id,
    availability = EXCLUDED.availability,
    coverage_units = EXCLUDED.coverage_units,
    rest_minutes_due = EXCLUDED.rest_minutes_due,
    shift_starts_at = EXCLUDED.shift_starts_at,
    shift_ends_at = EXCLUDED.shift_ends_at,
    observed_at = EXCLUDED.observed_at,
    confidence_score = EXCLUDED.confidence_score,
    confidence_basis = EXCLUDED.confidence_basis;

-- Passenger flows for new zone paths.
INSERT INTO airport_ops.passenger_flows (snapshot_id, from_zone_id, to_zone_id, interval_minutes, estimated_count)
VALUES
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'terminal-entrance-west', 'check-in-b', 15, 180),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'terminal-entrance-west', 'departure-hall', 15, 95),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'terminal-entrance-east', 'departure-hall', 15, 110),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'check-in-b', 'bag-drop-a', 15, 100),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'departure-hall', 'security-south', 15, 200),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'security-north', 'departure-gate-a', 15, 85),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'security-south', 'departure-gate-b', 15, 95),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'security-south', 'departure-gate-d', 15, 90),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'departure-gate-a', 'transfer-corridor', 15, 25),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'departure-gate-b', 'transfer-corridor', 15, 20),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'departure-gate-c', 'transfer-corridor', 15, 30),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'departure-gate-d', 'transfer-corridor', 15, 20),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'arrival-gate-b', 'immigration-west', 15, 240),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'immigration-east', 'baggage-reclaim-north', 15, 160),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'immigration-west', 'baggage-reclaim-south', 15, 150),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'baggage-reclaim-north', 'customs-hall', 15, 120),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'baggage-reclaim-south', 'customs-hall', 15, 110),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'customs-hall', 'arrivals-hall', 15, 200);

-- Observation metrics for new zones with edge analytics.
WITH inserted_observation AS (
  INSERT INTO airport_ops.observations (
    snapshot_id, source, observed_at, confidence_score, confidence_basis, payload
  )
  VALUES (
    'fixture-peak-2026-07-11T09:20:00+07:00',
    'edge-queue-analytics-west',
    '2026-07-11T09:18:00+07:00',
    0.860,
    'deterministic edge analytics fixture (west wing)',
    '{}'::jsonb
  )
  RETURNING observation_id
)
INSERT INTO airport_ops.observation_metrics (
  observation_id, zone_id, queue_length, density_per_square_meter,
  active_service_load_per_minute, busy_counters
)
SELECT observation_id, zone_id, queue_length, density_per_square_meter, active_service_load_per_minute, busy_counters
FROM inserted_observation
CROSS JOIN (
  VALUES
    ('check-in-b', 98, 2.600, 30.00, 5),
    ('security-south', 82, 2.400, 22.00, 5),
    ('immigration-west', 110, 2.800, 18.00, 7)
) AS metric(zone_id, queue_length, density_per_square_meter, active_service_load_per_minute, busy_counters);
