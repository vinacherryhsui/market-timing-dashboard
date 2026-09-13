import { RawObservationStatus } from "../../data/acquisition/RawObservation.js";
import { TransformationType as Type } from "../transformations/TransformationDefinition.js";

function isDated(item) {
  return item?.observationDate && !Number.isNaN(Date.parse(item.observationDate));
}

function isValid(item) {
  return isDated(item) && item.status === RawObservationStatus.VALID && Number.isFinite(item.value);
}

function periodKey(date, frequency) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  if (frequency === "MONTHLY") return `${year}-${String(month).padStart(2, "0")}`;
  if (frequency === "QUARTERLY") return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  return date;
}

function shiftPeriod(key, frequency, offset) {
  if (frequency === "MONTHLY") {
    const [year, month] = key.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1 + offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  if (frequency === "QUARTERLY") {
    const match = /^(\d{4})-Q([1-4])$/.exec(key);
    const index = Number(match[1]) * 4 + Number(match[2]) - 1 + offset;
    return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
  }
  return key;
}

function baseResult({ policy, requiredPeriods, requiredValid, valid, allowedMissing, missing, anchors, missingAnchors, prepared, latest, frequency }) {
  const ready = missingAnchors.length === 0 && valid >= requiredValid && missing.length <= allowedMissing;
  return {
    ready,
    readinessPolicy: policy,
    latestObservationDate: latest?.observationDate ?? null,
    requiredPeriods,
    requiredValidObservations: requiredValid,
    validObservations: valid,
    allowedMissingPeriods: allowedMissing,
    missingPeriods: missing,
    requiredAnchorPeriods: anchors,
    missingRequiredAnchors: missingAnchors,
    frequency,
    preparedObservations: prepared,
    reason: ready ? null : missingAnchors.length ? "MISSING_REQUIRED_ANCHOR" : "INSUFFICIENT_VALID_OBSERVATIONS",
  };
}

export function evaluateHistorySufficiency(observations, transformation) {
  const dated = (observations ?? []).filter(isDated).sort((a, b) => a.observationDate.localeCompare(b.observationDate));
  const latest = dated.at(-1) ?? null;
  const frequency = transformation.frequency;

  if (transformation.type === Type.PASSTHROUGH) {
    const latestValid = dated.findLast(isValid) ?? null;
    return baseResult({
      policy: "LATEST_VALID", requiredValid: 1, valid: latestValid ? 1 : 0,
      requiredPeriods: transformation.requiredPeriods,
      allowedMissing: 0, missing: [], anchors: latestValid ? [periodKey(latestValid.observationDate, frequency)] : [],
      missingAnchors: latestValid ? [] : ["LATEST_VALID"], prepared: latestValid ? [latestValid] : [],
      latest: latestValid, frequency,
    });
  }

  if (!latest) {
    return baseResult({
      policy: transformation.type, requiredValid: transformation.requiredPeriods,
      requiredPeriods: transformation.requiredPeriods,
      valid: 0, allowedMissing: 0, missing: [], anchors: ["CURRENT"],
      missingAnchors: ["CURRENT"], prepared: [], latest: null, frequency,
    });
  }

  const latestKey = periodKey(latest.observationDate, frequency);
  const byPeriod = new Map(dated.map((item) => [periodKey(item.observationDate, frequency), item]));

  if (transformation.type === Type.MONTHLY_DIFFERENCE || transformation.type === Type.YOY_PERCENT_CHANGE) {
    const lag = transformation.lag;
    const anchorKeys = [latestKey, shiftPeriod(latestKey, frequency, -lag)];
    const missingAnchors = anchorKeys.filter((key) => !isValid(byPeriod.get(key)));
    const prepared = dated.filter((item) => {
      const key = periodKey(item.observationDate, frequency);
      return key >= anchorKeys[1] && key <= anchorKeys[0];
    });
    return baseResult({
      policy: transformation.type === Type.MONTHLY_DIFFERENCE ? "CURRENT_AND_PREVIOUS" : "CURRENT_AND_LAGGED_PERIOD",
      requiredPeriods: transformation.requiredPeriods,
      requiredValid: 2,
      valid: anchorKeys.filter((key) => isValid(byPeriod.get(key))).length,
      allowedMissing: Math.max(0, lag - 1),
      missing: prepared.filter((item) => !isValid(item)).map((item) => periodKey(item.observationDate, frequency)),
      anchors: anchorKeys, missingAnchors, prepared, latest, frequency,
    });
  }

  const window = transformation.type === Type.ROLLING_ZSCORE
    ? transformation.window
    : transformation.parameters.trailingMedianWindow;
  const windowKeys = Array.from({ length: window }, (_, index) => shiftPeriod(latestKey, frequency, -index));
  const prepared = windowKeys.map((key) => byPeriod.get(key)).filter(Boolean).sort((a, b) => a.observationDate.localeCompare(b.observationDate));
  const missing = windowKeys.filter((key) => !isValid(byPeriod.get(key)));
  const allowedMissing = transformation.parameters.allowedMissingPeriods ?? 1;
  const requiredValid = transformation.parameters.requiredValidObservations ?? (window - allowedMissing);
  const anchors = transformation.type === Type.ROLLING_ZSCORE
    ? [latestKey]
    : [latestKey, shiftPeriod(latestKey, frequency, -transformation.parameters.periodChangeLag)];
  const missingAnchors = anchors.filter((key) => !isValid(byPeriod.get(key)));
  return baseResult({
    policy: transformation.type === Type.ROLLING_ZSCORE
      ? "FIXED_WINDOW_MINIMUM_VALID"
      : "LEVEL_CHANGE_AND_MEDIAN_MINIMUM_VALID",
    requiredPeriods: transformation.requiredPeriods,
    requiredValid,
    valid: prepared.filter(isValid).length,
    allowedMissing,
    missing,
    anchors,
    missingAnchors,
    prepared,
    latest,
    frequency,
  });
}
