export const SignalColor = Object.freeze({
  GREEN: "GREEN",
  YELLOW: "YELLOW",
  RED: "RED",
  UNKNOWN: "UNKNOWN",
});

export const SignalRuleType = Object.freeze({
  SIMPLE_RANGE: "SIMPLE_RANGE",
  TWO_SIDED_TARGET_BAND: "TWO_SIDED_TARGET_BAND",
  ZSCORE_DIRECTIONAL: "ZSCORE_DIRECTIONAL",
  COMPOUND_CONDITION: "COMPOUND_CONDITION",
});

export const EvidenceBasis = Object.freeze({
  OFFICIAL: "OFFICIAL",
  CONVENTIONAL: "CONVENTIONAL",
  EMPIRICAL: "EMPIRICAL",
  AUTHOR_DEFINED: "AUTHOR_DEFINED",
  REVIEW_NEEDED: "REVIEW_NEEDED",
});

export const SignalRuleStatus = Object.freeze({
  CONFIRMED: "CONFIRMED",
  REVIEW_NEEDED: "REVIEW_NEEDED",
});

const OPERATORS = new Set(["<", "<=", ">", ">=", "=="]);
const EVALUATED_COLORS = [SignalColor.GREEN, SignalColor.YELLOW, SignalColor.RED];

export class SignalRuleValidationError extends Error {
  constructor(message, code = "SIGNAL_RULE_INVALID") {
    super(message);
    this.name = "SignalRuleValidationError";
    this.code = code;
  }
}

export function compare(left, operator, right) {
  switch (operator) {
    case "<": return left < right;
    case "<=": return left <= right;
    case ">": return left > right;
    case ">=": return left >= right;
    case "==": return left === right;
    default: throw new SignalRuleValidationError(`Unsupported operator: ${operator}.`, "UNSUPPORTED_OPERATOR");
  }
}

function conditionsFromBranch(branch) {
  return (branch.anyOf ?? []).flatMap((group) => group.all ?? []);
}

function validateCondition(condition) {
  if (!condition || typeof condition.input !== "string" || !condition.input) {
    throw new SignalRuleValidationError("Every condition requires an input name.", "MISSING_RULE_PARAMETER");
  }
  if (!OPERATORS.has(condition.operator)) {
    throw new SignalRuleValidationError(`Unsupported operator: ${condition.operator}.`, "UNSUPPORTED_OPERATOR");
  }
  const hasInputReference = typeof condition.compareToInput === "string" && condition.compareToInput;
  if (!hasInputReference && ((condition.operator !== "==" && !Number.isFinite(condition.value)) || condition.value === undefined)) {
    throw new SignalRuleValidationError("Every condition requires a compatible comparison value.", "MISSING_RULE_PARAMETER");
  }
}

export function matchesBranch(branch, inputs) {
  return branch.anyOf.some((group) =>
    group.all.every((condition) => compare(
      inputs[condition.input],
      condition.operator,
      condition.compareToInput ? inputs[condition.compareToInput] : condition.value,
    )),
  );
}

function validateBranch(branch, expectedColor) {
  if (branch?.color !== expectedColor || !Array.isArray(branch.anyOf) || branch.anyOf.length === 0) {
    throw new SignalRuleValidationError(`A valid ${expectedColor} branch is required.`, "MISSING_RULE_PARAMETER");
  }
  for (const group of branch.anyOf) {
    if (!Array.isArray(group.all) || group.all.length === 0) {
      throw new SignalRuleValidationError("Condition groups must contain at least one condition.", "MISSING_RULE_PARAMETER");
    }
    group.all.forEach(validateCondition);
  }
}

function validateNumericPartition(branches, inputName) {
  const conditions = branches.flatMap(conditionsFromBranch);
  if (conditions.some((condition) => condition.input !== inputName || !Number.isFinite(condition.value))) {
    throw new SignalRuleValidationError("Numeric range branches must use one numeric input.", "MALFORMED_RANGE_RULE");
  }
  const thresholds = [...new Set(conditions.map((condition) => condition.value))].sort((a, b) => a - b);
  if (thresholds.length === 0) {
    throw new SignalRuleValidationError("Numeric range rules require thresholds.", "MISSING_RULE_PARAMETER");
  }
  const samples = [thresholds[0] - 1, thresholds.at(-1) + 1, ...thresholds];
  for (let index = 1; index < thresholds.length; index += 1) {
    samples.push((thresholds[index - 1] + thresholds[index]) / 2);
  }
  for (const value of samples) {
    const matches = branches.filter((branch) => matchesBranch(branch, { [inputName]: value }));
    if (matches.length > 1) {
      throw new SignalRuleValidationError(`Rule branches overlap at value ${value}.`, "OVERLAPPING_RULE_BRANCHES");
    }
    if (matches.length === 0) {
      throw new SignalRuleValidationError(`Rule branches leave a gap at value ${value}.`, "GAP_IN_RULE_BRANCHES");
    }
  }
}

function validateCompound(parameters) {
  if (!parameters?.green || !parameters?.red || parameters.defaultColor !== SignalColor.YELLOW) {
    throw new SignalRuleValidationError(
      "Compound rules require green, red, and defaultColor YELLOW.",
      "MALFORMED_COMPOUND_RULE",
    );
  }
  for (const branch of [parameters.green, parameters.red]) {
    if (!Array.isArray(branch.anyOf) || branch.anyOf.length === 0) {
      throw new SignalRuleValidationError("Compound branches require condition groups.", "MALFORMED_COMPOUND_RULE");
    }
    try {
      for (const group of branch.anyOf) {
        if (!Array.isArray(group.all) || group.all.length === 0) throw new Error("empty group");
        group.all.forEach(validateCondition);
      }
    } catch (error) {
      if (error instanceof SignalRuleValidationError) throw error;
      throw new SignalRuleValidationError("Compound branches are malformed.", "MALFORMED_COMPOUND_RULE");
    }
  }
}

export function validateSignalRule(rule, { allowReviewNeeded = false } = {}) {
  const requiredStrings = ["ruleId", "indicatorId", "version"];
  if (requiredStrings.some((field) => typeof rule?.[field] !== "string" || !rule[field])) {
    throw new SignalRuleValidationError("ruleId, indicatorId, and version are required.", "MISSING_RULE_PARAMETER");
  }
  if (!Object.values(SignalRuleType).includes(rule.type)) {
    throw new SignalRuleValidationError(`Unsupported rule type: ${rule.type}.`, "UNSUPPORTED_RULE_TYPE");
  }
  if (!Object.values(EvidenceBasis).includes(rule.evidenceBasis)) {
    throw new SignalRuleValidationError(`Unsupported evidence basis: ${rule.evidenceBasis}.`, "UNSUPPORTED_EVIDENCE_BASIS");
  }
  if (!Object.values(SignalRuleStatus).includes(rule.status)) {
    throw new SignalRuleValidationError(`Unsupported rule status: ${rule.status}.`, "UNSUPPORTED_RULE_STATUS");
  }
  if (rule.status === SignalRuleStatus.REVIEW_NEEDED && !allowReviewNeeded && !rule.executableWhenReviewNeeded) {
    throw new SignalRuleValidationError("REVIEW_NEEDED rule is not executable.", "RULE_NOT_EXECUTABLE");
  }

  if (rule.type === SignalRuleType.COMPOUND_CONDITION) {
    validateCompound(rule.parameters);
  } else {
    const branches = rule.parameters?.branches;
    if (!Array.isArray(branches) || branches.length !== 3) {
      throw new SignalRuleValidationError("Range rules require exactly three color branches.", "MISSING_RULE_PARAMETER");
    }
    for (const color of EVALUATED_COLORS) {
      const matching = branches.filter((branch) => branch.color === color);
      if (matching.length !== 1) {
        throw new SignalRuleValidationError(`Rule requires exactly one ${color} branch.`, "MALFORMED_RANGE_RULE");
      }
      validateBranch(matching[0], color);
    }
    validateNumericPartition(branches, rule.parameters.input ?? "value");
  }
  return rule;
}

export function validateSignalRuleSet(rules) {
  const ids = new Set();
  for (const rule of rules ?? []) {
    if (ids.has(rule.ruleId)) {
      throw new SignalRuleValidationError(`Duplicate rule ID: ${rule.ruleId}.`, "DUPLICATE_RULE_ID");
    }
    ids.add(rule.ruleId);
    validateSignalRule(rule, { allowReviewNeeded: true });
  }
  return rules;
}
