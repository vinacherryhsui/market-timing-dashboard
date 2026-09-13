# TAIEX indicator-ranking research

This directory is isolated from the production dashboard. It does not register Yahoo Finance as a production provider and does not alter indicator metadata, rules, transformations, layouts, or Market Score.

Build the separate full-history research dataset first:

```text
node analysis/build_full_indicator_history.mjs
```

The builder downloads the longest available history from each active configured source and writes only under `analysis/data/`. It uses the production FRED client in max-history mode when `FRED_API_KEY` is set, otherwise FRED's public CSV export; DGBAS XML and configured research workbooks are downloaded directly. Production canonical transformation definitions and `buildTransformedHistory` are reused unchanged. Coverage is recorded in `analysis/data/coverage.csv` and `analysis/data/coverage.json`.

Run with Python 3 after installing `analysis/requirements.txt`:

```text
python analysis/rank_indicators_taiex.py
```

By default the script downloads daily `^TWII` history from Yahoo Finance's chart endpoint, uses adjusted close when available (otherwise close), selects the final available price in each calendar month, and computes the monthly simple return as `100 * (P_t / P_{t-1} - 1)`.

For an offline or reproducible run, pass a Yahoo-format CSV containing `Date` and `Adj Close` or `Close`:

```text
python analysis/rank_indicators_taiex.py --taiex-csv path/to/twii.csv
```

The Node export helper prefers the complete research dataset when present, and otherwise reads existing project caches only to diagnose whether they are sufficient. Daily indicator results use the final observation in each month; monthly observations retain their observation month; quarterly observations are carried within their quarter for at most two months. The regression uses the complete-case intersection across all 21 indicators and TAIEX returns. It never selects or drops indicators automatically.

Each indicator regressor is standardized over the final common sample with population standard deviation (`ddof=0`). TAIEX returns remain in percentage points, so a coefficient is the contemporaneous monthly return change associated with a one-standard-deviation increase in that indicator. OLS inference uses HAC/Newey-West covariance with an automatic lag length. The report also includes pairwise-correlation warnings and VIF.

The current project cache is not sufficient for estimation: several daily series contain only a few September 2026 observations, while monthly series end in August 2026 and quarterly series earlier. The script reports exact transformed coverage and exits without writing a ranking rather than inventing history or silently dropping indicators. With a sufficient common panel, output is written to `analysis/output/taiex_indicator_ranking.csv`.
