import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import XLSX from "xlsx";
import { ResearchFileAdapter, selectLatestValidObservation } from "../src/data/research/ResearchFileAdapter.js";
import { ResearchDataSync } from "../src/data/research/ResearchDataSync.js";

function workbookResponse(rows, sheet = "Data") {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheet);
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new Response(buffer, { status: 200 });
}

const config = {
  indicatorId: "sample", provider: "OFFICIAL", datasetId: "SAMPLE",
  acquisitionMode: "PERIODIC_FILE", endpoint: "https://official.test/sample.xlsx",
  format: "excel", sheet: "Data", yearColumn: "Year", monthColumn: "Month",
  valueColumn: "Index", frequency: "Monthly", unit: "Index",
};

test("parses and preserves a complete historical monthly series", async () => {
  const adapter = new ResearchFileAdapter({
    fetchImpl: async () => workbookResponse([["Year", "Month", "Index"], [2025, 1, 10], [2025, 2, null], [2025, 3, 12]]),
    now: () => new Date("2026-09-02T00:00:00.000Z"),
  });
  const series = await adapter.fetchHistoricalSeries(config);
  assert.deepEqual(series.observations, [
    { observationDate: "2025-01-01", value: 10, status: "VALID" },
    { observationDate: "2025-02-01", value: null, status: "MISSING" },
    { observationDate: "2025-03-01", value: 12, status: "VALID" },
  ]);
  assert.equal(series.retrievedAt, "2026-09-02T00:00:00.000Z");
  assert.notEqual(series.observations[2].observationDate, series.retrievedAt);
});

test("selects latest valid historical observation", () => {
  const latest = selectLatestValidObservation([
    { observationDate: "2025-02-01", value: null, status: "MISSING" },
    { observationDate: "2025-01-01", value: 7, status: "VALID" },
  ]);
  assert.equal(latest.observationDate, "2025-01-01");
  assert.equal(latest.value, 7);
});

test("failed synchronization preserves the previous cache", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "research-cache-"));
  try {
    const cachePath = join(cacheDir, "sample.json");
    await writeFile(cachePath, '{"previous":true}\n', "utf8");
    const adapter = new ResearchFileAdapter({
      cacheDir,
      fetchImpl: async () => { throw new Error("offline"); },
    });
    await assert.rejects(adapter.sync(config), (error) => error.code === "RESEARCH_FILE_NETWORK_ERROR");
    assert.equal(await readFile(cachePath, "utf8"), '{"previous":true}\n');
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test("one provider failure does not prevent remaining synchronization", async () => {
  const calls = [];
  const sync = new ResearchDataSync({
    adapters: {
      FAIL: { sync: async () => { throw Object.assign(new Error("download failed"), { code: "NETWORK" }); } },
      OK: { sync: async (item) => { calls.push(item.indicatorId); return { observations: [] }; } },
    },
    sourceConfigs: [
      { indicatorId: "first", provider: "FAIL", acquisitionMode: "PERIODIC_FILE" },
      { indicatorId: "second", provider: "OK", acquisitionMode: "PERIODIC_FILE" },
    ],
  });
  const results = await sync.syncAll();
  assert.deepEqual(calls, ["second"]);
  assert.equal(results[0].ok, false);
  assert.equal(results[1].ok, true);
});
