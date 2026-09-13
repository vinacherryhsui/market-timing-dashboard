import { fileURLToPath } from "node:url";
import { createProductionServer } from "./src/server/createProductionServer.js";

// Node preserves a UTF-8 BOM on the first key in an env file. Keep parity with
// the Vite configuration, which already normalizes that key for local use.
for (const key of Object.keys(process.env)) {
  if (!key.startsWith("\uFEFF")) continue;
  const normalizedKey = key.replace(/^\uFEFF/, "");
  if (!(normalizedKey in process.env)) process.env[normalizedKey] = process.env[key];
  delete process.env[key];
}

const PROJECT_ROOT = fileURLToPath(new URL(".", import.meta.url));
const HOST = "0.0.0.0";
const FALLBACK_PORT = 4173;

function resolvePort(value) {
  if (value === undefined || value === "") return FALLBACK_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer from 1 to 65535; received ${value}.`);
  }
  return port;
}

const port = resolvePort(process.env.PORT);
const server = createProductionServer({ distDir: fileURLToPath(new URL("dist/", import.meta.url)) });

try {
  await server.assertBuildExists();
} catch {
  console.error(`Production build not found under ${PROJECT_ROOT}dist. Run npm run build first.`);
  process.exitCode = 1;
  process.exit();
}

server.listen(port, HOST, () => {
  console.log(`Market Timing Dashboard listening on http://localhost:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
