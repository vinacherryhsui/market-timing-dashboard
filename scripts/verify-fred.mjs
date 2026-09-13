import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createFredClient, FredClientError } from "../src/data/fred/FredClient.js";
import { indicatorSources } from "../src/data/acquisition/indicatorSources.js";

const SERIES_CONFIGS = indicatorSources.filter((config) => config.provider === "FRED");

const TABLE_COLUMNS = ["indicatorId", "seriesId", "latestDate", "latestValue", "units", "frequency"];

function printTable(rows) {
  const widths = Object.fromEntries(
    TABLE_COLUMNS.map((column) => [
      column,
      Math.max(column.length, ...rows.map((row) => String(row[column]).length)),
    ]),
  );
  const renderRow = (row) =>
    TABLE_COLUMNS.map((column) => String(row[column]).padEnd(widths[column])).join(" | ");
  const separator = TABLE_COLUMNS.map((column) => "-".repeat(widths[column])).join("-+-");

  console.log(renderRow(Object.fromEntries(TABLE_COLUMNS.map((column) => [column, column]))));
  console.log(separator);
  for (const row of rows) console.log(renderRow(row));
}

async function loadRootEnv() {
  if (process.env.FRED_API_KEY) return;

  try {
    const envText = await readFile(resolve(process.cwd(), ".env"), "utf8");
    for (const rawLine of envText.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const separatorIndex = line.indexOf("=");
      if (separatorIndex < 1) continue;

      const key = line.slice(0, separatorIndex).trim();
      if (key !== "FRED_API_KEY") continue;

      let value = line.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env.FRED_API_KEY = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

await loadRootEnv();

try {
  const client = createFredClient();
  const rows = [];
  const failures = [];

  for (const config of SERIES_CONFIGS) {
    try {
      const latest = await client.getLatestObservation(config);
      rows.push({
        indicatorId: latest.indicatorId,
        seriesId: latest.datasetId,
        latestDate: latest.observationDate,
        latestValue: latest.value,
        units: latest.unit ?? "N/A",
        frequency: latest.frequency ?? "N/A",
      });
    } catch (error) {
      const code = error instanceof FredClientError ? error.code : "UNEXPECTED_ERROR";
      failures.push(`${config.datasetId}\tERROR\t${code}: ${error.message}`);
    }
  }

  if (rows.length > 0) printTable(rows);
  for (const failure of failures) console.error(failure);
  if (failures.length > 0) process.exitCode = 1;
} catch (error) {
  const code = error instanceof FredClientError ? error.code : "UNEXPECTED_ERROR";
  console.error(`${code}: ${error.message}`);
  process.exitCode = 1;
}
