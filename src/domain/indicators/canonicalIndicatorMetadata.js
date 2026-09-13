import { EvidenceBasis, SignalRuleStatus, SignalRuleType } from "../signals/SignalRule.js";
import { defineTransformation, TransformationFrequency as Frequency, TransformationType as Type } from "../transformations/TransformationDefinition.js";

const PROVIDERS = Object.freeze({
  FRED: "Federal Reserve Economic Data (FRED)",
  DGBAS: "Taiwan Directorate-General of Budget, Accounting and Statistics",
  CALDARA_IACOVIELLO: "Caldara & Iacoviello",
  POLICY_UNCERTAINTY: "Economic Policy Uncertainty",
  NY_FED: "Federal Reserve Bank of New York",
});

const identityDisplay = Object.freeze({
  nonfarm_payrolls: ["Nonfarm Payrolls", "Labor"], underemployment: ["U-6 Underemployment", "Labor"], sahm_rule: ["Sahm Rule", "Labor"],
  consumer_confidence: ["University of Michigan Consumer Sentiment", "Growth"], durable_goods: ["Durable Goods Orders", "Growth"], "permits_starts:permits": ["Building Permits", "Growth"],
  pce_price_index: ["PCE Inflation", "Inflation"], "cpi_core_cpi:headline": ["Headline CPI", "Inflation"], "cpi_core_cpi:core": ["Core CPI", "Inflation"],
  taiwan_cpi: ["Taiwan CPI", "Inflation"], tips_breakeven: ["10Y TIPS Breakeven", "Inflation"], vix: ["VIX", "Financial Risk"],
  credit_spread_baa10y: ["Baa–10Y Credit Spread", "Financial Risk"], yield_curve_10y3m: ["10Y–3M Yield Curve", "Yield Curve"], yield_curve_10y2y: ["10Y–2Y Yield Curve", "Yield Curve"],
  gscpi: ["Global Supply Chain Pressure", "Supply Chain"], global_gpr: ["Global GPR", "Uncertainty / Geopolitical"], global_epu: ["Global Economic Policy Uncertainty", "Uncertainty / Geopolitical"],
  trade_policy_uncertainty: ["Trade Policy Uncertainty", "Uncertainty / Geopolitical"], household_debt_service_ratio: ["Household Debt Service Ratio", "Household"], credit_card_delinquency: ["Credit Card Delinquency", "Household"],
});

const quickInfoDisplay = Object.freeze({
  nonfarm_payrolls: ["PAYROLL_CHANGE", "PAYROLL", "PAYROLL"], underemployment: ["ZSCORE", "ZSCORE", "ZSCORE_HIGHER_WORSE"], sahm_rule: ["PERCENTAGE_POINT", "RANGE", "SAHM"],
  consumer_confidence: ["ZSCORE", "ZSCORE", "ZSCORE_HIGHER_BETTER"], durable_goods: ["YOY_PERCENT", "RANGE", "YOY_GROWTH"], "permits_starts:permits": ["YOY_PERCENT", "RANGE", "YOY_GROWTH"],
  pce_price_index: ["YOY_PERCENT", "TARGET_BAND", "TARGET_BAND_YOY"], "cpi_core_cpi:headline": ["YOY_PERCENT", "TARGET_BAND", "TARGET_BAND_YOY"], "cpi_core_cpi:core": ["YOY_PERCENT", "TARGET_BAND", "TARGET_BAND_YOY"],
  taiwan_cpi: ["YOY_PERCENT", "TARGET_BAND", "TAIWAN_CPI"], tips_breakeven: ["PERCENT", "TARGET_BAND", "TARGET_BAND"], vix: ["INDEX", "VOLATILITY", "VIX"],
  credit_spread_baa10y: ["ZSCORE", "ZSCORE", "ZSCORE_HIGHER_WORSE"], yield_curve_10y3m: ["PERCENTAGE_POINT", "YIELD_CURVE", "YIELD_CURVE"], yield_curve_10y2y: ["PERCENTAGE_POINT", "YIELD_CURVE", "YIELD_CURVE"],
  gscpi: ["STANDARDIZED_POSITION", "STANDARDIZED_PRESSURE", "GSCPI"], global_gpr: ["ZSCORE", "ZSCORE", "ZSCORE_HIGHER_WORSE"], global_epu: ["ZSCORE", "ZSCORE", "ZSCORE_HIGHER_WORSE"],
  trade_policy_uncertainty: ["ZSCORE", "ZSCORE", "ZSCORE_HIGHER_WORSE"], household_debt_service_ratio: ["COMPOUND_PERCENT", "COMPOUND", "COMPOUND_DEBT"], credit_card_delinquency: ["COMPOUND_PERCENT", "COMPOUND", "COMPOUND_DELINQUENCY"],
});

const calculationContent = Object.freeze({
  nonfarm_payrolls: ["Monthly payroll change", "Measures the change in total nonfarm payroll employment from the previous month."],
  underemployment: ["36-month standardized score", "Compares the current U-6 rate with its previous 36 months of history."],
  sahm_rule: ["Reported Sahm Rule reading", "Uses the published Sahm Rule indicator based on changes in the unemployment rate."],
  consumer_confidence: ["36-month standardized score", "Compares the current consumer sentiment reading with its previous 36 months of history."],
  durable_goods: ["Year-over-year change", "Measures how durable-goods orders have changed compared with the same month one year earlier."],
  "permits_starts:permits": ["Year-over-year change", "Measures how building permits have changed compared with the same month one year earlier."],
  pce_price_index: ["Year-over-year inflation rate", "Measures the percentage change in the PCE price index from the same month one year earlier."],
  "cpi_core_cpi:headline": ["Year-over-year inflation rate", "Measures the percentage change in headline consumer prices from the same month one year earlier."],
  "cpi_core_cpi:core": ["Year-over-year inflation rate", "Measures the percentage change in consumer prices excluding food and energy from the same month one year earlier."],
  taiwan_cpi: ["Year-over-year inflation rate", "Measures the percentage change in Taiwan's consumer price index from the same month one year earlier."],
  tips_breakeven: ["Current breakeven inflation rate", "Uses the current market-implied 10-year inflation compensation rate."],
  vix: ["Current VIX level", "Uses the current level of expected near-term S&P 500 volatility implied by option prices."],
  credit_spread_baa10y: ["36-month standardized credit spread", "First averages the daily Baa–10Y spread within each month, then compares the current monthly spread with its previous 36 months of history."],
  yield_curve_10y3m: ["Current yield-curve spread", "Measures the difference between the 10-year Treasury yield and the 3-month Treasury rate."],
  yield_curve_10y2y: ["Current yield-curve spread", "Measures the difference between the 10-year Treasury yield and the 2-year Treasury yield."],
  gscpi: ["Current standardized index level", "Uses the reported Global Supply Chain Pressure Index, which is already expressed relative to its historical distribution."],
  global_gpr: ["36-month standardized score", "Compares the current geopolitical-risk index with its previous 36 months of history."],
  global_epu: ["36-month standardized score", "Compares the current economic-policy-uncertainty index with its previous 36 months of history."],
  trade_policy_uncertainty: ["36-month standardized score", "Compares the current trade-policy-uncertainty index with its previous 36 months of history."],
  household_debt_service_ratio: ["Current level and 4-quarter trend", "Compares the current debt-service ratio with its trailing 20-quarter median and checks whether it has risen or fallen over the past four quarters."],
  credit_card_delinquency: ["Current level and 4-quarter trend", "Compares the current credit-card delinquency rate with its trailing 20-quarter median and checks whether it has risen or fallen over the past four quarters."],
});

const ruleRationales = Object.freeze({
  nonfarm_payrolls: "0 separates job growth from contraction; 122K is anchored to BLS statistical-significance guidance.",
  underemployment: "0 is the 36-month average; +1 marks underemployment one standard deviation above average.",
  sahm_rule: "0.50 is the official Sahm recession trigger; 0.30 is used as an earlier warning threshold.",
  consumer_confidence: "0 is the 36-month average; -1 marks sentiment one standard deviation below average.",
  durable_goods: "0 marks no annual growth; ±5% separates moderate change from stronger expansion or contraction.",
  "permits_starts:permits": "0 marks no annual growth; ±5% separates moderate change from stronger expansion or contraction.",
  pce_price_index: "2% is the Federal Reserve’s PCE inflation objective; the surrounding bands define moderate and larger deviations from that anchor.",
  "cpi_core_cpi:headline": "2% is used as a reference anchor; the surrounding bands distinguish moderate from larger inflation deviations.",
  "cpi_core_cpi:core": "2% is used as a reference anchor; the surrounding bands distinguish moderate from larger underlying inflation deviations.",
  taiwan_cpi: "0% separates inflation from deflation; 2% and 3% distinguish moderate from higher inflation, while -1% marks deeper deflation.",
  tips_breakeven: "2% is used as the central inflation reference; the surrounding bands distinguish moderate from larger deviations.",
  vix: "20 and 30 are commonly used market reference levels for normal, elevated, and high implied volatility.",
  credit_spread_baa10y: "0 is the 36-month average; +1 marks a spread one standard deviation wider than average.",
  yield_curve_10y3m: "0 marks yield-curve inversion; 0 to 0.50 percentage points is treated as near-flat.",
  yield_curve_10y2y: "0 marks yield-curve inversion; 0 to 0.50 percentage points is treated as near-flat.",
  gscpi: "0 is the index’s historical average; +1 marks supply-chain pressure one standard deviation above average.",
  global_gpr: "0 is the 36-month average; +1 marks geopolitical risk one standard deviation above average.",
  global_epu: "0 is the 36-month average; +1 marks policy uncertainty one standard deviation above average.",
  trade_policy_uncertainty: "0 is the 36-month average; +1 marks trade-policy uncertainty one standard deviation above average.",
  household_debt_service_ratio: "The current level is compared with its trailing 20-quarter median, while the 4-quarter change identifies whether debt-service pressure is rising or falling.",
  credit_card_delinquency: "The current level is compared with its trailing 20-quarter median, while the 4-quarter change identifies whether delinquency pressure is rising or falling.",
});

const detailDisplay = Object.freeze({
  nonfarm_payrolls: ["Strong payroll growth generally supports household income and economic activity, which can be positive for corporate earnings. However, unusually strong labor demand may also reinforce inflation and interest-rate pressure.", "Payroll estimates are revised after release and benchmarked annually. Recent numbers can change, especially after seasonal-adjustment and benchmark updates.", "Monthly, seasonally adjusted data from the BLS Current Employment Statistics (Establishment Survey), series PAYEMS. The underlying BLS source code is CES0000000001."],
  underemployment: ["Lower underemployment usually indicates a healthier labor market and stronger household income conditions. A sustained rise can signal weakening labor demand and softer economic momentum.", "U-6 comes from the household survey, so it is subject to survey sampling and population-estimate changes. It is broader than the headline unemployment rate, but still does not capture every form of labor-market weakness.", "Monthly, seasonally adjusted data from the BLS Current Population Survey (Household Survey). The underlying source code is LNS13327709."],
  sahm_rule: ["A rising Sahm indicator points to deterioration in labor-market conditions. Crossing the official recession trigger is associated with a broad weakening in employment conditions and can increase downside risk for equities.", "The Sahm Rule uses real-time unemployment data, but seasonal-factor revisions can still change recent historical readings. It is a recession indicator, not a direct stock-market timing signal.", "The series is constructed using unemployment data available in real time for each month. BLS seasonal-factor revisions can change recent historical readings."],
  consumer_confidence: ["Higher consumer sentiment generally supports household spending and risk appetite, while weak sentiment can signal softer consumption and greater economic caution.", "The series is survey-based, so it can move sharply with temporary changes in inflation, politics, or consumer mood. Sentiment does not always translate directly into actual consumer spending.", "The FRED series is delayed by one month at the source’s request. The data are copyrighted by the University of Michigan and require appropriate attribution."],
  durable_goods: ["Strong durable-goods orders can indicate firmer business and consumer demand, supporting expectations for future production and earnings. Persistent declines may signal weakening investment and growth.", "Durable-goods orders can be volatile because large transportation and defense orders can move the total sharply. The data are also revised after the initial release.", "Monthly, seasonally adjusted manufacturers’ new orders data from the U.S. Census Bureau’s M3 Survey. The FRED series is DGORDER and is reported in millions of dollars."],
  "permits_starts:permits": ["Rising permits typically indicate stronger future residential construction activity. Weak permits can signal softer housing demand and slower construction-related economic activity.", "The series is seasonally adjusted and revised over time. Its coverage changed in 2005, so very long-run comparisons should be interpreted with some care.", "Monthly data are reported at a seasonally adjusted annual rate. Starting with the February 2005 release, coverage expanded from about 19,000 to 20,000 permit-issuing places."],
  pce_price_index: ["Moderate inflation is generally more supportive of stable monetary conditions. Persistently high inflation can increase the risk of tighter policy and higher discount rates, while very low inflation may reflect weak demand.", "PCE data are revised as BEA incorporates updated source data and methodology. Recent year-over-year inflation readings can therefore change after initial release.", "PCEPI is produced by the BEA and is a chain-type price index. Previously published observations can be revised as source data and methodology are updated."],
  "cpi_core_cpi:headline": ["Headline inflation affects household purchasing power, policy expectations, and interest rates. Higher inflation can pressure equity valuations through tighter financial conditions and rising costs.", "CPI is based on sampled prices, so it is subject to sampling and non-sampling error. Seasonally adjusted CPI can also be revised as seasonal factors are updated.", "Monthly, seasonally adjusted CPI-U data from the BLS. CPI is based on sampled consumer prices and is not a measure of every individual consumer’s cost of living."],
  "cpi_core_cpi:core": ["Core inflation helps gauge persistent underlying price pressure. Elevated core inflation can keep monetary policy restrictive for longer and raise valuation pressure on equities.", "Core CPI removes food and energy to reduce short-term volatility, but it can miss price shocks that still matter to households. Seasonally adjusted values can also be revised.", "Monthly, seasonally adjusted CPI-U excluding food and energy. The series is published by BLS using the same CPI framework while excluding those two volatile categories."],
  taiwan_cpi: ["Higher inflation can reduce household purchasing power and increase the probability of tighter domestic financial conditions. Moderate inflation is generally less restrictive for local equity valuations.", "Year-over-year CPI changes can be affected by base effects and large moves in individual price categories. A single reading does not show how persistent inflation will be.", "Monthly Taiwan CPI from DGBAS, dataset 6019 / series A030101015. The dashboard source definition is normalized to an index with 2021=100."],
  tips_breakeven: ["Breakeven inflation reflects market-implied inflation compensation. A sharp rise can signal inflation concerns and higher nominal-rate pressure, while unusually low readings may reflect weak growth expectations.", "Breakeven inflation is market-implied inflation compensation, not a pure inflation forecast. It can also move with liquidity and risk-premium changes.", "Daily series calculated from the 10-year nominal Treasury yield and the 10-year inflation-indexed Treasury yield. Since June 2019, Treasury inputs used by FRED come directly from the U.S. Treasury Department."],
  vix: ["Higher VIX readings indicate greater expected equity-market volatility and risk aversion. Lower readings are generally associated with calmer financial conditions and stronger risk appetite.", "VIX reflects expected near-term S&P 500 volatility from option prices, not actual future volatility. It can move very quickly during periods of market stress.", "Daily closing index from Cboe measuring option-implied expectations of near-term stock-market volatility. The underlying data are copyrighted and reproduced through FRED with permission."],
  credit_spread_baa10y: ["Wider credit spreads indicate tighter financing conditions and greater perceived corporate credit risk. Narrower spreads generally reflect easier financial conditions and stronger investor risk appetite.", "The spread reflects both corporate credit risk and broader bond-market conditions. The Moody’s component also has redistribution and licensing restrictions.", "Calculated as Moody’s seasoned Baa corporate bond yield minus the 10-year Treasury yield. The Moody’s component is copyrighted and has redistribution restrictions."],
  yield_curve_10y3m: ["A positive yield curve is generally consistent with less restrictive financial conditions, while inversion can signal tight monetary conditions and elevated risk of future economic weakness.", "The spread can stay inverted for a long time before economic weakness appears. It does not provide exact timing for a downturn or equity-market decline.", "Daily spread between the 10-year and 3-month Treasury constant-maturity rates. Treasury inputs used by FRED come from the U.S. Treasury Department."],
  yield_curve_10y2y: ["A positive spread generally reflects a more normal term structure, while inversion can indicate restrictive policy expectations and increased concern about future growth.", "Inversion can persist well before economic or market weakness appears. The 2-year yield is also highly sensitive to expected Federal Reserve policy.", "Daily spread between the 10-year and 2-year Treasury constant-maturity rates. Both underlying Treasury series are sourced from the U.S. Treasury Department."],
  gscpi: ["Higher supply-chain pressure can raise input costs, disrupt production, and contribute to inflation. Lower pressure generally supports smoother production and more stable cost conditions.", "GSCPI is a broad supply-chain pressure measure rather than a direct measure of any single supply chain. Because it is standardized, its level is relative rather than an absolute cost measure.", "The series comes from the Federal Reserve Bank of New York. The source notes that GSCPI is not an official estimate of the New York Fed, its president, the Federal Reserve System, or the FOMC."],
  global_gpr: ["Higher geopolitical risk can increase uncertainty, risk premiums, commodity-price volatility, and market stress. Lower readings generally indicate a calmer external risk environment for equities.", "GPR is based on newspaper coverage, so it can be affected by media attention and source composition. Recent observations may also be revised.", "Research-series data are provided under a Creative Commons Attribution license. Recent observations are preliminary and may be revised as delayed newspaper material and corrections are incorporated."],
  global_epu: ["Higher policy uncertainty can delay investment, increase risk premiums, and weaken business confidence. Lower uncertainty generally supports planning, capital expenditure, and market risk appetite.", "EPU is news-based, so changes can reflect both real policy uncertainty and shifts in media coverage. Cross-country weighting and source composition can affect the global index.", "The research series is distributed under CC BY 4.0. The dashboard uses the current-price GDP-weighted Global EPU series; the official file also provides a PPP-weighted version."],
  trade_policy_uncertainty: ["Higher trade-policy uncertainty can disrupt investment, supply chains, and cross-border activity. Lower uncertainty generally reduces external planning risk for firms and investors.", "TPU is based on newspaper coverage of trade-policy uncertainty, so it can react strongly to major announcements and media attention. Recent observations may be revised.", "The authors permit use with attribution. Recent observations are preliminary and may be revised as delayed newspaper articles or archive corrections are incorporated."],
  household_debt_service_ratio: ["A high and rising debt-service burden can constrain household consumption and increase financial stress. Lower or improving debt-service pressure generally leaves households with more capacity to spend.", "The ratio is quarterly and therefore moves slowly. It summarizes required debt payments relative to disposable income, but does not show how stress is distributed across households.", "Quarterly, seasonally adjusted Federal Reserve data. TDSP measures required household debt payments relative to disposable income and includes mortgage and consumer debt-service components."],
  credit_card_delinquency: ["Rising delinquency can signal growing household financial stress and weakening credit quality. Lower delinquency is generally consistent with healthier household balance sheets and consumer resilience.", "Delinquency rates are quarterly and can lag changes in household conditions. They reflect stress among borrowers with credit-card balances, but do not capture all forms of household financial distress.", "Quarterly, seasonally adjusted, end-of-period data from the Federal Reserve’s commercial-bank delinquency statistics. The dashboard uses series DRCCLACBS."],
});

const sourceDefinitions = Object.freeze({
  nonfarm_payrolls: ["nonfarm_payrolls", null, "FRED", "PAYEMS", {}], underemployment: ["underemployment", null, "FRED", "U6RATE", {}], sahm_rule: ["sahm_rule", null, "FRED", "SAHMREALTIME", {}],
  consumer_confidence: ["consumer_confidence", null, "FRED", "UMCSENT", {}], durable_goods: ["durable_goods", null, "FRED", "DGORDER", {}], "permits_starts:permits": ["permits_starts", "permits", "FRED", "PERMIT", {}],
  pce_price_index: ["pce_price_index", null, "FRED", "PCEPI", {}], "cpi_core_cpi:headline": ["cpi_core_cpi", "headline", "FRED", "CPIAUCSL", {}], "cpi_core_cpi:core": ["cpi_core_cpi", "core", "FRED", "CPILFESL", {}],
  taiwan_cpi: ["taiwan_cpi", null, "DGBAS", "A030101015", { endpoint: "https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230555/pr0101a1m.xml", selector: { itemPrefix: "總指數", type: "原始值", frequencyCode: "M" }, unit: "Index 2021=100", frequency: "Monthly", metadata: { governmentOpenDataDatasetId: 6019 } }],
  tips_breakeven: ["tips_breakeven", null, "FRED", "T10YIE", {}], vix: ["vix", null, "FRED", "VIXCLS", {}],
  credit_spread_baa10y: ["credit_spread_baa10y", null, "FRED", "BAA10Y", { metadata: { licensingNote: "Contains Moody's-derived copyrighted information; acquisition does not establish redistribution rights." } }],
  yield_curve_10y3m: ["yield_curve_10y3m", null, "FRED", "T10Y3M", {}], yield_curve_10y2y: ["yield_curve_10y2y", null, "FRED", "T10Y2Y", {}],
  gscpi: ["gscpi", null, "NY_FED", "GSCPI", { acquisitionMode: "PERIODIC_FILE", endpoint: "https://www.newyorkfed.org/medialibrary/research/interactives/gscpi/downloads/gscpi_data.xlsx", format: "excel", sheet: "GSCPI Monthly Data", dateColumn: "Date", valueColumn: "GSCPI", frequency: "Monthly", unit: "Standard deviations from historical average", metadata: { sourcePage: "https://www.newyorkfed.org/research/policy/gscpi", citation: "Federal Reserve Bank of New York, Global Supply Chain Pressure Index.", disclaimer: "The GSCPI is not an official estimate of the Federal Reserve Bank of New York, its President, the Federal Reserve System, or the FOMC.", termsUrl: "https://www.newyorkfed.org/terms-of-use" } }],
  global_gpr: ["global_gpr", null, "CALDARA_IACOVIELLO", "GPR", { acquisitionMode: "PERIODIC_FILE", endpoint: "https://www.matteoiacoviello.com/gpr_files/data_gpr_export.xls", format: "excel", sheet: "Sheet1", dateColumn: "month", valueColumn: "GPR", frequency: "Monthly", unit: "Index 1985-2019=100", metadata: { sourcePage: "https://www.matteoiacoviello.com/gpr.htm", citation: "Caldara, Dario and Matteo Iacoviello, Measuring Geopolitical Risk.", license: "Creative Commons Attribution (CC BY)", revisionNote: "Latest observations are preliminary; delayed newspaper ingestion and corrections can revise recent and earlier data." } }],
  global_epu: ["global_epu", null, "POLICY_UNCERTAINTY", "GEPU_current", { acquisitionMode: "PERIODIC_FILE", endpoint: "https://www.policyuncertainty.com/media/Global_Policy_Uncertainty_Data.xlsx", format: "excel", sheet: "Sheet1", yearColumn: "Year", monthColumn: "Month", valueColumn: "GEPU_current", frequency: "Monthly", unit: "Index", metadata: { sourcePage: "https://www.policyuncertainty.com/global_monthly.html", citation: "Davis, Steven J., An Index of Global Economic Policy Uncertainty.", license: "Creative Commons Attribution 4.0 International (CC BY 4.0)", seriesNote: "Current-price GDP-weighted Global EPU; the official file also contains a separate PPP-weighted series." } }],
  trade_policy_uncertainty: ["trade_policy_uncertainty", null, "CALDARA_IACOVIELLO", "TPU_MONTHLY:TPU", { acquisitionMode: "PERIODIC_FILE", endpoint: "https://www.matteoiacoviello.com/tpu_files/tpu_web_latest.xlsx", format: "excel", sheet: "TPU_MONTHLY", dateColumn: "DATE", valueColumn: "TPU", frequency: "Monthly", unit: "Index (100 = 1% article share)", metadata: { sourcePage: "https://www.matteoiacoviello.com/tpu.htm", citation: "Caldara, Iacoviello, Molligo, Prestipino, and Raffo (2020), The Economic Effects of Trade Policy Uncertainty.", license: "Free use with attribution to the authors, paper, and website", revisionNote: "Latest observations are preliminary; delayed newspaper ingestion and archive corrections may revise recent or earlier data." } }],
  household_debt_service_ratio: ["household_debt_service_ratio", null, "FRED", "TDSP", {}], credit_card_delinquency: ["credit_card_delinquency", null, "FRED", "DRCCLACBS", {}],
});

const VERSION = "1.0.0";
const passthrough = (frequency) => defineTransformation({ type: Type.PASSTHROUGH, frequency, requiredPeriods: 1, outputUnit: "SOURCE_UNIT", version: VERSION });
const monthlyYoy = () => defineTransformation({ type: Type.YOY_PERCENT_CHANGE, frequency: Frequency.MONTHLY, lag: 12, requiredPeriods: 13, outputUnit: "PERCENT", version: VERSION });
const rollingZScore = (parameters = {}) => defineTransformation({ type: Type.ROLLING_ZSCORE, frequency: Frequency.MONTHLY, window: 36, requiredPeriods: 36, outputUnit: "ZSCORE", version: VERSION, parameters: { standardDeviation: "POPULATION", allowedMissingPeriods: 1, requiredValidObservations: 35, ...parameters } });
const quarterlyLevelChangeMedian = () => defineTransformation({ type: Type.LEVEL_PLUS_PERIOD_CHANGE_AND_TRAILING_MEDIAN, frequency: Frequency.QUARTERLY, requiredPeriods: 20, outputUnit: "MULTI_VALUE", version: VERSION, parameters: { periodChangeLag: 4, trailingMedianWindow: 20, trailingMedianInput: "LEVEL", allowedMissingPeriods: 1, requiredValidObservations: 19, outputs: ["LEVEL", "PERIOD_CHANGE", "TRAILING_MEDIAN"] } });

const transformationDefinitions = Object.freeze({
  nonfarm_payrolls: defineTransformation({ type: Type.MONTHLY_DIFFERENCE, frequency: Frequency.MONTHLY, lag: 1, requiredPeriods: 2, outputUnit: "THOUSANDS_OF_JOBS", version: VERSION }),
  underemployment: rollingZScore(), sahm_rule: passthrough(Frequency.MONTHLY), consumer_confidence: rollingZScore(), durable_goods: monthlyYoy(), "permits_starts:permits": monthlyYoy(),
  pce_price_index: monthlyYoy(), "cpi_core_cpi:headline": monthlyYoy(), "cpi_core_cpi:core": monthlyYoy(), taiwan_cpi: monthlyYoy(), tips_breakeven: passthrough(Frequency.DAILY), vix: passthrough(Frequency.DAILY),
  credit_spread_baa10y: rollingZScore({ inputFrequency: "DAILY", monthlyAggregation: "CALENDAR_MONTH_MEAN" }), yield_curve_10y3m: passthrough(Frequency.DAILY), yield_curve_10y2y: passthrough(Frequency.DAILY),
  gscpi: passthrough(Frequency.MONTHLY), global_gpr: rollingZScore(), global_epu: rollingZScore(), trade_policy_uncertainty: rollingZScore(), household_debt_service_ratio: quarterlyLevelChangeMedian(), credit_card_delinquency: quarterlyLevelChangeMedian(),
});

const condition = (input, operator, value) => ({ input, operator, value });
const compareInput = (input, operator, compareToInput) => ({ input, operator, compareToInput });
const group = (...conditions) => ({ all: conditions });
const branch = (color, ...anyOf) => ({ color, anyOf });
function numericSignal(type, branches, { evidenceBasis = EvidenceBasis.AUTHOR_DEFINED, methodology = {} } = {}) {
  return Object.freeze({ type, parameters: Object.freeze({ input: "value", branches }), evidenceBasis, version: VERSION, status: SignalRuleStatus.CONFIRMED, methodology: Object.freeze(methodology) });
}
const simpleRange = (branches, options) => numericSignal(SignalRuleType.SIMPLE_RANGE, branches, options);
const higherWorseZ = () => numericSignal(SignalRuleType.ZSCORE_DIRECTIONAL, [branch("GREEN", group(condition("value", "<", 0))), branch("YELLOW", group(condition("value", ">=", 0), condition("value", "<=", 1))), branch("RED", group(condition("value", ">", 1)))], { methodology: { direction: "HIGHER_IS_WORSE" } });
const higherBetterZ = () => numericSignal(SignalRuleType.ZSCORE_DIRECTIONAL, [branch("GREEN", group(condition("value", ">", 0))), branch("YELLOW", group(condition("value", ">=", -1), condition("value", "<=", 0))), branch("RED", group(condition("value", "<", -1)))]);
const symmetricInflation = (methodology = {}) => numericSignal(SignalRuleType.TWO_SIDED_TARGET_BAND, [branch("GREEN", group(condition("value", ">=", 1.5), condition("value", "<=", 2.5))), branch("YELLOW", group(condition("value", ">=", 1), condition("value", "<", 1.5)), group(condition("value", ">", 2.5), condition("value", "<=", 3))), branch("RED", group(condition("value", "<", 1)), group(condition("value", ">", 3)))], { methodology: { anchor: 2, anchorUnit: "PERCENT", ...methodology } });
const yieldCurveSignal = () => simpleRange([branch("GREEN", group(condition("value", ">", 0.5))), branch("YELLOW", group(condition("value", ">=", 0), condition("value", "<=", 0.5))), branch("RED", group(condition("value", "<", 0)))], { methodology: { direction: "HIGHER_IS_BETTER", unit: "PERCENTAGE_POINTS", notes: ["Negative spread is an inversion.", "The 0 to 0.50 pp near-flat warning band is product-defined."] } });
const compoundBalanceSignal = () => Object.freeze({ type: SignalRuleType.COMPOUND_CONDITION, parameters: Object.freeze({ green: { anyOf: [group(compareInput("current", "<", "trailingMedian"), condition("periodChange4Q", "<=", 0))] }, red: { anyOf: [group(compareInput("current", ">", "trailingMedian"), condition("periodChange4Q", ">", 0))] }, defaultColor: "YELLOW" }), evidenceBasis: EvidenceBasis.AUTHOR_DEFINED, version: VERSION, status: SignalRuleStatus.CONFIRMED, methodology: Object.freeze({ direction: "HIGHER_AND_RISING_IS_WORSE", trailingMedianWindow: 20, periodChangeLag: 4 }) });

const signalDefinitions = Object.freeze({
  nonfarm_payrolls: simpleRange([branch("GREEN", group(condition("value", ">", 122))), branch("YELLOW", group(condition("value", ">=", 0), condition("value", "<=", 122))), branch("RED", group(condition("value", "<", 0)))], { methodology: { unit: "THOUSANDS_OF_JOBS", notes: ["122K is a demo threshold anchored to current BLS statistical-significance guidance; it is not an official bullish-market threshold."] } }),
  underemployment: higherWorseZ(),
  sahm_rule: simpleRange([branch("GREEN", group(condition("value", "<", 0.3))), branch("YELLOW", group(condition("value", ">=", 0.3), condition("value", "<", 0.5))), branch("RED", group(condition("value", ">=", 0.5)))], { methodology: { unit: "PERCENTAGE_POINTS", thresholdEvidence: [{ value: 0.3, evidenceBasis: EvidenceBasis.AUTHOR_DEFINED, role: "WARNING_BOUNDARY" }, { value: 0.5, evidenceBasis: EvidenceBasis.OFFICIAL, role: "SAHM_RECESSION_TRIGGER" }] } }),
  consumer_confidence: higherBetterZ(),
  durable_goods: simpleRange([branch("GREEN", group(condition("value", ">", 5))), branch("YELLOW", group(condition("value", ">=", -5), condition("value", "<=", 5))), branch("RED", group(condition("value", "<", -5)))]),
  "permits_starts:permits": simpleRange([branch("GREEN", group(condition("value", ">", 5))), branch("YELLOW", group(condition("value", ">=", -5), condition("value", "<=", 5))), branch("RED", group(condition("value", "<", -5)))]),
  pce_price_index: symmetricInflation({ anchorBasis: EvidenceBasis.OFFICIAL, bandBasis: EvidenceBasis.AUTHOR_DEFINED }),
  "cpi_core_cpi:headline": symmetricInflation({ anchorBasis: EvidenceBasis.AUTHOR_DEFINED, notes: ["The 2% anchor is inspired by the Fed PCE objective; it is not an official CPI target."] }),
  "cpi_core_cpi:core": symmetricInflation({ anchorBasis: EvidenceBasis.AUTHOR_DEFINED, notes: ["The 2% anchor is not an official Core CPI target."] }),
  taiwan_cpi: numericSignal(SignalRuleType.TWO_SIDED_TARGET_BAND, [branch("GREEN", group(condition("value", ">=", 0), condition("value", "<", 2))), branch("YELLOW", group(condition("value", ">=", -1), condition("value", "<", 0)), group(condition("value", ">=", 2), condition("value", "<", 3))), branch("RED", group(condition("value", "<", -1)), group(condition("value", ">=", 3)))], { methodology: { notes: ["Product-defined bands; not official Taiwan central-bank inflation targets."] } }),
  tips_breakeven: symmetricInflation({ unit: "PERCENT", notes: ["Market-implied inflation compensation, not realized inflation or a pure survey forecast."] }),
  vix: simpleRange([branch("GREEN", group(condition("value", "<", 20))), branch("YELLOW", group(condition("value", ">=", 20), condition("value", "<=", 30))), branch("RED", group(condition("value", ">", 30)))], { evidenceBasis: EvidenceBasis.CONVENTIONAL, methodology: { unit: "INDEX", notes: ["20/30 are conventional candidates, not official Cboe regime thresholds."] } }),
  credit_spread_baa10y: higherWorseZ(),
  yield_curve_10y3m: yieldCurveSignal(),
  yield_curve_10y2y: yieldCurveSignal(),
  gscpi: simpleRange([branch("GREEN", group(condition("value", "<", 0))), branch("YELLOW", group(condition("value", ">=", 0), condition("value", "<=", 1))), branch("RED", group(condition("value", ">", 1)))], { methodology: { notes: ["GSCPI is standardized around its historical average; signal interpretation is product-defined."] } }),
  global_gpr: higherWorseZ(),
  global_epu: higherWorseZ(),
  trade_policy_uncertainty: higherWorseZ(),
  household_debt_service_ratio: compoundBalanceSignal(),
  credit_card_delinquency: compoundBalanceSignal(),
});

const entryDescriptors = Object.freeze({
  nonfarm_payrolls: ["Payroll growth", "MONTHLY", "THOUSANDS_OF_PERSONS", "Monthly", "Thousands of persons", "Thousands of jobs", "source", "Source"],
  underemployment: ["Underemployment", "MONTHLY", "PERCENT", "Monthly", "Percent", "Standard deviations", "source", "Source"],
  sahm_rule: ["The Sahm indicator", "MONTHLY", "PERCENTAGE_POINTS", "Monthly", "Percentage points", "Percentage points", "calculation", "Calculation"],
  consumer_confidence: ["Sentiment", "MONTHLY", "INDEX", "Monthly", "Index", "Standard deviations", "release_timing", "Release timing"],
  durable_goods: ["Durable-goods orders", "MONTHLY", "MILLIONS_OF_DOLLARS", "Monthly", "Millions of dollars", "Percent year over year", "source", "Source"],
  "permits_starts:permits": ["Building permits", "MONTHLY", "THOUSANDS_OF_UNITS_SAAR", "Monthly", "Thousands of units, seasonally adjusted annual rate", "Percent year over year", "coverage", "Coverage"],
  pce_price_index: ["PCE inflation", "MONTHLY", "CHAIN_TYPE_PRICE_INDEX", "Monthly", "Chain-type price index", "Percent year over year", "revision", "Revision"],
  "cpi_core_cpi:headline": ["Headline CPI", "MONTHLY", "PRICE_INDEX", "Monthly", "Consumer Price Index", "Percent year over year", "source", "Source"],
  "cpi_core_cpi:core": ["Core CPI", "MONTHLY", "PRICE_INDEX", "Monthly", "Consumer Price Index excluding food and energy", "Percent year over year", "source", "Source"],
  taiwan_cpi: ["Taiwan CPI", "MONTHLY", "PRICE_INDEX_2021_100", "Monthly", "Index, 2021=100", "Percent year over year", "source", "Source"],
  tips_breakeven: ["Breakeven inflation", "DAILY", "PERCENT", "Daily", "Percent", "Percent", "calculation", "Calculation"],
  vix: ["VIX", "DAILY", "INDEX", "Daily", "Index", "Index level", "source", "Source"],
  credit_spread_baa10y: ["Credit spread", "DAILY", "PERCENTAGE_POINTS", "Daily", "Percentage points", "Standard deviations", "calculation", "Calculation"],
  yield_curve_10y3m: ["The 10Y–3M spread", "DAILY", "PERCENTAGE_POINTS", "Daily", "Percentage points", "Percentage points", "calculation", "Calculation"],
  yield_curve_10y2y: ["The 10Y–2Y spread", "DAILY", "PERCENTAGE_POINTS", "Daily", "Percentage points", "Percentage points", "calculation", "Calculation"],
  gscpi: ["GSCPI", "MONTHLY", "STANDARD_DEVIATIONS", "Monthly", "Standard deviations from historical average", "Standard deviations", "source", "Source"],
  global_gpr: ["Geopolitical risk", "MONTHLY", "INDEX_1985_2019_100", "Monthly", "Index, 1985–2019=100", "Standard deviations", "revision", "Revision and licensing"],
  global_epu: ["Policy uncertainty", "MONTHLY", "INDEX", "Monthly", "Index", "Standard deviations", "licensing", "Licensing and calculation"],
  trade_policy_uncertainty: ["Trade-policy uncertainty", "MONTHLY", "ARTICLE_SHARE_INDEX", "Monthly", "Index, 100 = 1% article share", "Standard deviations", "revision", "Revision and attribution"],
  household_debt_service_ratio: ["Debt service", "QUARTERLY", "PERCENT", "Quarterly", "Percent", "Percent and percentage-point change", "calculation", "Calculation"],
  credit_card_delinquency: ["Delinquency", "QUARTERLY", "PERCENT", "Quarterly", "Percent", "Percent and percentage-point change", "source", "Source"],
});

function nullable(value) { return value ?? null; }

function canonicalDefinition(entryId) {
  const [indicatorId, role, providerId, datasetId, acquisitionConfig] = sourceDefinitions[entryId];
  const transformation = transformationDefinitions[entryId];
  const signal = signalDefinitions[entryId];
  const [name, theme] = identityDisplay[entryId];
  const [valueStyle, interpretationStyle, wording] = quickInfoDisplay[entryId];
  const [transformationLabel, calculationDescription] = calculationContent[entryId];
  const [marketImplication, limitations, dataNote] = detailDisplay[entryId];
  const [sentenceSubject, rawFrequency, rawUnit, frequencyLabel, , outputUnitLabel, noteType, noteLabel] = entryDescriptors[entryId];
  return Object.freeze({
    machine: Object.freeze({
      entryId,
      identity: Object.freeze({ indicatorId, role: nullable(role) }),
      source: Object.freeze({
        providerId, datasetId, rawFrequency, rawUnit,
        acquisition: Object.freeze({ ...acquisitionConfig }),
      }),
      transformation: Object.freeze({
        type: transformation.type, evaluationFrequency: transformation.frequency,
        requiredPeriods: transformation.requiredPeriods, outputUnit: transformation.outputUnit,
        lag: nullable(transformation.lag), window: nullable(transformation.window),
        parameters: transformation.parameters, version: transformation.version,
      }),
      signal,
    }),
    display: Object.freeze({
      name, theme, sentenceSubject,
      providerLabel: PROVIDERS[providerId], frequencyLabel, outputUnitLabel,
      transformationLabel, calculationDescription, ruleRationale: ruleRationales[entryId],
      quickInfo: Object.freeze({ valueStyle, interpretationStyle, subject: sentenceSubject, wording }),
      marketImplication, limitations,
      dataNotes: Object.freeze([{ type: noteType, label: noteLabel, text: dataNote }].map(Object.freeze)),
    }),
  });
}

export const canonicalIndicatorMetadataV1 = Object.freeze(Object.fromEntries(
  Object.keys(sourceDefinitions).map((entryId) => [entryId, canonicalDefinition(entryId)]),
));

export function getCanonicalIndicatorMetadataV1(entryId) {
  return canonicalIndicatorMetadataV1[entryId] ?? null;
}
