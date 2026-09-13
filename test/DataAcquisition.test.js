import assert from "node:assert/strict";
import test from "node:test";
import { DataAcquisitionService } from "../src/data/acquisition/DataAcquisitionService.js";
import { createRawObservation, RawObservationStatus } from "../src/data/acquisition/RawObservation.js";
import { getIndicatorSourceConfigs } from "../src/data/acquisition/indicatorSources.js";

test("normalized raw observation exposes the provider-agnostic contract", () => {
  const result = createRawObservation({
    provider: "TEST", datasetId: "SERIES", indicatorId: "indicator",
    observationDate: "2026-01-01", value: 42, unit: "Index",
    frequency: "Monthly", retrievedAt: "2026-01-02T00:00:00.000Z",
  });
  assert.deepEqual(Object.keys(result), [
    "provider", "datasetId", "indicatorId", "observationDate", "value",
    "unit", "frequency", "retrievedAt", "status", "metadata",
  ]);
  assert.equal(result.status, RawObservationStatus.VALID);
});

test("undefined value normalizes to null and can never have VALID status", () => {
  const result = createRawObservation({
    provider: "TEST", datasetId: "SERIES", indicatorId: "indicator",
    observationDate: "2026-01-01", value: undefined,
    retrievedAt: "2026-01-02T00:00:00.000Z", status: RawObservationStatus.VALID,
  });
  assert.equal(result.value, null);
  assert.equal(result.status, RawObservationStatus.MISSING);
});

test("acquisition service selects an adapter from source metadata", async () => {
  const calls = [];
  const adapter = { getLatestObservation: async (config) => { calls.push(config); return { datasetId: config.datasetId }; } };
  const service = new DataAcquisitionService({
    adapters: { OFFICIAL_PROVIDER: adapter },
    sourceConfigs: [{ indicatorId: "sample", provider: "OFFICIAL_PROVIDER", datasetId: "DATASET_1" }],
  });
  const results = await service.getLatestObservations("sample");
  assert.equal(results[0].datasetId, "DATASET_1");
  assert.equal(calls[0].provider, "OFFICIAL_PROVIDER");
});

test("acquisition service supports composite indicators without provider conditionals", async () => {
  const adapter = { getLatestObservation: async (config) => ({ datasetId: config.datasetId }) };
  const service = new DataAcquisitionService({
    adapters: { FRED: adapter },
    sourceConfigs: [
      { indicatorId: "composite", provider: "FRED", datasetId: "A" },
      { indicatorId: "composite", provider: "FRED", datasetId: "B" },
    ],
  });
  assert.deepEqual(await service.getLatestObservations("composite"), [{ datasetId: "A" }, { datasetId: "B" }]);
});

test("headline and core CPI remain separate configured raw series", () => {
  assert.deepEqual(
    getIndicatorSourceConfigs("cpi_core_cpi").map(({ datasetId, role }) => ({ datasetId, role })),
    [
      { datasetId: "CPIAUCSL", role: "headline" },
      { datasetId: "CPILFESL", role: "core" },
    ],
  );
});

test("new demo FRED sources remain separate indicator configurations", () => {
  const expected = {
    yield_curve_10y2y: "T10Y2Y",
    yield_curve_10y3m: "T10Y3M",
    credit_spread_baa10y: "BAA10Y",
    household_credit_balance: "HCCSDODNS",
    revolving_credit_balance: "CCLACBM027SBOG",
    household_debt_service_ratio: "TDSP",
    credit_card_delinquency: "DRCCLACBS",
  };
  for (const [indicatorId, datasetId] of Object.entries(expected)) {
    assert.deepEqual(getIndicatorSourceConfigs(indicatorId).map((config) => config.datasetId), [datasetId]);
  }
});
