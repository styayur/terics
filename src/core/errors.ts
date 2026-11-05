import type { ParseIssue } from "./types";

export class TericsParseError extends Error {
  readonly issues: ParseIssue[];

  constructor(message: string, issues: ParseIssue[] = []) {
    super(message);
    this.name = "TericsParseError";
    this.issues = issues;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
