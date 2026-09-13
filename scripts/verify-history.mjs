import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { FredAdapter } from "../src/data/fred/FredClient.js";
import { DgbasAdapter } from "../src/data/dgbas/DgbasClient.js";
import { ResearchFileAdapter } from "../src/data/research/ResearchFileAdapter.js";
import { HistoryCache } from "../src/data/acquisition/HistoryCache.js";
import { indicatorSources } from "../src/data/acquisition/indicatorSources.js";
import { HistoryPreparationService } from "../src/domain/history/HistoryPreparationService.js";
import { activeTransformationRegistry } from "../src/domain/transformations/transformationRegistry.js";

async function loadRootEnv() {
  try {
    const text = await readFile(resolve(process.cwd(), ".env"), "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      if (process.env[key]) continue;
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function printTable(rows) {
  const columns = ["entry", "ready", "latestDate", "contiguous", "required", "frequency", "cacheStatus"];
  const widths = Object.fromEntries(columns.map((column) => [
    column, Math.max(column.length, ...rows.map((row) => String(row[column]).length)),
  ]));
  const render = (row) => columns.map((column) => String(row[column]).padEnd(widths[column])).join(" | ");
  console.log(render(Object.fromEntries(columns.map((column) => [column, column]))));
  console.log(columns.map((column) => "-".repeat(widths[column])).join("-+-"));
  for (const row of rows) console.log(render(row));
}

await loadRootEnv();
const research = new ResearchFileAdapter();
const service = new HistoryPreparationService({
  adapters: {
    FRED: new FredAdapter(),
    DGBAS: new DgbasAdapter(),
    CALDARA_IACOVIELLO: research,
    POLICY_UNCERTAINTY: research,
    NY_FED: research,
  },
  sourceConfigs: indicatorSources,
  historyCache: new HistoryCache(),
});

const rows = [];
for (const entry of activeTransformationRegistry) {
  const result = await service.prepare(entry);
  rows.push({
    entry: entry.id,
    ready: result.ready,
    latestDate: result.latestObservationDate ?? "N/A",
    contiguous: result.contiguousPeriods,
    required: result.requiredPeriods,
    frequency: result.frequency,
    cacheStatus: result.cacheStatus,
  });
  if (!result.ready) console.error(`${entry.id}\tNOT_READY\t${result.reason}: ${result.error ?? result.missingPeriods.join(", ")}`);
}
printTable(rows);
if (rows.some((row) => !row.ready)) process.exitCode = 1;
