import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const samples = [
  ["fixtures/csv/terics_sample.csv", "public/samples/csv-sample.csv"],
  ["fixtures/html/qingguo_list_sample.xls", "public/samples/html-list-sample.xls"],
  ["fixtures/xlsx/wakeup_schedule_template.xlsx", "public/samples/xlsx-grid-sample.xlsx"],
  ["fixtures/exchange/terics-example.terics.json", "public/samples/terics-example.terics.json"],
];

await mkdir(resolve(root, "public/samples"), { recursive: true });
for (const [source, target] of samples) {
  await copyFile(resolve(root, source), resolve(root, target));
}
console.log(`Synced ${samples.length} public samples.`);
