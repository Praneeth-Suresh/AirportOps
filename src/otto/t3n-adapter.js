/**
 * T3N Adapter — Interface boundary between Otto and the Terminal 3 Network.
 *
 * This adapter abstracts the T3N SDK operations that Otto needs:
 * - DID-based identity (authentication and session management)
 * - Tenant scoped storage (KV maps for audit logs, permissions, state)
 * - TEE contract execution (confidential computation of operational decisions)
 * - Permission delegation (agent-auth-update for operator-controlled access)
 *
 * In production, this adapter wraps @terminal3/t3n-sdk.
 * In test/fixture mode, it runs against a deterministic in-memory stub.
 *
 * @module otto/t3n-adapter
 */

// ---------------------------------------------------------------------------
// T3N Adapter Configuration
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} T3nConfig
 * @property {'testnet' | 'production' | 'fixture'} environment
 * @property {string} [apiKey] - T3N API key (required for testnet/production)
 * @property {string} [agentKey] - Agent's Ethereum private key for SIWE auth
 * @property {string} [tenantDid] - Tenant DID (read from session after auth; never hardcoded)
 * @property {string} [contractTail] - Contract tail name within tenant namespace
 */

/**
 * @typedef {Object} T3nSession
 * @property {string} did - The authenticated agent DID (did:t3n:<hex>)
 * @property {string} tenantId - The 40-hex tenant suffix
 * @property {boolean} authenticated
 * @property {string} authenticatedAt - ISO timestamp
 * @property {string} environment
 */

/**
 * @typedef {Object} KvEntry
 * @property {string} key
 * @property {Uint8Array | string} value
 */

/**
 * @typedef {Object} ContractInvocation
 * @property {string} scriptName - Full z:<tid>:<tail> script name
 * @property {string} functionName - Exported function to call
 * @property {Object} input - JSON input payload
 * @property {string} invokedAt - ISO timestamp
 * @property {string} invokedBy - DID of the invoking agent
 */

/**
 * @typedef {Object} ContractResult
 * @property {boolean} success
 * @property {Object} [output] - Decoded JSON output on success
 * @property {string} [error] - Error message on failure
 * @property {string} executedAt - ISO timestamp
 * @property {string} executionId - Unique execution identifier
 */

// ---------------------------------------------------------------------------
// Fixture / Deterministic Stub
// ---------------------------------------------------------------------------

/**
 * In-memory T3N stub for deterministic testing without network dependencies.
 * Mirrors the T3N SDK surface with predictable, inspectable behaviour.
 */
class T3nFixtureBackend {
  constructor() {
    /** @type {Map<string, Map<string, Uint8Array>>} map name -> (key -> value) */
    this.kvStore = new Map();
    /** @type {ContractInvocation[]} */
    this.invocationLog = [];
    /** @type {Map<string, Function>} function name -> handler */
    this.contractHandlers = new Map();
    this.executionCounter = 0;
  }

  /** @param {string} mapName @param {string} key @returns {Uint8Array | null} */
  kvGet(mapName, key) {
    const map = this.kvStore.get(mapName);
    return map?.get(key) ?? null;
  }

  /** @param {string} mapName @param {string} key @param {Uint8Array | string} value */
  kvSet(mapName, key, value) {
    if (!this.kvStore.has(mapName)) {
      this.kvStore.set(mapName, new Map());
    }
    const encoded = typeof value === "string" ? new TextEncoder().encode(value) : value;
    this.kvStore.get(mapName).set(key, encoded);
  }

  /** @param {string} mapName @param {string} key */
  kvDelete(mapName, key) {
    const map = this.kvStore.get(mapName);
    if (map) map.delete(key);
  }

  /** @param {string} mapName @returns {string[]} */
  kvKeys(mapName) {
    const map = this.kvStore.get(mapName);
    return map ? [...map.keys()] : [];
  }

  /**
   * @param {string} functionName
   * @param {Object} input
   * @param {string} callerDid
   * @returns {ContractResult}
   */
  executeContract(functionName, input, callerDid) {
    this.executionCounter += 1;
    const executionId = `exec-${this.executionCounter}-${Date.now()}`;
    const invocation = {
      scriptName: "z:fixture-tenant:otto-ops",
      functionName,
      input,
      invokedAt: new Date().toISOString(),
      invokedBy: callerDid,
    };
    this.invocationLog.push(invocation);

    const handler = this.contractHandlers.get(functionName);
    if (!handler) {
      return {
        success: false,
        error: `no handler registered for function: ${functionName}`,
        executedAt: new Date().toISOString(),
        executionId,
      };
    }

    try {
      const output = handler(input, callerDid);
      return { success: true, output, executedAt: new Date().toISOString(), executionId };
    } catch (err) {
      return { success: false, error: err.message, executedAt: new Date().toISOString(), executionId };
    }
  }

  /** @param {string} functionName @param {Function} handler */
  registerHandler(functionName, handler) {
    this.contractHandlers.set(functionName, handler);
  }
}

// ---------------------------------------------------------------------------
// T3N Adapter (Public API)
// ---------------------------------------------------------------------------

export class T3nAdapter {
  /**
   * @param {T3nConfig} config
   */
  constructor(config) {
    this.config = config;
    /** @type {T3nSession | null} */
    this.session = null;
    this.backend = config.environment === "fixture"
      ? new T3nFixtureBackend()
      : null;
  }

  // -------------------------------------------------------------------------
  // Identity & Authentication
  // -------------------------------------------------------------------------

  /**
   * Authenticate to T3N and establish an encrypted session.
   * The DID is read from the session response — never derived or hardcoded.
   *
   * @returns {Promise<T3nSession>}
   */
  async authenticate() {
    if (this.config.environment === "fixture") {
      this.session = {
        did: "did:t3n:otto-fixture-0000000000000000000000000000000001",
        tenantId: "otto-fixture-0000000000000000000000000000000001",
        authenticated: true,
        authenticatedAt: new Date().toISOString(),
        environment: "fixture",
      };
      return this.session;
    }

    // Production/testnet: delegate to @terminal3/t3n-sdk
    // This path requires the SDK to be installed:
    //   npm install @terminal3/t3n-sdk
    const {
      T3nClient, loadWasmComponent, createEthAuthInput,
      eth_get_address, metamask_sign, setEnvironment, getNodeUrl, TenantClient,
    } = await import("@terminal3/t3n-sdk");

    setEnvironment(this.config.environment);
    const address = eth_get_address(this.config.agentKey);
    const wasmComponent = await loadWasmComponent();

    this._t3nClient = new T3nClient({
      wasmComponent,
      handlers: { EthSign: metamask_sign(address, undefined, this.config.agentKey) },
    });

    await this._t3nClient.handshake();
    const did = await this._t3nClient.authenticate(createEthAuthInput(address));
    const tenantDid = did.value;
    const tenantId = tenantDid.slice("did:t3n:".length);

    this._tenantClient = new TenantClient({
      t3n: this._t3nClient,
      baseUrl: getNodeUrl(),
      tenantDid,
    });

    this.session = {
      did: tenantDid,
      tenantId,
      authenticated: true,
      authenticatedAt: new Date().toISOString(),
      environment: this.config.environment,
    };

    return this.session;
  }

  /**
   * @returns {T3nSession}
   * @throws {Error} if not authenticated
   */
  getSession() {
    if (!this.session || !this.session.authenticated) {
      throw new Error("T3nAdapter: not authenticated. Call authenticate() first.");
    }
    return this.session;
  }

  // -------------------------------------------------------------------------
  // Tenant-Scoped Key-Value Storage
  // -------------------------------------------------------------------------

  /**
   * Build the full z-namespace map name for a given tail.
   * @param {string} tail - e.g. "audit-log", "permissions", "state"
   * @returns {string} e.g. "z:<tenantId>:audit-log"
   */
  mapName(tail) {
    const session = this.getSession();
    return `z:${session.tenantId}:${tail}`;
  }

  /**
   * Read a value from a tenant KV map.
   * @param {string} tail - Map tail name
   * @param {string} key
   * @returns {Promise<string | null>}
   */
  async kvGet(tail, key) {
    const fullMapName = this.mapName(tail);
    if (this.backend) {
      const raw = this.backend.kvGet(fullMapName, key);
      return raw ? new TextDecoder().decode(raw) : null;
    }
    // Production path would use T3N SDK kv-store host interface
    throw new Error("T3nAdapter.kvGet: production KV not implemented — use fixture mode or install @terminal3/t3n-sdk");
  }

  /**
   * Write a value to a tenant KV map.
   * @param {string} tail - Map tail name
   * @param {string} key
   * @param {string} value
   * @returns {Promise<void>}
   */
  async kvSet(tail, key, value) {
    const fullMapName = this.mapName(tail);
    if (this.backend) {
      this.backend.kvSet(fullMapName, key, value);
      return;
    }
    throw new Error("T3nAdapter.kvSet: production KV not implemented — use fixture mode or install @terminal3/t3n-sdk");
  }

  /**
   * Delete a key from a tenant KV map.
   * @param {string} tail - Map tail name
   * @param {string} key
   * @returns {Promise<void>}
   */
  async kvDelete(tail, key) {
    const fullMapName = this.mapName(tail);
    if (this.backend) {
      this.backend.kvDelete(fullMapName, key);
      return;
    }
    throw new Error("T3nAdapter.kvDelete: production KV not implemented");
  }

  /**
   * List all keys in a tenant KV map.
   * @param {string} tail
   * @returns {Promise<string[]>}
   */
  async kvKeys(tail) {
    const fullMapName = this.mapName(tail);
    if (this.backend) {
      return this.backend.kvKeys(fullMapName);
    }
    throw new Error("T3nAdapter.kvKeys: production KV not implemented");
  }

  // -------------------------------------------------------------------------
  // TEE Contract Execution
  // -------------------------------------------------------------------------

  /**
   * Execute a function on Otto's TEE contract.
   * @param {string} functionName - The exported WASM function
   * @param {Object} input - JSON-serialisable input
   * @returns {Promise<ContractResult>}
   */
  async executeContract(functionName, input) {
    const session = this.getSession();
    if (this.backend) {
      return this.backend.executeContract(functionName, input, session.did);
    }

    // Production path: use T3N SDK executeAndDecode
    const { getScriptVersion, getNodeUrl } = await import("@terminal3/t3n-sdk");
    const scriptName = `z:${session.tenantId}:${this.config.contractTail}`;
    const scriptVersion = await getScriptVersion(getNodeUrl(), scriptName);

    const output = await this._t3nClient.executeAndDecode({
      script_name: scriptName,
      script_version: scriptVersion,
      function_name: functionName,
      input,
    });

    return {
      success: true,
      output,
      executedAt: new Date().toISOString(),
      executionId: `prod-${Date.now()}`,
    };
  }

  /**
   * Register a fixture contract handler (test/fixture mode only).
   * @param {string} functionName
   * @param {Function} handler
   */
  registerContractHandler(functionName, handler) {
    if (!this.backend) {
      throw new Error("registerContractHandler: only available in fixture mode");
    }
    this.backend.registerHandler(functionName, handler);
  }

  /**
   * Get the contract invocation log (fixture mode only — used for audit verification).
   * @returns {ContractInvocation[]}
   */
  getInvocationLog() {
    if (!this.backend) {
      throw new Error("getInvocationLog: only available in fixture mode");
    }
    return [...this.backend.invocationLog];
  }
}

/**
 * Factory: create a fixture-mode T3N adapter for deterministic testing.
 * @returns {T3nAdapter}
 */
export function createFixtureAdapter() {
  return new T3nAdapter({ environment: "fixture" });
}
