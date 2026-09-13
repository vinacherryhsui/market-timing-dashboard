export const TransformationType = Object.freeze({
  PASSTHROUGH: "PASSTHROUGH",
  MONTHLY_DIFFERENCE: "MONTHLY_DIFFERENCE",
  YOY_PERCENT_CHANGE: "YOY_PERCENT_CHANGE",
  ROLLING_ZSCORE: "ROLLING_ZSCORE",
  LEVEL_PLUS_PERIOD_CHANGE_AND_TRAILING_MEDIAN: "LEVEL_PLUS_PERIOD_CHANGE_AND_TRAILING_MEDIAN",
});

export const TransformationFrequency = Object.freeze({
  DAILY: "DAILY",
  MONTHLY: "MONTHLY",
  QUARTERLY: "QUARTERLY",
});

export function deriveRequiredPeriods(definition) {
  switch (definition.type) {
    case TransformationType.PASSTHROUGH:
      return 1;
    case TransformationType.MONTHLY_DIFFERENCE:
      return (definition.lag ?? 1) + 1;
    case TransformationType.YOY_PERCENT_CHANGE:
      return (definition.lag ?? 12) + 1;
    case TransformationType.ROLLING_ZSCORE:
      return definition.window;
    case TransformationType.LEVEL_PLUS_PERIOD_CHANGE_AND_TRAILING_MEDIAN:
      return Math.max(
        definition.parameters?.trailingMedianWindow ?? 0,
        (definition.parameters?.periodChangeLag ?? 0) + 1,
      );
    default:
      throw new TypeError(`Unsupported transformation type: ${definition.type}.`);
  }
}

export function defineTransformation(definition) {
  if (!Object.values(TransformationType).includes(definition?.type)) {
    throw new TypeError("A supported transformation type is required.");
  }
  if (!Object.values(TransformationFrequency).includes(definition.frequency)) {
    throw new TypeError("A supported transformation frequency is required.");
  }

  const requiredPeriods = deriveRequiredPeriods(definition);
  if (!Number.isInteger(requiredPeriods) || requiredPeriods < 1) {
    throw new TypeError("Transformation requiredPeriods must be a positive integer.");
  }
  if (definition.requiredPeriods !== undefined && definition.requiredPeriods !== requiredPeriods) {
    throw new TypeError(
      `requiredPeriods ${definition.requiredPeriods} does not match derived requirement ${requiredPeriods}.`,
    );
  }

  return Object.freeze({
    type: definition.type,
    frequency: definition.frequency,
    window: definition.window ?? null,
    lag: definition.lag ?? null,
    requiredPeriods,
    outputUnit: definition.outputUnit ?? null,
    version: definition.version ?? "1.0.0",
    parameters: Object.freeze({ ...(definition.parameters ?? {}) }),
  });
}
