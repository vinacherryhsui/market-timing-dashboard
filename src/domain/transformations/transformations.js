function usableValue(observation) {
  return observation?.status === "VALID" && Number.isFinite(observation.value)
    ? observation.value
    : null;
}

function recent(observations, count) {
  if (!Array.isArray(observations) || observations.length < count) return null;
  return observations.slice(-count);
}

export function passthrough(observations) {
  const rows = recent(observations, 1);
  return rows ? usableValue(rows[0]) : null;
}

export function periodOverPeriodChange(observations, lag = 1) {
  if (!Number.isInteger(lag) || lag < 1) return null;
  const rows = recent(observations, lag + 1);
  if (!rows) return null;
  const current = usableValue(rows.at(-1));
  const prior = usableValue(rows[0]);
  return current === null || prior === null ? null : current - prior;
}

export function monthlyDifference(observations) {
  return periodOverPeriodChange(observations, 1);
}

export function yoyPercentChange(observations, periodsPerYear = 12) {
  if (!Number.isInteger(periodsPerYear) || periodsPerYear < 1) return null;
  const rows = recent(observations, periodsPerYear + 1);
  if (!rows) return null;
  const current = usableValue(rows.at(-1));
  const prior = usableValue(rows[0]);
  if (current === null || prior === null || prior === 0) return null;
  return ((current / prior) - 1) * 100;
}

export function rollingZScore(observations, window, { requiredValidObservations = window } = {}) {
  if (!Number.isInteger(window) || window < 2) return null;
  const rows = recent(observations, window);
  if (!rows) return null;
  if (usableValue(rows.at(-1)) === null) return null;
  const values = rows.map(usableValue).filter((value) => value !== null);
  if (values.length < requiredValidObservations) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  const standardDeviation = Math.sqrt(variance);
  return standardDeviation === 0 ? null : (values.at(-1) - mean) / standardDeviation;
}

export function trailingMedian(observations, window, { requiredValidObservations = window } = {}) {
  if (!Number.isInteger(window) || window < 1) return null;
  const rows = recent(observations, window);
  if (!rows) return null;
  const values = rows.map(usableValue).filter((value) => value !== null);
  if (values.length < requiredValidObservations) return null;
  values.sort((left, right) => left - right);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}
