import { TransformationType as Type } from "./TransformationDefinition.js";
import {
  monthlyDifference,
  passthrough,
  periodOverPeriodChange,
  rollingZScore,
  trailingMedian,
  yoyPercentChange,
} from "./transformations.js";

export function applyTransformation(definition, observations) {
  switch (definition.type) {
    case Type.PASSTHROUGH:
      return { value: passthrough(observations) };
    case Type.MONTHLY_DIFFERENCE:
      return { value: monthlyDifference(observations) };
    case Type.YOY_PERCENT_CHANGE:
      return { value: yoyPercentChange(observations, definition.lag) };
    case Type.ROLLING_ZSCORE:
      return {
        value: rollingZScore(observations, definition.window, {
          requiredValidObservations: definition.parameters.requiredValidObservations,
        }),
      };
    case Type.LEVEL_PLUS_PERIOD_CHANGE_AND_TRAILING_MEDIAN: {
      const current = passthrough(observations);
      const periodChange4Q = periodOverPeriodChange(
        observations,
        definition.parameters.periodChangeLag,
      );
      const median = trailingMedian(observations, definition.parameters.trailingMedianWindow, {
        requiredValidObservations: definition.parameters.requiredValidObservations,
      });
      return { values: { current, trailingMedian: median, periodChange4Q } };
    }
    default:
      return { value: null };
  }
}
