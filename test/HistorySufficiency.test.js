import assert from "node:assert/strict";
import test from "node:test";
import { evaluateHistorySufficiency } from "../src/domain/history/sufficiency.js";
import { defineTransformation, TransformationFrequency as Frequency, TransformationType as Type } from "../src/domain/transformations/TransformationDefinition.js";

function monthlyDates(count, startYear = 2023, startMonth = 1) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(startYear, startMonth - 1 + index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
  });
}

function quarterlyDates(count, startYear = 2021, startQuarter = 1) {
  return Array.from({ length: count }, (_, index) => {
    const quarterIndex = startQuarter - 1 + index;
    const year = startYear + Math.floor(quarterIndex / 4);
    const month = (quarterIndex % 4) * 3 + 1;
    return `${year}-${String(month).padStart(2, "0")}-01`;
  });
}

function observations(dates) {
  return dates.map((observationDate, index) => ({
    observationDate, value: index + 1, status: "VALID",
  }));
}

const yoy = defineTransformation({
  type: Type.YOY_PERCENT_CHANGE, frequency: Frequency.MONTHLY,
  lag: 12, requiredPeriods: 13, outputUnit: "PERCENT",
});

const zscore = defineTransformation({
  type: Type.ROLLING_ZSCORE, frequency: Frequency.MONTHLY,
  window: 36, requiredPeriods: 36, outputUnit: "ZSCORE",
  parameters: { requiredValidObservations: 35, allowedMissingPeriods: 1 },
});

const household = defineTransformation({
  type: Type.LEVEL_PLUS_PERIOD_CHANGE_AND_TRAILING_MEDIAN,
  frequency: Frequency.QUARTERLY, requiredPeriods: 20,
  parameters: {
    periodChangeLag: 4, trailingMedianWindow: 20,
    requiredValidObservations: 19, allowedMissingPeriods: 1,
  },
});

test("YoY is ready with an unrelated missing intermediate month", () => {
  const rows = observations(monthlyDates(13));
  rows[9] = { ...rows[9], value: null, status: "MISSING" };
  const result = evaluateHistorySufficiency(rows, yoy);
  assert.equal(result.ready, true);
  assert.equal(result.requiredPeriods, 13);
  assert.equal(result.validObservations, 2);
  assert.deepEqual(result.missingRequiredAnchors, []);
});

test("YoY is not ready when current period is missing", () => {
  const rows = observations(monthlyDates(13));
  rows[12] = { ...rows[12], value: null, status: "MISSING" };
  const result = evaluateHistorySufficiency(rows, yoy);
  assert.equal(result.ready, false);
  assert.deepEqual(result.missingRequiredAnchors, ["2024-01"]);
});

test("YoY is not ready when t-12 is missing", () => {
  const rows = observations(monthlyDates(13));
  rows[0] = { ...rows[0], value: null, status: "MISSING" };
  const result = evaluateHistorySufficiency(rows, yoy);
  assert.equal(result.ready, false);
  assert.deepEqual(result.missingRequiredAnchors, ["2023-01"]);
});

test("rolling z-score is ready with exactly one missing month", () => {
  const rows = observations(monthlyDates(36));
  rows[10] = { ...rows[10], value: null, status: "MISSING" };
  const result = evaluateHistorySufficiency(rows, zscore);
  assert.equal(result.ready, true);
  assert.equal(result.validObservations, 35);
  assert.equal(result.missingPeriods.length, 1);
});

test("rolling z-score is not ready with two missing months", () => {
  const rows = observations(monthlyDates(36));
  for (const index of [10, 20]) rows[index] = { ...rows[index], value: null, status: "MISSING" };
  const result = evaluateHistorySufficiency(rows, zscore);
  assert.equal(result.ready, false);
  assert.equal(result.validObservations, 34);
});

test("rolling z-score requires current observation to be valid", () => {
  const rows = observations(monthlyDates(36));
  rows[35] = { ...rows[35], value: null, status: "MISSING" };
  const result = evaluateHistorySufficiency(rows, zscore);
  assert.equal(result.ready, false);
  assert.deepEqual(result.missingRequiredAnchors, ["2025-12"]);
});

test("household policy allows one non-anchor missing quarter", () => {
  const rows = observations(quarterlyDates(20));
  rows[5] = { ...rows[5], value: null, status: "MISSING" };
  const result = evaluateHistorySufficiency(rows, household);
  assert.equal(result.ready, true);
  assert.equal(result.validObservations, 19);
  assert.deepEqual(result.missingRequiredAnchors, []);
});

test("household policy is not ready when t-4 is missing", () => {
  const rows = observations(quarterlyDates(20));
  rows[15] = { ...rows[15], value: null, status: "MISSING" };
  const result = evaluateHistorySufficiency(rows, household);
  assert.equal(result.ready, false);
  assert.deepEqual(result.missingRequiredAnchors, ["2024-Q4"]);
});

test("missing observations remain missing and are never imputed", () => {
  const rows = observations(monthlyDates(36));
  rows[10] = { ...rows[10], value: null, status: "MISSING" };
  const result = evaluateHistorySufficiency(rows, zscore);
  const missing = result.preparedObservations.find((item) => item.observationDate === rows[10].observationDate);
  assert.equal(missing.value, null);
  assert.equal(missing.status, "MISSING");
});
