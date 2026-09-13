# Indicator Library 候選清冊

Active candidate Indicator Library 已確認為 18 個。以下清單是產品目前要繼續進行資料來源與規則驗證的 active pool；被排除的歷史候選保留於本文末尾的「Excluded Indicators」。

## Active Indicator IDs（18）

1. `auto_sales`
2. `consumer_confidence`
3. `nonfarm_payrolls`
4. `underemployment`
5. `sahm_rule`
6. `durable_goods`
7. `permits_starts`
8. `budget_deficit_gdp`
9. `household_credit_balance`
10. `eia_crude_inventories`
11. `yield_curve`
12. `cpi_core_cpi`
13. `pce_price_index`
14. `taiwan_cpi`
15. `ppi`
16. `credit_spread`
17. `tips_breakeven`
18. `vix`

以下是可實作前的候選 metadata。`建議 category` 與標記為 provisional 的 `scoringEligible` 是產品建模建議，不代表金融規則已驗證。資料未提供處標 `TODO`；證據或規則無法判斷處標 `REVIEW_NEEDED`。

資料來源的 authoritative specification 是 [`docs/data-sources.md`](./data-sources.md)。本文件只保留輕量的 source reference 與狀態，不重複 provider access method、frequency、unit、revision、release schedule 或完整 series metadata。`dataSourceStatus` 與 `signalRuleStatus` 是獨立概念；前者為 `CONFIRMED` 不代表股票市場 SignalRule 已驗證。

## 市場解讀原則

> 本 Library 中的 Signal 必須表示對 **股票市場環境** 的相對偏多／中性／偏空含義，而不是判斷經濟數據本身是好或壞，也不是判斷景氣擴張或衰退。

- 每個 Indicator 在正式成為 Signal Indicator 前，必須補上 equity-market explanation。
- 現有 `direction` 與原始規則均視為候選規則；它們需要從 equity-market implications 的角度重新審查，不能只沿用經濟直覺。
- 強勁成長可能因通膨、利率、政策緊縮或金融條件惡化而對股票不利；SignalRule 必須能說明其傳導邏輯。
- 每個 Definition 應預留 `marketApplicability` 與 `contextOverrides`。初期可採單一預設 context；不建立 context 切換 UI。
- 預留的 context 至少包含 `US_EQUITY` 與 `TW_EQUITY`。同一 Observation 可因市場不同而有不同 explanation，未來也可能使用不同 SignalRule。
- `scoringEligible: true（provisional）` 不代表已完成金融驗證；只有 data source、transformation、equity-market explanation 與 SignalRule 都確認後，才可在正式資料模式中計分。
- Grid eligibility 與資料是否有經濟用途是兩件事。只有具備可辯護 directional Signal 的 Indicator 才能設定 `gridEligible: true`；無法合理轉成紅黃綠者可保留在 Library／detail scope，或暫不列入 demo Grid。
- Transformation、direction、threshold／band 必須分別核實。Transformation 已確認不代表 direction 或 threshold 已確認；任何作者門檻都必須明示 `AUTHOR_DEFINED`，無法核實者標記 `REVIEW_NEEDED`。
- Author-defined composite indicators 是核心產品能力，但公式、權重及 component policy 尚未定義；完成後仍須產生可追溯的 directional Signal 才能進 Grid。

## Consumption（macroComponent: C）

### `auto_sales`

| 欄位 | 內容 |
| --- | --- |
| 中文／英文名稱 | 新車銷售 / Auto Sales |
| 原始分類／建議 category | `C` / `GROWTH` |
| signal method／direction | `yoy_momentum` / `+1` |
| 原始規則 | GREEN：YoY > 0 且較上期加速；YELLOW：YoY > 0 但較上期放緩；RED：YoY 轉負 |
| rule basis | 各條件皆 `REVIEW_NEEDED` |
| 作者自訂部分 | `REVIEW_NEEDED` |
| scoringEligible | `true`（provisional） |
| 尚待確認事項 | YoY = 0、由負值改善但仍為負、無可比前期時的邊界；規則來源 |
| data source | `TODO` |

### `consumer_confidence`

| 欄位 | 內容 |
| --- | --- |
| 中文／英文名稱 | 密西根大學消費者信心指數 / University of Michigan Consumer Sentiment |
| 原始分類／建議 category | `C` / `GROWTH` |
| signal method／direction | `rolling_zscore` / `+1` |
| 原始規則 | 5 年 window；GREEN z > 1；YELLOW -1 ≤ z ≤ 1；RED z < -1 |
| rule basis | window 與 ±1 門檻皆 `REVIEW_NEEDED` |
| 作者自訂部分 | `REVIEW_NEEDED` |
| scoringEligible | `true`（provisional） |
| 尚待確認事項 | 指數系列、window 的觀察數與最少樣本、z-score 定義 |
| data source | `TODO` |

### `nonfarm_payrolls`

| 欄位 | 內容 |
| --- | --- |
| 中文／英文名稱 | 非農就業人口 / Non-Farm Payrolls |
| 原始分類／建議 category | `C` / `GROWTH` |
| signal method／direction | Variant A `threshold`；Variant B `rolling_zscore`（YoY growth） / `+1` |
| 原始規則 | A：GREEN 月增 >150,000；YELLOW 50,000–150,000；RED <50,000。B：YoY growth 的 5 年 rolling z-score，燈號門檻未提供 |
| rule basis | A 各 threshold：`AUTHOR_DEFINED`；B window／threshold：`REVIEW_NEEDED` / `TODO` |
| 作者自訂部分 | 是：Variant A 門檻 |
| scoringEligible | `true`（provisional） |
| 尚待確認事項 | 50,000、150,000 的含邊界方式；B 的燈號門檻；active variant；MVP 是否切換 variant |
| data source | `TODO` |

### `underemployment`

| 欄位 | 內容 |
| --- | --- |
| 中文／英文名稱 | 不充分就業／勞動市場閒置 / Underemployment / Slack |
| 原始分類／建議 category | `C` / `GROWTH` |
| signal method／direction | `rolling_zscore` / `-1` |
| 原始規則 | 5 年 window；GREEN z < -1；YELLOW -1 ≤ z ≤ 1；RED z > 1 |
| rule basis | window 與 ±1 門檻皆 `REVIEW_NEEDED` |
| 作者自訂部分 | `REVIEW_NEEDED` |
| scoringEligible | `true`（provisional） |
| 尚待確認事項 | 實際 underemployment/slack 系列；z-score 最少樣本 |
| data source | `TODO` |

### `sahm_rule`

| 欄位 | 內容 |
| --- | --- |
| 中文／英文名稱 | 薩姆規則 / Sahm Rule |
| 原始分類／建議 category | `C` / `GROWTH` |
| signal method／direction | `threshold` / `-1` |
| 原始規則 | 原始整理公式：3-month unemployment average - previous 12-month low；GREEN <0.3pp；YELLOW 0.3–0.5pp；RED >0.5pp |
| rule basis | 0.5pp 可能為 `OFFICIAL`，但現階段仍標 `REVIEW_NEEDED`；0.3pp 與 yellow band：`REVIEW_NEEDED` |
| 作者自訂部分 | `REVIEW_NEEDED`，尤其 0.3pp buffer |
| scoringEligible | `true`（provisional） |
| 尚待確認事項 | 公式、lookback、每個 band 的 basis 與 0.5pp 邊界需另行核實，不在此改寫 |
| data source | `TODO` |

## Investment（macroComponent: I）

### `durable_goods`

| 欄位 | 內容 |
| --- | --- |
| 中文／英文名稱 | 耐久財訂單 / Durable Goods Orders |
| 原始分類／建議 category | `I` / `GROWTH` |
| signal method／direction | `yoy_momentum` / `+1` |
| 原始規則 | GREEN YoY > 0 且加速；YELLOW YoY > 0 但放緩；RED YoY 轉負 |
| rule basis | 各條件皆 `REVIEW_NEEDED` |
| 作者自訂部分 | `REVIEW_NEEDED` |
| scoringEligible | `true`（provisional） |
| 尚待確認事項 | headline 或排除運輸系列；等於 0 與負值改善情境 |
| data source | `TODO` |

### `permits_starts`

| 欄位 | 內容 |
| --- | --- |
| 中文／英文名稱 | 營建許可與新屋開工 / Building Permits & Housing Starts |
| 原始分類／建議 category | `I` / `GROWTH` |
| signal method／direction | `yoy_momentum` / `+1` |
| 原始規則 | GREEN YoY > 0 且加速；YELLOW YoY > 0 但放緩；RED YoY 轉負 |
| rule basis | 各條件皆 `REVIEW_NEEDED` |
| 作者自訂部分 | `REVIEW_NEEDED` |
| scoringEligible | `true`（provisional） |
| 尚待確認事項 | Permits 與 Starts 如何合成；一項缺值或兩者分歧時如何處理 |
| source reference | `PERMIT` + `HOUST`；詳見 `docs/data-sources.md` |
| dataSourceStatus | `CONFIRMED`（兩條來源 series） |
| signalRuleStatus | `REVIEW_NEEDED`（composite Observation／Signal policy unresolved） |

## Government / Household（macroComponent: G）

### `budget_deficit_gdp`

| 欄位 | 內容 |
| --- | --- |
| 中文／英文名稱 | 預算赤字占 GDP 比率 / Budget Deficit / GDP |
| 原始分類／建議 category | `G` / `LIQUIDITY_RISK`（provisional） |
| signal method／direction | `threshold` / `-1` |
| 原始規則 | GREEN <3%；YELLOW 3–5%；RED >5% |
| rule basis | 3% 與 5% 各自 `REVIEW_NEEDED` |
| 作者自訂部分 | `REVIEW_NEEDED` |
| scoringEligible | `REVIEW_NEEDED` |
| 尚待確認事項 | `FYFSGDA188S` 為 annual 且赤字是負值；候選規則使用正值赤字幅度。sign normalization、是否適合計分與 5% 邊界仍待決定 |
| source reference | FRED `FYFSGDA188S`；詳見 `docs/data-sources.md` |
| dataSourceStatus | `CONFIRMED` |
| signalRuleStatus | `REVIEW_NEEDED` |

### `household_credit_balance`

| 欄位 | 內容 |
| --- | --- |
| 中文／英文名稱 | 房貸／學貸／循環信用貸款餘額 / Mortgage / Student / Revolving Credit Balances |
| 原始分類／建議 category | `G`（保留原課堂分類） / `LIQUIDITY_RISK` |
| signal method／direction | `yoy_threshold` / `-1` |
| 原始規則 | GREEN YoY <3%；YELLOW 3–6%；RED >6% |
| rule basis | 3% 與 6%：`AUTHOR_DEFINED` |
| 作者自訂部分 | 是：原始整理明確標記 thresholds 為 author-defined |
| scoringEligible | `true`（provisional） |
| 尚待確認事項 | 三種信用餘額如何合成；6% 邊界；名目或實質值 |
| source reference | `TODO`；詳見 `docs/data-sources.md` |
| dataSourceStatus | `TODO`（final provider／dataset unresolved） |
| signalRuleStatus | `REVIEW_NEEDED`（component-combination method unresolved） |

## Net Exports / Commodity（macroComponent: NX）

### `eia_crude_inventories`

| 欄位 | 內容 |
| --- | --- |
| 中文／英文名稱 | EIA 原油庫存 / EIA Crude Oil Inventories |
| 原始分類／建議 category | `NX` / `LIQUIDITY_RISK`（provisional） |
| signal method／direction | `rolling_zscore` / `-1` |
| 原始規則 | 5 年 window；GREEN z < -1；YELLOW -1 ≤ z ≤ 1；RED z >1 |
| rule basis | window、±1 門檻與 direction 皆 `REVIEW_NEEDED` |
| 作者自訂部分 | `REVIEW_NEEDED` |
| scoringEligible | `true`（provisional） |
| 尚待確認事項 | 庫存口徑、季節性處理、頻率與最少樣本 |
| data source | `TODO` |

## Inflation / Liquidity / Risk（macroComponent: MULTI）

### `yield_curve`

| 欄位 | 內容 |
| --- | --- |
| 中文／英文名稱 | 殖利率曲線 / Yield Curve |
| 原始分類／建議 category | `MULTI` / `LIQUIDITY_RISK` |
| signal method／direction | `threshold` / `+1` |
| 原始規則 | 可用 10Y-2Y 或 10Y-3M；GREEN >0；YELLOW -0.2% 至 +0.2%；RED <0 |
| rule basis | 0 基準與 ±0.2% band 均 `REVIEW_NEEDED` |
| 作者自訂部分 | `REVIEW_NEEDED`，尤其 yellow buffer |
| scoringEligible | `true`（provisional） |
| 尚待確認事項 | **REVIEW_NEEDED：原始條件區間重疊，不自行重訂門檻**；選擇 10Y-2Y 或 10Y-3M；百分點單位 |
| data source | `TODO` |

### `cpi_core_cpi`

| 欄位 | 內容 |
| --- | --- |
| 中文／英文名稱 | CPI／核心 CPI / CPI / Core CPI |
| 原始分類／建議 category | `MULTI` / `INFLATION` |
| signal method／direction | `distance_from_target` / `-1` |
| 原始規則 | `abs(YoY - 2%)`；GREEN <1pp；YELLOW 1–2pp；RED >2pp |
| rule basis | 2% anchor、1pp 與 2pp bands 均 `REVIEW_NEEDED` |
| 作者自訂部分 | `REVIEW_NEEDED` |
| scoringEligible | `true`（provisional） |
| 尚待確認事項 | **REVIEW_NEEDED：經濟意義與 2% anchor 是否適合**；CPI／Core CPI 如何合成；2pp 邊界 |
| source reference | `CPIAUCSL` + `CPILFESL`；詳見 `docs/data-sources.md` |
| dataSourceStatus | `CONFIRMED`（兩條來源 series） |
| signalRuleStatus | `REVIEW_NEEDED`（headline／core composite policy unresolved） |

### `pce_price_index`

| 欄位 | 內容 |
| --- | --- |
| 中文／英文名稱 | PCE 物價指數 / PCE Price Index |
| 原始分類／建議 category | `MULTI` / `INFLATION` |
| signal method／direction | `distance_from_target` / `-1` |
| 原始規則 | `abs(YoY - 2%)`；GREEN <1pp；YELLOW 1–2pp；RED >2pp |
| rule basis | 2% anchor 可能有官方依據但仍標 `REVIEW_NEEDED`；1pp／2pp bands：`REVIEW_NEEDED` |
| 作者自訂部分 | bands 是否作者設定：`REVIEW_NEEDED` |
| scoringEligible | `true`（provisional） |
| 尚待確認事項 | headline 或 core PCE；anchor 與各 band 來源；2pp 邊界 |
| data source | `TODO` |

### `taiwan_cpi`

| 欄位 | 內容 |
| --- | --- |
| 中文／英文名稱 | 台灣 CPI / Taiwan CPI |
| 原始分類／建議 category | `MULTI` / `INFLATION` |
| signal method／direction | `distance_from_target` / `-1` |
| 原始規則 | `abs(YoY - Taiwan reference ~2%)`；GREEN <1pp；YELLOW 1–2pp；RED >2pp |
| rule basis | target 與所有 bands：`AUTHOR_DEFINED`（依原始整理標記） |
| 作者自訂部分 | 是：為貼近台股情境新增，原始整理標記 author-defined |
| scoringEligible | `true`（provisional） |
| 尚待確認事項 | Taiwan reference 精確定義；約 2% 不可直接成為可執行值；2pp 邊界 |
| data source | `TODO` |

### `ppi`

| 欄位 | 內容 |
| --- | --- |
| 中文／英文名稱 | PPI 生產者物價指數 / Producer Price Index |
| 原始分類／建議 category | `MULTI` / `INFLATION`（provisional） |
| signal method／direction | `distance_from_history` / `-1` |
| 原始規則 | `abs(YoY - own historical average)`；GREEN distance small；YELLOW medium；RED large |
| rule basis | historical average window：`TODO`；small／medium／large thresholds：`AUTHOR_DEFINED`，數值 `TODO` |
| 作者自訂部分 | 是：原始整理標記 author-defined |
| scoringEligible | `REVIEW_NEEDED` |
| 尚待確認事項 | threshold 與歷史 window 未定義；**REVIEW_NEEDED：inflation pressure 與 growth indicator 的敘事衝突** |
| data source | `TODO` |

### `credit_spread`

| 欄位 | 內容 |
| --- | --- |
| 中文／英文名稱 | 信用利差 / Credit Spread |
| 原始分類／建議 category | `MULTI` / `LIQUIDITY_RISK` |
| signal method／direction | `rolling_zscore` / `-1` |
| 原始規則 | 例如 Aaa/Baa relative to Treasury；5 年 window；GREEN z < -1；YELLOW -1 ≤ z ≤ 1；RED z >1 |
| rule basis | spread 定義、window 與 ±1 thresholds 均 `REVIEW_NEEDED` |
| 作者自訂部分 | `REVIEW_NEEDED` |
| scoringEligible | `true`（provisional） |
| 尚待確認事項 | Aaa、Baa 或其他 spread；Treasury tenor；頻率與最少樣本 |
| data source | `TODO` |

### `tips_breakeven`

| 欄位 | 內容 |
| --- | --- |
| 中文／英文名稱 | TIPS 損益平衡通膨率 / TIPS Breakeven Rate |
| 原始分類／建議 category | `MULTI`（provisional；待確認原始 metadata） / `INFLATION` |
| signal method／direction | `distance_from_target` / `-1` |
| 原始規則 | `abs(Breakeven - 2%)`；GREEN：distance < 0.5pp；YELLOW：0.5pp–1pp；RED：distance > 1pp |
| rule basis | `REVIEW_NEEDED`；2% target、0.5pp 與 1pp bands 均不得在核實前宣稱官方 |
| 作者自訂部分 | `REVIEW_NEEDED` |
| scoringEligible | `true`（provisional） |
| 尚待確認事項 | 各 boundary 的包含方式；target 與 bands 的證據來源；tenor 與 equity-market explanation |
| source reference | FRED `T10YIE`；詳見 `docs/data-sources.md` |
| dataSourceStatus | `CONFIRMED` |
| signalRuleStatus | `REVIEW_NEEDED` |

### `vix`

| 欄位 | 內容 |
| --- | --- |
| 中文／英文名稱 | CBOE 波動率指數 / CBOE Volatility Index (VIX) |
| 原始分類／建議 category | `MULTI`（provisional；待確認原始 metadata） / `LIQUIDITY_RISK` |
| signal method／direction | `threshold` / `-1` |
| 原始規則 | GREEN：VIX <20；YELLOW：20–30；RED：VIX >30 |
| rule basis | `REVIEW_NEEDED`；`CONVENTIONAL` 只是待核實的候選 basis，不得宣稱為官方 threshold |
| 作者自訂部分 | `REVIEW_NEEDED` |
| scoringEligible | `true`（provisional） |
| 尚待確認事項 | 20 與 30 的 boundary 包含方式；conventional basis 的可靠來源；equity-market explanation |
| data source | `TODO` |

## 跨指標待確認事項

- 所有 provisional category 與 `scoringEligible` 是否接受。
- 逐一撰寫並審查每個 Indicator 對股票市場條件的 transmission mechanism 與 user-facing explanation，避免把「經濟好／壞」直接等同 `GREEN`／`RED`。
- 確認每個 Indicator 適用的 `US_EQUITY`／`TW_EQUITY` context，以及是否需要 context-specific SignalRule override。
- 每個 Observation 的 frequency、unit、修訂處理與可用時間。
- 每個 threshold/band 的包含邊界及個別 `ruleBasis`。
- 複合指標（Permits & Starts、CPI / Core CPI、household credit components）的合成方式。
- 規則證據需在資料與規則驗證階段核實；本文只保存 supplied rules，不宣稱其金融正確性，也不以歷史回測作為核心產品承諾。

## Excluded Indicators

以下 6 個 Indicator 已從 active candidate pool 排除，但保留決策歷史。除非日後重新審議，資料來源、transformation 與 SignalRule 工作不得將它們視為 active scope。

| indicatorId | 原名稱 | 排除原因 |
| --- | --- | --- |
| `copper_price` | 銅價 / Copper Price | 免費 FRED source 為月頻，不符合預期的 current-market 使用情境；非官方即時來源不被視為足夠穩定。 |
| `ism_pmi` | ISM 製造業／非製造業 PMI | 在預期的免費資料模式下，無法取得可靠、官方且完整的 machine-readable data。 |
| `lme_inventory` | LME 金屬庫存 / LME Metal Inventories | 可靠的官方 machine-readable access 通常需要付費／授權資料。 |
| `bdi` | 波羅的海乾散貨指數 / Baltic Dry Index | Baltic Exchange 官方資料為授權／付費資料，免費來源不適合作為穩定 production pipeline。 |
| `dxy` | 美元指數 / US Dollar Index | 官方 DXY 資料不適合免費資料 pipeline；明確不以 trade-weighted dollar index 替代，因為兩者是不同指標。 |
| `ted_spread` | TED 利差 / TED Spread | LIBOR transition 後已停止，故不再列入 active pool。 |
