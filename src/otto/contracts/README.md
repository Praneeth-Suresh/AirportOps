# Otto TEE Contract

This directory contains Otto's Trusted Execution Environment (TEE) contract, designed to run on the Terminal 3 Network (T3N).

## Purpose

The TEE contract provides hardware-enforced confidential computation for:
- **evaluate-options** — Analyze operational data and produce decision options without exposing raw zone/staff/passenger data outside the enclave
- **verify-proposal** — Validate proposals against operational constraints with TEE attestation
- **sign-recommendation** — Produce non-repudiable attestations for recommendation sets
- **record-audit** — Persist audit entries in tamper-resistant TEE storage

## Build

Prerequisites:
```bash
rustup target add wasm32-wasip2
cargo install wasm-tools  # optional, for inspection
```

Build the WASM component:
```bash
cargo build --target wasm32-wasip2 --release
```

The output will be at:
```
target/wasm32-wasip2/release/z_otto_ops.wasm
```

## Run native tests

```bash
cargo test
```

## Register on T3N

After building, register the contract using the T3N SDK:

```javascript
import { readFile } from "fs/promises";

const wasmBytes = await readFile("target/wasm32-wasip2/release/z_otto_ops.wasm");
const result = await tenant.contracts.register({
  tail: "otto-ops",
  version: "0.1.0",
  wasm: wasmBytes,
});
console.log(`Registered as contract id ${result.contract_id}`);
```

## Create Required KV Maps

Otto's contract needs the following maps:
```javascript
await tenant.maps.create({ tail: "otto-audit", readers: [contractId], writers: [contractId] });
await tenant.maps.create({ tail: "otto-state", readers: [contractId], writers: [contractId] });
```

## Architecture

```
src/
├── lib.rs       ← Entry point, WIT bindings, Guest impl dispatch
├── evaluate.rs  ← Decision option evaluation logic
├── verify.rs    ← Proposal constraint verification
├── sign.rs      ← Recommendation attestation signing
└── audit.rs     ← TEE-side audit persistence

wit/
└── world.wit    ← WIT interface definition (imports + exports)
```

## Key Design Rules

1. Export functions on the `contracts` interface — each takes `generic-input` and returns `result<list<u8>, string>`
2. Import only needed host interfaces (kv-store, logging, tenant-context)
3. The host enforces z-namespace prefix — no cross-tenant access by accident
4. All data processed inside the enclave stays confidential
5. Outputs are attestation-signed summaries, not raw operational data
