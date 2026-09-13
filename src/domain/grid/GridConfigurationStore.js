import { GridConfiguration, GridConfigurationError, activeGridEntryIds } from "./GridConfiguration.js";

export class GridConfigurationStore {
  load() { throw new Error("GridConfigurationStore.load() must be implemented."); }
  save(_configuration) { throw new Error("GridConfigurationStore.save() must be implemented."); }
  clear() { throw new Error("GridConfigurationStore.clear() must be implemented."); }
}

export class InMemoryGridConfigurationStore extends GridConfigurationStore {
  constructor({ activeEntryIds = activeGridEntryIds } = {}) {
    super();
    this.activeEntryIds = activeEntryIds;
    this.saved = null;
  }

  load() {
    return this.saved === null
      ? null
      : GridConfiguration.fromJSON(JSON.parse(this.saved), { activeEntryIds: this.activeEntryIds });
  }

  save(configuration) {
    if (!(configuration instanceof GridConfiguration)) {
      throw new GridConfigurationError("Store can only save a GridConfiguration.", "GRID_STORE_VALUE_INVALID");
    }
    this.saved = JSON.stringify(configuration.toJSON());
  }

  clear() {
    this.saved = null;
  }
}
