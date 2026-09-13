import assert from "node:assert/strict";
import test from "node:test";
import { DgbasClient } from "../src/data/dgbas/DgbasClient.js";
import { EiaClient } from "../src/data/eia/EiaClient.js";
import { getIndicatorSourceConfigs } from "../src/data/acquisition/indicatorSources.js";

const DGBAS_CONFIG = getIndicatorSourceConfigs("taiwan_cpi")[0];
const EIA_CONFIG = getIndicatorSourceConfigs("eia_crude_inventories")[0];

test("DGBAS selects the latest valid Total Index raw observation", async () => {
  const xml = `<?xml version="1.0"?><DataSet>
    <Obs><Item>總指數(指數基期：民國110年=100)</Item><TIME_PERIOD>2026M07</TIME_PERIOD><FREQ>M</FREQ><TYPE>原始值</TYPE><Item_VALUE>111.2</Item_VALUE></Obs>
    <Obs><Item>總指數(指數基期：民國110年=100)</Item><TIME_PERIOD>2026M08</TIME_PERIOD><FREQ>M</FREQ><TYPE>年增率(%)</TYPE><Item_VALUE>2.1</Item_VALUE></Obs>
    <Obs><Item>總指數(指數基期：民國110年=100)</Item><TIME_PERIOD>2026M08</TIME_PERIOD><FREQ>M</FREQ><TYPE>原始值</TYPE><Item_VALUE></Item_VALUE></Obs>
    <Obs><Item>總指數(指數基期：民國110年=100)</Item><TIME_PERIOD>2026M06</TIME_PERIOD><FREQ>M</FREQ><TYPE>原始值</TYPE><Item_VALUE>110.8</Item_VALUE></Obs>
  </DataSet>`;
  const client = new DgbasClient({
    fetchImpl: async () => new Response(xml, { status: 200 }),
  });
  const result = await client.getLatestObservation(DGBAS_CONFIG);
  assert.equal(result.observationDate, "2026-07-01");
  assert.equal(result.value, 111.2);
  assert.equal(result.metadata.type, "原始值");
});

test("DGBAS rejects schema mismatch", async () => {
  const client = new DgbasClient({
    fetchImpl: async () => new Response("<html></html>", { status: 200 }),
  });
  await assert.rejects(
    client.getLatestObservation(DGBAS_CONFIG),
    (error) => error.code === "DGBAS_SCHEMA_MISMATCH",
  );
});

test("DGBAS requires dataset-specific configuration", async () => {
  const client = new DgbasClient({ fetchImpl: async () => new Response("", { status: 200 }) });
  await assert.rejects(client.getLatestObservation({}), (error) => error.code === "DGBAS_INVALID_CONFIG");
});

test("EIA requires EIA_API_KEY", () => {
  assert.throws(
    () => new EiaClient({ apiKey: "" }),
    (error) => error.code === "EIA_API_KEY_MISSING",
  );
});

test("EIA requires route, dataset and frequency configuration", async () => {
  const client = new EiaClient({ apiKey: "test-key", fetchImpl: async () => new Response() });
  await assert.rejects(client.getLatestObservation({}), (error) => error.code === "EIA_INVALID_CONFIG");
});

test("EIA skips missing values and returns the latest valid record", async () => {
  const client = new EiaClient({
    apiKey: "test-key",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          response: {
            frequency: "weekly",
            data: [
              { period: "2026-08-28", series: "WCESTUS1", value: "NA", units: "MBBL" },
              {
                period: "2026-08-21",
                series: "WCESTUS1",
                value: "428910",
                units: "MBBL",
                "series-description": "U.S. Ending Stocks excluding SPR of Crude Oil",
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  });
  const result = await client.getLatestObservation(EIA_CONFIG);
  assert.equal(result.observationDate, "2026-08-21");
  assert.equal(result.value, 428910);
  assert.equal(result.unit, "MBBL");
});

test("EIA rejects empty results", async () => {
  const client = new EiaClient({
    apiKey: "test-key",
    fetchImpl: async () =>
      new Response(JSON.stringify({ response: { data: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });
  await assert.rejects(
    client.getLatestObservation(EIA_CONFIG),
    (error) => error.code === "EIA_EMPTY_RESULTS",
  );
});
