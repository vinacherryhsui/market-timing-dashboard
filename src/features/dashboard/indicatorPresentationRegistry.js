import { SignalColor } from "../../domain/signals/SignalRule.js";
import { TransformationType } from "../../domain/transformations/TransformationDefinition.js";
import { canonicalIndicatorMetadataV1 } from "../../domain/indicators/canonicalIndicatorMetadata.js";

// Compatibility selector for the existing formatter API; canonical display metadata owns the definitions.
export const indicatorPresentationRegistry = Object.freeze(Object.fromEntries(
  Object.entries(canonicalIndicatorMetadataV1).map(([entryId, metadata]) => [entryId, metadata.display.quickInfo]),
));

function number(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function rollingLabel(transformation) {
  const window = transformation.window;
  if (transformation.frequency === "MONTHLY" && window % 12 === 0) return `${window / 12}-year`;
  if (transformation.frequency === "QUARTERLY" && window % 4 === 0) return `${window / 4}-year`;
  return `${window}-period`;
}

function valueFrom(signal) {
  return signal.transformedValue;
}

function zPosition(value, transformation) {
  if (value === 0) return `At its ${rollingLabel(transformation)} average`;
  return `${number(Math.abs(value))} standard deviations ${value > 0 ? "above" : "below"} its ${rollingLabel(transformation)} average`;
}

function formatValue(definition, signal, transformation) {
  const value = valueFrom(signal);
  switch (definition.valueStyle) {
    case "PAYROLL_CHANGE": return Number.isFinite(value) ? `${value > 0 ? "+" : ""}${number(value, 0)} thousand jobs` : null;
    case "YOY_PERCENT": return Number.isFinite(value) ? `${number(value)}% year over year` : null;
    case "PERCENT": return Number.isFinite(value) ? `${number(value)}%` : null;
    case "PERCENTAGE_POINT": return Number.isFinite(value) ? `${number(value)} percentage points` : null;
    case "INDEX": return Number.isFinite(value) ? `${number(value)} index level` : null;
    case "ZSCORE": return Number.isFinite(value) ? zPosition(value, transformation) : null;
    case "STANDARDIZED_POSITION": {
      if (!Number.isFinite(value)) return null;
      if (value === 0) return "At its historical average";
      return `${number(Math.abs(value))} standard deviations ${value > 0 ? "above" : "below"} its historical average`;
    }
    case "COMPOUND_PERCENT": return Number.isFinite(value?.current) ? `${number(value.current)}%` : null;
    default: return null;
  }
}

function thresholds(group) {
  return [...new Set((group?.all ?? []).filter((condition) => Number.isFinite(condition.value)).map((condition) => condition.value))].sort((a, b) => a - b);
}

function thresholdPhrase(group, unit = "") {
  const values = thresholds(group);
  if (values.length === 1) {
    const condition = group.all[0];
    const direction = condition.operator === ">=" ? "at or above" : condition.operator === "<=" ? "at or below" : condition.operator === ">" ? "above" : "below";
    return `${direction} ${number(values[0], Math.abs(values[0]) >= 100 ? 0 : 2)}${unit}`;
  }
  if (values.length === 2) return `within the ${number(values[0])}${unit}–${number(values[1])}${unit} band`;
  return "within its configured band";
}

function branchValues(rule, color) {
  const branch = rule.parameters.branches?.find((candidate) => candidate.color === color);
  return [...new Set((branch?.anyOf ?? []).flatMap((group) => group.all).filter((condition) => Number.isFinite(condition.value)).map((condition) => condition.value))].sort((a, b) => a - b);
}

function compact(value, { signed = false, decimals = 2 } = {}) {
  const text = Number(value).toFixed(decimals).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  return signed && value > 0 ? `+${text}` : text;
}
function fixed(value, decimals, signed = false) { return `${signed && value > 0 ? "+" : ""}${Number(value).toFixed(decimals)}`; }

function zScoreInterpretation(definition, color, transformation, rule) {
  const reference = rollingLabel(transformation);
  const boundary = Math.abs(branchValues(rule, SignalColor.RED)[0] ?? 1);
  if (definition.wording === "ZSCORE_HIGHER_BETTER") {
    if (color === SignalColor.GREEN) return `${definition.subject} is above its ${reference} average.`;
    if (color === SignalColor.YELLOW) return `${definition.subject} is up to ${compact(boundary)} standard deviation below its ${reference} average.`;
    return `${definition.subject} is more than ${compact(boundary)} standard deviation below its ${reference} average.`;
  }
  if (color === SignalColor.GREEN) return `${definition.subject} is below its ${reference} average.`;
  if (color === SignalColor.YELLOW) return `${definition.subject} is 0 to ${compact(boundary)} standard deviation above its ${reference} average.`;
  return `${definition.subject} is more than ${compact(boundary)} standard deviation above its ${reference} average.`;
}

function targetBandInterpretation(definition, color, rule, yoy) {
  const inner = branchValues(rule, SignalColor.GREEN);
  const outer = branchValues(rule, SignalColor.RED);
  const suffix = yoy ? " year over year" : "";
  if (color === SignalColor.GREEN) return `${definition.subject} is between ${compact(inner[0])}% and ${compact(inner.at(-1))}%${suffix}.`;
  if (color === SignalColor.YELLOW) return `${definition.subject} is moderately outside the ${compact(inner[0])}%–${compact(inner.at(-1))}% range.`;
  return `${definition.subject} is below ${fixed(outer[0], 1)}% or above ${fixed(outer.at(-1), 1)}%${suffix}.`;
}

function quarterPhrase(count) { return count === 4 ? "four quarters" : `${count} quarters`; }

function compoundInterpretation(definition, color, transformation) {
  const window = transformation.parameters.trailingMedianWindow;
  const lag = transformation.parameters.periodChangeLag;
  const median = `${window}-quarter median`;
  if (color === SignalColor.YELLOW) return `${definition.subject} conditions are mixed across the ${median} and ${quarterPhrase(lag).replace("quarters", "quarter")} change tests.`;
  const level = color === SignalColor.GREEN ? "below" : "above";
  const trend = color === SignalColor.GREEN ? "not rising" : "rising";
  return `${definition.subject} is ${level} its ${median} and ${trend} versus ${quarterPhrase(lag)} ago.`;
}

function formatInterpretation(definition, signal, transformation, rule, matchedGroup) {
  const color = signal.color;
  const green = branchValues(rule, SignalColor.GREEN);
  const red = branchValues(rule, SignalColor.RED);
  switch (definition.wording) {
    case "PAYROLL": {
      const upper = green[0]; const lower = red[0];
      if (color === SignalColor.GREEN) return `Monthly payroll growth is above ${compact(upper, { signed: true, decimals: 0 })}K.`;
      if (color === SignalColor.YELLOW) return `Payroll growth is between ${compact(lower, { decimals: 0 })} and ${compact(upper, { signed: true, decimals: 0 })}K.`;
      return `Payroll growth is below ${compact(lower, { decimals: 0 })}, indicating contraction.`;
    }
    case "SAHM": {
      const warning = green[0]; const trigger = red[0];
      if (color === SignalColor.GREEN) return `The Sahm indicator is below ${fixed(warning, 2)}.`;
      if (color === SignalColor.YELLOW) return `The Sahm indicator is between ${fixed(warning, 2)} and ${fixed(trigger, 2)}.`;
      return `The Sahm indicator is at or above the official ${fixed(trigger, 2)} recession trigger.`;
    }
    case "YOY_GROWTH": {
      const boundary = Math.abs(green[0]);
      if (color === SignalColor.GREEN) return `${definition.subject} are growing more than ${compact(boundary)}% year over year.`;
      if (color === SignalColor.YELLOW) return `${definition.subject} are between -${compact(boundary)}% and +${compact(boundary)}% year over year.`;
      return `${definition.subject} are falling more than ${compact(boundary)}% year over year.`;
    }
    case "TARGET_BAND_YOY": return targetBandInterpretation(definition, color, rule, true);
    case "TARGET_BAND": return targetBandInterpretation(definition, color, rule, false);
    case "TAIWAN_CPI": {
      const middle = branchValues(rule, SignalColor.GREEN); const warnings = branchValues(rule, SignalColor.YELLOW); const extremes = branchValues(rule, SignalColor.RED);
      if (color === SignalColor.GREEN) return `${definition.subject} is between ${compact(middle[0])}% and ${compact(middle.at(-1))}% year over year.`;
      if (color === SignalColor.YELLOW) return `${definition.subject} is between ${compact(warnings[0])}% and ${compact(warnings[1])}%, or between ${compact(warnings[2])}% and ${compact(warnings[3])}% year over year.`;
      return `${definition.subject} is below ${compact(extremes[0])}% or at/above ${compact(extremes[1])}% year over year.`;
    }
    case "VIX": {
      if (color === SignalColor.GREEN) return `VIX is below the ${compact(green[0])} volatility threshold.`;
      if (color === SignalColor.YELLOW) { const band = branchValues(rule, color); return `VIX is between ${compact(band[0])} and ${compact(band[1])}.`; }
      return `VIX is above ${compact(red[0])}.`;
    }
    case "YIELD_CURVE": {
      const positive = green[0]; const inversion = red[0];
      if (color === SignalColor.GREEN) return `The spread is above ${fixed(positive, 2, true)} percentage points.`;
      if (color === SignalColor.YELLOW) return `The spread is between ${compact(inversion)} and ${fixed(positive, 2, true)} percentage points.`;
      return `The spread is below ${compact(inversion)}, indicating inversion.`;
    }
    case "GSCPI": {
      const boundary = red[0];
      if (color === SignalColor.GREEN) return "GSCPI is below its historical average.";
      if (color === SignalColor.YELLOW) return `GSCPI is between 0 and ${compact(boundary)} standard deviation above its historical average.`;
      return `GSCPI is more than ${compact(boundary)} standard deviation above its historical average.`;
    }
    case "ZSCORE_HIGHER_WORSE":
    case "ZSCORE_HIGHER_BETTER": return zScoreInterpretation(definition, color, transformation, rule);
    case "COMPOUND_DEBT":
    case "COMPOUND_DELINQUENCY": return compoundInterpretation(definition, color, transformation);
    default: return null;
  }
}

export function formatIndicatorPresentation(context) {
  const definition = indicatorPresentationRegistry[context.entryId];
  if (!definition || ![SignalColor.GREEN, SignalColor.YELLOW, SignalColor.RED].includes(context.signal.color)) return null;
  const value = formatValue(definition, context.signal, context.transformation);
  const interpretation = formatInterpretation(definition, context.signal, context.transformation, context.rule, context.matchedGroup);
  return value && interpretation ? { value, interpretation } : null;
}
