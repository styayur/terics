import { describe, expect, it } from "vitest";
import { GoogleCalendarRestClient } from "../../src/google/client";

describe("Google Calendar REST client", () => {
  it("paginates and filters managed events", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      expect(init?.headers).toMatchObject({ Authorization: "Bearer token" });
      if (url.includes("calendarList")) {
        return new Response(JSON.stringify({ items: [{ id: "terics-cal", summary: "terics / 2026" }] }), { status: 200 });
      }
      if (url.includes("pageToken=next")) {
        return new Response(JSON.stringify({ items: [{ id: "M2", extendedProperties: { private: { terics_source: "terics", terics_term_id: "T1" } } }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ items: [{ id: "M1", extendedProperties: { private: { terics_source: "terics", terics_term_id: "T1" } } }, { id: "OTHER", extendedProperties: { private: { other: "1" } } }], nextPageToken: "next" }), { status: 200 });
    }) as typeof fetch;
    const client = new GoogleCalendarRestClient("token", fetchImpl);
    expect(await client.listCalendars()).toEqual([{ id: "terics-cal", summary: "terics / 2026" }]);
    const events = await client.listManagedEvents("terics-cal", "T1");
    expect(events.map((event) => event.id)).toEqual(["M1", "M2"]);
    expect(calls.some((url) => url.includes("privateExtendedProperty=terics_source%3Dterics"))).toBe(true);
  });

  it("uses PATCH for updates and never returns token in errors", async () => {
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("PATCH");
      return new Response(JSON.stringify({ error: { message: "quota" } }), { status: 403 });
    }) as typeof fetch;
    const client = new GoogleCalendarRestClient("secret-token", fetchImpl);
    await expect(client.patchEvent("cal", "event", { summary: "x" })).rejects.toThrow(/HTTP 403/);
    await expect(client.patchEvent("cal", "event", { summary: "x" })).rejects.not.toThrow(/secret-token/);
  });
});
