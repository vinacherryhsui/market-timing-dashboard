import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDgbasClient, DgbasClientError } from "../src/data/dgbas/DgbasClient.js";
import { createEiaClient, EiaClientError } from "../src/data/eia/EiaClient.js";
import { getIndicatorSourceConfigs } from "../src/data/acquisition/indicatorSources.js";

const COLUMNS = ["source", "series/dataset", "latestDate", "latestValue", "units", "frequency"];

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
  const widths = Object.fromEntries(
    COLUMNS.map((column) => [column, Math.max(column.length, ...rows.map((row) => String(row[column]).length))]),
  );
  const render = (row) => COLUMNS.map((column) => String(row[column]).padEnd(widths[column])).join(" | ");
  console.log(render(Object.fromEntries(COLUMNS.map((column) => [column, column]))));
  console.log(COLUMNS.map((column) => "-".repeat(widths[column])).join("-+-"));
  for (const row of rows) console.log(render(row));
}

function toRow(observation) {
  return {
    source: observation.provider,
    "series/dataset": observation.datasetId,
    latestDate: observation.observationDate,
    latestValue: observation.value,
    units: observation.unit ?? "N/A",
    frequency: observation.frequency ?? "N/A",
  };
}

await loadRootEnv();

const rows = [];
const failures = [];
const checks = [
  {
    source: "DGBAS",
    run: () => createDgbasClient().getLatestObservation(getIndicatorSourceConfigs("taiwan_cpi")[0]),
  },
  {
    source: "EIA",
    run: () => createEiaClient().getLatestObservation(getIndicatorSourceConfigs("eia_crude_inventories")[0]),
  },
];

for (const check of checks) {
  try {
    rows.push(toRow(await check.run()));
  } catch (error) {
    const isKnown = error instanceof DgbasClientError || error instanceof EiaClientError;
    failures.push(`${check.source}\tERROR\t${isKnown ? error.code : "UNEXPECTED_ERROR"}: ${error.message}`);
  }
}

if (rows.length > 0) printTable(rows);
for (const failure of failures) console.error(failure);
if (failures.length > 0) process.exitCode = 1;
