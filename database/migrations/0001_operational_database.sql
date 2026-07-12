-- Postgres operational database schema for the airport operations model.
-- The operational-database bounded context owns these tables and exposes
-- contract-shaped readers to simulation, monitoring, prediction, and decision support.

CREATE SCHEMA IF NOT EXISTS airport_ops;

CREATE TABLE IF NOT EXISTS airport_ops.airports (
  airport_id text PRIMARY KEY,
  name text NOT NULL,
  map_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS airport_ops.zones (
  zone_id text PRIMARY KEY,
  airport_id text NOT NULL REFERENCES airport_ops.airports (airport_id),
  label text NOT NULL,
  zone_type text NOT NULL,
  capacity integer NOT NULL CHECK (capacity >= 0),
  service_rate_per_minute numeric(10, 2) NOT NULL CHECK (service_rate_per_minute >= 0),
  geometry jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS airport_ops.zone_paths (
  path_id bigserial PRIMARY KEY,
  airport_id text NOT NULL REFERENCES airport_ops.airports (airport_id),
  from_zone_id text NOT NULL REFERENCES airport_ops.zones (zone_id),
  to_zone_id text NOT NULL REFERENCES airport_ops.zones (zone_id),
  travel_time_minutes numeric(10, 2),
  path_geometry jsonb,
  UNIQUE (airport_id, from_zone_id, to_zone_id)
);

CREATE TABLE IF NOT EXISTS airport_ops.operational_snapshots (
  snapshot_id text PRIMARY KEY,
  airport_id text NOT NULL REFERENCES airport_ops.airports (airport_id),
  as_of timestamptz NOT NULL,
  contract_version text NOT NULL DEFAULT 'v1',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS airport_ops.zone_states (
  snapshot_id text NOT NULL REFERENCES airport_ops.operational_snapshots (snapshot_id) ON DELETE CASCADE,
  zone_id text NOT NULL REFERENCES airport_ops.zones (zone_id),
  occupancy integer NOT NULL CHECK (occupancy >= 0),
  confidence_score numeric(4, 3) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  confidence_basis text NOT NULL,
  observed_at timestamptz NOT NULL,
  freshness_status text NOT NULL CHECK (freshness_status IN ('fresh', 'watch', 'stale')),
  PRIMARY KEY (snapshot_id, zone_id)
);

CREATE TABLE IF NOT EXISTS airport_ops.counter_states (
  snapshot_id text NOT NULL REFERENCES airport_ops.operational_snapshots (snapshot_id) ON DELETE CASCADE,
  counter_id text NOT NULL,
  zone_id text NOT NULL REFERENCES airport_ops.zones (zone_id),
  open_count integer NOT NULL CHECK (open_count >= 0),
  available_count integer NOT NULL CHECK (available_count >= 0),
  role_required text NOT NULL,
  PRIMARY KEY (snapshot_id, counter_id)
);

CREATE TABLE IF NOT EXISTS airport_ops.staff_states (
  snapshot_id text NOT NULL REFERENCES airport_ops.operational_snapshots (snapshot_id) ON DELETE CASCADE,
  staff_id text NOT NULL,
  role text NOT NULL,
  zone_id text NOT NULL REFERENCES airport_ops.zones (zone_id),
  availability text NOT NULL,
  rest_minutes_due integer NOT NULL CHECK (rest_minutes_due >= 0),
  shift_starts_at timestamptz,
  shift_ends_at timestamptz,
  PRIMARY KEY (snapshot_id, staff_id)
);

CREATE TABLE IF NOT EXISTS airport_ops.flight_states (
  snapshot_id text NOT NULL REFERENCES airport_ops.operational_snapshots (snapshot_id) ON DELETE CASCADE,
  flight_id text NOT NULL,
  flight_type text NOT NULL CHECK (flight_type IN ('arrival', 'departure')),
  status text NOT NULL,
  estimated_passengers integer NOT NULL CHECK (estimated_passengers >= 0),
  scheduled_at timestamptz NOT NULL,
  gate_zone_id text NOT NULL REFERENCES airport_ops.zones (zone_id),
  PRIMARY KEY (snapshot_id, flight_id)
);

CREATE TABLE IF NOT EXISTS airport_ops.passenger_flows (
  snapshot_id text NOT NULL REFERENCES airport_ops.operational_snapshots (snapshot_id) ON DELETE CASCADE,
  flow_id bigserial PRIMARY KEY,
  from_zone_id text NOT NULL REFERENCES airport_ops.zones (zone_id),
  to_zone_id text NOT NULL REFERENCES airport_ops.zones (zone_id),
  interval_minutes integer NOT NULL CHECK (interval_minutes > 0),
  estimated_count integer NOT NULL CHECK (estimated_count >= 0)
);

CREATE TABLE IF NOT EXISTS airport_ops.observations (
  snapshot_id text NOT NULL REFERENCES airport_ops.operational_snapshots (snapshot_id) ON DELETE CASCADE,
  observation_id bigserial PRIMARY KEY,
  source text NOT NULL,
  observed_at timestamptz NOT NULL,
  confidence_score numeric(4, 3) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  confidence_basis text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS airport_ops.observation_metrics (
  observation_metric_id bigserial PRIMARY KEY,
  observation_id bigint NOT NULL REFERENCES airport_ops.observations (observation_id) ON DELETE CASCADE,
  zone_id text NOT NULL REFERENCES airport_ops.zones (zone_id),
  queue_length integer,
  density_per_square_meter numeric(10, 3),
  active_service_load_per_minute numeric(10, 2),
  busy_counters integer
);

CREATE TABLE IF NOT EXISTS airport_ops.flow_forecasts (
  forecast_id text PRIMARY KEY,
  snapshot_id text NOT NULL REFERENCES airport_ops.operational_snapshots (snapshot_id),
  generated_at timestamptz NOT NULL,
  horizon_start timestamptz NOT NULL,
  horizon_minutes integer NOT NULL CHECK (horizon_minutes > 0),
  resolution_minutes integer NOT NULL CHECK (resolution_minutes > 0),
  confidence_score numeric(4, 3) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  confidence_basis text NOT NULL,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS airport_ops.scenarios (
  scenario_id text PRIMARY KEY,
  snapshot_id text NOT NULL REFERENCES airport_ops.operational_snapshots (snapshot_id),
  forecast_id text REFERENCES airport_ops.flow_forecasts (forecast_id),
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'running', 'completed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS airport_ops.scenario_decisions (
  scenario_decision_id bigserial PRIMARY KEY,
  scenario_id text NOT NULL REFERENCES airport_ops.scenarios (scenario_id) ON DELETE CASCADE,
  decision_type text NOT NULL,
  decision_payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS airport_ops.operational_alerts (
  alert_id text PRIMARY KEY,
  snapshot_id text NOT NULL REFERENCES airport_ops.operational_snapshots (snapshot_id),
  zone_id text NOT NULL REFERENCES airport_ops.zones (zone_id),
  alert_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('watch', 'critical')),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('new', 'acknowledged', 'escalated', 'resolved', 'stale')),
  message text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  detected_at timestamptz NOT NULL,
  confidence_score numeric(4, 3) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  confidence_basis text NOT NULL,
  freshness jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS zone_states_snapshot_zone_idx ON airport_ops.zone_states (snapshot_id, zone_id);
CREATE INDEX IF NOT EXISTS passenger_flows_snapshot_from_to_idx ON airport_ops.passenger_flows (snapshot_id, from_zone_id, to_zone_id);
CREATE INDEX IF NOT EXISTS observations_snapshot_source_idx ON airport_ops.observations (snapshot_id, source);
CREATE INDEX IF NOT EXISTS operational_alerts_snapshot_zone_idx ON airport_ops.operational_alerts (snapshot_id, zone_id);
