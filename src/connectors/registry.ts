import type { ConnectorContext, DetectionResult, SemesterSelection, SISAdapter } from "../v2/types";
import type { SchoolProfile } from "./sdk/schools";
import { finalizeConnectorExtraction } from "./sdk/normalize";
import { WHUT_PROFILE } from "./schools/whut";
import { createWhutAdapter } from "./schools/whut-adapter";
import { createWiseduAdapter } from "./vendors/wisedu";
import { createZfAdapter } from "./vendors/zf";
import { createQiangzhiAdapter } from "./vendors/qiangzhi";
import { createQingguoAdapter } from "./vendors/qingguo";
import { createGenericDomAdapter } from "./generic/generic-adapter";

export interface DetectionCandidate {
  adapter: SISAdapter;
  detection: DetectionResult;
}

export class NoConnectorDetectedError extends Error {
  readonly candidates: DetectionCandidate[];

  constructor(message: string, candidates: DetectionCandidate[]) {
    super(message);
    this.name = "NoConnectorDetectedError";
    this.candidates = candidates;
  }
}

export function createConnectorRegistry(): SISAdapter[] {
  return [
    createWhutAdapter(),
    createZfAdapter(),
    createQiangzhiAdapter(),
    createQingguoAdapter(),
    createWiseduAdapter(),
    createGenericDomAdapter(),
  ];
}

export function connectorManifests() {
  return createConnectorRegistry().map((adapter) => adapter.descriptor);
}

export function listSchoolProfiles(): SchoolProfile[] {
  return [WHUT_PROFILE];
}

export function createPageConnectorContext(now: () => Date = () => new Date()): ConnectorContext {
  return {
    url: new URL(window.location.href),
    document,
    fetchImpl: window.fetch.bind(window),
    now,
  };
}

export async function detectCurrentPage(
  context: ConnectorContext = createPageConnectorContext(),
  preferredAdapterId?: string,
): Promise<DetectionCandidate[]> {
  const adapters = createConnectorRegistry();
  const ordered = preferredAdapterId
    ? [
        ...adapters.filter((adapter) => adapter.descriptor.id === preferredAdapterId),
        ...adapters.filter((adapter) => adapter.descriptor.id !== preferredAdapterId),
      ]
    : adapters;
  const candidates: DetectionCandidate[] = [];
  for (const adapter of ordered) {
    try {
      const detection = await adapter.detect(context);
      if (detection.detected) candidates.push({ adapter, detection });
    } catch {
      // A broken detector must not block other adapters.
    }
  }
  return candidates.sort((left, right) => right.detection.confidence - left.detection.confidence);
}

export async function extractCurrentPage(options: {
  semester: SemesterSelection;
  sourceKind: "extension" | "desktop";
  preferredAdapterId?: string;
  context?: ConnectorContext;
}) {
  const context = options.context ?? createPageConnectorContext();
  const candidates = await detectCurrentPage(context, options.preferredAdapterId);
  const selected = candidates[0];
  if (!selected) {
    throw new NoConnectorDetectedError(
      "未识别当前教务系统。请确认已登录并停留在课表页面，或改用文件导入。",
      candidates,
    );
  }
  const extraction = await selected.adapter.extract(context, options.semester);
  const timetable = finalizeConnectorExtraction(extraction, selected.adapter.descriptor, options.semester, {
    sourceKind: options.sourceKind,
    sourceUrl: context.url.href,
  });
  return { timetable, detection: selected.detection, evidence: extraction.evidence };
}
