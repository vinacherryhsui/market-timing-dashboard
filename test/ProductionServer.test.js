import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createProductionServer } from "../src/server/createProductionServer.js";

async function startFixtureServer() {
  const root = await mkdtemp(join(tmpdir(), "market-dashboard-server-"));
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "index.html"), "<!doctype html><main>production dashboard</main>");
  await writeFile(join(root, "assets", "app.js"), "console.log('built asset')");
  const server = createProductionServer({
    distDir: root,
    dashboardSnapshot: async () => ({ grid: { configuredEntryIds: ["vix"] }, marketScore: { score: 1 } }),
    entryEvaluation: async (entryId) => ({ entry: { id: entryId }, signal: { color: "GREEN" } }),
    indicatorDetail: async (entryId) => ({ entryId, history: { status: "AVAILABLE" } }),
    logger: { error() {} },
  });
  await server.assertBuildExists();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("production server serves the Vite build and SPA fallback", async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);

  const home = await fetch(fixture.baseUrl);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /production dashboard/);
  const asset = await fetch(`${fixture.baseUrl}/assets/app.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("cache-control"), /immutable/);
  const spa = await fetch(`${fixture.baseUrl}/saved-layout`, { headers: { Accept: "text/html" } });
  assert.equal(spa.status, 200);
});

test("production server exposes dashboard and indicator-detail APIs", async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);

  const dashboard = await (await fetch(`${fixture.baseUrl}/api/dashboard`)).json();
  assert.deepEqual(dashboard.grid.configuredEntryIds, ["vix"]);
  const evaluation = await (await fetch(`${fixture.baseUrl}/api/dashboard?entryId=vix`)).json();
  assert.equal(evaluation.entry.id, "vix");
  const detail = await (await fetch(`${fixture.baseUrl}/api/indicator-detail?entryId=vix`)).json();
  assert.equal(detail.entryId, "vix");
  assert.equal(detail.history.status, "AVAILABLE");
});
