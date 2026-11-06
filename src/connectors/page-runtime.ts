import { connectorManifests, detectCurrentPage, extractCurrentPage, listSchoolProfiles } from "./registry";
import type { SemesterSelection } from "../v2/types";

declare global {
  interface Window {
    __tericsConnectorRuntime?: {
      version: string;
      manifests: typeof connectorManifests;
      schools: typeof listSchoolProfiles;
      detect: () => Promise<unknown>;
      extract: (semester: SemesterSelection, preferredAdapterId?: string) => Promise<unknown>;
    };
  }
}

window.__tericsConnectorRuntime = {
  version: "0.6.0-rc.1",
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
      evidence: candidate.detection.evidence,
    }));
  },
  extract: async (semester, preferredAdapterId) => extractCurrentPage({ semester, sourceKind: "desktop", preferredAdapterId }),
};
