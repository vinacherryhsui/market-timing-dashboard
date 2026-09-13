import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { activeIndicatorSources } from "../src/data/acquisition/indicatorSources.js";
import { DgbasAdapter } from "../src/data/dgbas/DgbasClient.js";
import { FredAdapter } from "../src/data/fred/FredClient.js";
import { ResearchFileAdapter } from "../src/data/research/ResearchFileAdapter.js";
import { buildTransformedHistory } from "../src/domain/transformations/TransformedHistoryService.js";
import { activeTransformationRegistry } from "../src/domain/transformations/transformationRegistry.js";

const dataRoot = resolve(import.meta.dirname, "data");
const rawDir = resolve(dataRoot, "raw");
const transformedDir = resolve(dataRoot, "transformed");
const monthlyDir = resolve(dataRoot, "monthly");
const entryKey = (source) => source.role ? `${source.indicatorId}:${source.role}` : source.indicatorId;
const safeName = (entryId) => entryId.replace(/[^a-zA-Z0-9_.-]/g, "__");
const valid = (items) => items.filter((item) => item.status === "VALID" && Number.isFinite(item.value) && /^\d{4}-\d{2}-\d{2}$/.test(item.observationDate));

async function fetchFredCsv(source) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(source.datasetId)}`;
  const response = await fetch(url, { headers: { Accept: "text/csv" } });
  if (!response.ok) throw new Error(`FRED CSV request failed with HTTP ${response.status}.`);
  const retrievedAt = new Date().toISOString();
  const observations = (await response.text()).trim().split(/\r?\n/).slice(1).map((row) => {
    const comma = row.indexOf(",");
    const observationDate = row.slice(0, comma);
    const rawValue = row.slice(comma + 1).trim();
    const value = rawValue === "." || rawValue === "" ? null : Number(rawValue);
    return { provider: "FRED", datasetId: source.datasetId, indicatorId: source.indicatorId, observationDate, value: Number.isFinite(value) ? value : null, unit: source.unit ?? null, frequency: source.frequency ?? null, retrievedAt, status: Number.isFinite(value) ? "VALID" : "MISSING", metadata: { role: source.role ?? null, sourceUrl: url, retrievalMode: "PUBLIC_CSV" } };
  });
  if (!valid(observations).length) throw new Error("FRED public CSV returned no valid observations.");
  return { provider: "FRED", datasetId: source.datasetId, indicatorId: source.indicatorId, retrievedAt, source: url, observations };
}

async function retrieve(source, fred) {
  if (source.provider === "FRED") {
    if (fred) return { series: await fred.getHistory(source, { requiredPeriods: 1, safetyBuffer: 0, frequency: source.frequency, maxHistory: true }), retrievalMode: "FRED_API" };
    return { series: await fetchFredCsv(source), retrievalMode: "FRED_PUBLIC_CSV" };
  }
  if (source.provider === "DGBAS") return { series: await new DgbasAdapter().getHistory(source), retrievalMode: "DGBAS_XML" };
  if (source.acquisitionMode === "PERIODIC_FILE") return { series: await new ResearchFileAdapter({ cacheDir: resolve(dataRoot, "unused") }).fetchHistoricalSeries(source), retrievalMode: "RESEARCH_FILE_DOWNLOAD" };
  throw new Error(`Unsupported active provider/configuration: ${source.provider}.`);
}

function monthRange(start, end) {
  const result = []; let year = Number(start.slice(0, 4)); let month = Number(start.slice(5, 7)); const endKey = end.slice(0, 7);
  while (`${year}-${String(month).padStart(2, "0")}` <= endKey) { result.push(`${year}-${String(month).padStart(2, "0")}`); month += 1; if (month === 13) { month = 1; year += 1; } }
  return result;
}

function toMonthly(points, frequency) {
  const sorted = [...points].sort((a, b) => a.observationDate.localeCompare(b.observationDate));
  if (frequency === "QUARTERLY") {
    const expanded = [];
    for (const point of sorted) {
      const base = new Date(`${point.observationDate}T00:00:00Z`);
      for (let offset = 0; offset < 3; offset += 1) {
        const date = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1)).toISOString().slice(0, 10);
        expanded.push({ ...point, observationDate: date, sourceObservationDate: point.observationDate, monthlyNormalization: "QUARTERLY_FORWARD_FILL" });
      }
    }
    return [...new Map(expanded.map((item) => [item.observationDate.slice(0, 7), item])).values()];
  }
  const byMonth = new Map();
  for (const point of sorted) byMonth.set(point.observationDate.slice(0, 7), { ...point, sourceObservationDate: point.observationDate, observationDate: `${point.observationDate.slice(0, 7)}-01`, monthlyNormalization: frequency === "DAILY" ? "LAST_TRANSFORMED_OBSERVATION_IN_MONTH" : "AS_REPORTED_MONTHLY" });
  return [...byMonth.values()];
}

function csvCell(value) { const valueText = value == null ? "" : String(value); return /[",\n]/.test(valueText) ? `"${valueText.replaceAll('"', '""')}"` : valueText; }

await Promise.all([rawDir, transformedDir, monthlyDir].map((path) => mkdir(path, { recursive: true })));
const sources = new Map(activeIndicatorSources.map((source) => [entryKey(source), source]));
const fred = process.env.FRED_API_KEY ? new FredAdapter() : null;
const coverage = []; const combined = {};
for (const entry of activeTransformationRegistry) {
  const source = sources.get(entry.id); const row = { entryId: entry.id, provider: source?.provider ?? null, datasetId: source?.datasetId ?? null };
  try {
    if (!source) throw new Error("Missing active source configuration.");
    const { series, retrievalMode } = await retrieve(source, fred); const observations = valid(series.observations ?? []);
    const transformed = buildTransformedHistory(entry, observations); const monthly = toMonthly(transformed, entry.transformation.frequency);
    if (!transformed.length || !monthly.length) throw new Error("Transformation produced no research observations.");
    const expected = monthRange(monthly[0].observationDate, monthly.at(-1).observationDate); const actual = new Set(monthly.map((item) => item.observationDate.slice(0, 7))); const missing = expected.filter((month) => !actual.has(month));
    const name = safeName(entry.id);
    await writeFile(resolve(rawDir, `${name}.json`), `${JSON.stringify({ ...series, observations }, null, 2)}\n`);
    await writeFile(resolve(transformedDir, `${name}.json`), `${JSON.stringify({ entryId: entry.id, frequency: entry.transformation.frequency, points: transformed }, null, 2)}\n`);
    await writeFile(resolve(monthlyDir, `${name}.json`), `${JSON.stringify({ entryId: entry.id, frequency: "MONTHLY", points: monthly }, null, 2)}\n`);
    Object.assign(row, { status: "OK", retrievalMode, rawStart: observations[0].observationDate, rawEnd: observations.at(-1).observationDate, rawObservations: observations.length, transformedStart: transformed[0].observationDate, transformedEnd: transformed.at(-1).observationDate, transformedObservations: transformed.length, monthlyStart: monthly[0].observationDate, monthlyEnd: monthly.at(-1).observationDate, monthlyObservations: monthly.length, missingMonths: missing.length, missingPeriods: missing.join(";") });
    combined[entry.id] = { frequency: "MONTHLY", sourcePath: resolve(monthlyDir, `${name}.json`), rawObservationCount: observations.length, transformedObservationCount: transformed.length, monthlyObservationCount: monthly.length, points: monthly };
  } catch (error) { Object.assign(row, { status: "ERROR", error: error.message }); }
  coverage.push(row);
}
const sets = coverage.filter((row) => row.status === "OK").map((row) => new Set(combined[row.entryId].points.map((point) => point.observationDate.slice(0, 7))));
let commonMonths = sets.length ? [...sets[0]].filter((month) => sets.every((set) => set.has(month))).sort() : [];
if (coverage.some((row) => row.status !== "OK")) commonMonths = [];
const report = { generatedAt: new Date().toISOString(), activeIndicatorCount: coverage.length, successfulIndicatorCount: coverage.filter((row) => row.status === "OK").length, commonSample: commonMonths.length ? { start: commonMonths[0], end: commonMonths.at(-1), observations: commonMonths.length } : null, monthlyNormalization: { DAILY: "last transformed observation in each calendar month", MONTHLY: "as reported", QUARTERLY: "carry each reported transformed observation through its three-month quarter" }, coverage };
await writeFile(resolve(dataRoot, "transformed_histories.json"), `${JSON.stringify(combined, null, 2)}\n`); await writeFile(resolve(dataRoot, "coverage.json"), `${JSON.stringify(report, null, 2)}\n`);
const columns = ["entryId", "provider", "datasetId", "status", "retrievalMode", "rawStart", "rawEnd", "rawObservations", "transformedStart", "transformedEnd", "transformedObservations", "monthlyStart", "monthlyEnd", "monthlyObservations", "missingMonths", "missingPeriods", "error"];
await writeFile(resolve(dataRoot, "coverage.csv"), `${columns.join(",")}\n${coverage.map((row) => columns.map((key) => csvCell(row[key])).join(",")).join("\n")}\n`);
console.table(coverage.map(({ entryId, provider, status, rawStart, rawEnd, transformedStart, transformedEnd, monthlyObservations, missingMonths, error }) => ({ entryId, provider, status, rawStart, rawEnd, transformedStart, transformedEnd, monthlyObservations, missingMonths, error })));
console.log(`Research data: ${dataRoot}`); console.log(`Common 21-indicator sample: ${report.commonSample ? `${report.commonSample.start} to ${report.commonSample.end} (${report.commonSample.observations})` : "unavailable"}`);
if (report.successfulIndicatorCount !== report.activeIndicatorCount) process.exitCode = 2;
