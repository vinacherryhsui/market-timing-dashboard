import { aggregateCalendarMonthMean } from "../history/frequencyNormalization.js";
import { applyTransformation } from "./TransformationEngine.js";

export function buildTransformedHistory(entry, observations) {
  const ordered = [...(observations ?? [])].sort((a, b) => a.observationDate.localeCompare(b.observationDate));
  const input = entry.transformation.parameters?.monthlyAggregation === "CALENDAR_MONTH_MEAN"
    ? aggregateCalendarMonthMean(ordered) : ordered;
  return input.flatMap((observation, index) => {
    const result = applyTransformation(entry.transformation, input.slice(0, index + 1));
    const value = result.value ?? result.values?.current;
    return Number.isFinite(value) ? [{ observationDate: observation.observationDate, value }] : [];
  });
}
