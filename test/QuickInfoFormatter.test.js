import test from "node:test";
import assert from "node:assert/strict";
import { activeSignalRuleRegistry, getSignalRule } from "../src/domain/signals/signalRuleRegistry.js";
import { SignalEngine } from "../src/domain/signals/SignalEngine.js";
import { activeTransformationRegistry } from "../src/domain/transformations/transformationRegistry.js";
import { calculateMarketScore } from "../src/domain/scoring/MarketScoreEngine.js";
import { buildQuickInfo, formatObservationPeriod, QUICK_INFO_FALLBACK } from "../src/features/dashboard/quickInfoFormatter.js";
import { formatIndicatorPresentation, indicatorPresentationRegistry } from "../src/features/dashboard/indicatorPresentationRegistry.js";

const samples = Object.freeze({
  nonfarm_payrolls: { value: 150 }, underemployment: { value: -0.5 }, sahm_rule: { value: 0.2 },
  consumer_confidence: { value: 0.5 }, durable_goods: { value: 6 }, "permits_starts:permits": { value: 6 },
  pce_price_index: { value: 2 }, "cpi_core_cpi:headline": { value: 2 }, "cpi_core_cpi:core": { value: 2 },
  taiwan_cpi: { value: 1 }, tips_breakeven: { value: 2 }, vix: { value: 15 },
  credit_spread_baa10y: { value: -0.5 }, yield_curve_10y3m: { value: 0.6 }, yield_curve_10y2y: { value: 0.6 },
  gscpi: { value: -0.2 }, global_gpr: { value: -0.2 }, global_epu: { value: -0.2 },
  trade_policy_uncertainty: { value: -0.2 },
  household_debt_service_ratio: { values: { current: 9, trailingMedian: 10, periodChange4Q: -0.2 } },
  credit_card_delinquency: { values: { current: 2, trailingMedian: 3, periodChange4Q: -0.1 } },
});

test("all 21 active executable indicators produce rule-aware quick info without fallback", () => {
  assert.equal(activeTransformationRegistry.length, 21);
  assert.equal(activeSignalRuleRegistry.length, 21);
  assert.equal(Object.keys(indicatorPresentationRegistry).length, 21);
  const engine = new SignalEngine({ now: () => new Date("2026-09-08T00:00:00Z") });
  for (const entry of activeTransformationRegistry) {
    const transformedResult = samples[entry.id];
    assert.ok(transformedResult, `${entry.id}: sample missing`);
    const signal = engine.evaluate(getSignalRule(entry.id), transformedResult, { historyReadiness: { ready: true } });
    const originalValue = structuredClone(signal.transformedValue);
    const info = buildQuickInfo(entry.id, signal, { observationDate: "2026-07-01" });
    assert.notEqual(signal.color, "UNKNOWN", `${entry.id}: expected a valid signal`);
    assert.notEqual(info.value, "Unavailable", `${entry.id}: display value missing`);
    assert.notEqual(info.date, "Unavailable", `${entry.id}: observation period missing`);
    assert.doesNotMatch(info.source, /unavailable/i, `${entry.id}: source missing`);
    assert.notEqual(info.interpretation, QUICK_INFO_FALLBACK, `${entry.id}: unexpected fallback`);
    assert.ok(info.interpretation.length > 20, `${entry.id}: interpretation is not meaningful`);
    assert.deepEqual(signal.transformedValue, originalValue, `${entry.id}: transformed value changed`);
  }
});

test("covers every active executable rule type", () => {
  assert.deepEqual(new Set(activeSignalRuleRegistry.map((rule) => rule.type)), new Set([
    "SIMPLE_RANGE", "TWO_SIDED_TARGET_BAND", "ZSCORE_DIRECTIONAL", "COMPOUND_CONDITION",
  ]));
});

test("covers every active transformation display type", () => {
  assert.deepEqual(new Set(activeTransformationRegistry.map((entry) => entry.transformation.type)), new Set([
    "PASSTHROUGH", "MONTHLY_DIFFERENCE", "YOY_PERCENT_CHANGE", "ROLLING_ZSCORE",
    "LEVEL_PLUS_PERIOD_CHANGE_AND_TRAILING_MEDIAN",
  ]));
});

test("quick-info formatting does not change signal colors or Market Score", () => {
  const engine = new SignalEngine();
  const configuredSignals = activeTransformationRegistry.slice(0, 9).map((entry) => ({
    entryId: entry.id,
    signal: engine.evaluate(getSignalRule(entry.id), samples[entry.id], { historyReadiness: { ready: true } }),
  }));
  const before = calculateMarketScore(configuredSignals);
  configuredSignals.forEach(({ entryId, signal }) => buildQuickInfo(entryId, signal, { observationDate: "2026-07-01" }));
  assert.deepEqual(calculateMarketScore(configuredSignals), before);
});

test("formats daily, monthly, and quarterly observation periods without changing dates", () => {
  const date = "2026-07-01";
  assert.equal(formatObservationPeriod(date, "DAILY"), "July 1, 2026");
  assert.equal(formatObservationPeriod(date, "MONTHLY"), "July 2026");
  assert.equal(formatObservationPeriod(date, "QUARTERLY"), "Q3 2026");
  assert.equal(date, "2026-07-01");
});

test("z-score presentation explains the numeric band against the rolling average", () => {
  const signal = new SignalEngine().evaluate(getSignalRule("global_gpr"), { value: 1.25 }, { historyReadiness: { ready: true } });
  const info = buildQuickInfo("global_gpr", signal, { observationDate: "2026-07-01" });
  assert.match(info.value, /standard deviations above its 3-year average/);
  assert.equal(info.interpretation, "Geopolitical risk is more than 1 standard deviation above its 3-year average.");
  assert.doesNotMatch(info.value, /^[-+]?\d+(\.\d+)?\s*z$/i);
});

test("compound rules describe both configured level and direction tests", () => {
  const transformedResult = { values: { current: 9, trailingMedian: 10, periodChange4Q: -0.2 } };
  const signal = new SignalEngine().evaluate(getSignalRule("household_debt_service_ratio"), transformedResult, { historyReadiness: { ready: true } });
  const info = buildQuickInfo("household_debt_service_ratio", signal, { observationDate: "2026-04-01" });
  assert.equal(info.interpretation, "Debt service is below its 20-quarter median and not rising versus four quarters ago.");
  assert.doesNotMatch(info.interpretation, /periodChange4Q|trailingMedian/);
});

test("all 21 active indicators use their specified indicator wording", () => {
  const expected = {
    nonfarm_payrolls: "Monthly payroll growth is above +122K.", underemployment: "Underemployment is below its 3-year average.",
    sahm_rule: "The Sahm indicator is below 0.30.", consumer_confidence: "Sentiment is above its 3-year average.",
    durable_goods: "Durable-goods orders are growing more than 5% year over year.", "permits_starts:permits": "Building permits are growing more than 5% year over year.",
    pce_price_index: "PCE inflation is between 1.5% and 2.5% year over year.", "cpi_core_cpi:headline": "Headline CPI is between 1.5% and 2.5% year over year.",
    "cpi_core_cpi:core": "Core CPI is between 1.5% and 2.5% year over year.", taiwan_cpi: "Taiwan CPI is between 0% and 2% year over year.",
    tips_breakeven: "Breakeven inflation is between 1.5% and 2.5%.", vix: "VIX is below the 20 volatility threshold.",
    credit_spread_baa10y: "Credit spread is below its 3-year average.", yield_curve_10y3m: "The spread is above +0.50 percentage points.",
    yield_curve_10y2y: "The spread is above +0.50 percentage points.", gscpi: "GSCPI is below its historical average.",
    global_gpr: "Geopolitical risk is below its 3-year average.", global_epu: "Policy uncertainty is below its 3-year average.",
    trade_policy_uncertainty: "Trade-policy uncertainty is below its 3-year average.", household_debt_service_ratio: "Debt service is below its 20-quarter median and not rising versus four quarters ago.",
    credit_card_delinquency: "Delinquency is below its 20-quarter median and not rising versus four quarters ago.",
  };
  const engine = new SignalEngine();
  for (const entry of activeTransformationRegistry) {
    const signal = engine.evaluate(getSignalRule(entry.id), samples[entry.id], { historyReadiness: { ready: true } });
    assert.equal(buildQuickInfo(entry.id, signal).interpretation, expected[entry.id], entry.id);
  }
});

test("presentation reads thresholds from SignalRule and rolling windows from transformation metadata", () => {
  const payrollRule = structuredClone(getSignalRule("nonfarm_payrolls"));
  payrollRule.parameters.branches.find(branch => branch.color === "GREEN").anyOf[0].all[0].value = 200;
  const payroll = formatIndicatorPresentation({ entryId: "nonfarm_payrolls", signal: { color: "GREEN", transformedValue: 250 }, transformation: activeTransformationRegistry[0].transformation, rule: payrollRule, matchedGroup: payrollRule.parameters.branches[0].anyOf[0] });
  assert.equal(payroll.interpretation, "Monthly payroll growth is above +200K.");

  const gprEntry = activeTransformationRegistry.find(entry => entry.id === "global_gpr");
  const gpr = formatIndicatorPresentation({ entryId: "global_gpr", signal: { color: "GREEN", transformedValue: -0.2 }, transformation: { ...gprEntry.transformation, window: 24 }, rule: getSignalRule("global_gpr"), matchedGroup: getSignalRule("global_gpr").parameters.branches[0].anyOf[0] });
  assert.equal(gpr.interpretation, "Geopolitical risk is below its 2-year average.");
});

test("representative YELLOW and RED readings use concise explicit band wording", () => {
  const engine = new SignalEngine();
  const cases = [
    ["nonfarm_payrolls", 50, "Payroll growth is between 0 and +122K."], ["nonfarm_payrolls", -1, "Payroll growth is below 0, indicating contraction."],
    ["underemployment", 0.5, "Underemployment is 0 to 1 standard deviation above its 3-year average."], ["underemployment", 1.1, "Underemployment is more than 1 standard deviation above its 3-year average."],
    ["consumer_confidence", -0.5, "Sentiment is up to 1 standard deviation below its 3-year average."], ["consumer_confidence", -1.1, "Sentiment is more than 1 standard deviation below its 3-year average."],
    ["sahm_rule", 0.4, "The Sahm indicator is between 0.30 and 0.50."], ["sahm_rule", 0.5, "The Sahm indicator is at or above the official 0.50 recession trigger."],
    ["pce_price_index", 2.8, "PCE inflation is moderately outside the 1.5%–2.5% range."], ["pce_price_index", 3.1, "PCE inflation is below 1.0% or above 3.0% year over year."],
    ["taiwan_cpi", 2.5, "Taiwan CPI is between -1% and 0%, or between 2% and 3% year over year."], ["taiwan_cpi", 3, "Taiwan CPI is below -1% or at/above 3% year over year."],
    ["vix", 25, "VIX is between 20 and 30."], ["vix", 31, "VIX is above 30."],
    ["yield_curve_10y3m", 0.2, "The spread is between 0 and +0.50 percentage points."], ["yield_curve_10y3m", -0.1, "The spread is below 0, indicating inversion."],
    ["gscpi", 0.5, "GSCPI is between 0 and 1 standard deviation above its historical average."], ["gscpi", 1.1, "GSCPI is more than 1 standard deviation above its historical average."],
  ];
  for (const [entryId, value, expected] of cases) {
    const signal = engine.evaluate(getSignalRule(entryId), { value }, { historyReadiness: { ready: true } });
    assert.equal(buildQuickInfo(entryId, signal).interpretation, expected, `${entryId}: ${value}`);
  }
});

test("UNKNOWN uses an unavailable explanation and does not invent a directional interpretation", () => {
  const info = buildQuickInfo("vix", { color: "UNKNOWN", transformedValue: null }, { observationDate: null });
  assert.equal(info.value, "Unavailable");
  assert.equal(info.date, "Unavailable");
  assert.match(info.interpretation, /signal is unknown/i);
});
