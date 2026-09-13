import { aggregateCalendarMonthMean } from "./frequencyNormalization.js";
import { validateRecentContinuity } from "./continuity.js";
import { evaluateHistorySufficiency } from "./sufficiency.js";

function sameSource(config, entry) {
  return config.indicatorId === entry.indicatorId &&
    config.datasetId === entry.source.datasetId &&
    (entry.source.role === undefined || config.role === entry.source.role);
}

export class HistoryPreparationService {
  constructor({
    adapters = {}, sourceConfigs = [], historyCache,
    safetyBuffer = 3, maxCacheAgeMs = 24 * 60 * 60 * 1000,
    now = () => new Date(),
  } = {}) {
    this.adapters = new Map(Object.entries(adapters));
    this.sourceConfigs = sourceConfigs;
    this.historyCache = historyCache;
    this.safetyBuffer = safetyBuffer;
    this.maxCacheAgeMs = maxCacheAgeMs;
    this.now = now;
  }

  sourceConfigFor(entry) {
    return this.sourceConfigs.find((config) => sameSource(config, entry));
  }

  requirementFor(entry) {
    const transformation = entry.transformation;
    return {
      requiredPeriods: transformation.requiredPeriods,
      frequency: transformation.frequency,
      safetyBuffer: this.safetyBuffer,
      normalization: transformation.parameters.monthlyAggregation ?? null,
    };
  }

  normalize(observations, requirement) {
    return requirement.normalization === "CALENDAR_MONTH_MEAN"
      ? aggregateCalendarMonthMean(observations)
      : observations;
  }

  evaluate(history, entry, requirement) {
    const observations = this.normalize(history?.observations ?? [], requirement);
    const continuity = validateRecentContinuity(observations, requirement);
    return {
      ...evaluateHistorySufficiency(observations, entry.transformation),
      structuralContinuity: continuity,
      contiguousStartDate: continuity.contiguousStartDate,
      contiguousPeriods: continuity.contiguousPeriods,
    };
  }

  isFresh(history) {
    const retrieved = Date.parse(history?.retrievedAt);
    return Number.isFinite(retrieved) && this.now().valueOf() - retrieved <= this.maxCacheAgeMs;
  }

  async prepare(entry) {
    const config = this.sourceConfigFor(entry);
    const requirement = this.requirementFor(entry);
    if (!config) {
      return {
        ...this.evaluate(null, entry, requirement),
        ready: false,
        reason: "SOURCE_CONFIG_NOT_FOUND",
        error: `No source configuration matches ${entry.id}.`,
        cacheStatus: "NO_CACHE",
      };
    }
    const adapter = this.adapters.get(config.provider);
    if (!adapter) {
      return {
        ...this.evaluate(null, entry, requirement),
        ready: false,
        reason: "PROVIDER_ADAPTER_NOT_FOUND",
        error: `No adapter registered for ${config.provider}.`,
        cacheStatus: "NO_CACHE",
      };
    }

    if (config.acquisitionMode === "PERIODIC_FILE") {
      try {
        const cached = await adapter.getHistory(config, requirement);
        return {
          ...this.evaluate(cached, entry, requirement),
          retrievedAt: cached.retrievedAt,
          cacheStatus: "PERIODIC_FILE_CACHE",
          fetched: false,
        };
      } catch (error) {
        return {
          ...this.evaluate(null, entry, requirement),
          ready: false,
          reason: "PERIODIC_FILE_CACHE_ERROR",
          error: `${error.code ?? "CACHE_ERROR"}: ${error.message}`,
          cacheStatus: "CACHE_ERROR",
          fetched: false,
        };
      }
    }

    const cached = this.historyCache ? await this.historyCache.read(config) : null;
    const cachedReadiness = this.evaluate(cached, entry, requirement);
    if (cachedReadiness.ready && this.isFresh(cached)) {
      return {
        ...cachedReadiness,
        retrievedAt: cached.retrievedAt,
        cacheStatus: "REUSED",
        fetched: false,
      };
    }

    try {
      if (typeof adapter.getHistory !== "function") {
        throw Object.assign(new Error(`${config.provider} does not support history requests.`), {
          code: "HISTORY_NOT_SUPPORTED",
        });
      }
      const fetched = await adapter.getHistory(config, requirement);
      if (this.historyCache) await this.historyCache.write(config, fetched);
      return {
        ...this.evaluate(fetched, entry, requirement),
        retrievedAt: fetched.retrievedAt,
        cacheStatus: "UPDATED",
        fetched: true,
      };
    } catch (error) {
      return {
        ...cachedReadiness,
        ready: false,
        reason: "HISTORY_FETCH_FAILED",
        error: `${error.code ?? "HISTORY_ERROR"}: ${error.message}`,
        retrievedAt: cached?.retrievedAt ?? null,
        cacheStatus: cached ? "PREVIOUS_CACHE_RETAINED" : "NO_CACHE",
        fetched: false,
      };
    }
  }
}
