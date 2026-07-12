//! Evaluate decision options inside the TEE.
//!
//! This function receives an operational snapshot, forecast, and projections,
//! then produces ranked decision options. Because it runs inside the enclave:
//! - Raw staff positions and passenger counts stay confidential
//! - The output is an attested set of options (not raw operational data)
//! - The host cannot tamper with the evaluation logic

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct EvaluateInput {
    snapshot_zones: Vec<ZoneSnapshot>,
    forecast_pressure: Vec<ZonePressure>,
    alerts: Vec<Alert>,
}

#[derive(Deserialize)]
struct ZoneSnapshot {
    zone_id: String,
    occupancy: u32,
    capacity: u32,
    open_counters: u32,
    max_counters: u32,
    active_staff: u32,
}

#[derive(Deserialize)]
struct ZonePressure {
    zone_id: String,
    queue_pressure: f64,
    expected_occupancy: u32,
}

#[derive(Deserialize)]
struct Alert {
    alert_id: String,
    zone_id: String,
    severity: String,
}

#[derive(Serialize)]
struct EvaluateOutput {
    options: Vec<DecisionOption>,
    attestation: Attestation,
}

#[derive(Serialize)]
struct DecisionOption {
    option_id: String,
    rank: u32,
    decision_type: String,
    zone_id: String,
    pressure_drop: f64,
    confidence: f64,
    rationale: String,
}

#[derive(Serialize)]
struct Attestation {
    environment: String,
    evaluated_at: String,
    zone_count: usize,
    option_count: usize,
}

/// Evaluate operational options inside the TEE enclave.
pub fn evaluate_options(input_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let input: EvaluateInput =
        serde_json::from_slice(input_bytes).map_err(|e| format!("parse error: {e}"))?;

    let mut options = Vec::new();
    let mut rank = 0u32;

    for zone in &input.snapshot_zones {
        // Find matching pressure forecast
        let pressure = input
            .forecast_pressure
            .iter()
            .find(|p| p.zone_id == zone.zone_id);

        let queue_pressure = pressure.map(|p| p.queue_pressure).unwrap_or(0.0);

        // Only generate options for zones under pressure
        if queue_pressure < 0.72 {
            continue;
        }

        // Check if alert exists for this zone
        let alert = input.alerts.iter().find(|a| a.zone_id == zone.zone_id);
        let severity_boost = match alert.map(|a| a.severity.as_str()) {
            Some("critical") => 0.3,
            Some("watch") => 0.15,
            _ => 0.0,
        };

        // Determine best decision type based on zone state
        let (decision_type, rationale) = if zone.open_counters < zone.max_counters {
            (
                "counter-capacity",
                format!(
                    "{} can open {} more counter(s) to relieve {:.0}% pressure",
                    zone.zone_id,
                    zone.max_counters - zone.open_counters,
                    queue_pressure * 100.0
                ),
            )
        } else if zone.active_staff > 0 {
            (
                "staff-reassignment",
                format!(
                    "{} at full counter capacity; reassign staff from lower-pressure zones",
                    zone.zone_id
                ),
            )
        } else {
            (
                "passenger-movement",
                format!(
                    "{} at capacity; route passengers to adjacent zones",
                    zone.zone_id
                ),
            )
        };

        rank += 1;
        let pressure_drop = (queue_pressure * 0.3 + severity_boost).min(1.0);
        let confidence = 0.85 - (rank as f64 * 0.02); // Decreasing confidence with rank

        options.push(DecisionOption {
            option_id: format!("tee-option-{}-{}", zone.zone_id, rank),
            rank,
            decision_type: decision_type.to_string(),
            zone_id: zone.zone_id.clone(),
            pressure_drop,
            confidence: confidence.max(0.5),
            rationale,
        });
    }

    // Sort by pressure drop (descending)
    options.sort_by(|a, b| b.pressure_drop.partial_cmp(&a.pressure_drop).unwrap());

    // Reassign ranks after sorting
    for (i, opt) in options.iter_mut().enumerate() {
        opt.rank = (i + 1) as u32;
    }

    let output = EvaluateOutput {
        attestation: Attestation {
            environment: "tee".to_string(),
            evaluated_at: "tee-clock".to_string(), // In production, use host clock
            zone_count: input.snapshot_zones.len(),
            option_count: options.len(),
        },
        options,
    };

    serde_json::to_vec(&output).map_err(|e| format!("serialize error: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evaluates_high_pressure_zones() {
        let input = serde_json::json!({
            "snapshot_zones": [
                { "zone_id": "checkin-A", "occupancy": 180, "capacity": 200, "open_counters": 4, "max_counters": 8, "active_staff": 6 },
                { "zone_id": "checkin-B", "occupancy": 50, "capacity": 200, "open_counters": 3, "max_counters": 6, "active_staff": 4 }
            ],
            "forecast_pressure": [
                { "zone_id": "checkin-A", "queue_pressure": 0.85, "expected_occupancy": 195 },
                { "zone_id": "checkin-B", "queue_pressure": 0.40, "expected_occupancy": 80 }
            ],
            "alerts": [
                { "alert_id": "alert-1", "zone_id": "checkin-A", "severity": "watch" }
            ]
        });

        let input_bytes = serde_json::to_vec(&input).unwrap();
        let result = evaluate_options(&input_bytes).unwrap();
        let output: EvaluateOutput = serde_json::from_slice(&result).unwrap();

        assert_eq!(output.options.len(), 1);
        assert_eq!(output.options[0].zone_id, "checkin-A");
        assert_eq!(output.options[0].decision_type, "counter-capacity");
        assert!(output.options[0].pressure_drop > 0.0);
    }

    #[test]
    fn skips_low_pressure_zones() {
        let input = serde_json::json!({
            "snapshot_zones": [
                { "zone_id": "arrivals", "occupancy": 20, "capacity": 200, "open_counters": 2, "max_counters": 4, "active_staff": 3 }
            ],
            "forecast_pressure": [
                { "zone_id": "arrivals", "queue_pressure": 0.30, "expected_occupancy": 40 }
            ],
            "alerts": []
        });

        let input_bytes = serde_json::to_vec(&input).unwrap();
        let result = evaluate_options(&input_bytes).unwrap();
        let output: EvaluateOutput = serde_json::from_slice(&result).unwrap();

        assert_eq!(output.options.len(), 0);
    }
}
