import type { SchoolProfile } from "../sdk/schools";

export const WHUT_PROFILE: SchoolProfile = {
  id: "whut",
  name: "武汉理工大学",
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
    "https://github.com/lingion/sleepy/blob/main/docs/schools-list.md",
  ],
  limitations: [
    "Verified for the 2026-2027-1 student context on 2026-11-06; later WHUT variants require revalidation.",
    "The observed response had empty notArrangeList and practiceList collections; their non-empty semantics are not yet verified.",
    "No dedicated WHUT adjustment endpoint was found; cancellation/reschedule data is not auto-generated without explicit records.",
  ],
};

export const SCHOOL_PROFILES = [WHUT_PROFILE];
