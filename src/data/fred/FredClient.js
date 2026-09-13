import { createRawObservation } from "../acquisition/RawObservation.js";

const DEFAULT_BASE_URL = "https://api.stlouisfed.org/fred";

export class FredClientError extends Error {
  constructor(message, { code, status, cause } = {}) {
    super(message, { cause });
    this.name = "FredClientError";
    this.code = code ?? "FRED_ERROR";
    this.status = status ?? null;
  }
}

function requireSeriesId(seriesId) {
  if (typeof seriesId !== "string" || seriesId.trim() === "") {
    throw new FredClientError("A non-empty FRED series ID is required.", {
      code: "FRED_INVALID_SERIES_ID",
    });
  }

  return seriesId.trim();
}

function normalizeValue(value) {
  if (value === "." || value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMetadata(series) {
  return {
    seriesId: series.id,
    title: series.title ?? null,
    observationStart: series.observation_start ?? null,
    observationEnd: series.observation_end ?? null,
    frequency: series.frequency ?? null,
    frequencyShort: series.frequency_short ?? null,
    units: series.units ?? null,
    unitsShort: series.units_short ?? null,
    seasonalAdjustment: series.seasonal_adjustment ?? null,
    seasonalAdjustmentShort: series.seasonal_adjustment_short ?? null,
    lastUpdated: series.last_updated ?? null,
    notes: series.notes ?? null,
  };
}

function classifyApiError(status, message) {
  const normalized = message.toLowerCase();

  if (normalized.includes("api_key") || normalized.includes("api key")) {
    return "FRED_INVALID_API_KEY";
  }

  if (
    normalized.includes("series_id") ||
    normalized.includes("series id") ||
    normalized.includes("not found")
  ) {
    return "FRED_INVALID_SERIES_ID";
  }

  return status >= 500 ? "FRED_HTTP_ERROR" : "FRED_API_ERROR";
}

export class FredClient {
  constructor({ apiKey = process.env.FRED_API_KEY, fetchImpl = globalThis.fetch, baseUrl = DEFAULT_BASE_URL, now = () => new Date() } = {}) {
    if (typeof apiKey !== "string" || apiKey.trim() === "") {
      throw new FredClientError("FRED_API_KEY is missing.", {
        code: "FRED_API_KEY_MISSING",
      });
    }

    if (typeof fetchImpl !== "function") {
      throw new FredClientError("No fetch implementation is available.", {
        code: "FRED_FETCH_UNAVAILABLE",
      });
    }

    this.apiKey = apiKey.trim();
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.now = now;
  }

  async request(path, params) {
    const url = new URL(`${this.baseUrl}/${path}`);
    url.search = new URLSearchParams({
      ...params,
      api_key: this.apiKey,
      file_type: "json",
    }).toString();

    let response;
    try {
      response = await this.fetchImpl(url, {
        headers: { Accept: "application/json" },
      });
    } catch (error) {
      throw new FredClientError(`FRED network request failed: ${error.message}`, {
        code: "FRED_NETWORK_ERROR",
        cause: error,
      });
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new FredClientError(`FRED returned a non-JSON response (HTTP ${response.status}).`, {
        code: "FRED_INVALID_RESPONSE",
        status: response.status,
        cause: error,
      });
    }

    if (!response.ok || payload.error_code) {
      const message = payload.error_message ?? payload.message ?? `FRED request failed with HTTP ${response.status}.`;
      throw new FredClientError(message, {
        code: classifyApiError(response.status, message),
        status: response.status,
      });
    }

    return payload;
  }

  async fetchSeriesMetadata(seriesId) {
    const normalizedSeriesId = requireSeriesId(seriesId);
    const payload = await this.request("series", { series_id: normalizedSeriesId });
    const series = payload.seriess?.[0];

    if (!series) {
      throw new FredClientError(`No metadata returned for FRED series ${normalizedSeriesId}.`, {
        code: "FRED_INVALID_SERIES_ID",
      });
    }

    return normalizeMetadata(series);
  }

  async fetchSeriesObservations(seriesId, options = {}) {
    const normalizedSeriesId = requireSeriesId(seriesId);
    const allowedOptions = [
      "observation_start",
      "observation_end",
      "sort_order",
      "limit",
      "offset",
      "frequency",
      "aggregation_method",
    ];
    const params = { series_id: normalizedSeriesId };

    for (const key of allowedOptions) {
      if (options[key] !== undefined && options[key] !== null) {
        params[key] = String(options[key]);
      }
    }

    const retrievedAt = new Date().toISOString();
    const payload = await this.request("series/observations", params);

    if (!Array.isArray(payload.observations) || payload.observations.length === 0) {
      throw new FredClientError(`FRED returned no observations for series ${normalizedSeriesId}.`, {
        code: "FRED_EMPTY_OBSERVATIONS",
      });
    }

    return {
      seriesId: normalizedSeriesId,
      retrievedAt,
      observations: payload.observations.map((observation) => ({
        observationDate: observation.date ?? null,
        value: normalizeValue(observation.value),
        realtimeStart: observation.realtime_start ?? null,
        realtimeEnd: observation.realtime_end ?? null,
      })),
    };
  }

  async getLatestValidObservation(seriesId) {
    const normalizedSeriesId = requireSeriesId(seriesId);
    const [metadata, result] = await Promise.all([
      this.fetchSeriesMetadata(normalizedSeriesId),
      this.fetchSeriesObservations(normalizedSeriesId, { sort_order: "desc" }),
    ]);

    const latest = result.observations
      .filter(
        (observation) =>
          observation.value !== null &&
          typeof observation.observationDate === "string" &&
          !Number.isNaN(Date.parse(observation.observationDate)),
      )
      .sort((left, right) => right.observationDate.localeCompare(left.observationDate))[0];

    if (!latest) {
      throw new FredClientError(`FRED returned no valid observations for series ${normalizedSeriesId}.`, {
        code: "FRED_NO_VALID_OBSERVATION",
      });
    }

    return {
      seriesId: normalizedSeriesId,
      observationDate: latest.observationDate,
      value: latest.value,
      retrievedAt: result.retrievedAt,
      metadata,
    };
  }

  async getLatestObservation(config) {
    const result = await this.getLatestValidObservation(config.datasetId);
    return createRawObservation({
      provider: "FRED",
      datasetId: result.seriesId,
      indicatorId: config.indicatorId,
      observationDate: result.observationDate,
      value: result.value,
      unit: result.metadata.units,
      frequency: result.metadata.frequency,
      retrievedAt: result.retrievedAt,
      metadata: { ...result.metadata, ...config.metadata, role: config.role ?? null },
    });
  }

  async getHistory(config, requirement) {
    const requiredPeriods = requirement.requiredPeriods;
    const safetyBuffer = requirement.safetyBuffer ?? 3;
    const targetFrequency = requirement.frequency;
    const needsMonthlyDailyHistory =
      requirement.normalization === "CALENDAR_MONTH_MEAN" && targetFrequency === "MONTHLY";
    const options = { sort_order: "desc" };

    if (requirement.maxHistory) {
      options.sort_order = "asc";
    } else if (needsMonthlyDailyHistory) {
      const start = new Date(Date.UTC(
        this.now().getUTCFullYear(),
        this.now().getUTCMonth() - requiredPeriods - safetyBuffer,
        1,
      ));
      options.observation_start = start.toISOString().slice(0, 10);
    } else {
      options.limit = requiredPeriods + safetyBuffer;
    }

    const [metadata, result] = await Promise.all([
      this.fetchSeriesMetadata(config.datasetId),
      this.fetchSeriesObservations(config.datasetId, options),
    ]);
    return {
      provider: "FRED",
      datasetId: config.datasetId,
      indicatorId: config.indicatorId,
      retrievedAt: result.retrievedAt,
      observations: result.observations.map((observation) => createRawObservation({
        provider: "FRED",
        datasetId: config.datasetId,
        indicatorId: config.indicatorId,
        observationDate: observation.observationDate,
        value: observation.value,
        unit: metadata.units,
        frequency: metadata.frequency,
        retrievedAt: result.retrievedAt,
        metadata: { ...metadata, ...config.metadata, role: config.role ?? null },
      })),
    };
  }
}

export { FredClient as FredAdapter };

export function createFredClient(options) {
  return new FredClient(options);
}
