import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TINYFISH_SEARCH_QUERY,
  TinyFishSearchError,
  createTinyFishLiveUpdateProvider,
} from "../src/operational-database/tinyfishLiveProvider.js";
import { createTinyFishDemoApiHandler } from "../demo/tinyfish-server.mjs";

test("tinyfish live provider calls Search API with server-side key and maps results", async () => {
  const calls = [];
  const provider = createTinyFishLiveUpdateProvider({
    apiKey: "test-api-key",
    now: () => new Date("2026-07-11T09:22:00+07:00"),
    fetcher: async (url, options) => {
      calls.push({ url: new URL(url), options });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            query: DEFAULT_TINYFISH_SEARCH_QUERY,
            total_results: 1,
            page: 0,
            results: [
              {
                position: 1,
                site_name: "Vietnam Aviation News",
                publisher: "Vietnam Aviation News",
                title: "Tan Son Nhat warns of passenger congestion after weather delays",
                snippet: "Airport operators reported queues and delayed departures after storms disrupted several flights.",
                url: "https://news.example.test/tan-son-nhat-congestion",
                date: "2026-07-11",
              },
            ],
          };
        },
      };
    },
  });

  const result = await provider.fetchPublicUpdates({
    snapshotId: "fixture-peak-2026-07-11T09:20:00+07:00",
    zoneId: "check-in-a",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, "https://api.search.tinyfish.ai");
  assert.equal(calls[0].url.searchParams.get("query"), DEFAULT_TINYFISH_SEARCH_QUERY);
  assert.equal(calls[0].url.searchParams.get("location"), "VN");
  assert.equal(calls[0].url.searchParams.get("language"), "en");
  assert.equal(calls[0].url.searchParams.get("domain_type"), "news");
  assert.equal(calls[0].options.headers["X-API-Key"], "test-api-key");

  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].snapshotId, "fixture-peak-2026-07-11T09:20:00+07:00");
  assert.equal(result.updates[0].zoneId, "check-in-a");
  assert.equal(result.updates[0].severity, "critical");
  assert.equal(result.updates[0].observedAt, "2026-07-11T02:22:00.000Z");
  assert.equal(result.updates[0].title, "Tan Son Nhat warns of passenger congestion after weather delays");
  assert.ok(result.updates[0].evidence.some((item) => item.includes("Vietnam Aviation News")));
  assert.equal(result.meta.totalResults, 1);
});

test("tinyfish live provider fails safely when API key is missing", async () => {
  const provider = createTinyFishLiveUpdateProvider({
    apiKey: "",
    fetcher: async () => {
      throw new Error("fetch should not be called without a key");
    },
  });

  await assert.rejects(
    () => provider.fetchPublicUpdates({ snapshotId: "fixture-peak", zoneId: "check-in-a" }),
    /TINYFISH_API_KEY/,
  );
});

test("tinyfish demo API handler degrades without a browser resource error when key is missing", async () => {
  const handler = createTinyFishDemoApiHandler({
    env: {},
    fetcher: async () => {
      throw new Error("fetch should not be called without a key");
    },
  });
  const response = await handler(new URL("http://localhost:8000/api/tinyfish/public-context?snapshotId=fixture-peak"));

  assert.equal(response.status, 200);
  assert.equal(response.body.error, "missing-tinyfish-api-key");
  assert.equal(response.body.unavailable, true);
  assert.deepEqual(response.body.updates, []);
  assert.equal(JSON.stringify(response.body).includes("test-api-key"), false);
});

test("tinyfish demo API handler returns normalized live updates", async () => {
  const handler = createTinyFishDemoApiHandler({
    env: { TINYFISH_API_KEY: "test-api-key" },
    now: () => new Date("2026-07-11T09:22:00+07:00"),
    fetcher: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          query: DEFAULT_TINYFISH_SEARCH_QUERY,
          total_results: 1,
          page: 0,
          results: [
            {
              position: 1,
              site_name: "Airport Brief",
              title: "Ho Chi Minh flight disruption update",
              snippet: "Passengers should expect delays near check-in counters.",
              url: "https://news.example.test/airport-brief",
            },
          ],
        };
      },
    }),
  });

  const response = await handler(new URL("http://localhost:8000/api/tinyfish/public-context?snapshotId=fixture-peak"));

  assert.equal(response.status, 200);
  assert.equal(response.body.updates.length, 1);
  assert.equal(response.body.updates[0].zoneId, "check-in-a");
  assert.equal(response.body.updates[0].summary, "Passengers should expect delays near check-in counters.");
  assert.equal(response.body.meta.query, DEFAULT_TINYFISH_SEARCH_QUERY);
});
