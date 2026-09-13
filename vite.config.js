import { defineConfig, loadEnv } from "vite";
import { createDashboardSnapshot, createEntryEvaluation, createIndicatorDetail } from "./src/server/createDashboardSnapshot.js";

function dashboardApiPlugin() {
  const middleware = (server) => {
    server.middlewares.use("/api/dashboard", async (_request, response) => {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      try {
      const url = new URL(_request.url, "http://localhost");
      const entryId = url.searchParams.get("entryId");
      response.statusCode = 200;
      response.end(JSON.stringify(entryId ? await createEntryEvaluation(entryId) : await createDashboardSnapshot()));
      } catch (error) {
        console.error("Dashboard snapshot failed:", error);
        response.statusCode = 503;
        response.end(JSON.stringify({ error: "CURRENT_SIGNALS_UNAVAILABLE" }));
      }
    });
    server.middlewares.use("/api/indicator-detail", async (_request, response) => {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      try {
        const entryId = new URL(_request.url, "http://localhost").searchParams.get("entryId");
        response.end(JSON.stringify(await createIndicatorDetail(entryId)));
      } catch (error) {
        response.statusCode = 503;
        response.end(JSON.stringify({ error: "INDICATOR_DETAIL_UNAVAILABLE" }));
      }
    });
  };
  return { name: "dashboard-api", configureServer: middleware, configurePreviewServer: middleware };
}

export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(loaded)) process.env[key.replace(/^\uFEFF/, "")] = value;
  return { plugins: [dashboardApiPlugin()] };
});
