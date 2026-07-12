/**
 * Otto Agent — Airport Operations Decision-Support AI Agent.
 *
 * Otto is the orchestrator that composes:
 * - T3N Adapter (platform connectivity)
 * - Identity (DID-based agent identity)
 * - Permissions (scoped, least-privilege access control)
 * - Audit (immutable action trail)
 * - Decision Support (operational recommendations via existing DecisionSupportService)
 *
 * Otto's design principles:
 * 1. Decision support, not autonomous control — operators approve all operational changes
 * 2. Verifiable identity — every recommendation is signed by Otto's DID
 * 3. Least-privilege — Otto only accesses data/actions explicitly granted
 * 4. Full auditability — every action is recorded with WHO/WHAT/WHEN/WHERE/WHY/OUTCOME
 * 5. TEE-backed computation — sensitive decision logic runs in a Trusted Execution Environment
 *
 * @module otto
 */

import { T3nAdapter, createFixtureAdapter } from "./t3n-adapter.js";
import { OttoIdentity } from "./identity.js";
import { OttoPermissions, ACTIONS, RESOURCES } from "./permissions.js";
import { OttoAudit, AUDIT_ACTIONS } from "./audit.js";
import { DecisionSupportService } from "../decision-support/index.js";

export { ACTIONS, RESOURCES } from "./permissions.js";
export { AUDIT_ACTIONS } from "./audit.js";

// ---------------------------------------------------------------------------
// Otto Agent Configuration
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} OttoConfig
 * @property {'testnet' | 'production' | 'fixture'} environment
 * @property {string} [apiKey]
 * @property {string} [agentKey]
 * @property {string} [contractTail] - TEE contract name (default: "otto-ops")
 */

/**
 * @typedef {Object} OttoRecommendation
 * @property {string} agentDid - Otto's DID (provenance)
 * @property {string} generatedAt - ISO timestamp
 * @property {string} sessionEnvironment
 * @property {Object[]} options - Ranked DecisionOption values
 * @property {Object} auditRef - Reference to the audit entry
 * @property {string} auditRef.entryId
 * @property {string} auditRef.timestamp
 * @property {boolean} requiresApproval - Whether operator must approve before acting
 * @property {Object} confidence - Overall confidence in the recommendation set
 */

/**
 * @typedef {Object} OttoProposal
 * @property {string} proposalId
 * @property {string} agentDid
 * @property {string} type - Decision type (staff-reassignment, counter-capacity, etc.)
 * @property {Object} decision - The proposed operational change
 * @property {string[]} affectedZones
 * @property {string} status - 'pending' | 'approved' | 'rejected'
 * @property {string} createdAt
 * @property {Object} auditRef
 */

// ---------------------------------------------------------------------------
// Otto Agent
// ---------------------------------------------------------------------------

export class OttoAgent {
  /**
   * @param {OttoConfig} config
   */
  constructor(config) {
    this.config = config;
    this.adapter = config.environment === "fixture"
      ? createFixtureAdapter()
      : new T3nAdapter(config);
    this.identity = new OttoIdentity(this.adapter);
    this.permissions = new OttoPermissions(this.adapter, this.identity);
    this.audit = new OttoAudit(this.adapter, this.identity);
    this.decisionSupport = new DecisionSupportService();

    /** @type {OttoProposal[]} */
    this.pendingProposals = [];
    this.initialized = false;
  }

  /**
   * Initialize Otto: authenticate, load permissions and audit state.
   * Must be called before any operational methods.
   *
   * @returns {Promise<{ did: string, name: string, environment: string }>}
   */
  async initialize() {
    // Step 1: Establish identity (authenticate to T3N)
    const agentIdentity = await this.identity.initialize();

    // Step 2: Load permissions
    await this.permissions.initialize();

    // Step 3: Initialize audit trail
    await this.audit.initialize();

    // Step 4: Register TEE contract handlers (fixture mode)
    if (this.config.environment === "fixture") {
      this._registerFixtureHandlers();
    }

    // Step 5: Log initialization
    await this.audit.record({
      action: AUDIT_ACTIONS.AGENT_INITIALIZED,
      resource: "otto-agent",
      trigger: "system-startup",
      input: { environment: this.config.environment },
      outcome: { success: true, did: agentIdentity.did },
    });

    this.initialized = true;
    return {
      did: agentIdentity.did,
      name: agentIdentity.name,
      environment: this.config.environment,
    };
  }

  // -------------------------------------------------------------------------
  // Core Operations
  // -------------------------------------------------------------------------

  /**
   * Generate actionable decision options from the current operational state.
   * This is Otto's primary value: analyzing airport operations and producing
   * ranked, explainable options for operators.
   *
   * Every invocation:
   * 1. Checks permissions (can Otto read the required data?)
   * 2. Runs the decision-support analysis
   * 3. Records the full audit trail
   * 4. Returns options with provenance (DID, timestamp, audit reference)
   *
   * @param {Object} params
   * @param {Object} params.snapshot - OperationalSnapshot
   * @param {Object} params.forecast - FlowForecast
   * @param {Object[]} params.projections - ScenarioProjection[]
   * @param {Object[]} [params.operationalAlerts] - OperationalAlert[]
   * @param {Object[]} [params.queueStates] - QueueState[]
   * @param {Object[]} [params.counterUtilizations] - CounterUtilization[]
   * @param {Object[]} [params.staffingContexts] - StaffingContext[]
   * @returns {Promise<OttoRecommendation>}
   */
  async generateOptions(params) {
    this._assertInitialized();

    // Permission check: can Otto read operational data?
    const readCheck = this.permissions.evaluate(ACTIONS.READ, RESOURCES.OPERATIONAL_SNAPSHOT);
    if (!readCheck.allowed) {
      await this.audit.logPermissionDenied(ACTIONS.READ, RESOURCES.OPERATIONAL_SNAPSHOT, readCheck.reason);
      throw new Error(`Otto: permission denied — ${readCheck.reason}`);
    }

    // Permission check: can Otto write decision options?
    const writeCheck = this.permissions.evaluate(ACTIONS.WRITE, RESOURCES.DECISION_OPTION);
    if (!writeCheck.allowed) {
      await this.audit.logPermissionDenied(ACTIONS.WRITE, RESOURCES.DECISION_OPTION, writeCheck.reason);
      throw new Error(`Otto: permission denied — ${writeCheck.reason}`);
    }

    // Execute the decision-support analysis
    let options;
    try {
      options = this.decisionSupport.options(params);
    } catch (err) {
      await this.audit.logError("decision-support-analysis", err);
      throw err;
    }

    // Determine affected zones
    const affectedZones = [...new Set(options.map((o) => o.affectedZones).flat())];

    // Audit the successful generation
    const auditEntry = await this.audit.logOptionsGenerated(
      { snapshotAsOf: params.snapshot.asOf, forecastHorizon: params.forecast.horizon },
      options.map((o) => o.optionId),
      affectedZones,
    );

    // Build the recommendation envelope with provenance
    const session = this.adapter.getSession();
    return {
      agentDid: this.identity.getDid(),
      generatedAt: new Date().toISOString(),
      sessionEnvironment: session.environment,
      options,
      auditRef: { entryId: auditEntry.entryId, timestamp: auditEntry.timestamp },
      requiresApproval: options.length > 0,
      confidence: this._aggregateConfidence(options),
    };
  }

  /**
   * Create a proposal from a specific decision option.
   * Proposals require operator approval before they become operational.
   *
   * @param {Object} option - A DecisionOption from generateOptions()
   * @returns {Promise<OttoProposal>}
   */
  async createProposal(option) {
    this._assertInitialized();

    const proposalResource = this._decisionTypeToResource(option.decision.type);

    // Permission check: can Otto propose this type of change?
    const proposeCheck = this.permissions.evaluate(ACTIONS.PROPOSE, proposalResource);
    if (!proposeCheck.allowed) {
      await this.audit.logPermissionDenied(ACTIONS.PROPOSE, proposalResource, proposeCheck.reason);
      throw new Error(`Otto: cannot propose ${option.decision.type} — ${proposeCheck.reason}`);
    }

    const proposal = {
      proposalId: `proposal-${Date.now()}-${this.pendingProposals.length + 1}`,
      agentDid: this.identity.getDid(),
      type: option.decision.type,
      decision: option.decision,
      affectedZones: option.affectedZones,
      status: "pending",
      createdAt: new Date().toISOString(),
      rationale: option.rationale,
      expectedImpact: option.expectedImpact,
      confidence: option.confidence,
      auditRef: null,
    };

    // Audit the proposal creation
    const auditEntry = await this.audit.logProposalCreated(
      option.decision.type,
      proposal,
      option.affectedZones[0],
    );
    proposal.auditRef = { entryId: auditEntry.entryId, timestamp: auditEntry.timestamp };

    this.pendingProposals.push(proposal);

    // Persist to T3N KV
    await this.adapter.kvSet("otto-proposals", proposal.proposalId, JSON.stringify(proposal));

    return proposal;
  }

  /**
   * Process operator approval of a pending proposal.
   * @param {string} proposalId
   * @param {string} approverDid - DID of the approving operator
   * @returns {Promise<OttoProposal>}
   */
  async approveProposal(proposalId, approverDid) {
    this._assertInitialized();

    const proposal = this.pendingProposals.find((p) => p.proposalId === proposalId);
    if (!proposal) throw new Error(`Otto: proposal ${proposalId} not found`);
    if (proposal.status !== "pending") throw new Error(`Otto: proposal ${proposalId} is ${proposal.status}`);

    proposal.status = "approved";
    await this.audit.logProposalApproved(proposalId, approverDid);
    await this.adapter.kvSet("otto-proposals", proposalId, JSON.stringify(proposal));

    return proposal;
  }

  /**
   * Process operator rejection of a pending proposal.
   * @param {string} proposalId
   * @param {string} rejectorDid
   * @param {string} reason
   * @returns {Promise<OttoProposal>}
   */
  async rejectProposal(proposalId, rejectorDid, reason) {
    this._assertInitialized();

    const proposal = this.pendingProposals.find((p) => p.proposalId === proposalId);
    if (!proposal) throw new Error(`Otto: proposal ${proposalId} not found`);
    if (proposal.status !== "pending") throw new Error(`Otto: proposal ${proposalId} is ${proposal.status}`);

    proposal.status = "rejected";
    await this.audit.logProposalRejected(proposalId, rejectorDid, reason);
    await this.adapter.kvSet("otto-proposals", proposalId, JSON.stringify(proposal));

    return proposal;
  }

  /**
   * Execute a TEE contract function for confidential computation.
   * Used when decision logic must run in a trusted execution environment.
   *
   * @param {string} functionName - Contract function to invoke
   * @param {Object} input - Input payload
   * @returns {Promise<import('./t3n-adapter.js').ContractResult>}
   */
  async executeInTEE(functionName, input) {
    this._assertInitialized();

    const result = await this.adapter.executeContract(functionName, input);

    // Audit the contract execution
    await this.audit.logContractExecution(
      functionName,
      { functionName, inputKeys: Object.keys(input) },
      result,
    );

    return result;
  }

  /**
   * Explain a specific recommendation or decision option.
   * Returns structured rationale that can be presented to operators.
   *
   * @param {string} optionId
   * @param {Object[]} options - The options array from generateOptions()
   * @returns {Promise<Object>}
   */
  async explain(optionId, options) {
    this._assertInitialized();

    const explainCheck = this.permissions.evaluate(ACTIONS.EXPLAIN, RESOURCES.DECISION_OPTION);
    if (!explainCheck.allowed) {
      await this.audit.logPermissionDenied(ACTIONS.EXPLAIN, RESOURCES.DECISION_OPTION, explainCheck.reason);
      throw new Error(`Otto: cannot explain — ${explainCheck.reason}`);
    }

    const option = options.find((o) => o.optionId === optionId);
    if (!option) throw new Error(`Otto: option ${optionId} not found`);

    const explanation = {
      optionId,
      agentDid: this.identity.getDid(),
      explainedAt: new Date().toISOString(),
      summary: `${option.decision.type} affecting zone(s) ${option.affectedZones.join(", ")}`,
      rationale: option.rationale,
      expectedImpact: option.expectedImpact,
      confidence: option.confidence,
      dataFreshness: {
        note: "Confidence reflects the weakest input signal. Lower confidence indicates stale or uncertain data.",
        score: option.confidence.score,
        basis: option.confidence.basis,
      },
      alternatives: options
        .filter((o) => o.optionId !== optionId)
        .slice(0, 3)
        .map((o) => ({ optionId: o.optionId, type: o.decision.type, rank: o.rank })),
    };

    await this.audit.record({
      action: AUDIT_ACTIONS.RECOMMENDATION_EXPLAINED,
      resource: "decision-option",
      zone: option.affectedZones[0] ?? null,
      trigger: "operator-request",
      input: { optionId },
      outcome: { success: true },
    });

    return explanation;
  }

  // -------------------------------------------------------------------------
  // Identity & Governance API (for external consumers)
  // -------------------------------------------------------------------------

  /**
   * Get Otto's identity attestation for verification.
   * @returns {Object}
   */
  attest() {
    this._assertInitialized();
    return this.identity.attest();
  }

  /**
   * Get a permissions summary for display.
   * @returns {Object}
   */
  getPermissionsSummary() {
    this._assertInitialized();
    return this.permissions.summarize();
  }

  /**
   * Get an audit summary.
   * @returns {Object}
   */
  getAuditSummary() {
    this._assertInitialized();
    return this.audit.summarize();
  }

  /**
   * Query the audit trail.
   * @param {import('./audit.js').AuditQuery} query
   * @returns {Promise<Object[]>}
   */
  async queryAudit(query) {
    this._assertInitialized();
    return this.audit.query(query);
  }

  /**
   * Get all pending proposals.
   * @returns {OttoProposal[]}
   */
  getPendingProposals() {
    return this.pendingProposals.filter((p) => p.status === "pending");
  }

  /**
   * Grant Otto access to specific zones (operator delegation).
   * @param {string} operatorDid
   * @param {string[]} zones
   * @param {string[]} actions
   * @param {string[]} resources
   * @returns {Promise<Object>}
   */
  async grantAccess(operatorDid, zones, actions, resources) {
    this._assertInitialized();

    // Record delegation in identity
    await this.identity.recordDelegation(operatorDid, actions.map((a) => `${a}:${resources.join(",")}`));

    // Add zone-scoped policy
    const policy = await this.permissions.grantZonePolicy(operatorDid, zones, actions, resources);

    // Audit the delegation
    await this.audit.record({
      action: AUDIT_ACTIONS.DELEGATION_RECORDED,
      resource: "permissions",
      zone: zones[0] ?? null,
      trigger: `operator-delegation:${operatorDid}`,
      input: { operatorDid, zones, actions, resources },
      outcome: { success: true, policyId: policy.policyId },
    });

    return policy;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /** @private */
  _assertInitialized() {
    if (!this.initialized) {
      throw new Error("OttoAgent: not initialized. Call initialize() first.");
    }
  }

  /** @private */
  _decisionTypeToResource(decisionType) {
    const map = {
      "staff-reassignment": RESOURCES.STAFF_ASSIGNMENT,
      "counter-capacity": RESOURCES.COUNTER_CAPACITY,
      "passenger-movement": RESOURCES.PASSENGER_ROUTING,
      "shift-timing": RESOURCES.SHIFT_TIMING,
    };
    return map[decisionType] ?? decisionType;
  }

  /** @private */
  _aggregateConfidence(options) {
    if (options.length === 0) return { score: 1, basis: "no options generated" };
    const minScore = Math.min(...options.map((o) => o.confidence.score));
    const weakest = options.find((o) => o.confidence.score === minScore);
    return {
      score: Number(minScore.toFixed(2)),
      basis: weakest?.confidence.basis ?? "aggregate of option confidence scores",
    };
  }

  /** @private Register deterministic TEE handlers for fixture testing */
  _registerFixtureHandlers() {
    // "evaluate-options" — mirrors the decision-support logic but runs "in TEE"
    this.adapter.registerContractHandler("evaluate-options", (input, callerDid) => {
      const options = this.decisionSupport.options(input);
      return { callerDid, optionCount: options.length, options };
    });

    // "verify-proposal" — validates a proposal against constraints
    this.adapter.registerContractHandler("verify-proposal", (input, callerDid) => {
      const { proposal } = input;
      const valid = proposal && proposal.decision && proposal.affectedZones?.length > 0;
      return { callerDid, valid, proposalId: proposal?.proposalId ?? null };
    });

    // "sign-recommendation" — produces a signed attestation of a recommendation
    this.adapter.registerContractHandler("sign-recommendation", (input, callerDid) => {
      return {
        callerDid,
        signed: true,
        attestation: {
          agentDid: callerDid,
          optionIds: input.optionIds ?? [],
          timestamp: new Date().toISOString(),
          environment: "fixture",
        },
      };
    });
  }
}

// ---------------------------------------------------------------------------
// Factory Functions
// ---------------------------------------------------------------------------

/**
 * Create a fixture-mode Otto agent for deterministic testing.
 * @returns {OttoAgent}
 */
export function createFixtureOtto() {
  return new OttoAgent({ environment: "fixture" });
}

/**
 * Create a testnet Otto agent.
 * @param {string} apiKey
 * @param {string} agentKey
 * @returns {OttoAgent}
 */
export function createTestnetOtto(apiKey, agentKey) {
  return new OttoAgent({
    environment: "testnet",
    apiKey,
    agentKey,
    contractTail: "otto-ops",
  });
}

/**
 * Create a production Otto agent.
 * @param {string} apiKey
 * @param {string} agentKey
 * @returns {OttoAgent}
 */
export function createProductionOtto(apiKey, agentKey) {
  return new OttoAgent({
    environment: "production",
    apiKey,
    agentKey,
    contractTail: "otto-ops",
  });
}
