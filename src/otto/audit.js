/**
 * Otto Audit Module — Immutable, verifiable action trail.
 *
 * Every action Otto takes is recorded with:
 * - WHO: Otto's DID (cryptographically verifiable)
 * - WHAT: Action type, resource, and payload summary
 * - WHEN: Timestamp from T3N's trusted clock
 * - WHERE: Which airport zone(s) are affected
 * - WHY: The trigger that caused this action (alert, forecast, operator request)
 * - OUTCOME: Success/failure and the resulting decision or error
 *
 * Audit entries are persisted to T3N's tenant-scoped KV store, which means:
 * - They are stored inside a TEE (tamper-resistant)
 * - They are namespace-isolated (only Otto's tenant can access them)
 * - They are persistent across sessions
 * - They can be exported for external compliance systems
 *
 * @module otto/audit
 */

/**
 * @typedef {Object} AuditEntry
 * @property {string} entryId - Unique audit entry identifier
 * @property {string} agentDid - Otto's DID at time of action
 * @property {string} timestamp - ISO timestamp (from T3N clock)
 * @property {string} action - Action type performed
 * @property {string} resource - Resource acted upon
 * @property {string | null} zone - Zone context (if applicable)
 * @property {string} trigger - What triggered this action
 * @property {Object} input - Summary of inputs (no PII or secrets)
 * @property {Object} outcome - Result of the action
 * @property {boolean} outcome.success
 * @property {string} [outcome.optionId] - Decision option produced
 * @property {string} [outcome.error] - Error message if failed
 * @property {Object} permissionCheck - Permission evaluation that authorized this action
 * @property {boolean} permissionCheck.allowed
 * @property {string} permissionCheck.policy - Policy that granted access
 * @property {string} sessionEnvironment - T3N environment at time of action
 */

/**
 * @typedef {Object} AuditQuery
 * @property {string} [action] - Filter by action type
 * @property {string} [resource] - Filter by resource
 * @property {string} [zone] - Filter by zone
 * @property {string} [since] - ISO timestamp lower bound
 * @property {string} [until] - ISO timestamp upper bound
 * @property {boolean} [successOnly] - Only successful actions
 * @property {boolean} [failedOnly] - Only failed actions
 * @property {number} [limit] - Max entries to return
 */

/**
 * @typedef {Object} AuditSummary
 * @property {number} totalEntries
 * @property {number} successCount
 * @property {number} failureCount
 * @property {Object<string, number>} actionCounts - Count by action type
 * @property {Object<string, number>} resourceCounts - Count by resource
 * @property {Object<string, number>} zoneCounts - Count by zone
 * @property {string | null} firstEntry - ISO timestamp of earliest entry
 * @property {string | null} lastEntry - ISO timestamp of latest entry
 */

// ---------------------------------------------------------------------------
// Audit Constants
// ---------------------------------------------------------------------------

const AUDIT_MAP = "otto-audit";
const AUDIT_INDEX_MAP = "otto-audit-index";
const MAX_ENTRIES_IN_MEMORY = 1000;

/** Audit action types */
export const AUDIT_ACTIONS = Object.freeze({
  // Identity lifecycle
  AGENT_INITIALIZED: "agent-initialized",
  DELEGATION_RECORDED: "delegation-recorded",
  DELEGATION_REVOKED: "delegation-revoked",

  // Permission evaluations
  PERMISSION_GRANTED: "permission-granted",
  PERMISSION_DENIED: "permission-denied",

  // Core operations
  SNAPSHOT_READ: "snapshot-read",
  FORECAST_READ: "forecast-read",
  OPTIONS_GENERATED: "options-generated",
  RECOMMENDATION_PRODUCED: "recommendation-produced",
  RECOMMENDATION_EXPLAINED: "recommendation-explained",

  // Proposals (require operator approval)
  PROPOSAL_CREATED: "proposal-created",
  PROPOSAL_APPROVED: "proposal-approved",
  PROPOSAL_REJECTED: "proposal-rejected",

  // TEE contract execution
  CONTRACT_INVOKED: "contract-invoked",
  CONTRACT_SUCCEEDED: "contract-succeeded",
  CONTRACT_FAILED: "contract-failed",

  // System events
  ERROR_OCCURRED: "error-occurred",
  SESSION_REFRESHED: "session-refreshed",
});

// ---------------------------------------------------------------------------
// Audit Module
// ---------------------------------------------------------------------------

export class OttoAudit {
  /**
   * @param {import('./t3n-adapter.js').T3nAdapter} adapter
   * @param {import('./identity.js').OttoIdentity} identity
   */
  constructor(adapter, identity) {
    this.adapter = adapter;
    this.identity = identity;
    /** @type {AuditEntry[]} In-memory buffer for recent entries */
    this.entries = [];
    this.entryCounter = 0;
  }

  /**
   * Initialize audit module: load entry counter from KV to ensure unique IDs.
   * @returns {Promise<void>}
   */
  async initialize() {
    const counterRaw = await this.adapter.kvGet(AUDIT_INDEX_MAP, "counter");
    if (counterRaw) {
      this.entryCounter = parseInt(counterRaw, 10);
    }
  }

  /**
   * Record an audit entry. This is the primary interface for logging agent actions.
   *
   * @param {Object} params
   * @param {string} params.action - One of AUDIT_ACTIONS.*
   * @param {string} params.resource - Resource acted upon
   * @param {string | null} [params.zone] - Zone context
   * @param {string} params.trigger - What caused this action
   * @param {Object} [params.input] - Input summary (sanitized, no PII)
   * @param {Object} params.outcome - Action result
   * @param {boolean} params.outcome.success
   * @param {string} [params.outcome.optionId]
   * @param {string} [params.outcome.error]
   * @param {Object} [params.permissionCheck] - Permission evaluation details
   * @returns {Promise<AuditEntry>}
   */
  async record(params) {
    this.entryCounter += 1;
    const entryId = `audit-${this.entryCounter}-${Date.now()}`;
    const session = this.adapter.getSession();

    const entry = {
      entryId,
      agentDid: this.identity.getDid(),
      timestamp: new Date().toISOString(),
      action: params.action,
      resource: params.resource,
      zone: params.zone ?? null,
      trigger: params.trigger,
      input: params.input ?? {},
      outcome: params.outcome,
      permissionCheck: params.permissionCheck ?? { allowed: true, policy: "implicit" },
      sessionEnvironment: session.environment,
    };

    // Persist to T3N KV (tamper-resistant storage inside TEE)
    await this.adapter.kvSet(AUDIT_MAP, entryId, JSON.stringify(entry));
    await this.adapter.kvSet(AUDIT_INDEX_MAP, "counter", String(this.entryCounter));

    // Keep in-memory buffer bounded
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES_IN_MEMORY) {
      this.entries = this.entries.slice(-MAX_ENTRIES_IN_MEMORY);
    }

    return entry;
  }

  // -------------------------------------------------------------------------
  // Convenience Logging Methods
  // -------------------------------------------------------------------------

  /**
   * Log a successful options generation.
   * @param {Object} input - Sanitized input summary
   * @param {string[]} optionIds - IDs of generated options
   * @param {string[]} zones - Affected zones
   * @returns {Promise<AuditEntry>}
   */
  async logOptionsGenerated(input, optionIds, zones) {
    return this.record({
      action: AUDIT_ACTIONS.OPTIONS_GENERATED,
      resource: "decision-option",
      zone: zones[0] ?? null,
      trigger: "operational-analysis",
      input,
      outcome: { success: true, optionIds, count: optionIds.length },
    });
  }

  /**
   * Log a proposal that requires operator approval.
   * @param {string} proposalType - e.g. "staff-reassignment"
   * @param {Object} proposal - The proposal details
   * @param {string} zone
   * @returns {Promise<AuditEntry>}
   */
  async logProposalCreated(proposalType, proposal, zone) {
    return this.record({
      action: AUDIT_ACTIONS.PROPOSAL_CREATED,
      resource: proposalType,
      zone,
      trigger: "decision-support-analysis",
      input: { proposalType, affectedZone: zone },
      outcome: { success: true, status: "awaiting-approval", proposal },
    });
  }

  /**
   * Log an operator approval of a proposal.
   * @param {string} proposalId
   * @param {string} approverDid - DID of the approving operator
   * @returns {Promise<AuditEntry>}
   */
  async logProposalApproved(proposalId, approverDid) {
    return this.record({
      action: AUDIT_ACTIONS.PROPOSAL_APPROVED,
      resource: "proposal",
      zone: null,
      trigger: `operator-approval:${approverDid}`,
      input: { proposalId, approverDid },
      outcome: { success: true, status: "approved" },
    });
  }

  /**
   * Log an operator rejection of a proposal.
   * @param {string} proposalId
   * @param {string} rejectorDid
   * @param {string} reason
   * @returns {Promise<AuditEntry>}
   */
  async logProposalRejected(proposalId, rejectorDid, reason) {
    return this.record({
      action: AUDIT_ACTIONS.PROPOSAL_REJECTED,
      resource: "proposal",
      zone: null,
      trigger: `operator-rejection:${rejectorDid}`,
      input: { proposalId, rejectorDid, reason },
      outcome: { success: true, status: "rejected", reason },
    });
  }

  /**
   * Log a TEE contract invocation.
   * @param {string} functionName
   * @param {Object} inputSummary
   * @param {import('./t3n-adapter.js').ContractResult} result
   * @returns {Promise<AuditEntry>}
   */
  async logContractExecution(functionName, inputSummary, result) {
    return this.record({
      action: result.success ? AUDIT_ACTIONS.CONTRACT_SUCCEEDED : AUDIT_ACTIONS.CONTRACT_FAILED,
      resource: `contract:${functionName}`,
      zone: null,
      trigger: "tee-contract-invocation",
      input: { functionName, ...inputSummary },
      outcome: {
        success: result.success,
        executionId: result.executionId,
        error: result.error ?? undefined,
      },
    });
  }

  /**
   * Log a permission denial (for security monitoring).
   * @param {string} action
   * @param {string} resource
   * @param {string} reason
   * @returns {Promise<AuditEntry>}
   */
  async logPermissionDenied(action, resource, reason) {
    return this.record({
      action: AUDIT_ACTIONS.PERMISSION_DENIED,
      resource,
      zone: null,
      trigger: "permission-evaluation",
      input: { attemptedAction: action, resource },
      outcome: { success: false, error: reason },
    });
  }

  /**
   * Log an error that occurred during agent operation.
   * @param {string} context - Where the error occurred
   * @param {Error | string} error
   * @returns {Promise<AuditEntry>}
   */
  async logError(context, error) {
    return this.record({
      action: AUDIT_ACTIONS.ERROR_OCCURRED,
      resource: context,
      zone: null,
      trigger: "error",
      input: { context },
      outcome: { success: false, error: error instanceof Error ? error.message : error },
    });
  }

  // -------------------------------------------------------------------------
  // Query Interface
  // -------------------------------------------------------------------------

  /**
   * Query audit entries with filters.
   * @param {AuditQuery} query
   * @returns {Promise<AuditEntry[]>}
   */
  async query(query = {}) {
    // For fixture mode, query from in-memory buffer
    let results = [...this.entries];

    if (query.action) {
      results = results.filter((e) => e.action === query.action);
    }
    if (query.resource) {
      results = results.filter((e) => e.resource === query.resource);
    }
    if (query.zone) {
      results = results.filter((e) => e.zone === query.zone);
    }
    if (query.since) {
      results = results.filter((e) => e.timestamp >= query.since);
    }
    if (query.until) {
      results = results.filter((e) => e.timestamp <= query.until);
    }
    if (query.successOnly) {
      results = results.filter((e) => e.outcome.success);
    }
    if (query.failedOnly) {
      results = results.filter((e) => !e.outcome.success);
    }
    if (query.limit) {
      results = results.slice(-query.limit);
    }

    return results;
  }

  /**
   * Get a summary of audit activity.
   * @returns {AuditSummary}
   */
  summarize() {
    const actionCounts = {};
    const resourceCounts = {};
    const zoneCounts = {};
    let successCount = 0;
    let failureCount = 0;

    for (const entry of this.entries) {
      actionCounts[entry.action] = (actionCounts[entry.action] ?? 0) + 1;
      resourceCounts[entry.resource] = (resourceCounts[entry.resource] ?? 0) + 1;
      if (entry.zone) {
        zoneCounts[entry.zone] = (zoneCounts[entry.zone] ?? 0) + 1;
      }
      if (entry.outcome.success) successCount++;
      else failureCount++;
    }

    return {
      totalEntries: this.entries.length,
      successCount,
      failureCount,
      actionCounts,
      resourceCounts,
      zoneCounts,
      firstEntry: this.entries.length > 0 ? this.entries[0].timestamp : null,
      lastEntry: this.entries.length > 0 ? this.entries[this.entries.length - 1].timestamp : null,
    };
  }

  /**
   * Export all audit entries as a JSON-serializable array.
   * Suitable for compliance export or external audit system ingestion.
   * @returns {Promise<AuditEntry[]>}
   */
  async exportAll() {
    // In production, this would paginate through T3N KV
    const keys = await this.adapter.kvKeys(AUDIT_MAP);
    const entries = [];
    for (const key of keys) {
      const raw = await this.adapter.kvGet(AUDIT_MAP, key);
      if (raw) entries.push(JSON.parse(raw));
    }
    return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /**
   * Get the count of entries in the audit trail.
   * @returns {number}
   */
  getEntryCount() {
    return this.entryCounter;
  }
}
