-- Adds the persisted context needed to explain staffing feasibility and queue
-- rearrangement options while keeping downstream contexts on OperationalSnapshot.
-- Idempotent (IF NOT EXISTS) to match migration 0001: the seed runner re-applies
-- every migration on each run.

ALTER TABLE airport_ops.counter_states
  ADD COLUMN IF NOT EXISTS max_open_count integer,
  ADD COLUMN IF NOT EXISTS open_lead_minutes integer,
  ADD COLUMN IF NOT EXISTS observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confidence_score numeric(4, 3),
  ADD COLUMN IF NOT EXISTS confidence_basis text;

UPDATE airport_ops.counter_states AS counter
SET
  max_open_count = counter.available_count,
  open_lead_minutes = 10,
  observed_at = snapshot.as_of,
  confidence_score = 0.850,
  confidence_basis = 'backfilled counter status confidence'
FROM airport_ops.operational_snapshots AS snapshot
WHERE counter.snapshot_id = snapshot.snapshot_id
  AND (
    counter.max_open_count IS NULL
    OR counter.open_lead_minutes IS NULL
    OR counter.observed_at IS NULL
    OR counter.confidence_score IS NULL
    OR counter.confidence_basis IS NULL
  );

ALTER TABLE airport_ops.counter_states
  ALTER COLUMN max_open_count SET NOT NULL,
  ALTER COLUMN open_lead_minutes SET NOT NULL,
  ALTER COLUMN observed_at SET NOT NULL,
  ALTER COLUMN confidence_score SET NOT NULL,
  ALTER COLUMN confidence_basis SET NOT NULL;

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS; drop-then-add keeps re-runs clean.
ALTER TABLE airport_ops.counter_states
  DROP CONSTRAINT IF EXISTS counter_states_max_open_count_check,
  DROP CONSTRAINT IF EXISTS counter_states_open_lead_minutes_check,
  DROP CONSTRAINT IF EXISTS counter_states_confidence_score_check;

ALTER TABLE airport_ops.counter_states
  ADD CONSTRAINT counter_states_max_open_count_check CHECK (max_open_count >= open_count),
  ADD CONSTRAINT counter_states_open_lead_minutes_check CHECK (open_lead_minutes >= 0),
  ADD CONSTRAINT counter_states_confidence_score_check CHECK (confidence_score >= 0 AND confidence_score <= 1);

ALTER TABLE airport_ops.staff_states
  ADD COLUMN IF NOT EXISTS coverage_units integer,
  ADD COLUMN IF NOT EXISTS observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confidence_score numeric(4, 3),
  ADD COLUMN IF NOT EXISTS confidence_basis text;

UPDATE airport_ops.staff_states AS staff
SET
  coverage_units = 1,
  observed_at = snapshot.as_of,
  confidence_score = 0.850,
  confidence_basis = 'backfilled roster confidence'
FROM airport_ops.operational_snapshots AS snapshot
WHERE staff.snapshot_id = snapshot.snapshot_id
  AND (
    staff.coverage_units IS NULL
    OR staff.observed_at IS NULL
    OR staff.confidence_score IS NULL
    OR staff.confidence_basis IS NULL
  );

ALTER TABLE airport_ops.staff_states
  ALTER COLUMN coverage_units SET NOT NULL,
  ALTER COLUMN observed_at SET NOT NULL,
  ALTER COLUMN confidence_score SET NOT NULL,
  ALTER COLUMN confidence_basis SET NOT NULL;

ALTER TABLE airport_ops.staff_states
  DROP CONSTRAINT IF EXISTS staff_states_coverage_units_check,
  DROP CONSTRAINT IF EXISTS staff_states_confidence_score_check;

ALTER TABLE airport_ops.staff_states
  ADD CONSTRAINT staff_states_coverage_units_check CHECK (coverage_units > 0),
  ADD CONSTRAINT staff_states_confidence_score_check CHECK (confidence_score >= 0 AND confidence_score <= 1);

CREATE TABLE IF NOT EXISTS airport_ops.zone_role_transfer_rules (
  transfer_rule_id bigserial PRIMARY KEY,
  airport_id text NOT NULL REFERENCES airport_ops.airports (airport_id),
  role text NOT NULL,
  from_zone_id text NOT NULL REFERENCES airport_ops.zones (zone_id),
  to_zone_id text NOT NULL REFERENCES airport_ops.zones (zone_id),
  transfer_minutes integer NOT NULL CHECK (transfer_minutes >= 0),
  allowed boolean NOT NULL DEFAULT true,
  reason text NOT NULL DEFAULT 'operationally valid transfer',
  UNIQUE (airport_id, role, from_zone_id, to_zone_id)
);

CREATE INDEX IF NOT EXISTS zone_role_transfer_rules_lookup_idx
  ON airport_ops.zone_role_transfer_rules (airport_id, role, from_zone_id, to_zone_id);
