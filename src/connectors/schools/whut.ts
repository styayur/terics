import type { SchoolProfile } from "../sdk/schools";

export const WHUT_PROFILE: SchoolProfile = {
  id: "whut",
  name: "武汉理工大学",
  vendor: "wisedu",
  platformVersion: "jwapp / wdkbby (2026 layout)",
  entryUrl: "https://jwxt.whut.edu.cn/jwapp/sys/homeapp/index.do?forceCas=1",
  domains: ["jwxt.whut.edu.cn", "zhlgd.whut.edu.cn"],
  status: "experimental",
  capabilities: ["timetable", "semester", "periods", "classroom", "adjustments"],
  methods: ["api", "dom"],
  evidenceUrls: [
    "https://github.com/lingion/sleepy/blob/main/app/src/main/java/com/lingion/sleepy/data/jw/JwWhutParser.kt",
    "https://github.com/lingion/sleepy/blob/main/docs/schools-list.md",
  ],
  limitations: [
    "协议结构来自公开 MIT/行为研究资料，尚未完成本项目的真实学生账号端到端验收。",
    "学期第一周周一通常需要用户确认。",
    "调课数据仅在教务接口明确返回时使用，缺失时不会自动推断。",
  ],
};

export const SCHOOL_PROFILES = [WHUT_PROFILE];
