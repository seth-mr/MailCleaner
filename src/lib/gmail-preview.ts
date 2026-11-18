export interface GmailMimeHeader {
  name?: string;
  value?: string;
}

export interface GmailMimeBody {
  attachmentId?: string;
  size?: number;
  data?: string;
}

export interface GmailMimePayload {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailMimeHeader[];
  body?: GmailMimeBody;
  parts?: GmailMimePayload[];
}

export interface ExtractedEmailBodies {
  textBody: string | null;
  htmlBody: string | null;
}

/**
 * Decodes a Gmail API Base64URL-encoded string into a UTF-8 string.
 */
export function decodeBase64UrlUtf8(encoded: string): string {
  if (typeof encoded !== "string") {
    return "";
  }

  const compact = encoded.replace(/\s+/g, "");
  if (compact.length === 0) {
    return "";
  }

  const standardBase64 = compact.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (standardBase64.length % 4)) % 4;
  const padded =
    paddingLength === 0
      ? standardBase64
      : standardBase64 + "=".repeat(paddingLength);

  return Buffer.from(padded, "base64").toString("utf8");
}

function getNormalizedMimeType(mimeType?: string): string {
  if (typeof mimeType !== "string") {
    return "";
  }
  return mimeType.split(";")[0].trim().toLowerCase();
}

function isAttachmentPart(part: GmailMimePayload): boolean {
  const headers = part.headers ?? [];
  let isInline = false;

  for (const header of headers) {
    if (header.name?.toLowerCase() === "content-disposition") {
      const value = (header.value ?? "").trim().toLowerCase();
      if (value.startsWith("attachment")) {
        return true;
      }
      if (value.startsWith("inline")) {
        isInline = true;
      }
    }
  }

  const hasFilename =
    typeof part.filename === "string" && part.filename.trim().length > 0;
  if (hasFilename && !isInline) {
    return true;
  }

  return false;
}

/**
 * Recursively traverses a Gmail message MIME payload to extract the primary
 * `text/plain` and `text/html` bodies, skipping attachment parts.
 */
export function extractEmailBodiesFromPayload(
  payload?: GmailMimePayload,
): ExtractedEmailBodies {
  if (!payload) {
    return { textBody: null, htmlBody: null };
  }

  let textBody: string | null = null;
  let htmlBody: string | null = null;

  const visitPart = (part: GmailMimePayload) => {
    if (textBody !== null && htmlBody !== null) {
      return;
    }

    const mimeType = getNormalizedMimeType(part.mimeType);
    const hasSubParts = Array.isArray(part.parts) && part.parts.length > 0;

    if (
      (mimeType === "text/plain" || mimeType === "text/html") &&
      !isAttachmentPart(part) &&
      typeof part.body?.data === "string" &&
      part.body.data.length > 0
    ) {
      const decoded = decodeBase64UrlUtf8(part.body.data);
      if (decoded.length > 0) {
        if (mimeType === "text/plain" && textBody === null) {
          textBody = decoded;
        } else if (mimeType === "text/html" && htmlBody === null) {
          htmlBody = decoded;
        }
      }
    }

    if (hasSubParts && part.parts) {
      for (const child of part.parts) {
        visitPart(child);
        if (textBody !== null && htmlBody !== null) {
          break;
        }
      }
    }
  };

  visitPart(payload);

  return { textBody, htmlBody };
}
