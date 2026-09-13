import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { GridConfiguration, createDemoGridConfiguration } from "../src/domain/grid/GridConfiguration.js";
import { CURRENT_WORKSPACE_KEY, WorkspaceLayoutStore } from "../src/features/dashboard/WorkspaceLayoutStore.js";

test("workspace restores positions, switches fresh named layouts, and resets without deleting them", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  const previous = { window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const [{ render, fireEvent, waitFor, cleanup, act }, { DashboardWorkspace }] = await Promise.all([
      import("@testing-library/react"),
      vite.ssrLoadModule("/src/features/dashboard/DashboardWorkspace.jsx"),
    ]);
    const demo = createDemoGridConfiguration();
    const initialSnapshot = { grid: demo.toJSON(), evaluations: demo.configuredEntryIds.map((entry) => ({ entry, signal: { color: "GREEN", transformedValue: 1 } })) };
    const savedGrid = new GridConfiguration();
    savedGrid.addIndicator("consumer_confidence");
    savedGrid.moveIndicator(0, 4);
    const store = new WorkspaceLayoutStore(dom.window.localStorage, { createId: () => "saved-layout" });
    const layout = store.saveAs("Sparse layout", savedGrid);
    let loads = 0;
    const loadEvaluation = async (entry) => { loads += 1; return { entry, observationDate: "2026-09-08", signal: { color: "RED", transformedValue: -1 } }; };
    const rendered = render(React.createElement(DashboardWorkspace, { initialSnapshot, loadEvaluation, storage: dom.window.localStorage }));
    const position = (number) => rendered.getByLabelText(new RegExp(`^Grid position ${number}(?:[:;])`));

    await act(async () => fireEvent.change(rendered.getByLabelText("Layout"), { target: { value: layout.id } }));
    await waitFor(() => assert.match(position(5).textContent, /University of Michigan Consumer Sentiment/));
    assert.match(position(1).textContent, /Empty/);
    await waitFor(() => assert.ok(rendered.getByRole("button", { name: /University of Michigan Consumer Sentiment; Red signal/ })));
    assert.ok(loads > 0, "layout selection must load current evaluations instead of restoring signal data");

    fireEvent.click(rendered.getByRole("button", { name: "Save as..." }));
    fireEvent.change(rendered.getByLabelText("Layout name"), { target: { value: "Copy" } });
    fireEvent.click(rendered.getByRole("button", { name: "Save" }));
    assert.equal(store.listLayouts().length, 2);

    fireEvent.click(rendered.getByRole("button", { name: /Remove University of Michigan Consumer Sentiment/ }));
    assert.equal(store.loadCurrent().configuredEntryIds.length, 0, "grid changes auto-save the current workspace");
    assert.equal(store.loadLayout("saved-layout").slots[4].entryId, "consumer_confidence", "normal edits do not overwrite named layouts");

    fireEvent.click(rendered.getByRole("button", { name: "Reset to default" }));
    assert.deepEqual(store.loadCurrent().configuredEntryIds, demo.configuredEntryIds);
    assert.equal(store.listLayouts().length, 2, "reset must preserve named layouts");
    cleanup();
  } finally {
    await vite.close();
    dom.window.close();
    Object.assign(globalThis, { window: previous.window, document: previous.document });
    Object.defineProperty(globalThis, "navigator", { value: previous.navigator, configurable: true });
  }
});

test("malformed current workspace falls back to the demo preset", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  dom.window.localStorage.setItem(CURRENT_WORKSPACE_KEY, "broken");
  const previous = { window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const [{ render, cleanup }, { DashboardWorkspace }] = await Promise.all([import("@testing-library/react"), vite.ssrLoadModule("/src/features/dashboard/DashboardWorkspace.jsx")]);
    const demo = createDemoGridConfiguration();
    const rendered = render(React.createElement(DashboardWorkspace, { initialSnapshot: { grid: new GridConfiguration().toJSON(), evaluations: [] }, storage: dom.window.localStorage, loadEvaluation: async (entry) => ({ entry, signal: { color: "UNKNOWN", transformedValue: null } }) }));
    assert.match(rendered.getByLabelText(/^Grid position 1:/).textContent, /Nonfarm Payrolls/);
    assert.doesNotThrow(() => GridConfiguration.fromJSON(JSON.parse(dom.window.localStorage.getItem(CURRENT_WORKSPACE_KEY))));
    cleanup();
  } finally {
    await vite.close(); dom.window.close(); Object.assign(globalThis, { window: previous.window, document: previous.document }); Object.defineProperty(globalThis, "navigator", { value: previous.navigator, configurable: true });
  }
});

test("page load restores the remembered current workspace with exact empty positions", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  const remembered = new GridConfiguration();
  remembered.addIndicator("vix");
  remembered.moveIndicator(0, 6);
  dom.window.localStorage.setItem(CURRENT_WORKSPACE_KEY, JSON.stringify(remembered.toJSON()));
  const previous = { window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const [{ render, cleanup }, { DashboardWorkspace }] = await Promise.all([import("@testing-library/react"), vite.ssrLoadModule("/src/features/dashboard/DashboardWorkspace.jsx")]);
    const demo = createDemoGridConfiguration();
    const rendered = render(React.createElement(DashboardWorkspace, { initialSnapshot: { grid: demo.toJSON(), evaluations: [] }, storage: dom.window.localStorage, loadEvaluation: async (entry) => ({ entry, signal: { color: "UNKNOWN", transformedValue: null } }) }));
    assert.match(rendered.getByLabelText(/^Grid position 1:/).textContent, /Empty/);
    assert.match(rendered.getByLabelText(/^Grid position 7:/).textContent, /VIX/);
    cleanup();
  } finally {
    await vite.close(); dom.window.close(); Object.assign(globalThis, { window: previous.window, document: previous.document }); Object.defineProperty(globalThis, "navigator", { value: previous.navigator, configurable: true });
  }
});
