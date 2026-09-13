import { getCanonicalIndicatorMetadataV1 } from "../../domain/indicators/canonicalIndicatorMetadata.js";
import { getSignalRule } from "../../domain/signals/signalRuleRegistry.js";
import { matchesBranch, SignalColor, SignalRuleType } from "../../domain/signals/SignalRule.js";
import { TransformationFrequency, TransformationType } from "../../domain/transformations/TransformationDefinition.js";
import { formatIndicatorPresentation } from "./indicatorPresentationRegistry.js";

export const QUICK_INFO_FALLBACK = "A directional reading is not currently available.";

function transformationEntry(entryId) {
  const metadata = getCanonicalIndicatorMetadataV1(entryId);
  if (!metadata) return null;
  const transformation = metadata.machine.transformation;
  return { id: entryId, transformation: { ...transformation, frequency: transformation.evaluationFrequency } };
}

function sourceConfig(entryId) {
  const metadata = getCanonicalIndicatorMetadataV1(entryId);
  return metadata ? { ...metadata.machine.source, provider: metadata.machine.source.providerId } : null;
}

function decimals(value, unit) {
  if (unit === "THOUSANDS_OF_JOBS") return 0;
  return Math.abs(value) >= 100 ? 1 : 2;
}

function unitSuffix(unit, { yoy = false } = {}) {
  if (unit === "THOUSANDS_OF_JOBS") return "K";
  if (unit === "PERCENT") return yoy ? "% YoY" : "%";
  if (unit === "PERCENTAGE_POINTS") return " pp";
  return "";
}

function signed(value, digits) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function rollingYears(window, frequency) {
  if (!window) return null;
  const divisor = frequency === TransformationFrequency.MONTHLY ? 12 : frequency === TransformationFrequency.QUARTERLY ? 4 : null;
  return divisor && window % divisor === 0 ? `${window / divisor}-year` : `${window}-period`;
}

function effectiveUnit(transformation, rule, source) {
  if (transformation.outputUnit !== "SOURCE_UNIT") return transformation.outputUnit;
  if (rule.methodology?.unit) return rule.methodology.unit;
  if (source?.rawUnit === "STANDARD_DEVIATIONS") return "ZSCORE";
  if (["PERCENT", "PERCENTAGE_POINTS"].includes(source?.rawUnit)) return source.rawUnit;
  return "NUMBER";
}

function inputsFromSignal(signal) {
  return signal.transformedValue && typeof signal.transformedValue === "object"
    ? signal.transformedValue
    : { value: signal.transformedValue };
}

function formatNumeric(value, unit, options = {}) {
  const digits = decimals(value, unit);
  return `${options.signed ? signed(value, digits) : value.toFixed(digits)}${unitSuffix(unit, options)}`;
}

function formatZScore(value, transformation) {
  const reference = rollingYears(transformation.window, transformation.frequency);
  if (value === 0) return `${reference ? `${reference} ` : ""}average (0.00 SD)`;
  return `${Math.abs(value).toFixed(2)} SD ${value > 0 ? "above" : "below"} ${reference ? `${reference} ` : ""}average`;
}

function formatValue(signal, transformation, rule, source) {
  const unit = effectiveUnit(transformation, rule, source);
  const value = signal.transformedValue;
  if (transformation.type === TransformationType.LEVEL_PLUS_PERIOD_CHANGE_AND_TRAILING_MEDIAN) {
    if (!Number.isFinite(value?.current) || !Number.isFinite(value?.periodChange4Q)) return "Unavailable";
    return `${value.current.toFixed(2)}% · 4Q ${signed(value.periodChange4Q, 2)} pp`;
  }
  if (!Number.isFinite(value)) return "Unavailable";
  if (transformation.type === TransformationType.ROLLING_ZSCORE || unit === "ZSCORE") return formatZScore(value, transformation);
  return formatNumeric(value, unit, {
    yoy: transformation.type === TransformationType.YOY_PERCENT_CHANGE,
    signed: transformation.type === TransformationType.MONTHLY_DIFFERENCE,
  });
}

function relation(operator) {
  return ({ "<": "below", "<=": "at or below", ">": "above", ">=": "at or above", "==": "equal to" })[operator];
}

function inputLabel(input, transformation) {
  if (input === "current") return "Current level";
  if (input === "trailingMedian") return "trailing reference median";
  if (input === "periodChange4Q") return "Four-quarter change";
  if (transformation.type === TransformationType.YOY_PERCENT_CHANGE) return "Year-over-year change";
  if (transformation.type === TransformationType.MONTHLY_DIFFERENCE) return "Monthly change";
  return "Current reading";
}

function conditionText(condition, inputs, transformation, unit) {
  const left = inputs[condition.input];
  const comparisonUnit = condition.input === "periodChange4Q" ? "PERCENTAGE_POINTS" : unit;
  const right = condition.compareToInput ? inputs[condition.compareToInput] : condition.value;
  const rightText = condition.compareToInput
    ? inputLabel(condition.compareToInput, transformation).toLowerCase()
    : formatNumeric(right, comparisonUnit);
  return `${inputLabel(condition.input, transformation)} (${formatNumeric(left, comparisonUnit)}) is ${relation(condition.operator)} ${rightText}`;
}

function matchedGroup(rule, color, inputs) {
  const branch = rule.parameters.branches?.find((candidate) => candidate.color === color);
  return branch?.anyOf.find((group) => matchesBranch({ anyOf: [group] }, inputs)) ?? null;
}

function describeZScore(value, transformation, group) {
  const conditions = group.all.map((condition) => `${relation(condition.operator)} ${condition.value.toFixed(2)} SD`).join(" and ");
  return `The reading is ${formatZScore(value, transformation)}; this falls ${conditions}.`;
}

function describeTarget(value, rule, group, transformation, unit) {
  const band = group.all.map((condition) => conditionText(condition, { value }, transformation, unit)).join(" and ");
  const anchor = rule.methodology?.anchor;
  return Number.isFinite(anchor)
    ? `${band}; distance from the ${anchor.toFixed(1)}% reference is ${Math.abs(value - anchor).toFixed(2)} pp.`
    : `${band}.`;
}

function describeCompound(rule, color, inputs, transformation, unit) {
  const branch = color === SignalColor.GREEN ? rule.parameters.green : color === SignalColor.RED ? rule.parameters.red : null;
  const group = branch?.anyOf.find((candidate) => matchesBranch({ anyOf: [candidate] }, inputs));
  if (group) return `${group.all.map((condition) => conditionText(condition, inputs, transformation, unit)).join("; and ")}.`;
  const medianRelation = inputs.current === inputs.trailingMedian ? "at" : inputs.current > inputs.trailingMedian ? "above" : "below";
  const changeDirection = inputs.periodChange4Q === 0 ? "unchanged" : inputs.periodChange4Q > 0 ? "rising" : "falling";
  return `Current level is ${medianRelation} its trailing ${rollingYears(transformation.parameters.trailingMedianWindow, transformation.frequency)} median, while the four-quarter level is ${changeDirection}.`;
}

function interpretation(signal, transformation, rule, source) {
  if (![SignalColor.GREEN, SignalColor.YELLOW, SignalColor.RED].includes(signal.color)) {
    return "Interpretation unavailable because the current signal is unknown.";
  }
  const inputs = inputsFromSignal(signal);
  const unit = effectiveUnit(transformation, rule, source);
  if (rule.type === SignalRuleType.COMPOUND_CONDITION) return describeCompound(rule, signal.color, inputs, transformation, unit);
  const group = matchedGroup(rule, signal.color, inputs);
  if (!group) return QUICK_INFO_FALLBACK;
  if (rule.type === SignalRuleType.ZSCORE_DIRECTIONAL) return describeZScore(inputs.value, transformation, group);
  if (rule.type === SignalRuleType.TWO_SIDED_TARGET_BAND) return describeTarget(inputs.value, rule, group, transformation, unit);
  return `${group.all.map((condition) => conditionText(condition, inputs, transformation, unit)).join(" and ")}.`;
}

export function formatObservationPeriod(observationDate, frequency) {
  if (!observationDate || !/^\d{4}-\d{2}-\d{2}/.test(observationDate)) return "Unavailable";
  const year = observationDate.slice(0, 4);
  const month = Number(observationDate.slice(5, 7));
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" })
    .format(new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00Z`));
  if (frequency === TransformationFrequency.MONTHLY) return `${monthName} ${year}`;
  if (frequency === TransformationFrequency.QUARTERLY) return `Q${Math.ceil(month / 3)} ${year}`;
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${observationDate.slice(0, 10)}T00:00:00Z`));
}

export function buildQuickInfo(entryId, signal, { observationDate = null, source = null } = {}) {
  const entry = transformationEntry(entryId);
  const rule = getSignalRule(entryId);
  const configuredSource = sourceConfig(entryId);
  if (!entry || !rule) return {
    value: "Unavailable", date: "Unavailable", source: source ?? "Source unavailable", interpretation: QUICK_INFO_FALLBACK,
  };
  const inputs = inputsFromSignal(signal);
  const hasTransformedValue = rule.type === SignalRuleType.COMPOUND_CONDITION
    ? Number.isFinite(inputs.current) && Number.isFinite(inputs.trailingMedian) && Number.isFinite(inputs.periodChange4Q)
    : Number.isFinite(inputs.value);
  if (!hasTransformedValue) return {
    value: "Unavailable",
    date: formatObservationPeriod(observationDate, entry.transformation.frequency),
    source: source ?? `${configuredSource?.provider ?? "Source unavailable"} / ${configuredSource?.datasetId ?? "Unknown dataset"}`,
    interpretation: signal.color === SignalColor.UNKNOWN
      ? "Interpretation unavailable because the current signal is unknown."
      : "Interpretation unavailable because the transformed value is unavailable.",
  };
  const group = rule.type === SignalRuleType.COMPOUND_CONDITION ? null : matchedGroup(rule, signal.color, inputs);
  const specific = formatIndicatorPresentation({
    entryId, signal, transformation: entry.transformation, rule, source: configuredSource, matchedGroup: group,
  });
  return {
    value: specific?.value ?? formatValue(signal, entry.transformation, rule, configuredSource),
    date: formatObservationPeriod(observationDate, entry.transformation.frequency),
    source: source ?? `${configuredSource?.provider ?? "Source unavailable"} / ${configuredSource?.datasetId ?? "Unknown dataset"}`,
    interpretation: specific?.interpretation ?? interpretation(signal, entry.transformation, rule, configuredSource),
  };
}
