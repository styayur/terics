import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

await mkdir(resolve("python/terics/assets"), { recursive: true });
await build({
  entryPoints: ["src/connectors/page-runtime.ts"],
  outfile: "python/terics/assets/connector-runtime.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome109", "edge109", "safari16"],
  minify: false,
  legalComments: "none",
  sourcemap: false,
});
const manifest = spawnSync(
  process.execPath,
  ["--import", "tsx", "scripts/write-connector-manifest.ts"],
  { stdio: "inherit" },
);
if (manifest.status !== 0) process.exit(manifest.status ?? 1);
console.log("Built connector runtime and manifest.");
