import { writeFile } from "node:fs/promises";
import { connectorManifests, listSchoolProfiles } from "../src/connectors/registry";

const payload = {
  sdkVersion: "1.0",
  adapters: connectorManifests(),
  schools: listSchoolProfiles(),
};
await writeFile("python/terics/assets/connector-manifest.json", `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${payload.adapters.length} adapter manifests and ${payload.schools.length} school profiles.`);
