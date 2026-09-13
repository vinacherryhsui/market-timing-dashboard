# Data Source Specification

## 1. 文件目的與邊界

本文件定義 active Indicator Library 要抓取的原始資料、取得方式、更新特性，以及進入 Signal evaluation 前所需的資料 transformation。

本文件不定義 `GREEN / YELLOW / RED / UNKNOWN` 的判斷門檻。資料 series 與 SignalRule 必須分離：例如 `T10Y2Y` 是資料系列；yield curve 如何轉成燈號屬於 SignalRule。

本文件保留 provider、series／dataset ID、source meaning、frequency、unit、seasonal adjustment、revision characteristics 與 official endpoint 的來源研究紀錄。21 個 active indicators 的 authoritative executable source configuration 已位於 Canonical Indicator Metadata v1；本文件不得成為平行 runtime registry。Catalogue-only inactive sources仍維持獨立。Latest observation date、raw value 與 retrieved time 來自目前 `RawObservation`，不屬於靜態 metadata。

狀態必須分成兩條互不推導的軸：

### `dataSourceStatus`

- `CONFIRMED`：provider 與 series/dataset ID 已確認，可進入資料取得實作規格；其他 metadata 仍可能需由官方端點驗證。
- `REVIEW_NEEDED`：已有候選 provider 或 series，但仍有選項、複合資料口徑、授權或取得方式需要決策。
- `TODO`：尚未指定可實作的 provider 或 series/dataset ID。

### `signalRuleStatus`

- `CONFIRMED`：equity-market interpretation、transformation input、direction 與全部 threshold/band 已完成產品規則確認。
- `REVIEW_NEEDED`：已有候選規則，但金融證據、邊界、方向、合成政策或市場解釋仍需審查。
- `TODO`：尚未形成可實作的 SignalRule。

`dataSourceStatus: CONFIRMED` **不代表** `signalRuleStatus: CONFIRMED`。資料可以已確定，但該資料對股票市場的 SignalRule 仍可能是 `REVIEW_NEEDED` 或 `TODO`。

本文既有表格中的 `implementation status` 是舊欄位名稱，僅表示 `dataSourceStatus`，不得解讀為 SignalRule 已驗證。新建或修改的條目應使用明確的 `dataSourceStatus` 與 `signalRuleStatus`。

「約略歷史涵蓋」只用來估算 transformation 是否有足夠資料，不是回測承諾。實作時必須從 provider metadata 動態讀取或重新核對 `observation_start`，不得把本文約略年份當成永久常數。

## 2. 共通取得與 latest-value 規則

### FRED

- Access method：FRED HTTPS API，使用 `fred/series` 取得 metadata、`fred/series/observations` 取得 observations；需要 FRED API key。開發階段也可用官方 CSV download 做人工核對，但正式 adapter 介面仍以可驗證 metadata 與 observations 為準。
- Latest-value logic：在原生頻率資料中，依 observation date 由新到舊選取第一個可解析的非缺值 observation。FRED 的 `last_updated` 是資料系列更新時間，不可當成 observation date。
- Missing value：FRED 回傳的 `.` 必須轉成 `null`，不得當成 0。
- Release schedule：以 FRED release calendar／series metadata 為準；不得硬寫每月固定日。Daily series 通常按美國營業日更新，但仍須接受假日與延遲。
- Revision：FRED 是目前可得資料；來源機構可能修訂歷史值。Stage 1 取得最新版本，不建立 vintage/backtest 流程。必要時保存 `retrievedAt` 與 `lastUpdated` 供追蹤。
- Transformation：adapter 回傳原始 level；YoY、monthly change、rolling z-score、moving average 與 distance 計算在 transformation layer 完成，不要求 FRED API 代算。

官方參考：[FRED series metadata API](https://fred.stlouisfed.org/docs/api/fred/series.html)、[FRED observations API](https://fred.stlouisfed.org/docs/api/fred/series_observations.html)。

### DGBAS、EIA 與待確認 provider

- 在 dataset ID、官方 endpoint、授權與 response schema 確認前，不可開始 adapter 實作。
- Latest-value logic 原則仍是選取最新的有效 observation period，不以網頁更新時間代替資料期間。
- 若只能下載檔案，必須另行規格化檔案 URL 穩定性、編碼、欄位名稱與版本變更處理。

## 3. FRED

### `auto_sales`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `auto_sales` |
| provider | FRED（原始來源：U.S. BEA） |
| series / dataset id | `TOTALSA` |
| source meaning | Total Vehicle Sales；總車輛銷售，不應在 UI 誤標成只含特定車種 |
| access method | FRED API：series metadata + observations |
| frequency | Monthly |
| unit | Millions of Units，Seasonally Adjusted Annual Rate |
| seasonally adjusted | Yes，SAAR |
| approximate historical coverage | 約自 1976 年；實作時由 FRED metadata 核對 |
| revision characteristics | BEA 月資料可能修訂；FRED 顯示目前版本 |
| known release schedule | 約每月；依 FRED／BEA release calendar，不硬寫日期 |
| transformation before signal | 由 level 計算 YoY，並與上一期 YoY 比較 momentum |
| latest-value logic | 最新非缺值月；需至少 13 個月資料才能完整計算 YoY momentum |
| unresolved issues | 中文名稱「新車銷售」是否與 TOTALSA 的 Total Vehicle Sales 口徑完全一致 |
| implementation status | `CONFIRMED` |

### `consumer_confidence`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `consumer_confidence` |
| provider | FRED（原始來源：University of Michigan） |
| series / dataset id | `UMCSENT` |
| source meaning | University of Michigan Consumer Sentiment index |
| access method | FRED API；注意來源版權與 FRED 顯示延遲 |
| frequency | Monthly |
| unit | Index，1966:Q1 = 100 |
| seasonally adjusted | No |
| approximate historical coverage | FRED 主 series 約自 1952 年；1978 年前另涉及 `UMCSENT1`，需核對可取範圍 |
| revision characteristics | 月內可能有 preliminary/final；FRED 說明資料延遲一個月；歷史值依來源更新 |
| known release schedule | 每月；以 Surveys of Consumers／FRED release calendar 為準 |
| transformation before signal | 以原始 index level 計算 5 年 rolling z-score |
| latest-value logic | 最新非缺值月；不得把發布日當觀察月份 |
| unresolved issues | 版權／再展示限制；FRED 一個月延遲是否符合產品即時性；最少 rolling 樣本 |
| implementation status | `CONFIRMED` |

### `nonfarm_payrolls`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `nonfarm_payrolls` |
| provider | FRED（原始來源：U.S. BLS） |
| series / dataset id | `PAYEMS` |
| source meaning | All Employees, Total Nonfarm；就業存量 level，不是已計算好的 monthly change |
| access method | FRED API |
| frequency | Monthly |
| unit | Thousands of Persons |
| seasonally adjusted | Yes |
| approximate historical coverage | 約自 1939 年 |
| revision characteristics | 最近月份會修訂，另有年度 benchmark revision |
| known release schedule | 每月 Employment Situation；依官方 calendar |
| transformation before signal | Variant A：本期 level 減前期 level，並由千人換算成人數；Variant B：level 計算 YoY growth，再計 5 年 rolling z-score |
| latest-value logic | 最新非缺值月；change variant 必須同時有可比前月 |
| unresolved issues | active rule variant 尚未決定；不得直接把 PAYEMS level 與 150,000 人 threshold 比較 |
| implementation status | `CONFIRMED` |

### `underemployment`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `underemployment` |
| provider | FRED（原始來源：U.S. BLS） |
| series / dataset id | `U6RATE` |
| source meaning | U-6 labor underutilization rate |
| access method | FRED API |
| frequency | Monthly |
| unit | Percent |
| seasonally adjusted | Yes |
| approximate historical coverage | 約自 1994 年 |
| revision characteristics | 季調因子可能年度修訂；近期值可能受更新影響 |
| known release schedule | 每月 Employment Situation |
| transformation before signal | 以 rate level 計算 5 年 rolling z-score |
| latest-value logic | 最新非缺值月；rolling window 不足時 transformation 為 unavailable |
| unresolved issues | `Underemployment / Slack` 顯示名稱須明確指向 U-6，而不是其他 slack measure |
| implementation status | `CONFIRMED` |

### `sahm_rule`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `sahm_rule` |
| provider | FRED |
| series / dataset id | `SAHMREALTIME` |
| source meaning | FRED 已計算的 Real-time Sahm Rule Recession Indicator，單位為 percentage points |
| access method | FRED API |
| frequency | Monthly |
| unit | Percentage Points |
| seasonally adjusted | Yes |
| approximate historical coverage | 約自 1959 年末 |
| revision characteristics | 使用當時可得失業率資料建構；BLS 每年季調修訂仍可能影響近年估計 |
| known release schedule | 每月 Employment Situation 後更新 |
| transformation before signal | 無需自行重算 3-month average／12-month low；直接使用 series value 作為 SignalRule input |
| latest-value logic | 最新非缺值月 |
| unresolved issues | Indicator Library 的原始公式與各 band 仍屬 SignalRule 核實事項，不在此改寫 |
| implementation status | `CONFIRMED` |

### `durable_goods`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `durable_goods` |
| provider | FRED（原始來源：U.S. Census Bureau） |
| series / dataset id | `DGORDER` |
| source meaning | Manufacturers' New Orders: Durable Goods，headline new-orders level |
| access method | FRED API |
| frequency | Monthly |
| unit | Millions of Dollars |
| seasonally adjusted | Yes |
| approximate historical coverage | 約自 1992 年 |
| revision characteristics | M3 survey 的近期月份會修訂，benchmark／methodology 亦可能更新 |
| known release schedule | 每月 Manufacturers' Shipments, Inventories, and Orders release |
| transformation before signal | level 計算 YoY，再與前一期 YoY 比較 momentum |
| latest-value logic | 最新非缺值月；至少需要 13 個月以計算 momentum |
| unresolved issues | 是否最終採 headline 或排除運輸系列屬資料口徑決策；目前使用者確認 `DGORDER` |
| implementation status | `CONFIRMED` |

### `permits_starts`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `permits_starts` |
| provider | FRED（原始來源：U.S. Census Bureau / HUD） |
| series / dataset id | `PERMIT` + `HOUST`（兩條 series，均必須保存） |
| source meaning | `PERMIT`：新建住宅核發許可；`HOUST`：新建住宅開工；皆為 total units SAAR |
| access method | 分別呼叫 FRED metadata 與 observations，再按 observation month 對齊 |
| frequency | Both Monthly |
| unit | Both Thousands of Units，Seasonally Adjusted Annual Rate |
| seasonally adjusted | Both Yes，SAAR |
| approximate historical coverage | `PERMIT` 約自 1960 年；`HOUST` 約自 1959 年 |
| revision characteristics | 住宅建設資料會修訂；`PERMIT` 亦有調查涵蓋範圍變更紀錄 |
| known release schedule | 每月 New Residential Construction；兩 series 通常同一 release，但不可假設同時到齊 |
| transformation before signal | 各自計算 YoY 與 momentum；合成 Observation 的方式尚未定義，不可先平均 |
| latest-value logic | 找出兩 series 都有有效值的最新共同月份；若產品要顯示非同步最新值，需另訂 composite policy |
| unresolved issues | 兩條 series 如何合成單一 value／Signal；一條缺值或方向分歧的處理 |
| dataSourceStatus | `CONFIRMED`（`PERMIT`、`HOUST` source series 均已確認） |
| signalRuleStatus | `REVIEW_NEEDED`（composite Observation／Signal policy unresolved） |

### `budget_deficit_gdp`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `budget_deficit_gdp` |
| provider | FRED（原始來源：U.S. OMB） |
| series / dataset id | `FYFSGDA188S` |
| source meaning | Federal Surplus or Deficit `[-]` as Percent of GDP；赤字以負值表示 |
| access method | FRED API |
| frequency | Annual |
| unit | Percent of GDP |
| seasonally adjusted | No |
| approximate historical coverage | 約自 1930 年 |
| revision characteristics | 年度財政／GDP 資料可因歷史更新與 GDP 修訂改變 |
| known release schedule | Annual／不規則更新；依 FRED metadata 與 release calendar |
| transformation before signal | 必須先確認 SignalRule 要使用帶符號值或赤字絕對值；資料層保留原始負號 |
| latest-value logic | 最新非缺值年度；UI 必須顯示資料年度，不能暗示為即時月資料 |
| unresolved issues | 原始規則用「赤字 3%／5%」但 series 赤字為負值；sign normalization 尚未定義；計分適格性待確認 |
| dataSourceStatus | `CONFIRMED`（FRED `FYFSGDA188S`） |
| signalRuleStatus | `REVIEW_NEEDED`（annual negative-valued source 與正值赤字幅度規則尚未對齊；不得改變 scoring eligibility） |

### `yield_curve_10y2y`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `yield_curve_10y2y` |
| provider | FRED（原始來源：Federal Reserve Board） |
| series / dataset id | `T10Y2Y` |
| source meaning | 10-Year Treasury Constant Maturity Minus 2-Year Treasury Constant Maturity |
| access method | FRED API |
| frequency | Daily |
| unit | Percent（spread 的百分點值） |
| seasonally adjusted | No |
| approximate historical coverage | 約自 1976 年 |
| revision characteristics | 市場利率衍生 spread；可能更正，但通常沒有總經統計的系統性 revision cycle |
| known release schedule | 美國營業日更新，受假日與資料延遲影響 |
| transformation before signal | 無；本階段保留 raw spread level |
| latest-value logic | `T10Y2Y` 最新可解析非缺值 observation date |
| unresolved issues | daily-to-dashboard aggregation 與 SignalRule 尚未定義；不得與 `T10Y3M` 合成或互相 fallback |
| dataSourceStatus | `CONFIRMED`（live verified） |
| signalRuleStatus | `TODO` |

### `yield_curve_10y3m`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `yield_curve_10y3m` |
| provider | FRED（原始來源：Federal Reserve Board） |
| series / dataset id | `T10Y3M` |
| source meaning | 10-Year Treasury Constant Maturity Minus 3-Month Treasury Constant Maturity |
| access method | FRED API |
| frequency | Daily |
| unit | Percent（spread 的百分點值） |
| seasonally adjusted | No |
| approximate historical coverage | 約自 1982 年 |
| revision characteristics | 市場利率衍生 spread；可能更正，但通常沒有總經統計的系統性 revision cycle |
| known release schedule | 美國營業日更新，受假日與資料延遲影響 |
| transformation before signal | 無；本階段保留 raw spread level |
| latest-value logic | `T10Y3M` 最新可解析非缺值 observation date |
| unresolved issues | daily-to-dashboard aggregation 與 SignalRule 尚未定義；不得與 `T10Y2Y` 合成或互相 fallback |
| dataSourceStatus | `CONFIRMED`（live verified） |
| signalRuleStatus | `TODO` |

### `cpi_core_cpi`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `cpi_core_cpi` |
| provider | FRED（原始來源：U.S. BLS） |
| series / dataset id | `CPIAUCSL` + `CPILFESL`（Headline CPI + Core CPI） |
| source meaning | 全項 CPI 與扣除 food and energy 的 Core CPI，兩條獨立 price-index level |
| access method | 分別呼叫 FRED API，按 observation month 對齊 |
| frequency | Both Monthly |
| unit | Both Index 1982–1984 = 100 |
| seasonally adjusted | Both Yes |
| approximate historical coverage | `CPIAUCSL` 約自 1947 年；`CPILFESL` 約自 1957 年 |
| revision characteristics | 季調系列可能因 seasonal factors 修訂；index reference base 也可能重標但成長率語意不變 |
| known release schedule | 每月 CPI release |
| transformation before signal | 兩 series 各自計算 YoY；如何形成單一 indicator observation／distance 尚未定義 |
| latest-value logic | 最新共同有效月份；保留 headline 與 core 個別值，不先覆蓋或平均 |
| unresolved issues | headline／core 的合成、優先級或雙訊號政策；2% target 與 bands 屬 SignalRule |
| dataSourceStatus | `CONFIRMED`（`CPIAUCSL`、`CPILFESL` source series 均已確認） |
| signalRuleStatus | `REVIEW_NEEDED`（headline CPI 與 Core CPI 如何形成單一 user-facing Observation／Signal 尚未決定） |

### `pce_price_index`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `pce_price_index` |
| provider | FRED（原始來源：U.S. BEA） |
| series / dataset id | `PCEPI` |
| source meaning | Personal Consumption Expenditures Chain-type Price Index；headline PCE price index |
| access method | FRED API |
| frequency | Monthly |
| unit | Index 2017 = 100 |
| seasonally adjusted | Yes |
| approximate historical coverage | 約自 1959 年 |
| revision characteristics | 隨 NIPA revisions 可修訂整段歷史資料 |
| known release schedule | 每月 Personal Income and Outlays |
| transformation before signal | level 計算 YoY，之後才由 SignalRule 計算與 target 的距離 |
| latest-value logic | 最新非缺值月；需有去年同期值 |
| unresolved issues | 是否應使用 headline `PCEPI` 或 core PCE；目前 user-confirmed series 為 `PCEPI` |
| implementation status | `CONFIRMED` |

### `ppi`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `ppi` |
| provider | FRED（原始來源：U.S. BLS） |
| series / dataset id | `PPIACO` |
| source meaning | Producer Price Index by Commodity: All Commodities |
| access method | FRED API |
| frequency | Monthly |
| unit | Index 1982 = 100 |
| seasonally adjusted | No |
| approximate historical coverage | 約自 1913 年 |
| revision characteristics | PPI 近期值可能修訂，分類與權重也可能更新 |
| known release schedule | 每月 Producer Price Index release |
| transformation before signal | level 計算 YoY；historical average、distance 與 window 在 transformation/rule 規格確認後計算 |
| latest-value logic | 最新非缺值月；需有去年同期值 |
| unresolved issues | historical-average window 與 distance thresholds 未定；inflation／growth 敘事待審查 |
| dataSourceStatus | `CONFIRMED`（FRED `PPIACO`，live verified） |
| signalRuleStatus | `REVIEW_NEEDED` |

### `credit_spread_baa10y`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `credit_spread_baa10y` |
| provider | FRED；包含 Moody's 衍生資訊 |
| series / dataset id | `BAA10Y` |
| source meaning | Moody's Seasoned Baa Corporate Bond Yield Relative to Yield on 10-Year Treasury Constant Maturity |
| access method | FRED API；demo 僅 acquisition／verification，不代表取得再展示或再散布授權 |
| frequency | Daily |
| unit | Percent |
| seasonally adjusted | No |
| approximate historical coverage | 約自 1986 年 |
| revision characteristics | 市場利率衍生值通常少修訂，但可能更正；底層 Moody's 資料有版權限制 |
| known release schedule | `BAA10Y` 美國營業日更新 |
| transformation before signal | 無；本階段保留 raw spread level |
| latest-value logic | 最新可解析非缺值 observation date |
| unresolved issues | 此 series 含 Moody’s-derived copyrighted information；不得假設產品具有 redistribution rights。正式展示、快取、輸出與散布前必須完成授權審查；daily aggregation 與 SignalRule 亦未定 |
| dataSourceStatus | `CONFIRMED`（acquisition live verified；redistribution rights 未確認） |
| signalRuleStatus | `REVIEW_NEEDED` |

### `tips_breakeven`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `tips_breakeven` |
| provider | FRED |
| series / dataset id | `T10YIE` |
| source meaning | 10-Year Breakeven Inflation Rate，由 nominal 10Y Treasury 與 10Y inflation-indexed Treasury 推導的市場通膨預期 |
| access method | FRED API |
| frequency | Daily |
| unit | Percent |
| seasonally adjusted | No |
| approximate historical coverage | 約自 2003 年 |
| revision characteristics | 市場衍生資料通常少修訂，但可能更正；不是 CPI 實現值 |
| known release schedule | 美國營業日更新 |
| transformation before signal | `distance = abs(raw T10YIE breakeven rate - 2.0 percentage points)`；原始 `T10YIE` level 必須同時保留 |
| candidate signal method / direction | `distance_from_target` / `-1` |
| candidate signal bands | GREEN：distance <0.5pp；YELLOW：0.5pp–1pp；RED：distance >1pp |
| latest-value logic | 最新非缺值交易日 |
| unresolved issues | 2% anchor、0.5pp／1pp bands 的金融證據與邊界包含方式仍待核實，不得宣稱官方或學術最佳。 |
| dataSourceStatus | `CONFIRMED`（FRED `T10YIE`） |
| signalRuleStatus | `REVIEW_NEEDED` |

### `vix`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `vix` |
| provider | FRED（原始來源：CBOE） |
| series / dataset id | `VIXCLS` |
| source meaning | CBOE Volatility Index daily close，反映由股票指數選擇權價格推導的近期期待波動 |
| access method | FRED API；須審查 CBOE 資料版權／再展示條件 |
| frequency | Daily，Close |
| unit | Index |
| seasonally adjusted | No |
| approximate historical coverage | 約自 1990 年 |
| revision characteristics | 市場 close 通常不修訂，但可有更正或缺漏補值 |
| known release schedule | 美國交易日收盤後／FRED 更新時程 |
| transformation before signal | `TODO`：先保留原始 close；門檻或 z-score 尚未選定 |
| latest-value logic | 最新非缺值交易日 close |
| unresolved issues | Signal method、direction、20/30 是否採用、rule basis、版權與 daily aggregation |
| implementation status | `CONFIRMED`（source only；signal specification remains TODO） |

## 4. DGBAS（行政院主計總處）

### `taiwan_cpi`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `taiwan_cpi` |
| provider | DGBAS |
| series / dataset id | DGBAS function code `A030101015`；政府資料開放平臺 dataset `6019`；selector：`Item=總指數…`、`TYPE=原始值`、`FREQ=M` |
| source meaning | 臺灣地區消費者物價基本分類指數中的總指數原始值 |
| access method | DGBAS 官方 XML：`https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230555/pr0101a1m.xml`；無 API key |
| frequency | Monthly（XML `FREQ=M`） |
| unit | Index，民國 110 年／2021 年 = 100 |
| seasonally adjusted | No／原始值（XML `TYPE=原始值`） |
| approximate historical coverage | 官方 XML 目前包含自 1981 年起的月資料；實作不硬編碼起點 |
| revision characteristics | 官方 XML 是目前發布版本；基期改編、權數更新或歷史值調整時可能整檔更新 |
| known release schedule | 每月更新；精確發布日依 DGBAS calendar |
| transformation before signal | 本階段無；adapter 只保留總指數原始 level，不計算 YoY |
| latest-value logic | 在總指數、原始值、月頻紀錄中，依 `TIME_PERIOD` 選最新可解析的非空 `Item_VALUE` |
| unresolved issues | 官方 XML URL 若版本化變更，需由 dataset 6019 metadata 更新；SignalRule 的 Taiwan reference 不屬資料 adapter |
| dataSourceStatus | `CONFIRMED`（live verified） |
| signalRuleStatus | `REVIEW_NEEDED` |

## 5. EIA

### `eia_crude_inventories`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `eia_crude_inventories` |
| provider | U.S. EIA |
| series / dataset id | API v2 route `/petroleum/stoc/wstk/data/`；series `WCESTUS1` |
| source meaning | U.S. commercial crude oil ending stocks excluding Strategic Petroleum Reserve |
| access method | EIA API v2；`frequency=weekly`、`data[0]=value`、`facets[series][]=WCESTUS1`；key 讀取 `EIA_API_KEY` |
| frequency | Weekly |
| unit | `MBBL`（Thousand Barrels） |
| seasonally adjusted | Returned schema 未標示為 seasonally adjusted |
| approximate historical coverage | 約自 1982 年；實作不硬編碼起點 |
| revision characteristics | Weekly Petroleum Status Report 可能修正前期估計；adapter 取得目前版本 |
| known release schedule | Weekly Petroleum Status Report，通常每週；假日週可能調整，依 EIA calendar |
| transformation before signal | 本階段無；adapter 只保留 weekly ending-stock raw level |
| latest-value logic | 依 `period` 選取 `series=WCESTUS1` 的最新可解析非缺值 observation；不可用 retrieval time 代替 week-ending date |
| unresolved issues | `MBBL` 的 user-facing 顯示名稱與未來更新延遲提示；SignalRule 不屬資料 adapter |
| dataSourceStatus | `CONFIRMED`（live verified） |
| signalRuleStatus | `REVIEW_NEEDED` |

官方參考：[EIA Weekly Petroleum Status Report](https://www.eia.gov/petroleum/supply/weekly/)。

## 6. Periodic research files

以下資料不在 dashboard load 時即時下載。`acquisitionMode = PERIODIC_FILE`，由 `npm run sync:research-data` 手動同步完整歷史序列至 `data/cache/research/`。同步成功後以原子替換更新 cache；下載或解析失敗時保留上次成功 cache。各來源獨立同步，單一失敗不得阻止其他來源。

### `global_gpr`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `global_gpr` |
| provider | Caldara & Iacoviello Geopolitical Risk Index website |
| official source | `https://www.matteoiacoviello.com/gpr.htm` |
| dataset / file identity | `data_gpr_export.xls`；global monthly `GPR` column，不使用 Taiwan-specific series |
| acquisitionMode | `PERIODIC_FILE` |
| frequency / unit | Monthly / Index, 1985–2019 average = 100 |
| available history | 1985-01 至目前官方檔案最新月份；2026-09-02 同步為 500 observations，最新 2026-08 |
| seasonal adjustment | Not applicable / not stated as seasonally adjusted |
| revision characteristics | 最新資料為 preliminary；報紙延遲加入搜尋庫、重複或遺漏文章修正可造成近期及較早資料 revision |
| license / attribution | CC BY；使用時須標示 Caldara、Iacoviello、網站與相關論文 |
| acquisition notes | 官方 Excel 全檔下載，解析 `Sheet1.month` + `Sheet1.GPR`；不使用非官方 mirror |
| cache behavior | `data/cache/research/global_gpr.json`；保存完整有效月史與同步 metadata |
| dataSourceStatus | `CONFIRMED`（live synchronized） |
| signalRuleStatus | `TODO` |

### `global_epu`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `global_epu` |
| provider | Economic Policy Uncertainty / policyuncertainty.com |
| official source | `https://www.policyuncertainty.com/global_monthly.html` |
| dataset / file identity | `Global_Policy_Uncertainty_Data.xlsx`；`GEPU_current`（current-price GDP-weighted global series），不以單一國家 EPU 替代；官方檔內另有獨立 `GEPU_ppp` |
| acquisitionMode | `PERIODIC_FILE` |
| frequency / unit | Monthly / Index |
| available history | 1997-01 至目前官方檔案最新月份；2026-09-02 同步為 355 observations，最新 2026-07 |
| seasonal adjustment | Not applicable / not stated as seasonally adjusted |
| revision characteristics | Global series 受國家 EPU、imputation 與 GDP weights 更新影響；官方檔更新可能修訂值 |
| license / attribution | Creative Commons Attribution 4.0 International；引用 Davis 的 Global EPU 研究與官方網站 |
| acquisition notes | 官方 Excel 全檔下載，解析 `Year`、`Month`、`GEPU_current`；不把 PPP series 混入目前 observation |
| cache behavior | `data/cache/research/global_epu.json`；保存完整有效月史與同步 metadata |
| dataSourceStatus | `CONFIRMED`（live synchronized） |
| signalRuleStatus | `TODO` |

### `trade_policy_uncertainty`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `trade_policy_uncertainty` |
| provider | Caldara et al. Trade Policy Uncertainty website |
| official source | `https://www.matteoiacoviello.com/tpu.htm` |
| dataset / file identity | `tpu_web_latest.xlsx`；`TPU_MONTHLY` sheet 的 aggregate `TPU`；demo 不使用 daily data |
| acquisitionMode | `PERIODIC_FILE` |
| frequency / unit | Monthly / normalized index（100 代表 TPU article share 為 1%） |
| available history | 1960-01 至目前官方檔案最新月份；2026-09-02 同步為 800 observations，最新 2026-08 |
| seasonal adjustment | Not applicable / not stated as seasonally adjusted |
| revision characteristics | 最新資料 preliminary；報紙延遲加入搜尋庫，以及重複、遺漏文章或版本修正，可能修訂近期或更早資料 |
| license / attribution | 可在標示作者、論文、網站與下載日期下免費使用；引用 Caldara et al. (2020) |
| acquisition notes | 官方 Excel 全檔下載，只解析 aggregate monthly sheet；不抓 daily chart 或非官方 mirror |
| cache behavior | `data/cache/research/trade_policy_uncertainty.json`；保存完整有效月史與同步 metadata |
| dataSourceStatus | `CONFIRMED`（live synchronized） |
| signalRuleStatus | `TODO` |

### `gscpi`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `gscpi` |
| provider | Federal Reserve Bank of New York |
| official source | `https://www.newyorkfed.org/research/policy/gscpi` |
| dataset / file identity | 官方 `gscpi_data.xlsx`；`GSCPI Monthly Data` sheet 的 `GSCPI` column |
| acquisitionMode | `PERIODIC_FILE` |
| frequency / unit | Monthly / standard deviations from historical average |
| available history | 1998-01 至目前官方檔案最新月份；2026-09-02 同步為 343 observations，最新 2026-07 |
| seasonal adjustment | Composite methodology uses seasonally adjusted inputs where specified; published GSCPI value本身不另做本產品季調 |
| revision characteristics | 官方更新檔可能包含歷史 revision；本產品保存每次手動同步取得的目前完整版本，但不重建 vintage |
| license / attribution | 引用 Federal Reserve Bank of New York, Global Supply Chain Pressure Index；遵守 NY Fed Terms of Use |
| disclaimer | GSCPI 不是 New York Fed、其總裁、Federal Reserve System 或 FOMC 的官方估計 |
| acquisition notes | 官方 Excel 全檔下載；不 scrape rendered chart |
| cache behavior | `data/cache/research/gscpi.json`；保存完整有效月史與同步 metadata |
| dataSourceStatus | `CONFIRMED`（live synchronized） |
| signalRuleStatus | `TODO` |

## 7. Provider / Series 尚待確認

以下 7 個 active candidate 沒有 user-confirmed series。不得因名稱相近自行選擇 Yahoo Finance、FRED、交易所或商業資料源。

### `copper_price`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `copper_price` |
| provider / series | `TODO` / `TODO` |
| source meaning | 銅現貨、期貨連續合約或官方 benchmark 尚未決定 |
| access method | `TODO` |
| frequency / unit / SA | `TODO` / `TODO` / `TODO` |
| approximate historical coverage | `TODO` |
| revision characteristics | `TODO`；另須處理期貨換月時才有連續序列問題 |
| known release schedule | `TODO` |
| transformation before signal | 選定一致 price series 後計算 200 trading-day moving average 與相對距離 |
| latest-value logic | `TODO`；必須定義交易日、close／settlement 與時區 |
| unresolved issues | price definition、currency、venue、continuous-contract methodology、license |
| implementation status | `TODO` |

### `ism_pmi`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `ism_pmi` |
| provider / series | `TODO` / `TODO` |
| source meaning | ISM Manufacturing PMI 與 Services PMI 的確切系列與是否組合尚未決定 |
| access method | `TODO` |
| frequency / unit / SA | 預期 Monthly / diffusion index / `TODO`，均待來源確認 |
| approximate historical coverage | `TODO` |
| revision characteristics | `TODO` |
| known release schedule | 預期每月分別發布；精確時程待來源確認 |
| transformation before signal | 若保留兩 series，先各自保留 level；合成方式不得在資料 adapter 中猜測 |
| latest-value logic | 最新共同月份或獨立最新值政策 `TODO` |
| unresolved issues | provider、series IDs、授權、Manufacturing/Services 合成規則 |
| implementation status | `TODO` |

### `lme_inventory`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `lme_inventory` |
| provider / series | `TODO` / `TODO` |
| source meaning | 哪些 LME metals、warehouse stock 欄位與合成口徑尚未決定 |
| access method | `TODO` |
| frequency / unit / SA | `TODO` / `TODO` / `TODO` |
| approximate historical coverage | `TODO` |
| revision characteristics | `TODO` |
| known release schedule | `TODO` |
| transformation before signal | 選定金屬與合成方法後才能計算 5 年 rolling z-score |
| latest-value logic | `TODO`；多金屬必須先定義共同日期與缺值政策 |
| unresolved issues | metals basket、unit normalization、provider、license、series IDs |
| implementation status | `TODO` |

### `bdi`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `bdi` |
| provider / series | `TODO` / `TODO` |
| source meaning | Baltic Dry Index 的官方或合法可再展示 series 尚未指定 |
| access method | `TODO` |
| frequency / unit / SA | `TODO` / Index（待確認） / `TODO` |
| approximate historical coverage | `TODO` |
| revision characteristics | `TODO` |
| known release schedule | `TODO` |
| transformation before signal | 選定 level series 後計算 5 年 rolling z-score |
| latest-value logic | `TODO`；需定義發布日、時區與非交易日 |
| unresolved issues | provider、series ID、license、頻率、歷史可得性 |
| implementation status | `TODO` |

### `dxy`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `dxy` |
| provider / series | `TODO` / `TODO` |
| source meaning | DXY 現貨／官方 index／可替代 trade-weighted dollar index 尚未決定，彼此不可混用 |
| access method | `TODO` |
| frequency / unit / SA | `TODO` / `TODO` / `TODO` |
| approximate historical coverage | `TODO` |
| revision characteristics | `TODO` |
| known release schedule | `TODO` |
| transformation before signal | 選定 level series 後計算 5 年 rolling z-score |
| latest-value logic | `TODO`；需定義 close、時區與交易日 |
| unresolved issues | exact index、provider、license、US/TW context 是否共用同一資料 |
| implementation status | `TODO` |

### `household_credit_balance`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `household_credit_balance` |
| provider | FRED（原始來源：Federal Reserve Board, Financial Accounts of the United States） |
| series / dataset id | `HCCSDODNS` |
| source meaning | Households and Nonprofit Organizations; Consumer Credit; Liability, Level |
| access method | FRED API |
| frequency | Quarterly, End of Period |
| unit | Millions of U.S. Dollars |
| seasonally adjusted | No |
| approximate historical coverage | 依 FRED series metadata；實作不硬編起始日 |
| revision characteristics | Financial Accounts 可在後續季度發布與年度／基準更新時修訂歷史值 |
| known release schedule | Quarterly Financial Accounts release |
| transformation before signal | 無；本階段保留 raw signed balance level，不套用舊 3%／6% 規則 |
| latest-value logic | 最新可解析非缺值季度 observation date |
| unresolved issues | level 的後續 transformation 與股票市場 SignalRule 尚未決定；不得與其他 consumer-credit indicators 合成 |
| dataSourceStatus | `CONFIRMED`（live verified） |
| signalRuleStatus | `TODO` |

### `revolving_credit_balance`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `revolving_credit_balance` |
| provider | FRED（原始來源：Federal Reserve Board） |
| series / dataset id | `CCLACBM027SBOG` |
| source meaning | Consumer Loans: Credit Cards and Other Revolving Plans, All Commercial Banks |
| access method | FRED API |
| frequency | Monthly |
| unit | Billions of U.S. Dollars |
| seasonally adjusted | Yes |
| approximate historical coverage | 依 FRED series metadata；實作不硬編起始日 |
| revision characteristics | 銀行彙總資料與季調因子可能修訂，亦可能受 reporting／benchmark updates 影響 |
| known release schedule | Monthly；依 Federal Reserve banking data release calendar |
| transformation before signal | 無；本階段保留 raw balance level |
| latest-value logic | 最新可解析非缺值月份 |
| unresolved issues | 後續 transformation 與 SignalRule 尚未決定；不得與其他 household-credit series 合成 |
| dataSourceStatus | `CONFIRMED`（live verified） |
| signalRuleStatus | `TODO` |

### `household_debt_service_ratio`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `household_debt_service_ratio` |
| provider | FRED（原始來源：Federal Reserve Board） |
| series / dataset id | `TDSP` |
| source meaning | Household Debt Service Payments as a Percent of Disposable Personal Income |
| access method | FRED API |
| frequency | Quarterly |
| unit | Percent |
| seasonally adjusted | Yes |
| approximate historical coverage | 依 FRED series metadata；實作不硬編起始日 |
| revision characteristics | 比率的收入與債務服務估計及歷史資料可能隨來源資料與方法更新修訂 |
| known release schedule | Quarterly；依 Household Debt Service and Financial Obligations Ratios release |
| transformation before signal | 無；本階段保留 raw ratio level |
| latest-value logic | 最新可解析非缺值季度 observation date |
| unresolved issues | 後續 transformation 與 SignalRule 尚未決定 |
| dataSourceStatus | `CONFIRMED`（live verified） |
| signalRuleStatus | `TODO` |

### `credit_card_delinquency`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `credit_card_delinquency` |
| provider | FRED（原始來源：Federal Reserve Board） |
| series / dataset id | `DRCCLACBS` |
| source meaning | Delinquency Rate on Credit Card Loans, All Commercial Banks |
| access method | FRED API |
| frequency | Quarterly, End of Period |
| unit | Percent |
| seasonally adjusted | Yes |
| approximate historical coverage | 依 FRED series metadata；實作不硬編起始日 |
| revision characteristics | 銀行彙總資料與季調因子可能修訂，亦可能受 reporting changes 影響 |
| known release schedule | Quarterly；依 Federal Reserve charge-off and delinquency release |
| transformation before signal | 無；本階段保留 raw delinquency-rate level |
| latest-value logic | 最新可解析非缺值季度 observation date |
| unresolved issues | 後續 transformation 與 SignalRule 尚未決定 |
| dataSourceStatus | `CONFIRMED`（live verified） |
| signalRuleStatus | `TODO` |

### `ted_spread`

| 欄位 | 規格 |
| --- | --- |
| indicatorId | `ted_spread` |
| provider / series | `TODO` / `TODO` |
| source meaning | TED spread 的 underlying rates、tenor 與現行可取得替代定義尚未確認 |
| access method | `TODO` |
| frequency / unit / SA | `TODO` / `TODO` / `TODO` |
| approximate historical coverage | `TODO` |
| revision characteristics | `TODO` |
| known release schedule | `TODO` |
| transformation before signal | 選定 spread level 後計算 rolling z-score；window 尚待 SignalRule 確認 |
| latest-value logic | `TODO` |
| unresolved issues | 是否保留在最終候選池、現行 series、methodology break、provider、license |
| implementation status | `TODO` |

## 8. 實作前 Gate

每個 indicator 只有在以下條件全部完成後，才能進入 data-acquisition implementation：

1. provider 與唯一 series/dataset ID 已確定；複合指標則列出全部 series。
2. 官方 access method、授權與 rate limit 已確認。
3. frequency、unit、seasonal adjustment 與 observation date 語意已確認。
4. latest-value、missing-value 與複合 series 對齊規則已確定。
5. transformation input 與所需最少歷史長度已確定。
6. 資料 transformation 與 SignalRule 保持分離。

本文件完成後不代表已授權或已開始資料抓取。
