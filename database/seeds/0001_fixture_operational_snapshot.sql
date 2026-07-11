-- Deterministic pilot seed matching the current fixture snapshot.

INSERT INTO airport_ops.airports (airport_id, name, map_version)
VALUES ('BKK', 'Suvarnabhumi Operations Model', 'fixture-2026-07-11')
ON CONFLICT (airport_id) DO UPDATE
SET name = EXCLUDED.name,
    map_version = EXCLUDED.map_version;

INSERT INTO airport_ops.zones (zone_id, airport_id, label, zone_type, capacity, service_rate_per_minute)
VALUES
  ('terminal-entrance-east', 'BKK', 'Terminal Entrance East', 'entrance', 520, 32),
  ('check-in-a', 'BKK', 'Check-in A', 'check-in', 760, 36),
  ('bag-drop-a', 'BKK', 'Bag Drop A', 'check-in', 420, 24),
  ('arrival-gate-a', 'BKK', 'Arrival Gate A', 'arrival', 620, 34),
  ('immigration-east', 'BKK', 'Immigration East', 'immigration', 720, 22),
  ('baggage-hall', 'BKK', 'Baggage Hall', 'arrival', 760, 28),
  ('departure-hall', 'BKK', 'Departure Hall', 'departure', 900, 40),
  ('security-north', 'BKK', 'Security North', 'security', 650, 25),
  ('departure-gate-c', 'BKK', 'Departure Gate C', 'departure', 680, 32)
ON CONFLICT (zone_id) DO UPDATE
SET label = EXCLUDED.label,
    zone_type = EXCLUDED.zone_type,
    capacity = EXCLUDED.capacity,
    service_rate_per_minute = EXCLUDED.service_rate_per_minute;

INSERT INTO airport_ops.zone_paths (airport_id, from_zone_id, to_zone_id)
VALUES
  ('BKK', 'arrival-gate-a', 'immigration-east'),
  ('BKK', 'immigration-east', 'baggage-hall'),
  ('BKK', 'terminal-entrance-east', 'check-in-a'),
  ('BKK', 'check-in-a', 'bag-drop-a'),
  ('BKK', 'bag-drop-a', 'security-north'),
  ('BKK', 'departure-hall', 'security-north'),
  ('BKK', 'security-north', 'departure-gate-c')
ON CONFLICT (airport_id, from_zone_id, to_zone_id) DO NOTHING;

INSERT INTO airport_ops.operational_snapshots (snapshot_id, airport_id, as_of, contract_version)
VALUES ('fixture-peak-2026-07-11T09:20:00+07:00', 'BKK', '2026-07-11T09:20:00+07:00', 'v1')
ON CONFLICT (snapshot_id) DO UPDATE
SET as_of = EXCLUDED.as_of,
    contract_version = EXCLUDED.contract_version;

INSERT INTO airport_ops.zone_states (
  snapshot_id,
  zone_id,
  occupancy,
  confidence_score,
  confidence_basis,
  observed_at,
  freshness_status
)
VALUES
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'terminal-entrance-east', 190, 0.880, 'entrance camera aggregate', '2026-07-11T09:19:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'check-in-a', 720, 0.880, 'edge queue analytics and counter activity', '2026-07-11T09:19:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'bag-drop-a', 310, 0.850, 'edge queue analytics', '2026-07-11T09:19:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'arrival-gate-a', 420, 0.910, 'gate counters and flight load', '2026-07-11T09:18:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'immigration-east', 690, 0.860, 'camera aggregate and officer roster', '2026-07-11T09:17:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'baggage-hall', 310, 0.780, 'floor-plate aggregate', '2026-07-11T09:11:00+07:00', 'watch'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'departure-hall', 540, 0.880, 'entrance cameras and schedule', '2026-07-11T09:19:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'security-north', 610, 0.830, 'security queue camera aggregate', '2026-07-11T09:13:00+07:00', 'watch'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'departure-gate-c', 260, 0.800, 'boarding area counter', '2026-07-11T09:18:00+07:00', 'fresh')
ON CONFLICT (snapshot_id, zone_id) DO UPDATE
SET occupancy = EXCLUDED.occupancy,
    confidence_score = EXCLUDED.confidence_score,
    confidence_basis = EXCLUDED.confidence_basis,
    observed_at = EXCLUDED.observed_at,
    freshness_status = EXCLUDED.freshness_status;

INSERT INTO airport_ops.counter_states (
  snapshot_id,
  counter_id,
  zone_id,
  open_count,
  available_count,
  max_open_count,
  open_lead_minutes,
  role_required,
  observed_at,
  confidence_score,
  confidence_basis
)
VALUES
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'chk-a-01', 'check-in-a', 6, 10, 10, 6, 'ground-staff', '2026-07-11T09:19:00+07:00', 0.880, 'deterministic counter status fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'bag-a-01', 'bag-drop-a', 4, 6, 6, 8, 'ground-staff', '2026-07-11T09:19:00+07:00', 0.850, 'deterministic counter status fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'imm-e-01', 'immigration-east', 9, 12, 12, 10, 'immigration-officer', '2026-07-11T09:17:00+07:00', 0.860, 'deterministic counter status fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'sec-n-01', 'security-north', 7, 10, 10, 12, 'security', '2026-07-11T09:13:00+07:00', 0.830, 'deterministic counter status fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'dep-h-01', 'departure-hall', 8, 14, 14, 10, 'ground-staff', '2026-07-11T09:19:00+07:00', 0.880, 'deterministic counter status fixture')
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

INSERT INTO airport_ops.staff_states (
  snapshot_id,
  staff_id,
  role,
  zone_id,
  availability,
  coverage_units,
  rest_minutes_due,
  shift_starts_at,
  shift_ends_at,
  observed_at,
  confidence_score,
  confidence_basis
)
VALUES
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'io-12', 'immigration-officer', 'immigration-east', 'active', 8, 40, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:16:00+07:00', 0.900, 'deterministic roster fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'io-18', 'immigration-officer', 'arrival-gate-a', 'available', 3, 75, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:16:00+07:00', 0.900, 'deterministic roster fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'sec-04', 'security', 'security-north', 'active', 6, 55, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:14:00+07:00', 0.880, 'deterministic roster fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'sec-09', 'security', 'departure-hall', 'available', 2, 90, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:14:00+07:00', 0.880, 'deterministic roster fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'ops-21', 'ground-staff', 'departure-hall', 'available', 4, 120, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:15:00+07:00', 0.900, 'deterministic roster fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'ops-33', 'ground-staff', 'check-in-a', 'active', 5, 65, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:19:00+07:00', 0.880, 'deterministic roster fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'ops-38', 'ground-staff', 'bag-drop-a', 'active', 3, 85, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:19:00+07:00', 0.850, 'deterministic roster fixture')
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

INSERT INTO airport_ops.flight_states (snapshot_id, flight_id, flight_type, status, estimated_passengers, scheduled_at, gate_zone_id)
VALUES
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'AX-417', 'arrival', 'landed', 312, '2026-07-11T09:10:00+07:00', 'arrival-gate-a'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'SQ-981', 'departure', 'boarding-soon', 286, '2026-07-11T10:05:00+07:00', 'departure-gate-c')
ON CONFLICT (snapshot_id, flight_id) DO UPDATE
SET flight_type = EXCLUDED.flight_type,
    status = EXCLUDED.status,
    estimated_passengers = EXCLUDED.estimated_passengers,
    scheduled_at = EXCLUDED.scheduled_at,
    gate_zone_id = EXCLUDED.gate_zone_id;

DELETE FROM airport_ops.passenger_flows
WHERE snapshot_id = 'fixture-peak-2026-07-11T09:20:00+07:00';

INSERT INTO airport_ops.passenger_flows (snapshot_id, from_zone_id, to_zone_id, interval_minutes, estimated_count)
VALUES
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'terminal-entrance-east', 'check-in-a', 15, 210),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'check-in-a', 'bag-drop-a', 15, 130),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'bag-drop-a', 'security-north', 15, 105),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'arrival-gate-a', 'immigration-east', 15, 260),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'immigration-east', 'baggage-hall', 15, 180),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'departure-hall', 'security-north', 15, 230),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'security-north', 'departure-gate-c', 15, 160);

DELETE FROM airport_ops.observations
WHERE snapshot_id = 'fixture-peak-2026-07-11T09:20:00+07:00';

WITH inserted_observation AS (
  INSERT INTO airport_ops.observations (
    snapshot_id,
    source,
    observed_at,
    confidence_score,
    confidence_basis,
    payload
  )
  VALUES (
    'fixture-peak-2026-07-11T09:20:00+07:00',
    'edge-queue-analytics',
    '2026-07-11T09:19:00+07:00',
    0.880,
    'deterministic edge analytics fixture',
    '{}'::jsonb
  )
  RETURNING observation_id
)
INSERT INTO airport_ops.observation_metrics (
  observation_id,
  zone_id,
  queue_length,
  density_per_square_meter,
  active_service_load_per_minute,
  busy_counters
)
SELECT observation_id, zone_id, queue_length, density_per_square_meter, active_service_load_per_minute, busy_counters
FROM inserted_observation
CROSS JOIN (
  VALUES
    ('check-in-a', 138, 3.200, 34.00, 6),
    ('bag-drop-a', 46, 1.900, 20.00, 3)
) AS metric(zone_id, queue_length, density_per_square_meter, active_service_load_per_minute, busy_counters);

INSERT INTO airport_ops.observations (snapshot_id, source, observed_at, confidence_score, confidence_basis, payload)
VALUES
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'camera-aggregate', '2026-07-11T09:18:00+07:00', 0.860, 'fixture', '{}'::jsonb),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'floor-plate', '2026-07-11T09:11:00+07:00', 0.780, 'fixture', '{}'::jsonb),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'roster', '2026-07-11T08:45:00+07:00', 0.900, 'fixture', '{}'::jsonb);
