import { createRawObservation } from "../acquisition/RawObservation.js";

export class DgbasClientError extends Error {
  constructor(message, { code = "DGBAS_ERROR", status = null, cause } = {}) {
    super(message, { cause });
    this.name = "DgbasClientError";
    this.code = code;
    this.status = status;
  }
}

function decodeXml(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function readTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`));
  return match ? decodeXml(match[1].trim()) : null;
}

function normalizeMonthlyDate(value) {
  const match = /^(\d{4})M(0[1-9]|1[0-2])$/.exec(value ?? "");
  return match ? `${match[1]}-${match[2]}-01` : null;
}

function parseValue(value) {
  if (value === null || value === "" || value === ".") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export class DgbasClient {
  constructor({ fetchImpl = globalThis.fetch } = {}) {
    if (typeof fetchImpl !== "function") {
      throw new DgbasClientError("No fetch implementation is available.", {
        code: "DGBAS_FETCH_UNAVAILABLE",
      });
    }
    this.fetchImpl = fetchImpl;
  }

  async getHistory(config) {
    const { endpoint, selector } = config ?? {};
    if (!config?.indicatorId || !config.datasetId || !endpoint) {
      throw new DgbasClientError("DGBAS config requires indicatorId, datasetId, and endpoint.", {
        code: "DGBAS_INVALID_CONFIG",
      });
    }
    if (!selector?.itemPrefix || !selector.type || !selector.frequencyCode) {
      throw new DgbasClientError("DGBAS config requires selector.itemPrefix, selector.type, and selector.frequencyCode.", {
        code: "DGBAS_INVALID_CONFIG",
      });
    }
    let response;
    try {
      response = await this.fetchImpl(endpoint, {
        headers: { Accept: "application/xml, text/xml" },
      });
    } catch (error) {
      throw new DgbasClientError(`DGBAS network request failed: ${error.message}`, {
        code: "DGBAS_NETWORK_ERROR",
        cause: error,
      });
    }

    if (!response.ok) {
      throw new DgbasClientError(`DGBAS request failed with HTTP ${response.status}.`, {
        code: "DGBAS_HTTP_ERROR",
        status: response.status,
      });
    }

    const retrievedAt = new Date().toISOString();
    const xml = await response.text();
    if (!xml.includes("<DataSet") || !xml.includes("<Obs>")) {
      throw new DgbasClientError("DGBAS response does not match the expected XML schema.", {
        code: "DGBAS_SCHEMA_MISMATCH",
      });
    }

    const observations = [];
    for (const match of xml.matchAll(/<Obs>([\s\S]*?)<\/Obs>/g)) {
      const record = match[1];
      const item = readTag(record, "Item");
      const type = readTag(record, "TYPE");
      const frequencyCode = readTag(record, "FREQ");

      if (
        !item?.startsWith(selector.itemPrefix) ||
        type !== selector.type ||
        frequencyCode !== selector.frequencyCode
      ) {
        continue;
      }

      observations.push({
        observationDate: normalizeMonthlyDate(readTag(record, "TIME_PERIOD")),
        value: parseValue(readTag(record, "Item_VALUE")),
        item,
      });
    }

    if (observations.length === 0) {
      throw new DgbasClientError(`DGBAS returned no observations matching dataset configuration ${config.datasetId}.`, {
        code: "DGBAS_EMPTY_RESULTS",
      });
    }

    const normalized = observations
      .filter((observation) => observation.observationDate)
      .map((observation) => createRawObservation({
        provider: "DGBAS",
        datasetId: config.datasetId,
        indicatorId: config.indicatorId,
        observationDate: observation.observationDate,
        value: observation.value,
        unit: config.unit ?? null,
        frequency: config.frequency ?? selector.frequencyCode,
        retrievedAt,
        metadata: {
          ...config.metadata,
          item: observation.item,
          type: selector.type,
          frequencyCode: selector.frequencyCode,
          sourceUrl: endpoint,
        },
      }));

    if (!normalized.some((observation) => observation.status === "VALID")) {
      throw new DgbasClientError(`DGBAS returned no valid observation for dataset ${config.datasetId}.`, {
        code: "DGBAS_NO_VALID_OBSERVATION",
      });
    }

    return {
      provider: "DGBAS",
      datasetId: config.datasetId,
      indicatorId: config.indicatorId,
      retrievedAt,
      observations: normalized,
    };
  }

  async getLatestObservation(config) {
    const history = await this.getHistory(config);
    return history.observations
      .filter((observation) => observation.status === "VALID")
      .sort((left, right) => right.observationDate.localeCompare(left.observationDate))[0];
  }

}

export { DgbasClient as DgbasAdapter };

export function createDgbasClient(options) {
  return new DgbasClient(options);
}
