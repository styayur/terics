import { readFileSync } from "node:fs";

const allowed = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT-0",
  "MPL-2.0",
  "Python-2.0",
  "Unlicense",
  "WTFPL",
]);
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const packages = Object.entries(lock.packages ?? {})
  .filter(([path]) => path.startsWith("node_modules/"))
  .map(([path, info]) => ({
    name: path.replace(/^node_modules\//, ""),
    version: info.version,
    license: info.license || info.licenses || null,
  }));
const unknown = [];
const summary = new Map();
for (const pkg of packages) {
  const license = String(pkg.license ?? "");
  const tokens = license.match(/[A-Za-z0-9.+-]+/g) ?? [];
  const recognized = tokens.filter((token) => allowed.has(token));
  if (recognized.length === 0) {
    unknown.push(pkg);
  } else {
    summary.set(license, (summary.get(license) ?? 0) + 1);
  }
}
if (unknown.length > 0) {
  console.error("Unrecognized npm dependency licenses:");
  for (const pkg of unknown) console.error(`- ${pkg.name}@${pkg.version}: ${pkg.license ?? "MISSING"}`);
  process.exit(1);
}
console.log(`NPM license audit passed: ${packages.length} packages.`);
for (const [license, count] of [...summary].sort()) console.log(`- ${license}: ${count}`);
