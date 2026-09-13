import { createRawObservation } from "../acquisition/RawObservation.js";

const DEFAULT_BASE_URL = "https://api.eia.gov/v2";

export class EiaClientError extends Error {
  constructor(message, { code = "EIA_ERROR", status = null, cause } = {}) {
    super(message, { cause });
    this.name = "EiaClientError";
    this.code = code;
    this.status = status;
  }
}

function parseValue(value) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    value === "." ||
    value === "NA" ||
    value === "--" ||
    value === "-"
  ) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function apiErrorMessage(payload, status) {
  return (
    payload?.error ??
    payload?.response?.error ??
    payload?.message ??
    `EIA request failed with HTTP ${status}.`
  );
}

export class EiaClient {
  constructor({ apiKey = process.env.EIA_API_KEY, fetchImpl = globalThis.fetch, baseUrl = DEFAULT_BASE_URL } = {}) {
    if (typeof apiKey !== "string" || apiKey.trim() === "") {
      throw new EiaClientError("EIA_API_KEY is missing.", {
        code: "EIA_API_KEY_MISSING",
      });
    }
    if (typeof fetchImpl !== "function") {
      throw new EiaClientError("No fetch implementation is available.", {
        code: "EIA_FETCH_UNAVAILABLE",
      });
    }
    this.apiKey = apiKey.trim();
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async getLatestObservation(config) {
    const { route, datasetId, frequency } = config ?? {};
    if (!config?.indicatorId || !route || !datasetId || !frequency) {
      throw new EiaClientError("EIA config requires indicatorId, route, datasetId, and frequency.", {
        code: "EIA_INVALID_CONFIG",
      });
    }
    const url = new URL(`${this.baseUrl}/${route}`);
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("frequency", frequency);
    url.searchParams.set("data[0]", "value");
    url.searchParams.set("facets[series][]", datasetId);
    url.searchParams.set("sort[0][column]", "period");
    url.searchParams.set("sort[0][direction]", "desc");
    url.searchParams.set("length", "100");

    let response;
    try {
      response = await this.fetchImpl(url, { headers: { Accept: "application/json" } });
    } catch (error) {
      throw new EiaClientError(`EIA network request failed: ${error.message}`, {
        code: "EIA_NETWORK_ERROR",
        cause: error,
      });
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new EiaClientError(`EIA returned a non-JSON response (HTTP ${response.status}).`, {
        code: "EIA_SCHEMA_MISMATCH",
        status: response.status,
        cause: error,
      });
    }

    if (!response.ok || payload.error || payload.response?.error) {
      const message = String(apiErrorMessage(payload, response.status));
      const code = message.toLowerCase().includes("api key")
        ? "EIA_INVALID_API_KEY"
        : "EIA_API_ERROR";
      throw new EiaClientError(message, { code, status: response.status });
    }

    const records = payload?.response?.data;
    if (!Array.isArray(records)) {
      throw new EiaClientError("EIA response does not contain response.data.", {
        code: "EIA_SCHEMA_MISMATCH",
      });
    }
    if (records.length === 0) {
      throw new EiaClientError(`EIA returned no observations for series ${datasetId}.`, {
        code: "EIA_EMPTY_RESULTS",
      });
    }

    const latest = records
      .map((record) => ({ ...record, normalizedValue: parseValue(record.value) }))
      .filter(
        (record) =>
          record.series === datasetId &&
          typeof record.period === "string" &&
          !Number.isNaN(Date.parse(record.period)) &&
          record.normalizedValue !== null,
      )
      .sort((left, right) => right.period.localeCompare(left.period))[0];

    if (!latest) {
      throw new EiaClientError(`EIA returned no valid observations for series ${datasetId}.`, {
        code: "EIA_NO_VALID_OBSERVATION",
      });
    }

    return createRawObservation({
      provider: "EIA",
      datasetId,
      indicatorId: config.indicatorId,
      observationDate: latest.period,
      value: latest.normalizedValue,
      unit: latest.units ?? null,
      frequency: payload.response.frequency ?? frequency,
      retrievedAt: new Date().toISOString(),
      metadata: {
        title: latest["series-description"] ?? null,
        areaCode: latest.duoarea ?? null,
        areaName: latest["area-name"] ?? null,
        productCode: latest.product ?? null,
        productName: latest["product-name"] ?? null,
        processCode: latest.process ?? null,
        processName: latest["process-name"] ?? null,
        route: `/${route}`,
      },
    });
  }

}

export { EiaClient as EiaAdapter };

export function createEiaClient(options) {
  return new EiaClient(options);
}
