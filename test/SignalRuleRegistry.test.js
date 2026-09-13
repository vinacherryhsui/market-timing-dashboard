import test from "node:test";
import assert from "node:assert/strict";
import { SignalEngine } from "../src/domain/signals/SignalEngine.js";
import { SignalEvaluationService } from "../src/domain/signals/SignalEvaluationService.js";
import { activeSignalRuleRegistry, getSignalRule } from "../src/domain/signals/signalRuleRegistry.js";
import { activeTransformationRegistry } from "../src/domain/transformations/transformationRegistry.js";

const engine = new SignalEngine({ now: () => new Date("2026-09-06T00:00:00Z") });

const scalarCases = {
  nonfarm_payrolls: { GREEN: 123, YELLOW: 122, RED: -1, boundaries: [[0, "YELLOW"], [122, "YELLOW"]] },
  underemployment: { GREEN: -0.1, YELLOW: 0, RED: 1.1, boundaries: [[0, "YELLOW"], [1, "YELLOW"]] },
  sahm_rule: { GREEN: 0.29, YELLOW: 0.3, RED: 0.5, boundaries: [[0.3, "YELLOW"], [0.5, "RED"]] },
  consumer_confidence: { GREEN: 0.1, YELLOW: 0, RED: -1.1, boundaries: [[-1, "YELLOW"], [0, "YELLOW"]] },
  durable_goods: { GREEN: 5.1, YELLOW: 5, RED: -5.1, boundaries: [[-5, "YELLOW"], [5, "YELLOW"]] },
  "permits_starts:permits": { GREEN: 5.1, YELLOW: -5, RED: -5.1, boundaries: [[-5, "YELLOW"], [5, "YELLOW"]] },
  pce_price_index: { GREEN: 2, YELLOW: 1, RED: 0.9, boundaries: [[1, "YELLOW"], [1.5, "GREEN"], [2.5, "GREEN"], [3, "YELLOW"]] },
  "cpi_core_cpi:headline": { GREEN: 2, YELLOW: 3, RED: 3.1, boundaries: [[1.5, "GREEN"], [2.5, "GREEN"]] },
  "cpi_core_cpi:core": { GREEN: 2, YELLOW: 1.25, RED: 0.9, boundaries: [[1, "YELLOW"], [3, "YELLOW"]] },
  taiwan_cpi: { GREEN: 1, YELLOW: 2, RED: 3, boundaries: [[-1, "YELLOW"], [0, "GREEN"], [2, "YELLOW"], [3, "RED"]] },
  tips_breakeven: { GREEN: 2, YELLOW: 2.75, RED: 3.1, boundaries: [[1.5, "GREEN"], [2.5, "GREEN"]] },
  vix: { GREEN: 19, YELLOW: 20, RED: 31, boundaries: [[20, "YELLOW"], [30, "YELLOW"]] },
  credit_spread_baa10y: { GREEN: -0.1, YELLOW: 1, RED: 1.1, boundaries: [[0, "YELLOW"], [1, "YELLOW"]] },
  yield_curve_10y3m: { GREEN: 0.51, YELLOW: 0.5, RED: -0.01, boundaries: [[0, "YELLOW"], [0.5, "YELLOW"]] },
  yield_curve_10y2y: { GREEN: 0.51, YELLOW: 0, RED: -0.01, boundaries: [[0, "YELLOW"], [0.5, "YELLOW"]] },
  gscpi: { GREEN: -0.1, YELLOW: 0, RED: 1.1, boundaries: [[0, "YELLOW"], [1, "YELLOW"]] },
  global_gpr: { GREEN: -0.1, YELLOW: 0, RED: 1.1, boundaries: [[0, "YELLOW"], [1, "YELLOW"]] },
  global_epu: { GREEN: -0.1, YELLOW: 0.5, RED: 1.1, boundaries: [[0, "YELLOW"], [1, "YELLOW"]] },
  trade_policy_uncertainty: { GREEN: -0.1, YELLOW: 1, RED: 1.1, boundaries: [[0, "YELLOW"], [1, "YELLOW"]] },
};

test("registry has one valid rule for every active transformation entry", () => {
  assert.equal(activeSignalRuleRegistry.length, 21);
  assert.deepEqual(
    activeSignalRuleRegistry.map((rule) => rule.sourceRole ? `${rule.indicatorId}:${rule.sourceRole}` : rule.indicatorId).sort(),
    activeTransformationRegistry.map((entry) => entry.id).sort(),
  );
});

for (const [entryId, cases] of Object.entries(scalarCases)) {
  test(`${entryId} evaluates representative values and exact boundaries`, () => {
    const rule = getSignalRule(entryId);
    for (const color of ["GREEN", "YELLOW", "RED"]) {
      assert.equal(engine.evaluate(rule, { value: cases[color] }).color, color);
    }
    for (const [value, color] of cases.boundaries) {
      assert.equal(engine.evaluate(rule, { value }).color, color, `${entryId} at ${value}`);
    }
  });
}

for (const entryId of ["household_debt_service_ratio", "credit_card_delinquency"]) {
  test(`${entryId} evaluates compound values including equality fallback`, () => {
    const rule = getSignalRule(entryId);
    assert.equal(engine.evaluate(rule, { values: { current: 8, trailingMedian: 10, periodChange4Q: 0 } }).color, "GREEN");
    assert.equal(engine.evaluate(rule, { values: { current: 12, trailingMedian: 10, periodChange4Q: 1 } }).color, "RED");
    assert.equal(engine.evaluate(rule, { values: { current: 10, trailingMedian: 10, periodChange4Q: -1 } }).color, "YELLOW");
  });
}

test("source roles stay separate and inactive entries have no rule", () => {
  assert.equal(getSignalRule("cpi_core_cpi:headline").sourceRole, "headline");
  assert.equal(getSignalRule("cpi_core_cpi:core").sourceRole, "core");
  assert.equal(getSignalRule("permits_starts:permits").sourceRole, "permits");
  for (const entryId of [
    "auto_sales", "permits_starts:starts", "housing_starts", "household_credit_balance",
    "revolving_credit_balance", "budget_deficit_gdp", "eia_crude_inventories", "ppi",
  ]) assert.equal(getSignalRule(entryId), null, entryId);
  assert.ok(getSignalRule("yield_curve_10y2y"));
  assert.ok(getSignalRule("yield_curve_10y3m"));
});

test("all active rules propagate invalid transformed values to UNKNOWN", () => {
  for (const rule of activeSignalRuleRegistry) {
    assert.equal(engine.evaluate(rule, { value: null }).color, "UNKNOWN", rule.ruleId);
  }
});

test("evaluation orchestration returns UNKNOWN for missing rule and history not ready", async () => {
  const historyPreparation = { prepare: async () => ({ ready: false, reason: "MISSING_REQUIRED_ANCHOR" }) };
  const service = new SignalEvaluationService({ historyPreparation, signalEngine: engine, resolveRule: getSignalRule });
  const active = activeTransformationRegistry[0];
  assert.match((await service.evaluate(active)).signal.reason, /HISTORY_NOT_READY/);
  const inactive = { ...active, id: "not_registered", indicatorId: "not_registered" };
  assert.equal((await service.evaluate(inactive)).signal.reason, "SIGNAL_RULE_NOT_FOUND");
});
