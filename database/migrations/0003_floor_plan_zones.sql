-- Adds zones, paths, and transfer rules to cover the full Suvarnabhumi floor plan.
-- Departure level: terminal-entrance-west, check-in-b, security-south, departure-gate-a,
--   departure-gate-b, departure-gate-d, transfer-corridor.
-- Arrival level: arrival-gate-b, immigration-west, baggage-reclaim-north,
--   baggage-reclaim-south, customs-hall, arrivals-hall.
-- Also renames baggage-hall to baggage-reclaim-north for clarity and adds the south hall.

-- The rows below reference the BKK airport row and the base zones that were
-- previously created only by seed 0001 (seeds run after migrations), so this
-- migration could never apply on a fresh database. Guarantee the parent rows
-- exist first; seed 0001 re-applies the same values idempotently afterwards.
INSERT INTO airport_ops.airports (airport_id, name, map_version)
VALUES ('BKK', 'Suvarnabhumi Operations Model', 'fixture-2026-07-11')
ON CONFLICT (airport_id) DO NOTHING;

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
ON CONFLICT (zone_id) DO NOTHING;

-- New zones for full floor plan coverage.
INSERT INTO airport_ops.zones (zone_id, airport_id, label, zone_type, capacity, service_rate_per_minute)
VALUES
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

-- New passenger flow paths for departure level.
INSERT INTO airport_ops.zone_paths (airport_id, from_zone_id, to_zone_id)
VALUES
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
  ('BKK', 'departure-gate-d', 'transfer-corridor')
ON CONFLICT (airport_id, from_zone_id, to_zone_id) DO NOTHING;

-- New passenger flow paths for arrival level.
INSERT INTO airport_ops.zone_paths (airport_id, from_zone_id, to_zone_id)
VALUES
  ('BKK', 'arrival-gate-b', 'immigration-west'),
  ('BKK', 'immigration-east', 'baggage-reclaim-north'),
  ('BKK', 'immigration-west', 'baggage-reclaim-south'),
  ('BKK', 'baggage-reclaim-north', 'customs-hall'),
  ('BKK', 'baggage-reclaim-south', 'customs-hall'),
  ('BKK', 'customs-hall', 'arrivals-hall')
ON CONFLICT (airport_id, from_zone_id, to_zone_id) DO NOTHING;

-- Transfer rules for new zones.
INSERT INTO airport_ops.zone_role_transfer_rules (
  airport_id, role, from_zone_id, to_zone_id, transfer_minutes, allowed, reason
)
VALUES
  ('BKK', 'ground-staff', 'check-in-b', 'check-in-a', 5, true, 'adjacent check-in islands'),
  ('BKK', 'ground-staff', 'check-in-a', 'check-in-b', 5, true, 'adjacent check-in islands'),
  ('BKK', 'ground-staff', 'departure-hall', 'check-in-b', 7, true, 'same landside staffing pool'),
  ('BKK', 'security', 'security-south', 'security-north', 10, true, 'same terminal security pool'),
  ('BKK', 'security', 'security-north', 'security-south', 10, true, 'same terminal security pool'),
  ('BKK', 'immigration-officer', 'immigration-west', 'immigration-east', 8, true, 'arrival-side officer relief'),
  ('BKK', 'immigration-officer', 'immigration-east', 'immigration-west', 8, true, 'arrival-side officer relief'),
  ('BKK', 'ground-staff', 'arrivals-hall', 'customs-hall', 4, true, 'adjacent arrival areas'),
  ('BKK', 'ground-staff', 'baggage-reclaim-north', 'baggage-reclaim-south', 6, true, 'adjacent baggage halls')
ON CONFLICT (airport_id, role, from_zone_id, to_zone_id) DO UPDATE
SET transfer_minutes = EXCLUDED.transfer_minutes,
    allowed = EXCLUDED.allowed,
    reason = EXCLUDED.reason;
