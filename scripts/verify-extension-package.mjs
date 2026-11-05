import AdmZip from "adm-zip";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const zipPath = resolve(`release/terics-extension-v${pkg.version}.zip`);
const zip = new AdmZip(zipPath);
const names = new Set(zip.getEntries().map((entry) => entry.entryName));
for (const required of ["manifest.json", "popup.html", "popup.css", "popup.js", "content.js", "service-worker.js"]) {
  if (!names.has(required)) throw new Error(`extension package missing ${required}`);
}
const manifest = JSON.parse(zip.readAsText("manifest.json"));
if (manifest.manifest_version !== 3) throw new Error("extension is not Manifest V3");
if (manifest.version_name !== pkg.version) throw new Error(`manifest version_name ${manifest.version_name} != package ${pkg.version}`);
if (JSON.stringify(manifest).includes("all_urls")) throw new Error("extension requests all_urls");
if (manifest.host_permissions && manifest.host_permissions.length > 0) throw new Error("extension must use activeTab, not fixed host permissions");
if (JSON.stringify(manifest.permissions) !== JSON.stringify(["activeTab", "scripting", "storage"])) {
  throw new Error(`unexpected permissions: ${JSON.stringify(manifest.permissions)}`);
}
for (const file of ["popup.js", "content.js", "service-worker.js"]) {
  const source = zip.readAsText(file);
  if (/\beval\s*\(|new\s+Function\s*\(/.test(source)) throw new Error(`${file} contains dynamic code evaluation`);
  if (/importScripts\s*\(\s*["']https?:/i.test(source)) throw new Error(`${file} loads remote code`);
}
console.log(`Extension package verified: ${Object.keys(manifest).length} manifest keys, ${names.size} files.`);
