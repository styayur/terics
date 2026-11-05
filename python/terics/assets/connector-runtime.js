"use strict";
(() => {
  // src/core/types.ts
  var DEFAULT_MAX_WEEK = 30;
  var FORMAT_LABELS = {
    csv: "CSV \u8BFE\u7A0B\u6E05\u5355",
    html: "HTML \u6559\u52A1\u8BFE\u8868",
    xlsx: "XLSX \u7F51\u683C\u8BFE\u8868"
  };
  var DEFAULT_PERIODS = [
    { index: 1, start: "08:00", end: "08:45" },
    { index: 2, start: "08:55", end: "09:40" },
    { index: 3, start: "10:00", end: "10:45" },
    { index: 4, start: "10:55", end: "11:40" },
    { index: 5, start: "14:00", end: "14:45" },
    { index: 6, start: "14:55", end: "15:40" },
    { index: 7, start: "16:00", end: "16:45" },
    { index: 8, start: "16:55", end: "17:40" },
    { index: 9, start: "19:00", end: "19:45" },
    { index: 10, start: "19:55", end: "20:40" },
    { index: 11, start: "20:50", end: "21:35" },
    { index: 12, start: "21:45", end: "22:30" }
  ];

  // src/core/dates.ts
  function parseIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(`\u65E5\u671F\u5FC5\u987B\u4F7F\u7528 YYYY-MM-DD \u683C\u5F0F\uFF1A${value}`);
    }
    const [yearText, monthText, dayText] = value.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new Error(`\u65E0\u6548\u65E5\u671F\uFF1A${value}`);
    }
    return date;
  }
  function formatIsoDate(date) {
    const year = String(date.getUTCFullYear()).padStart(4, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  function addDaysIso(value, days) {
    const date = parseIsoDate(value);
    date.setUTCDate(date.getUTCDate() + days);
    return formatIsoDate(date);
  }
  function mondayOfIso(value) {
    const date = parseIsoDate(value);
    const weekday = date.getUTCDay();
    const offset = weekday === 0 ? -6 : 1 - weekday;
    date.setUTCDate(date.getUTCDate() + offset);
    return formatIsoDate(date);
  }
  function isMonday(value) {
    return parseIsoDate(value).getUTCDay() === 1;
  }
  function assertTime(value, label) {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      throw new Error(`${label}\u5FC5\u987B\u662F HH:mm \u683C\u5F0F\uFF0C\u4E14\u5728 00:00\u201323:59 \u4E4B\u95F4\uFF1A${value}`);
    }
    return value;
  }

  // src/v2/ids.ts
  async function sha256Hex(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  async function makeCourseId(input) {
    const anchor = input.sourceCourseId?.trim() || input.sourceRef?.trim() || `ordinal:${input.fallbackOrdinal}`;
    return `course-${(await sha256Hex([input.adapterId, anchor].join(""))).slice(0, 24)}`;
  }
  async function makeMeetingId(input) {
    const anchor = input.sourceMeetingId?.trim() || [input.weekday, input.startPeriod, input.endPeriod, [...input.weeks].sort((a, b) => a - b).join(",")].join("|");
    return `meeting-${(await sha256Hex([input.courseId, anchor].join(""))).slice(0, 24)}`;
  }
  function sanitizeSourceUrl(raw) {
    try {
      const url = new URL(raw);
      return `${url.origin}${url.pathname}`;
    } catch {
      return "about:invalid";
    }
  }
  function normalizeSemesterStart(value) {
    const monday = mondayOfIso(value);
    parseIsoDate(monday);
    return monday;
  }

  // src/v2/validate.ts
  function pushIssue(issues, path, code, message) {
    issues.push({ path, code, message });
  }
  function validateTimetableV2(value) {
    return inspectTimetableV2(value).report;
  }
  function inspectTimetableV2(value) {
    const issues = [];
    const warnings = [];
    if (!value || typeof value !== "object") {
      pushIssue(issues, "$", "not_object", "\u8BFE\u8868 JSON \u5FC5\u987B\u662F\u5BF9\u8C61");
      return emptyResult(issues, warnings);
    }
    const timetable = value;
    for (const forbidden of findForbiddenKeys(value)) {
      pushIssue(issues, forbidden, "forbidden_credential_field", "terics \u4EA4\u6362\u6587\u4EF6\u7981\u6B62\u5305\u542B\u5BC6\u7801\u3001Cookie\u3001Token \u6216 CSRF \u51ED\u8BC1");
    }
    if (timetable.schemaVersion !== "2.0") {
      pushIssue(issues, "$.schemaVersion", "unsupported_schema", "\u4EC5\u652F\u6301 .terics.json schemaVersion 2.0");
    }
    if (!timetable.source || typeof timetable.source !== "object") {
      pushIssue(issues, "$.source", "missing_source", "\u7F3A\u5C11\u6765\u6E90\u5143\u6570\u636E");
    }
    if (!timetable.term || typeof timetable.term !== "object") {
      pushIssue(issues, "$.term", "missing_term", "\u7F3A\u5C11\u5B66\u671F\u4E0A\u4E0B\u6587");
    }
    if (!Array.isArray(timetable.courses) || timetable.courses.length === 0) {
      pushIssue(issues, "$.courses", "missing_courses", "\u8BFE\u8868\u6CA1\u6709\u8BFE\u7A0B");
    }
    if (!Array.isArray(timetable.overrides)) {
      pushIssue(issues, "$.overrides", "missing_overrides", "schedule overrides \u5FC5\u987B\u662F\u6570\u7EC4");
    }
    let meetingCount = 0;
    let missingTeacher = 0;
    let missingRoom = 0;
    let missingPeriods = 0;
    let unknownWeekRules = 0;
    const courseIds = /* @__PURE__ */ new Set();
    const meetingIds = /* @__PURE__ */ new Set();
    if (timetable.term) {
      try {
        parseIsoDate(timetable.term.semesterStart);
        if (!isMonday(timetable.term.semesterStart)) {
          pushIssue(issues, "$.term.semesterStart", "not_monday", "semesterStart \u5FC5\u987B\u662F\u7B2C 1 \u5468\u5468\u4E00");
        }
      } catch {
        pushIssue(issues, "$.term.semesterStart", "invalid_date", "semesterStart \u65E0\u6548");
      }
      if (!Number.isInteger(timetable.term.teachingWeeks) || timetable.term.teachingWeeks < 1) {
        pushIssue(issues, "$.term.teachingWeeks", "invalid_weeks", "teachingWeeks \u5FC5\u987B\u662F\u6B63\u6574\u6570");
      }
      if (!Array.isArray(timetable.term.periodSchedules) || timetable.term.periodSchedules.length === 0) {
        pushIssue(issues, "$.term.periodSchedules", "missing_periods", "\u81F3\u5C11\u9700\u8981\u4E00\u5957\u8282\u6B21\u65F6\u95F4\u8868");
      } else {
        for (const [scheduleIndex, schedule] of timetable.term.periodSchedules.entries()) {
          const path = `$.term.periodSchedules[${scheduleIndex}]`;
          try {
            parseIsoDate(schedule.effectiveFrom);
            if (schedule.effectiveTo) parseIsoDate(schedule.effectiveTo);
          } catch {
            pushIssue(issues, `${path}.effectiveFrom`, "invalid_date", "\u8282\u6B21\u8868\u751F\u6548\u65E5\u671F\u65E0\u6548");
          }
          if (!Array.isArray(schedule.periods) || schedule.periods.length === 0) {
            pushIssue(issues, `${path}.periods`, "missing_periods", "\u8282\u6B21\u8868\u4E3A\u7A7A");
          } else {
            for (const period of schedule.periods) {
              try {
                assertTime(period.start, "\u5F00\u59CB\u65F6\u95F4");
                assertTime(period.end, "\u7ED3\u675F\u65F6\u95F4");
              } catch {
                pushIssue(issues, path, "invalid_clock", `\u8282\u6B21 ${period.index} \u65F6\u95F4\u65E0\u6548`);
              }
            }
          }
        }
      }
    }
    if (Array.isArray(timetable.courses)) {
      for (const [courseIndex, course] of timetable.courses.entries()) {
        const path = `$.courses[${courseIndex}]`;
        if (!course || typeof course !== "object") {
          pushIssue(issues, path, "invalid_course", "\u8BFE\u7A0B\u5FC5\u987B\u662F\u5BF9\u8C61");
          continue;
        }
        if (!course.id || typeof course.id !== "string") {
          pushIssue(issues, `${path}.id`, "missing_course_id", "\u8BFE\u7A0B\u7F3A\u5C11\u7A33\u5B9A ID");
        } else if (courseIds.has(course.id)) {
          pushIssue(issues, `${path}.id`, "duplicate_course_id", `\u8BFE\u7A0B ID \u91CD\u590D\uFF1A${course.id}`);
        } else {
          courseIds.add(course.id);
        }
        if (!course.name || typeof course.name !== "string") {
          pushIssue(issues, `${path}.name`, "missing_course_name", "\u8BFE\u7A0B\u7F3A\u5C11\u540D\u79F0");
        }
        if (!Array.isArray(course.meetings) || course.meetings.length === 0) {
          pushIssue(issues, `${path}.meetings`, "missing_meetings", "\u8BFE\u7A0B\u6CA1\u6709\u4E0A\u8BFE\u5B9E\u4F8B");
          continue;
        }
        for (const [meetingIndex, meeting] of course.meetings.entries()) {
          meetingCount += 1;
          const meetingPath = `${path}.meetings[${meetingIndex}]`;
          if (!meeting.id || typeof meeting.id !== "string") {
            pushIssue(issues, `${meetingPath}.id`, "missing_meeting_id", "\u4E0A\u8BFE\u5B9E\u4F8B\u7F3A\u5C11\u7A33\u5B9A ID");
          } else if (meetingIds.has(meeting.id)) {
            pushIssue(issues, `${meetingPath}.id`, "duplicate_meeting_id", `\u4E0A\u8BFE\u5B9E\u4F8B ID \u91CD\u590D\uFF1A${meeting.id}`);
          } else {
            meetingIds.add(meeting.id);
          }
          if (!Number.isInteger(meeting.weekday) || meeting.weekday < 1 || meeting.weekday > 7) {
            pushIssue(issues, `${meetingPath}.weekday`, "invalid_weekday", "\u661F\u671F\u5FC5\u987B\u4E3A 1\u20137");
          }
          if (!Number.isInteger(meeting.startPeriod) || !Number.isInteger(meeting.endPeriod) || meeting.startPeriod < 1 || meeting.endPeriod < meeting.startPeriod) {
            pushIssue(issues, `${meetingPath}.periods`, "invalid_periods", "\u8282\u6B21\u8303\u56F4\u65E0\u6548");
          }
          if (!Array.isArray(meeting.weeks) || meeting.weeks.length === 0) {
            missingPeriods += 1;
            pushIssue(issues, `${meetingPath}.weeks`, "missing_weeks", "\u4E0A\u8BFE\u5B9E\u4F8B\u6CA1\u6709\u5468\u6B21");
          } else if (meeting.weeks.some((week) => !Number.isInteger(week) || week < 1)) {
            unknownWeekRules += 1;
            pushIssue(issues, `${meetingPath}.weeks`, "invalid_weeks", "\u5468\u6B21\u5FC5\u987B\u662F\u6B63\u6574\u6570");
          }
          if (!meeting.teacher) missingTeacher += 1;
          if (!meeting.room) missingRoom += 1;
        }
      }
    }
    if (missingTeacher > 0) warnings.push({ path: "$.courses", code: "missing_teacher", message: `${missingTeacher} \u4E2A\u4E0A\u8BFE\u5B9E\u4F8B\u7F3A\u5C11\u6559\u5E08` });
    if (missingRoom > 0) warnings.push({ path: "$.courses", code: "missing_room", message: `${missingRoom} \u4E2A\u4E0A\u8BFE\u5B9E\u4F8B\u7F3A\u5C11\u6559\u5BA4` });
    const checks = [
      { id: "schema", status: issues.some((issue) => issue.code === "unsupported_schema") ? "fail" : "pass", message: "\u6570\u636E Schema" },
      { id: "term", status: issues.some((issue) => issue.code.includes("date") || issue.code === "not_monday") ? "fail" : "pass", message: "\u5B66\u671F\u4E0A\u4E0B\u6587" },
      { id: "courses", status: (timetable.courses?.length ?? 0) > 0 ? "pass" : "fail", message: "\u8BFE\u7A0B\u6570\u91CF" },
      { id: "ids", status: issues.some((issue) => issue.code.includes("id")) ? "fail" : "pass", message: "\u7A33\u5B9A ID" },
      { id: "periods", status: issues.some((issue) => issue.code.includes("period")) ? "fail" : "pass", message: "\u8282\u6B21\u6570\u636E" },
      {
        id: "adjustments",
        status: Array.isArray(timetable.overrides) && timetable.overrides.length > 0 ? "pass" : "warn",
        message: "\u8C03\u8BFE\u6570\u636E\u662F\u5426\u53EF\u83B7\u5F97"
      }
    ];
    const report = {
      status: issues.length > 0 ? "failed" : warnings.length > 0 ? "partial" : "verified",
      checks,
      completeness: {
        courseCount: timetable.courses?.length ?? 0,
        meetingCount,
        missingTeacher,
        missingRoom,
        missingPeriods,
        unknownWeekRules,
        adjustmentDataAvailable: Array.isArray(timetable.overrides) && timetable.overrides.length > 0
      }
    };
    return { valid: issues.length === 0, issues, warnings, report };
  }
  function findForbiddenKeys(value, path = "$") {
    const forbidden = /^(password|passwd|cookie|cookies|access_?token|refresh_?token|session_?token|csrf|xsrf|authorization|credential|credentials)$/i;
    const found = [];
    if (Array.isArray(value)) {
      value.forEach((item, index) => found.push(...findForbiddenKeys(item, `${path}[${index}]`)));
    } else if (value && typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        if (forbidden.test(key)) found.push(`${path}.${key}`);
        found.push(...findForbiddenKeys(nested, `${path}.${key}`));
      }
    }
    return found;
  }
  function emptyResult(issues, warnings) {
    return {
      valid: false,
      issues,
      warnings,
      report: {
        status: "failed",
        checks: [{ id: "schema", status: "fail", message: "\u8F93\u5165\u4E0D\u662F\u5BF9\u8C61" }],
        completeness: {
          courseCount: 0,
          meetingCount: 0,
          missingTeacher: 0,
          missingRoom: 0,
          missingPeriods: 0,
          unknownWeekRules: 0,
          adjustmentDataAvailable: false
        }
      }
    };
  }

  // src/v2/convert.ts
  async function rawCoursesToV2(parsed, options) {
    const semesterStart = normalizeSemesterStart(options.semesterStart);
    const periodSource = options.periods ?? DEFAULT_PERIODS;
    const schedule = {
      id: `periods-${semesterStart}`,
      label: "\u5B66\u671F\u9ED8\u8BA4\u4F5C\u606F",
      effectiveFrom: semesterStart,
      periods: periodSource.map((period) => ({ ...period }))
    };
    const groups = /* @__PURE__ */ new Map();
    parsed.courses.forEach((course, index) => {
      const groupKey = course.sourceRef?.trim() || `row:${index + 1}`;
      const existing = groups.get(groupKey) ?? [];
      existing.push(course);
      groups.set(groupKey, existing);
    });
    const courses = [];
    let groupIndex = 0;
    for (const [sourceRef, group] of groups) {
      groupIndex += 1;
      const first = group[0];
      if (!first) continue;
      const courseId = await makeCourseId({
        adapterId: options.adapterId,
        sourceRef,
        fallbackOrdinal: groupIndex
      });
      const meetings = [];
      for (const raw of group) {
        const meetingId = await makeMeetingId({
          courseId,
          sourceMeetingId: raw.sourceRef ? `${raw.sourceRef}|${raw.weekday}|${raw.startPeriod}|${raw.endPeriod}` : void 0,
          weekday: raw.weekday,
          startPeriod: raw.startPeriod,
          endPeriod: raw.endPeriod,
          weeks: raw.weeks
        });
        meetings.push({
          id: meetingId,
          teacher: raw.teacher,
          room: raw.location,
          weekday: raw.weekday,
          startPeriod: raw.startPeriod,
          endPeriod: raw.endPeriod,
          weeks: [...raw.weeks],
          weekRule: raw.weekRule,
          note: raw.note,
          source: {
            adapterId: options.adapterId,
            adapterVersion: options.adapterVersion,
            sourceRef
          }
        });
      }
      courses.push({
        id: courseId,
        name: first.name,
        source: {
          adapterId: options.adapterId,
          adapterVersion: options.adapterVersion,
          sourceRef
        },
        meetings
      });
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const term = {
      termId: `file:${semesterStart}`,
      academicYear: inferAcademicYear(semesterStart),
      termCode: "custom",
      termName: options.title,
      semesterStart,
      teachingWeeks: options.teachingWeeks ?? Math.max(1, ...parsed.courses.flatMap((course) => course.weeks)),
      timezone: options.timezone ?? "Asia/Shanghai",
      periodSchedules: [schedule]
    };
    const metadata = {
      extractedAt: now,
      sourceKind: options.sourceKind,
      method: "file",
      sourceUrl: options.sourceUrl ? sanitizeSourceUrl(options.sourceUrl) : void 0,
      rawCount: parsed.courses.length,
      parsedCount: courses.reduce((sum, course) => sum + course.meetings.length, 0),
      skippedCount: 0,
      adapterId: options.adapterId,
      adapterVersion: options.adapterVersion,
      schoolId: options.schoolId,
      schoolName: options.schoolName,
      platform: parsed.formatLabel
    };
    const draft = {
      schemaVersion: "2.0",
      source: {
        kind: options.sourceKind,
        adapterId: options.adapterId,
        adapterVersion: options.adapterVersion,
        schoolId: options.schoolId,
        schoolName: options.schoolName,
        platform: parsed.formatLabel,
        sourceUrl: metadata.sourceUrl,
        extractedAt: now
      },
      term,
      courses,
      overrides: [],
      metadata,
      validation: {
        status: "partial",
        checks: [],
        completeness: {
          courseCount: 0,
          meetingCount: 0,
          missingTeacher: 0,
          missingRoom: 0,
          missingPeriods: 0,
          unknownWeekRules: 0,
          adjustmentDataAvailable: false
        }
      }
    };
    draft.validation = validateTimetableV2(draft);
    return draft;
  }
  function inferAcademicYear(semesterStart) {
    const year = Number(semesterStart.slice(0, 4));
    const month = Number(semesterStart.slice(5, 7));
    const start = month < 7 ? year - 1 : year;
    return `${start}-${start + 1}`;
  }

  // src/v2/types.ts
  var EXCHANGE_SCHEMA_VERSION = "2.0";

  // src/connectors/sdk/normalize.ts
  function finalizeConnectorExtraction(extraction, descriptor4, semester, options) {
    const draft = extraction.draft;
    const authoritativeTerm = draft.termSource === "adapter";
    const semesterStart = authoritativeTerm ? draft.term.semesterStart : semester.semesterStart;
    if (!isMonday(semesterStart)) {
      throw new Error("\u5B66\u671F\u5F00\u59CB\u65E5\u671F\u5FC5\u987B\u662F\u7B2C 1 \u5468\u5468\u4E00");
    }
    const periodSchedules = draft.term.periodSchedules && draft.term.periodSchedules.length > 0 ? draft.term.periodSchedules : [
      {
        id: `periods-${semesterStart}`,
        label: "\u7528\u6237\u786E\u8BA4\u7684\u9ED8\u8BA4\u4F5C\u606F",
        effectiveFrom: semesterStart,
        periods: (options.fallbackPeriods ?? DEFAULT_PERIODS).map((period) => ({ ...period }))
      }
    ];
    const maxWeek = Math.max(1, ...draft.courses.flatMap((course) => course.meetings.flatMap((meeting) => meeting.weeks)));
    const now = options.extractedAt ?? (/* @__PURE__ */ new Date()).toISOString();
    const sourceUrl = options.sourceUrl ? sanitizeSourceUrl(options.sourceUrl) : void 0;
    const timetable = {
      schemaVersion: EXCHANGE_SCHEMA_VERSION,
      source: {
        kind: options.sourceKind,
        adapterId: descriptor4.id,
        adapterVersion: descriptor4.version,
        schoolId: descriptor4.schoolId,
        schoolName: descriptor4.schoolName,
        platform: descriptor4.vendorLabel,
        sourceUrl,
        extractedAt: now
      },
      term: {
        ...draft.term,
        academicYear: authoritativeTerm ? draft.term.academicYear : semester.academicYear ?? draft.term.academicYear ?? inferAcademicYear(semesterStart),
        termCode: draft.term.termCode && draft.term.termCode !== "unknown" ? draft.term.termCode : semester.termCode ?? "unknown",
        termName: authoritativeTerm ? draft.term.termName : semester.termName || draft.term.termName,
        semesterStart,
        teachingWeeks: authoritativeTerm ? draft.term.teachingWeeks ?? maxWeek : semester.teachingWeeks ?? draft.term.teachingWeeks ?? maxWeek,
        timezone: authoritativeTerm ? draft.term.timezone : semester.timezone ?? draft.term.timezone ?? "Asia/Shanghai",
        campus: authoritativeTerm ? draft.term.campus ?? semester.campus : semester.campus ?? draft.term.campus,
        periodSchedules
      },
      courses: draft.courses,
      overrides: draft.overrides,
      metadata: {
        ...draft.metadata,
        extractedAt: now,
        sourceKind: options.sourceKind,
        sourceUrl,
        rawCount: extraction.rawRows,
        parsedCount: extraction.parsedRows,
        skippedCount: extraction.skippedRows,
        adapterId: descriptor4.id,
        adapterVersion: descriptor4.version,
        schoolId: descriptor4.schoolId,
        schoolName: descriptor4.schoolName,
        platform: descriptor4.vendorLabel
      },
      warnings: [...draft.warnings],
      validation: {
        status: "partial",
        checks: [],
        completeness: {
          courseCount: 0,
          meetingCount: 0,
          missingTeacher: 0,
          missingRoom: 0,
          missingPeriods: 0,
          unknownWeekRules: 0,
          adjustmentDataAvailable: false
        }
      }
    };
    timetable.validation = validateTimetableV2(timetable);
    return timetable;
  }

  // src/connectors/schools/whut.ts
  var WHUT_PROFILE = {
    id: "whut",
    name: "\u6B66\u6C49\u7406\u5DE5\u5927\u5B66",
    vendor: "wisedu",
    platformVersion: "jwapp / wdkbby (2026 layout)",
    entryUrl: "https://jwxt.whut.edu.cn/jwapp/sys/homeapp/index.do?forceCas=1",
    domains: ["jwxt.whut.edu.cn", "zhlgd.whut.edu.cn"],
    status: "verified",
    capabilities: ["timetable", "semester", "periods", "classroom"],
    methods: ["api"],
    lastVerifiedAt: "2026-11-06",
    evidenceUrls: [
      "https://github.com/lingion/sleepy/blob/main/app/src/main/java/com/lingion/sleepy/data/jw/JwWhutParser.kt",
      "https://github.com/lingion/sleepy/blob/main/docs/schools-list.md"
    ],
    limitations: [
      "Verified for the 2026-2027-1 student context on 2026-11-06; later WHUT variants require revalidation.",
      "The observed response had empty notArrangeList and practiceList collections; their non-empty semantics are not yet verified.",
      "No dedicated WHUT adjustment endpoint was found; cancellation/reschedule data is not auto-generated without explicit records."
    ]
  };

  // src/connectors/sdk/http.ts
  var ConnectorHttpError = class extends Error {
    status;
    url;
    constructor(message, status, url) {
      super(message);
      this.name = "ConnectorHttpError";
      this.status = status;
      this.url = url;
    }
  };
  async function request(fetchImpl, url, init, timeoutMs = 15e3) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { ...init, signal: controller.signal, credentials: "include" });
    } catch (error) {
      throw new ConnectorHttpError(
        `\u53EA\u8BFB\u8BF7\u6C42\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`,
        0,
        url
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  async function fetchJson(url, init = {}, fetchImpl = globalThis.fetch) {
    const response = await request(fetchImpl, url, {
      ...init,
      headers: {
        Accept: "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
        ...init.headers ?? {}
      }
    });
    if (!response.ok) {
      throw new ConnectorHttpError(`\u6559\u52A1\u53EA\u8BFB\u63A5\u53E3\u8FD4\u56DE HTTP ${response.status}`, response.status, url);
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new ConnectorHttpError("\u6559\u52A1\u63A5\u53E3\u672A\u8FD4\u56DE JSON\uFF0C\u53EF\u80FD\u767B\u5F55\u6001\u5DF2\u5931\u6548\u6216\u9875\u9762\u7ED3\u6784\u5DF2\u53D8\u5316", response.status, url);
    }
  }
  async function postForm(url, body, fetchImpl = globalThis.fetch) {
    return fetchJson(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
      },
      body: new URLSearchParams(body).toString()
    }, fetchImpl);
  }
  function postFormText(url, body = "", fetchImpl = globalThis.fetch) {
    return fetchJson(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
      },
      body
    }, fetchImpl);
  }

  // src/connectors/schools/whut-adapter.ts
  var WHUT_API = "/jwapp/sys/homeapp/api/home";
  var CURRENT_USER_URL = `${WHUT_API}/currentUser.do`;
  var SECTIONS_URL = `${WHUT_API}/student/getSections.do`;
  var SCHEDULE_URL = `${WHUT_API}/student/getMyScheduleDetail.do`;
  var EXPECTED_WEEK_PERIODS = 13;
  var WhutConnectorError = class extends Error {
    code;
    constructor(code, message) {
      super(message);
      this.name = "WhutConnectorError";
      this.code = code;
    }
  };
  function str(value) {
    return value === null || value === void 0 ? "" : String(value).trim();
  }
  function integer(value) {
    const parsed = Number(str(value));
    return Number.isInteger(parsed) ? parsed : null;
  }
  function assertSuccess(response, operation) {
    if (String(response.code) !== "0") {
      throw new WhutConnectorError(
        "invalid_api_response",
        `${operation}\u5931\u8D25\uFF1A${response.msg || `code=${str(response.code) || "missing"}`}`
      );
    }
    return response.datas;
  }
  function mapRequestError(error, operation) {
    if (error instanceof WhutConnectorError) throw error;
    if (error instanceof ConnectorHttpError) {
      if (error.status === 401 || error.status === 403 || /未返回 JSON/.test(error.message)) {
        throw new WhutConnectorError("login_expired", `${operation}\u5931\u8D25\uFF1A\u767B\u5F55\u72B6\u6001\u53EF\u80FD\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u5728\u5F53\u524D\u6D4F\u89C8\u5668\u91CD\u65B0\u767B\u5F55`);
      }
      throw new WhutConnectorError("current_user_unavailable", `${operation}\u5931\u8D25\uFF1A${error.message}`);
    }
    throw new WhutConnectorError(
      "invalid_api_response",
      `${operation}\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`
    );
  }
  function parseWhutTermCode(value) {
    const match = value.trim().match(/^(\d{4})-(\d{4})-([1-3])$/);
    if (!match) return null;
    const startYear = Number(match[1]);
    const endYear = Number(match[2]);
    const termCode = match[3] ?? "1";
    const ordinal = termCode === "1" ? "\u4E00" : termCode === "2" ? "\u4E8C" : "\u4E09";
    return {
      termId: value.trim(),
      academicYear: `${match[1]}-${match[2]}`,
      termCode,
      startYear,
      endYear,
      termName: `${match[1]}-${match[2]} \u7B2C${ordinal}\u5B66\u671F`
    };
  }
  function chineseWeekday(value) {
    const index = "\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u65E5\u5929".indexOf(value);
    if (index < 0) return null;
    return index === 7 ? 7 : index + 1;
  }
  function resolveWhutDisplayDate(raw, termCode, now) {
    const full = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:\s*星期([一二三四五六日天]))?$/);
    if (full) {
      const value = `${full[1]}-${full[2]}-${full[3]}`;
      const date = parseIsoDate(value);
      const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
      if (full[4] && chineseWeekday(full[4]) !== weekday) {
        throw new WhutConnectorError("term_unavailable", `currentUser \u65E5\u671F\u661F\u671F\u4E0D\u4E00\u81F4\uFF1A${raw}`);
      }
      return { date: value, weekday };
    }
    const match = raw.match(/(\d{1,2})月(\d{1,2})日.*?星期([一二三四五六日天])/);
    if (!match) {
      throw new WhutConnectorError("term_unavailable", `currentUser \u672A\u8FD4\u56DE\u53EF\u89E3\u6790\u7684\u6559\u5B66\u65E5\u671F\uFF1A${raw || "\u7A7A\u503C"}`);
    }
    const month = Number(match[1]);
    const day = Number(match[2]);
    const expectedWeekday = chineseWeekday(match[3] ?? "");
    if (expectedWeekday === null) {
      throw new WhutConnectorError("term_unavailable", `currentUser \u65E5\u671F\u7F3A\u5C11\u6709\u6548\u661F\u671F\uFF1A${raw}`);
    }
    const term = parseWhutTermCode(termCode);
    const nowYear = now.getFullYear();
    const candidates = [...new Set([
      term?.startYear,
      term?.endYear,
      nowYear - 1,
      nowYear,
      nowYear + 1
    ].filter((year) => Number.isInteger(year)))];
    const valid = candidates.map((year) => {
      const value = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      try {
        const date = parseIsoDate(value);
        const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
        return { value, weekday, distance: Math.abs(date.getTime() - now.getTime()) };
      } catch {
        return null;
      }
    }).filter((item) => item !== null).filter((item) => item.weekday === expectedWeekday).sort((left, right) => left.distance - right.distance);
    const selected = valid[0];
    if (!selected) {
      throw new WhutConnectorError("term_unavailable", `\u65E0\u6CD5\u4E3A\u7F3A\u5931\u5E74\u4EFD\u7684\u65E5\u671F\u5339\u914D\u661F\u671F\uFF1A${raw}`);
    }
    return { date: selected.value, weekday: selected.weekday };
  }
  function resolveWhutTermContext(currentUser, now) {
    const welcome = currentUser.welcomeInfo;
    if (!welcome) {
      throw new WhutConnectorError("term_unavailable", "currentUser.do \u672A\u8FD4\u56DE welcomeInfo\uFF0C\u65E0\u6CD5\u786E\u5B9A\u5F53\u524D\u5B66\u671F");
    }
    const termRaw = str(welcome.xnxqdm);
    const term = parseWhutTermCode(termRaw);
    if (!term) {
      throw new WhutConnectorError("term_unavailable", `\u65E0\u6CD5\u8BC6\u522B\u5F53\u524D\u5B66\u671F\u4EE3\u7801\uFF1A${termRaw || "\u7A7A\u503C"}`);
    }
    const currentWeek = integer(welcome.classWeek);
    if (currentWeek === null || currentWeek < 1) {
      throw new WhutConnectorError("term_unavailable", `\u5F53\u524D\u6559\u5B66\u5468\u65E0\u6548\uFF1A${str(welcome.classWeek) || "\u7A7A\u503C"}`);
    }
    const displayDate = resolveWhutDisplayDate(str(welcome.date), termRaw, now);
    const firstTeachingMonday = addDaysIso(
      displayDate.date,
      -((currentWeek - 1) * 7 + (displayDate.weekday - 1))
    );
    if (!isMonday(firstTeachingMonday)) {
      throw new WhutConnectorError("term_unavailable", `\u63A8\u5BFC\u51FA\u7684\u7B2C 1 \u5468\u5468\u4E00\u4E0D\u662F\u5468\u4E00\uFF1A${firstTeachingMonday}`);
    }
    const warnings = [];
    const termName = str(welcome.xnxqmc) || term.termName;
    return {
      termId: term.termId,
      academicYear: term.academicYear,
      termCode: term.termCode,
      termName,
      currentWeek,
      currentDate: displayDate.date,
      currentWeekday: displayDate.weekday,
      firstTeachingMonday,
      timezone: "Asia/Shanghai",
      weekStartsOn: 1,
      warnings
    };
  }
  function formatWeekRanges(weeks) {
    const sorted = [...new Set(weeks)].sort((left, right) => left - right);
    if (sorted.length === 0) return "";
    const ranges = [];
    let start = sorted[0];
    let end = start;
    for (const week of sorted.slice(1)) {
      if (week === end + 1) {
        end = week;
      } else {
        ranges.push(start === end ? String(start) : `${start}-${end}`);
        start = week;
        end = week;
      }
    }
    ranges.push(start === end ? String(start) : `${start}-${end}`);
    return ranges.join(",");
  }
  function parseWhutWeekBitmap(value) {
    const bitmap = str(value);
    if (!bitmap) {
      return { weeks: [], weekRule: "", error: "\u5468\u6B21\u4F4D\u56FE\u4E3A\u7A7A" };
    }
    if (!/^[01]+$/.test(bitmap)) {
      return { weeks: [], weekRule: "", error: `\u5468\u6B21\u4F4D\u56FE\u5305\u542B\u975E 0/1 \u5B57\u7B26\uFF1A${bitmap}` };
    }
    const weeks = Array.from(bitmap).map((character, index) => character === "1" ? index + 1 : 0).filter((week) => week > 0);
    if (weeks.length === 0) {
      return { weeks: [], weekRule: "", error: "\u5468\u6B21\u4F4D\u56FE\u672A\u6807\u8BB0\u4EFB\u4F55\u6559\u5B66\u5468" };
    }
    return { weeks, weekRule: formatWeekRanges(weeks) };
  }
  function parseWhutSections(response, termCode, campusCode, effectiveFrom) {
    const rows = assertSuccess(response, "getSections.do");
    if (!Array.isArray(rows)) {
      throw new WhutConnectorError("invalid_api_response", "getSections.do \u7684 datas \u4E0D\u662F\u6570\u7EC4");
    }
    const warnings = [];
    const periods = [];
    const seen = /* @__PURE__ */ new Set();
    for (const [index, row] of rows.entries()) {
      if (row.enable === false) continue;
      const periodIndex = integer(row.code);
      if (periodIndex === null || periodIndex < 1) {
        warnings.push(`getSections.do \u7B2C ${index + 1} \u6761\u8282\u6B21\u7F3A\u5C11\u6709\u6548 code\uFF0C\u5DF2\u5FFD\u7565`);
        continue;
      }
      if (seen.has(periodIndex)) {
        warnings.push(`getSections.do \u8282\u6B21 ${periodIndex} \u91CD\u590D\uFF0C\u4FDD\u7559\u9996\u6761\u6709\u6548\u8BB0\u5F55`);
        continue;
      }
      const start = str(row.startTime);
      const end = str(row.endTime);
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(end)) {
        warnings.push(`getSections.do \u7B2C ${periodIndex} \u8282\u65F6\u95F4\u65E0\u6548\uFF1A${start || "\u7A7A"}\u2013${end || "\u7A7A"}`);
        continue;
      }
      seen.add(periodIndex);
      periods.push({ index: periodIndex, start, end, label: str(row.name) || `\u7B2C${periodIndex}\u8282` });
    }
    periods.sort((left, right) => left.index - right.index);
    if (periods.length === 0) {
      throw new WhutConnectorError("missing_period_schedule", "getSections.do \u672A\u8FD4\u56DE\u53EF\u7528\u8282\u6B21\u65F6\u95F4");
    }
    for (let index = 1; index <= EXPECTED_WEEK_PERIODS; index += 1) {
      if (!seen.has(index)) warnings.push(`getSections.do \u7F3A\u5C11\u7B2C ${index} \u8282`);
    }
    return {
      schedule: {
        id: `whut-periods-${termCode}-${campusCode || "all"}`,
        label: "WHUT getSections.do \u5B9E\u9645\u4F5C\u606F",
        effectiveFrom,
        periods
      },
      warnings
    };
  }
  function inferCampus(room) {
    const first = room.split("-")[0]?.trim();
    return first && first !== room && /(?:校区|区|院)$/.test(first) ? first : void 0;
  }
  function roomFromDetails(row) {
    const direct = str(row.placeName);
    if (direct) return direct;
    const detail = str(row.cellDetail?.[3]?.text || row.titleDetail?.[3]);
    const parts = detail.split(",");
    return parts.length >= 3 ? parts.slice(2).join(",").trim() : "";
  }
  function teacherFromDetails(row) {
    return str(row.titleDetail?.[1]) || str(row.weeksAndTeachers) || str(row.cellDetail?.[2]?.text);
  }
  async function normalizeWhutScheduleDetail(data, descriptor4, term, schedule) {
    const collections = {
      arrangedList: Array.isArray(data.arrangedList) ? data.arrangedList : [],
      notArrangeList: Array.isArray(data.notArrangeList) ? data.notArrangeList : [],
      practiceList: Array.isArray(data.practiceList) ? data.practiceList : []
    };
    const warnings = [];
    if (!Array.isArray(data.arrangedList)) warnings.push("getMyScheduleDetail.do \u7F3A\u5C11 arrangedList \u6570\u7EC4");
    if (!Array.isArray(data.notArrangeList)) warnings.push("getMyScheduleDetail.do \u7F3A\u5C11 notArrangeList \u6570\u7EC4");
    if (!Array.isArray(data.practiceList)) warnings.push("getMyScheduleDetail.do \u7F3A\u5C11 practiceList \u6570\u7EC4");
    const periodIndexes = new Set(schedule.periods.map((period) => period.index));
    const coursesByKey = /* @__PURE__ */ new Map();
    const meetingIds = /* @__PURE__ */ new Set();
    let parsedRows = 0;
    let skippedRows = 0;
    for (const [collectionName, rows] of Object.entries(collections)) {
      if (rows.length === 0) continue;
      let collectionParsed = 0;
      for (const [index, row] of rows.entries()) {
        const name = str(row.courseName) || str(row.titleDetail?.[0]);
        const weekday = integer(row.dayOfWeek);
        const startPeriod = integer(row.beginSection);
        const endPeriod = integer(row.endSection) ?? startPeriod;
        if (!name) {
          warnings.push(`${collectionName} \u7B2C ${index + 1} \u6761\u7F3A\u5C11\u8BFE\u7A0B\u540D\u79F0\uFF0C\u5DF2\u8DF3\u8FC7`);
          skippedRows += 1;
          continue;
        }
        if (weekday === null || weekday < 1 || weekday > 7) {
          warnings.push(`${collectionName} \u7B2C ${index + 1} \u6761\u8BFE\u7A0B ${name} \u7684\u661F\u671F\u65E0\u6548\uFF0C\u5DF2\u4FDD\u7559\u4E3A\u672A\u6392\u8BFE\u8B66\u544A`);
          skippedRows += 1;
          continue;
        }
        if (startPeriod === null || endPeriod === null || startPeriod < 1 || endPeriod < startPeriod) {
          warnings.push(`${collectionName} \u7B2C ${index + 1} \u6761\u8BFE\u7A0B ${name} \u7684\u8282\u6B21\u8303\u56F4\u65E0\u6548\uFF0C\u5DF2\u4FDD\u7559\u4E3A\u672A\u6392\u8BFE\u8B66\u544A`);
          skippedRows += 1;
          continue;
        }
        if (!periodIndexes.has(startPeriod) || !periodIndexes.has(endPeriod)) {
          warnings.push(
            `${collectionName} \u7B2C ${index + 1} \u6761\u8BFE\u7A0B ${name} \u5F15\u7528\u4E86 getSections.do \u4E2D\u4E0D\u5B58\u5728\u7684\u8282\u6B21 ${startPeriod}-${endPeriod}\uFF0C\u5DF2\u8DF3\u8FC7`
          );
          skippedRows += 1;
          continue;
        }
        const weekResult = parseWhutWeekBitmap(row.week);
        if (weekResult.error) {
          warnings.push(`${collectionName} \u7B2C ${index + 1} \u6761\u8BFE\u7A0B ${name}\uFF1A${weekResult.error}`);
          skippedRows += 1;
          continue;
        }
        const courseCode = str(row.courseCode);
        const teachClassId = str(row.teachClassId);
        const courseSerialNo = str(row.courseSerialNo);
        const sourceCourseId = [courseCode, teachClassId].filter(Boolean).join("|");
        if (!sourceCourseId) {
          warnings.push(`${collectionName} \u7B2C ${index + 1} \u6761\u8BFE\u7A0B ${name} \u7F3A\u5C11 courseCode/teachClassId\uFF0C\u65E0\u6CD5\u751F\u6210\u7A33\u5B9A\u8BFE\u7A0B ID\uFF0C\u5DF2\u8DF3\u8FC7`);
          skippedRows += 1;
          continue;
        }
        const courseId = await makeCourseId({
          adapterId: descriptor4.id,
          sourceCourseId,
          sourceRef: courseSerialNo || `${collectionName}:${index + 1}`,
          fallbackOrdinal: parsedRows + skippedRows + 1
        });
        const sourceMeetingId = [
          courseCode,
          teachClassId,
          courseSerialNo,
          weekday,
          startPeriod,
          endPeriod,
          str(row.week)
        ].join("|");
        const meetingId = await makeMeetingId({
          courseId,
          sourceMeetingId,
          weekday,
          startPeriod,
          endPeriod,
          weeks: weekResult.weeks
        });
        if (meetingIds.has(meetingId)) {
          warnings.push(`${collectionName} \u7B2C ${index + 1} \u6761\u8BFE\u7A0B ${name} \u4E0E\u5176\u4ED6\u8BB0\u5F55\u751F\u6210\u76F8\u540C meeting ID\uFF0C\u5DF2\u8DF3\u8FC7\u91CD\u590D\u8BB0\u5F55`);
          skippedRows += 1;
          continue;
        }
        meetingIds.add(meetingId);
        const room = roomFromDetails(row);
        const teacher = teacherFromDetails(row);
        const meeting = {
          id: meetingId,
          teacher,
          room,
          campus: inferCampus(room),
          weekday,
          startPeriod,
          endPeriod,
          weeks: weekResult.weeks,
          weekRule: weekResult.weekRule,
          note: collectionName === "practiceList" ? "\u5B9E\u8DF5\u8BFE\u8BB0\u5F55" : void 0,
          source: {
            adapterId: descriptor4.id,
            adapterVersion: descriptor4.version,
            schoolId: descriptor4.schoolId,
            sourceCourseId,
            sourceRef: courseSerialNo || `${collectionName}:${index + 1}`
          }
        };
        const existing = coursesByKey.get(courseId);
        if (existing) {
          existing.meetings.push(meeting);
        } else {
          const credits = Number(str(row.credit));
          coursesByKey.set(courseId, {
            id: courseId,
            name,
            credits: Number.isFinite(credits) && credits > 0 ? credits : void 0,
            teachingClass: str(row.teachClassName) || str(row.titleDetail?.[2]),
            source: {
              adapterId: descriptor4.id,
              adapterVersion: descriptor4.version,
              schoolId: descriptor4.schoolId,
              sourceCourseId,
              sourceRef: courseSerialNo || `${collectionName}:${index + 1}`
            },
            meetings: [meeting]
          });
        }
        parsedRows += 1;
        collectionParsed += 1;
      }
      if (collectionName !== "arrangedList" && rows.length > 0 && collectionParsed === 0) {
        warnings.push(`${collectionName} \u5305\u542B ${rows.length} \u6761\u5F53\u524D\u65E0\u6CD5\u6392\u5165\u65E5\u5386\u7684\u8BB0\u5F55\uFF1B\u8BA1\u6570\u5DF2\u4FDD\u7559\uFF0C\u672A\u9759\u9ED8\u4E22\u5F03`);
      }
    }
    return {
      courses: [...coursesByKey.values()],
      warnings: [...term.warnings, ...warnings],
      parsedRows,
      skippedRows,
      rawCollectionCounts: {
        arrangedList: collections.arrangedList.length,
        notArrangeList: collections.notArrangeList.length,
        practiceList: collections.practiceList.length
      }
    };
  }
  function whutDescriptor() {
    return {
      id: "whut-wisedu-jwapp",
      version: "0.5.1",
      vendor: "wisedu",
      vendorLabel: "\u91D1\u667A Wisedu jwapp / WHUT",
      schoolId: WHUT_PROFILE.id,
      schoolName: WHUT_PROFILE.name,
      platformVersion: WHUT_PROFILE.platformVersion,
      status: WHUT_PROFILE.status,
      capabilities: WHUT_PROFILE.capabilities,
      verifiedDomains: WHUT_PROFILE.domains,
      methods: ["api"],
      lastVerifiedAt: WHUT_PROFILE.lastVerifiedAt,
      evidenceUrls: WHUT_PROFILE.evidenceUrls,
      limitations: WHUT_PROFILE.limitations
    };
  }
  function createWhutAdapter() {
    const descriptor4 = whutDescriptor();
    return {
      descriptor: descriptor4,
      async detect(context) {
        const host = context.url.hostname.toLowerCase();
        const path = context.url.pathname;
        const text = context.document.documentElement?.textContent ?? "";
        const evidence = [];
        if (host === "jwxt.whut.edu.cn" || host.endsWith(".whut.edu.cn")) evidence.push("whut.edu.cn \u57DF\u540D");
        if (path.includes("/jwapp/")) evidence.push("/jwapp/ \u8DEF\u5F84");
        if (text.includes("\u6211\u7684\u8BFE\u8868") || text.includes("\u6559\u5B66\u7BA1\u7406\u7CFB\u7EDF")) evidence.push("WHUT \u6559\u52A1\u9875\u9762\u7279\u5F81");
        const confidence = evidence.length >= 2 ? 0.99 : evidence.length === 1 ? 0.82 : 0;
        return {
          detected: confidence > 0,
          adapterId: descriptor4.id,
          schoolId: descriptor4.schoolId,
          confidence,
          vendor: descriptor4.vendor,
          evidence,
          reason: confidence > 0 ? void 0 : "\u672A\u53D1\u73B0\u6B66\u6C49\u7406\u5DE5 WHUT jwapp \u7279\u5F81"
        };
      },
      async extract(context, semester) {
        const origin = context.url.origin;
        let currentUser;
        try {
          currentUser = await fetchJson(
            `${origin}${CURRENT_USER_URL}`,
            { method: "GET", cache: "no-store" },
            context.fetchImpl
          );
        } catch (error) {
          mapRequestError(error, "currentUser.do");
        }
        const userData = assertSuccess(currentUser, "currentUser.do");
        if (!userData || typeof userData !== "object") {
          throw new WhutConnectorError("current_user_unavailable", "currentUser.do \u672A\u8FD4\u56DE\u7528\u6237\u6570\u636E");
        }
        const term = resolveWhutTermContext(userData, context.now());
        const campusCode = semester.campus ?? "";
        let sectionResponse;
        try {
          const sectionsUrl = new URL(`${origin}${SECTIONS_URL}`);
          sectionsUrl.searchParams.set("termCode", term.termId);
          sectionsUrl.searchParams.set("campusCode", campusCode);
          sectionResponse = await fetchJson(
            sectionsUrl.toString(),
            { method: "GET", cache: "no-store" },
            context.fetchImpl
          );
        } catch (error) {
          mapRequestError(error, "getSections.do");
        }
        const parsedSections = parseWhutSections(sectionResponse, term.termId, campusCode, term.firstTeachingMonday);
        const warnings = [...term.warnings, ...parsedSections.warnings];
        if (semester.semesterStart && semester.semesterStart !== term.firstTeachingMonday) {
          warnings.push(
            `\u754C\u9762\u586B\u5199\u7B2C 1 \u5468\u5468\u4E00\u4E3A ${semester.semesterStart}\uFF0C\u6559\u52A1 currentUser.do \u63A8\u5BFC\u4E3A ${term.firstTeachingMonday}\uFF1B\u5DF2\u91C7\u7528\u6559\u52A1\u503C\u3002`
          );
        }
        let detailResponse;
        try {
          detailResponse = await postForm(
            `${origin}${SCHEDULE_URL}`,
            {
              termCode: term.termId,
              campusCode,
              type: "week",
              week: String(term.currentWeek)
            },
            context.fetchImpl
          );
        } catch (error) {
          mapRequestError(error, "getMyScheduleDetail.do");
        }
        const scheduleData = assertSuccess(detailResponse, "getMyScheduleDetail.do");
        if (!scheduleData || typeof scheduleData !== "object") {
          throw new WhutConnectorError("invalid_api_response", "getMyScheduleDetail.do \u672A\u8FD4\u56DE\u8BFE\u8868\u6570\u636E");
        }
        const rawTotal = (scheduleData.arrangedList?.length ?? 0) + (scheduleData.notArrangeList?.length ?? 0) + (scheduleData.practiceList?.length ?? 0);
        if (rawTotal === 0) {
          throw new WhutConnectorError("empty_timetable", "\u6559\u52A1\u8FD4\u56DE\u7A7A\u8BFE\u8868\uFF1B\u5F53\u524D\u5B66\u671F\u6216\u5B66\u751F\u8BFE\u8868\u53EF\u80FD\u5C1A\u672A\u751F\u6210");
        }
        const normalized = await normalizeWhutScheduleDetail(
          scheduleData,
          descriptor4,
          term,
          parsedSections.schedule
        );
        if (normalized.courses.length === 0) {
          throw new WhutConnectorError(
            "partial_extraction",
            `\u6559\u52A1\u8FD4\u56DE ${rawTotal} \u6761\u8BB0\u5F55\uFF0C\u4F46\u6CA1\u6709\u53EF\u751F\u6210\u7684\u8BFE\u7A0B\u4E8B\u4EF6\u3002\u8BF7\u67E5\u770B\u89E3\u6790\u8B66\u544A\u5E76\u6838\u5BF9\u63A5\u53E3\u5B57\u6BB5\u3002`
          );
        }
        const maxWeek = Math.max(1, ...normalized.courses.flatMap((course) => course.meetings.flatMap((meeting) => meeting.weeks)));
        const draft = {
          descriptor: descriptor4,
          termSource: "adapter",
          term: {
            termId: term.termId,
            academicYear: term.academicYear,
            termCode: term.termCode,
            termName: term.termName,
            semesterStart: term.firstTeachingMonday,
            teachingWeeks: maxWeek,
            timezone: "Asia/Shanghai",
            campus: campusCode || void 0,
            periodSchedules: [parsedSections.schedule]
          },
          courses: normalized.courses,
          overrides: [],
          metadata: {
            method: "api",
            sourceUrl: `${context.url.origin}${context.url.pathname}`,
            rawCount: rawTotal,
            parsedCount: normalized.parsedRows,
            skippedCount: normalized.skippedRows,
            schoolId: descriptor4.schoolId,
            schoolName: descriptor4.schoolName,
            platform: descriptor4.vendorLabel,
            userNote: [
              `currentUser.do week=${term.currentWeek}`,
              `collections=${normalized.rawCollectionCounts.arrangedList}/${normalized.rawCollectionCounts.notArrangeList}/${normalized.rawCollectionCounts.practiceList}`,
              "\u53EA\u8BFB\u63D0\u53D6\uFF1B\u672A\u6301\u4E45\u5316 Cookie\u3001CSRF \u6216\u5B66\u53F7"
            ].join("; ")
          },
          warnings: [
            ...warnings,
            ...normalized.warnings,
            `getMyScheduleDetail.do: arrangedList=${normalized.rawCollectionCounts.arrangedList}, notArrangeList=${normalized.rawCollectionCounts.notArrangeList}, practiceList=${normalized.rawCollectionCounts.practiceList}`
          ]
        };
        return {
          draft,
          rawRows: rawTotal,
          parsedRows: normalized.parsedRows,
          skippedRows: normalized.skippedRows,
          evidence: [
            "GET currentUser.do",
            "GET getSections.do",
            "POST getMyScheduleDetail.do form: termCode,campusCode,type=week,week",
            `arrangedList=${normalized.rawCollectionCounts.arrangedList}`
          ]
        };
      },
      validate(timetable) {
        return validateTimetableV2(timetable);
      }
    };
  }

  // src/core/weeks.ts
  var WEEKDAY_MAP = {
    "\u4E00": 1,
    "\u4E8C": 2,
    "\u4E09": 3,
    "\u56DB": 4,
    "\u4E94": 5,
    "\u516D": 6,
    "\u65E5": 7,
    "\u5929": 7,
    "1": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7
  };
  var ENGLISH_WEEKDAYS = {
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
    sunday: 7,
    sun: 7
  };
  function normalizeText(value) {
    return String(value ?? "").normalize("NFKC").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim();
  }
  function parseWeeksDetailed(raw, maxWeek = DEFAULT_MAX_WEEK) {
    const original = normalizeText(raw);
    if (!original) {
      return { weeks: [], normalized: "", error: "\u5468\u6B21\u4E3A\u7A7A" };
    }
    const sanitized = original.replace(/\[[^\]]*节[^\]]*\]/gi, " ").replace(/周次|教学周|第/gi, " ").replace(/[（(]\s*周\s*[）)]/gi, " ").replace(/[（()）\[\]{}]/g, " ").replace(/周/g, " ").replace(/[~～]/g, "-").replace(/[—–－]/g, "-").replace(/[、，；;]/g, ",").replace(/\s+/g, "");
    if (!sanitized) {
      return { weeks: [], normalized: sanitized, error: `\u65E0\u6CD5\u8BC6\u522B\u5468\u6B21\uFF1A${original}` };
    }
    const tokens = sanitized.split(",").map((token) => token.trim()).filter(Boolean);
    const weeks = /* @__PURE__ */ new Set();
    const normalizedParts = [];
    for (const token of tokens) {
      const parityMatch = token.match(/(单|双)/);
      const parity = parityMatch?.[1] ?? "";
      const withoutParity = token.replace(/[单双]/g, "").replace(/^[-至]+|[-至]+$/g, "");
      const range = withoutParity.match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
      if (!range) {
        return { weeks: [], normalized: sanitized, error: `\u65E0\u6CD5\u8BC6\u522B\u5468\u6B21\u7247\u6BB5\uFF1A${token}` };
      }
      const start = Number(range[1]);
      const end = Number(range[2] ?? range[1]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
        return { weeks: [], normalized: sanitized, error: `\u5468\u6B21\u8303\u56F4\u65E0\u6548\uFF1A${token}` };
      }
      if (end > maxWeek) {
        return {
          weeks: [],
          normalized: sanitized,
          error: `\u5468\u6B21 ${end} \u8D85\u51FA\u652F\u6301\u4E0A\u9650 ${maxWeek}\uFF1B\u5982\u5B66\u671F\u66F4\u957F\u8BF7\u62C6\u5206\u8BFE\u8868`
        };
      }
      for (let week = start; week <= end; week += 1) {
        if (parity === "\u5355" && week % 2 === 0) continue;
        if (parity === "\u53CC" && week % 2 !== 0) continue;
        weeks.add(week);
      }
      normalizedParts.push(`${withoutParity}${parity}`);
    }
    const result = [...weeks].sort((a, b) => a - b);
    if (result.length === 0) {
      return { weeks: [], normalized: normalizedParts.join(","), error: `\u5468\u6B21\u7B5B\u9009\u540E\u4E3A\u7A7A\uFF1A${original}` };
    }
    return { weeks: result, normalized: normalizedParts.join(",") };
  }
  function extractWeekRule(text) {
    const normalized = normalizeText(text);
    const sequence = String.raw`\d{1,2}(?:\s*[-~～—–－至]\s*\d{1,2})?(?:\s*[,，、]\s*\d{1,2}(?:\s*[-~～—–－至]\s*\d{1,2})?)*`;
    const patterns = [
      new RegExp(
        String.raw`(?:第\s*)?${sequence}\s*(?:[（(]\s*周\s*[）)]|周)\s*(?:[（(]?\s*(?:单|双)\s*[）)]?\s*周?)?`,
        "i"
      ),
      new RegExp(
        String.raw`(?:第\s*)?${sequence}\s*(?:单|双)\s*周?`,
        "i"
      )
    ];
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match?.index !== void 0 && match[0]) {
        return { rule: match[0].trim(), index: match.index, length: match[0].length };
      }
    }
    return void 0;
  }
  function parsePeriodRange(raw) {
    const normalized = normalizeText(raw);
    if (!normalized) return null;
    const bracketed = normalized.match(/\[\s*(\d{1,2})(?:\s*[-~～—–－至]\s*(\d{1,2}))?\s*节?\s*\]/);
    if (bracketed) {
      const start = Number(bracketed[1]);
      const end = Number(bracketed[2] ?? bracketed[1]);
      if (start >= 1 && end >= start) return { start, end, raw: normalized };
      return null;
    }
    const annotatedRange = normalized.match(/(\d{1,2})\s*[-~～—–－至]\s*(\d{1,2})\s*节/);
    if (annotatedRange) {
      const start = Number(annotatedRange[1]);
      const end = Number(annotatedRange[2]);
      if (start >= 1 && end >= start) return { start, end, raw: normalized };
      return null;
    }
    const list = normalized.match(/(?:第\s*)?((?:\d{1,2}\s*[,，、]\s*)+\d{1,2})\s*节/);
    if (list?.[1]) {
      const values = list[1].split(/[,，、]/).map((part) => Number(part.trim())).filter(Number.isInteger).sort((a, b) => a - b);
      if (values.length > 0 && values.every((value, index) => index === 0 || value === (values[index - 1] ?? 0) + 1)) {
        return { start: values[0] ?? 0, end: values[values.length - 1] ?? 0, raw: normalized };
      }
      return null;
    }
    const annotatedSingle = normalized.match(/(?:第\s*)?(\d{1,2})\s*节/);
    if (annotatedSingle) {
      const value = Number(annotatedSingle[1]);
      if (value >= 1) return { start: value, end: value, raw: normalized };
    }
    if (/^\d{1,2}$/.test(normalized)) {
      const value = Number(normalized);
      return value >= 1 ? { start: value, end: value, raw: normalized } : null;
    }
    if (/^\d{1,2}\s*[-~～—–－至]\s*\d{1,2}$/.test(normalized)) {
      const range = normalized.match(/(\d{1,2})\s*[-~～—–－至]\s*(\d{1,2})/);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        if (start >= 1 && end >= start) return { start, end, raw: normalized };
      }
    }
    if (/节次|section|period/i.test(normalized)) {
      const range = normalized.match(/(\d{1,2})\s*[-~～—–－至]\s*(\d{1,2})/);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        if (start >= 1 && end >= start) return { start, end, raw: normalized };
      }
    }
    return null;
  }
  function parseWeekday(raw) {
    const value = normalizeText(raw).toLowerCase();
    if (!value) return null;
    const labelled = value.match(/(?:星期|周|礼拜)\s*([一二三四五六日天1-7])/);
    if (labelled?.[1]) return WEEKDAY_MAP[labelled[1]] ?? null;
    const bracketed = value.match(/([一二三四五六日天1-7])\s*\[/);
    if (bracketed?.[1]) return WEEKDAY_MAP[bracketed[1]] ?? null;
    if (/^[1-7]$/.test(value)) return Number(value);
    return WEEKDAY_MAP[value] ?? ENGLISH_WEEKDAYS[value] ?? null;
  }
  function weekdayToken(weekday) {
    return ["", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u65E5"][weekday] ?? String(weekday);
  }
  function cleanCellText(value) {
    return normalizeText(value).replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function cleanCourseName(value) {
    return normalizeText(value).replace(/^\[[^\]]{1,20}\]\s*/u, "").trim();
  }
  function cleanTeacher(value) {
    return normalizeText(value).replace(/\s*\[\d+\]\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  }

  // src/connectors/vendors/wisedu.ts
  var WISEDU_SECTION_FALLBACK = {
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    8: 6,
    9: 7,
    10: 8,
    11: 9,
    12: 10,
    14: 11,
    15: 12,
    16: 13
  };
  function str2(value) {
    return value === null || value === void 0 ? "" : String(value).trim();
  }
  function num(value) {
    const parsed = Number(str2(value));
    return Number.isInteger(parsed) ? parsed : null;
  }
  function weeksFromBitmap(bitmap) {
    return Array.from(bitmap).map((value, index) => value === "1" ? index + 1 : 0).filter((week) => week > 0);
  }
  function defaultDescriptor() {
    return {
      id: "wisedu-jwapp",
      version: "0.5.1",
      vendor: "wisedu",
      vendorLabel: "\u91D1\u667A Wisedu jwapp\uFF08\u901A\u7528\uFF09",
      platformVersion: "jwapp",
      status: "experimental",
      capabilities: ["timetable", "semester", "periods", "classroom"],
      verifiedDomains: [],
      methods: ["api", "dom"],
      limitations: ["\u901A\u7528\u91D1\u667A\u9002\u914D\u5668\u4E0D\u80FD\u7EE7\u627F WHUT \u7684\u5B66\u6821\u7EA7\u9A8C\u8BC1\u7ED3\u8BBA\u3002"]
    };
  }
  function parseTermCode(value, semester) {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{4})-(\d{4})-(\d)$/);
    if (match) {
      const academicYear = `${match[1]}-${match[2]}`;
      const termCode = match[3] ?? "1";
      const termName = `${academicYear} \u7B2C${termCode === "1" ? "\u4E00" : termCode === "2" ? "\u4E8C" : termCode}\u5B66\u671F`;
      return { termId: trimmed, academicYear, termCode, termName };
    }
    return {
      termId: trimmed || semester.termCode || "unknown",
      academicYear: semester.academicYear ?? "unknown",
      termCode: semester.termCode ?? "unknown",
      termName: semester.termName
    };
  }
  function sectionMapFromRows(rows) {
    const map = {};
    let physical = 0;
    for (const row of rows) {
      const dm = num(row.DM);
      const mc = str2(row.MC);
      if (dm !== null && mc.includes("\u8282")) {
        physical += 1;
        map[dm] = physical;
      }
    }
    return Object.keys(map).length >= 10 ? map : { ...WISEDU_SECTION_FALLBACK };
  }
  function periodScheduleFromRows(rows, sectionMap, semesterStart) {
    const periods = DEFAULT_PERIODS.map((period) => ({ ...period }));
    for (const row of rows) {
      const rawStart = num(row.KSJC);
      const rawEnd = num(row.JSJC);
      const start = rawStart !== null ? sectionMap[rawStart] ?? rawStart : null;
      const end = rawEnd !== null ? sectionMap[rawEnd] ?? rawEnd : start;
      if (start !== null && row.KSSJ) {
        const match = periods.find((period) => period.index === start);
        if (match) match.start = str2(row.KSSJ);
        else if (row.JSSJ) periods.push({ index: start, start: str2(row.KSSJ), end: str2(row.JSSJ) });
      }
      if (end !== null && row.JSSJ) {
        const match = periods.find((period) => period.index === end);
        if (match) match.end = str2(row.JSSJ);
        else if (row.KSSJ) periods.push({ index: end, start: str2(row.KSSJ), end: str2(row.JSSJ) });
      }
    }
    periods.sort((left, right) => left.index - right.index);
    return {
      id: `whut-periods-${semesterStart}`,
      label: "WHUT \u6559\u52A1\u63A5\u53E3/\u9ED8\u8BA4\u8282\u6B21",
      effectiveFrom: semesterStart,
      periods
    };
  }
  function extractRows(response, preferredKeys) {
    const datas = response.datas ?? {};
    for (const key of preferredKeys) {
      const rows = datas[key]?.rows;
      if (Array.isArray(rows)) return rows;
    }
    return [];
  }
  async function normalizeWiseduRows(rows, descriptor4, semester, sectionMap = WISEDU_SECTION_FALLBACK) {
    const warnings = [];
    const coursesByKey = /* @__PURE__ */ new Map();
    const seenMeetingIds = /* @__PURE__ */ new Set();
    for (const [index, row] of rows.entries()) {
      const name = str2(row.KCM || row.KCM_DISPLAY);
      const weekday = num(row.SKXQ);
      const rawStart = num(row.KSJC);
      const rawEnd = num(row.JSJC) ?? rawStart;
      if (!name || weekday === null || rawStart === null) continue;
      const startPeriod = sectionMap[rawStart] ?? rawStart;
      const endPeriod = rawEnd !== null ? sectionMap[rawEnd] ?? rawEnd : startPeriod;
      const bitmapWeeks = weeksFromBitmap(str2(row.SKZC));
      const parsedWeeks = bitmapWeeks.length > 0 ? bitmapWeeks : parseWeeksDetailed(str2(row.ZCMC)).weeks;
      if (parsedWeeks.length === 0) {
        warnings.push(`\u7B2C ${index + 1} \u884C ${name} \u5468\u6B21\u4E3A\u7A7A\uFF0C\u5DF2\u8DF3\u8FC7`);
        continue;
      }
      const sourceCourseId = [str2(row.KCH), str2(row.JXBID), str2(row.KXH)].filter(Boolean).join("|") || str2(row.KBID) || str2(row.WID);
      const courseId = await makeCourseId({
        adapterId: descriptor4.id,
        sourceCourseId,
        sourceRef: str2(row.KBID || row.WID) || `row:${index + 1}`,
        fallbackOrdinal: index + 1
      });
      const sourceMeetingId = [str2(row.KBID), str2(row.WID), str2(row.SKZC), str2(row.SKXQ), str2(row.KSJC), str2(row.JSJC)].filter(Boolean).join("|");
      const meetingId = await makeMeetingId({
        courseId,
        sourceMeetingId,
        weekday,
        startPeriod,
        endPeriod,
        weeks: parsedWeeks
      });
      if (seenMeetingIds.has(meetingId)) continue;
      seenMeetingIds.add(meetingId);
      const meeting = {
        id: meetingId,
        teacher: str2(row.SKJS),
        room: str2(row.JASMC),
        campus: str2(row.XXXQDM_DISPLAY || row.XXXQMC),
        weekday,
        startPeriod,
        endPeriod,
        weeks: parsedWeeks,
        weekRule: str2(row.ZCMC) || parsedWeeks.join(","),
        startTime: str2(row.KSSJ) || void 0,
        endTime: str2(row.JSSJ) || void 0,
        source: {
          adapterId: descriptor4.id,
          adapterVersion: descriptor4.version,
          schoolId: descriptor4.schoolId,
          sourceCourseId,
          sourceRef: str2(row.KBID || row.WID)
        }
      };
      const existing = coursesByKey.get(courseId);
      if (existing) {
        existing.meetings.push(meeting);
      } else {
        const credits = Number(str2(row.XF));
        coursesByKey.set(courseId, {
          id: courseId,
          name,
          category: str2(row.KCXZDM_DISPLAY),
          credits: Number.isFinite(credits) && credits > 0 ? credits : void 0,
          teachingClass: str2(row.SKBJ),
          source: {
            adapterId: descriptor4.id,
            adapterVersion: descriptor4.version,
            schoolId: descriptor4.schoolId,
            sourceCourseId,
            sourceRef: str2(row.KBID || row.WID)
          },
          meetings: [meeting]
        });
      }
    }
    if (rows.length > 0 && coursesByKey.size === 0) {
      throw new Error("\u5DF2\u83B7\u53D6\u6559\u52A1\u6570\u636E\uFF0C\u4F46\u6CA1\u6709\u53EF\u89E3\u6790\u7684\u8BFE\u7A0B\u884C\uFF1B\u9875\u9762\u7ED3\u6784\u53EF\u80FD\u5DF2\u53D8\u5316");
    }
    return {
      courses: [...coursesByKey.values()],
      warnings,
      periodSchedule: periodScheduleFromRows(rows, sectionMap, semester.semesterStart)
    };
  }
  function createWiseduAdapter() {
    const descriptor4 = defaultDescriptor();
    return {
      descriptor: descriptor4,
      async detect(context) {
        const path = context.url.pathname;
        const evidence = [];
        if (path.includes("/jwapp/")) evidence.push("/jwapp/ \u8DEF\u5F84");
        const text = context.document.documentElement?.textContent ?? "";
        if (text.includes("EMAP") || text.includes("jwapp")) evidence.push("EMAP/jwapp \u9875\u9762\u7279\u5F81");
        const confidence = evidence.length >= 2 ? 0.9 : evidence.length === 1 ? 0.68 : 0;
        return {
          detected: confidence > 0,
          adapterId: descriptor4.id,
          confidence,
          vendor: "wisedu",
          evidence,
          reason: confidence > 0 ? void 0 : "\u672A\u53D1\u73B0\u91D1\u667A jwapp \u7279\u5F81"
        };
      },
      async extract(context, semester) {
        const origin = context.url.origin;
        const warnings = [];
        let currentUser = {};
        try {
          currentUser = await fetchJson(
            `${origin}/jwapp/sys/homeapp/api/home/currentUser.do`,
            {},
            context.fetchImpl
          );
        } catch {
          warnings.push("\u672A\u83B7\u53D6\u5230\u5F53\u524D\u7528\u6237\u4FE1\u606F\uFF0C\u5C06\u4F7F\u7528\u7528\u6237\u586B\u5199\u7684\u5B66\u671F\u4FE1\u606F");
        }
        const userDatas = currentUser.datas ?? {};
        const welcome = userDatas.welcomeInfo ?? {};
        const termRaw = str2(welcome.xnxqdm) || str2(welcome.xnxq) || str2(userDatas.xnxqdm) || semester.termCode || "unknown";
        const termInfo = parseTermCode(termRaw, semester);
        let sectionMap = { ...WISEDU_SECTION_FALLBACK };
        const sectionRows = [];
        try {
          const sectionResponse = await postFormText(
            `${origin}/jwapp/sys/wdkbby/modules/dzkz/jcjcx.do`,
            "",
            context.fetchImpl
          );
          sectionRows.push(...sectionResponse.datas?.jcjcx?.rows ?? []);
          sectionMap = sectionMapFromRows(sectionRows);
        } catch {
          warnings.push("\u901A\u7528\u91D1\u667A\u8282\u6B21\u6620\u5C04\u63A5\u53E3\u4E0D\u53EF\u7528\uFF0C\u4F7F\u7528\u5DF2\u77E5\u517C\u5BB9\u6620\u5C04\u4E0E\u7528\u6237\u786E\u8BA4\u4F5C\u606F");
        }
        const response = await postForm(
          `${origin}/jwapp/sys/wdkb/modules/xskcb/xskcb.do`,
          { XNXQDM: termRaw },
          context.fetchImpl
        ).catch(() => ({ datas: {} }));
        const rows = extractRows(response, ["xskcb", "cxxszhxqkb", "cxxskcb"]);
        if (rows.length === 0) {
          throw new Error("\u6559\u52A1\u8FD4\u56DE\u7A7A\u8BFE\u8868\u3002\u8BF7\u786E\u8BA4\u5DF2\u767B\u5F55\u3001\u5DF2\u8FDB\u5165\u5B66\u751F\u8BFE\u8868\u9875\uFF0C\u5E76\u9009\u62E9\u6B63\u786E\u5B66\u671F");
        }
        const normalized = await normalizeWiseduRows(rows, descriptor4, semester, sectionMap);
        const parsedCount = normalized.courses.reduce((sum, course) => sum + course.meetings.length, 0);
        const draft = {
          descriptor: descriptor4,
          term: {
            termId: termInfo.termId,
            academicYear: termInfo.academicYear,
            termCode: termInfo.termCode,
            termName: termInfo.termName,
            semesterStart: semester.semesterStart,
            teachingWeeks: semester.teachingWeeks ?? 20,
            timezone: semester.timezone ?? "Asia/Shanghai",
            campus: semester.campus,
            periodSchedules: [normalized.periodSchedule]
          },
          courses: normalized.courses,
          overrides: [],
          metadata: {
            method: "api",
            sourceUrl: `${context.url.origin}${context.url.pathname}`,
            rawCount: rows.length,
            parsedCount,
            skippedCount: Math.max(0, rows.length - parsedCount),
            platform: descriptor4.vendorLabel,
            userNote: "\u53EA\u8BFB\u63D0\u53D6\uFF1B\u672A\u6301\u4E45\u5316 Cookie \u6216 CSRF \u53C2\u6570"
          },
          warnings: [...warnings, ...normalized.warnings]
        };
        return {
          draft,
          rawRows: rows.length,
          parsedRows: parsedCount,
          skippedRows: Math.max(0, rows.length - parsedCount),
          evidence: ["jwapp", "student-timetable", "generic-wisedu"]
        };
      },
      validate(timetable) {
        return validateTimetableV2(timetable);
      }
    };
  }

  // src/core/errors.ts
  var TericsParseError = class extends Error {
    issues;
    constructor(message, issues = []) {
      super(message);
      this.name = "TericsParseError";
      this.issues = issues;
    }
  };

  // src/core/parsers/tabular.ts
  var HEADER_ALIASES = {
    "\u8BFE\u7A0B": "name",
    "\u8BFE\u7A0B\u540D": "name",
    "\u8BFE\u7A0B\u540D\u79F0": "name",
    "name": "name",
    "course": "name",
    "coursename": "name",
    "\u6559\u5E08": "teacher",
    "\u8001\u5E08": "teacher",
    "\u4EFB\u8BFE\u6559\u5E08": "teacher",
    "\u4E0A\u8BFE\u6559\u5E08": "teacher",
    "teacher": "teacher",
    "\u5730\u70B9": "location",
    "\u6559\u5BA4": "location",
    "\u4E0A\u8BFE\u5730\u70B9": "location",
    "location": "location",
    "room": "location",
    "\u661F\u671F": "weekday",
    "\u5468\u51E0": "weekday",
    "\u661F\u671F\u51E0": "weekday",
    "weekday": "weekday",
    "day": "weekday",
    "\u8282\u6B21": "periods",
    "\u8282": "periods",
    "sections": "periods",
    "periods": "periods",
    "\u5468\u6B21": "weeks",
    "\u6559\u5B66\u5468": "weeks",
    "weeks": "weeks",
    "\u65F6\u95F4": "time",
    "\u4E0A\u8BFE\u65F6\u95F4": "time",
    "\u4E0A\u8BFE\u65F6\u95F4\u5730\u70B9": "time",
    "\u65F6\u95F4\u5730\u70B9": "time",
    "time": "time",
    "\u5907\u6CE8": "note",
    "note": "note",
    "notes": "note"
  };
  function normalizeHeader(value) {
    return normalizeText(value).toLowerCase().replace(/[\s_\-:：/\\()（）[\]【】]+/g, "");
  }
  function canonicalHeader(value) {
    return HEADER_ALIASES[normalizeHeader(value)] ?? null;
  }
  function findTabularHeader(matrix) {
    for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 25); rowIndex += 1) {
      const row = matrix[rowIndex] ?? [];
      const columns = {};
      row.forEach((cell, columnIndex) => {
        const canonical = canonicalHeader(cell);
        if (canonical && columns[canonical] === void 0) columns[canonical] = columnIndex;
      });
      if (columns.name !== void 0 && (columns.weeks !== void 0 || columns.periods !== void 0 || columns.time !== void 0)) {
        return { rowIndex, columns };
      }
    }
    return null;
  }
  function valueAt(row, index) {
    if (index === void 0) return "";
    return cleanCellText(row[index]);
  }
  function stripMatched(text, matched) {
    if (!matched) return text;
    return text.replace(matched, " ");
  }
  function cleanupCombinedLocation(text, weekRule, periodRaw) {
    let location = text;
    location = stripMatched(location, weekRule);
    location = stripMatched(location, periodRaw);
    location = location.replace(/(?:星期|周|礼拜)\s*[一二三四五六日天1-7]/g, " ").replace(/(^|\s)[一二三四五六日天](?=\s|$)/g, " ").replace(/\[[^\]]*\]/g, " ").replace(/[（(]\s*[）)]/g, " ").replace(/[;,，；、|]+/g, " ").replace(/\s+/g, " ").trim();
    return location;
  }
  function dedupeCourses(courses, issues) {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const course of courses) {
      const key = [
        course.name,
        course.teacher,
        course.location,
        course.weekday,
        course.startPeriod,
        course.endPeriod,
        course.weeks.join(","),
        course.note
      ].join("");
      if (seen.has(key)) {
        issues.push({
          severity: "warning",
          code: "duplicate_course",
          message: `\u5DF2\u5408\u5E76\u91CD\u590D\u8BFE\u7A0B\uFF1A${course.name}\uFF08${course.sourceRef ?? "\u672A\u77E5\u4F4D\u7F6E"}\uFF09`
        });
        continue;
      }
      seen.add(key);
      result.push(course);
    }
    return result;
  }
  function parseTabularRows(matrix, sourceLabel) {
    const header = findTabularHeader(matrix);
    if (!header) return null;
    const issues = [];
    const courses = [];
    const { rowIndex: headerRow, columns } = header;
    for (let rowIndex = headerRow + 1; rowIndex < matrix.length; rowIndex += 1) {
      const row = matrix[rowIndex] ?? [];
      if (row.every((cell) => !normalizeText(cell))) continue;
      const sourceRow = rowIndex + 1;
      const name = cleanCourseName(valueAt(row, columns.name));
      if (!name) continue;
      let teacher = cleanTeacher(valueAt(row, columns.teacher));
      const configuredLocation = cleanCellText(valueAt(row, columns.location));
      const note = cleanCellText(valueAt(row, columns.note));
      const weekdayRaw = valueAt(row, columns.weekday);
      const periodsRaw = valueAt(row, columns.periods);
      const weeksRaw = valueAt(row, columns.weeks);
      const combinedRaw = valueAt(row, columns.time);
      const timeSegments = combinedRaw ? combinedRaw.split(/[；;]/).map((segment) => segment.trim()).filter(Boolean) : [periodsRaw || combinedRaw];
      if (timeSegments.length > 1 && !teacher) {
        issues.push({
          severity: "warning",
          code: "multiple_sessions_shared_teacher",
          message: `\u7B2C ${sourceRow} \u884C\u5305\u542B\u591A\u4E2A\u65F6\u95F4\u5730\u70B9\u6BB5\uFF1B\u6559\u5E08\u4E0E\u5730\u70B9\u6309\u539F\u5B57\u6BB5\u5171\u7528\u3002`,
          row: sourceRow
        });
      }
      let addedForRow = 0;
      for (const segment of timeSegments) {
        const weekRuleMatch = extractWeekRule(weeksRaw || segment);
        const weekRule = weekRuleMatch?.rule ?? weeksRaw;
        const weekResult = parseWeeksDetailed(weekRule);
        if (weekResult.error) {
          issues.push({
            severity: "error",
            code: "invalid_weeks",
            message: `\u7B2C ${sourceRow} \u884C\u5468\u6B21\u65E0\u6548\uFF1A${weekResult.error}`,
            row: sourceRow,
            hint: "\u793A\u4F8B\uFF1A1-16\u30011-8,10-16\u30011-16\u5355\u30012-16\u53CC"
          });
          continue;
        }
        const period = parsePeriodRange(periodsRaw || segment);
        if (!period) {
          issues.push({
            severity: "error",
            code: "invalid_periods",
            message: `\u7B2C ${sourceRow} \u884C\u8282\u6B21\u65E0\u6548\uFF1A${segment || "\uFF08\u7A7A\uFF09"}`,
            row: sourceRow,
            hint: "\u793A\u4F8B\uFF1A1-2\u3001\u7B2C3-4\u8282\u3001[05-06\u8282]"
          });
          continue;
        }
        if (period.start < 1 || period.end > 30) {
          issues.push({
            severity: "error",
            code: "period_out_of_range",
            message: `\u7B2C ${sourceRow} \u884C\u8282\u6B21\u8D85\u51FA\u652F\u6301\u8303\u56F4 1\u201330\uFF1A${period.start}-${period.end}`,
            row: sourceRow
          });
          continue;
        }
        let location = configuredLocation;
        const weekday = parseWeekday(weekdayRaw) ?? parseWeekday(segment);
        if (!weekday) {
          issues.push({
            severity: "error",
            code: "invalid_weekday",
            message: `\u7B2C ${sourceRow} \u884C\u65E0\u6CD5\u8BC6\u522B\u661F\u671F\uFF1A${weekdayRaw || segment || "\uFF08\u7A7A\uFF09"}`,
            row: sourceRow,
            hint: "\u652F\u6301\u5468\u4E00\u81F3\u5468\u65E5\u3001\u661F\u671F\u4E00\u81F3\u661F\u671F\u65E5\u30011\u20137 \u6216 Monday\u2013Sunday"
          });
          continue;
        }
        if (!location && segment) {
          location = cleanupCombinedLocation(segment, weekRuleMatch?.rule, period.raw);
        }
        if (!teacher && segment.includes("|")) {
          teacher = cleanTeacher(segment.split("|").find((part) => /老师|教师|teacher/i.test(part)) ?? "");
        }
        courses.push({
          name,
          teacher,
          location,
          weekday,
          startPeriod: period.start,
          endPeriod: period.end,
          weeks: weekResult.weeks,
          weekRule: weekRule ?? weekResult.normalized,
          note,
          sourceRef: `${sourceLabel} \u7B2C ${sourceRow} \u884C`
        });
        addedForRow += 1;
      }
      if (addedForRow === 0) {
        issues.push({
          severity: "warning",
          code: "row_skipped",
          message: `\u7B2C ${sourceRow} \u884C\u6CA1\u6709\u751F\u6210\u8BFE\u7A0B\uFF0C\u8BF7\u68C0\u67E5\u65F6\u95F4\u5B57\u6BB5\u3002`,
          row: sourceRow
        });
      }
    }
    return { courses: dedupeCourses(courses, issues), issues, headerRow };
  }

  // src/core/parsers/cell.ts
  function splitBlocks(raw) {
    const normalized = cleanCellText(raw).replace(/<br\s*\/?>/gi, "\n").replace(/\n?\s*[-—–_=]{3,}\s*\n?/g, "\n---TERICS-SEP---\n");
    return normalized.split(/\n?---TERICS-SEP---\n?|\n{2,}/).map((block) => block.trim()).filter(Boolean);
  }
  function cleanTrailingMeta(value) {
    return value.replace(/(?:星期|周|礼拜)\s*[一二三四五六日天1-7]\s*$/u, "").replace(/[（(]\s*[）)]/g, "").replace(/[|,，;；{}[\]\s]+$/u, "").trim();
  }
  function parsePipeEntry(block, context) {
    if (!block.includes("|")) return null;
    const tokens = block.split("|").map((token) => cleanCellText(token)).filter(Boolean);
    if (tokens.length < 2) return null;
    const weekMarker = tokens.findIndex((token) => /周次|weeks?/i.test(token));
    const teacherMarker = tokens.findIndex((token) => /老师|教师|teacher/i.test(token));
    if (weekMarker < 0) return null;
    const weekToken = tokens[weekMarker + 1] ?? "";
    const weekResult = parseWeeksDetailed(weekToken);
    if (weekResult.error) return null;
    let teacher = "";
    if (teacherMarker >= 0) {
      teacher = tokens.slice(teacherMarker + 1, weekMarker >= 0 ? weekMarker : void 0).join(" ");
    } else if (tokens.length >= 3) {
      teacher = tokens[2] ?? "";
    }
    const locationMarker = tokens.findIndex((token) => /教室|地点|location|room/i.test(token));
    const location = locationMarker >= 0 ? tokens.slice(locationMarker + 1).join(" ") : "";
    const name = cleanCourseName(tokens[0]);
    return {
      name,
      teacher: cleanTeacher(teacher),
      location: cleanCellText(location),
      weekday: context.weekday,
      startPeriod: context.startPeriod,
      endPeriod: context.endPeriod,
      weeks: weekResult.weeks,
      weekRule: weekToken || weekResult.normalized,
      note: "",
      sourceRef: context.sourceRef
    };
  }
  function parseFreeformEntry(block, context) {
    const weekMatch = extractWeekRule(block);
    if (!weekMatch) return null;
    const weekResult = parseWeeksDetailed(weekMatch.rule);
    if (weekResult.error) return null;
    const before = block.slice(0, weekMatch.index).replace(/[{([]\s*$/u, "").trim();
    const after = block.slice(weekMatch.index + weekMatch.length).replace(/^[\s})\]}]+/u, "").trim();
    const courseLine = before.split("\n").map((line) => cleanTrailingMeta(line)).filter(Boolean).pop();
    const name = cleanCourseName(courseLine ?? "");
    if (!name) return null;
    const afterLines = after.split("\n").map((line) => cleanCellText(line)).filter(Boolean);
    let teacher = "";
    let location = "";
    if (afterLines.length >= 2) {
      teacher = afterLines[0] ?? "";
      location = afterLines.slice(1).join(" ");
    } else if (afterLines.length === 1) {
      const tokens = (afterLines[0] ?? "").split(/\s+/).filter(Boolean);
      teacher = tokens[0] ?? "";
      location = tokens.slice(1).join(" ");
    }
    return {
      name,
      teacher: cleanTeacher(teacher),
      location: cleanCellText(location.replace(/\[[^\]]*\]/g, " ")),
      weekday: context.weekday,
      startPeriod: context.startPeriod,
      endPeriod: context.endPeriod,
      weeks: weekResult.weeks,
      weekRule: weekMatch.rule,
      note: "",
      sourceRef: context.sourceRef
    };
  }
  function parseGridCell(raw, context) {
    const block = cleanCellText(raw);
    if (!block || /^(?:无|空|休息|-|—|--|\/)$/.test(block)) return {};
    try {
      const course = parsePipeEntry(block, context) ?? parseFreeformEntry(block, context);
      if (!course?.name) {
        return {
          issue: {
            severity: "error",
            code: "unrecognized_cell",
            message: `${context.sourceRef} \u65E0\u6CD5\u8BC6\u522B\u8BFE\u7A0B\u5185\u5BB9\uFF1A${block.slice(0, 80)}`,
            hint: "\u652F\u6301\u7BA1\u9053\u5B57\u6BB5\u683C\u5F0F\uFF0C\u6216 `\u8BFE\u7A0B\u540D {\u7B2C1-16\u5468 \u6559\u5E08 \u5730\u70B9` / \u591A\u884C\u683C\u5F0F\u3002"
          }
        };
      }
      return { course };
    } catch (error) {
      return {
        issue: {
          severity: "error",
          code: "cell_parse_error",
          message: `${context.sourceRef} \u89E3\u6790\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }
  function findWeekdayHeader(matrix) {
    for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 15); rowIndex += 1) {
      const row = matrix[rowIndex] ?? [];
      const columns = /* @__PURE__ */ new Map();
      row.forEach((cell, columnIndex) => {
        const weekday = parseWeekday(cell);
        if (weekday) columns.set(columnIndex, weekday);
      });
      if (columns.size >= 2) return { rowIndex, columns };
    }
    return null;
  }
  function inferPeriod(row, headerRow, rowIndex) {
    const first = cleanCellText(row[0]);
    const parsed = parsePeriodRange(first);
    if (parsed) return parsed;
    if (!first) {
      const inferred = rowIndex - headerRow;
      return inferred >= 1 ? { start: inferred, end: inferred } : null;
    }
    return null;
  }
  function parseGridMatrix(matrix, label) {
    const header = findWeekdayHeader(matrix);
    if (!header) return null;
    const issues = [];
    const courses = [];
    for (let rowIndex = header.rowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
      const row = matrix[rowIndex] ?? [];
      const period = inferPeriod(row, header.rowIndex, rowIndex);
      if (!period) continue;
      if (period.start < 1 || period.end > 30) {
        issues.push({
          severity: "error",
          code: "period_out_of_range",
          message: `${label} \u7B2C ${rowIndex + 1} \u884C\u8282\u6B21\u8D85\u51FA\u652F\u6301\u8303\u56F4\uFF1A${period.start}-${period.end}`,
          row: rowIndex + 1
        });
        continue;
      }
      for (const [columnIndex, weekday] of header.columns) {
        const raw = cleanCellText(row[columnIndex]);
        if (!raw) continue;
        const context = {
          weekday,
          startPeriod: period.start,
          endPeriod: period.end,
          sourceRef: `${label} \u7B2C ${rowIndex + 1} \u884C / ${weekdayToken(weekday)}`
        };
        for (const block of splitBlocks(raw)) {
          const result = parseGridCell(block, context);
          if (result.course) courses.push(result.course);
          if (result.issue) issues.push(result.issue);
        }
      }
    }
    return { courses: dedupeCourses(courses, issues), issues, headerRow: header.rowIndex };
  }

  // src/core/parsers/html.ts
  function extractCellText(document2, element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll("script,style,noscript,template,iframe,object,svg,img").forEach((node) => node.remove());
    clone.querySelectorAll("br").forEach((node) => node.replaceWith(document2.createTextNode("\n")));
    clone.querySelectorAll("div,p,li,tr").forEach((node) => node.append(document2.createTextNode("\n")));
    return cleanCellText(clone.textContent ?? "");
  }
  function spanValue(element, name) {
    const value = Number(element.getAttribute(name) ?? 1);
    return Number.isInteger(value) && value >= 1 && value <= 50 ? value : 1;
  }
  function tableToMatrix(document2, table) {
    const rows = Array.from(table.querySelectorAll("tr"));
    const grid = [];
    rows.forEach((row, rowIndex) => {
      grid[rowIndex] ??= [];
      let columnIndex = 0;
      for (const cell of Array.from(row.children)) {
        if (!["TD", "TH"].includes(cell.tagName)) continue;
        while (grid[rowIndex]?.[columnIndex] !== void 0) columnIndex += 1;
        const text = extractCellText(document2, cell);
        const rowSpan = spanValue(cell, "rowspan");
        const colSpan = spanValue(cell, "colspan");
        for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
          const targetRow = rowIndex + rowOffset;
          grid[targetRow] ??= [];
          for (let colOffset = 0; colOffset < colSpan; colOffset += 1) {
            grid[targetRow][columnIndex + colOffset] = text;
          }
        }
        columnIndex += colSpan;
      }
    });
    return grid.map((row) => row.map((cell) => cell ?? ""));
  }
  function parseHtml(html, fileName) {
    if (!html.trim()) {
      throw new TericsParseError("HTML \u6587\u4EF6\u4E3A\u7A7A");
    }
    const document2 = new DOMParser().parseFromString(html, "text/html");
    if (document2.querySelector("parsererror")) {
      throw new TericsParseError("HTML \u7ED3\u6784\u635F\u574F\uFF0C\u65E0\u6CD5\u89E3\u6790");
    }
    const tables = Array.from(document2.querySelectorAll("table"));
    if (tables.length === 0) {
      throw new TericsParseError("HTML \u4E2D\u6CA1\u6709\u627E\u5230 <table> \u8BFE\u8868");
    }
    const issues = [];
    const courses = [];
    let gridDetected = false;
    let listDetected = false;
    tables.slice(0, 100).forEach((table, tableIndex) => {
      const matrix = tableToMatrix(document2, table);
      if (matrix.length < 2 || matrix.every((row) => row.every((cell) => !cell.trim()))) return;
      const label = `${fileName} \u8868\u683C ${tableIndex + 1}`;
      const tabular = parseTabularRows(matrix, label);
      if (tabular) {
        listDetected = true;
        courses.push(...tabular.courses);
        issues.push(...tabular.issues);
        return;
      }
      const grid = parseGridMatrix(matrix, label);
      if (grid) {
        gridDetected = true;
        courses.push(...grid.courses);
        issues.push(...grid.issues);
      }
    });
    const deduped = dedupeCourses(courses, issues);
    if (deduped.length === 0) {
      throw new TericsParseError(
        "HTML \u8868\u683C\u672A\u8BC6\u522B\u51FA\u8BFE\u7A0B\uFF1B\u8BF7\u786E\u8BA4\u5305\u542B\u661F\u671F\u8868\u5934\uFF0C\u6216\u8BFE\u7A0B/\u6559\u5E08/\u5468\u6B21/\u8282\u6B21\u5217",
        issues.length > 0 ? issues : [
          {
            severity: "error",
            code: "no_courses",
            message: "HTML \u4E2D\u6CA1\u6709\u53EF\u8F6C\u6362\u7684\u6709\u6548\u8BFE\u7A0B\u884C",
            hint: "\u53EF\u53C2\u8003 docs/formats.md \u4E2D\u7684 HTML \u793A\u4F8B\u3002"
          }
        ]
      );
    }
    const hasErrors = issues.some((issue) => issue.severity === "error");
    return {
      format: "html",
      formatLabel: listDetected && !gridDetected ? "HTML \u5217\u8868\u5F0F\u8BFE\u8868" : "HTML \u5468\u7F51\u683C\u8BFE\u8868",
      confidence: hasErrors ? 0.84 : 0.97,
      courses: deduped,
      issues,
      metadata: {
        tableCount: tables.length,
        sourceRows: courses.length
      }
    };
  }
  var HTML_FORMAT_LABEL = FORMAT_LABELS.html;

  // src/connectors/generic/dom.ts
  async function extractDomTimetable(context, semester, descriptor4) {
    const html = context.document.documentElement?.outerHTML ?? "";
    const parsed = parseHtml(html, context.url.hostname);
    const normalized = await rawCoursesToV2(parsed, {
      sourceKind: "web",
      adapterId: descriptor4.id,
      adapterVersion: descriptor4.version,
      schoolId: descriptor4.schoolId,
      schoolName: descriptor4.schoolName,
      sourceUrl: `${context.url.origin}${context.url.pathname}`,
      title: semester.termName,
      semesterStart: semester.semesterStart,
      periods: DEFAULT_PERIODS,
      teachingWeeks: semester.teachingWeeks,
      timezone: semester.timezone
    });
    normalized.source.adapterId = descriptor4.id;
    normalized.source.adapterVersion = descriptor4.version;
    normalized.source.platform = descriptor4.vendorLabel;
    normalized.source.schoolId = descriptor4.schoolId;
    normalized.source.schoolName = descriptor4.schoolName;
    normalized.metadata.method = "dom";
    normalized.metadata.adapterId = descriptor4.id;
    normalized.metadata.adapterVersion = descriptor4.version;
    normalized.metadata.platform = descriptor4.vendorLabel;
    normalized.metadata.schoolId = descriptor4.schoolId;
    normalized.metadata.schoolName = descriptor4.schoolName;
    const draft = {
      descriptor: descriptor4,
      term: {
        ...normalized.term,
        academicYear: semester.academicYear ?? normalized.term.academicYear,
        termCode: semester.termCode ?? normalized.term.termCode,
        termName: semester.termName
      },
      courses: normalized.courses,
      overrides: normalized.overrides,
      metadata: {
        method: "dom",
        sourceUrl: normalized.source.sourceUrl,
        rawCount: normalized.metadata.rawCount,
        parsedCount: normalized.metadata.parsedCount,
        skippedCount: normalized.metadata.skippedCount,
        schoolId: descriptor4.schoolId,
        schoolName: descriptor4.schoolName,
        platform: descriptor4.vendorLabel,
        userNote: "DOM \u56DE\u9000\u63D0\u53D6\uFF1B\u672A\u6267\u884C\u9875\u9762\u811A\u672C\uFF0C\u672A\u4E0A\u4F20\u9875\u9762\u5185\u5BB9"
      },
      warnings: [
        "DOM \u56DE\u9000\u65E0\u6CD5\u4FDD\u8BC1\u83B7\u5F97\u5B98\u65B9\u8C03\u8BFE/\u505C\u8BFE\u6570\u636E\uFF0C\u8BF7\u5728\u6559\u52A1\u9875\u9762\u6838\u5BF9\u540E\u518D\u5BFC\u51FA\u3002",
        ...parsed.issues.filter((issue) => issue.severity !== "info").map((issue) => issue.message)
      ]
    };
    return {
      draft,
      rawRows: normalized.metadata.rawCount,
      parsedRows: normalized.metadata.parsedCount,
      skippedRows: normalized.metadata.skippedCount,
      evidence: ["dom-table", descriptor4.id]
    };
  }

  // src/connectors/vendors/zf.ts
  function str3(value) {
    return value === null || value === void 0 ? "" : String(value).trim();
  }
  function zfDescriptor() {
    return {
      id: "zf-jwglxt",
      version: "0.5.0",
      vendor: "zf",
      vendorLabel: "\u6B63\u65B9\u6559\u52A1 JWGLXT",
      platformVersion: "V8/V9 compatible",
      status: "experimental",
      capabilities: ["timetable", "semester", "periods", "classroom"],
      verifiedDomains: [],
      methods: ["api", "dom"],
      limitations: [
        "\u4E0D\u540C\u5B66\u6821\u7684\u65B0\u7248\u6B63\u65B9\u9875\u9762\u3001\u5B57\u6BB5\u4E0E\u5B66\u671F\u4EE3\u7801\u5B58\u5728\u5DEE\u5F02\u3002",
        "\u5B66\u671F\u5F00\u59CB\u65E5\u671F\u4E0E\u8282\u6B21\u65F6\u95F4\u901A\u5E38\u9700\u8981\u7528\u6237\u786E\u8BA4\u3002",
        "\u672A\u5B8C\u6210\u771F\u5B9E\u5B66\u6821\u7AEF\u5230\u7AEF\u9A8C\u6536\u3002"
      ]
    };
  }
  function parseTermSelectors(context, semester) {
    const xnmElement = context.document.querySelector("#xnm, [name='xnm']");
    const xqmElement = context.document.querySelector("#xqm, [name='xqm']");
    const xnm = xnmElement?.value?.trim() || (semester.academicYear?.split("-")[0] ?? semester.semesterStart.slice(0, 4));
    let xqm = xqmElement?.value?.trim() || semester.termCode || "3";
    if (xqm === "1") xqm = "3";
    if (xqm === "2") xqm = "12";
    return { xnm, xqm, termName: semester.termName };
  }
  async function normalizeZfRows(rows, descriptor4) {
    const coursesByKey = /* @__PURE__ */ new Map();
    const warnings = [];
    let skipped = 0;
    for (const [index, row] of rows.entries()) {
      const name = str3(row.kcmc);
      const weekday = Number(str3(row.xqj));
      const jcsRaw = str3(row.jcs || row.jc);
      const zcd = str3(row.zcd);
      const period = parsePeriodRange(jcsRaw);
      const weekResult = parseWeeksDetailed(zcd);
      if (!name || !Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !period || weekResult.weeks.length === 0) {
        skipped += 1;
        warnings.push(`\u6B63\u65B9\u7B2C ${index + 1} \u884C\u5B57\u6BB5\u4E0D\u5B8C\u6574\uFF0C\u5DF2\u8DF3\u8FC7`);
        continue;
      }
      const sourceCourseId = [str3(row.kch), str3(row.jxbmc), str3(row.kcb)].filter(Boolean).join("|") || `row:${index + 1}`;
      const courseId = await makeCourseId({
        adapterId: descriptor4.id,
        sourceCourseId,
        sourceRef: `row:${index + 1}`,
        fallbackOrdinal: index + 1
      });
      const sourceMeetingId = [str3(row.kch), str3(row.jxbmc), str3(row.xqj), str3(row.jcs || row.jc), zcd].join("|");
      const meetingId = await makeMeetingId({
        courseId,
        sourceMeetingId,
        weekday,
        startPeriod: period.start,
        endPeriod: period.end,
        weeks: weekResult.weeks
      });
      const meeting = {
        id: meetingId,
        teacher: str3(row.xm || row.jsxm),
        room: str3(row.cdmc || row.cd_id),
        campus: str3(row.xqmc),
        weekday,
        startPeriod: period.start,
        endPeriod: period.end,
        weeks: weekResult.weeks,
        weekRule: zcd,
        source: {
          adapterId: descriptor4.id,
          adapterVersion: descriptor4.version,
          sourceCourseId,
          sourceRef: `row:${index + 1}`
        }
      };
      const existing = coursesByKey.get(courseId);
      if (existing) {
        existing.meetings.push(meeting);
      } else {
        const credits = Number(str3(row.xf));
        coursesByKey.set(courseId, {
          id: courseId,
          name,
          category: str3(row.kcxzmc || row.kclbmc),
          credits: Number.isFinite(credits) && credits > 0 ? credits : void 0,
          teachingClass: str3(row.jxbmc),
          source: {
            adapterId: descriptor4.id,
            adapterVersion: descriptor4.version,
            sourceCourseId,
            sourceRef: `row:${index + 1}`
          },
          meetings: [meeting]
        });
      }
    }
    return { courses: [...coursesByKey.values()], warnings, skipped };
  }
  function createZfAdapter() {
    const descriptor4 = zfDescriptor();
    return {
      descriptor: descriptor4,
      async detect(context) {
        const evidence = [];
        if (context.url.pathname.includes("/jwglxt/") || context.url.pathname.includes("/kbcx/")) evidence.push("jwglxt/kbcx \u8DEF\u5F84");
        const text = context.document.documentElement?.textContent ?? "";
        if (text.includes("\u6B63\u65B9") || /zftal|jwglxt/i.test(context.document.documentElement?.innerHTML ?? "")) evidence.push("\u6B63\u65B9\u9875\u9762\u7279\u5F81");
        const confidence = evidence.length >= 2 ? 0.92 : evidence.length === 1 ? 0.68 : 0;
        return {
          detected: confidence > 0,
          adapterId: descriptor4.id,
          confidence,
          vendor: "zf",
          evidence,
          reason: confidence > 0 ? void 0 : "\u672A\u53D1\u73B0\u6B63\u65B9\u6559\u52A1\u7279\u5F81"
        };
      },
      async extract(context, semester) {
        const term = parseTermSelectors(context, semester);
        const endpoints = [
          `${context.url.origin}/jwglxt/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N253508`,
          `${context.url.origin}/jwglxt/kbcx/xskbcx_cxXsKb.html?gnmkdm=N2151`
        ];
        let response = null;
        for (const endpoint of endpoints) {
          try {
            response = await postForm(
              endpoint,
              { xnm: term.xnm, xqm: term.xqm, kzlx: "ck" },
              context.fetchImpl
            );
            if (Array.isArray(response.kbList) && response.kbList.length > 0) break;
          } catch {
          }
        }
        const rows = [...response?.kbList ?? [], ...response?.sjkList ?? []];
        if (rows.length > 0) {
          const normalized = await normalizeZfRows(rows, descriptor4);
          if (normalized.courses.length === 0) {
            throw new Error("\u6B63\u65B9\u63A5\u53E3\u8FD4\u56DE\u4E86\u6570\u636E\uFF0C\u4F46\u6CA1\u6709\u53EF\u89E3\u6790\u7684\u8BFE\u7A0B\uFF1B\u5B57\u6BB5\u7ED3\u6784\u53EF\u80FD\u5DF2\u53D8\u5316");
          }
          const parsedCount = normalized.courses.reduce((sum, course) => sum + course.meetings.length, 0);
          const draft = {
            descriptor: descriptor4,
            term: {
              termId: `${term.xnm}-${term.xqm}`,
              academicYear: semester.academicYear ?? `${term.xnm}-${Number(term.xnm) + 1}`,
              termCode: term.xqm,
              termName: term.termName,
              semesterStart: semester.semesterStart,
              teachingWeeks: semester.teachingWeeks ?? Math.max(1, ...rows.flatMap((row) => parseWeeksDetailed(str3(row.zcd)).weeks)),
              timezone: semester.timezone ?? "Asia/Shanghai",
              campus: semester.campus,
              periodSchedules: [
                {
                  id: `zf-periods-${semester.semesterStart}`,
                  label: "\u6B63\u65B9\u9ED8\u8BA4/\u7528\u6237\u786E\u8BA4\u4F5C\u606F",
                  effectiveFrom: semester.semesterStart,
                  periods: DEFAULT_PERIODS.map((period) => ({ ...period }))
                }
              ]
            },
            courses: normalized.courses,
            overrides: [],
            metadata: {
              method: "api",
              sourceUrl: `${context.url.origin}/jwglxt/kbcx/`,
              rawCount: rows.length,
              parsedCount,
              skippedCount: normalized.skipped,
              platform: descriptor4.vendorLabel,
              userNote: "\u4EC5\u8C03\u7528\u6B63\u65B9\u53EA\u8BFB\u8BFE\u8868\u67E5\u8BE2\u63A5\u53E3"
            },
            warnings: normalized.warnings
          };
          return {
            draft,
            rawRows: rows.length,
            parsedRows: parsedCount,
            skippedRows: normalized.skipped,
            evidence: ["zf-jwglxt", "kbList/sjkList"]
          };
        }
        const fallback = await extractDomTimetable(context, semester, descriptor4);
        fallback.draft.warnings.unshift("\u6B63\u65B9\u7ED3\u6784\u5316\u63A5\u53E3\u4E0D\u53EF\u7528\uFF0C\u5DF2\u56DE\u9000 DOM\uFF1B\u8C03\u8BFE\u4E0E\u5B66\u671F\u4FE1\u606F\u53EF\u80FD\u4E0D\u5B8C\u6574");
        return fallback;
      },
      validate(timetable) {
        return validateTimetableV2(timetable);
      }
    };
  }

  // src/connectors/vendors/qiangzhi.ts
  function descriptor() {
    return {
      id: "qiangzhi-dom",
      version: "0.5.0",
      vendor: "qiangzhi",
      vendorLabel: "\u5F3A\u667A\u6559\u52A1",
      platformVersion: "DOM generic",
      status: "experimental",
      capabilities: ["timetable", "classroom"],
      verifiedDomains: [],
      methods: ["dom"],
      limitations: [
        "\u5F53\u524D\u7248\u672C\u4F7F\u7528 DOM \u8868\u683C\u63D0\u53D6\uFF0C\u65E0\u6CD5\u4FDD\u8BC1\u83B7\u5F97\u5B98\u65B9\u8C03\u8BFE\u6570\u636E\u3002",
        "\u4E0D\u540C\u5F3A\u667A\u90E8\u7F72\u7684\u5355\u5143\u683C\u7ED3\u6784\u53EF\u80FD\u4E0D\u540C\u3002",
        "\u672A\u5B8C\u6210\u771F\u5B9E\u5B66\u6821\u7AEF\u5230\u7AEF\u9A8C\u6536\u3002"
      ]
    };
  }
  function createQiangzhiAdapter() {
    const info = descriptor();
    return {
      descriptor: info,
      async detect(context) {
        const evidence = [];
        if (context.url.pathname.includes("/jsxsd/") || context.url.pathname.includes("/quanxue/")) evidence.push("jsxsd/quanxue \u8DEF\u5F84");
        if (context.document.querySelector("#kbtable, .Nsb_r_list, #kblist")) evidence.push("\u8BFE\u8868\u8868\u683C\u5143\u7D20");
        const text = context.document.documentElement?.textContent ?? "";
        if (text.includes("\u5F3A\u667A")) evidence.push("\u5F3A\u667A\u9875\u9762\u6587\u5B57");
        const confidence = evidence.length >= 2 ? 0.9 : evidence.length === 1 ? 0.62 : 0;
        return {
          detected: confidence > 0,
          adapterId: info.id,
          confidence,
          vendor: "qiangzhi",
          evidence,
          reason: confidence > 0 ? void 0 : "\u672A\u53D1\u73B0\u5F3A\u667A\u6559\u52A1\u7279\u5F81"
        };
      },
      async extract(context, semester) {
        return extractDomTimetable(context, semester, info);
      },
      validate(timetable) {
        return validateTimetableV2(timetable);
      }
    };
  }

  // src/connectors/vendors/qingguo.ts
  function descriptor2() {
    return {
      id: "qingguo-dom",
      version: "0.5.0",
      vendor: "qingguo",
      vendorLabel: "\u9752\u679C\u6559\u52A1",
      platformVersion: "DOM list/grid",
      status: "experimental",
      capabilities: ["timetable", "classroom"],
      verifiedDomains: [],
      methods: ["dom", "export"],
      limitations: [
        "\u5F53\u524D\u7248\u672C\u4F18\u5148\u89E3\u6790\u5DF2\u6E32\u67D3\u8868\u683C\u6216\u5B98\u65B9\u5BFC\u51FA HTML\u3002",
        "\u8C03\u8BFE\u3001\u505C\u8BFE\u4E0E\u6821\u5386\u4FE1\u606F\u53EF\u80FD\u4E0D\u53EF\u83B7\u5F97\u3002",
        "\u672A\u5B8C\u6210\u771F\u5B9E\u5B66\u6821\u7AEF\u5230\u7AEF\u9A8C\u6536\u3002"
      ]
    };
  }
  function createQingguoAdapter() {
    const info = descriptor2();
    return {
      descriptor: info,
      async detect(context) {
        const evidence = [];
        const text = context.document.documentElement?.textContent ?? "";
        if (text.includes("\u9752\u679C")) evidence.push("\u9752\u679C\u9875\u9762\u6587\u5B57");
        if (text.includes("\u4E0A\u8BFE\u65F6\u95F4\u5730\u70B9")) evidence.push("\u9752\u679C\u5217\u8868\u5B57\u6BB5");
        const tables = context.document.querySelectorAll("table").length;
        if (tables > 0 && (text.includes("\u5468\u6B21") || text.includes("\u8282\u6B21"))) evidence.push("\u8BFE\u8868\u8868\u683C\u7ED3\u6784");
        const confidence = evidence.length >= 2 ? 0.88 : evidence.length === 1 ? 0.6 : 0;
        return {
          detected: confidence > 0,
          adapterId: info.id,
          confidence,
          vendor: "qingguo",
          evidence,
          reason: confidence > 0 ? void 0 : "\u672A\u53D1\u73B0\u9752\u679C\u6559\u52A1\u7279\u5F81"
        };
      },
      async extract(context, semester) {
        return extractDomTimetable(context, semester, info);
      },
      validate(timetable) {
        return validateTimetableV2(timetable);
      }
    };
  }

  // src/connectors/generic/generic-adapter.ts
  function descriptor3() {
    return {
      id: "generic-dom",
      version: "0.5.0",
      vendor: "generic",
      vendorLabel: "\u901A\u7528 HTML \u8868\u683C",
      status: "experimental",
      capabilities: ["timetable"],
      verifiedDomains: [],
      methods: ["dom"],
      limitations: [
        "\u4EC5\u5728\u7528\u6237\u4E3B\u52A8\u70B9\u51FB\u63D0\u53D6\u65F6\u8FD0\u884C\u3002",
        "\u4E0D\u4FDD\u8BC1\u83B7\u5F97\u8C03\u8BFE\u3001\u6821\u5386\u3001\u5B66\u5206\u6216\u8BFE\u7A0B\u6027\u8D28\u3002",
        "\u683C\u5F0F\u590D\u6742\u65F6\u8BF7\u4F7F\u7528\u6587\u4EF6\u5BFC\u51FA\u5E76\u5BFC\u5165 Web/Python\u3002"
      ]
    };
  }
  function createGenericDomAdapter() {
    const info = descriptor3();
    return {
      descriptor: info,
      async detect(context) {
        const tables = context.document.querySelectorAll("table").length;
        const text = context.document.documentElement?.textContent ?? "";
        const evidence = tables > 0 && (text.includes("\u661F\u671F\u4E00") || text.includes("\u5468\u4E00")) ? ["HTML \u661F\u671F\u8868\u5934"] : [];
        return {
          detected: evidence.length > 0,
          adapterId: info.id,
          confidence: evidence.length > 0 ? 0.45 : 0,
          vendor: "generic",
          evidence,
          reason: evidence.length > 0 ? void 0 : "\u5F53\u524D\u9875\u9762\u6CA1\u6709\u53EF\u8BC6\u522B\u7684\u8BFE\u8868\u8868\u683C"
        };
      },
      async extract(context, semester) {
        return extractDomTimetable(context, semester, info);
      },
      validate(timetable) {
        return validateTimetableV2(timetable);
      }
    };
  }

  // src/connectors/registry.ts
  var NoConnectorDetectedError = class extends Error {
    candidates;
    constructor(message, candidates) {
      super(message);
      this.name = "NoConnectorDetectedError";
      this.candidates = candidates;
    }
  };
  function createConnectorRegistry() {
    return [
      createWhutAdapter(),
      createZfAdapter(),
      createQiangzhiAdapter(),
      createQingguoAdapter(),
      createWiseduAdapter(),
      createGenericDomAdapter()
    ];
  }
  function connectorManifests() {
    return createConnectorRegistry().map((adapter) => adapter.descriptor);
  }
  function listSchoolProfiles() {
    return [WHUT_PROFILE];
  }
  function createPageConnectorContext(now = () => /* @__PURE__ */ new Date()) {
    return {
      url: new URL(window.location.href),
      document,
      fetchImpl: window.fetch.bind(window),
      now
    };
  }
  async function detectCurrentPage(context = createPageConnectorContext(), preferredAdapterId) {
    const adapters = createConnectorRegistry();
    const ordered = preferredAdapterId ? [
      ...adapters.filter((adapter) => adapter.descriptor.id === preferredAdapterId),
      ...adapters.filter((adapter) => adapter.descriptor.id !== preferredAdapterId)
    ] : adapters;
    const candidates = [];
    for (const adapter of ordered) {
      try {
        const detection = await adapter.detect(context);
        if (detection.detected) candidates.push({ adapter, detection });
      } catch {
      }
    }
    return candidates.sort((left, right) => right.detection.confidence - left.detection.confidence);
  }
  async function extractCurrentPage(options) {
    const context = options.context ?? createPageConnectorContext();
    const candidates = await detectCurrentPage(context, options.preferredAdapterId);
    const selected = candidates[0];
    if (!selected) {
      throw new NoConnectorDetectedError(
        "\u672A\u8BC6\u522B\u5F53\u524D\u6559\u52A1\u7CFB\u7EDF\u3002\u8BF7\u786E\u8BA4\u5DF2\u767B\u5F55\u5E76\u505C\u7559\u5728\u8BFE\u8868\u9875\u9762\uFF0C\u6216\u6539\u7528\u6587\u4EF6\u5BFC\u5165\u3002",
        candidates
      );
    }
    const extraction = await selected.adapter.extract(context, options.semester);
    const timetable = finalizeConnectorExtraction(extraction, selected.adapter.descriptor, options.semester, {
      sourceKind: options.sourceKind,
      sourceUrl: context.url.href
    });
    return { timetable, detection: selected.detection, evidence: extraction.evidence };
  }

  // src/connectors/page-runtime.ts
  window.__tericsConnectorRuntime = {
    version: "0.5.0-rc.2",
    manifests: connectorManifests,
    schools: listSchoolProfiles,
    detect: async () => {
      const candidates = await detectCurrentPage();
      return candidates.map((candidate) => ({
        adapterId: candidate.adapter.descriptor.id,
        schoolId: candidate.adapter.descriptor.schoolId,
        schoolName: candidate.adapter.descriptor.schoolName,
        vendor: candidate.adapter.descriptor.vendor,
        confidence: candidate.detection.confidence,
        evidence: candidate.detection.evidence
      }));
    },
    extract: async (semester, preferredAdapterId) => extractCurrentPage({ semester, sourceKind: "desktop", preferredAdapterId })
  };
})();
