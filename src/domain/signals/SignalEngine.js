import {
  matchesBranch,
  SignalColor,
  SignalRuleStatus,
  SignalRuleType,
  validateSignalRule,
} from "./SignalRule.js";

function unknown(rule, transformedValue, evaluatedAt, reason) {
  return {
    indicatorId: rule?.indicatorId ?? null,
    sourceRole: rule?.sourceRole ?? null,
    status: "UNKNOWN",
    color: SignalColor.UNKNOWN,
    transformedValue: transformedValue ?? null,
    evaluatedAt,
    ruleId: rule?.ruleId ?? null,
    ruleVersion: rule?.version ?? null,
    evidenceBasis: rule?.evidenceBasis ?? null,
    reason,
  };
}

function extractInputs(transformedResult) {
  if (transformedResult && typeof transformedResult.values === "object") return transformedResult.values;
  return { value: transformedResult?.value };
}

function requiredInputs(rule) {
  if (rule.type === SignalRuleType.COMPOUND_CONDITION) {
    return [...new Set([
      ...rule.parameters.green.anyOf.flatMap((group) => group.all.flatMap((condition) => [condition.input, condition.compareToInput].filter(Boolean))),
      ...rule.parameters.red.anyOf.flatMap((group) => group.all.flatMap((condition) => [condition.input, condition.compareToInput].filter(Boolean))),
    ])];
  }
  return [rule.parameters.input ?? "value"];
}

export class SignalEngine {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
  }

  evaluate(rule, transformedResult, { historyReadiness } = {}) {
    const evaluatedAt = this.now().toISOString();
    const transformedValue = transformedResult?.values ?? transformedResult?.value ?? null;

    if (historyReadiness?.ready === false) {
      return unknown(rule, transformedValue, evaluatedAt, `HISTORY_NOT_READY: ${historyReadiness.reason ?? "unknown reason"}`);
    }
    if (rule?.status === SignalRuleStatus.REVIEW_NEEDED && !rule.executableWhenReviewNeeded) {
      return unknown(rule, transformedValue, evaluatedAt, "RULE_REVIEW_NEEDED");
    }
    try {
      validateSignalRule(rule);
    } catch (error) {
      return unknown(rule, transformedValue, evaluatedAt, `RULE_INVALID: ${error.code ?? error.message}`);
    }

    const inputs = extractInputs(transformedResult);
    const missing = requiredInputs(rule).filter((name) => {
      const value = inputs[name];
      return value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value));
    });
    if (missing.length > 0) {
      return unknown(rule, transformedValue, evaluatedAt, `MISSING_TRANSFORMED_INPUTS: ${missing.join(", ")}`);
    }

    let color;
    if (rule.type === SignalRuleType.COMPOUND_CONDITION) {
      const green = matchesBranch(rule.parameters.green, inputs);
      const red = matchesBranch(rule.parameters.red, inputs);
      if (green && red) return unknown(rule, transformedValue, evaluatedAt, "AMBIGUOUS_COMPOUND_RESULT");
      color = green ? SignalColor.GREEN : red ? SignalColor.RED : SignalColor.YELLOW;
    } else {
      const matches = rule.parameters.branches.filter((branch) => matchesBranch(branch, inputs));
      if (matches.length !== 1) return unknown(rule, transformedValue, evaluatedAt, "UNSAFE_BRANCH_MATCH");
      color = matches[0].color;
    }

    return {
      indicatorId: rule.indicatorId,
      sourceRole: rule.sourceRole ?? null,
      status: "EVALUATED",
      color,
      transformedValue,
      evaluatedAt,
      ruleId: rule.ruleId,
      ruleVersion: rule.version,
      evidenceBasis: rule.evidenceBasis,
      reason: `Matched ${color} branch of ${rule.ruleId}.`,
    };
  }
}
