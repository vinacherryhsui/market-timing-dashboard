# Transformation Specification — Step 1

## Scope

本文件只定義 provider-agnostic transformation metadata、required lookback 與純計算函式的語意。不執行 acquisition lookback、不檢查 observation date 連續性，也不定義 direction、SignalRule、threshold、GREEN／YELLOW／RED、composite、Market Score 或 UI。

Step 4 的 transformation → executable SignalRule 對應集中記錄於 [`signal-rules.md`](./signal-rules.md)，不在本文件重複維護門檻。

## TransformationDefinition

```js
{
  type,
  frequency,
  window,
  lag,
  requiredPeriods,
  outputUnit,
  version,
  parameters
}
```

| 欄位 | 說明 |
| --- | --- |
| `type` | `PASSTHROUGH`、`MONTHLY_DIFFERENCE`、`YOY_PERCENT_CHANGE`、`ROLLING_ZSCORE`、`LEVEL_PLUS_PERIOD_CHANGE_AND_TRAILING_MEDIAN` |
| `frequency` | transformation 所要求的輸入頻率；目前為 `DAILY`、`MONTHLY` 或 `QUARTERLY` |
| `window` | rolling calculation 使用的期數，無則 `null` |
| `lag` | difference／growth 對照的落後期數，無則 `null` |
| `requiredPeriods` | 從 current observation 向後所需的最近期數，由 definition 推導並驗證 |
| `outputUnit` | transformation output 的概念單位，不改寫 raw observation unit |
| `version` | transformation definition version |
| `parameters` | method-specific 結構化參數；不得放 signal direction 或 threshold |

## Required lookback

`requiredPeriods` 指「以 current observation 為終點，向後所需的 recent contiguous periods」，不是資料庫中任意位置的累積 observation count。

純 transformation utilities 只依輸入陣列最後 N 筆計算，假設資料已按時間升冪排列。日期缺月、重複月份、frequency conversion 與 contiguous-history validation 由 Step 2 的 history preparation 在呼叫 transformation 前處理；因此 `requiredPeriods` 本身仍是需求 metadata，不應單獨解讀為資料已準備完成。

推導規則：

| Type | requiredPeriods |
| --- | ---: |
| `PASSTHROUGH` | 1 |
| `MONTHLY_DIFFERENCE`（lag 1） | 2 |
| `YOY_PERCENT_CHANGE`（monthly lag 12） | 13 |
| `ROLLING_ZSCORE`（window 36） | 36 |
| `LEVEL_PLUS_PERIOD_CHANGE_AND_TRAILING_MEDIAN`（quarterly lag 4、level median window 20） | `max(4 + 1, 20) = 20` quarters |

目前 `ROLLING_ZSCORE` pure utility 使用 rolling window 內 valid values 的 population standard deviation。Active 36-month policy 允許最多 1 個 missing，至少需要 35 valid，且 latest observation 必須 valid；zero variance 或 valid count 不足時回傳 `null`。`LEVEL_PLUS...` 的 trailing median input 明確為 level，使用 20-quarter window 內 valid values，至少需要 19 筆；若未來改為「changes 的 trailing median」，requiredPeriods 必須重新推導與升版。

Recent continuity 是 diagnostic；transformation readiness 由各 type 的 mathematical anchors、minimum valid observations 與 allowed missing periods 決定。YoY 只要求 `t` 與 `t-12`，不要求中間 11 個月份全部 valid。所有 missing observations 都保持 `null/MISSING`，不得插補。

## Active transformation compatibility registry

Registry 是由 Canonical Indicator Metadata v1 衍生的 source-specific compatibility view，共 21 entries。相同 user-facing indicator 的不同 source role 各自保留一筆 entry，不合成；active transformation definitions 不在此重複維護。

| Registry entry | Source / role | Type | Frequency | requiredPeriods |
| --- | --- | --- | --- | ---: |
| `nonfarm_payrolls` | `PAYEMS` | `MONTHLY_DIFFERENCE` | Monthly | 2 |
| `underemployment` | `U6RATE` | `ROLLING_ZSCORE`, window 36 | Monthly | 36 |
| `sahm_rule` | `SAHMREALTIME` | `PASSTHROUGH` | Monthly | 1 |
| `consumer_confidence` | `UMCSENT` | `ROLLING_ZSCORE`, window 36 | Monthly | 36 |
| `durable_goods` | `DGORDER` | `YOY_PERCENT_CHANGE`, lag 12 | Monthly | 13 |
| `permits_starts:permits` | `PERMIT`, role `permits` | `YOY_PERCENT_CHANGE`, lag 12 | Monthly | 13 |
| `pce_price_index` | `PCEPI` | `YOY_PERCENT_CHANGE`, lag 12 | Monthly | 13 |
| `cpi_core_cpi:headline` | `CPIAUCSL`, role `headline` | `YOY_PERCENT_CHANGE`, lag 12 | Monthly | 13 |
| `cpi_core_cpi:core` | `CPILFESL`, role `core` | `YOY_PERCENT_CHANGE`, lag 12 | Monthly | 13 |
| `taiwan_cpi` | `A030101015` | `YOY_PERCENT_CHANGE`, lag 12 | Monthly | 13 |
| `tips_breakeven` | `T10YIE` | `PASSTHROUGH` | Daily | 1 |
| `vix` | `VIXCLS` | `PASSTHROUGH` | Daily | 1 |
| `credit_spread_baa10y` | `BAA10Y` | `ROLLING_ZSCORE`, window 36 | Monthly required input | 36 |
| `yield_curve_10y3m` | `T10Y3M` | `PASSTHROUGH` | Daily | 1 |
| `yield_curve_10y2y` | `T10Y2Y` | `PASSTHROUGH` | Daily | 1 |
| `gscpi` | `GSCPI` | `PASSTHROUGH` | Monthly | 1 |
| `global_gpr` | `GPR` | `ROLLING_ZSCORE`, window 36 | Monthly | 36 |
| `global_epu` | `GEPU_current` | `ROLLING_ZSCORE`, window 36 | Monthly | 36 |
| `trade_policy_uncertainty` | `TPU_MONTHLY:TPU` | `ROLLING_ZSCORE`, window 36 | Monthly | 36 |
| `household_debt_service_ratio` | `TDSP` | `LEVEL_PLUS_PERIOD_CHANGE_AND_TRAILING_MEDIAN` | Quarterly | 20 |
| `credit_card_delinquency` | `DRCCLACBS` | `LEVEL_PLUS_PERIOD_CHANGE_AND_TRAILING_MEDIAN` | Quarterly | 20 |

`credit_spread_baa10y` 的 raw FRED source 為 daily，但 transformation window 是 36 months。Step 2 已確認 `parameters.monthlyAggregation = CALENDAR_MONTH_MEAN`：每個 calendar month 對 valid daily values 取 arithmetic mean，再驗證 36 個連續月份；不使用 month-end value。

季度 `periodOverPeriodChange` pure utility 定義為 `current level - level at lag`；lag 4 代表相對四季前的 level difference。它不是 percent change，也不產生 signal。

## Inactive demo transformation set

以下 indicator 即使 acquisition code／source config 仍存在，也不在 active transformation registry：

- `auto_sales`
- `housing_starts`
- `household_credit_balance`
- `revolving_credit_balance`
- `budget_deficit_gdp`
- `eia_crude_inventories`
- `ppi`

`permits_starts` 是現有 source ID；active entry 只引用 `PERMIT`／role `permits`，不引用同一 acquisition mapping 中的 `HOUST`／role `starts`。

## Deferred decisions

Signal direction、threshold／band、rule basis、GREEN／YELLOW／RED 與 Market Score 全部延至後續步驟。Transformation 成為 `CONFIRMED` 不代表任何 SignalRule 已確認。
