import { RawObservationStatus } from "../../data/acquisition/RawObservation.js";

function validObservations(observations) {
  return (observations ?? [])
    .filter((item) => item?.status === RawObservationStatus.VALID && Number.isFinite(item.value) && item.observationDate)
    .sort((left, right) => left.observationDate.localeCompare(right.observationDate));
}

function monthlyKey(date) {
  return /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : null;
}

function previousMonth(key) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function quarterKey(date) {
  if (!/^\d{4}-\d{2}/.test(date)) return null;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

function previousQuarter(key) {
  const match = /^(\d{4})-Q([1-4])$/.exec(key);
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  return quarter === 1 ? `${year - 1}-Q4` : `${year}-Q${quarter - 1}`;
}

export function validateRecentContinuity(observations, { frequency, requiredPeriods }) {
  const valid = validObservations(observations);
  if (valid.length === 0) {
    return {
      ready: false, latestObservationDate: null, contiguousStartDate: null,
      contiguousPeriods: 0, requiredPeriods, missingPeriods: [], frequency,
      preparedObservations: [], reason: "NO_VALID_OBSERVATIONS",
    };
  }

  if (frequency === "DAILY") {
    const latest = valid.at(-1);
    const ready = requiredPeriods === 1;
    return {
      ready, latestObservationDate: latest.observationDate,
      contiguousStartDate: latest.observationDate, contiguousPeriods: 1,
      requiredPeriods, missingPeriods: [], frequency,
      preparedObservations: [latest],
      reason: ready ? null : "DAILY_CONTINUITY_NOT_IMPLEMENTED",
    };
  }

  const keyFor = frequency === "MONTHLY" ? monthlyKey : frequency === "QUARTERLY" ? quarterKey : null;
  const previous = frequency === "MONTHLY" ? previousMonth : frequency === "QUARTERLY" ? previousQuarter : null;
  if (!keyFor) throw new TypeError(`Unsupported continuity frequency: ${frequency}.`);

  const byPeriod = new Map(valid.map((item) => [keyFor(item.observationDate), item]));
  const latest = valid.at(-1);
  let expected = keyFor(latest.observationDate);
  const preparedDescending = [];
  const missingPeriods = [];

  for (let index = 0; index < requiredPeriods; index += 1) {
    const observation = byPeriod.get(expected);
    if (!observation) {
      missingPeriods.push(expected);
    } else if (missingPeriods.length === 0) {
      preparedDescending.push(observation);
    }
    expected = previous(expected);
  }

  const preparedObservations = preparedDescending.reverse();
  const ready = missingPeriods.length === 0 && preparedObservations.length === requiredPeriods;
  return {
    ready,
    latestObservationDate: latest.observationDate,
    contiguousStartDate: preparedObservations[0]?.observationDate ?? null,
    contiguousPeriods: preparedObservations.length,
    requiredPeriods,
    missingPeriods,
    frequency,
    preparedObservations,
    reason: ready ? null : "RECENT_HISTORY_NOT_CONTIGUOUS",
  };
}
