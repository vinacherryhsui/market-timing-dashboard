# Market Timing Dashboard

A customizable equity-market environment dashboard that combines macroeconomic, financial, and risk indicators into one view. Users can arrange a nine-card grid, inspect current signals and indicator history, save layouts locally, and view an equal-weighted Market Score.

This project is a research and portfolio application. It is not investment advice.

## Features

- 21 active indicators backed by canonical metadata
- Customizable 3×3 grid with drag-and-drop reordering
- Bullish, Neutral, Bearish, and Unknown signal states
- Equal-weighted Market Score with valid-signal coverage
- Indicator detail views with transformed history, signal rules, calculations, and limitations
- Browser-local workspace and named-layout persistence
- Driver.js onboarding tour and a lightweight Help / About drawer
- Standalone Node production server for the built Vite application and dashboard APIs

## Technology

- React 19
- Vite 8
- Node.js production server
- Driver.js
- Node's built-in test runner and Testing Library

## Local setup

Use a current Node.js LTS release and install the locked dependencies:

```sh
npm ci
```

Copy `.env.example` to `.env` and add provider credentials when needed. Never commit `.env` or real API keys.

```dotenv
FRED_API_KEY=
EIA_API_KEY=
```

For development:

```sh
npm run dev
```

For a production-like local run:

```sh
npm run build
npm start
```

The production server binds to `0.0.0.0`, uses `PORT` when provided, and otherwise listens on port `4173`. It serves `dist/` and exposes:

- `GET /api/dashboard`
- `GET /api/indicator-detail?entryId=<indicator-entry-id>`

Open `http://localhost:4173` when using the default port.

## Testing

```sh
npm test
npm run build
```

The tests cover canonical metadata, acquisition adapters, transformations, signal evaluation, Market Score, grid behavior, persistence, onboarding, indicator details, caching, and the production server.

## Project structure

- `src/domain/` — grid, transformation, signal, history, and scoring rules
- `src/data/` — provider adapters, normalized observations, and cache access
- `src/features/dashboard/` — dashboard UI, layouts, details, help, and onboarding
- `src/server/` — dashboard snapshot logic and production HTTP server
- `data/cache/research/` — required checked-in research source files
- `data/cache/history/` — local historical cache used by the application
- `docs/` — design and implementation documentation
- `analysis/` — separate reproducible indicator-ranking research workflow

Generated analysis datasets under `analysis/data/`, local environment files, dependencies, and production build artifacts are intentionally excluded from Git.

## Indicator architecture

Canonical Indicator Metadata v1 is the single definition source for all active indicators:

- `machine` contains identity, acquisition configuration, transformation definitions, and executable signal rules.
- `display` contains dashboard and Indicator Detail content.
- Transformation, signal, and source registries are derived compatibility views rather than duplicate definitions.

To add an indicator, follow [`docs/indicator-onboarding.md`](docs/indicator-onboarding.md).

## Data limitations

Historical charts are descriptive views of available transformed series. They are not point-in-time backtests and do not fully account for historical release timing or later data revisions. Provider availability, credentials, revisions, and update schedules can affect displayed observations.

## Source

[View the project on GitHub](https://github.com/vinacherryhsui/market-timing-dashboard)
