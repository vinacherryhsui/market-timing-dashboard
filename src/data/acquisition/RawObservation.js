export const RawObservationStatus = Object.freeze({
  VALID: "VALID",
  MISSING: "MISSING",
});

export function createRawObservation({
  provider, datasetId, indicatorId, observationDate, value, unit = null,
  frequency = null, retrievedAt, status, metadata = {},
}) {
  if (!provider || !datasetId || !indicatorId) {
    throw new TypeError("provider, datasetId, and indicatorId are required.");
  }
  const normalizedValue = value ?? null;
  const normalizedStatus = normalizedValue === null
    ? RawObservationStatus.MISSING
    : (status ?? RawObservationStatus.VALID);
  return {
    provider,
    datasetId,
    indicatorId,
    observationDate: observationDate ?? null,
    value: normalizedValue,
    unit,
    frequency,
    retrievedAt,
    status: normalizedStatus,
    metadata,
  };
}
