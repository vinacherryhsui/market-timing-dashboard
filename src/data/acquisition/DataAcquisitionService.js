export class DataAcquisitionError extends Error {
  constructor(message, code = "ACQUISITION_ERROR") {
    super(message);
    this.name = "DataAcquisitionError";
    this.code = code;
  }
}

export class DataAcquisitionService {
  constructor({ adapters = {}, sourceConfigs = [] } = {}) {
    this.adapters = new Map(Object.entries(adapters));
    this.sourceConfigs = sourceConfigs;
  }

  getSourceConfigs(indicatorId) {
    return this.sourceConfigs.filter((config) => config.indicatorId === indicatorId);
  }

  async getLatestObservations(indicatorId) {
    const configs = this.getSourceConfigs(indicatorId);
    if (configs.length === 0) {
      throw new DataAcquisitionError(`No data-source configuration exists for ${indicatorId}.`, "SOURCE_CONFIG_NOT_FOUND");
    }
    return Promise.all(configs.map((config) => {
      const adapter = this.adapters.get(config.provider);
      if (!adapter) {
        throw new DataAcquisitionError(`No adapter is registered for provider ${config.provider}.`, "PROVIDER_ADAPTER_NOT_FOUND");
      }
      return adapter.getLatestObservation(config);
    }));
  }
}
