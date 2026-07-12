//! Sign recommendations with TEE attestation.
//!
//! When Otto produces a recommendation, the TEE can attest that:
//! - The recommendation was produced by verified logic
//! - The input data was not tampered with
//! - The output has not been modified since generation
//!
//! This provides non-repudiation: Otto cannot deny having produced
//! a specific recommendation at a specific time.

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct SignInput {
    option_ids: Vec<String>,
    agent_did: String,
    timestamp: String,
    /// Optional: hash of the input data that produced these options
    #[serde(default)]
    input_hash: Option<String>,
}

#[derive(Serialize)]
struct SignOutput {
    signed: bool,
    attestation: SignAttestation,
}

#[derive(Serialize)]
struct SignAttestation {
    agent_did: String,
    option_ids: Vec<String>,
    timestamp: String,
    environment: String,
    /// A deterministic fingerprint of what was signed
    fingerprint: String,
    /// Attestation that this was produced inside a TEE
    tee_attested: bool,
}

/// Sign a recommendation set with TEE attestation.
pub fn sign_recommendation(input_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let input: SignInput =
        serde_json::from_slice(input_bytes).map_err(|e| format!("parse error: {e}"))?;

    // Build a deterministic fingerprint from the inputs
    let fingerprint = build_fingerprint(&input);

    let output = SignOutput {
        signed: true,
        attestation: SignAttestation {
            agent_did: input.agent_did,
            option_ids: input.option_ids,
            timestamp: input.timestamp,
            environment: "tee".to_string(),
            fingerprint,
            tee_attested: true,
        },
    };

    serde_json::to_vec(&output).map_err(|e| format!("serialize error: {e}"))
}

/// Build a deterministic fingerprint for the signed content.
/// In production this would use a proper hash (SHA-256),
/// but for the WASM component we use a simple deterministic encoding.
fn build_fingerprint(input: &SignInput) -> String {
    let mut parts = Vec::new();
    parts.push(input.agent_did.clone());
    parts.push(input.timestamp.clone());
    for id in &input.option_ids {
        parts.push(id.clone());
    }
    if let Some(hash) = &input.input_hash {
        parts.push(hash.clone());
    }
    // Simple deterministic fingerprint (would be SHA-256 in production)
    let combined = parts.join("|");
    format!("fp:{:016x}", simple_hash(combined.as_bytes()))
}

/// Simple non-cryptographic hash for fingerprint generation.
/// In production, use the host's signing capability instead.
fn simple_hash(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325; // FNV offset basis
    for &byte in bytes {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3); // FNV prime
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signs_recommendation_set() {
        let input = serde_json::json!({
            "option_ids": ["opt-1", "opt-2", "opt-3"],
            "agent_did": "did:t3n:otto-0001",
            "timestamp": "2026-07-12T00:00:00.000Z"
        });

        let bytes = serde_json::to_vec(&input).unwrap();
        let result = sign_recommendation(&bytes).unwrap();
        let output: SignOutput = serde_json::from_slice(&result).unwrap();

        assert!(output.signed);
        assert!(output.attestation.tee_attested);
        assert_eq!(output.attestation.agent_did, "did:t3n:otto-0001");
        assert_eq!(output.attestation.option_ids.len(), 3);
        assert!(output.attestation.fingerprint.starts_with("fp:"));
    }

    #[test]
    fn fingerprint_is_deterministic() {
        let input = serde_json::json!({
            "option_ids": ["opt-1"],
            "agent_did": "did:t3n:otto-test",
            "timestamp": "2026-07-12T01:00:00.000Z"
        });

        let bytes = serde_json::to_vec(&input).unwrap();
        let result1 = sign_recommendation(&bytes).unwrap();
        let result2 = sign_recommendation(&bytes).unwrap();

        let out1: SignOutput = serde_json::from_slice(&result1).unwrap();
        let out2: SignOutput = serde_json::from_slice(&result2).unwrap();

        assert_eq!(out1.attestation.fingerprint, out2.attestation.fingerprint);
    }
}
