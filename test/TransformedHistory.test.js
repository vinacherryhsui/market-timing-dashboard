import test from "node:test";
import assert from "node:assert/strict";
import { buildTransformedHistory } from "../src/domain/transformations/TransformedHistoryService.js";
import { activeTransformationRegistry } from "../src/domain/transformations/transformationRegistry.js";

const entry = id => activeTransformationRegistry.find(item => item.id === id);
const row = (date, value, frequency = "Monthly") => ({ provider: "TEST", datasetId: "TEST", indicatorId: "test", observationDate: date, value, unit: "Index", frequency, retrievedAt: "2026-01-01", status: Number.isFinite(value) ? "VALID" : "MISSING", metadata: {} });

test("transformed history covers daily passthrough without inventing missing points", () => {
  const result = buildTransformedHistory(entry("vix"), [row("2025-01-02", 10, "Daily"), row("2025-01-03", null, "Daily"), row("2025-01-06", 12, "Daily")]);
  assert.deepEqual(result, [{ observationDate: "2025-01-02", value: 10 }, { observationDate: "2025-01-06", value: 12 }]);
});

test("monthly difference and rolling z-score charts use transformed rather than raw values", () => {
  assert.deepEqual(buildTransformedHistory(entry("nonfarm_payrolls"), [row("2025-01-01", 100), row("2025-02-01", 115)]), [{ observationDate: "2025-02-01", value: 15 }]);
  const zRows = Array.from({ length: 36 }, (_, index) => row(`2023-${String(index % 12 + 1).padStart(2, "0")}-01`, index + 1));
  assert.notEqual(buildTransformedHistory(entry("global_gpr"), zRows).at(-1).value, 36);
});

test("quarterly compound history charts its primary current-level series", () => {
  const rows = Array.from({ length: 20 }, (_, index) => row(`${2020 + Math.floor(index / 4)}-${String(index % 4 * 3 + 1).padStart(2, "0")}-01`, 50 + index, "Quarterly"));
  assert.equal(buildTransformedHistory(entry("household_debt_service_ratio"), rows).at(-1).value, 69);
});

test("BAA10Y is aggregated monthly before rolling z-score history", () => {
  const rows = Array.from({ length: 36 }, (_, index) => [row(`${2023 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}-01`, index), row(`${2023 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}-15`, index + 2)]).flat();
  const result = buildTransformedHistory(entry("credit_spread_baa10y"), rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].observationDate.endsWith("-01"), true);
});
