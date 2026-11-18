export const GMAIL_BATCH_ENDPOINT = "https://www.googleapis.com/batch/gmail/v1";
export const GMAIL_METADATA_BATCH_SIZE = 20;

const GMAIL_MESSAGE_FIELDS = "id,sizeEstimate,internalDate,payload/headers";

export interface GmailBatchRequest {
  boundary: string;
  contentType: string;
  body: string;
}

export interface GmailBatchPartResult<TBody = unknown> {
  contentId: string | null;
  index: number | null;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  rawBody: string;
  body: TBody | null;
}

function createBatchBoundary(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `batch_${globalThis.crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Builds a Google Batch HTTP (`multipart/mixed`) request body containing one
 * `messages.get` metadata sub-request per message ID.
 */
export function buildGmailMetadataBatchRequest(
  messageIds: readonly string[],
  metadataHeaders: readonly string[],
  boundary?: string,
): GmailBatchRequest {
  const resolvedBoundary =
    typeof boundary === "string" && boundary.trim().length > 0
      ? boundary.trim()
      : createBatchBoundary();

  const params = new URLSearchParams({
    format: "metadata",
    fields: GMAIL_MESSAGE_FIELDS,
  });
  for (const header of metadataHeaders) {
    params.append("metadataHeaders", header);
  }
  const queryString = params.toString();

  if (messageIds.length === 0) {
    return {
      boundary: resolvedBoundary,
      contentType: `multipart/mixed; boundary=${resolvedBoundary}`,
      body: `--${resolvedBoundary}--\r\n`,
    };
  }

  const parts = messageIds.map((id, index) =>
    [
      `--${resolvedBoundary}`,
      "Content-Type: application/http",
      `Content-ID: <item-${index}>`,
      "",
      `GET /gmail/v1/users/me/messages/${encodeURIComponent(id)}?${queryString}`,
      "",
    ].join("\r\n"),
  );

  return {
    boundary: resolvedBoundary,
    contentType: `multipart/mixed; boundary=${resolvedBoundary}`,
    body: `${parts.join("\r\n")}\r\n--${resolvedBoundary}--\r\n`,
  };
}

/**
 * Extracts the multipart boundary token from a `Content-Type` header value.
 */
export function extractMultipartBoundary(
  contentTypeHeader: string | null,
): string | null {
  if (!contentTypeHeader) {
    return null;
  }

  const match = contentTypeHeader.match(
    /(?:^|;)\s*boundary\s*=\s*(?:"([^"]*)"|([^;\s"]+))/i,
  );
  if (!match) {
    return null;
  }

  const value = (match[1] ?? match[2] ?? "").trim();
  return value.length > 0 ? value : null;
}

function splitMultipartLines(rawBody: string, boundary: string): string[][] {
  const normalized = rawBody.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const startDelimiter = `--${boundary}`;
  const endDelimiter = `--${boundary}--`;

  const rawParts: string[][] = [];
  let currentPart: string[] = [];
  let inPart = false;

  for (const line of lines) {
    const trimmedEnd = line.trimEnd();
    if (trimmedEnd === endDelimiter) {
      if (inPart && currentPart.length > 0) {
        rawParts.push(currentPart);
      }
      currentPart = [];
      inPart = false;
      break;
    }

    if (trimmedEnd === startDelimiter) {
      if (inPart && currentPart.length > 0) {
        rawParts.push(currentPart);
      }
      currentPart = [];
      inPart = true;
      continue;
    }

    if (inPart) {
      currentPart.push(line);
    }
  }

  if (inPart && currentPart.length > 0) {
    rawParts.push(currentPart);
  }

  return rawParts;
}

function parseContentIdIndex(contentId: string | null): number | null {
  if (!contentId) {
    return null;
  }
  const match = contentId.match(/item-(\d+)/i);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parses a Gmail Batch HTTP (`multipart/mixed`) response into typed per-part results.
 */
export function parseGmailBatchResponse<TBody = unknown>(
  rawBody: string,
  boundary: string,
): GmailBatchPartResult<TBody>[] {
  const trimmedBoundary = boundary.trim();
  if (!rawBody || trimmedBoundary.length === 0) {
    return [];
  }

  const rawParts = splitMultipartLines(rawBody, trimmedBoundary);
  const results: GmailBatchPartResult<TBody>[] = [];

  for (const partLines of rawParts) {
    let cursor = 0;

    while (cursor < partLines.length && partLines[cursor].trim() === "") {
      cursor += 1;
    }

    let contentId: string | null = null;
    if (cursor < partLines.length && !/^HTTP\/\d/i.test(partLines[cursor])) {
      while (cursor < partLines.length && partLines[cursor].trim() !== "") {
        const line = partLines[cursor];
        const colonIndex = line.indexOf(":");
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim().toLowerCase();
          const value = line.slice(colonIndex + 1).trim();
          if (key === "content-id") {
            contentId = value || null;
          }
        }
        cursor += 1;
      }
    }

    while (cursor < partLines.length && partLines[cursor].trim() === "") {
      cursor += 1;
    }

    if (cursor >= partLines.length) {
      continue;
    }

    const statusMatch = partLines[cursor]
      .trim()
      .match(/^HTTP\/\d+(?:\.\d+)?\s+(\d{3})(?:\s+(.*))?$/i);
    if (!statusMatch) {
      continue;
    }

    const status = Number.parseInt(statusMatch[1], 10);
    const statusText = (statusMatch[2] ?? "").trim();
    cursor += 1;

    const headers: Record<string, string> = {};
    while (cursor < partLines.length && partLines[cursor].trim() !== "") {
      const line = partLines[cursor];
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim().toLowerCase();
        const value = line.slice(colonIndex + 1).trim();
        if (key.length > 0) {
          headers[key] = value;
        }
      }
      cursor += 1;
    }

    while (cursor < partLines.length && partLines[cursor].trim() === "") {
      cursor += 1;
    }

    const rawPartBody = partLines.slice(cursor).join("\n").trim();
    let body: TBody | null = null;
    if (rawPartBody.length > 0) {
      try {
        body = JSON.parse(rawPartBody) as TBody;
      } catch {
        body = null;
      }
    }

    results.push({
      contentId,
      index: parseContentIdIndex(contentId),
      status,
      statusText,
      headers,
      rawBody: rawPartBody,
      body,
    });
  }

  return results;
}
