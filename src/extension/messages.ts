import { NoConnectorDetectedError, extractCurrentPage } from "../connectors/registry";
import type { SemesterSelection } from "../v2/types";
import { inspectTimetableV2 } from "../v2/validate";

export interface ExtensionExtractMessage {
  type: "terics.extract";
  semester: SemesterSelection;
  preferredAdapterId?: string;
}

export type ExtensionExtractResponse =
  | {
      ok: true;
      timetable: unknown;
      detection: unknown;
      evidence: string[];
      warnings: string[];
    }
  | {
      ok: false;
      error: string;
      code: "no_connector" | "extract_failed" | "invalid_message";
      candidates?: Array<{ adapterId: string; schoolName?: string; confidence: number }>;
    };

export async function handleExtractMessage(
  message: unknown,
  extractor: typeof extractCurrentPage = extractCurrentPage,
): Promise<ExtensionExtractResponse> {
  const input = message as Partial<ExtensionExtractMessage> | null;
  if (!input || input.type !== "terics.extract" || !input.semester) {
    return { ok: false, error: "扩展消息格式无效", code: "invalid_message" };
  }
  try {
    const result = await extractor({
      semester: input.semester,
      sourceKind: "extension",
      preferredAdapterId: input.preferredAdapterId,
    });
    const inspected = inspectTimetableV2(result.timetable);
    if (!inspected.valid) {
      return { ok: false, error: inspected.issues.map((issue) => issue.message).join("; "), code: "extract_failed" };
    }
    return {
      ok: true,
      timetable: result.timetable,
      detection: result.detection,
      evidence: result.evidence,
      warnings: result.timetable.warnings ?? [],
    };
  } catch (error) {
    const possible = error as NoConnectorDetectedError;
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      code: error instanceof NoConnectorDetectedError ? "no_connector" : "extract_failed",
      candidates:
        error instanceof NoConnectorDetectedError
          ? possible.candidates.map((candidate) => ({
              adapterId: candidate.adapter.descriptor.id,
              schoolName: candidate.adapter.descriptor.schoolName,
              confidence: candidate.detection.confidence,
            }))
          : [],
    };
  }
}
