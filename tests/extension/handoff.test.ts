import { describe, expect, it, vi } from "vitest";
import {
  HANDOFF_STORAGE_KEY,
  buildHandoffUrl,
  createPendingHandoff,
  handoffPayloadIntegrity,
  parseHandoffHash,
  type HandoffClaimMessage,
  type PendingHandoffRecord,
} from "../../src/extension/handoff";
import { handleExternalHandoffClaim, type HandoffStorage } from "../../src/extension/handoff-service";
import { claimHandoffFromLocation } from "../../src/extension/web-claim";
import { makeCourseId, makeMeetingId } from "../../src/v2/ids";
import type { NormalizedTimetableV2 } from "../../src/v2/types";

const EXTENSION_ID = "a".repeat(32);
const WEB_ORIGIN = "https://styayur.github.io";
const WEB_URL = `${WEB_ORIGIN}/terics/`;

class MemoryStorage implements HandoffStorage {
  values: Record<string, unknown> = {};

  async get(key: string): Promise<Record<string, unknown>> {
    return { [key]: this.values[key] };
  }

  async set(items: Record<string, unknown>): Promise<void> {
    this.values = { ...this.values, ...items };
  }

  async remove(key: string): Promise<void> {
    delete this.values[key];
  }
}

class MemorySession {
  values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

async function sample(): Promise<NormalizedTimetableV2> {
  const courseId = await makeCourseId({ adapterId: "test", sourceCourseId: "C1", fallbackOrdinal: 1 });
  const meetingId = await makeMeetingId({
    courseId,
    sourceMeetingId: "M1",
    weekday: 1,
    startPeriod: 1,
    endPeriod: 2,
    weeks: [1, 2],
  });
  return {
    schemaVersion: "2.0",
    source: { kind: "extension", adapterId: "test", adapterVersion: "1.0", extractedAt: "2026-08-01T00:00:00.000Z" },
    term: {
      termId: "TERM1",
      academicYear: "2026-2027",
      termCode: "1",
      termName: "测试学期",
      semesterStart: "2026-08-31",
      teachingWeeks: 2,
      timezone: "Asia/Shanghai",
      periodSchedules: [
        {
          id: "p",
          label: "默认",
          effectiveFrom: "2026-08-31",
          periods: [
            { index: 1, start: "08:00", end: "08:45" },
            { index: 2, start: "08:55", end: "09:40" },
          ],
        },
      ],
    },
    courses: [
      {
        id: courseId,
        name: "测试课程",
        meetings: [
          { id: meetingId, teacher: "教师", room: "A1", weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 2], weekRule: "1-2" },
        ],
      },
    ],
    overrides: [],
    metadata: {
      extractedAt: "2026-08-01T00:00:00.000Z",
      sourceKind: "extension",
      method: "api",
      rawCount: 1,
      parsedCount: 1,
      skippedCount: 0,
      adapterId: "test",
      adapterVersion: "1.0",
    },
    validation: {
      status: "verified",
      checks: [],
      completeness: {
        courseCount: 1,
        meetingCount: 1,
        missingTeacher: 0,
        missingRoom: 0,
        missingPeriods: 0,
        unknownWeekRules: 0,
        adjustmentDataAvailable: false,
      },
    },
  };
}

async function pending(now = new Date("2026-11-06T00:00:00.000Z")) {
  const data = await sample();
  return createPendingHandoff({
    timetable: data,
    extensionId: EXTENSION_ID,
    now,
    requestId: "request_0123456789",
    nonce: "nonce_0123456789_abcdef",
  });
}

function claimMessage(requestId: string, nonce: string): HandoffClaimMessage {
  return {
    type: "terics.handoff.claim",
    protocolVersion: 1,
    requestId,
    nonce,
    targetOrigin: WEB_ORIGIN,
  };
}

function sender(url = WEB_URL) {
  return { origin: WEB_ORIGIN, url, id: EXTENSION_ID };
}

describe("extension handoff protocol", () => {
  it("creates an opaque URL and round-trips its parameters", async () => {
    const handoff = await pending();
    expect(handoff.url).not.toContain("payload");
    expect(handoff.record.envelope.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(handoff.record.envelope.payloadSize).toBeGreaterThan(0);
    expect(parseHandoffHash(new URL(handoff.url).hash)).toEqual(handoff.params);
    expect(buildHandoffUrl(handoff.params)).toBe(handoff.url);
  });

  it("hashes canonical JSON independently of storage key order", async () => {
    const data = await sample();
    const reordered = {
      validation: data.validation,
      metadata: data.metadata,
      overrides: data.overrides,
      courses: data.courses,
      term: data.term,
      source: data.source,
      schemaVersion: data.schemaVersion,
    } as NormalizedTimetableV2;
    const left = await handoffPayloadIntegrity(data);
    const right = await handoffPayloadIntegrity(reordered);
    expect(right.hash).toBe(left.hash);
    expect(right.size).toBe(left.size);
  });

  it("claims once and rejects replay", async () => {
    const handoff = await pending();
    const storage = new MemoryStorage();
    storage.values[HANDOFF_STORAGE_KEY] = handoff.record;
    const message = claimMessage(handoff.params.requestId, handoff.params.nonce);
    const now = new Date("2026-11-06T00:01:00.000Z");

    const first = await handleExternalHandoffClaim(message, sender(), storage, now, EXTENSION_ID);
    expect(first.ok).toBe(true);
    expect((storage.values[HANDOFF_STORAGE_KEY] as PendingHandoffRecord).consumed).toBe(true);

    const second = await handleExternalHandoffClaim(message, sender(), storage, now, EXTENSION_ID);
    expect(second).toMatchObject({ ok: false, code: "replay" });
  });

  it("rejects mismatched nonce, expired records and untrusted web origins", async () => {
    const handoff = await pending();
    const storage = new MemoryStorage();
    storage.values[HANDOFF_STORAGE_KEY] = handoff.record;
    const now = new Date("2026-11-06T00:01:00.000Z");

    const mismatch = await handleExternalHandoffClaim(
      claimMessage(handoff.params.requestId, "nonce_0123456789_wrong"),
      sender(),
      storage,
      now,
      EXTENSION_ID,
    );
    expect(mismatch).toMatchObject({ ok: false, code: "invalid_request" });

    const denied = await handleExternalHandoffClaim(
      claimMessage(handoff.params.requestId, handoff.params.nonce),
      { origin: "https://evil.example", url: "https://evil.example/terics/" },
      storage,
      now,
      EXTENSION_ID,
    );
    expect(denied).toMatchObject({ ok: false, code: "origin_denied" });

    const expired = await handleExternalHandoffClaim(
      claimMessage(handoff.params.requestId, handoff.params.nonce),
      sender(),
      storage,
      new Date("2026-11-06T00:06:00.000Z"),
      EXTENSION_ID,
    );
    expect(expired).toMatchObject({ ok: false, code: "expired" });
    expect(storage.values[HANDOFF_STORAGE_KEY]).toBeUndefined();
  });

  it("rejects payload tampering without consuming the handoff", async () => {
    const handoff = await pending();
    const tampered = structuredClone(handoff.record);
    tampered.envelope.payload.courses[0]!.name = "被篡改的课程";
    const storage = new MemoryStorage();
    storage.values[HANDOFF_STORAGE_KEY] = tampered;
    const response = await handleExternalHandoffClaim(
      claimMessage(handoff.params.requestId, handoff.params.nonce),
      sender(),
      storage,
      new Date("2026-11-06T00:01:00.000Z"),
      EXTENSION_ID,
    );
    expect(response).toMatchObject({ ok: false, code: "integrity_failed" });
    expect((storage.values[HANDOFF_STORAGE_KEY] as PendingHandoffRecord).consumed).toBe(false);
  });

  it("rejects an oversized payload instead of building a long URL", async () => {
    const data = await sample();
    const huge = structuredClone(data);
    huge.courses[0]!.name = "X".repeat(2 * 1024 * 1024);
    await expect(
      createPendingHandoff({ timetable: huge, extensionId: EXTENSION_ID, now: new Date("2026-11-06T00:00:00.000Z") }),
    ).rejects.toThrow(/大小限制/);
  });

  it("fails clearly when the browser extension is absent", async () => {
    const handoff = await pending();
    await expect(
      claimHandoffFromLocation({
        hash: new URL(handoff.url).hash,
        href: handoff.url,
        runtime: {},
        session: new MemorySession(),
        now: new Date("2026-11-06T00:01:00.000Z"),
      } as never),
    ).rejects.toThrow(/未检测到 terics 扩展/);
  });

  it("claims through chrome.runtime.sendMessage and records replay protection", async () => {
    const handoff = await pending();
    const session = new MemorySession();
    const runtime = {
      lastError: undefined,
      sendMessage: vi.fn((_id: string, _message: HandoffClaimMessage, callback: (value: unknown) => void) =>
        callback({ ok: true, envelope: handoff.record.envelope }),
      ),
    };
    const replaceState = vi.spyOn(window.history, "replaceState");
    const claimed = await claimHandoffFromLocation({
      hash: new URL(handoff.url).hash,
      href: handoff.url,
      runtime,
      session,
      now: new Date("2026-11-06T00:01:00.000Z"),
    });
    expect(claimed?.term.termId).toBe("TERM1");
    expect(replaceState).toHaveBeenCalled();
    await expect(
      claimHandoffFromLocation({
        hash: new URL(handoff.url).hash,
        href: handoff.url,
        runtime,
        session,
        now: new Date("2026-11-06T00:01:00.000Z"),
      }),
    ).rejects.toThrow(/重放/);
  });
});
