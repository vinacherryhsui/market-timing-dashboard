import assert from "node:assert/strict";
import test from "node:test";
import { SignalEngine } from "../src/domain/signals/SignalEngine.js";
import {
  EvidenceBasis,
  SignalRuleStatus,
  SignalRuleType,
  validateSignalRule,
  validateSignalRuleSet,
} from "../src/domain/signals/SignalRule.js";

const group = (...conditions) => ({ all: conditions });
const condition = (operator, value, input = "value") => ({ input, operator, value });
const branch = (color, ...groups) => ({ color, anyOf: groups });

function baseRule(overrides = {}) {
  return {
    ruleId: "test-rule",
    indicatorId: "test-indicator",
    sourceRole: null,
    type: SignalRuleType.SIMPLE_RANGE,
    parameters: {
      input: "value",
      branches: [
        branch("GREEN", group(condition("<", 20))),
        branch("YELLOW", group(condition(">=", 20), condition("<=", 30))),
        branch("RED", group(condition(">", 30))),
      ],
    },
    evidenceBasis: EvidenceBasis.CONVENTIONAL,
    version: "1.0.0",
    status: SignalRuleStatus.CONFIRMED,
    ...overrides,
  };
}

const engine = new SignalEngine({ now: () => new Date("2026-09-06T00:00:00.000Z") });

test("evaluates simple range rules and exact boundaries", () => {
  assert.equal(engine.evaluate(baseRule(), { value: 19 }).color, "GREEN");
  assert.equal(engine.evaluate(baseRule(), { value: 20 }).color, "YELLOW");
  assert.equal(engine.evaluate(baseRule(), { value: 30 }).color, "YELLOW");
  assert.equal(engine.evaluate(baseRule(), { value: 31 }).color, "RED");
});

test("evaluates an inverted direction range", () => {
  const rule = baseRule({
    ruleId: "inverse",
    parameters: {
      input: "value",
      branches: [
        branch("GREEN", group(condition(">", 30))),
        branch("YELLOW", group(condition(">=", 20), condition("<=", 30))),
        branch("RED", group(condition("<", 20))),
      ],
    },
  });
  assert.equal(engine.evaluate(rule, { value: 40 }).color, "GREEN");
  assert.equal(engine.evaluate(rule, { value: 10 }).color, "RED");
});

test("evaluates two-sided target bands", () => {
  const rule = baseRule({
    ruleId: "target-band",
    type: SignalRuleType.TWO_SIDED_TARGET_BAND,
    parameters: {
      input: "value",
      branches: [
        branch("GREEN", group(condition(">=", -1), condition("<=", 1))),
        branch("YELLOW",
          group(condition(">=", -2), condition("<", -1)),
          group(condition(">", 1), condition("<=", 2))),
        branch("RED", group(condition("<", -2)), group(condition(">", 2))),
      ],
    },
  });
  assert.equal(engine.evaluate(rule, { value: 0 }).color, "GREEN");
  assert.equal(engine.evaluate(rule, { value: -2 }).color, "YELLOW");
  assert.equal(engine.evaluate(rule, { value: 2.1 }).color, "RED");
});

test("evaluates higher-is-worse z-score rules", () => {
  const rule = baseRule({ ruleId: "z-high", type: SignalRuleType.ZSCORE_DIRECTIONAL });
  assert.equal(engine.evaluate(rule, { value: 10 }).color, "GREEN");
  assert.equal(engine.evaluate(rule, { value: 40 }).color, "RED");
});

test("evaluates lower-is-worse z-score rules", () => {
  const rule = baseRule({
    ruleId: "z-low",
    type: SignalRuleType.ZSCORE_DIRECTIONAL,
    parameters: {
      input: "value",
      branches: [
        branch("GREEN", group(condition(">", 1))),
        branch("YELLOW", group(condition(">=", -1), condition("<=", 1))),
        branch("RED", group(condition("<", -1))),
      ],
    },
  });
  assert.equal(engine.evaluate(rule, { value: 2 }).color, "GREEN");
  assert.equal(engine.evaluate(rule, { value: -2 }).color, "RED");
});

test("evaluates generic compound conditions", () => {
  const rule = baseRule({
    ruleId: "compound",
    type: SignalRuleType.COMPOUND_CONDITION,
    parameters: {
      green: { anyOf: [group(
        { input: "level", operator: "<=", compareToInput: "median" },
        { input: "change", operator: "<=", value: 0 },
      )] },
      red: { anyOf: [group(
        { input: "level", operator: ">", compareToInput: "median" },
        { input: "change", operator: ">", value: 0 },
      )] },
      defaultColor: "YELLOW",
    },
  });
  assert.equal(engine.evaluate(rule, { values: { level: 8, median: 10, change: -1 } }).color, "GREEN");
  assert.equal(engine.evaluate(rule, { values: { level: 12, median: 10, change: 1 } }).color, "RED");
  assert.equal(engine.evaluate(rule, { values: { level: 12, median: 10, change: -1 } }).color, "YELLOW");
});

test("returns UNKNOWN for null transformed value", () => {
  const signal = engine.evaluate(baseRule(), { value: null });
  assert.equal(signal.color, "UNKNOWN");
  assert.notEqual(signal.color, "YELLOW");
});

test("returns UNKNOWN when history is not ready", () => {
  const signal = engine.evaluate(baseRule(), { value: 10 }, { historyReadiness: { ready: false, reason: "MISSING_ANCHOR" } });
  assert.equal(signal.color, "UNKNOWN");
  assert.match(signal.reason, /HISTORY_NOT_READY/);
});

test("returns UNKNOWN for non-executable REVIEW_NEEDED rule", () => {
  const signal = engine.evaluate(baseRule({ status: SignalRuleStatus.REVIEW_NEEDED }), { value: 10 });
  assert.equal(signal.color, "UNKNOWN");
  assert.equal(signal.reason, "RULE_REVIEW_NEEDED");
});

test("explicitly permitted REVIEW_NEEDED rule can execute", () => {
  const signal = engine.evaluate(baseRule({
    status: SignalRuleStatus.REVIEW_NEEDED,
    executableWhenReviewNeeded: true,
    evidenceBasis: EvidenceBasis.REVIEW_NEEDED,
  }), { value: 10 });
  assert.equal(signal.color, "GREEN");
});

test("returns UNKNOWN when a required compound input is unavailable", () => {
  const rule = baseRule({
    type: SignalRuleType.COMPOUND_CONDITION,
    parameters: {
      green: { anyOf: [group({ input: "a", operator: ">", value: 0 })] },
      red: { anyOf: [group({ input: "b", operator: "<", value: 0 })] },
      defaultColor: "YELLOW",
    },
  });
  assert.equal(engine.evaluate(rule, { values: { a: 1 } }).color, "UNKNOWN");
});

test("validation rejects overlapping branches", () => {
  const rule = baseRule();
  rule.parameters.branches[1] = branch("YELLOW", group(condition(">=", 19), condition("<=", 30)));
  assert.throws(() => validateSignalRule(rule), (error) => error.code === "OVERLAPPING_RULE_BRANCHES");
});

test("validation rejects gaps between branches", () => {
  const rule = baseRule();
  rule.parameters.branches[1] = branch("YELLOW", group(condition(">", 20), condition("<", 30)));
  assert.throws(() => validateSignalRule(rule), (error) => error.code === "GAP_IN_RULE_BRANCHES");
});

test("validation rejects an impossible range", () => {
  const rule = baseRule();
  rule.parameters.branches[1] = branch("YELLOW", group(condition(">=", 30), condition("<=", 20)));
  assert.throws(() => validateSignalRule(rule), (error) => error.code === "GAP_IN_RULE_BRANCHES");
});

test("validation rejects missing required parameters", () => {
  const rule = baseRule();
  delete rule.parameters;
  assert.throws(() => validateSignalRule(rule), (error) => error.code === "MISSING_RULE_PARAMETER");
});

test("validation rejects malformed compound rules", () => {
  const rule = baseRule({ type: SignalRuleType.COMPOUND_CONDITION, parameters: { defaultColor: "YELLOW" } });
  assert.throws(() => validateSignalRule(rule), (error) => error.code === "MALFORMED_COMPOUND_RULE");
});

test("validation rejects unsupported operators and evidence basis", () => {
  const operatorRule = baseRule();
  operatorRule.parameters.branches[0] = branch("GREEN", group(condition("!=", 20)));
  assert.throws(() => validateSignalRule(operatorRule), (error) => error.code === "UNSUPPORTED_OPERATOR");
  assert.throws(
    () => validateSignalRule(baseRule({ evidenceBasis: "SOURCE_IS_VALID" })),
    (error) => error.code === "UNSUPPORTED_EVIDENCE_BASIS",
  );
});

test("validation rejects duplicate rule IDs", () => {
  assert.throws(() => validateSignalRuleSet([baseRule(), baseRule()]), (error) => error.code === "DUPLICATE_RULE_ID");
});
