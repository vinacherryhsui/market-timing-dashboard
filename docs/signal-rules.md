# Active Demo Signal Rules（Step 4）

本文件記錄 21 個 active entries 的 executable SignalRule。程式中的 authoritative definitions 位於 Canonical Indicator Metadata v1；`src/domain/signals/signalRuleRegistry.js` 僅提供由 canonical metadata 衍生的相容 API。Methodology/detail view 應由 canonical metadata、目前 Observation 與執行結果組合產生，不得在 UI 重複硬寫規則文字。

所有規則目前版本均為 `1.0.0`，status 均為 `CONFIRMED`（代表可執行，不代表學術最適或官方股票市場規則）。除 VIX 為 `CONVENTIONAL` 外，rule-level evidence basis 均為 `AUTHOR_DEFINED`。

## Transformation → Signal mapping

| Active entry | Transformation output | GREEN | YELLOW | RED | Basis |
| --- | --- | --- | --- | --- | --- |
| `nonfarm_payrolls` | monthly difference，千人 | `x > 122` | `0 <= x <= 122` | `x < 0` | AUTHOR_DEFINED |
| `underemployment` | 36-month rolling z-score | `z < 0` | `0 <= z <= 1` | `z > 1` | AUTHOR_DEFINED |
| `sahm_rule` | passthrough | `x < 0.30` | `0.30 <= x < 0.50` | `x >= 0.50` | AUTHOR_DEFINED |
| `consumer_confidence` | 36-month rolling z-score | `z > 0` | `-1 <= z <= 0` | `z < -1` | AUTHOR_DEFINED |
| `durable_goods` | YoY % | `x > 5` | `-5 <= x <= 5` | `x < -5` | AUTHOR_DEFINED |
| `permits_starts:permits` | PERMIT YoY % | `x > 5` | `-5 <= x <= 5` | `x < -5` | AUTHOR_DEFINED |
| `pce_price_index` | YoY % | `1.5 <= x <= 2.5` | `1.0 <= x < 1.5` or `2.5 < x <= 3.0` | `x < 1.0` or `x > 3.0` | AUTHOR_DEFINED |
| `cpi_core_cpi:headline` | headline CPI YoY % | 同 PCE demo bands | 同 PCE demo bands | 同 PCE demo bands | AUTHOR_DEFINED |
| `cpi_core_cpi:core` | core CPI YoY % | 同 PCE demo bands | 同 PCE demo bands | 同 PCE demo bands | AUTHOR_DEFINED |
| `taiwan_cpi` | YoY % | `0 <= x < 2` | `-1 <= x < 0` or `2 <= x < 3` | `x < -1` or `x >= 3` | AUTHOR_DEFINED |
| `tips_breakeven` | passthrough | `1.5 <= x <= 2.5` | `1.0 <= x < 1.5` or `2.5 < x <= 3.0` | `x < 1.0` or `x > 3.0` | AUTHOR_DEFINED |
| `vix` | passthrough | `x < 20` | `20 <= x <= 30` | `x > 30` | CONVENTIONAL |
| `credit_spread_baa10y` | daily → monthly mean → 36-month z-score | `z < 0` | `0 <= z <= 1` | `z > 1` | AUTHOR_DEFINED |
| `yield_curve_10y3m` | passthrough，pp | `x > 0.50` | `0 <= x <= 0.50` | `x < 0` | AUTHOR_DEFINED |
| `yield_curve_10y2y` | passthrough，pp | `x > 0.50` | `0 <= x <= 0.50` | `x < 0` | AUTHOR_DEFINED |
| `gscpi` | passthrough | `x < 0` | `0 <= x <= 1` | `x > 1` | AUTHOR_DEFINED |
| `global_gpr` | 36-month rolling z-score | `z < 0` | `0 <= z <= 1` | `z > 1` | AUTHOR_DEFINED |
| `global_epu` | 36-month rolling z-score | `z < 0` | `0 <= z <= 1` | `z > 1` | AUTHOR_DEFINED |
| `trade_policy_uncertainty` | 36-month rolling z-score | `z < 0` | `0 <= z <= 1` | `z > 1` | AUTHOR_DEFINED |
| `household_debt_service_ratio` | current + 20-quarter median + 4Q change | `current < median` AND `change <= 0` | 其他有效組合 | `current > median` AND `change > 0` | AUTHOR_DEFINED |
| `credit_card_delinquency` | current + 20-quarter median + 4Q change | `current < median` AND `change <= 0` | 其他有效組合 | `current > median` AND `change > 0` | AUTHOR_DEFINED |

Compound rules 的實際 output keys 是 `current`、`trailingMedian`、`periodChange4Q`。`current == trailingMedian` 不命中 GREEN 或 RED，因此是 YELLOW。

## Evidence qualifications

- `nonfarm_payrolls`：122K 是參考目前 BLS 對 establishment survey 月變動統計顯著性之說明而設定的 demo threshold，不是官方 bullish-market threshold。
- `sahm_rule`：0.50 門檻在 structured metadata 中標為 `OFFICIAL` Sahm recession trigger；0.30 warning boundary 標為 `AUTHOR_DEFINED`。因 executable rule 包含作者門檻，rule-level basis 為 `AUTHOR_DEFINED`。
- `pce_price_index`：Fed 2% PCE inflation objective 是 anchor；周圍燈號 bands 為產品定義。
- headline/core CPI：2% 是受 PCE objective 啟發的簡化 price-stability anchor，不是官方 CPI 或 Core CPI target。
- Taiwan CPI bands 是產品定義，不是台灣央行官方通膨目標。
- TIPS breakeven 是 market-implied inflation compensation，不是 realized inflation 或純 survey forecast。
- VIX 20/30 是 conventional candidate thresholds，不是 Cboe 官方 regime thresholds。
- GSCPI 以歷史平均標準化；GREEN/YELLOW/RED 解讀為產品定義。
- Yield curve 的負值代表 inversion；0–0.50 pp near-flat warning band 是產品定義。
- BAA10Y 繼承 data-source metadata 中 Moody's-derived copyright/licensing caveat；能取得資料不代表具有再散布權。

## Inactive / acquisition-only entries

下列項目沒有 active demo SignalRule，既有 acquisition code 可保留：

- `auto_sales`
- `permits_starts:starts`／HOUST（housing starts）
- `household_credit_balance`
- `revolving_credit_balance`
- `budget_deficit_gdp`
- `eia_crude_inventories`
- `ppi`

## UNKNOWN

History 未就緒、transformation 回傳 null、compound input 不完整、rule 缺少或無效時均回傳 UNKNOWN，不得降級成 YELLOW。詳細執行安全規則見 [`signal-engine.md`](./signal-engine.md)。本階段不計算 Market Score。
