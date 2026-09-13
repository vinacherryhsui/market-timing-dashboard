import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  createDashboardSnapshot,
  createEntryEvaluation,
  createIndicatorDetail,
} from "./createDashboardSnapshot.js";

const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
});

function sendJson(response, statusCode, body, method = "GET") {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(method === "HEAD" ? undefined : payload);
}

async function serveFile(request, response, filePath) {
  const file = await stat(filePath);
  if (!file.isFile()) return false;

  response.writeHead(200, {
    "Content-Type": CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "Content-Length": file.size,
    "Cache-Control": filePath.includes(`${sep}assets${sep}`)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") {
    response.end();
    return true;
  }
  await pipeline(createReadStream(filePath), response);
  return true;
}

function safeStaticPath(distDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const target = resolve(distDir, decoded.replace(/^[/\\]+/, ""));
  return target === distDir || target.startsWith(`${distDir}${sep}`) ? target : null;
}

export function createProductionServer({
  distDir = resolve(process.cwd(), "dist"),
  dashboardSnapshot = createDashboardSnapshot,
  entryEvaluation = createEntryEvaluation,
  indicatorDetail = createIndicatorDetail,
  logger = console,
} = {}) {
  const absoluteDistDir = resolve(distDir);
  const indexPath = resolve(absoluteDistDir, "index.html");

  const server = createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      if (method !== "GET" && method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        return sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" }, method);
      }

      const url = new URL(request.url ?? "/", "http://localhost");
      if (url.pathname === "/api/dashboard") {
        try {
          const entryId = url.searchParams.get("entryId");
          return sendJson(response, 200, entryId
            ? await entryEvaluation(entryId)
            : await dashboardSnapshot(), method);
        } catch (error) {
          logger.error("Dashboard snapshot failed:", error);
          return sendJson(response, 503, { error: "CURRENT_SIGNALS_UNAVAILABLE" }, method);
        }
      }
      if (url.pathname === "/api/indicator-detail") {
        try {
          return sendJson(response, 200, await indicatorDetail(url.searchParams.get("entryId")), method);
        } catch (error) {
          logger.error("Indicator detail failed:", error);
          return sendJson(response, 503, { error: "INDICATOR_DETAIL_UNAVAILABLE" }, method);
        }
      }
      if (url.pathname.startsWith("/api/")) {
        return sendJson(response, 404, { error: "API_NOT_FOUND" }, method);
      }

      const staticPath = safeStaticPath(absoluteDistDir, url.pathname);
      if (!staticPath) return sendJson(response, 400, { error: "INVALID_PATH" }, method);
      try {
        if (await serveFile(request, response, staticPath)) return;
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "EISDIR") throw error;
      }

      const acceptsHtml = (request.headers.accept ?? "").includes("text/html");
      if (url.pathname === "/" || (acceptsHtml && !extname(url.pathname))) {
        await serveFile(request, response, indexPath);
        return;
      }
      sendJson(response, 404, { error: "NOT_FOUND" }, method);
    } catch (error) {
      logger.error("Production server request failed:", error);
      if (!response.headersSent) sendJson(response, 500, { error: "INTERNAL_SERVER_ERROR" });
      else response.destroy(error);
    }
  });

  server.assertBuildExists = () => access(indexPath);
  return server;
}
