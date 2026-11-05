import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

describe("shared timetable schema", () => {
  it("accepts the normalized parity example and rejects invalid weekdays", () => {
    const schema = JSON.parse(readFileSync(resolve("schema/timetable.schema.json"), "utf8"));
    const example = JSON.parse(readFileSync(resolve("fixtures/normalized/example.json"), "utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    expect(validate(example), JSON.stringify(validate.errors)).toBe(true);
    const invalid = structuredClone(example);
    invalid.courses[0].weekday = 8;
    expect(validate(invalid)).toBe(false);
  });

  it("validates .terics.json v2 samples and override union", () => {
    const schema = JSON.parse(readFileSync(resolve("schema/timetable-v2.schema.json"), "utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    for (const file of ["fixtures/exchange/terics-example.terics.json", "fixtures/exchange/overrides.terics.json"]) {
      const example = JSON.parse(readFileSync(resolve(file), "utf8"));
      expect(validate(example), `${file}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
    const longWeeks = JSON.parse(readFileSync(resolve("fixtures/exchange/whut-real-shape.terics.json"), "utf8"));
    longWeeks.term.teachingWeeks = 35;
    longWeeks.courses[0].meetings[0].weeks = [35];
    expect(validate(longWeeks), JSON.stringify(validate.errors)).toBe(true);
    const invalid = JSON.parse(readFileSync(resolve("fixtures/exchange/terics-example.terics.json"), "utf8"));
    invalid.access_token = "secret";
    expect(validate(invalid)).toBe(false);
  });
});
