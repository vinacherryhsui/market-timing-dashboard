#!/usr/bin/env python3
"""Exploratory multivariate ranking of active indicators against TAIEX returns.

This script is isolated from the dashboard runtime. It reads transformed histories
through the Node export helper and retrieves Yahoo Finance ^TWII prices only for
this analysis. It never changes canonical metadata, caches, rules, or layouts.
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

try:
    import numpy as np
    import pandas as pd
    import statsmodels.api as sm
    from statsmodels.stats.outliers_influence import variance_inflation_factor
except ImportError as exc:
    raise SystemExit(
        "Missing analysis dependency. Install packages from analysis/requirements.txt "
        f"with a Python 3 environment. Original error: {exc}"
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
EXPORT_HELPER = ROOT / "analysis" / "export_transformed_histories.mjs"
DEFAULT_OUTPUT = ROOT / "analysis" / "output" / "taiex_indicator_ranking.csv"
TAIEX_TICKER = "^TWII"
HIGH_CORRELATION = 0.80


def load_transformed_histories() -> dict:
    completed = subprocess.run(
        ["node", str(EXPORT_HELPER)], cwd=ROOT, check=True, capture_output=True, text=True
    )
    return json.loads(completed.stdout)


def download_taiex_daily() -> pd.Series:
    params = urllib.parse.urlencode(
        {"period1": 0, "period2": 4102444800, "interval": "1d", "events": "history", "includeAdjustedClose": "true"}
    )
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(TAIEX_TICKER)}?{params}"
    request = urllib.request.Request(url, headers={"User-Agent": "market-timing-dashboard-research/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = json.load(response)
    except Exception as exc:
        raise RuntimeError(f"Yahoo Finance download failed for {TAIEX_TICKER}: {exc}") from exc
    chart = payload.get("chart", {})
    if chart.get("error"):
        raise RuntimeError(f"Yahoo Finance returned an error: {chart['error']}")
    results = chart.get("result") or []
    if not results:
        raise RuntimeError(f"Yahoo Finance returned no history for {TAIEX_TICKER}.")
    result = results[0]
    timestamps = result.get("timestamp") or []
    quote = (result.get("indicators", {}).get("quote") or [{}])[0]
    adjusted = (result.get("indicators", {}).get("adjclose") or [{}])[0].get("adjclose")
    prices = adjusted if adjusted and any(value is not None for value in adjusted) else quote.get("close") or []
    source_field = "adjusted close" if prices is adjusted else "close"
    series = pd.Series(prices, index=pd.to_datetime(timestamps, unit="s", utc=True), dtype="float64").dropna()
    if series.empty:
        raise RuntimeError(f"Yahoo Finance returned no usable adjusted/close prices for {TAIEX_TICKER}.")
    series.attrs["price_field"] = source_field
    return series


def load_taiex_csv(path: Path) -> pd.Series:
    frame = pd.read_csv(path)
    columns = {column.lower().replace(" ", "_"): column for column in frame.columns}
    date_column = columns.get("date")
    price_column = columns.get("adj_close") or columns.get("adjusted_close") or columns.get("close")
    if not date_column or not price_column:
        raise ValueError("TAIEX CSV requires Date and Adj Close/Adjusted Close/Close columns.")
    series = pd.Series(frame[price_column].values, index=pd.to_datetime(frame[date_column], utc=True), dtype="float64").dropna()
    series.attrs["price_field"] = price_column
    return series


def monthly_taiex_returns(prices: pd.Series) -> pd.Series:
    monthly_price = prices.sort_index().resample("ME").last().dropna()
    returns = monthly_price.pct_change(fill_method=None).mul(100).dropna()
    returns.name = "TAIEX_return"
    return returns


def monthly_indicator_frame(histories: dict) -> pd.DataFrame:
    columns = {}
    for entry_id, history in histories.items():
        points = history.get("points") or []
        series = pd.Series(
            [point["value"] for point in points],
            index=pd.to_datetime([point["observationDate"] for point in points], utc=True),
            dtype="float64",
            name=entry_id,
        ).sort_index()
        frequency = history["frequency"]
        if frequency == "DAILY":
            series = series.resample("ME").last()
        elif frequency == "MONTHLY":
            series.index = series.index.to_period("M").to_timestamp("M").tz_localize("UTC")
        elif frequency == "QUARTERLY":
            series.index = series.index.to_period("M").to_timestamp("M").tz_localize("UTC")
            series = series.resample("ME").last().ffill(limit=2)
        else:
            raise ValueError(f"Unsupported analysis frequency for {entry_id}: {frequency}")
        columns[entry_id] = series[~series.index.duplicated(keep="last")]
    return pd.concat(columns.values(), axis=1).sort_index()


def coverage_report(histories: dict, monthly: pd.DataFrame) -> str:
    lines = ["Indicator coverage after production transformations and monthly normalization:"]
    for entry_id in histories:
        valid = monthly[entry_id].dropna()
        start = valid.index.min().date().isoformat() if not valid.empty else "none"
        end = valid.index.max().date().isoformat() if not valid.empty else "none"
        lines.append(f"  {entry_id:36s} n={len(valid):4d}  {start} to {end}")
    return "\n".join(lines)


def fit_and_rank(panel: pd.DataFrame, output: Path) -> None:
    y = panel.pop("TAIEX_return")
    standard_deviations = panel.std(ddof=0)
    constant = standard_deviations[standard_deviations <= 0].index.tolist()
    if constant:
        raise RuntimeError(f"Cannot standardize zero-variance indicators: {', '.join(constant)}")
    x = (panel - panel.mean()) / standard_deviations
    design = sm.add_constant(x, has_constant="add")
    if len(design) <= design.shape[1]:
        raise RuntimeError(
            f"Common sample has {len(design)} observations for 21 regressors plus an intercept; "
            "more than 22 observations are required. No indicators are automatically dropped."
        )
    maxlags = max(1, math.floor(4 * (len(design) / 100) ** (2 / 9)))
    model = sm.OLS(y, design).fit(cov_type="HAC", cov_kwds={"maxlags": maxlags, "use_correction": True})
    correlation = x.corr()
    high_pairs = []
    for left_index, left in enumerate(correlation.columns):
        for right in correlation.columns[left_index + 1:]:
            value = correlation.loc[left, right]
            if abs(value) >= HIGH_CORRELATION:
                high_pairs.append((left, right, value))
    vif = {column: variance_inflation_factor(x.values, index) for index, column in enumerate(x.columns)}
    ranking = pd.DataFrame({
        "indicator": x.columns,
        "standardized_coefficient": [model.params[column] for column in x.columns],
        "absolute_standardized_coefficient": [abs(model.params[column]) for column in x.columns],
        "hac_standard_error": [model.bse[column] for column in x.columns],
        "t_statistic": [model.tvalues[column] for column in x.columns],
        "p_value": [model.pvalues[column] for column in x.columns],
        "vif": [vif[column] for column in x.columns],
    }).sort_values("absolute_standardized_coefficient", ascending=False).reset_index(drop=True)
    ranking.insert(0, "rank", np.arange(1, len(ranking) + 1))
    output.parent.mkdir(parents=True, exist_ok=True)
    ranking.to_csv(output, index=False)
    print("\nExploratory multivariate OLS ranking (HAC/Newey-West inference)")
    print(ranking.to_string(index=False, float_format=lambda value: f"{value:.6f}"))
    print(f"\nSample: {panel.index.min().date()} to {panel.index.max().date()} ({len(panel)} observations)")
    print(f"TAIEX return: monthly simple percent return from Yahoo Finance {TAIEX_TICKER} month-end adjusted close (close fallback)")
    print(f"HAC maxlags: {maxlags}; R-squared: {model.rsquared:.6f}; adjusted R-squared: {model.rsquared_adj:.6f}")
    if high_pairs:
        print(f"WARNING: {len(high_pairs)} indicator pairs have |correlation| >= {HIGH_CORRELATION:.2f}:")
        for left, right, value in high_pairs:
            print(f"  {left} / {right}: {value:.3f}")
    else:
        print(f"No indicator pair has |correlation| >= {HIGH_CORRELATION:.2f}.")
    print(f"Ranking written to {output}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--taiex-csv", type=Path, help="Optional local Yahoo-format TAIEX price CSV for reproducible/offline runs.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    histories = load_transformed_histories()
    monthly_indicators = monthly_indicator_frame(histories)
    print(coverage_report(histories, monthly_indicators))
    try:
        prices = load_taiex_csv(args.taiex_csv) if args.taiex_csv else download_taiex_daily()
        returns = monthly_taiex_returns(prices)
        panel = monthly_indicators.join(returns, how="inner").dropna()
        if panel.empty:
            raise RuntimeError(
                "No common monthly observations exist across all 21 transformed indicators and TAIEX returns. "
                "The project caches are operational lookback caches, not a common historical research panel."
            )
        fit_and_rank(panel, args.output.resolve())
    except Exception as exc:
        print(f"\nANALYSIS NOT ESTIMATED: {exc}", file=sys.stderr)
        print("No ranking CSV was written and no indicator was silently dropped.", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
