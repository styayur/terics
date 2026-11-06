import type { AdapterSupportLevel } from "../../v2/types";
import { WHUT_PROFILE } from "../schools/whut";

export interface SchoolRegistryEntry {
  id: string;
  name: string;
  vendor: string;
  vendorLabel: string;
  connectorId: string;
  domains: string[];
  entryUrl: string;
  platformVersion: string;
  status: AdapterSupportLevel;
  lastVerifiedAt?: string;
  supportedPageTypes: string[];
  requiredUserInteraction: "manual-login" | "none";
  supportedFields: string[];
  versionCompatibility: string;
  limitations: string[];
  evidence: string[];
}

export const WHUT_SCHOOL_ENTRY: SchoolRegistryEntry = {
  id: WHUT_PROFILE.id,
  name: WHUT_PROFILE.name,
  vendor: WHUT_PROFILE.vendor,
  vendorLabel: "Wisedu jwapp / WHUT",
  connectorId: "whut-wisedu-jwapp",
  domains: WHUT_PROFILE.domains,
  entryUrl: WHUT_PROFILE.entryUrl,
  platformVersion: WHUT_PROFILE.platformVersion ?? "2026 jwapp layout",
  status: WHUT_PROFILE.status,
  lastVerifiedAt: WHUT_PROFILE.lastVerifiedAt,
  supportedPageTypes: ["student-home", "student-timetable"],
  requiredUserInteraction: "manual-login",
  supportedFields: ["course", "teacher", "classroom", "weekday", "teaching-weeks", "periods", "semester"],
  versionCompatibility: "Verified for 2026-2027-1 student timetable layout",
  limitations: [...WHUT_PROFILE.limitations],
  evidence: [
    "Real 2026-2027-1 student session",
    "42/42 visible semester timetable cards matched",
    "13/13 period times matched",
  ],
};

export const SCHOOL_REGISTRY = [WHUT_SCHOOL_ENTRY];

export function listSchoolEntries(): SchoolRegistryEntry[] {
  return SCHOOL_REGISTRY.map((entry) => ({ ...entry, domains: [...entry.domains], limitations: [...entry.limitations], evidence: [...entry.evidence] }));
}
