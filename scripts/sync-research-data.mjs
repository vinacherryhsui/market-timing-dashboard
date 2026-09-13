import { ResearchFileAdapter, selectLatestValidObservation } from "../src/data/research/ResearchFileAdapter.js";
import { ResearchDataSync } from "../src/data/research/ResearchDataSync.js";
import { indicatorSources } from "../src/data/acquisition/indicatorSources.js";

const COLUMNS = [
  "indicatorId", "source", "observationCount", "firstObservationDate",
  "latestObservationDate", "latestValue", "lastSyncedAt", "cacheStatus",
];

function printTable(rows) {
  const widths = Object.fromEntries(COLUMNS.map((column) => [
    column, Math.max(column.length, ...rows.map((row) => String(row[column] ?? "").length)),
  ]));
  const render = (row) => COLUMNS.map((column) => String(row[column] ?? "").padEnd(widths[column])).join(" | ");
  console.log(render(Object.fromEntries(COLUMNS.map((column) => [column, column]))));
  console.log(COLUMNS.map((column) => "-".repeat(widths[column])).join("-+-"));
  for (const row of rows) console.log(render(row));
}

const configs = indicatorSources.filter((config) => config.acquisitionMode === "PERIODIC_FILE");
const adapter = new ResearchFileAdapter();
const adapters = Object.fromEntries([...new Set(configs.map((config) => config.provider))].map((provider) => [provider, adapter]));
const results = await new ResearchDataSync({ adapters, sourceConfigs: configs }).syncAll();
const rows = [];

for (const result of results) {
  const config = configs.find((item) => item.indicatorId === result.indicatorId);
  if (result.ok) {
    const latest = selectLatestValidObservation(result.series.observations);
    rows.push({
      indicatorId: result.indicatorId,
      source: result.series.provider,
      observationCount: result.series.observations.length,
      firstObservationDate: result.series.observations[0]?.observationDate ?? "N/A",
      latestObservationDate: latest.observationDate,
      latestValue: latest.value,
      lastSyncedAt: result.series.retrievedAt,
      cacheStatus: "SYNCED",
    });
  } else {
    let cacheStatus = "NO_CACHE";
    try {
      const previous = await adapter.readCache(config);
      const latest = selectLatestValidObservation(previous.observations ?? []);
      cacheStatus = "PREVIOUS_CACHE_RETAINED";
      rows.push({
        indicatorId: result.indicatorId,
        source: previous.provider,
        observationCount: previous.observations.length,
        firstObservationDate: previous.observations[0]?.observationDate ?? "N/A",
        latestObservationDate: latest.observationDate,
        latestValue: latest.value,
        lastSyncedAt: previous.retrievedAt,
        cacheStatus,
      });
    } catch {}
    console.error(`${result.indicatorId}\tERROR\t${result.error}\tcacheStatus=${cacheStatus}`);
  }
}

if (rows.length > 0) printTable(rows);
if (results.some((result) => !result.ok)) process.exitCode = 1;
