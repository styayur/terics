import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseTericsJson } from "../src/v2/exchange";
import { applyUidMigration, previewUidMigration } from "../src/v2/uid-migration";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const timetablePath = argument("--timetable");
const icsPath = argument("--ics");
const outPath = argument("--out");
const confirmed = process.argv.includes("--confirm");
if (!timetablePath || !icsPath || !outPath) {
  console.error("用法: npm run migrate:uid -- --timetable <terics.json> --ics <legacy.ics> --out <migrated.ics> [--confirm]");
  process.exit(2);
}
const input = resolve(icsPath);
const output = resolve(outPath);
if (input === output) {
  console.error("拒绝覆盖原始 ICS；请输入非输入文件的新路径。");
  process.exit(2);
}
const timetable = parseTericsJson(await readFile(resolve(timetablePath), "utf8"));
const ics = await readFile(input, "utf8");
const preview = await previewUidMigration(timetable, ics);
console.log(JSON.stringify({ mode: confirmed ? "apply" : "dry-run", ...preview }, null, 2));
if (!preview.safeToApply) process.exit(1);
if (!confirmed) {
  console.log("dry-run 完成；未写入文件。核对后追加 --confirm 生成新 ICS。");
  process.exit(0);
}
const migrated = applyUidMigration(ics, preview, true);
const temporary = `${output}.tmp-${process.pid}`;
await writeFile(temporary, migrated.ics, "utf8");
await rename(temporary, output);
console.log(`已写入 ${output}；替换 ${migrated.replaced} 个 UID，未删除任何事件。`);
