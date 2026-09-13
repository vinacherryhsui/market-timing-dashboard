import test from "node:test";
import assert from "node:assert/strict";
import { GridConfiguration } from "../src/domain/grid/GridConfiguration.js";
import { CURRENT_WORKSPACE_KEY, SAVED_LAYOUTS_KEY, WorkspaceLayoutStore } from "../src/features/dashboard/WorkspaceLayoutStore.js";

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

test("workspace and named layouts store only validated GridConfiguration snapshots", () => {
  const storage = memoryStorage();
  const store = new WorkspaceLayoutStore(storage, { now: () => "2026-09-08T00:00:00.000Z", createId: () => "layout-1" });
  const grid = new GridConfiguration();
  grid.addIndicator("vix");
  grid.moveIndicator(0, 7);
  store.saveCurrent(grid);
  const saved = store.saveAs("Risk layout", grid);

  assert.deepEqual(store.loadCurrent().toJSON(), grid.toJSON());
  assert.deepEqual(Object.keys(saved), ["id", "name", "grid", "createdAt", "updatedAt"]);
  assert.equal(store.loadLayout("layout-1").slots[7].entryId, "vix");
  assert.equal(store.loadLayout("layout-1").slots[0].entryId, null);
  assert.doesNotMatch(storage.getItem(SAVED_LAYOUTS_KEY), /signal|marketScore|coverage/i);

  grid.moveIndicator(7, 2);
  store.saveCurrent(grid);
  assert.equal(store.loadLayout("layout-1").slots[7].entryId, "vix", "normal edits must not overwrite a named snapshot");
});

test("malformed, unsupported, and inactive stored grids fail safely", () => {
  const storage = memoryStorage();
  const store = new WorkspaceLayoutStore(storage);
  storage.setItem(CURRENT_WORKSPACE_KEY, "not json");
  assert.equal(store.loadCurrent(), null);
  storage.setItem(CURRENT_WORKSPACE_KEY, JSON.stringify({ version: 999, slots: [] }));
  assert.equal(store.loadCurrent(), null);
  storage.setItem(SAVED_LAYOUTS_KEY, JSON.stringify({ version: 1, layouts: [{ id: "bad", name: "Bad", createdAt: "x", updatedAt: "x", grid: { version: 1, slots: Array.from({ length: 9 }, (_, position) => ({ position, entryId: position ? null : "inactive_indicator" })) } }] }));
  assert.deepEqual(store.listLayouts(), []);
});
