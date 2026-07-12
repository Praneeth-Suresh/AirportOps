/**
 * Otto Permissions Module — Scoped, least-privilege access control.
 *
 * This module enforces what Otto can and cannot do. It implements:
 * - Scope-based permission model (read, write, propose, explain)
 * - Zone-level granularity (Otto can be scoped to specific airport zones)
 * - Time-window constraints (permissions valid only during operational windows)
 * - Escalation rules (some actions require explicit operator approval)
 * - Permission evaluation with deny-by-default semantics
 *
 * The permission model maps directly to T3N's z-namespace ACLs:
 * - KV map read/write policies enforce data access at the platform level
 * - Contract function allowlists enforce action permissions
 * - Host egress allowlists enforce external system access
 *
 * @module otto/permissions
 */

/**
 * @typedef {Object} PermissionScope
 * @property {string} action - The action type (read, write, propose, explain, escalate)
 * @property {string} resource - The resource being accessed (e.g. "operational-snapshot", "decision-option")
 * @property {string[] | null} zones - Specific zone IDs this permission applies to (null = all zones)
 * @property {Object | null} timeWindow - Time constraints
 * @property {string} timeWindow.start - ISO timestamp
 * @property {string} timeWindow.end - ISO timestamp
 */

/**
 * @typedef {Object} PermissionPolicy
 * @property {string} policyId
 * @property {string} name - Human-readable policy name
 * @property {string} description
 * @property {PermissionScope[]} allows - Scopes this policy grants
 * @property {PermissionScope[]} denies - Explicit denials (override allows)
 * @property {string[]} requiresApproval - Actions that need operator confirmation before execution
 * @property {string} createdAt
 * @property {string} createdBy - DID of whoever created this policy
 */

/**
 * @typedef {Object} PermissionEvaluation
 * @property {boolean} allowed
 * @property {string} action
 * @property {string} resource
 * @property {string | null} zone
 * @property {string} reason - Why the decision was made
 * @property {boolean} requiresApproval - Whether operator approval is needed before acting
 * @property {string} evaluatedAt
 * @property {string} evaluatedBy - Otto's DID
 */

// ---------------------------------------------------------------------------
// Permission Constants
// ---------------------------------------------------------------------------

const PERMISSIONS_MAP = "otto-permissions";

/** Actions that Otto can perform */
export const ACTIONS = Object.freeze({
  READ: "read",
  WRITE: "write",
  PROPOSE: "propose",
  EXPLAIN: "explain",
  ESCALATE: "escalate",
});

/** Resources in the airport operations domain */
export const RESOURCES = Object.freeze({
  OPERATIONAL_SNAPSHOT: "operational-snapshot",
  FLOW_FORECAST: "flow-forecast",
  SCENARIO_PROJECTION: "scenario-projection",
  DECISION_OPTION: "decision-option",
  RECOMMENDATION: "recommendation",
  QUEUE_STATE: "queue-state",
  COUNTER_UTILIZATION: "counter-utilization",
  CROWDING_EVENT: "crowding-event",
  OPERATIONAL_ALERT: "operational-alert",
  STAFFING_CONTEXT: "staffing-context",
  FLIGHT_STATE: "flight-state",
  STAFF_ASSIGNMENT: "staff-assignment",
  COUNTER_CAPACITY: "counter-capacity",
  PASSENGER_ROUTING: "passenger-routing",
  SHIFT_TIMING: "shift-timing",
  AUDIT_LOG: "audit-log",
});

/**
 * Default policy: what Otto can do without any additional delegation.
 * This is the minimal base — operator delegations expand it.
 */
const DEFAULT_POLICY = Object.freeze({
  policyId: "otto-default-v1",
  name: "Otto Base Policy",
  description: "Minimal read access and proposal capabilities for airport operations decision support",
  allows: [
    // Otto can always read operational data
    { action: ACTIONS.READ, resource: RESOURCES.OPERATIONAL_SNAPSHOT, zones: null, timeWindow: null },
    { action: ACTIONS.READ, resource: RESOURCES.FLOW_FORECAST, zones: null, timeWindow: null },
    { action: ACTIONS.READ, resource: RESOURCES.SCENARIO_PROJECTION, zones: null, timeWindow: null },
    { action: ACTIONS.READ, resource: RESOURCES.QUEUE_STATE, zones: null, timeWindow: null },
    { action: ACTIONS.READ, resource: RESOURCES.COUNTER_UTILIZATION, zones: null, timeWindow: null },
    { action: ACTIONS.READ, resource: RESOURCES.CROWDING_EVENT, zones: null, timeWindow: null },
    { action: ACTIONS.READ, resource: RESOURCES.OPERATIONAL_ALERT, zones: null, timeWindow: null },
    { action: ACTIONS.READ, resource: RESOURCES.STAFFING_CONTEXT, zones: null, timeWindow: null },
    { action: ACTIONS.READ, resource: RESOURCES.FLIGHT_STATE, zones: null, timeWindow: null },
    // Otto can generate decision options and recommendations
    { action: ACTIONS.WRITE, resource: RESOURCES.DECISION_OPTION, zones: null, timeWindow: null },
    { action: ACTIONS.WRITE, resource: RESOURCES.RECOMMENDATION, zones: null, timeWindow: null },
    { action: ACTIONS.WRITE, resource: RESOURCES.AUDIT_LOG, zones: null, timeWindow: null },
    // Otto can explain its reasoning
    { action: ACTIONS.EXPLAIN, resource: RESOURCES.DECISION_OPTION, zones: null, timeWindow: null },
    { action: ACTIONS.EXPLAIN, resource: RESOURCES.RECOMMENDATION, zones: null, timeWindow: null },
  ],
  denies: [
    // Otto NEVER directly modifies operational state
    { action: ACTIONS.WRITE, resource: RESOURCES.OPERATIONAL_SNAPSHOT, zones: null, timeWindow: null },
    { action: ACTIONS.WRITE, resource: RESOURCES.FLIGHT_STATE, zones: null, timeWindow: null },
  ],
  requiresApproval: [
    "propose-staff-reassignment",
    "propose-counter-capacity-change",
    "propose-passenger-movement",
    "propose-shift-timing-change",
  ],
  createdAt: "2026-07-12T00:00:00.000Z",
  createdBy: "system",
});

// ---------------------------------------------------------------------------
// Permissions Module
// ---------------------------------------------------------------------------

export class OttoPermissions {
  /**
   * @param {import('./t3n-adapter.js').T3nAdapter} adapter
   * @param {import('./identity.js').OttoIdentity} identity
   */
  constructor(adapter, identity) {
    this.adapter = adapter;
    this.identity = identity;
    /** @type {PermissionPolicy[]} */
    this.policies = [DEFAULT_POLICY];
    /** @type {PermissionEvaluation[]} */
    this.evaluationLog = [];
  }

  /**
   * Initialize permissions: load persisted policies from T3N KV.
   * @returns {Promise<void>}
   */
  async initialize() {
    const keys = await this.adapter.kvKeys(PERMISSIONS_MAP);
    for (const key of keys) {
      if (key.startsWith("policy-")) {
        const raw = await this.adapter.kvGet(PERMISSIONS_MAP, key);
        if (raw) {
          const policy = JSON.parse(raw);
          // Don't double-add the default
          if (policy.policyId !== DEFAULT_POLICY.policyId) {
            this.policies.push(policy);
          }
        }
      }
    }
  }

  /**
   * Evaluate whether Otto is permitted to perform an action on a resource.
   * Uses deny-by-default semantics with explicit allow/deny rules.
   *
   * @param {string} action - One of ACTIONS.*
   * @param {string} resource - One of RESOURCES.*
   * @param {string | null} [zone] - Specific zone (null = zone-agnostic)
   * @returns {PermissionEvaluation}
   */
  evaluate(action, resource, zone = null) {
    const now = new Date().toISOString();
    const agentDid = this.identity.getDid();

    // Phase 1: Check explicit denials across all policies
    for (const policy of this.policies) {
      for (const deny of policy.denies) {
        if (this._scopeMatches(deny, action, resource, zone, now)) {
          const evaluation = {
            allowed: false,
            action,
            resource,
            zone,
            reason: `Denied by policy "${policy.name}" (${policy.policyId})`,
            requiresApproval: false,
            evaluatedAt: now,
            evaluatedBy: agentDid,
          };
          this.evaluationLog.push(evaluation);
          return evaluation;
        }
      }
    }

    // Phase 2: Check delegation scopes from identity module
    const delegatedScopes = this.identity.getAllDelegatedScopes();
    const proposalAction = `${action}-${resource}`;

    // Phase 3: Check explicit allows across all policies
    for (const policy of this.policies) {
      for (const allow of policy.allows) {
        if (this._scopeMatches(allow, action, resource, zone, now)) {
          // Check if this action requires operator approval
          const needsApproval = this._requiresApproval(action, resource);

          const evaluation = {
            allowed: true,
            action,
            resource,
            zone,
            reason: `Allowed by policy "${policy.name}" (${policy.policyId})`,
            requiresApproval: needsApproval,
            evaluatedAt: now,
            evaluatedBy: agentDid,
          };
          this.evaluationLog.push(evaluation);
          return evaluation;
        }
      }
    }

    // Phase 4: Check if delegation grants this scope
    if (delegatedScopes.includes(action) || delegatedScopes.includes(`${action}:${resource}`)) {
      const evaluation = {
        allowed: true,
        action,
        resource,
        zone,
        reason: "Allowed by operator delegation",
        requiresApproval: this._requiresApproval(action, resource),
        evaluatedAt: now,
        evaluatedBy: agentDid,
      };
      this.evaluationLog.push(evaluation);
      return evaluation;
    }

    // Phase 5: Deny by default
    const evaluation = {
      allowed: false,
      action,
      resource,
      zone,
      reason: "No matching policy or delegation grants this permission (deny-by-default)",
      requiresApproval: false,
      evaluatedAt: now,
      evaluatedBy: agentDid,
    };
    this.evaluationLog.push(evaluation);
    return evaluation;
  }

  /**
   * Quick boolean check: is this action allowed?
   * @param {string} action
   * @param {string} resource
   * @param {string | null} [zone]
   * @returns {boolean}
   */
  isAllowed(action, resource, zone = null) {
    return this.evaluate(action, resource, zone).allowed;
  }

  /**
   * Check if a proposed operational action requires operator approval.
   * @param {string} action
   * @param {string} resource
   * @returns {boolean}
   */
  _requiresApproval(action, resource) {
    if (action !== ACTIONS.PROPOSE) return false;
    // Map resource names to proposal action keys used in the default policy
    const resourceToProposalKey = {
      [RESOURCES.STAFF_ASSIGNMENT]: "propose-staff-reassignment",
      [RESOURCES.COUNTER_CAPACITY]: "propose-counter-capacity-change",
      [RESOURCES.PASSENGER_ROUTING]: "propose-passenger-movement",
      [RESOURCES.SHIFT_TIMING]: "propose-shift-timing-change",
    };
    const proposalKey = resourceToProposalKey[resource] ?? `propose-${resource}`;
    return this.policies.some((p) => p.requiresApproval.includes(proposalKey));
  }

  /**
   * Add an additional policy (e.g., operator grants zone-specific proposal rights).
   * @param {PermissionPolicy} policy
   * @returns {Promise<void>}
   */
  async addPolicy(policy) {
    this.policies.push(policy);
    await this.adapter.kvSet(
      PERMISSIONS_MAP,
      `policy-${policy.policyId}`,
      JSON.stringify(policy),
    );
  }

  /**
   * Remove a policy by ID.
   * @param {string} policyId
   * @returns {Promise<boolean>}
   */
  async removePolicy(policyId) {
    if (policyId === DEFAULT_POLICY.policyId) {
      return false; // Cannot remove the base policy
    }
    const index = this.policies.findIndex((p) => p.policyId === policyId);
    if (index === -1) return false;
    this.policies.splice(index, 1);
    await this.adapter.kvDelete(PERMISSIONS_MAP, `policy-${policyId}`);
    return true;
  }

  /**
   * Create a zone-scoped policy for an operator delegation.
   * This is the primary way operators grant Otto additional capabilities.
   *
   * @param {string} operatorDid - DID of the granting operator
   * @param {string[]} zones - Zone IDs Otto is authorized for
   * @param {string[]} actions - Actions permitted (e.g., ['propose'])
   * @param {string[]} resources - Resources (e.g., ['staff-assignment', 'counter-capacity'])
   * @param {Object | null} [timeWindow] - Optional time bounds
   * @returns {Promise<PermissionPolicy>}
   */
  async grantZonePolicy(operatorDid, zones, actions, resources, timeWindow = null) {
    const allows = [];
    for (const action of actions) {
      for (const resource of resources) {
        allows.push({ action, resource, zones, timeWindow });
      }
    }

    const policy = {
      policyId: `zone-grant-${Date.now()}`,
      name: `Zone grant by ${operatorDid}`,
      description: `Operator ${operatorDid} granted Otto ${actions.join("/")} on ${resources.join(", ")} in zones ${zones.join(", ")}`,
      allows,
      denies: [],
      requiresApproval: [],
      createdAt: new Date().toISOString(),
      createdBy: operatorDid,
    };

    await this.addPolicy(policy);
    return policy;
  }

  /**
   * Get all policies currently active.
   * @returns {PermissionPolicy[]}
   */
  getActivePolicies() {
    return [...this.policies];
  }

  /**
   * Get the evaluation log (for audit/debugging).
   * @returns {PermissionEvaluation[]}
   */
  getEvaluationLog() {
    return [...this.evaluationLog];
  }

  /**
   * Produce a permissions summary: what Otto can and cannot do right now.
   * @returns {{ allowed: Object[], denied: Object[], requiresApproval: string[] }}
   */
  summarize() {
    const allowed = [];
    const denied = [];
    const requiresApproval = new Set();

    for (const policy of this.policies) {
      for (const allow of policy.allows) {
        allowed.push({ ...allow, policyId: policy.policyId });
      }
      for (const deny of policy.denies) {
        denied.push({ ...deny, policyId: policy.policyId });
      }
      for (const action of policy.requiresApproval) {
        requiresApproval.add(action);
      }
    }

    return { allowed, denied, requiresApproval: [...requiresApproval] };
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Check if a scope definition matches the requested action/resource/zone/time.
   * @private
   */
  _scopeMatches(scope, action, resource, zone, now) {
    // Action must match
    if (scope.action !== action) return false;

    // Resource must match
    if (scope.resource !== resource) return false;

    // Zone check: null scope means all zones match; non-null scope must include the zone
    if (scope.zones !== null && zone !== null) {
      if (!scope.zones.includes(zone)) return false;
    }

    // Time window check
    if (scope.timeWindow) {
      if (now < scope.timeWindow.start || now > scope.timeWindow.end) {
        return false;
      }
    }

    return true;
  }
}
