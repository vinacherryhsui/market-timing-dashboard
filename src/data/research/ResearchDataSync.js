export class ResearchDataSync {
  constructor({ adapters = {}, sourceConfigs = [] } = {}) {
    this.adapters = new Map(Object.entries(adapters));
    this.sourceConfigs = sourceConfigs.filter((config) => config.acquisitionMode === "PERIODIC_FILE");
  }

  async syncAll() {
    const results = [];
    for (const config of this.sourceConfigs) {
      const adapter = this.adapters.get(config.provider);
      if (!adapter) {
        results.push({ indicatorId: config.indicatorId, ok: false, error: `No adapter registered for ${config.provider}.` });
        continue;
      }
      try {
        const series = await adapter.sync(config);
        results.push({ indicatorId: config.indicatorId, ok: true, series });
      } catch (error) {
        results.push({ indicatorId: config.indicatorId, ok: false, error: `${error.code ?? "SYNC_ERROR"}: ${error.message}` });
      }
    }
    return results;
  }
}
