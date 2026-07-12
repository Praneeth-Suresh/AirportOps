# Terminal 3 Setup in AirportOps

This document explains how Terminal 3 (T3N) is integrated into this repository to provide agent identity, scoped permissions, and auditability for the Otto decision-support agent.

## Overview

Terminal 3 is a decentralized confidential-computing network that provides:

- **Decentralized Identifiers (DIDs)** — cryptographic, permanent identity for agents and users
- **Trusted Execution Environments (TEEs)** — hardware-secured enclaves for confidential computation
- **Tenant-scoped KV storage** — namespaced, access-controlled persistent state inside TEEs
- **Capability-based access** — contracts can only do what their WIT imports declare

In this repo, Terminal 3 backs the **Otto** agent — the AI that analyzes airport operations and delivers actionable recommendations to operators.

## Architecture

```
src/otto/
├── t3n-adapter.js       ← Adapter wrapping @terminal3/t3n-sdk
├── identity.js          ← DID-based agent identity
├── permissions.js       ← Scoped permission engine
├── audit.js             ← Immutable audit trail (persisted in T3N KV)
├── index.js             ← OttoAgent orchestrator
└── contracts/           ← TEE contract (Rust → WASM)
    ├── wit/world.wit    ← WIT interface definition
    ├── Cargo.toml       ← Rust build configuration
    └── src/
        ├── lib.rs       ← Entry point and dispatch
        ├── evaluate.rs  ← Decision option evaluation in TEE
        ├── verify.rs    ← Proposal constraint verification
        ├── sign.rs      ← Recommendation attestation signing
        └── audit.rs     ← Tamper-resistant audit persistence
```

## How Terminal 3 Is Used

### 1. Agent Identity (DID)

Otto authenticates to T3N and receives a Decentralized Identifier:

```
did:t3n:<40-hex-unique-id>
```

This DID is:

- Minted on first authentication (never derived or hardcoded)
- Read back from the T3N session response
- Attached to every recommendation Otto produces
- Verifiable by any party without Otto's cooperation

The identity flow in the adapter (`t3n-adapter.js`):

```javascript
// Production: SIWE (Sign-In With Ethereum) authentication
setEnvironment("testnet"); // or "production"
const address = eth_get_address(agentKey);
const t3n = new T3nClient({
  wasmComponent,
  handlers: { EthSign: metamask_sign(address, undefined, agentKey) },
});
await t3n.handshake();
const did = await t3n.authenticate(createEthAuthInput(address));
const tenantDid = did.value; // did:t3n:<random-hex> — read, never derived
```

For local development, a fixture adapter produces a deterministic DID without network access.

### 2. Scoped Permissions (T3N z-namespace ACLs)

Permissions map to T3N's storage model:

| Permission Layer         | T3N Mechanism                                            |
| ------------------------ | -------------------------------------------------------- |
| Data access (read/write) | KV map reader/writer ACLs per`z:<tid>:<map>`           |
| Contract execution       | Per-contract function allowlists (`agent-auth-update`) |
| External API access      | Per-contract egress host allowlists                      |
| Operator delegation      | `agent-auth-update` signed by the data owner           |

The permission model enforces:

- **Deny-by-default** — Otto has no permission unless explicitly granted
- **Zone-level granularity** — operators can scope Otto to specific airport zones
- **Time-window constraints** — permissions can expire
- **Approval requirements** — proposals always require operator confirmation

KV maps used by Otto follow T3N's z-namespace convention:

```
z:<tenantId>:otto-identity      ← Agent identity record
z:<tenantId>:otto-permissions   ← Permission policies
z:<tenantId>:otto-audit         ← Audit trail entries
z:<tenantId>:otto-audit-index   ← Audit counter for unique IDs
z:<tenantId>:otto-delegations   ← Operator delegation records
z:<tenantId>:otto-proposals     ← Pending proposal state
```

Each map has explicit reader/writer ACLs that restrict access to Otto's contract ID only.

### 3. Auditability (TEE-Persisted Audit Trail)

Every action Otto takes is recorded with:

| Field                  | What it captures                                                   |
| ---------------------- | ------------------------------------------------------------------ |
| `entryId`            | Unique audit identifier                                            |
| `agentDid`           | Otto's DID at time of action                                       |
| `timestamp`          | ISO timestamp from T3N's trusted clock                             |
| `action`             | What Otto did (e.g.,`options-generated`, `proposal-created`)   |
| `resource`           | What was acted on (e.g.,`decision-option`, `staff-assignment`) |
| `zone`               | Which airport zone was affected                                    |
| `trigger`            | Why Otto acted (alert, forecast, operator request)                 |
| `outcome`            | Success/failure and result details                                 |
| `permissionCheck`    | Which policy authorized this action                                |
| `sessionEnvironment` | Whether this was fixture/testnet/production                        |

Audit entries are persisted to T3N's tenant-scoped KV store inside a TEE, which means:

- Storage is inside a hardware-secured enclave (tamper-resistant)
- Only Otto's contract can read/write its own namespace
- Entries survive across sessions
- They can be exported for external compliance systems

### 4. TEE Contract (Confidential Computation)

Otto's sensitive decision logic runs as a Rust → WASM contract inside T3N's Trusted Execution Environment. The contract is defined by a WIT (WebAssembly Interface Types) file:

```wit
package z:otto-ops@0.1.0;

world otto-ops {
  import host:tenant/tenant-context@1.0.0;
  import host:interfaces/logging@2.1.0;
  import host:interfaces/kv-store@2.1.0;

  export contracts;
}
```

The contract exports four functions:

| Function                | Purpose                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| `evaluate-options`    | Analyze operational data and produce ranked options inside the enclave |
| `verify-proposal`     | Validate proposals against operational constraints (TEE-attested)      |
| `sign-recommendation` | Produce non-repudiable attestations for recommendation sets            |
| `record-audit`        | Persist audit entries in tamper-resistant TEE storage                  |

Key design rules from Terminal 3:

- Imported host interfaces are the contract's **entire** capability set — nothing else is accessible
- KV operations use the full `z:<tid>:<map>` name; the host enforces the tenant prefix
- The contract cannot access the network, filesystem, or clock unless imported
- All data processed inside the enclave stays confidential

### 5. Operator Delegation (agent-auth-update)

Before Otto can act on behalf of an operator, the operator must sign an `agent-auth-update` grant:

```javascript
// Signed by the OPERATOR (data owner), not Otto
await userClient.execute({
  script_name: "tee:user/contracts",
  function_name: "agent-auth-update",
  input: {
    agents: [{
      agentDid: ottoDid,
      scripts: [{
        scriptName: "z:<tid>:otto-ops",
        functions: ["evaluate-options", "verify-proposal", "sign-recommendation"],
        allowedHosts: [], // Otto makes no outbound calls
      }],
    }],
  },
});
```

This means:

- Otto cannot execute contract functions until an operator explicitly authorizes it
- Authorization is scoped to specific functions
- External API access (egress) is controlled per-grant, not per-contract
- Grants are revocable at any time

## Environment Modes

| Mode           | T3N Dependency                 | Use Case             |
| -------------- | ------------------------------ | -------------------- |
| `fixture`    | None — in-memory stub         | Local dev, tests, CI |
| `testnet`    | T3N testnet (requires API key) | Integration testing  |
| `production` | T3N production network         | Live deployment      |

The fixture mode mirrors all T3N operations deterministically, so the full Otto system can be exercised without network access or a T3N account.

## Dependencies

**For fixture/development mode:** No additional dependencies. Otto runs with the existing zero-dependency ES module setup.

**For testnet/production mode:**

```bash
npm install @terminal3/t3n-sdk
```

**For the TEE contract:**

```bash
rustup target add wasm32-wasip2
cargo install wasm-tools  # optional, for inspection
```

Build the contract:

```bash
cd src/otto/contracts
cargo build --target wasm32-wasip2 --release
```

## How This Differs from a Typical T3N Integration

Most T3N applications use the platform for **user data privacy** (e.g., keeping payment info or PII out of agent memory via `http-with-placeholders`). This repo uses T3N differently:

1. **Agent identity** — Otto itself is the identity holder, not a human user
2. **Operational data protection** — zone occupancy, staff positions, and passenger flows are the confidential data, not personal information
3. **Decision provenance** — T3N's DID and TEE attestation prove which agent produced which recommendation
4. **Governance compliance** — the audit trail satisfies airport regulatory requirements for AI-assisted operational decisions

## Test Coverage

39 tests verify the Terminal 3 integration:

```bash
node --test tests/otto-agent.test.js
```

Tests cover:

- T3N adapter authentication and KV operations (6 tests)
- DID identity lifecycle and delegations (6 tests)
- Permission evaluation, zone scoping, and policies (9 tests)
- Audit recording, querying, and export (5 tests)
- Full OttoAgent integration with real airport fixture data (13 tests)
