import AdmZip from "adm-zip";
import { readFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const output = resolve(`release/terics-extension-v${pkg.version}.zip`);
await mkdir(resolve("release"), { recursive: true });
await rm(output, { force: true });
const zip = new AdmZip();
zip.addLocalFolder(resolve("extension-dist"));
zip.writeZip(output);
console.log(`Packaged ${output}`);
