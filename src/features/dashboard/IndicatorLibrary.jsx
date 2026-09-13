import React from "react";
import { activeGridEntryIds } from "../../domain/grid/GridConfiguration.js";
import { getCanonicalIndicatorMetadataV1 } from "../../domain/indicators/canonicalIndicatorMetadata.js";

const themes = ["Labor", "Growth", "Inflation", "Financial Risk", "Yield Curve", "Supply Chain", "Uncertainty / Geopolitical", "Household"];

export function IndicatorLibrary({ selectedEntryIds, onSelect, pendingEntryId }) {
  const selected = new Set(selectedEntryIds);
  return (
    <section className="indicator-library" aria-labelledby="indicator-library-title">
      <div className="library-heading"><p className="eyebrow">Available signals</p><h2 id="indicator-library-title">Indicator Library</h2></div>
      <div className="library-groups">
        {themes.map((theme) => (
          <section className="library-group" key={theme}>
            <h3>{theme}</h3>
            <div className="library-items">
              {activeGridEntryIds.filter((entryId) => getCanonicalIndicatorMetadataV1(entryId)?.display.theme === theme).map((entryId) => {
                const isSelected = selected.has(entryId);
                const name = getCanonicalIndicatorMetadataV1(entryId).display.name;
                return (
                  <button type="button" className={`library-item${isSelected ? " is-selected" : ""}`} disabled={isSelected || pendingEntryId === entryId} onClick={() => onSelect(entryId)} key={entryId} aria-label={`${name}${isSelected ? "; selected" : "; add to grid"}`}>
                    <span>{name}</span>{isSelected && <span className="selected-mark" aria-hidden="true">✓</span>}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
