import React, { useEffect, useState } from "react";

export function SignalCard({
  cell, replaceMode = false, onActivate,
  dragEnabled = false, suppressActivation = false, onDetails, onFlip, tutorialTarget = false,
  tutorialResetRevision = 0,
}) {
  const [flipped, setFlipped] = useState(false);
  useEffect(() => setFlipped(false), [tutorialResetRevision]);
  const canFlip = cell.entryId !== null;
  const activate = () => {
    if (!canFlip || suppressActivation) return;
    if (replaceMode) onActivate?.(cell.position);
    else setFlipped((value) => {
      const nextValue = !value;
      onFlip?.(cell.entryId, nextValue);
      return nextValue;
    });
  };
  return React.createElement("div", {
    role: "button",
    tabIndex: 0,
    className: `signal-cell${flipped ? " is-flipped" : ""}`,
    "aria-label": canFlip
      ? `${flipped ? "Hide" : "Show"} quick information for ${cell.name}; ${cell.label} signal${dragEnabled ? "; draggable grid card" : ""}`
      : `Empty position ${cell.position + 1}`,
    "aria-pressed": flipped,
    ...(tutorialTarget ? { "data-tutorial-target": "quick-info-card" } : {}),
    onClick: (event) => {
      if (event.target.closest?.(".card-details")) return;
      activate();
    },
    onKeyDown: (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    },
  }, React.createElement("span", { className: `card-inner ${cell.className}` },
    React.createElement("span", { className: "card-face card-front", "aria-hidden": flipped }, cell.name ?? "Empty"),
    canFlip && React.createElement("span", { className: "card-face card-back", "aria-hidden": !flipped },
      React.createElement("span", { className: "quick-back-content" },
        React.createElement("span", { className: "quick-value" }, cell.quickInfo.value),
        React.createElement("span", { className: "quick-date" }, cell.quickInfo.date),
        React.createElement("span", { className: "quick-source" }, cell.quickInfo.source),
        React.createElement("span", { className: "quick-interpretation" }, cell.quickInfo.interpretation),
        onDetails && !replaceMode && React.createElement("button", {
          type: "button", className: "card-details",
          onClick: () => onDetails(cell.entryId),
          onKeyDown: (event) => event.stopPropagation(),
        }, "Details")))));
}
