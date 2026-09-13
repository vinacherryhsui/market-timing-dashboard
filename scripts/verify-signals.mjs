import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { FredAdapter } from "../src/data/fred/FredClient.js";
import { DgbasAdapter } from "../src/data/dgbas/DgbasClient.js";
import { ResearchFileAdapter } from "../src/data/research/ResearchFileAdapter.js";
import { HistoryCache } from "../src/data/acquisition/HistoryCache.js";
import { indicatorSources } from "../src/data/acquisition/indicatorSources.js";
import { HistoryPreparationService } from "../src/domain/history/HistoryPreparationService.js";
import { SignalEngine } from "../src/domain/signals/SignalEngine.js";
import { SignalEvaluationService } from "../src/domain/signals/SignalEvaluationService.js";
import { getSignalRule } from "../src/domain/signals/signalRuleRegistry.js";
import { activeTransformationRegistry } from "../src/domain/transformations/transformationRegistry.js";
import { buildQuickInfo, QUICK_INFO_FALLBACK } from "../src/features/dashboard/quickInfoFormatter.js";

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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function display(value) {
  if (value === null || value === undefined) return "N/A";
  return typeof value === "object" ? JSON.stringify(value) : Number(value).toFixed(4);
}

function printTable(rows) {
  const columns = ["indicatorEntry", "signal", "transformedAvailable", "observationPeriodAvailable", "sourceAvailable", "interpretationGenerated", "fallbackUsed"];
  const widths = Object.fromEntries(columns.map((column) => [column, Math.max(column.length, ...rows.map((row) => String(row[column]).length))]));
  const render = (row) => columns.map((column) => String(row[column]).padEnd(widths[column])).join(" | ");
  console.log(render(Object.fromEntries(columns.map((column) => [column, column]))));
  console.log(columns.map((column) => "-".repeat(widths[column])).join("-+-"));
  rows.forEach((row) => console.log(render(row)));
}

await loadRootEnv();
const research = new ResearchFileAdapter();
const historyPreparation = new HistoryPreparationService({
  adapters: { FRED: new FredAdapter(), DGBAS: new DgbasAdapter(), CALDARA_IACOVIELLO: research, POLICY_UNCERTAINTY: research, NY_FED: research },
  sourceConfigs: indicatorSources,
  historyCache: new HistoryCache(),
});
const evaluation = new SignalEvaluationService({ historyPreparation, signalEngine: new SignalEngine(), resolveRule: getSignalRule });
const rows = [];
for (const entry of activeTransformationRegistry) {
  const result = await evaluation.evaluate(entry);
  const observationDate = result.history?.latestObservationDate ?? null;
  const quickInfo = buildQuickInfo(entry.id, result.signal, { observationDate });
  rows.push({
    indicatorEntry: entry.id,
    signal: result.signal.color,
    transformedAvailable: display(result.signal.transformedValue) !== "N/A",
    observationPeriodAvailable: quickInfo.date !== "Unavailable",
    sourceAvailable: !/unavailable/i.test(quickInfo.source),
    interpretationGenerated: quickInfo.interpretation !== QUICK_INFO_FALLBACK,
    fallbackUsed: quickInfo.interpretation === QUICK_INFO_FALLBACK,
  });
  if (result.signal.color === "UNKNOWN") console.error(`${entry.id}\tUNKNOWN\t${result.signal.reason}`);
}
printTable(rows);
if (rows.some((row) => row.signal === "UNKNOWN")) process.exitCode = 2;
