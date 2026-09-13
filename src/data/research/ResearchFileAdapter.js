import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { createRawObservation, RawObservationStatus } from "../acquisition/RawObservation.js";

const DEFAULT_CACHE_DIR = fileURLToPath(new URL("../../../data/cache/research/", import.meta.url));

export class ResearchFileError extends Error {
  constructor(message, { code = "RESEARCH_FILE_ERROR", status = null, cause } = {}) {
    super(message, { cause });
    this.name = "ResearchFileError";
    this.code = code;
    this.status = status;
  }
}

function requireConfig(config) {
  const required = ["indicatorId", "provider", "datasetId", "endpoint", "format", "sheet", "valueColumn"];
  const missing = required.filter((key) => !config?.[key]);
  if (!config?.dateColumn && !(config?.yearColumn && config?.monthColumn)) missing.push("dateColumn or yearColumn+monthColumn");
  if (missing.length > 0) {
    throw new ResearchFileError(`Periodic-file config is missing: ${missing.join(", ")}.`, {
      code: "RESEARCH_FILE_INVALID_CONFIG",
    });
  }
}

function normalizeValue(value) {
  if (value === null || value === undefined || value === "" || value === ".") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function monthlyDateFromParts(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
}

function normalizeMonthlyDate(value) {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? monthlyDateFromParts(parsed.y, parsed.m) : null;
  }
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return monthlyDateFromParts(value.getUTCFullYear(), value.getUTCMonth() + 1);
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const ymd = /^(\d{4})[-/]?(\d{1,2})(?:[-/]\d{1,2})?$/.exec(value.trim());
  if (ymd) return monthlyDateFromParts(ymd[1], ymd[2]);
  const parsed = new Date(`${value.trim()} UTC`);
  return Number.isNaN(parsed.valueOf()) ? null : monthlyDateFromParts(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1);
}

function parseWorkbook(buffer, config) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  } catch (error) {
    throw new ResearchFileError(`Could not parse ${config.datasetId} as a workbook: ${error.message}`, {
      code: "RESEARCH_FILE_PARSE_ERROR", cause: error,
    });
  }
  const sheet = workbook.Sheets[config.sheet];
  if (!sheet) {
    throw new ResearchFileError(`Worksheet ${config.sheet} was not found in ${config.datasetId}.`, {
      code: "RESEARCH_FILE_SCHEMA_MISMATCH",
    });
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const requiredHeaders = [config.valueColumn, ...(config.dateColumn ? [config.dateColumn] : [config.yearColumn, config.monthColumn])];
  const headerIndex = rows.findIndex((row) => requiredHeaders.every((header) => row.includes(header)));
  if (headerIndex < 0) {
    throw new ResearchFileError(`Required columns were not found in ${config.datasetId}: ${requiredHeaders.join(", ")}.`, {
      code: "RESEARCH_FILE_SCHEMA_MISMATCH",
    });
  }
  const headers = rows[headerIndex];
  const columnIndex = Object.fromEntries(requiredHeaders.map((header) => [header, headers.indexOf(header)]));
  const parsed = rows.slice(headerIndex + 1).map((row) => ({
    observationDate: config.dateColumn
      ? normalizeMonthlyDate(row[columnIndex[config.dateColumn]])
      : monthlyDateFromParts(row[columnIndex[config.yearColumn]], row[columnIndex[config.monthColumn]]),
    value: normalizeValue(row[columnIndex[config.valueColumn]]),
  })).filter((row) => row.observationDate);

  const firstValid = parsed.findIndex((row) => row.value !== null);
  const lastValid = parsed.findLastIndex((row) => row.value !== null);
  if (firstValid < 0) {
    throw new ResearchFileError(`${config.datasetId} contains no valid observations.`, {
      code: "RESEARCH_FILE_EMPTY_RESULTS",
    });
  }
  return parsed.slice(firstValid, lastValid + 1).map((row) => ({
    ...row,
    status: row.value === null ? RawObservationStatus.MISSING : RawObservationStatus.VALID,
  }));
}

export function selectLatestValidObservation(observations) {
  const latest = observations
    .filter((item) => item.status === RawObservationStatus.VALID && item.value !== null && item.observationDate)
    .sort((left, right) => right.observationDate.localeCompare(left.observationDate))[0];
  if (!latest) {
    throw new ResearchFileError("Historical series contains no valid observation.", {
      code: "RESEARCH_FILE_NO_VALID_OBSERVATION",
    });
  }
  return latest;
}

export class ResearchFileAdapter {
  constructor({ fetchImpl = globalThis.fetch, cacheDir = DEFAULT_CACHE_DIR, now = () => new Date() } = {}) {
    if (typeof fetchImpl !== "function") {
      throw new ResearchFileError("No fetch implementation is available.", { code: "RESEARCH_FILE_FETCH_UNAVAILABLE" });
    }
    this.fetchImpl = fetchImpl;
    this.cacheDir = cacheDir;
    this.now = now;
  }

  cachePath(config) {
    return resolve(this.cacheDir, `${config.indicatorId}.json`);
  }

  async download(config) {
    requireConfig(config);
    let response;
    try {
      response = await this.fetchImpl(config.endpoint);
    } catch (error) {
      throw new ResearchFileError(`${config.provider} download failed: ${error.message}`, {
        code: "RESEARCH_FILE_NETWORK_ERROR", cause: error,
      });
    }
    if (!response.ok) {
      throw new ResearchFileError(`${config.provider} download failed with HTTP ${response.status}.`, {
        code: "RESEARCH_FILE_HTTP_ERROR", status: response.status,
      });
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async fetchHistoricalSeries(config) {
    const buffer = await this.download(config);
    const retrievedAt = this.now().toISOString();
    const observations = parseWorkbook(buffer, config);
    return {
      indicatorId: config.indicatorId,
      provider: config.provider,
      datasetId: config.datasetId,
      source: config.endpoint,
      frequency: config.frequency,
      unit: config.unit,
      retrievedAt,
      metadata: { ...config.metadata, acquisitionMode: "PERIODIC_FILE", sheet: config.sheet, valueColumn: config.valueColumn },
      observations,
    };
  }

  async writeCacheSafely(config, series) {
    const target = this.cachePath(config);
    const temporary = `${target}.${process.pid}.tmp`;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(temporary, `${JSON.stringify(series, null, 2)}\n`, "utf8");
    await rename(temporary, target);
    return target;
  }

  async sync(config) {
    const series = await this.fetchHistoricalSeries(config);
    await this.writeCacheSafely(config, series);
    return series;
  }

  async readCache(config) {
    try {
      return JSON.parse(await readFile(this.cachePath(config), "utf8"));
    } catch (error) {
      throw new ResearchFileError(`Could not read cache for ${config.indicatorId}: ${error.message}`, {
        code: error.code === "ENOENT" ? "RESEARCH_CACHE_NOT_FOUND" : "RESEARCH_CACHE_READ_ERROR", cause: error,
      });
    }
  }

  async getLatestObservation(config) {
    const series = await this.readCache(config);
    const latest = selectLatestValidObservation(series.observations ?? []);
    return createRawObservation({
      provider: series.provider,
      datasetId: series.datasetId,
      indicatorId: series.indicatorId,
      observationDate: latest.observationDate,
      value: latest.value,
      unit: series.unit,
      frequency: series.frequency,
      retrievedAt: series.retrievedAt,
      status: latest.status,
      metadata: series.metadata,
    });
  }

  async getHistory(config) {
    const series = await this.readCache(config);
    return {
      ...series,
      observations: (series.observations ?? []).map((observation) => createRawObservation({
        provider: series.provider,
        datasetId: series.datasetId,
        indicatorId: series.indicatorId,
        observationDate: observation.observationDate,
        value: observation.value,
        unit: series.unit,
        frequency: series.frequency,
        retrievedAt: series.retrievedAt,
        status: observation.status,
        metadata: series.metadata,
      })),
    };
  }
}
