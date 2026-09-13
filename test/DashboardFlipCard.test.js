import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { createDemoGridConfiguration } from "../src/domain/grid/GridConfiguration.js";
import { buildDashboardViewModel } from "../src/features/dashboard/dashboardViewModel.js";
import { SignalCard } from "../src/features/dashboard/SignalCard.js";

test("one card flips to quick information and back independently", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const previous = { window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  try {
    const { render, fireEvent, cleanup } = await import("@testing-library/react");
    const grid = createDemoGridConfiguration();
    const results = grid.configuredEntryIds.map((entry, index) => ({
      entry,
      observationDate: index === 0 ? "2026-08-01" : "2026-07-01",
      source: index === 0 ? "FRED / PAYEMS" : undefined,
      signal: { color: index === 0 ? "GREEN" : "YELLOW", transformedValue: index === 0 ? 162 : 0.5 },
    }));
    const cells = buildDashboardViewModel(grid, results).cells;
    const rendered = render(React.createElement("div", null,
      React.createElement(SignalCard, { cell: cells[0] }),
      React.createElement(SignalCard, { cell: cells[1] })));
    const [first, second] = rendered.container.querySelectorAll('[role="button"].signal-cell');
    const front = first.querySelector(".card-front");
    const back = first.querySelector(".card-back");
    const plane = first.querySelector(".card-inner");
    const backContent = back.querySelector(".quick-back-content");

    assert.equal(first.getAttribute("aria-pressed"), "false");
    assert.ok(plane.classList.contains("signal-green"), "background belongs to the rotating card plane");
    assert.equal(first.classList.contains("signal-green"), false, "the stationary perspective container has no signal background");
    assert.equal(front.parentElement, plane);
    assert.equal(back.parentElement, plane);
    assert.equal(backContent.children.length, 4);
    assert.equal(backContent.querySelector(".quick-interpretation").textContent, cells[0].quickInfo.interpretation, "interpretation must remain complete");
    fireEvent.click(first);
    assert.equal(first.getAttribute("aria-pressed"), "true");
    assert.equal(front.getAttribute("aria-hidden"), "true");
    assert.equal(back.getAttribute("aria-hidden"), "false");
    assert.match(back.textContent, /\+162 thousand jobs/);
    assert.match(back.textContent, /August 2026/);
    assert.match(back.textContent, /FRED \/ PAYEMS/);
    assert.match(back.textContent, /Monthly payroll growth is above \+122K/);
    assert.doesNotMatch(back.textContent, /Signal:\s*(GREEN|YELLOW|RED)/i);
    assert.equal(second.getAttribute("aria-pressed"), "false");

    fireEvent.click(first);
    assert.equal(first.getAttribute("aria-pressed"), "false");
    assert.equal(front.getAttribute("aria-hidden"), "false");
    assert.equal(back.getAttribute("aria-hidden"), "true");
    cleanup();
  } finally {
    dom.window.close();
    Object.assign(globalThis, { window: previous.window, document: previous.document });
    Object.defineProperty(globalThis, "navigator", { value: previous.navigator, configurable: true });
  }
});

test("back-face content is constrained to one unclamped vertical scroll region", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const rule = css.match(/\.quick-back-content\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(rule, /min-height:\s*0/);
  assert.match(rule, /overflow-y:\s*auto/);
  assert.match(rule, /overflow-x:\s*hidden/);
  assert.doesNotMatch(css, /(?:line-clamp|-webkit-line-clamp|text-overflow:\s*ellipsis)/i);
});

test("replace mode activates replacement without flipping the card", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const previous = { window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  try {
    const { render, fireEvent, cleanup } = await import("@testing-library/react");
    const cell = buildDashboardViewModel(createDemoGridConfiguration(), [{ entry: "nonfarm_payrolls", signal: { color: "GREEN", transformedValue: 162 } }]).cells[0];
    let selectedPosition = null;
    const rendered = render(React.createElement(SignalCard, { cell, replaceMode: true, onActivate: (position) => { selectedPosition = position; } }));
    const card = rendered.container.querySelector('[role="button"].signal-cell');
    fireEvent.click(card);
    assert.equal(selectedPosition, 0);
    assert.equal(card.getAttribute("aria-pressed"), "false");
    assert.equal(card.querySelector(".card-front").getAttribute("aria-hidden"), "false");
    cleanup();
  } finally {
    dom.window.close();
    Object.assign(globalThis, { window: previous.window, document: previous.document });
    Object.defineProperty(globalThis, "navigator", { value: previous.navigator, configurable: true });
  }
});
