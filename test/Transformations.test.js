import assert from "node:assert/strict";
import test from "node:test";
import {
  defineTransformation,
  deriveRequiredPeriods,
  TransformationFrequency as Frequency,
  TransformationType as Type,
} from "../src/domain/transformations/TransformationDefinition.js";
import {
  activeTransformationRegistry,
  getActiveTransformations,
} from "../src/domain/transformations/transformationRegistry.js";
import {
  monthlyDifference,
  passthrough,
  periodOverPeriodChange,
  rollingZScore,
  trailingMedian,
  yoyPercentChange,
} from "../src/domain/transformations/transformations.js";

const valid = (value, month = 1) => ({
  provider: "TEST",
  datasetId: "TEST",
  indicatorId: "test",
  observationDate: `2025-${String(month).padStart(2, "0")}-01`,
  value,
  status: "VALID",
});

test("derives requiredPeriods for every transformation type", () => {
  assert.equal(deriveRequiredPeriods({ type: Type.PASSTHROUGH }), 1);
  assert.equal(deriveRequiredPeriods({ type: Type.MONTHLY_DIFFERENCE, lag: 1 }), 2);
  assert.equal(deriveRequiredPeriods({ type: Type.YOY_PERCENT_CHANGE, lag: 12 }), 13);
  assert.equal(deriveRequiredPeriods({ type: Type.ROLLING_ZSCORE, window: 36 }), 36);
  assert.equal(deriveRequiredPeriods({
    type: Type.LEVEL_PLUS_PERIOD_CHANGE_AND_TRAILING_MEDIAN,
    parameters: { periodChangeLag: 4, trailingMedianWindow: 20 },
  }), 20);
});

test("rejects a requiredPeriods value inconsistent with its definition", () => {
  assert.throws(() => defineTransformation({
    type: Type.YOY_PERCENT_CHANGE,
    frequency: Frequency.MONTHLY,
    lag: 12,
    requiredPeriods: 12,
  }), /does not match/);
});

test("calculates monthly difference", () => {
  assert.equal(monthlyDifference([valid(100, 1), valid(112, 2)]), 12);
});

test("calculates monthly YoY percent change from 13 observations", () => {
  const observations = Array.from({ length: 13 }, (_, index) => valid(index === 0 ? 100 : index === 12 ? 110 : 105));
  assert.ok(Math.abs(yoyPercentChange(observations) - 10) < 1e-12);
});

test("calculates rolling z-score using the requested window", () => {
  const result = rollingZScore([valid(1), valid(2), valid(3)], 3);
  assert.ok(Math.abs(result - 1.224744871391589) < 1e-12);
});

test("rolling z-score uses valid observations only when policy allows one missing", () => {
  const rows = [valid(1), { ...valid(null), status: "MISSING" }, valid(3), valid(5)];
  const result = rollingZScore(rows, 4, { requiredValidObservations: 3 });
  assert.ok(Number.isFinite(result));
  assert.equal(rows[1].value, null);
});

test("calculates odd and even trailing medians", () => {
  assert.equal(trailingMedian([valid(3), valid(1), valid(2)], 3), 2);
  assert.equal(trailingMedian([valid(4), valid(1), valid(3), valid(2)], 4), 2.5);
});

test("trailing median uses valid observations only when policy allows one missing", () => {
  const rows = [valid(1), valid(3), { ...valid(null), status: "MISSING" }, valid(9)];
  assert.equal(trailingMedian(rows, 4, { requiredValidObservations: 3 }), 3);
  assert.equal(rows[2].value, null);
});

test("calculates quarterly four-period absolute change", () => {
  assert.equal(periodOverPeriodChange([valid(10), valid(11), valid(12), valid(13), valid(16)], 4), 6);
});

test("utilities safely return null for missing, invalid, or insufficient input", () => {
  assert.equal(passthrough([{ ...valid(1), value: null, status: "MISSING" }]), null);
  assert.equal(monthlyDifference([valid(1), { ...valid(2), status: "INVALID" }]), null);
  assert.equal(yoyPercentChange(Array.from({ length: 13 }, () => valid(0))), null);
  assert.equal(rollingZScore([valid(1), valid(1)], 2), null);
  assert.equal(trailingMedian([valid(1)], 2), null);
  assert.equal(periodOverPeriodChange([valid(1)], 4), null);
});

test("active registry contains 21 source-specific transformation entries", () => {
  assert.equal(activeTransformationRegistry.length, 21);
  assert.deepEqual(
    getActiveTransformations("cpi_core_cpi").map((entry) => [entry.source.datasetId, entry.source.role]),
    [["CPIAUCSL", "headline"], ["CPILFESL", "core"]],
  );
  assert.deepEqual(getActiveTransformations("permits_starts").map((entry) => entry.source), [
    { datasetId: "PERMIT", role: "permits" },
  ]);
});

test("inactive demo indicators are absent from active transformation registry", () => {
  const inactive = [
    "auto_sales",
    "housing_starts",
    "household_credit_balance",
    "revolving_credit_balance",
    "budget_deficit_gdp",
    "eia_crude_inventories",
    "ppi",
  ];
  for (const indicatorId of inactive) assert.equal(getActiveTransformations(indicatorId).length, 0);
});
