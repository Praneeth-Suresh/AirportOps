//! Otto Operations TEE Contract
//!
//! This contract executes inside T3N's Trusted Execution Environment, providing:
//! - Confidential evaluation of operational decisions
//! - TEE-attested proposal verification
//! - Signed recommendation attestations
//! - Tamper-resistant audit persistence
//!
//! All sensitive operational data (staff positions, passenger flows, zone capacities)
//! is processed inside the enclave and never leaves in plaintext.

#[cfg(target_arch = "wasm32")]
wit_bindgen::generate!({
    world: "otto-ops",
    path: "wit",
    additional_derives: [
        serde::Deserialize,
        serde::Serialize,
    ],
    generate_all,
});

mod evaluate;
mod verify;
mod sign;
mod audit;

struct Component;

#[cfg(target_arch = "wasm32")]
impl exports::z::otto_ops::contracts::Guest for Component {
    fn evaluate_options(
        req: exports::z::otto_ops::contracts::GenericInput,
    ) -> Result<Vec<u8>, String> {
        let input = req.input.ok_or("evaluate-options: missing input")?;
        evaluate::evaluate_options(&input)
    }

    fn verify_proposal(
        req: exports::z::otto_ops::contracts::GenericInput,
    ) -> Result<Vec<u8>, String> {
        let input = req.input.ok_or("verify-proposal: missing input")?;
        verify::verify_proposal(&input)
    }

    fn sign_recommendation(
        req: exports::z::otto_ops::contracts::GenericInput,
    ) -> Result<Vec<u8>, String> {
        let input = req.input.ok_or("sign-recommendation: missing input")?;
        sign::sign_recommendation(&input)
    }

    fn record_audit(
        req: exports::z::otto_ops::contracts::GenericInput,
    ) -> Result<Vec<u8>, String> {
        let input = req.input.ok_or("record-audit: missing input")?;
        audit::record_audit(&input)
    }
}

#[cfg(target_arch = "wasm32")]
export!(Component);
