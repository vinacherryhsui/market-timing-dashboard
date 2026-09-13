import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { createDemoGridConfiguration } from "../src/domain/grid/GridConfiguration.js";

test("native grid drag swaps, moves into holes, and preserves existing interactions", async () => {
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
      evaluations: grid.configuredEntryIds.map((entry) => ({
        entry, observationDate: "2026-07-01", signal: { color: "GREEN", status: "EVALUATED", transformedValue: entry === "credit_card_delinquency" ? { current: 2, trailingMedian: 3, periodChange4Q: -0.2 } : 1 },
      })),
    };
    let loads = 0;
    const loadEvaluation = async (entry) => {
      loads += 1;
      return { entry, observationDate: "2026-08-01", signal: { color: "GREEN", status: "EVALUATED", transformedValue: 1 } };
    };
    const rendered = render(React.createElement(DashboardWorkspace, { initialSnapshot, loadEvaluation }));
    const position = (number) => rendered.getByLabelText(new RegExp(`^Grid position ${number}(?:[:;])`));
    const cardFor = (name) => rendered.getByRole("button", { name: new RegExp(`quick information for ${name}`) });
    const dataTransfer = { setData() {}, effectAllowed: "", dropEffect: "" };
    const initialScore = rendered.getByText("+1.00").textContent;

    assert.equal(cardFor("Nonfarm Payrolls").tagName, "DIV", "the flip surface must not be a native button");
    assert.equal(position(1).getAttribute("draggable"), "true", "the stable outer wrapper is the drag source");
    assert.equal(cardFor("Nonfarm Payrolls").hasAttribute("draggable"), false, "the rotating card must not be draggable");
    fireEvent.click(cardFor("Nonfarm Payrolls"));
    assert.match(cardFor("Nonfarm Payrolls").getAttribute("aria-label"), /^Hide/);
    fireEvent.click(cardFor("Nonfarm Payrolls"));
    assert.match(cardFor("Nonfarm Payrolls").getAttribute("aria-label"), /^Show/);
    fireEvent.dragStart(position(1), { dataTransfer });
    assert.ok(position(1).classList.contains("is-dragging"));
    assert.equal(fireEvent.dragOver(position(2), { dataTransfer }), false, "dragOver must prevent default to permit dropping");
    assert.ok(position(2).classList.contains("is-drop-target"));
    fireEvent.drop(position(2), { dataTransfer });

    assert.match(position(1).textContent, /U-6 Underemployment/);
    assert.match(position(2).textContent, /Nonfarm Payrolls/);
    assert.match(cardFor("Nonfarm Payrolls").getAttribute("aria-label"), /^Show/);
    assert.match(cardFor("U-6 Underemployment").getAttribute("aria-label"), /^Show/);
    assert.equal(rendered.getByText("+1.00").textContent, initialScore);
    assert.equal(loads, 0, "reordering must not reevaluate signals");

    fireEvent.click(cardFor("Nonfarm Payrolls"));
    assert.match(cardFor("Nonfarm Payrolls").getAttribute("aria-label"), /^Show/, "drop-following click must not flip");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    fireEvent.click(cardFor("Nonfarm Payrolls"));
    assert.match(cardFor("Nonfarm Payrolls").getAttribute("aria-label"), /^Hide/, "ordinary click must still flip immediately");

    fireEvent.click(rendered.getByRole("button", { name: "Remove Nonfarm Payrolls" }));
    assert.match(position(2).textContent, /Empty/);
    assert.equal(position(2).getAttribute("draggable"), "false");
    assert.match(position(1).textContent, /U-6 Underemployment/);
    fireEvent.dragStart(position(1), { dataTransfer });
    fireEvent.dragOver(position(2), { dataTransfer });
    fireEvent.drop(position(2), { dataTransfer });
    assert.match(position(1).textContent, /Empty/);
    assert.match(position(2).textContent, /U-6 Underemployment/);
    assert.match(position(3).textContent, /University of Michigan Consumer Sentiment/);

    await act(async () => {
      fireEvent.click(rendered.getByRole("button", { name: "Sahm Rule; add to grid" }));
    });
    await waitFor(() => assert.match(position(1).textContent, /Sahm Rule/));
    assert.equal(loads, 1);

    fireEvent.click(rendered.getByRole("button", { name: "PCE Inflation; add to grid" }));
    assert.ok(rendered.getByText("Select a grid cell to replace."));
    assert.equal(position(3).getAttribute("draggable"), "false", "replace mode disables dragging");
    fireEvent.dragStart(position(3), { dataTransfer });
    assert.equal(position(3).classList.contains("is-dragging"), false);
    await act(async () => {
      fireEvent.click(cardFor("University of Michigan Consumer Sentiment"));
    });
    await waitFor(() => assert.match(position(3).textContent, /PCE Inflation/));
    assert.equal(loads, 2);

    cleanup();
  } finally {
    await vite.close();
    dom.window.close();
    Object.assign(globalThis, { window: previous.window, document: previous.document });
    Object.defineProperty(globalThis, "navigator", { value: previous.navigator, configurable: true });
  }
});
