import { createHash } from "node:crypto";

export const TINYFISH_SEARCH_ENDPOINT = "https://api.search.tinyfish.ai";
export const DEFAULT_TINYFISH_SEARCH_QUERY = "latest airport passenger congestion and flight disruption news Vietnam Ho Chi Minh";
export const DEFAULT_TINYFISH_LOCATION = "VN";
export const DEFAULT_TINYFISH_LANGUAGE = "en";
export const DEFAULT_TINYFISH_DOMAIN_TYPE = "news";

export class TinyFishSearchError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = "TinyFishSearchError";
    this.status = status;
    this.code = code;
  }
}

export class TinyFishSearchClient {
  constructor({
    apiKey,
    endpoint = TINYFISH_SEARCH_ENDPOINT,
    fetcher = globalThis.fetch,
  } = {}) {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
    this.fetcher = fetcher;
  }

  async search({
    query = DEFAULT_TINYFISH_SEARCH_QUERY,
    purpose = "Find recent public airport congestion or flight disruption context for an operations dashboard demo.",
    location = DEFAULT_TINYFISH_LOCATION,
    language = DEFAULT_TINYFISH_LANGUAGE,
    domainType = DEFAULT_TINYFISH_DOMAIN_TYPE,
    page = 0,
  } = {}) {
    if (!this.apiKey) {
      throw new TinyFishSearchError("TINYFISH_API_KEY is required for live TinyFish Search API updates", {
        code: "missing-tinyfish-api-key",
      });
    }
    if (typeof this.fetcher !== "function") {
      throw new TinyFishSearchError("TinyFish Search client requires a fetch implementation", {
        code: "missing-fetch",
      });
    }

    const url = new URL(this.endpoint);
    url.searchParams.set("query", query);
    url.searchParams.set("purpose", purpose);
    url.searchParams.set("location", location);
    url.searchParams.set("language", language);
    url.searchParams.set("domain_type", domainType);
    url.searchParams.set("page", String(page));

    const response = await this.fetcher(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-Key": this.apiKey,
      },
    });

    if (!response.ok) {
      throw new TinyFishSearchError(`TinyFish Search API returned HTTP ${response.status}`, {
        status: response.status,
        code: "tinyfish-search-failed",
      });
    }

    return response.json();
  }
}

export class TinyFishLiveUpdateProvider {
  constructor({
    apiKey,
    fetcher,
    now = () => new Date(),
    searchClient = new TinyFishSearchClient({ apiKey, fetcher }),
    defaultQuery = DEFAULT_TINYFISH_SEARCH_QUERY,
    defaultLocation = DEFAULT_TINYFISH_LOCATION,
    defaultLanguage = DEFAULT_TINYFISH_LANGUAGE,
    defaultDomainType = DEFAULT_TINYFISH_DOMAIN_TYPE,
  } = {}) {
    this.searchClient = searchClient;
    this.now = now;
    this.defaultQuery = defaultQuery;
    this.defaultLocation = defaultLocation;
    this.defaultLanguage = defaultLanguage;
    this.defaultDomainType = defaultDomainType;
  }

  async fetchPublicUpdates({
    snapshotId,
    zoneId = "check-in-a",
    flightId,
    query = this.defaultQuery,
    location = this.defaultLocation,
    language = this.defaultLanguage,
    domainType = this.defaultDomainType,
    limit = 3,
  } = {}) {
    assertString(snapshotId, "TinyFishLiveUpdate.snapshotId");
    assertString(zoneId, "TinyFishLiveUpdate.zoneId");

    const searchResponse = await this.searchClient.search({
      query,
      location,
      language,
      domainType,
    });
    const observedAt = this.now().toISOString();
    const updates = mapTinyFishSearchResponseToPublicUpdates(searchResponse, {
      snapshotId,
      zoneId,
      flightId,
      observedAt,
      limit,
    });

    return {
      updates,
      meta: {
        query: searchResponse.query ?? query,
        totalResults: searchResponse.total_results ?? searchResponse.totalResults ?? updates.length,
        page: searchResponse.page ?? 0,
        source: "TinyFish Search API",
      },
    };
  }
}

export function createTinyFishLiveUpdateProvider(options) {
  return new TinyFishLiveUpdateProvider(options);
}

export function mapTinyFishSearchResponseToPublicUpdates(searchResponse, {
  snapshotId,
  zoneId,
  flightId,
  observedAt,
  limit = 3,
} = {}) {
  assertString(snapshotId, "TinyFishLiveUpdate.snapshotId");
  assertString(zoneId, "TinyFishLiveUpdate.zoneId");
  assertString(observedAt, "TinyFishLiveUpdate.observedAt");

  const results = Array.isArray(searchResponse?.results) ? searchResponse.results : [];
  return results.slice(0, limit).map((result, index) => {
    const title = firstString(result.title, "TinyFish public update");
    const summary = firstString(result.snippet, result.description, title);
    const url = firstString(result.url, "");
    const sourceName = firstString(result.publisher, result.site_name, "public web");
    const severity = classifyPublicUpdateSeverity(`${title} ${summary}`);
    const confidenceScore = result.date ? 0.82 : 0.74;

    return {
      updateId: `tinyfish-live-${stableToken(url || `${title}-${index}`)}`,
      snapshotId,
      observedAt,
      zoneId,
      flightId,
      severity,
      title,
      summary,
      url,
      evidence: [
        `${sourceName}${result.date ? ` · ${result.date}` : ""}`,
        summary,
      ],
      freshness: {
        observedAt,
        status: "fresh",
      },
      confidence: {
        score: confidenceScore,
        basis: "TinyFish Search API live public-web result",
      },
    };
  });
}

function classifyPublicUpdateSeverity(text) {
  return /\b(cancel(?:ed|led|lation)?|closed|severe|storm|disrupt|delay|congestion|overcrowd|queue)\b/i.test(text)
    ? "critical"
    : "watch";
}

function stableToken(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.length > 0) ?? "";
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}
