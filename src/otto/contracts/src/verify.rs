//! Verify proposals against operational constraints inside the TEE.
//!
//! Before an operator approves a proposal, the TEE can validate it:
//! - Staff transfer rules are respected
//! - Counter capacity limits are not exceeded
//! - Zone-role transfer paths exist
//! - Rest time constraints are met
//! - Origin zone is not left understaffed

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct VerifyInput {
    proposal: Proposal,
    constraints: Constraints,
}

#[derive(Deserialize)]
struct Proposal {
    proposal_id: String,
    decision_type: String,
    zone_id: String,
    #[serde(default)]
    from_zone_id: Option<String>,
    #[serde(default)]
    coverage_units: Option<u32>,
    #[serde(default)]
    open_delta: Option<u32>,
    #[serde(default)]
    passengers: Option<u32>,
}

#[derive(Deserialize)]
struct Constraints {
    /// Maximum counters that can be open in the target zone
    #[serde(default)]
    max_counters: Option<u32>,
    /// Currently open counters
    #[serde(default)]
    current_open: Option<u32>,
    /// Whether a valid transfer rule exists from source to target zone
    #[serde(default)]
    transfer_rule_exists: bool,
    /// Minimum staff that must remain in the source zone
    #[serde(default)]
    min_staff_at_source: Option<u32>,
    /// Current staff count at the source zone
    #[serde(default)]
    current_staff_at_source: Option<u32>,
    /// Whether the staff member has enough rest time
    #[serde(default)]
    rest_time_sufficient: bool,
    /// Target zone capacity
    #[serde(default)]
    target_zone_capacity: Option<u32>,
    /// Current occupancy of the target zone (for passenger movement)
    #[serde(default)]
    target_zone_occupancy: Option<u32>,
}

#[derive(Serialize)]
struct VerifyOutput {
    valid: bool,
    violations: Vec<Violation>,
    attestation: VerifyAttestation,
}

#[derive(Serialize)]
struct Violation {
    rule: String,
    description: String,
    severity: String, // "blocking" | "warning"
}

#[derive(Serialize)]
struct VerifyAttestation {
    proposal_id: String,
    verified_at: String,
    environment: String,
    constraint_count: usize,
}

/// Verify a proposal against operational constraints inside the TEE.
pub fn verify_proposal(input_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let input: VerifyInput =
        serde_json::from_slice(input_bytes).map_err(|e| format!("parse error: {e}"))?;

    let mut violations = Vec::new();

    match input.proposal.decision_type.as_str() {
        "counter-capacity" => {
            verify_counter_capacity(&input.proposal, &input.constraints, &mut violations);
        }
        "staff-reassignment" => {
            verify_staff_reassignment(&input.proposal, &input.constraints, &mut violations);
        }
        "passenger-movement" => {
            verify_passenger_movement(&input.proposal, &input.constraints, &mut violations);
        }
        "shift-timing" => {
            // Shift timing changes are lower-risk; minimal constraints
            verify_shift_timing(&input.proposal, &input.constraints, &mut violations);
        }
        other => {
            violations.push(Violation {
                rule: "known-decision-type".to_string(),
                description: format!("Unknown decision type: {other}"),
                severity: "blocking".to_string(),
            });
        }
    }

    let has_blocking = violations.iter().any(|v| v.severity == "blocking");

    let output = VerifyOutput {
        valid: !has_blocking,
        violations,
        attestation: VerifyAttestation {
            proposal_id: input.proposal.proposal_id.clone(),
            verified_at: "tee-clock".to_string(),
            environment: "tee".to_string(),
            constraint_count: count_constraints(&input.constraints),
        },
    };

    serde_json::to_vec(&output).map_err(|e| format!("serialize error: {e}"))
}

fn verify_counter_capacity(proposal: &Proposal, constraints: &Constraints, violations: &mut Vec<Violation>) {
    if let (Some(max), Some(current), Some(delta)) = (
        constraints.max_counters,
        constraints.current_open,
        proposal.open_delta,
    ) {
        if current + delta > max {
            violations.push(Violation {
                rule: "counter-capacity-limit".to_string(),
                description: format!(
                    "Opening {} more counters would exceed max capacity ({} + {} > {})",
                    delta, current, delta, max
                ),
                severity: "blocking".to_string(),
            });
        }
    }
}

fn verify_staff_reassignment(proposal: &Proposal, constraints: &Constraints, violations: &mut Vec<Violation>) {
    // Transfer rule must exist
    if !constraints.transfer_rule_exists {
        violations.push(Violation {
            rule: "transfer-rule-exists".to_string(),
            description: format!(
                "No transfer rule exists from {} to {}",
                proposal.from_zone_id.as_deref().unwrap_or("unknown"),
                proposal.zone_id
            ),
            severity: "blocking".to_string(),
        });
    }

    // Source zone must not be left understaffed
    if let (Some(min_staff), Some(current_staff), Some(units)) = (
        constraints.min_staff_at_source,
        constraints.current_staff_at_source,
        proposal.coverage_units,
    ) {
        if current_staff.saturating_sub(units) < min_staff {
            violations.push(Violation {
                rule: "source-zone-minimum-staff".to_string(),
                description: format!(
                    "Moving {} unit(s) from source would leave {} staff, below minimum {}",
                    units,
                    current_staff.saturating_sub(units),
                    min_staff
                ),
                severity: "blocking".to_string(),
            });
        }
    }

    // Rest time must be sufficient
    if !constraints.rest_time_sufficient {
        violations.push(Violation {
            rule: "rest-time-policy".to_string(),
            description: "Staff member does not have sufficient rest time for reassignment".to_string(),
            severity: "warning".to_string(),
        });
    }
}

fn verify_passenger_movement(proposal: &Proposal, constraints: &Constraints, violations: &mut Vec<Violation>) {
    if let (Some(capacity), Some(occupancy), Some(passengers)) = (
        constraints.target_zone_capacity,
        constraints.target_zone_occupancy,
        proposal.passengers,
    ) {
        if occupancy + passengers > capacity {
            violations.push(Violation {
                rule: "target-zone-capacity".to_string(),
                description: format!(
                    "Moving {} passengers to target zone would exceed capacity ({} + {} > {})",
                    passengers, occupancy, passengers, capacity
                ),
                severity: "blocking".to_string(),
            });
        }
    }
}

fn verify_shift_timing(_proposal: &Proposal, constraints: &Constraints, violations: &mut Vec<Violation>) {
    if !constraints.rest_time_sufficient {
        violations.push(Violation {
            rule: "shift-rest-policy".to_string(),
            description: "Shift timing change would violate rest time policy".to_string(),
            severity: "warning".to_string(),
        });
    }
}

fn count_constraints(constraints: &Constraints) -> usize {
    let mut count = 0;
    if constraints.max_counters.is_some() { count += 1; }
    if constraints.current_open.is_some() { count += 1; }
    if constraints.transfer_rule_exists { count += 1; }
    if constraints.min_staff_at_source.is_some() { count += 1; }
    if constraints.current_staff_at_source.is_some() { count += 1; }
    if constraints.rest_time_sufficient { count += 1; }
    if constraints.target_zone_capacity.is_some() { count += 1; }
    if constraints.target_zone_occupancy.is_some() { count += 1; }
    count
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_counter_capacity_proposal() {
        let input = serde_json::json!({
            "proposal": {
                "proposal_id": "p-1",
                "decision_type": "counter-capacity",
                "zone_id": "checkin-A",
                "open_delta": 2
            },
            "constraints": {
                "max_counters": 8,
                "current_open": 4,
                "transfer_rule_exists": false,
                "rest_time_sufficient": true
            }
        });

        let bytes = serde_json::to_vec(&input).unwrap();
        let result = verify_proposal(&bytes).unwrap();
        let output: VerifyOutput = serde_json::from_slice(&result).unwrap();

        assert!(output.valid);
        assert!(output.violations.is_empty());
    }

    #[test]
    fn exceeds_counter_capacity() {
        let input = serde_json::json!({
            "proposal": {
                "proposal_id": "p-2",
                "decision_type": "counter-capacity",
                "zone_id": "checkin-A",
                "open_delta": 5
            },
            "constraints": {
                "max_counters": 8,
                "current_open": 6,
                "transfer_rule_exists": false,
                "rest_time_sufficient": true
            }
        });

        let bytes = serde_json::to_vec(&input).unwrap();
        let result = verify_proposal(&bytes).unwrap();
        let output: VerifyOutput = serde_json::from_slice(&result).unwrap();

        assert!(!output.valid);
        assert_eq!(output.violations.len(), 1);
        assert_eq!(output.violations[0].rule, "counter-capacity-limit");
    }

    #[test]
    fn staff_reassignment_no_transfer_rule() {
        let input = serde_json::json!({
            "proposal": {
                "proposal_id": "p-3",
                "decision_type": "staff-reassignment",
                "zone_id": "checkin-A",
                "from_zone_id": "arrivals",
                "coverage_units": 2
            },
            "constraints": {
                "transfer_rule_exists": false,
                "min_staff_at_source": 2,
                "current_staff_at_source": 4,
                "rest_time_sufficient": true
            }
        });

        let bytes = serde_json::to_vec(&input).unwrap();
        let result = verify_proposal(&bytes).unwrap();
        let output: VerifyOutput = serde_json::from_slice(&result).unwrap();

        assert!(!output.valid);
        assert!(output.violations.iter().any(|v| v.rule == "transfer-rule-exists"));
    }
}
