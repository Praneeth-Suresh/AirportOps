import assert from "node:assert/strict";
import test from "node:test";
import { createFixtureOtto, OttoAgent, ACTIONS, RESOURCES, AUDIT_ACTIONS } from "../src/otto/index.js";
import { T3nAdapter, createFixtureAdapter } from "../src/otto/t3n-adapter.js";
import { OttoIdentity } from "../src/otto/identity.js";
import { OttoPermissions } from "../src/otto/permissions.js";
import { OttoAudit } from "../src/otto/audit.js";
import { createOperationalStateReader } from "../src/operational-state/index.js";
import { predictionService } from "../src/prediction/index.js";
import { defaultScenarioDecisions, simulationService } from "../src/simulation/index.js";
import { MonitoringViewModel } from "../src/monitoring/index.js";

// ---------------------------------------------------------------------------
// T3N Adapter Tests
// ---------------------------------------------------------------------------

test("T3nAdapter: fixture mode authenticates with a deterministic DID", async () => {
  const adapter = createFixtureAdapter();
  const session = await adapter.authenticate();

  assert.ok(session.did.startsWith("did:t3n:"));
  assert.equal(session.authenticated, true);
  assert.equal(session.environment, "fixture");
  assert.ok(session.tenantId.length > 0);
});

test("T3nAdapter: KV operations persist and retrieve data", async () => {
  const adapter = createFixtureAdapter();
  await adapter.authenticate();

  await adapter.kvSet("test-map", "key-1", "value-1");
  const value = await adapter.kvGet("test-map", "key-1");
  assert.equal(value, "value-1");

  const keys = await adapter.kvKeys("test-map");
  assert.ok(keys.includes("key-1"));

  await adapter.kvDelete("test-map", "key-1");
  const deleted = await adapter.kvGet("test-map", "key-1");
  assert.equal(deleted, null);
});

test("T3nAdapter: kvGet returns null for non-existent keys", async () => {
  const adapter = createFixtureAdapter();
  await adapter.authenticate();

  const value = await adapter.kvGet("nonexistent-map", "no-key");
  assert.equal(value, null);
});

test("T3nAdapter: throws if not authenticated", () => {
  const adapter = createFixtureAdapter();
  assert.throws(() => adapter.getSession(), /not authenticated/);
});

test("T3nAdapter: contract execution with registered handler", async () => {
  const adapter = createFixtureAdapter();
  await adapter.authenticate();

  adapter.registerContractHandler("test-fn", (input, callerDid) => {
    return { echoed: input.value, caller: callerDid };
  });

  const result = await adapter.executeContract("test-fn", { value: "hello" });
  assert.equal(result.success, true);
  assert.equal(result.output.echoed, "hello");
  assert.ok(result.output.caller.startsWith("did:t3n:"));
  assert.ok(result.executionId.startsWith("exec-"));
});

test("T3nAdapter: contract execution returns error for unregistered handler", async () => {
  const adapter = createFixtureAdapter();
  await adapter.authenticate();

  const result = await adapter.executeContract("unknown-fn", {});
  assert.equal(result.success, false);
  assert.ok(result.error.includes("no handler registered"));
});

// ---------------------------------------------------------------------------
// Identity Tests
// ---------------------------------------------------------------------------

test("OttoIdentity: initializes with a DID from T3N", async () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  const agentIdentity = await identity.initialize();

  assert.ok(agentIdentity.did.startsWith("did:t3n:"));
  assert.equal(agentIdentity.name, "Otto");
  assert.equal(agentIdentity.role, "airport-operations-decision-support");
  assert.ok(agentIdentity.capabilities.reads.length > 0);
  assert.ok(agentIdentity.capabilities.writes.length > 0);
  assert.ok(agentIdentity.capabilities.actions.length > 0);
});

test("OttoIdentity: getDid returns the authenticated DID", async () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  await identity.initialize();

  const did = identity.getDid();
  assert.ok(did.startsWith("did:t3n:"));
});

test("OttoIdentity: throws if not initialized", () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  assert.throws(() => identity.getIdentity(), /not initialized/);
});

test("OttoIdentity: records and retrieves delegations", async () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  await identity.initialize();

  const delegation = await identity.recordDelegation(
    "did:t3n:operator-001",
    ["read:operational-snapshot", "propose:staff-assignment"],
  );

  assert.equal(delegation.delegatorDid, "did:t3n:operator-001");
  assert.equal(delegation.status, "active");
  assert.equal(delegation.scopes.length, 2);

  const active = identity.getActiveDelegations();
  assert.equal(active.length, 1);

  assert.ok(identity.hasDelegatedScope("read:operational-snapshot"));
  assert.ok(!identity.hasDelegatedScope("delete:everything"));
});

test("OttoIdentity: revokes delegations", async () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  await identity.initialize();

  await identity.recordDelegation("did:t3n:operator-001", ["read"]);
  const revoked = await identity.revokeDelegation("did:t3n:operator-001");

  assert.equal(revoked, 1);
  assert.equal(identity.getActiveDelegations().length, 0);
});

test("OttoIdentity: attestation reflects session state", async () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  await identity.initialize();

  const attestation = identity.attest();
  assert.ok(attestation.agentDid.startsWith("did:t3n:"));
  assert.equal(attestation.sessionValid, true);
  assert.equal(attestation.environment, "fixture");
});

// ---------------------------------------------------------------------------
// Permissions Tests
// ---------------------------------------------------------------------------

test("OttoPermissions: allows reading operational data by default", async () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  await identity.initialize();
  const permissions = new OttoPermissions(adapter, identity);

  assert.ok(permissions.isAllowed(ACTIONS.READ, RESOURCES.OPERATIONAL_SNAPSHOT));
  assert.ok(permissions.isAllowed(ACTIONS.READ, RESOURCES.FLOW_FORECAST));
  assert.ok(permissions.isAllowed(ACTIONS.READ, RESOURCES.OPERATIONAL_ALERT));
});

test("OttoPermissions: allows writing decision options", async () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  await identity.initialize();
  const permissions = new OttoPermissions(adapter, identity);

  assert.ok(permissions.isAllowed(ACTIONS.WRITE, RESOURCES.DECISION_OPTION));
  assert.ok(permissions.isAllowed(ACTIONS.WRITE, RESOURCES.RECOMMENDATION));
});

test("OttoPermissions: denies writing to operational snapshot (hard deny)", async () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  await identity.initialize();
  const permissions = new OttoPermissions(adapter, identity);

  const result = permissions.evaluate(ACTIONS.WRITE, RESOURCES.OPERATIONAL_SNAPSHOT);
  assert.equal(result.allowed, false);
  assert.ok(result.reason.includes("Denied"));
});

test("OttoPermissions: denies actions with no matching policy (deny-by-default)", async () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  await identity.initialize();
  const permissions = new OttoPermissions(adapter, identity);

  const result = permissions.evaluate("delete", "everything");
  assert.equal(result.allowed, false);
  assert.ok(result.reason.includes("deny-by-default"));
});

test("OttoPermissions: proposal actions require approval", async () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  await identity.initialize();
  const permissions = new OttoPermissions(adapter, identity);

  // First we need to grant propose permission via a zone policy
  await permissions.grantZonePolicy(
    "did:t3n:operator-001",
    ["check-in-a"],
    [ACTIONS.PROPOSE],
    [RESOURCES.STAFF_ASSIGNMENT],
  );

  const result = permissions.evaluate(ACTIONS.PROPOSE, RESOURCES.STAFF_ASSIGNMENT, "check-in-a");
  assert.equal(result.allowed, true);
  assert.equal(result.requiresApproval, true);
});

test("OttoPermissions: zone-scoped policy restricts to specific zones", async () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  await identity.initialize();
  const permissions = new OttoPermissions(adapter, identity);

  await permissions.grantZonePolicy(
    "did:t3n:operator-001",
    ["check-in-a"],
    [ACTIONS.PROPOSE],
    [RESOURCES.COUNTER_CAPACITY],
  );

  // Allowed for authorized zone
  assert.ok(permissions.isAllowed(ACTIONS.PROPOSE, RESOURCES.COUNTER_CAPACITY, "check-in-a"));
  // Denied for unauthorized zone
  assert.ok(!permissions.isAllowed(ACTIONS.PROPOSE, RESOURCES.COUNTER_CAPACITY, "arrivals"));
});

test("OttoPermissions: summarize returns policy overview", async () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  await identity.initialize();
  const permissions = new OttoPermissions(adapter, identity);

  const summary = permissions.summarize();
  assert.ok(summary.allowed.length > 0);
  assert.ok(summary.denied.length > 0);
  assert.ok(summary.requiresApproval.length > 0);
  assert.ok(summary.requiresApproval.includes("propose-staff-reassignment"));
});

test("OttoPermissions: removes non-default policies", async () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  await identity.initialize();
  const permissions = new OttoPermissions(adapter, identity);

  const policy = await permissions.grantZonePolicy("did:t3n:op", ["z1"], ["read"], ["test"]);
  assert.equal(permissions.getActivePolicies().length, 2);

  const removed = await permissions.removePolicy(policy.policyId);
  assert.equal(removed, true);
  assert.equal(permissions.getActivePolicies().length, 1);
});

test("OttoPermissions: cannot remove default policy", async () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  await identity.initialize();
  const permissions = new OttoPermissions(adapter, identity);

  const removed = await permissions.removePolicy("otto-default-v1");
  assert.equal(removed, false);
});

// ---------------------------------------------------------------------------
// Audit Tests
// ---------------------------------------------------------------------------

test("OttoAudit: records entries with full provenance", async () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  await identity.initialize();
  const audit = new OttoAudit(adapter, identity);
  await audit.initialize();

  const entry = await audit.record({
    action: AUDIT_ACTIONS.OPTIONS_GENERATED,
    resource: "decision-option",
    zone: "check-in-a",
    trigger: "operational-analysis",
    input: { zoneCount: 5 },
    outcome: { success: true, optionCount: 3 },
  });

  assert.ok(entry.entryId.startsWith("audit-"));
  assert.ok(entry.agentDid.startsWith("did:t3n:"));
  assert.equal(entry.action, "options-generated");
  assert.equal(entry.resource, "decision-option");
  assert.equal(entry.zone, "check-in-a");
  assert.equal(entry.outcome.success, true);
  assert.equal(entry.sessionEnvironment, "fixture");
});

test("OttoAudit: query filters by action", async () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  await identity.initialize();
  const audit = new OttoAudit(adapter, identity);
  await audit.initialize();

  await audit.record({ action: "action-a", resource: "r1", trigger: "t", outcome: { success: true } });
  await audit.record({ action: "action-b", resource: "r2", trigger: "t", outcome: { success: true } });
  await audit.record({ action: "action-a", resource: "r3", trigger: "t", outcome: { success: false } });

  const results = await audit.query({ action: "action-a" });
  assert.equal(results.length, 2);
});

test("OttoAudit: query filters by success/failure", async () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  await identity.initialize();
  const audit = new OttoAudit(adapter, identity);
  await audit.initialize();

  await audit.record({ action: "a", resource: "r", trigger: "t", outcome: { success: true } });
  await audit.record({ action: "a", resource: "r", trigger: "t", outcome: { success: false } });

  assert.equal((await audit.query({ successOnly: true })).length, 1);
  assert.equal((await audit.query({ failedOnly: true })).length, 1);
});

test("OttoAudit: summarize aggregates counts", async () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  await identity.initialize();
  const audit = new OttoAudit(adapter, identity);
  await audit.initialize();

  await audit.record({ action: "x", resource: "r1", zone: "z1", trigger: "t", outcome: { success: true } });
  await audit.record({ action: "y", resource: "r2", zone: "z1", trigger: "t", outcome: { success: false } });

  const summary = audit.summarize();
  assert.equal(summary.totalEntries, 2);
  assert.equal(summary.successCount, 1);
  assert.equal(summary.failureCount, 1);
  assert.equal(summary.actionCounts["x"], 1);
  assert.equal(summary.zoneCounts["z1"], 2);
});

test("OttoAudit: exportAll retrieves all persisted entries", async () => {
  const adapter = createFixtureAdapter();
  const identity = new OttoIdentity(adapter);
  await identity.initialize();
  const audit = new OttoAudit(adapter, identity);
  await audit.initialize();

  await audit.record({ action: "a", resource: "r", trigger: "t", outcome: { success: true } });
  await audit.record({ action: "b", resource: "r", trigger: "t", outcome: { success: true } });

  const all = await audit.exportAll();
  assert.equal(all.length, 2);
  assert.ok(all[0].timestamp <= all[1].timestamp);
});

// ---------------------------------------------------------------------------
// Otto Agent Integration Tests
// ---------------------------------------------------------------------------

test("OttoAgent: initializes with DID and records audit entry", async () => {
  const otto = createFixtureOtto();
  const result = await otto.initialize();

  assert.ok(result.did.startsWith("did:t3n:"));
  assert.equal(result.name, "Otto");
  assert.equal(result.environment, "fixture");

  // Check that initialization was audited
  const auditEntries = await otto.queryAudit({ action: AUDIT_ACTIONS.AGENT_INITIALIZED });
  assert.equal(auditEntries.length, 1);
  assert.equal(auditEntries[0].outcome.success, true);
});

test("OttoAgent: generateOptions produces recommendations with provenance", async () => {
  const otto = createFixtureOtto();
  await otto.initialize();

  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const monitoring = MonitoringViewModel.from(snapshot, forecast);

  const recommendation = await otto.generateOptions({
    snapshot,
    forecast,
    projections: [projection],
    operationalAlerts: monitoring.analytics.operationalAlerts,
  });

  assert.ok(recommendation.agentDid.startsWith("did:t3n:"));
  assert.ok(recommendation.generatedAt.length > 0);
  assert.equal(recommendation.sessionEnvironment, "fixture");
  assert.ok(recommendation.options.length >= 1);
  assert.ok(recommendation.auditRef.entryId.startsWith("audit-"));
  assert.ok(recommendation.confidence.score > 0);
  assert.ok(recommendation.confidence.score <= 1);
});

test("OttoAgent: generateOptions is denied without permission", async () => {
  const adapter = createFixtureAdapter();
  const otto = new OttoAgent({ environment: "fixture" });
  // Use internal access to remove default read permission
  await otto.initialize();

  // Add a deny rule for snapshot reading
  await otto.permissions.addPolicy({
    policyId: "deny-read-test",
    name: "Test denial",
    description: "Deny reads for testing",
    allows: [],
    denies: [{ action: ACTIONS.READ, resource: RESOURCES.OPERATIONAL_SNAPSHOT, zones: null, timeWindow: null }],
    requiresApproval: [],
    createdAt: new Date().toISOString(),
    createdBy: "test",
  });

  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());

  await assert.rejects(
    () => otto.generateOptions({ snapshot, forecast, projections: [projection] }),
    /permission denied/,
  );
});

test("OttoAgent: createProposal creates pending proposal with audit trail", async () => {
  const otto = createFixtureOtto();
  await otto.initialize();

  // Grant propose permission
  await otto.grantAccess(
    "did:t3n:operator-001",
    ["check-in-a"],
    [ACTIONS.PROPOSE],
    [RESOURCES.STAFF_ASSIGNMENT, RESOURCES.COUNTER_CAPACITY],
  );

  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const monitoring = MonitoringViewModel.from(snapshot, forecast);

  const recommendation = await otto.generateOptions({
    snapshot,
    forecast,
    projections: [projection],
    operationalAlerts: monitoring.analytics.operationalAlerts,
  });

  if (recommendation.options.length > 0) {
    const proposal = await otto.createProposal(recommendation.options[0]);

    assert.equal(proposal.status, "pending");
    assert.ok(proposal.proposalId.startsWith("proposal-"));
    assert.ok(proposal.agentDid.startsWith("did:t3n:"));
    assert.ok(proposal.auditRef.entryId.startsWith("audit-"));

    // Verify it's in pending proposals
    const pending = otto.getPendingProposals();
    assert.equal(pending.length, 1);
  }
});

test("OttoAgent: approveProposal changes status and audits", async () => {
  const otto = createFixtureOtto();
  await otto.initialize();

  await otto.grantAccess("did:t3n:op-1", ["check-in-a"], [ACTIONS.PROPOSE], [RESOURCES.STAFF_ASSIGNMENT, RESOURCES.COUNTER_CAPACITY, RESOURCES.PASSENGER_ROUTING, RESOURCES.SHIFT_TIMING]);

  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const monitoring = MonitoringViewModel.from(snapshot, forecast);

  const rec = await otto.generateOptions({
    snapshot, forecast, projections: [projection],
    operationalAlerts: monitoring.analytics.operationalAlerts,
  });

  if (rec.options.length > 0) {
    const proposal = await otto.createProposal(rec.options[0]);
    const approved = await otto.approveProposal(proposal.proposalId, "did:t3n:approver-001");

    assert.equal(approved.status, "approved");

    const auditEntries = await otto.queryAudit({ action: AUDIT_ACTIONS.PROPOSAL_APPROVED });
    assert.ok(auditEntries.length >= 1);
  }
});

test("OttoAgent: rejectProposal changes status with reason", async () => {
  const otto = createFixtureOtto();
  await otto.initialize();

  await otto.grantAccess("did:t3n:op-1", ["check-in-a"], [ACTIONS.PROPOSE], [RESOURCES.STAFF_ASSIGNMENT, RESOURCES.COUNTER_CAPACITY, RESOURCES.PASSENGER_ROUTING, RESOURCES.SHIFT_TIMING]);

  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const monitoring = MonitoringViewModel.from(snapshot, forecast);

  const rec = await otto.generateOptions({
    snapshot, forecast, projections: [projection],
    operationalAlerts: monitoring.analytics.operationalAlerts,
  });

  if (rec.options.length > 0) {
    const proposal = await otto.createProposal(rec.options[0]);
    const rejected = await otto.rejectProposal(proposal.proposalId, "did:t3n:rejector", "Not safe during peak");

    assert.equal(rejected.status, "rejected");
  }
});

test("OttoAgent: executeInTEE runs a TEE contract function and audits", async () => {
  const otto = createFixtureOtto();
  await otto.initialize();

  const result = await otto.executeInTEE("verify-proposal", {
    proposal: { proposalId: "p-test", decision: { type: "counter-capacity" }, affectedZones: ["z1"] },
  });

  assert.equal(result.success, true);
  assert.equal(result.output.valid, true);

  // Check audit recorded
  const auditEntries = await otto.queryAudit({ action: AUDIT_ACTIONS.CONTRACT_SUCCEEDED });
  assert.ok(auditEntries.length >= 1);
});

test("OttoAgent: explain returns structured explanation with provenance", async () => {
  const otto = createFixtureOtto();
  await otto.initialize();

  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());
  const monitoring = MonitoringViewModel.from(snapshot, forecast);

  const rec = await otto.generateOptions({
    snapshot, forecast, projections: [projection],
    operationalAlerts: monitoring.analytics.operationalAlerts,
  });

  if (rec.options.length > 0) {
    const explanation = await otto.explain(rec.options[0].optionId, rec.options);

    assert.ok(explanation.agentDid.startsWith("did:t3n:"));
    assert.ok(explanation.summary.length > 0);
    assert.ok(explanation.rationale.length > 0);
    assert.ok(explanation.confidence.score > 0);
  }
});

test("OttoAgent: attest returns verifiable identity state", async () => {
  const otto = createFixtureOtto();
  await otto.initialize();

  const attestation = otto.attest();
  assert.ok(attestation.agentDid.startsWith("did:t3n:"));
  assert.equal(attestation.sessionValid, true);
  assert.equal(attestation.environment, "fixture");
});

test("OttoAgent: getPermissionsSummary shows current access model", async () => {
  const otto = createFixtureOtto();
  await otto.initialize();

  const summary = otto.getPermissionsSummary();
  assert.ok(summary.allowed.length > 0);
  assert.ok(summary.denied.length > 0);
  assert.ok(summary.requiresApproval.includes("propose-staff-reassignment"));
});

test("OttoAgent: getAuditSummary shows aggregate statistics", async () => {
  const otto = createFixtureOtto();
  await otto.initialize();

  const snapshot = createOperationalStateReader().getSnapshot();
  const forecast = predictionService.forecast(snapshot);
  const projection = simulationService.project(snapshot, forecast, defaultScenarioDecisions());

  await otto.generateOptions({ snapshot, forecast, projections: [projection] });

  const summary = otto.getAuditSummary();
  assert.ok(summary.totalEntries >= 2); // initialization + options generated
  assert.ok(summary.successCount >= 2);
});

test("OttoAgent: grantAccess records delegation and audit entry", async () => {
  const otto = createFixtureOtto();
  await otto.initialize();

  const policy = await otto.grantAccess(
    "did:t3n:ops-manager",
    ["security-north", "check-in-a"],
    [ACTIONS.PROPOSE, ACTIONS.READ],
    [RESOURCES.STAFF_ASSIGNMENT],
  );

  assert.ok(policy.policyId.length > 0);
  assert.ok(policy.allows.length > 0);

  const auditEntries = await otto.queryAudit({ action: AUDIT_ACTIONS.DELEGATION_RECORDED });
  assert.ok(auditEntries.length >= 1);
});

test("OttoAgent: throws if used before initialization", () => {
  const otto = createFixtureOtto();
  assert.throws(() => otto.attest(), /not initialized/);
});
