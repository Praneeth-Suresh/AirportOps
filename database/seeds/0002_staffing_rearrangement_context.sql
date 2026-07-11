-- Deterministic staffing and counter feasibility context for queue-management scenarios.

UPDATE airport_ops.counter_states
SET
  max_open_count = available_count,
  open_lead_minutes = CASE counter_id
    WHEN 'chk-a-01' THEN 6
    WHEN 'bag-a-01' THEN 8
    WHEN 'imm-e-01' THEN 10
    WHEN 'sec-n-01' THEN 12
    WHEN 'dep-h-01' THEN 10
    ELSE 10
  END,
  observed_at = CASE zone_id
    WHEN 'check-in-a' THEN '2026-07-11T09:19:00+07:00'::timestamptz
    WHEN 'bag-drop-a' THEN '2026-07-11T09:19:00+07:00'::timestamptz
    WHEN 'immigration-east' THEN '2026-07-11T09:17:00+07:00'::timestamptz
    WHEN 'security-north' THEN '2026-07-11T09:13:00+07:00'::timestamptz
    ELSE '2026-07-11T09:19:00+07:00'::timestamptz
  END,
  confidence_score = CASE zone_id
    WHEN 'check-in-a' THEN 0.880
    WHEN 'bag-drop-a' THEN 0.850
    WHEN 'immigration-east' THEN 0.860
    WHEN 'security-north' THEN 0.830
    ELSE 0.880
  END,
  confidence_basis = 'deterministic counter status fixture'
WHERE snapshot_id = 'fixture-peak-2026-07-11T09:20:00+07:00';

UPDATE airport_ops.staff_states
SET
  coverage_units = CASE staff_id
    WHEN 'io-12' THEN 8
    WHEN 'io-18' THEN 3
    WHEN 'sec-04' THEN 6
    WHEN 'sec-09' THEN 2
    WHEN 'ops-21' THEN 4
    WHEN 'ops-33' THEN 5
    WHEN 'ops-38' THEN 3
    ELSE 1
  END,
  shift_starts_at = '2026-07-11T06:00:00+07:00',
  shift_ends_at = '2026-07-11T14:00:00+07:00',
  observed_at = CASE role
    WHEN 'security' THEN '2026-07-11T09:14:00+07:00'::timestamptz
    WHEN 'ground-staff' THEN '2026-07-11T09:15:00+07:00'::timestamptz
    ELSE '2026-07-11T09:16:00+07:00'::timestamptz
  END,
  confidence_score = CASE role
    WHEN 'security' THEN 0.880
    ELSE 0.900
  END,
  confidence_basis = 'deterministic roster fixture'
WHERE snapshot_id = 'fixture-peak-2026-07-11T09:20:00+07:00';

INSERT INTO airport_ops.zone_role_transfer_rules (
  airport_id,
  role,
  from_zone_id,
  to_zone_id,
  transfer_minutes,
  allowed,
  reason
)
VALUES
  ('BKK', 'ground-staff', 'departure-hall', 'check-in-a', 7, true, 'same landside staffing pool'),
  ('BKK', 'ground-staff', 'bag-drop-a', 'check-in-a', 4, true, 'adjacent check-in support'),
  ('BKK', 'immigration-officer', 'arrival-gate-a', 'immigration-east', 6, true, 'arrival-side officer relief'),
  ('BKK', 'security', 'departure-hall', 'security-north', 8, true, 'same departure security pool')
ON CONFLICT (airport_id, role, from_zone_id, to_zone_id) DO UPDATE
SET transfer_minutes = EXCLUDED.transfer_minutes,
    allowed = EXCLUDED.allowed,
    reason = EXCLUDED.reason;
