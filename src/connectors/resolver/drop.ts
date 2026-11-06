const URL_PATTERN = /https?:\/\/[^\s"'<>]+/i;

function firstHttpUrl(value: string): string | null {
  return value.match(URL_PATTERN)?.[0]?.replace(/[),.;]+$/, "") ?? null;
}

export interface DroppedUrlParts {
  uriList?: string;
  plainText?: string;
  html?: string;
}

export function extractDroppedUrl(parts: DroppedUrlParts): string | null {
  if (parts.uriList) {
    const candidate = parts.uriList
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#"));
    if (candidate) return firstHttpUrl(candidate) ?? candidate;
  }
  if (parts.plainText) {
    const candidate = firstHttpUrl(parts.plainText);
    if (candidate) return candidate;
  }
  if (parts.html) {
    const parsed = new DOMParser().parseFromString(parts.html, "text/html");
    for (const anchor of parsed.querySelectorAll("a[href]")) {
      const href = anchor.getAttribute("href") ?? "";
      if (/^https?:\/\//i.test(href)) return href;
    }
  }
  return null;
}
