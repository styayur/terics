import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTericsJson } from "../../src/v2/exchange";
import { generateIcsV2 } from "../../src/v2/ics";

describe("v2 ICS", () => {
  it("keeps RFC 5545 folding and parses independently", async () => {
    const timetable = parseTericsJson(readFileSync("fixtures/exchange/overrides.terics.json", "utf8"));
    const output = await generateIcsV2(timetable, { now: new Date("2026-08-01T00:00:00Z") });
    expect(output.ics.endsWith("\r\n")).toBe(true);
    expect(output.ics.replaceAll("\r\n", "").includes("\n")).toBe(false);
    expect(output.events).toHaveLength(12);
    for (const line of output.ics.split("\r\n").filter(Boolean)) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    const { default: ICAL } = await import("ical.js");
    const calendar = new ICAL.Component(ICAL.parse(output.ics));
    expect(calendar.getAllSubcomponents("vevent")).toHaveLength(12);
  });
});
