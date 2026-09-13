import React, { useMemo, useState } from "react";

const OP = { ">": "above", ">=": "at least", "<": "below", "<=": "at most" };
const names = { current: "Current reading", trailingMedian: "the trailing median", periodChange4Q: "Four-quarter change" };
function conditionText(condition) {
  const comparison = condition.compareToInput ? names[condition.compareToInput] ?? condition.compareToInput : condition.value;
  const phrase = `${OP[condition.operator] ?? condition.operator} ${comparison}`;
  return condition.input === "value" ? phrase : `${names[condition.input] ?? condition.input} is ${phrase}`;
}
const groupsText = (groups = []) => groups.map((group) => group.all.map(conditionText).join(" and ")).join("; or ");
function formatRules(rule) {
  if (rule.parameters.branches) return Object.fromEntries(rule.parameters.branches.map((branch) => [branch.color, groupsText(branch.anyOf)]));
  return { GREEN: groupsText(rule.parameters.green?.anyOf), YELLOW: "All other readings", RED: groupsText(rule.parameters.red?.anyOf) };
}
const CHART = { width: 600, height: 230, left: 62, right: 16, top: 14, bottom: 38 };
const tickIndexes = (length, count) => [...new Set(Array.from({ length: Math.min(length, count) }, (_, index) => Math.round(index * (length - 1) / Math.max(Math.min(length, count) - 1, 1))))];
function dateTick(date, range) {
  const value = new Date(`${date}T00:00:00Z`);
  if (range === "Max") return String(value.getUTCFullYear());
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(value);
}
function valueTick(value, span) {
  const maximumFractionDigits = span < 1 ? 2 : span < 10 ? 1 : 0;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}
export function HistoryChart({ points, unitLabel }) {
  const [range, setRange] = useState("5Y");
  const visible = useMemo(() => {
    if (range === "Max" || !points.length) return points;
    const start = new Date(points.at(-1).observationDate);
    start.setUTCFullYear(start.getUTCFullYear() - (range === "1Y" ? 1 : 5));
    return points.filter((point) => new Date(point.observationDate) >= start);
  }, [points, range]);
  const values = visible.map((point) => point.value);
  const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1;
  const plotWidth = CHART.width - CHART.left - CHART.right; const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const x = (index) => CHART.left + (index / Math.max(visible.length - 1, 1)) * plotWidth;
  const y = (value) => CHART.top + (1 - (value - min) / span) * plotHeight;
  const path = visible.map((point, index) => `${index ? "L" : "M"} ${x(index)} ${y(point.value)}`).join(" ");
  const xTicks = tickIndexes(visible.length, range === "1Y" ? 5 : range === "5Y" ? 6 : 5);
  const yTicks = Array.from({ length: 5 }, (_, index) => min + span * index / 4);
  return <section className="detail-history"><div className="history-heading"><h3>Transformed history</h3><div aria-label="History range">{["1Y", "5Y", "Max"].map((item) => <button type="button" className={range === item ? "active" : ""} onClick={() => setRange(item)} key={item}>{item}</button>)}</div></div>
    {visible.length ? <><svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-label={`${range} transformed indicator history`}>
      <g className="chart-y-axis" aria-label={`Value axis in ${unitLabel}`}><line x1={CHART.left} y1={CHART.top} x2={CHART.left} y2={CHART.height - CHART.bottom} />{yTicks.map((tick) => <g key={tick} transform={`translate(0 ${y(tick)})`}><line x1={CHART.left - 4} x2={CHART.left} /><text x={CHART.left - 8} textAnchor="end" dominantBaseline="middle">{valueTick(tick, span)}</text></g>)}<text className="chart-unit" x={CHART.left} y={CHART.top - 4}>{unitLabel}</text></g>
      <g className="chart-x-axis" aria-label="Time axis"><line x1={CHART.left} y1={CHART.height - CHART.bottom} x2={CHART.width - CHART.right} y2={CHART.height - CHART.bottom} />{xTicks.map((index) => <g key={`${visible[index].observationDate}-${index}`} transform={`translate(${x(index)} 0)`}><line y1={CHART.height - CHART.bottom} y2={CHART.height - CHART.bottom + 4} /><text y={CHART.height - 17} textAnchor={index === 0 ? "start" : index === visible.length - 1 ? "end" : "middle"}>{dateTick(visible[index].observationDate, range)}</text></g>)}</g>
      <path className="history-series" d={path} />
    </svg><p>Current: {visible.at(-1).value} | {visible.at(-1).observationDate}</p></> : <p className="history-unavailable">History unavailable.</p>}
    </section>;
}

export function IndicatorDetail({ detail, current, onBack }) {
  if (!detail) return <section className="indicator-detail" data-tutorial-target="indicator-detail"><button type="button" onClick={onBack}>Back to Library</button><p>Loading indicator detail...</p></section>;
  const metadata = detail.canonicalMetadata;
  const displayedRules = formatRules(detail.rule);
  return <section className="indicator-detail" aria-label="Indicator Detail" data-tutorial-target="indicator-detail"><button type="button" className="back-library" onClick={onBack}>Back to Library</button>
    <header><p>{metadata.display.theme}</p><h2>{metadata.display.name}</h2></header>
    <div className="detail-current"><span>Current reading</span><strong>{current?.quickInfo?.value ?? "Unavailable"}</strong><span>{current?.quickInfo?.date ?? "Observation period unavailable"}</span><b>{current?.label ?? "UNKNOWN"}</b></div>
    <HistoryChart points={detail.history?.points ?? []} unitLabel={metadata.display.outputUnitLabel} />
    <div className="detail-primary">
      <section className="detail-panel"><h3>Market Implication</h3><p>{metadata.display.marketImplication}</p></section>
      <section className="detail-panel"><h3>Signal Rules</h3>{["GREEN", "YELLOW", "RED"].map((color) => <p key={color}><strong>{color}:</strong> {displayedRules[color]}</p>)}<p className="detail-rationale"><strong>Rule rationale:</strong> {metadata.display.ruleRationale}</p></section>
    </div>
    <section><h3>Method &amp; Data</h3><dl className="detail-facts"><div><dt>Source</dt><dd>{metadata.display.providerLabel}</dd></div><div><dt>Frequency</dt><dd>{metadata.display.frequencyLabel}</dd></div><div className="detail-calculation"><dt>Calculation</dt><dd><strong>{metadata.display.transformationLabel}</strong><small>{metadata.display.calculationDescription}</small></dd></div></dl></section>
    <details className="detail-additional"><summary>Additional details</summary><div className="detail-additional-content"><section><h3>Limitations</h3><p>{metadata.display.limitations}</p></section>{(metadata.display.dataNotes ?? []).length > 0 && <section className="detail-notes"><h3>Data Notes</h3>{metadata.display.dataNotes.map((note, index) => <article key={`${note.type}-${index}`}><h4>{note.label}</h4><p>{note.text}</p></article>)}</section>}</div></details>
  </section>;
}
