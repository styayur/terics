import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const outdir = resolve("extension-dist");
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
const shared = {
  bundle: true,
  platform: "browser",
  target: ["chrome109", "edge109"],
  legalComments: "none",
  sourcemap: false,
};
await build({ ...shared, entryPoints: ["extension/content.ts"], outfile: `${outdir}/content.js`, format: "iife" });
await build({ ...shared, entryPoints: ["extension/popup.ts"], outfile: `${outdir}/popup.js`, format: "iife" });
await build({ ...shared, entryPoints: ["extension/service-worker.ts"], outfile: `${outdir}/service-worker.js`, format: "iife" });
for (const file of ["manifest.json", "popup.html", "popup.css"]) {
  await copyFile(resolve("extension", file), resolve(outdir, file));
}
console.log("Built Chrome/Edge extension in extension-dist/");
