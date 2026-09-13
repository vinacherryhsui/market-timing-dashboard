import assert from "node:assert/strict";
import test from "node:test";
import { FredClient, FredClientError } from "../src/data/fred/FredClient.js";

function jsonResponse(payload, { status = 200 } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("requires FRED_API_KEY", () => {
  assert.throws(
    () => new FredClient({ apiKey: "" }),
    (error) => error instanceof FredClientError && error.code === "FRED_API_KEY_MISSING",
  );
});

test("normalizes FRED missing values to null", async () => {
  const client = new FredClient({
    apiKey: "test-key",
    fetchImpl: async () =>
      jsonResponse({
        observations: [
          { date: "2026-01-01", value: "." },
          { date: "2025-12-01", value: "12.5" },
        ],
      }),
  });

  const result = await client.fetchSeriesObservations("TEST");
  assert.equal(result.observations[0].value, null);
  assert.equal(result.observations[1].value, 12.5);
});

test("uses observation date and skips null values for latest observation", async () => {
  const fetchImpl = async (url) => {
    if (url.pathname.endsWith("/series")) {
      return jsonResponse({
        seriess: [
          {
            id: "TEST",
            title: "Test series",
            last_updated: "2099-01-01 00:00:00-00",
          },
        ],
      });
    }

    return jsonResponse({
      observations: [
        { date: "2026-03-01", value: "." },
        { date: "2026-01-01", value: "8.5" },
        { date: "2026-02-01", value: "9.5" },
      ],
    });
  };
  const client = new FredClient({ apiKey: "test-key", fetchImpl });
  const latest = await client.getLatestValidObservation("TEST");

  assert.equal(latest.observationDate, "2026-02-01");
  assert.equal(latest.value, 9.5);
  assert.equal(latest.metadata.lastUpdated, "2099-01-01 00:00:00-00");
});

test("classifies invalid API key errors", async () => {
  const client = new FredClient({
    apiKey: "bad-key",
    fetchImpl: async () =>
      jsonResponse(
        { error_code: 400, error_message: "The value for variable api_key is invalid." },
        { status: 400 },
      ),
  });

  await assert.rejects(
    client.fetchSeriesMetadata("TEST"),
    (error) => error.code === "FRED_INVALID_API_KEY",
  );
});

test("classifies invalid series ID errors", async () => {
  const client = new FredClient({
    apiKey: "test-key",
    fetchImpl: async () =>
      jsonResponse(
        { error_code: 400, error_message: "The value for variable series_id is invalid." },
        { status: 400 },
      ),
  });

  await assert.rejects(
    client.fetchSeriesMetadata("NOT_A_SERIES"),
    (error) => error.code === "FRED_INVALID_SERIES_ID",
  );
});

test("wraps network failures", async () => {
  const client = new FredClient({
    apiKey: "test-key",
    fetchImpl: async () => {
      throw new TypeError("connection refused");
    },
  });

  await assert.rejects(
    client.fetchSeriesMetadata("TEST"),
    (error) => error.code === "FRED_NETWORK_ERROR",
  );
});

test("rejects empty observation arrays", async () => {
  const client = new FredClient({
    apiKey: "test-key",
    fetchImpl: async () => jsonResponse({ observations: [] }),
  });

  await assert.rejects(
    client.fetchSeriesObservations("TEST"),
    (error) => error.code === "FRED_EMPTY_OBSERVATIONS",
  );
});

test("rejects observation arrays containing no parseable value", async () => {
  const fetchImpl = async (url) => {
    if (url.pathname.endsWith("/series")) {
      return jsonResponse({ seriess: [{ id: "TEST" }] });
    }
    return jsonResponse({ observations: [{ date: "2026-01-01", value: "." }] });
  };
  const client = new FredClient({ apiKey: "test-key", fetchImpl });

  await assert.rejects(
    client.getLatestValidObservation("TEST"),
    (error) => error.code === "FRED_NO_VALID_OBSERVATION",
  );
});

test("preserves configured provider metadata in normalized observations", async () => {
  const fetchImpl = async (url) => {
    if (url.pathname.endsWith("/series")) {
      return jsonResponse({ seriess: [{ id: "TEST", units: "Percent", frequency: "Daily" }] });
    }
    return jsonResponse({ observations: [{ date: "2026-01-01", value: "1.25" }] });
  };
  const client = new FredClient({ apiKey: "test-key", fetchImpl });
  const result = await client.getLatestObservation({
    indicatorId: "test_indicator",
    datasetId: "TEST",
    metadata: { licensingNote: "Redistribution not established." },
  });
  assert.equal(result.metadata.licensingNote, "Redistribution not established.");
});
