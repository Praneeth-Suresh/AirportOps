# Handoff to Frontend: Otto Agent Integration

This document describes how to connect the Otto agent backend to the Stratus digital-twin surface (the existing frontend in `src/app/`). Otto is fully functional as a backend system — this handoff covers only the integration points.

## What Otto Provides

Otto is an airport operations decision-support AI agent backed by Terminal 3 (T3N) for:
- **Agent Identity** — Otto has a cryptographic DID (`did:t3n:<hex>`) that proves its identity in every recommendation
- **Scoped Permissions** — Otto can only read/write/propose what operators explicitly grant
- **Full Auditability** — Every action is logged with WHO, WHAT, WHEN, WHERE, WHY, and OUTCOME

## Backend Module Location

```
src/otto/
├── index.js         ← OttoAgent class (main entry point)
├── t3n-adapter.js   ← Terminal 3 Network adapter (identity, KV storage, TEE execution)
├── identity.js      ← DID-based agent identity and delegation management
├── permissions.js   ← Scoped permission evaluation engine
├── audit.js         ← Immutable audit trail
└── contracts/       ← TEE contract (Rust → WASM) for confidential computation
```

## How to Instantiate Otto

```javascript
import { createFixtureOtto } from "../otto/index.js";

// For local development and the existing fixture-driven app:
const otto = createFixtureOtto();
await otto.initialize();
// otto.identity.getDid() → "did:t3n:otto-fixture-0000..."
```

For production deployment:
```javascript
import { createProductionOtto } from "../otto/index.js";

const otto = createProductionOtto(process.env.T3N_API_KEY, process.env.AGENT_KEY);
await otto.initialize();
```

## Integration Points with the Stratus UI

### 1. Replace Direct `DecisionSupportService.options()` Calls

Currently, the app shell calls `decisionSupportService.options(...)` directly. Replace this with Otto's `generateOptions()` to gain identity, permissions, and audit:

**Before (current):**
```javascript
import { decisionSupportService } from "../decision-support/index.js";
const options = decisionSupportService.options(snapshot, forecast, projection, alerts);
```

**After (with Otto):**
```javascript
import { createFixtureOtto } from "../otto/index.js";

const otto = createFixtureOtto();
await otto.initialize();

const recommendation = await otto.generateOptions({
  snapshot,
  forecast,
  projections: [projection],
  operationalAlerts: alerts,
  queueStates: monitoring.analytics.queueStates,
  counterUtilizations: monitoring.analytics.counterUtilizations,
  staffingContexts: monitoring.analytics.staffingContexts,
});

// recommendation.options → same DecisionOption[] as before
// recommendation.agentDid → Otto's DID (for display)
// recommendation.auditRef → audit trail reference
// recommendation.confidence → aggregate confidence
```

### 2. Display Otto's Identity in the Assistant Panel

The Beagle decision copilot (the existing assistant UI) should display Otto's identity:

```javascript
const attestation = otto.attest();
// {
//   agentDid: "did:t3n:otto-fixture-...",
//   sessionValid: true,
//   environment: "fixture",
//   attestedAt: "2026-07-12T..."
// }
```

Suggested UI placement:
- Show Otto's name and a truncated DID in the assistant panel header
- Show session status indicator (green = authenticated, yellow = refreshing, red = disconnected)
- Show environment badge ("FIXTURE" / "TESTNET" / "PRODUCTION")

### 3. Operator Approval Workflow

Otto's proposals require operator approval. The frontend needs a proposal review flow:

```javascript
// Otto generates options
const rec = await otto.generateOptions({ snapshot, forecast, projections: [projection] });

// Operator selects an option and Otto creates a proposal
const proposal = await otto.createProposal(rec.options[0]);
// proposal.status === "pending"
// proposal.proposalId → unique ID

// Display in UI: "Otto proposes [decision type] in [zone]. Approve or reject?"

// Operator approves:
await otto.approveProposal(proposal.proposalId, operatorDid);

// Or rejects with reason:
await otto.rejectProposal(proposal.proposalId, operatorDid, "Too risky during peak");
```

Suggested UI components:
- Proposal card showing: decision type, affected zone, expected impact, confidence, rationale
- Approve / Reject buttons
- Rejection requires a reason text field
- Pending proposals badge count in the assistant panel

### 4. Explain Recommendations

When an operator clicks on a recommendation for details:

```javascript
const explanation = await otto.explain(option.optionId, rec.options);
// {
//   optionId, agentDid, explainedAt,
//   summary: "staff-reassignment affecting zone(s) check-in-a",
//   rationale: [{ label: "..." }, ...],
//   expectedImpact: { queuePressureDrop, passengersRelieved, ... },
//   confidence: { score, basis },
//   dataFreshness: { note, score, basis },
//   alternatives: [{ optionId, type, rank }, ...]
// }
```

### 5. Permissions Display

Show what Otto can and cannot do:

```javascript
const summary = otto.getPermissionsSummary();
// {
//   allowed: [{ action, resource, zones, policyId }, ...],
//   denied: [{ action, resource, zones, policyId }, ...],
//   requiresApproval: ["propose-staff-reassignment", ...]
// }
```

Suggested placement: settings/admin panel showing Otto's current access level.

### 6. Audit Trail Display

For compliance and operational review:

```javascript
// Recent audit entries
const recent = await otto.queryAudit({ limit: 20 });

// Filter by action type
const proposals = await otto.queryAudit({ action: "proposal-created" });

// Summary statistics
const summary = otto.getAuditSummary();
// { totalEntries, successCount, failureCount, actionCounts, ... }
```

Suggested UI: audit log panel in the admin/settings area showing timestamped entries.

### 7. Operator Delegation (Access Grant)

When an operator wants to expand Otto's permissions for specific zones:

```javascript
await otto.grantAccess(
  operatorDid,                     // who is granting
  ["check-in-a", "security-north"], // which zones
  ["propose"],                      // what actions
  ["staff-assignment", "counter-capacity"], // which resources
);
```

Suggested UI: an "Otto Permissions" panel where operators can grant/revoke zone access.

## Data Flow Diagram

```
┌─────────────────┐      ┌──────────────┐      ┌───────────────────┐
│  Stratus UI     │      │  OttoAgent   │      │  Decision Support │
│  (app shell)    │─────▶│  (src/otto/) │─────▶│  (src/decision-   │
│                 │      │              │      │   support/)        │
└────────┬────────┘      └──────┬───────┘      └───────────────────┘
         │                      │
         │                      │ checks permissions
         │                      │ records audit
         │                      │ wraps with DID provenance
         │                      │
         │               ┌──────▼───────┐
         │               │  T3N Network  │
         │               │ (TEE + KV)   │
         │               │              │
         │               │ • Identity   │
         │               │ • Storage    │
         │               │ • Contracts  │
         │               └──────────────┘
         │
         ▼
┌─────────────────┐
│  Operator       │
│  (approve/      │
│   reject)       │
└─────────────────┘
```

## Key Design Decisions for Frontend Integration

| Decision | Rationale |
|----------|-----------|
| Otto wraps (not replaces) DecisionSupportService | Backward compatible — existing options logic untouched |
| All Otto methods are async | T3N operations (KV, TEE) are inherently async |
| `createFixtureOtto()` for local dev | No T3N account or SDK needed for development |
| Proposals are "pending" by default | Operators remain in control — Otto only advises |
| Every response includes `agentDid` | Provenance is verifiable at every layer |
| Audit entries are queryable | Compliance teams can review Otto's behaviour |

## Environment Setup for Frontend Development

No additional dependencies are needed for fixture mode. The existing `python3 -m http.server` workflow works unchanged. Otto runs entirely in-process with deterministic fixture data.

For testnet/production, install the T3N SDK:
```bash
npm install @terminal3/t3n-sdk
```

And provide environment variables:
```bash
export T3N_API_KEY="your-developer-key"
export AGENT_KEY="otto-ethereum-private-key"
```

## Existing Test Coverage

39 tests cover the Otto agent system across all modules:
- T3N Adapter: 6 tests (auth, KV, contracts)
- Identity: 6 tests (DID, delegations, attestation)
- Permissions: 9 tests (allow/deny, zones, policies)
- Audit: 5 tests (record, query, filter, export)
- Full Agent Integration: 13 tests (end-to-end with real snapshot data)

Run with:
```bash
node --test tests/otto-agent.test.js
```

## What the Frontend Should NOT Do

1. **Do not call `DecisionSupportService.options()` directly** if you want identity/permissions/audit. Use `otto.generateOptions()` instead.
2. **Do not hardcode Otto's DID** — always read it from `otto.attest().agentDid`.
3. **Do not skip the proposal workflow** for operational changes. Otto marks all proposals as requiring approval.
4. **Do not store T3N credentials in frontend code** — they belong in environment variables or a secrets manager.
5. **Do not mutate recommendation.options directly** — they are frozen objects from the contracts layer.

## Module Exports Summary

```javascript
// Main agent
import { createFixtureOtto, createTestnetOtto, createProductionOtto, OttoAgent, ACTIONS, RESOURCES, AUDIT_ACTIONS } from "../otto/index.js";

// If you need lower-level access:
import { T3nAdapter, createFixtureAdapter } from "../otto/t3n-adapter.js";
import { OttoIdentity } from "../otto/identity.js";
import { OttoPermissions } from "../otto/permissions.js";
import { OttoAudit } from "../otto/audit.js";
```

## Next Steps for Frontend Team

1. **Instantiate Otto once** in the app shell initialization (alongside snapshot loading)
2. **Replace the direct `decisionSupportService.options()` call** with `otto.generateOptions()`
3. **Add identity display** to the Beagle assistant panel header
4. **Build a proposal approval UI** (card + approve/reject buttons)
5. **Add an explain detail drawer** that shows `otto.explain()` output
6. **Optional: Add audit log panel** for operational review

The backend is fully tested and ready. The frontend integration is purely presentational — no new business logic is needed.
