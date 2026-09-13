import { createRawObservation, RawObservationStatus } from "../../data/acquisition/RawObservation.js";

function isValid(observation) {
  return observation?.status === RawObservationStatus.VALID && Number.isFinite(observation.value);
}

export function aggregateCalendarMonthMean(observations) {
  const groups = new Map();
  for (const observation of observations ?? []) {
    if (!isValid(observation) || !/^\d{4}-\d{2}-\d{2}/.test(observation.observationDate ?? "")) continue;
    const month = observation.observationDate.slice(0, 7);
    const values = groups.get(month) ?? [];
    values.push(observation.value);
    groups.set(month, values);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, values]) => {
      const sample = (observations ?? []).find((item) => item.observationDate?.startsWith(month));
      return createRawObservation({
        provider: sample.provider,
        datasetId: sample.datasetId,
        indicatorId: sample.indicatorId,
        observationDate: `${month}-01`,
        value: values.reduce((sum, value) => sum + value, 0) / values.length,
        unit: sample.unit,
        frequency: "Monthly",
        retrievedAt: sample.retrievedAt,
        metadata: { ...sample.metadata, aggregation: "CALENDAR_MONTH_MEAN", validDailyCount: values.length },
      });
    });
}
