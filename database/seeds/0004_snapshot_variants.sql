-- GENERATED FILE - do not hand-edit.
-- Regenerate with: node database/generate-variant-seeds.mjs
--
-- Authoritative seed for the three fixture snapshot variants the Stratus
-- animation cycles through (normal -> peak -> stale). Values mirror
-- src/fixtures/deterministicAdapters.js exactly; the export/parity checks in
-- database/seed.mjs assert that Postgres-assembled snapshots match the
-- fixture-assembled snapshots.

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
  ('departure-gate-c', 'BKK', 'Departure Gate C', 'departure', 680, 32),
  ('terminal-entrance-west', 'BKK', 'Terminal Entrance West', 'entrance', 520, 32),
  ('check-in-b', 'BKK', 'Check-in B', 'check-in', 760, 36),
  ('security-south', 'BKK', 'Security South', 'security', 650, 25),
  ('departure-gate-a', 'BKK', 'Departure Gate A', 'departure', 680, 32),
  ('departure-gate-b', 'BKK', 'Departure Gate B', 'departure', 680, 32),
  ('departure-gate-d', 'BKK', 'Departure Gate D', 'departure', 680, 32),
  ('transfer-corridor', 'BKK', 'Transfer Corridor', 'departure', 400, 30),
  ('arrival-gate-b', 'BKK', 'Arrival Gate B', 'arrival', 620, 34),
  ('immigration-west', 'BKK', 'Immigration West', 'immigration', 720, 22),
  ('baggage-reclaim-north', 'BKK', 'Baggage Reclaim North', 'arrival', 480, 28),
  ('baggage-reclaim-south', 'BKK', 'Baggage Reclaim South', 'arrival', 480, 28),
  ('customs-hall', 'BKK', 'Customs Hall', 'arrival', 400, 35),
  ('arrivals-hall', 'BKK', 'Arrivals Hall', 'arrival', 600, 40)
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
  ('BKK', 'security-north', 'departure-gate-c'),
  ('BKK', 'terminal-entrance-west', 'check-in-b'),
  ('BKK', 'terminal-entrance-east', 'departure-hall'),
  ('BKK', 'terminal-entrance-west', 'departure-hall'),
  ('BKK', 'check-in-b', 'bag-drop-a'),
  ('BKK', 'departure-hall', 'security-south'),
  ('BKK', 'security-north', 'departure-gate-a'),
  ('BKK', 'security-south', 'departure-gate-b'),
  ('BKK', 'security-south', 'departure-gate-d'),
  ('BKK', 'departure-gate-a', 'transfer-corridor'),
  ('BKK', 'departure-gate-b', 'transfer-corridor'),
  ('BKK', 'departure-gate-c', 'transfer-corridor'),
  ('BKK', 'departure-gate-d', 'transfer-corridor'),
  ('BKK', 'arrival-gate-b', 'immigration-west'),
  ('BKK', 'immigration-east', 'baggage-reclaim-north'),
  ('BKK', 'immigration-west', 'baggage-reclaim-south'),
  ('BKK', 'baggage-reclaim-north', 'customs-hall'),
  ('BKK', 'baggage-reclaim-south', 'customs-hall'),
  ('BKK', 'customs-hall', 'arrivals-hall')
ON CONFLICT (airport_id, from_zone_id, to_zone_id) DO NOTHING;

INSERT INTO airport_ops.zone_role_transfer_rules (airport_id, role, from_zone_id, to_zone_id, transfer_minutes, allowed)
VALUES
  ('BKK', 'ground-staff', 'departure-hall', 'check-in-a', 7, true),
  ('BKK', 'ground-staff', 'bag-drop-a', 'check-in-a', 4, true),
  ('BKK', 'immigration-officer', 'arrival-gate-a', 'immigration-east', 6, true),
  ('BKK', 'security', 'departure-hall', 'security-north', 8, true),
  ('BKK', 'ground-staff', 'check-in-b', 'check-in-a', 5, true),
  ('BKK', 'ground-staff', 'check-in-a', 'check-in-b', 5, true),
  ('BKK', 'ground-staff', 'departure-hall', 'check-in-b', 7, true),
  ('BKK', 'security', 'security-south', 'security-north', 10, true),
  ('BKK', 'security', 'security-north', 'security-south', 10, true),
  ('BKK', 'immigration-officer', 'immigration-west', 'immigration-east', 8, true),
  ('BKK', 'immigration-officer', 'immigration-east', 'immigration-west', 8, true),
  ('BKK', 'immigration-officer', 'arrival-gate-b', 'immigration-west', 6, true),
  ('BKK', 'ground-staff', 'arrivals-hall', 'customs-hall', 4, true),
  ('BKK', 'ground-staff', 'baggage-reclaim-north', 'baggage-reclaim-south', 6, true)
ON CONFLICT (airport_id, role, from_zone_id, to_zone_id) DO UPDATE
SET transfer_minutes = EXCLUDED.transfer_minutes,
    allowed = EXCLUDED.allowed;

INSERT INTO airport_ops.operational_snapshots (snapshot_id, airport_id, as_of, contract_version)
VALUES
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'BKK', '2026-07-11T09:10:00+07:00', 'v1'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'BKK', '2026-07-11T09:20:00+07:00', 'v1'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'BKK', '2026-07-11T09:30:00+07:00', 'v1')
ON CONFLICT (snapshot_id) DO UPDATE
SET as_of = EXCLUDED.as_of,
    contract_version = EXCLUDED.contract_version;

-- normal snapshot state (2026-07-11T09:10:00+07:00)

INSERT INTO airport_ops.zone_states (snapshot_id, zone_id, occupancy, confidence_score, confidence_basis, observed_at, freshness_status)
VALUES
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'terminal-entrance-east', 190, 0.88, 'entrance camera aggregate', '2026-07-11T09:09:00+07:00', 'fresh'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'check-in-a', 360, 0.9, 'edge queue analytics and counter activity', '2026-07-11T09:09:00+07:00', 'fresh'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'bag-drop-a', 180, 0.87, 'edge queue analytics', '2026-07-11T09:09:00+07:00', 'fresh'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'arrival-gate-a', 420, 0.91, 'gate counters and flight load', '2026-07-11T09:18:00+07:00', 'fresh'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'immigration-east', 690, 0.86, 'camera aggregate and officer roster', '2026-07-11T09:17:00+07:00', 'fresh'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'baggage-hall', 310, 0.78, 'floor-plate aggregate', '2026-07-11T09:11:00+07:00', 'watch'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'departure-hall', 540, 0.88, 'entrance cameras and schedule', '2026-07-11T09:19:00+07:00', 'fresh'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'security-north', 610, 0.83, 'security queue camera aggregate', '2026-07-11T09:13:00+07:00', 'watch'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'departure-gate-c', 260, 0.8, 'boarding area counter', '2026-07-11T09:18:00+07:00', 'fresh'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'terminal-entrance-west', 170, 0.88, 'entrance camera aggregate', '2026-07-11T09:09:00+07:00', 'fresh'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'check-in-b', 290, 0.88, 'edge queue analytics and counter activity', '2026-07-11T09:09:00+07:00', 'fresh'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'security-south', 520, 0.83, 'security queue camera aggregate', '2026-07-11T09:14:00+07:00', 'watch'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'departure-gate-a', 310, 0.8, 'boarding area counter', '2026-07-11T09:17:00+07:00', 'fresh'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'departure-gate-b', 240, 0.8, 'boarding area counter', '2026-07-11T09:17:00+07:00', 'fresh'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'departure-gate-d', 280, 0.79, 'boarding area counter', '2026-07-11T09:16:00+07:00', 'fresh'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'transfer-corridor', 150, 0.75, 'camera aggregate', '2026-07-11T09:15:00+07:00', 'watch'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'arrival-gate-b', 380, 0.91, 'gate counters and flight load', '2026-07-11T09:18:00+07:00', 'fresh'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'immigration-west', 640, 0.86, 'camera aggregate and officer roster', '2026-07-11T09:17:00+07:00', 'fresh'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'baggage-reclaim-north', 290, 0.78, 'floor-plate aggregate', '2026-07-11T09:12:00+07:00', 'watch'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'baggage-reclaim-south', 260, 0.78, 'floor-plate aggregate', '2026-07-11T09:12:00+07:00', 'watch'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'customs-hall', 220, 0.82, 'customs camera aggregate', '2026-07-11T09:16:00+07:00', 'fresh'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'arrivals-hall', 340, 0.85, 'floor-plate aggregate', '2026-07-11T09:17:00+07:00', 'fresh')
ON CONFLICT (snapshot_id, zone_id) DO UPDATE
SET occupancy = EXCLUDED.occupancy,
    confidence_score = EXCLUDED.confidence_score,
    confidence_basis = EXCLUDED.confidence_basis,
    observed_at = EXCLUDED.observed_at,
    freshness_status = EXCLUDED.freshness_status;

INSERT INTO airport_ops.counter_states (snapshot_id, counter_id, zone_id, open_count, available_count, max_open_count, open_lead_minutes, role_required, observed_at, confidence_score, confidence_basis)
VALUES
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'chk-a-01', 'check-in-a', 6, 10, 10, 6, 'ground-staff', '2026-07-11T09:09:00+07:00', 0.9, 'counter status feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'bag-a-01', 'bag-drop-a', 4, 6, 6, 8, 'ground-staff', '2026-07-11T09:09:00+07:00', 0.87, 'counter status feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'imm-e-01', 'immigration-east', 9, 12, 12, 10, 'immigration-officer', '2026-07-11T09:17:00+07:00', 0.86, 'counter status feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'sec-n-01', 'security-north', 7, 10, 10, 12, 'security', '2026-07-11T09:13:00+07:00', 0.83, 'counter status feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'dep-h-01', 'departure-hall', 8, 14, 14, 10, 'ground-staff', '2026-07-11T09:19:00+07:00', 0.88, 'counter status feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'chk-b-01', 'check-in-b', 5, 10, 10, 6, 'ground-staff', '2026-07-11T09:09:00+07:00', 0.88, 'counter status feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'sec-s-01', 'security-south', 6, 10, 10, 12, 'security', '2026-07-11T09:14:00+07:00', 0.83, 'counter status feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'imm-w-01', 'immigration-west', 8, 12, 12, 10, 'immigration-officer', '2026-07-11T09:17:00+07:00', 0.86, 'counter status feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'cus-h-01', 'customs-hall', 5, 8, 8, 8, 'customs-officer', '2026-07-11T09:16:00+07:00', 0.82, 'counter status feed fixture')
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

INSERT INTO airport_ops.staff_states (snapshot_id, staff_id, role, zone_id, availability, coverage_units, rest_minutes_due, shift_starts_at, shift_ends_at, observed_at, confidence_score, confidence_basis)
VALUES
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'io-12', 'immigration-officer', 'immigration-east', 'active', 8, 40, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:16:00+07:00', 0.9, 'roster feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'io-18', 'immigration-officer', 'arrival-gate-a', 'available', 3, 75, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:16:00+07:00', 0.9, 'roster feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'sec-04', 'security', 'security-north', 'active', 6, 55, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:14:00+07:00', 0.88, 'roster feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'sec-09', 'security', 'departure-hall', 'available', 2, 90, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:14:00+07:00', 0.88, 'roster feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'ops-21', 'ground-staff', 'departure-hall', 'available', 4, 120, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:15:00+07:00', 0.9, 'roster feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'ops-33', 'ground-staff', 'check-in-a', 'active', 5, 65, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:09:00+07:00', 0.9, 'roster feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'ops-38', 'ground-staff', 'bag-drop-a', 'active', 3, 85, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:09:00+07:00', 0.87, 'roster feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'ops-44', 'ground-staff', 'check-in-b', 'active', 4, 70, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:09:00+07:00', 0.88, 'roster feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'sec-11', 'security', 'security-south', 'active', 5, 50, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:14:00+07:00', 0.88, 'roster feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'io-22', 'immigration-officer', 'immigration-west', 'active', 7, 45, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:17:00+07:00', 0.9, 'roster feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'io-25', 'immigration-officer', 'arrival-gate-b', 'available', 3, 80, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:17:00+07:00', 0.9, 'roster feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'cus-02', 'customs-officer', 'customs-hall', 'active', 4, 60, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:16:00+07:00', 0.82, 'roster feed fixture'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'ops-51', 'ground-staff', 'arrivals-hall', 'available', 3, 100, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:17:00+07:00', 0.85, 'roster feed fixture')
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
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'AX-417', 'arrival', 'landed', 312, '2026-07-11T09:10:00+07:00', 'arrival-gate-a'),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'SQ-981', 'departure', 'boarding-soon', 286, '2026-07-11T10:05:00+07:00', 'departure-gate-c')
ON CONFLICT (snapshot_id, flight_id) DO UPDATE
SET flight_type = EXCLUDED.flight_type,
    status = EXCLUDED.status,
    estimated_passengers = EXCLUDED.estimated_passengers,
    scheduled_at = EXCLUDED.scheduled_at,
    gate_zone_id = EXCLUDED.gate_zone_id;

DELETE FROM airport_ops.passenger_flows
WHERE snapshot_id = 'fixture-normal-2026-07-11T09:10:00+07:00';

INSERT INTO airport_ops.passenger_flows (snapshot_id, from_zone_id, to_zone_id, interval_minutes, estimated_count)
VALUES
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'terminal-entrance-east', 'check-in-a', 15, 88),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'check-in-a', 'bag-drop-a', 15, 62),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'bag-drop-a', 'security-north', 15, 48),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'arrival-gate-a', 'immigration-east', 15, 260),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'immigration-east', 'baggage-hall', 15, 180),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'departure-hall', 'security-north', 15, 230),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'security-north', 'departure-gate-c', 15, 160),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'terminal-entrance-west', 'check-in-b', 15, 75),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'terminal-entrance-west', 'departure-hall', 15, 40),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'terminal-entrance-east', 'departure-hall', 15, 45),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'check-in-b', 'bag-drop-a', 15, 42),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'departure-hall', 'security-south', 15, 200),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'security-north', 'departure-gate-a', 15, 85),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'security-south', 'departure-gate-b', 15, 95),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'security-south', 'departure-gate-d', 15, 90),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'departure-gate-a', 'transfer-corridor', 15, 25),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'departure-gate-b', 'transfer-corridor', 15, 20),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'departure-gate-c', 'transfer-corridor', 15, 30),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'departure-gate-d', 'transfer-corridor', 15, 20),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'arrival-gate-b', 'immigration-west', 15, 240),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'immigration-east', 'baggage-reclaim-north', 15, 160),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'immigration-west', 'baggage-reclaim-south', 15, 150),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'baggage-reclaim-north', 'customs-hall', 15, 120),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'baggage-reclaim-south', 'customs-hall', 15, 110),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'customs-hall', 'arrivals-hall', 15, 200);

DELETE FROM airport_ops.observations
WHERE snapshot_id = 'fixture-normal-2026-07-11T09:10:00+07:00';

WITH inserted_observation AS (
  INSERT INTO airport_ops.observations (snapshot_id, source, observed_at, confidence_score, confidence_basis, payload)
  VALUES ('fixture-normal-2026-07-11T09:10:00+07:00', 'edge-queue-analytics', '2026-07-11T09:09:00+07:00', 0.9, 'deterministic edge analytics fixture', '{}'::jsonb)
  RETURNING observation_id
)
INSERT INTO airport_ops.observation_metrics (observation_id, zone_id, queue_length, density_per_square_meter, active_service_load_per_minute, busy_counters)
SELECT observation_id, zone_id, queue_length, density_per_square_meter, active_service_load_per_minute, busy_counters
FROM inserted_observation
CROSS JOIN (
  VALUES
    ('check-in-a', 54, 1.6, 34, 5),
    ('bag-drop-a', 18, 1.1, 20, 2),
    ('check-in-b', 38, 1.3, 30, 4),
    ('security-south', 30, 1.2, 22, 4),
    ('immigration-west', 42, 1.4, 18, 6)
) AS metric(zone_id, queue_length, density_per_square_meter, active_service_load_per_minute, busy_counters);

INSERT INTO airport_ops.observations (snapshot_id, source, observed_at, confidence_score, confidence_basis, payload)
VALUES
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'camera-aggregate', '2026-07-11T09:18:00+07:00', 0.86, 'fixture', '{}'::jsonb),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'floor-plate', '2026-07-11T09:11:00+07:00', 0.78, 'fixture', '{}'::jsonb),
  ('fixture-normal-2026-07-11T09:10:00+07:00', 'roster', '2026-07-11T08:45:00+07:00', 0.9, 'fixture', '{}'::jsonb);

-- peak snapshot state (2026-07-11T09:20:00+07:00)

INSERT INTO airport_ops.zone_states (snapshot_id, zone_id, occupancy, confidence_score, confidence_basis, observed_at, freshness_status)
VALUES
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'terminal-entrance-east', 190, 0.88, 'entrance camera aggregate', '2026-07-11T09:19:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'check-in-a', 720, 0.88, 'edge queue analytics and counter activity', '2026-07-11T09:19:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'bag-drop-a', 310, 0.85, 'edge queue analytics', '2026-07-11T09:19:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'arrival-gate-a', 420, 0.91, 'gate counters and flight load', '2026-07-11T09:18:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'immigration-east', 690, 0.86, 'camera aggregate and officer roster', '2026-07-11T09:17:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'baggage-hall', 310, 0.78, 'floor-plate aggregate', '2026-07-11T09:11:00+07:00', 'watch'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'departure-hall', 540, 0.88, 'entrance cameras and schedule', '2026-07-11T09:19:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'security-north', 610, 0.83, 'security queue camera aggregate', '2026-07-11T09:13:00+07:00', 'watch'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'departure-gate-c', 260, 0.8, 'boarding area counter', '2026-07-11T09:18:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'terminal-entrance-west', 170, 0.88, 'entrance camera aggregate', '2026-07-11T09:19:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'check-in-b', 580, 0.86, 'edge queue analytics and counter activity', '2026-07-11T09:19:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'security-south', 520, 0.83, 'security queue camera aggregate', '2026-07-11T09:14:00+07:00', 'watch'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'departure-gate-a', 310, 0.8, 'boarding area counter', '2026-07-11T09:17:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'departure-gate-b', 240, 0.8, 'boarding area counter', '2026-07-11T09:17:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'departure-gate-d', 280, 0.79, 'boarding area counter', '2026-07-11T09:16:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'transfer-corridor', 150, 0.75, 'camera aggregate', '2026-07-11T09:15:00+07:00', 'watch'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'arrival-gate-b', 380, 0.91, 'gate counters and flight load', '2026-07-11T09:18:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'immigration-west', 640, 0.86, 'camera aggregate and officer roster', '2026-07-11T09:17:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'baggage-reclaim-north', 290, 0.78, 'floor-plate aggregate', '2026-07-11T09:12:00+07:00', 'watch'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'baggage-reclaim-south', 260, 0.78, 'floor-plate aggregate', '2026-07-11T09:12:00+07:00', 'watch'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'customs-hall', 220, 0.82, 'customs camera aggregate', '2026-07-11T09:16:00+07:00', 'fresh'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'arrivals-hall', 340, 0.85, 'floor-plate aggregate', '2026-07-11T09:17:00+07:00', 'fresh')
ON CONFLICT (snapshot_id, zone_id) DO UPDATE
SET occupancy = EXCLUDED.occupancy,
    confidence_score = EXCLUDED.confidence_score,
    confidence_basis = EXCLUDED.confidence_basis,
    observed_at = EXCLUDED.observed_at,
    freshness_status = EXCLUDED.freshness_status;

INSERT INTO airport_ops.counter_states (snapshot_id, counter_id, zone_id, open_count, available_count, max_open_count, open_lead_minutes, role_required, observed_at, confidence_score, confidence_basis)
VALUES
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'chk-a-01', 'check-in-a', 6, 10, 10, 6, 'ground-staff', '2026-07-11T09:19:00+07:00', 0.88, 'counter status feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'bag-a-01', 'bag-drop-a', 4, 6, 6, 8, 'ground-staff', '2026-07-11T09:19:00+07:00', 0.85, 'counter status feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'imm-e-01', 'immigration-east', 9, 12, 12, 10, 'immigration-officer', '2026-07-11T09:17:00+07:00', 0.86, 'counter status feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'sec-n-01', 'security-north', 7, 10, 10, 12, 'security', '2026-07-11T09:13:00+07:00', 0.83, 'counter status feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'dep-h-01', 'departure-hall', 8, 14, 14, 10, 'ground-staff', '2026-07-11T09:19:00+07:00', 0.88, 'counter status feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'chk-b-01', 'check-in-b', 5, 10, 10, 6, 'ground-staff', '2026-07-11T09:19:00+07:00', 0.86, 'counter status feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'sec-s-01', 'security-south', 6, 10, 10, 12, 'security', '2026-07-11T09:14:00+07:00', 0.83, 'counter status feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'imm-w-01', 'immigration-west', 8, 12, 12, 10, 'immigration-officer', '2026-07-11T09:17:00+07:00', 0.86, 'counter status feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'cus-h-01', 'customs-hall', 5, 8, 8, 8, 'customs-officer', '2026-07-11T09:16:00+07:00', 0.82, 'counter status feed fixture')
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

INSERT INTO airport_ops.staff_states (snapshot_id, staff_id, role, zone_id, availability, coverage_units, rest_minutes_due, shift_starts_at, shift_ends_at, observed_at, confidence_score, confidence_basis)
VALUES
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'io-12', 'immigration-officer', 'immigration-east', 'active', 8, 40, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:16:00+07:00', 0.9, 'roster feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'io-18', 'immigration-officer', 'arrival-gate-a', 'available', 3, 75, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:16:00+07:00', 0.9, 'roster feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'sec-04', 'security', 'security-north', 'active', 6, 55, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:14:00+07:00', 0.88, 'roster feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'sec-09', 'security', 'departure-hall', 'available', 2, 90, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:14:00+07:00', 0.88, 'roster feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'ops-21', 'ground-staff', 'departure-hall', 'available', 4, 120, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:15:00+07:00', 0.9, 'roster feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'ops-33', 'ground-staff', 'check-in-a', 'active', 5, 65, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:19:00+07:00', 0.88, 'roster feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'ops-38', 'ground-staff', 'bag-drop-a', 'active', 3, 85, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:19:00+07:00', 0.85, 'roster feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'ops-44', 'ground-staff', 'check-in-b', 'active', 4, 70, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:19:00+07:00', 0.86, 'roster feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'sec-11', 'security', 'security-south', 'active', 5, 50, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:14:00+07:00', 0.88, 'roster feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'io-22', 'immigration-officer', 'immigration-west', 'active', 7, 45, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:17:00+07:00', 0.9, 'roster feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'io-25', 'immigration-officer', 'arrival-gate-b', 'available', 3, 80, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:17:00+07:00', 0.9, 'roster feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'cus-02', 'customs-officer', 'customs-hall', 'active', 4, 60, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:16:00+07:00', 0.82, 'roster feed fixture'),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'ops-51', 'ground-staff', 'arrivals-hall', 'available', 3, 100, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:17:00+07:00', 0.85, 'roster feed fixture')
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
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'security-north', 'departure-gate-c', 15, 160),
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

DELETE FROM airport_ops.observations
WHERE snapshot_id = 'fixture-peak-2026-07-11T09:20:00+07:00';

WITH inserted_observation AS (
  INSERT INTO airport_ops.observations (snapshot_id, source, observed_at, confidence_score, confidence_basis, payload)
  VALUES ('fixture-peak-2026-07-11T09:20:00+07:00', 'edge-queue-analytics', '2026-07-11T09:19:00+07:00', 0.88, 'deterministic edge analytics fixture', '{}'::jsonb)
  RETURNING observation_id
)
INSERT INTO airport_ops.observation_metrics (observation_id, zone_id, queue_length, density_per_square_meter, active_service_load_per_minute, busy_counters)
SELECT observation_id, zone_id, queue_length, density_per_square_meter, active_service_load_per_minute, busy_counters
FROM inserted_observation
CROSS JOIN (
  VALUES
    ('check-in-a', 138, 3.2, 34, 6),
    ('bag-drop-a', 46, 1.9, 20, 3),
    ('check-in-b', 98, 2.6, 30, 5),
    ('security-south', 82, 2.4, 22, 5),
    ('immigration-west', 110, 2.8, 18, 7)
) AS metric(zone_id, queue_length, density_per_square_meter, active_service_load_per_minute, busy_counters);

INSERT INTO airport_ops.observations (snapshot_id, source, observed_at, confidence_score, confidence_basis, payload)
VALUES
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'camera-aggregate', '2026-07-11T09:18:00+07:00', 0.86, 'fixture', '{}'::jsonb),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'floor-plate', '2026-07-11T09:11:00+07:00', 0.78, 'fixture', '{}'::jsonb),
  ('fixture-peak-2026-07-11T09:20:00+07:00', 'roster', '2026-07-11T08:45:00+07:00', 0.9, 'fixture', '{}'::jsonb);

-- stale snapshot state (2026-07-11T09:30:00+07:00)

INSERT INTO airport_ops.zone_states (snapshot_id, zone_id, occupancy, confidence_score, confidence_basis, observed_at, freshness_status)
VALUES
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'terminal-entrance-east', 190, 0.88, 'entrance camera aggregate', '2026-07-11T09:18:00+07:00', 'stale'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'check-in-a', 730, 0.62, 'edge queue analytics and counter activity', '2026-07-11T09:18:00+07:00', 'stale'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'bag-drop-a', 330, 0.59, 'edge queue analytics', '2026-07-11T09:18:00+07:00', 'stale'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'arrival-gate-a', 420, 0.91, 'gate counters and flight load', '2026-07-11T09:18:00+07:00', 'fresh'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'immigration-east', 690, 0.86, 'camera aggregate and officer roster', '2026-07-11T09:17:00+07:00', 'fresh'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'baggage-hall', 310, 0.78, 'floor-plate aggregate', '2026-07-11T09:11:00+07:00', 'watch'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'departure-hall', 540, 0.88, 'entrance cameras and schedule', '2026-07-11T09:19:00+07:00', 'fresh'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'security-north', 610, 0.83, 'security queue camera aggregate', '2026-07-11T09:13:00+07:00', 'watch'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'departure-gate-c', 260, 0.8, 'boarding area counter', '2026-07-11T09:18:00+07:00', 'fresh'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'terminal-entrance-west', 170, 0.88, 'entrance camera aggregate', '2026-07-11T09:18:00+07:00', 'stale'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'check-in-b', 580, 0.6, 'edge queue analytics and counter activity', '2026-07-11T09:18:00+07:00', 'stale'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'security-south', 520, 0.83, 'security queue camera aggregate', '2026-07-11T09:14:00+07:00', 'watch'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'departure-gate-a', 310, 0.8, 'boarding area counter', '2026-07-11T09:17:00+07:00', 'fresh'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'departure-gate-b', 240, 0.8, 'boarding area counter', '2026-07-11T09:17:00+07:00', 'fresh'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'departure-gate-d', 280, 0.79, 'boarding area counter', '2026-07-11T09:16:00+07:00', 'fresh'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'transfer-corridor', 150, 0.75, 'camera aggregate', '2026-07-11T09:15:00+07:00', 'watch'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'arrival-gate-b', 380, 0.91, 'gate counters and flight load', '2026-07-11T09:18:00+07:00', 'fresh'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'immigration-west', 640, 0.86, 'camera aggregate and officer roster', '2026-07-11T09:17:00+07:00', 'fresh'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'baggage-reclaim-north', 290, 0.78, 'floor-plate aggregate', '2026-07-11T09:12:00+07:00', 'watch'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'baggage-reclaim-south', 260, 0.78, 'floor-plate aggregate', '2026-07-11T09:12:00+07:00', 'watch'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'customs-hall', 220, 0.82, 'customs camera aggregate', '2026-07-11T09:16:00+07:00', 'fresh'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'arrivals-hall', 340, 0.85, 'floor-plate aggregate', '2026-07-11T09:17:00+07:00', 'fresh')
ON CONFLICT (snapshot_id, zone_id) DO UPDATE
SET occupancy = EXCLUDED.occupancy,
    confidence_score = EXCLUDED.confidence_score,
    confidence_basis = EXCLUDED.confidence_basis,
    observed_at = EXCLUDED.observed_at,
    freshness_status = EXCLUDED.freshness_status;

INSERT INTO airport_ops.counter_states (snapshot_id, counter_id, zone_id, open_count, available_count, max_open_count, open_lead_minutes, role_required, observed_at, confidence_score, confidence_basis)
VALUES
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'chk-a-01', 'check-in-a', 6, 10, 10, 6, 'ground-staff', '2026-07-11T09:18:00+07:00', 0.62, 'counter status feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'bag-a-01', 'bag-drop-a', 4, 6, 6, 8, 'ground-staff', '2026-07-11T09:18:00+07:00', 0.59, 'counter status feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'imm-e-01', 'immigration-east', 9, 12, 12, 10, 'immigration-officer', '2026-07-11T09:17:00+07:00', 0.86, 'counter status feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'sec-n-01', 'security-north', 7, 10, 10, 12, 'security', '2026-07-11T09:13:00+07:00', 0.83, 'counter status feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'dep-h-01', 'departure-hall', 8, 14, 14, 10, 'ground-staff', '2026-07-11T09:19:00+07:00', 0.88, 'counter status feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'chk-b-01', 'check-in-b', 5, 10, 10, 6, 'ground-staff', '2026-07-11T09:18:00+07:00', 0.6, 'counter status feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'sec-s-01', 'security-south', 6, 10, 10, 12, 'security', '2026-07-11T09:14:00+07:00', 0.83, 'counter status feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'imm-w-01', 'immigration-west', 8, 12, 12, 10, 'immigration-officer', '2026-07-11T09:17:00+07:00', 0.86, 'counter status feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'cus-h-01', 'customs-hall', 5, 8, 8, 8, 'customs-officer', '2026-07-11T09:16:00+07:00', 0.82, 'counter status feed fixture')
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

INSERT INTO airport_ops.staff_states (snapshot_id, staff_id, role, zone_id, availability, coverage_units, rest_minutes_due, shift_starts_at, shift_ends_at, observed_at, confidence_score, confidence_basis)
VALUES
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'io-12', 'immigration-officer', 'immigration-east', 'active', 8, 40, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:16:00+07:00', 0.9, 'roster feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'io-18', 'immigration-officer', 'arrival-gate-a', 'available', 3, 75, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:16:00+07:00', 0.9, 'roster feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'sec-04', 'security', 'security-north', 'active', 6, 55, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:14:00+07:00', 0.88, 'roster feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'sec-09', 'security', 'departure-hall', 'available', 2, 90, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:14:00+07:00', 0.88, 'roster feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'ops-21', 'ground-staff', 'departure-hall', 'available', 4, 120, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:15:00+07:00', 0.9, 'roster feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'ops-33', 'ground-staff', 'check-in-a', 'active', 5, 65, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:18:00+07:00', 0.62, 'roster feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'ops-38', 'ground-staff', 'bag-drop-a', 'active', 3, 85, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:18:00+07:00', 0.59, 'roster feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'ops-44', 'ground-staff', 'check-in-b', 'active', 4, 70, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:18:00+07:00', 0.6, 'roster feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'sec-11', 'security', 'security-south', 'active', 5, 50, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:14:00+07:00', 0.88, 'roster feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'io-22', 'immigration-officer', 'immigration-west', 'active', 7, 45, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:17:00+07:00', 0.9, 'roster feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'io-25', 'immigration-officer', 'arrival-gate-b', 'available', 3, 80, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:17:00+07:00', 0.9, 'roster feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'cus-02', 'customs-officer', 'customs-hall', 'active', 4, 60, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:16:00+07:00', 0.82, 'roster feed fixture'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'ops-51', 'ground-staff', 'arrivals-hall', 'available', 3, 100, '2026-07-11T06:00:00+07:00', '2026-07-11T14:00:00+07:00', '2026-07-11T09:17:00+07:00', 0.85, 'roster feed fixture')
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
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'AX-417', 'arrival', 'landed', 312, '2026-07-11T09:10:00+07:00', 'arrival-gate-a'),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'SQ-981', 'departure', 'boarding-soon', 286, '2026-07-11T10:05:00+07:00', 'departure-gate-c')
ON CONFLICT (snapshot_id, flight_id) DO UPDATE
SET flight_type = EXCLUDED.flight_type,
    status = EXCLUDED.status,
    estimated_passengers = EXCLUDED.estimated_passengers,
    scheduled_at = EXCLUDED.scheduled_at,
    gate_zone_id = EXCLUDED.gate_zone_id;

DELETE FROM airport_ops.passenger_flows
WHERE snapshot_id = 'fixture-stale-2026-07-11T09:30:00+07:00';

INSERT INTO airport_ops.passenger_flows (snapshot_id, from_zone_id, to_zone_id, interval_minutes, estimated_count)
VALUES
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'terminal-entrance-east', 'check-in-a', 15, 210),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'check-in-a', 'bag-drop-a', 15, 130),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'bag-drop-a', 'security-north', 15, 105),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'arrival-gate-a', 'immigration-east', 15, 260),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'immigration-east', 'baggage-hall', 15, 180),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'departure-hall', 'security-north', 15, 230),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'security-north', 'departure-gate-c', 15, 160),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'terminal-entrance-west', 'check-in-b', 15, 180),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'terminal-entrance-west', 'departure-hall', 15, 95),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'terminal-entrance-east', 'departure-hall', 15, 110),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'check-in-b', 'bag-drop-a', 15, 100),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'departure-hall', 'security-south', 15, 200),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'security-north', 'departure-gate-a', 15, 85),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'security-south', 'departure-gate-b', 15, 95),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'security-south', 'departure-gate-d', 15, 90),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'departure-gate-a', 'transfer-corridor', 15, 25),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'departure-gate-b', 'transfer-corridor', 15, 20),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'departure-gate-c', 'transfer-corridor', 15, 30),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'departure-gate-d', 'transfer-corridor', 15, 20),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'arrival-gate-b', 'immigration-west', 15, 240),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'immigration-east', 'baggage-reclaim-north', 15, 160),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'immigration-west', 'baggage-reclaim-south', 15, 150),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'baggage-reclaim-north', 'customs-hall', 15, 120),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'baggage-reclaim-south', 'customs-hall', 15, 110),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'customs-hall', 'arrivals-hall', 15, 200);

DELETE FROM airport_ops.observations
WHERE snapshot_id = 'fixture-stale-2026-07-11T09:30:00+07:00';

WITH inserted_observation AS (
  INSERT INTO airport_ops.observations (snapshot_id, source, observed_at, confidence_score, confidence_basis, payload)
  VALUES ('fixture-stale-2026-07-11T09:30:00+07:00', 'edge-queue-analytics', '2026-07-11T09:18:00+07:00', 0.62, 'deterministic edge analytics fixture', '{}'::jsonb)
  RETURNING observation_id
)
INSERT INTO airport_ops.observation_metrics (observation_id, zone_id, queue_length, density_per_square_meter, active_service_load_per_minute, busy_counters)
SELECT observation_id, zone_id, queue_length, density_per_square_meter, active_service_load_per_minute, busy_counters
FROM inserted_observation
CROSS JOIN (
  VALUES
    ('check-in-a', 142, 3.3, 34, 6),
    ('bag-drop-a', 52, 2.1, 20, 4),
    ('check-in-b', 98, 2.6, 30, 5),
    ('security-south', 82, 2.4, 22, 5),
    ('immigration-west', 110, 2.8, 18, 7)
) AS metric(zone_id, queue_length, density_per_square_meter, active_service_load_per_minute, busy_counters);

INSERT INTO airport_ops.observations (snapshot_id, source, observed_at, confidence_score, confidence_basis, payload)
VALUES
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'camera-aggregate', '2026-07-11T09:18:00+07:00', 0.86, 'fixture', '{}'::jsonb),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'floor-plate', '2026-07-11T09:11:00+07:00', 0.78, 'fixture', '{}'::jsonb),
  ('fixture-stale-2026-07-11T09:30:00+07:00', 'roster', '2026-07-11T08:45:00+07:00', 0.9, 'fixture', '{}'::jsonb);
