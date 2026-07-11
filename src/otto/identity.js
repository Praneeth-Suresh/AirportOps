/**
 * Otto Identity Module — Agent identity backed by Terminal 3 DIDs.
 *
 * Provides:
 * - DID-based agent identity (did:t3n:<unique-id>)
 * - Session lifecycle (authenticate, verify, refresh, revoke)
 * - Identity attestation (prove Otto is who it claims to be)
 * - Operator delegation tracking (who authorized this agent)
 *
 * Every action Otto takes is tied to its DID. The DID is:
 * - Permanent: assigned once on T3N onboarding
 * - Verifiable: any party can check the DID resolves to Otto
 * - Non-transferable: bound to Otto's authentication key
 *
 * @module otto/identity
 */

/**
 * @typedef {Object} AgentIdentity
 * @property {string} did - did:t3n:<hex> — Otto's unique decentralized identifier
 * @property {string} name - Human-readable agent name
 * @property {string} role - Agent role within the airport ops system
 * @property {string} tenantId - T3N tenant hex suffix
 * @property {string} createdAt - ISO timestamp of identity creation
 * @property {Object} capabilities - Declared capability set
 * @property {string[]} capabilities.reads - Data domains this agent can read
 * @property {string[]} capabilities.writes - Data domains this agent can write
 * @property {string[]} capabilities.actions - Operational actions this agent can propose
 */

/**
 * @typedef {Object} DelegationRecord
 * @property {string} delegatorDid - DID of the human operator who authorized Otto
 * @property {string} agentDid - Otto's DID
 * @property {string[]} scopes - Permission scopes granted
 * @property {string} grantedAt - ISO timestamp
 * @property {string | null} expiresAt - Expiration timestamp or null for indefinite
 * @property {string} status - 'active' | 'expired' | 'revoked'
 */

/**
 * @typedef {Object} IdentityAttestation
 * @property {string} agentDid
 * @property {string} attestedAt - ISO timestamp
 * @property {string} environment - 'fixture' | 'testnet' | 'production'
 * @property {boolean} sessionValid
 * @property {string | null} sessionExpiry
 */

// ---------------------------------------------------------------------------
// Agent Identity Constants
// ---------------------------------------------------------------------------

const OTTO_AGENT_NAME = "Otto";
const OTTO_AGENT_ROLE = "airport-operations-decision-support";
const OTTO_IDENTITY_MAP = "otto-identity";
const OTTO_DELEGATIONS_MAP = "otto-delegations";

const OTTO_CAPABILITIES = Object.freeze({
  reads: [
    "operational-snapshot",
    "flow-forecast",
    "scenario-projection",
    "queue-state",
    "counter-utilization",
    "crowding-event",
    "operational-alert",
    "staffing-context",
    "flight-state",
  ],
  writes: [
    "decision-option",
    "recommendation",
    "audit-entry",
  ],
  actions: [
    "propose-staff-reassignment",
    "propose-counter-capacity-change",
    "propose-passenger-movement",
    "propose-shift-timing-change",
    "explain-recommendation",
    "answer-operator-question",
  ],
});

// ---------------------------------------------------------------------------
// Identity Module
// ---------------------------------------------------------------------------

export class OttoIdentity {
  /**
   * @param {import('./t3n-adapter.js').T3nAdapter} adapter
   */
  constructor(adapter) {
    /** @type {import('./t3n-adapter.js').T3nAdapter} */
    this.adapter = adapter;
    /** @type {AgentIdentity | null} */
    this.identity = null;
    /** @type {DelegationRecord[]} */
    this.delegations = [];
  }

  /**
   * Initialize Otto's identity by authenticating to T3N.
   * The DID is always read from the T3N session response.
   *
   * @returns {Promise<AgentIdentity>}
   */
  async initialize() {
    const session = await this.adapter.authenticate();

    this.identity = {
      did: session.did,
      name: OTTO_AGENT_NAME,
      role: OTTO_AGENT_ROLE,
      tenantId: session.tenantId,
      createdAt: new Date().toISOString(),
      capabilities: OTTO_CAPABILITIES,
    };

    // Persist identity record in T3N KV for auditability
    await this.adapter.kvSet(
      OTTO_IDENTITY_MAP,
      "current",
      JSON.stringify(this.identity),
    );

    // Load any existing delegations
    await this._loadDelegations();

    return this.identity;
  }

  /**
   * Get the current agent identity.
   * @returns {AgentIdentity}
   * @throws {Error} if not initialized
   */
  getIdentity() {
    if (!this.identity) {
      throw new Error("OttoIdentity: not initialized. Call initialize() first.");
    }
    return this.identity;
  }

  /**
   * Get Otto's DID for use in audit trails and permission checks.
   * @returns {string}
   */
  getDid() {
    return this.getIdentity().did;
  }

  /**
   * Get Otto's declared capabilities.
   * @returns {{ reads: string[], writes: string[], actions: string[] }}
   */
  getCapabilities() {
    return this.getIdentity().capabilities;
  }

  /**
   * Produce an attestation proving Otto's identity and session validity.
   * This can be presented to operators or external systems for verification.
   *
   * @returns {IdentityAttestation}
   */
  attest() {
    const session = this.adapter.getSession();
    return {
      agentDid: session.did,
      attestedAt: new Date().toISOString(),
      environment: session.environment,
      sessionValid: session.authenticated,
      sessionExpiry: null, // T3N sessions are refreshed on each call
    };
  }

  // -------------------------------------------------------------------------
  // Delegation Management
  // -------------------------------------------------------------------------

  /**
   * Record that an operator has delegated specific scopes to Otto.
   * In production, this corresponds to an agent-auth-update call on T3N.
   *
   * @param {string} delegatorDid - DID of the human operator
   * @param {string[]} scopes - Permission scopes being granted
   * @param {string | null} [expiresAt] - Optional expiration
   * @returns {Promise<DelegationRecord>}
   */
  async recordDelegation(delegatorDid, scopes, expiresAt = null) {
    const record = {
      delegatorDid,
      agentDid: this.getDid(),
      scopes,
      grantedAt: new Date().toISOString(),
      expiresAt,
      status: "active",
    };

    this.delegations.push(record);

    // Persist in T3N KV
    await this.adapter.kvSet(
      OTTO_DELEGATIONS_MAP,
      `delegation-${this.delegations.length}`,
      JSON.stringify(record),
    );

    return record;
  }

  /**
   * Revoke a delegation by delegator DID.
   * @param {string} delegatorDid
   * @returns {Promise<number>} count of revoked delegations
   */
  async revokeDelegation(delegatorDid) {
    let revokedCount = 0;
    for (const record of this.delegations) {
      if (record.delegatorDid === delegatorDid && record.status === "active") {
        record.status = "revoked";
        revokedCount += 1;
      }
    }
    // Persist updated delegations
    await this._persistDelegations();
    return revokedCount;
  }

  /**
   * Get all active delegations.
   * @returns {DelegationRecord[]}
   */
  getActiveDelegations() {
    const now = new Date().toISOString();
    return this.delegations.filter((d) => {
      if (d.status !== "active") return false;
      if (d.expiresAt && d.expiresAt < now) return false;
      return true;
    });
  }

  /**
   * Check if a specific scope is delegated to Otto by any active operator.
   * @param {string} scope
   * @returns {boolean}
   */
  hasDelegatedScope(scope) {
    return this.getActiveDelegations().some((d) => d.scopes.includes(scope));
  }

  /**
   * Get all scopes currently delegated to Otto (de-duplicated).
   * @returns {string[]}
   */
  getAllDelegatedScopes() {
    const scopes = new Set();
    for (const delegation of this.getActiveDelegations()) {
      for (const scope of delegation.scopes) {
        scopes.add(scope);
      }
    }
    return [...scopes];
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /** @private */
  async _loadDelegations() {
    const keys = await this.adapter.kvKeys(OTTO_DELEGATIONS_MAP);
    this.delegations = [];
    for (const key of keys) {
      const raw = await this.adapter.kvGet(OTTO_DELEGATIONS_MAP, key);
      if (raw) {
        this.delegations.push(JSON.parse(raw));
      }
    }
  }

  /** @private */
  async _persistDelegations() {
    for (let i = 0; i < this.delegations.length; i++) {
      await this.adapter.kvSet(
        OTTO_DELEGATIONS_MAP,
        `delegation-${i + 1}`,
        JSON.stringify(this.delegations[i]),
      );
    }
  }
}
