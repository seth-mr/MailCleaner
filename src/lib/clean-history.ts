export const CLEAN_HISTORY_ACTIONS = [
  "trash",
  "delete",
  "untrash",
  "archive",
  "mark_read",
  "empty_trash",
] as const;

export type CleanHistoryAction = (typeof CLEAN_HISTORY_ACTIONS)[number];

export const CLEAN_HISTORY_LIMIT = 25;

export interface CleanHistoryEntry {
  id: string;
  action: CleanHistoryAction;
  messageCount: number;
  bytesFreed: number;
  summary: string;
  createdAt: string;
}

export interface CleanLogRecordLike {
  id: string;
  action: string;
  messageCount: number;
  bytesFreed: number;
  summary: string;
  createdAt: Date | string;
}

/**
 * Checks whether a value is a supported clean history action.
 */
export function isCleanHistoryAction(
  value: unknown,
): value is CleanHistoryAction {
  return (
    typeof value === "string" &&
    (CLEAN_HISTORY_ACTIONS as readonly string[]).includes(value)
  );
}

/**
 * Normalizes an unknown action string into a valid `CleanHistoryAction`.
 */
export function normalizeCleanHistoryAction(
  value: unknown,
): CleanHistoryAction {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (isCleanHistoryAction(normalized)) {
      return normalized;
    }
  }
  return "trash";
}

/**
 * Normalizes a numeric metric (count or byte total) to a non-negative integer.
 */
export function normalizeCleanMetric(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.trunc(value);
}

/**
 * Formats a concise, human-readable summary string for a persisted `CleanLog` row.
 */
export function formatCleanLogSummary(
  action: CleanHistoryAction,
  messageCount: number,
): string {
  const safeCount = normalizeCleanMetric(messageCount);
  const noun = safeCount === 1 ? "message" : "messages";

  switch (action) {
    case "trash":
      return `Moved ${safeCount} ${noun} to Trash`;
    case "delete":
      return `Permanently deleted ${safeCount} ${noun}`;
    case "untrash":
      return `Restored ${safeCount} ${noun} from Trash`;
    case "archive":
      return `Archived ${safeCount} ${noun}`;
    case "mark_read":
      return `Marked ${safeCount} ${noun} as read`;
    case "empty_trash":
      return `Emptied Trash (${safeCount} ${noun})`;
  }
}

/**
 * Serializes a Prisma `CleanLog` record into a JSON-safe `CleanHistoryEntry`.
 */
export function serializeCleanLogRecord(
  record: CleanLogRecordLike,
): CleanHistoryEntry {
  const action = normalizeCleanHistoryAction(record.action);
  const messageCount = normalizeCleanMetric(record.messageCount);
  const bytesFreed = normalizeCleanMetric(record.bytesFreed);
  const trimmedSummary =
    typeof record.summary === "string" ? record.summary.trim() : "";
  const createdAtDate =
    record.createdAt instanceof Date
      ? record.createdAt
      : new Date(record.createdAt);
  const createdAt = Number.isNaN(createdAtDate.getTime())
    ? new Date(0).toISOString()
    : createdAtDate.toISOString();

  return {
    id: record.id,
    action,
    messageCount,
    bytesFreed,
    summary:
      trimmedSummary.length > 0
        ? trimmedSummary
        : formatCleanLogSummary(action, messageCount),
    createdAt,
  };
}
