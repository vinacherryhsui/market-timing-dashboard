import assert from "node:assert/strict";
import test from "node:test";
import { aggregateCalendarMonthMean } from "../src/domain/history/frequencyNormalization.js";
import { validateRecentContinuity } from "../src/domain/history/continuity.js";
import { HistoryPreparationService } from "../src/domain/history/HistoryPreparationService.js";
import { defineTransformation, TransformationFrequency as Frequency, TransformationType as Type } from "../src/domain/transformations/TransformationDefinition.js";

function observation(date, value, overrides = {}) {
  return {
    provider: "TEST", datasetId: "SERIES", indicatorId: "indicator",
    observationDate: date, value, unit: "Index", frequency: "Monthly",
    retrievedAt: "2026-09-06T00:00:00.000Z", status: value === null ? "MISSING" : "VALID",
    metadata: {}, ...overrides,
  };
}

function monthlyDates(startYear, startMonth, count) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(startYear, startMonth - 1 + index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
  });
}

function entry({ requiredPeriods = 3, type = Type.ROLLING_ZSCORE, frequency = Frequency.MONTHLY, parameters = {} } = {}) {
  return {
    id: "indicator", indicatorId: "indicator", source: { datasetId: "SERIES" },
    transformation: defineTransformation({
      type, frequency,
      ...(type === Type.ROLLING_ZSCORE ? { window: requiredPeriods } : {}),
      requiredPeriods, parameters,
    }),
  };
}

test("detects contiguous monthly history", () => {
  const result = validateRecentContinuity(
    monthlyDates(2026, 1, 3).map((date, index) => observation(date, index + 1)),
    { frequency: "MONTHLY", requiredPeriods: 3 },
  );
  assert.equal(result.ready, true);
  assert.equal(result.contiguousPeriods, 3);
  assert.equal(result.contiguousStartDate, "2026-01-01");
});

test("detects contiguous quarterly history", () => {
  const rows = ["2025-04-01", "2025-07-01", "2025-10-01", "2026-01-01"].map((date, index) => observation(date, index));
  const result = validateRecentContinuity(rows, { frequency: "QUARTERLY", requiredPeriods: 4 });
  assert.equal(result.ready, true);
  assert.equal(result.contiguousPeriods, 4);
});

test("reports a missing recent period", () => {
  const rows = ["2026-01-01", "2026-03-01", "2026-04-01"].map((date, index) => observation(date, index));
  const result = validateRecentContinuity(rows, { frequency: "MONTHLY", requiredPeriods: 3 });
  assert.equal(result.ready, false);
  assert.deepEqual(result.missingPeriods, ["2026-02"]);
  assert.equal(result.contiguousPeriods, 2);
});

test("total count cannot substitute for recent continuity", () => {
  const rows = ["2025-01-01", "2025-02-01", "2026-01-01", "2026-03-01", "2026-04-01"].map((date, index) => observation(date, index));
  const result = validateRecentContinuity(rows, { frequency: "MONTHLY", requiredPeriods: 3 });
  assert.equal(rows.length > 3, true);
  assert.equal(result.ready, false);
});

test("reuses fresh cache when sufficient and does not fetch", async () => {
  let fetchCount = 0;
  const history = {
    retrievedAt: "2026-09-06T00:00:00.000Z",
    observations: monthlyDates(2026, 1, 3).map((date, index) => observation(date, index)),
  };
  const service = new HistoryPreparationService({
    adapters: { TEST: { getHistory: async () => { fetchCount += 1; } } },
    sourceConfigs: [{ indicatorId: "indicator", datasetId: "SERIES", provider: "TEST" }],
    historyCache: { read: async () => history, write: async () => assert.fail("must not write") },
    now: () => new Date("2026-09-06T01:00:00.000Z"),
  });
  const result = await service.prepare(entry());
  assert.equal(result.ready, true);
  assert.equal(result.cacheStatus, "REUSED");
  assert.equal(fetchCount, 0);
});

test("fetches with a safety buffer when cached history is insufficient", async () => {
  let receivedRequirement;
  let writes = 0;
  const fetched = {
    retrievedAt: "2026-09-06T00:00:00.000Z",
    observations: monthlyDates(2026, 1, 6).map((date, index) => observation(date, index)),
  };
  const service = new HistoryPreparationService({
    adapters: { TEST: { getHistory: async (_config, requirement) => { receivedRequirement = requirement; return fetched; } } },
    sourceConfigs: [{ indicatorId: "indicator", datasetId: "SERIES", provider: "TEST" }],
    historyCache: { read: async () => null, write: async () => { writes += 1; } },
    safetyBuffer: 3,
  });
  const result = await service.prepare(entry());
  assert.equal(receivedRequirement.requiredPeriods, 3);
  assert.equal(receivedRequirement.safetyBuffer, 3);
  assert.equal(result.ready, true);
  assert.equal(result.fetched, true);
  assert.equal(writes, 1);
});

test("aggregates valid BAA10Y daily values to calendar-month means", () => {
  const rows = [
    observation("2026-01-02", 1, { frequency: "Daily" }),
    observation("2026-01-30", 3, { frequency: "Daily" }),
    observation("2026-02-02", 4, { frequency: "Daily" }),
    observation("2026-02-03", null, { frequency: "Daily", status: "MISSING" }),
  ];
  const monthly = aggregateCalendarMonthMean(rows);
  assert.deepEqual(monthly.map((item) => [item.observationDate, item.value]), [
    ["2026-01-01", 2], ["2026-02-01", 4],
  ]);
});

test("validates 36 months after BAA10Y daily-to-monthly aggregation", () => {
  const daily = monthlyDates(2023, 1, 36).flatMap((date, index) => [
    observation(date.slice(0, 8) + "02", index, { frequency: "Daily" }),
    observation(date.slice(0, 8) + "20", index + 2, { frequency: "Daily" }),
  ]);
  const monthly = aggregateCalendarMonthMean(daily);
  const result = validateRecentContinuity(monthly, { frequency: "MONTHLY", requiredPeriods: 36 });
  assert.equal(result.ready, true);
  assert.equal(result.preparedObservations.length, 36);
});

test("periodic-file preparation reads cache without redownload", async () => {
  let reads = 0;
  const service = new HistoryPreparationService({
    adapters: { FILE: { getHistory: async () => { reads += 1; return {
      retrievedAt: "2026-09-01T00:00:00.000Z",
      observations: monthlyDates(2026, 1, 3).map((date, index) => observation(date, index)),
    }; } } },
    sourceConfigs: [{ indicatorId: "indicator", datasetId: "SERIES", provider: "FILE", acquisitionMode: "PERIODIC_FILE" }],
    historyCache: { read: async () => assert.fail("API cache must not be read") },
  });
  const result = await service.prepare(entry());
  assert.equal(reads, 1);
  assert.equal(result.ready, true);
  assert.equal(result.fetched, false);
  assert.equal(result.cacheStatus, "PERIODIC_FILE_CACHE");
});

test("provider failure returns not-ready and preserves prior cache", async () => {
  let writes = 0;
  const previous = {
    retrievedAt: "2020-01-01T00:00:00.000Z",
    observations: monthlyDates(2026, 1, 3).map((date, index) => observation(date, index)),
  };
  const service = new HistoryPreparationService({
    adapters: { TEST: { getHistory: async () => { throw Object.assign(new Error("offline"), { code: "NETWORK" }); } } },
    sourceConfigs: [{ indicatorId: "indicator", datasetId: "SERIES", provider: "TEST" }],
    historyCache: { read: async () => previous, write: async () => { writes += 1; } },
    now: () => new Date("2026-09-06T00:00:00.000Z"),
  });
  const result = await service.prepare(entry());
  assert.equal(result.ready, false);
  assert.equal(result.cacheStatus, "PREVIOUS_CACHE_RETAINED");
  assert.match(result.error, /NETWORK: offline/);
  assert.equal(writes, 0);
  assert.equal(result.preparedObservations.length, 3);
});
