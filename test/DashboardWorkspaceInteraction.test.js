import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { createDemoGridConfiguration } from "../src/domain/grid/GridConfiguration.js";

test("full-grid Library selection supports cancel and explicit cell replacement", async () => {
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
    const grid = createDemoGridConfiguration();
    const initialSnapshot = {
      grid: grid.toJSON(),
      evaluations: grid.configuredEntryIds.map((entry) => ({ entry, observationDate: "2026-09-01", signal: { color: "GREEN", transformedValue: 1 } })),
    };
    const loadEvaluation = async (entry) => ({ entry, observationDate: "2026-09-02", signal: { color: "RED", transformedValue: -1 } });
    const rendered = render(React.createElement(DashboardWorkspace, { initialSnapshot, loadEvaluation }));
    const libraryChoice = () => rendered.getByRole("button", { name: "Sahm Rule; add to grid" });

    fireEvent.click(libraryChoice());
    assert.ok(rendered.getByText("Select a grid cell to replace."));
    fireEvent.click(rendered.getByRole("button", { name: "Cancel" }));
    assert.equal(rendered.queryByText("Select a grid cell to replace."), null);

    fireEvent.click(libraryChoice());
    await act(async () => {
      fireEvent.click(rendered.getByRole("button", { name: /Show quick information for Nonfarm Payrolls/ }));
    });
    await waitFor(() => assert.ok(rendered.getByRole("button", { name: "Sahm Rule; selected" })));
    assert.equal(rendered.queryByText("Select a grid cell to replace."), null);
    assert.equal(rendered.queryByRole("button", { name: /Hide quick information for Nonfarm Payrolls/ }), null);
    await act(async () => cleanup());
  } finally {
    await vite.close();
    dom.window.close();
    Object.assign(globalThis, { window: previous.window, document: previous.document });
    Object.defineProperty(globalThis, "navigator", { value: previous.navigator, configurable: true });
  }
});
