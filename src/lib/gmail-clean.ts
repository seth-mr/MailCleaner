export const GMAIL_BATCH_LIMIT = 1000;

export const GMAIL_CLEAN_ACTIONS = [
  "trash",
  "delete",
  "untrash",
  "archive",
  "mark_read",
] as const;
export type CleanAction = (typeof GMAIL_CLEAN_ACTIONS)[number];

export interface ValidatedCleanRequest {
  messageIds: string[];
  action: CleanAction;
  confirmPermanentDelete: boolean;
  restoreReclaimedBytes?: number;
}

export type CleanRequestValidationResult =
  | { ok: true; data: ValidatedCleanRequest }
  | { ok: false; error: string };

/**
 * Normalizes an unknown list of message IDs by keeping non-empty trimmed strings
 * and deduplicating while preserving original order.
 */
export function normalizeMessageIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const item of ids) {
    if (typeof item !== "string") {
      continue;
    }
    const trimmed = item.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

/**
 * Splits a list of message IDs into fixed-size batches within Gmail API limits.
 */
export function chunkMessageIds(
  ids: string[],
  chunkSize = GMAIL_BATCH_LIMIT,
): string[][] {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError("chunkSize must be a positive integer.");
  }

  if (ids.length === 0) {
    return [];
  }

  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += chunkSize) {
    chunks.push(ids.slice(index, index + chunkSize));
  }

  return chunks;
}

function isCleanAction(value: unknown): value is CleanAction {
  return (
    typeof value === "string" &&
    (GMAIL_CLEAN_ACTIONS as readonly string[]).includes(value)
  );
}

/**
 * Validates the JSON payload for the Gmail message cleaning endpoint.
 */
export function validateCleanRequestBody(
  body: unknown,
): CleanRequestValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      ok: false,
      error: "Request body must be a JSON object.",
    };
  }

  const candidate = body as Record<string, unknown>;

  if (!isCleanAction(candidate.action)) {
    return {
      ok: false,
      error:
        'Invalid action. Expected "trash", "delete", "untrash", "archive", or "mark_read".',
    };
  }

  if (!Array.isArray(candidate.messageIds)) {
    return {
      ok: false,
      error: "messageIds must be a non-empty array of message IDs.",
    };
  }

  const messageIds = normalizeMessageIds(candidate.messageIds);
  if (messageIds.length === 0) {
    return {
      ok: false,
      error: "messageIds must contain at least one non-empty message ID.",
    };
  }

  if (
    candidate.action === "delete" &&
    candidate.confirmPermanentDelete !== true
  ) {
    return {
      ok: false,
      error:
        "Permanent deletion requires confirmPermanentDelete to be explicitly set to true.",
    };
  }

  let restoreReclaimedBytes: number | undefined;
  if (
    candidate.action === "untrash" &&
    candidate.restoreReclaimedBytes !== undefined
  ) {
    if (
      typeof candidate.restoreReclaimedBytes !== "number" ||
      !Number.isFinite(candidate.restoreReclaimedBytes) ||
      candidate.restoreReclaimedBytes < 0
    ) {
      return {
        ok: false,
        error: "restoreReclaimedBytes must be a finite non-negative number.",
      };
    }
    restoreReclaimedBytes = Math.trunc(candidate.restoreReclaimedBytes);
  }

  const data: ValidatedCleanRequest = {
    messageIds,
    action: candidate.action,
    confirmPermanentDelete: candidate.confirmPermanentDelete === true,
  };
  if (restoreReclaimedBytes !== undefined) {
    data.restoreReclaimedBytes = restoreReclaimedBytes;
  }

  return {
    ok: true,
    data,
  };
}

export interface ValidatedEmptyTrashRequest {
  confirmEmptyTrash: true;
}

export type EmptyTrashValidationResult =
  | { ok: true; data: ValidatedEmptyTrashRequest }
  | { ok: false; error: string };

/**
 * Validates the JSON payload for the Gmail Empty Trash endpoint.
 */
export function validateEmptyTrashBody(
  body: unknown,
): EmptyTrashValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      ok: false,
      error: "Request body must be a JSON object.",
    };
  }

  const candidate = body as Record<string, unknown>;
  if (candidate.confirmEmptyTrash !== true) {
    return {
      ok: false,
      error:
        "Emptying Trash requires confirmEmptyTrash to be explicitly set to true.",
    };
  }

  return {
    ok: true,
    data: {
      confirmEmptyTrash: true,
    },
  };
}
