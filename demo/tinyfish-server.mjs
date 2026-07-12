import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_TINYFISH_SEARCH_QUERY,
  TinyFishSearchError,
  createTinyFishLiveUpdateProvider,
} from "../src/operational-database/tinyfishLiveProvider.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_PORT = 8000;

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
};

export function createTinyFishDemoApiHandler({
  env = process.env,
  fetcher = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  return async function handleTinyFishDemoApi(url) {
    const apiKey = env.TINYFISH_API_KEY;
    if (!apiKey) {
      return jsonResponse(503, {
        error: "missing-tinyfish-api-key",
        message: "Set TINYFISH_API_KEY before starting npm run demo:tinyfish.",
      });
    }

    try {
      const provider = createTinyFishLiveUpdateProvider({
        apiKey,
        fetcher,
        now,
        defaultQuery: env.TINYFISH_SEARCH_QUERY || DEFAULT_TINYFISH_SEARCH_QUERY,
      });
      const result = await provider.fetchPublicUpdates({
        snapshotId: url.searchParams.get("snapshotId"),
        zoneId: url.searchParams.get("zoneId") || "check-in-a",
        query: url.searchParams.get("query") || env.TINYFISH_SEARCH_QUERY || DEFAULT_TINYFISH_SEARCH_QUERY,
      });

      return jsonResponse(200, result);
    } catch (error) {
      if (error instanceof TinyFishSearchError) {
        return jsonResponse(error.status && error.status >= 400 ? error.status : 502, {
          error: error.code || "tinyfish-search-failed",
          message: error.message,
        });
      }
      return jsonResponse(500, {
        error: "tinyfish-demo-server-error",
        message: error.message,
      });
    }
  };
}

export function createTinyFishDemoServer({
  root = ROOT,
  env = process.env,
  fetcher = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  const handleApi = createTinyFishDemoApiHandler({ env, fetcher, now });

  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");

    if (url.pathname === "/api/tinyfish/public-context") {
      const apiResponse = await handleApi(url);
      writeJson(response, apiResponse.status, apiResponse.body);
      return;
    }

    serveStatic(root, url.pathname, response);
  });
}

function jsonResponse(status, body) {
  return { status, body };
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function serveStatic(root, requestPath, response) {
  try {
    const filePath = resolveStaticPath(root, requestPath);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      writeJson(response, 404, { error: "not-found" });
      return;
    }

    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    writeJson(response, 404, { error: "not-found" });
  }
}

function resolveStaticPath(root, requestPath) {
  const decodedPath = decodeURIComponent(requestPath === "/" ? "/index.html" : requestPath);
  const candidate = resolve(root, normalize(decodedPath).replace(/^([/\\])+/, ""));
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    throw new Error("path escapes static root");
  }
  return candidate;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const server = createTinyFishDemoServer();
  server.listen(port, () => {
    console.log(`Stratus TinyFish demo server listening on http://localhost:${port}/`);
  });
}
