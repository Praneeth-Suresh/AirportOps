-- Store the prediction refresh policy with persisted forecast metadata.

ALTER TABLE airport_ops.flow_forecasts
  ADD COLUMN IF NOT EXISTS refresh_cadence_seconds integer NOT NULL DEFAULT 60
  CHECK (refresh_cadence_seconds > 0);
