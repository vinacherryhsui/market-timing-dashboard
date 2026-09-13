import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemoGridConfiguration,
  DEMO_GRID_ENTRY_IDS,
  GridConfiguration,
  GRID_SIZE,
} from "../src/domain/grid/GridConfiguration.js";
import { InMemoryGridConfigurationStore } from "../src/domain/grid/GridConfigurationStore.js";
import { activeSignalRuleRegistry } from "../src/domain/signals/signalRuleRegistry.js";

test("empty grid has nine deterministic empty positions", () => {
  const grid = new GridConfiguration();
  assert.equal(grid.slots.length, GRID_SIZE);
  assert.deepEqual(grid.configuredEntryIds, []);
  assert.deepEqual(grid.slots.map((slot) => slot.position), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test("add uses first available empty slot and preserves holes", () => {
  const grid = new GridConfiguration();
  assert.equal(grid.addIndicator("vix"), 0);
  grid.addIndicator("sahm_rule");
  grid.removeIndicator(0);
  assert.equal(grid.addIndicator("gscpi"), 0);
  assert.deepEqual(grid.configuredEntryIds, ["gscpi", "sahm_rule"]);
});

test("fills nine cells and rejects the tenth", () => {
  const grid = new GridConfiguration();
  const ids = activeSignalRuleRegistry.slice(0, 10).map((rule) => rule.sourceRole ? `${rule.indicatorId}:${rule.sourceRole}` : rule.indicatorId);
  ids.slice(0, 9).forEach((id) => grid.addIndicator(id));
  assert.equal(grid.configuredEntryIds.length, 9);
  assert.throws(() => grid.addIndicator(ids[9]), (error) => error.code === "GRID_FULL");
});

test("rejects inactive, unknown, and malformed entry IDs", () => {
  const grid = new GridConfiguration();
  for (const id of ["auto_sales", "unknown_indicator"]) {
    assert.throws(() => grid.addIndicator(id), (error) => error.code === "GRID_ENTRY_NOT_ACTIVE");
  }
  for (const id of ["", "VIX", "bad:id:role", null]) {
    assert.throws(() => grid.addIndicator(id), (error) => error.code === "GRID_ENTRY_ID_MALFORMED");
  }
});

test("rejects duplicate exact entry", () => {
  const grid = new GridConfiguration();
  grid.addIndicator("global_gpr");
  assert.throws(() => grid.addIndicator("global_gpr"), (error) => error.code === "GRID_ENTRY_DUPLICATE");
});

test("allows headline and core CPI plus both yield curves together", () => {
  const grid = new GridConfiguration();
  ["cpi_core_cpi:headline", "cpi_core_cpi:core", "yield_curve_10y3m", "yield_curve_10y2y"].forEach((id) => grid.addIndicator(id));
  assert.deepEqual(grid.configuredEntryIds, ["cpi_core_cpi:headline", "cpi_core_cpi:core", "yield_curve_10y3m", "yield_curve_10y2y"]);
});

test("remove clears only the requested physical position", () => {
  const grid = new GridConfiguration();
  grid.addIndicator("vix");
  grid.addIndicator("gscpi");
  assert.equal(grid.removeIndicator(0), "vix");
  assert.equal(grid.slots[0].entryId, null);
  assert.equal(grid.slots[1].entryId, "gscpi");
});

test("replace supports no-op and rejects an entry present elsewhere", () => {
  const grid = new GridConfiguration();
  grid.addIndicator("vix");
  grid.addIndicator("gscpi");
  assert.equal(grid.replaceIndicator(0, "sahm_rule"), true);
  assert.equal(grid.slots[0].entryId, "sahm_rule");
  assert.equal(grid.replaceIndicator(0, "sahm_rule"), false);
  assert.throws(() => grid.replaceIndicator(0, "gscpi"), (error) => error.code === "GRID_ENTRY_DUPLICATE");
});

test("move into empty slot preserves the hole", () => {
  const grid = new GridConfiguration();
  grid.addIndicator("vix");
  grid.moveIndicator(0, 5);
  assert.equal(grid.slots[0].entryId, null);
  assert.equal(grid.slots[5].entryId, "vix");
});

test("move swaps two occupied slots without duplication", () => {
  const grid = new GridConfiguration();
  grid.addIndicator("vix");
  grid.addIndicator("gscpi");
  grid.moveIndicator(0, 1);
  assert.deepEqual(grid.configuredEntryIds, ["gscpi", "vix"]);
});

test("rejects moving from empty and all invalid positions", () => {
  const grid = new GridConfiguration();
  assert.throws(() => grid.moveIndicator(0, 1), (error) => error.code === "GRID_SOURCE_EMPTY");
  for (const position of [-1, 9, 1.5, "1"]) {
    assert.throws(() => grid.removeIndicator(position), (error) => error.code === "GRID_POSITION_INVALID");
  }
});

test("serialization round-trip preserves positions and validates active entries", () => {
  const grid = new GridConfiguration();
  grid.addIndicator("vix");
  grid.moveIndicator(0, 8);
  const restored = GridConfiguration.fromJSON(JSON.parse(JSON.stringify(grid)));
  assert.deepEqual(restored.toJSON(), grid.toJSON());
});

test("malformed or invalid saved state is rejected", () => {
  assert.throws(() => GridConfiguration.fromJSON({ version: 2, slots: [] }), (error) => error.code === "GRID_SAVED_STATE_MALFORMED");
  const valid = new GridConfiguration().toJSON();
  valid.slots[1].position = 2;
  assert.throws(() => GridConfiguration.fromJSON(valid), (error) => error.code === "GRID_SAVED_STATE_MALFORMED");
  const inactive = new GridConfiguration().toJSON();
  inactive.slots[0].entryId = "auto_sales";
  assert.throws(() => GridConfiguration.fromJSON(inactive), (error) => error.code === "GRID_ENTRY_NOT_ACTIVE");
  const duplicate = new GridConfiguration().toJSON();
  duplicate.slots[0].entryId = "vix";
  duplicate.slots[1].entryId = "vix";
  assert.throws(() => GridConfiguration.fromJSON(duplicate), (error) => error.code === "GRID_ENTRY_DUPLICATE");
});

test("demo preset is valid, full, and replaceable", () => {
  const grid = createDemoGridConfiguration();
  assert.deepEqual(grid.configuredEntryIds, DEMO_GRID_ENTRY_IDS);
  assert.equal(grid.configuredEntryIds.length, 9);
  assert.equal(grid.replaceIndicator(0, "sahm_rule"), true);
});

test("configured entries preserve physical position order", () => {
  const grid = new GridConfiguration();
  grid.addIndicator("vix");
  grid.addIndicator("gscpi");
  grid.moveIndicator(0, 7);
  assert.deepEqual(grid.getConfiguredEntries(), [{ position: 1, entryId: "gscpi" }, { position: 7, entryId: "vix" }]);
  assert.deepEqual(grid.configuredEntryIds, ["gscpi", "vix"]);
});

test("in-memory store isolates saved state, restores with validation, and clears", () => {
  const store = new InMemoryGridConfigurationStore();
  const grid = new GridConfiguration();
  grid.addIndicator("vix");
  store.save(grid);
  grid.replaceIndicator(0, "gscpi");
  assert.deepEqual(store.load().configuredEntryIds, ["vix"]);
  store.clear();
  assert.equal(store.load(), null);
});
