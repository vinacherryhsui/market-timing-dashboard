import { canonicalIndicatorMetadataV1 } from "../indicators/canonicalIndicatorMetadata.js";

export const GRID_SIZE = 9;
export const GRID_SERIALIZATION_VERSION = 1;

export class GridConfigurationError extends Error {
  constructor(message, code = "GRID_CONFIGURATION_INVALID") {
    super(message);
    this.name = "GridConfigurationError";
    this.code = code;
  }
}

export const activeGridEntryIds = Object.freeze(
  Object.values(canonicalIndicatorMetadataV1).map(({ machine }) => machine.entryId),
);

function emptySlots() {
  return Array.from({ length: GRID_SIZE }, (_, position) => ({ position, entryId: null }));
}

function validatePosition(position) {
  if (!Number.isInteger(position) || position < 0 || position >= GRID_SIZE) {
    throw new GridConfigurationError(`Grid position must be an integer from 0 to ${GRID_SIZE - 1}.`, "GRID_POSITION_INVALID");
  }
}

function validateEntryId(entryId, activeEntries) {
  if (typeof entryId !== "string" || !/^[a-z][a-z0-9_]*(?::[a-z][a-z0-9_]*)?$/.test(entryId)) {
    throw new GridConfigurationError(`Malformed grid entry ID: ${String(entryId)}.`, "GRID_ENTRY_ID_MALFORMED");
  }
  if (!activeEntries.has(entryId)) {
    throw new GridConfigurationError(`Grid entry is not active: ${entryId}.`, "GRID_ENTRY_NOT_ACTIVE");
  }
}

function validateSlots(slots, activeEntries) {
  if (!Array.isArray(slots) || slots.length !== GRID_SIZE) {
    throw new GridConfigurationError(`Serialized grid must contain exactly ${GRID_SIZE} slots.`, "GRID_SAVED_STATE_MALFORMED");
  }
  const seen = new Set();
  return slots.map((slot, index) => {
    if (!slot || slot.position !== index || !(slot.entryId === null || typeof slot.entryId === "string")) {
      throw new GridConfigurationError(`Serialized grid slot ${index} is malformed.`, "GRID_SAVED_STATE_MALFORMED");
    }
    if (slot.entryId !== null) {
      validateEntryId(slot.entryId, activeEntries);
      if (seen.has(slot.entryId)) {
        throw new GridConfigurationError(`Duplicate grid entry: ${slot.entryId}.`, "GRID_ENTRY_DUPLICATE");
      }
      seen.add(slot.entryId);
    }
    return { position: index, entryId: slot.entryId };
  });
}

export class GridConfiguration {
  constructor({ slots = emptySlots(), activeEntryIds = activeGridEntryIds } = {}) {
    this.activeEntries = new Set(activeEntryIds);
    this.slots = validateSlots(slots, this.activeEntries);
  }

  addIndicator(entryId) {
    validateEntryId(entryId, this.activeEntries);
    if (this.configuredEntryIds.includes(entryId)) {
      throw new GridConfigurationError(`Duplicate grid entry: ${entryId}.`, "GRID_ENTRY_DUPLICATE");
    }
    const target = this.slots.find((slot) => slot.entryId === null);
    if (!target) throw new GridConfigurationError("The 3x3 grid is full.", "GRID_FULL");
    target.entryId = entryId;
    return target.position;
  }

  removeIndicator(position) {
    validatePosition(position);
    const removed = this.slots[position].entryId;
    this.slots[position].entryId = null;
    return removed;
  }

  replaceIndicator(position, entryId) {
    validatePosition(position);
    validateEntryId(entryId, this.activeEntries);
    if (this.slots[position].entryId === entryId) return false;
    if (this.configuredEntryIds.includes(entryId)) {
      throw new GridConfigurationError(`Duplicate grid entry: ${entryId}.`, "GRID_ENTRY_DUPLICATE");
    }
    this.slots[position].entryId = entryId;
    return true;
  }

  moveIndicator(fromPosition, toPosition) {
    validatePosition(fromPosition);
    validatePosition(toPosition);
    if (this.slots[fromPosition].entryId === null) {
      throw new GridConfigurationError(`Cannot move empty grid position ${fromPosition}.`, "GRID_SOURCE_EMPTY");
    }
    if (fromPosition === toPosition) return false;
    const source = this.slots[fromPosition].entryId;
    this.slots[fromPosition].entryId = this.slots[toPosition].entryId;
    this.slots[toPosition].entryId = source;
    return true;
  }

  getConfiguredEntries() {
    return this.slots.filter((slot) => slot.entryId !== null).map((slot) => ({ ...slot }));
  }

  get configuredEntryIds() {
    return this.getConfiguredEntries().map((slot) => slot.entryId);
  }

  toJSON() {
    return {
      version: GRID_SERIALIZATION_VERSION,
      slots: this.slots.map((slot) => ({ ...slot })),
    };
  }

  static fromJSON(saved, options = {}) {
    if (!saved || saved.version !== GRID_SERIALIZATION_VERSION || !Array.isArray(saved.slots)) {
      throw new GridConfigurationError("Saved grid state is malformed or has an unsupported version.", "GRID_SAVED_STATE_MALFORMED");
    }
    return new GridConfiguration({ slots: saved.slots, activeEntryIds: options.activeEntryIds ?? activeGridEntryIds });
  }
}

export const DEMO_GRID_ENTRY_IDS = Object.freeze([
  "nonfarm_payrolls",
  "underemployment",
  "consumer_confidence",
  "cpi_core_cpi:core",
  "yield_curve_10y2y",
  "credit_card_delinquency",
  "vix",
  "gscpi",
  "global_gpr",
]);

export function createDemoGridConfiguration() {
  const grid = new GridConfiguration();
  DEMO_GRID_ENTRY_IDS.forEach((entryId) => grid.addIndicator(entryId));
  return grid;
}
