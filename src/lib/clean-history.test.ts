import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type * as CleanHistoryModule from "./clean-history";

const {
  CLEAN_HISTORY_ACTIONS,
  CLEAN_HISTORY_LIMIT,
  isCleanHistoryAction,
  normalizeCleanHistoryAction,
  normalizeCleanMetric,
  formatCleanLogSummary,
  serializeCleanLogRecord,
} = (await import(
  new URL("./clean-history.ts", import.meta.url).href
)) as typeof CleanHistoryModule;

describe("clean-history constants and guards", () => {
  it("exports expected actions and history limit", () => {
    assert.deepEqual(CLEAN_HISTORY_ACTIONS, [
      "trash",
      "delete",
      "untrash",
      "archive",
      "mark_read",
      "empty_trash",
    ]);
    assert.equal(CLEAN_HISTORY_LIMIT, 25);
  });

  it("validates and normalizes clean history actions", () => {
    assert.equal(isCleanHistoryAction("trash"), true);
    assert.equal(isCleanHistoryAction("empty_trash"), true);
    assert.equal(isCleanHistoryAction("unknown"), false);
    assert.equal(normalizeCleanHistoryAction(" DELETE "), "delete");
    assert.equal(normalizeCleanHistoryAction("invalid"), "trash");
    assert.equal(normalizeCleanHistoryAction(null), "trash");
  });

  it("normalizes metrics to non-negative integers", () => {
    assert.equal(normalizeCleanMetric(42.9), 42);
    assert.equal(normalizeCleanMetric(-10), 0);
    assert.equal(normalizeCleanMetric(Number.NaN), 0);
    assert.equal(normalizeCleanMetric("12"), 0);
  });
});

describe("formatCleanLogSummary", () => {
  it("formats singular and plural summaries for every action", () => {
    assert.equal(formatCleanLogSummary("trash", 1), "Moved 1 message to Trash");
    assert.equal(
      formatCleanLogSummary("trash", 5),
      "Moved 5 messages to Trash",
    );
    assert.equal(
      formatCleanLogSummary("delete", 3),
      "Permanently deleted 3 messages",
    );
    assert.equal(
      formatCleanLogSummary("untrash", 2),
      "Restored 2 messages from Trash",
    );
    assert.equal(formatCleanLogSummary("archive", 1), "Archived 1 message");
    assert.equal(
      formatCleanLogSummary("mark_read", 7),
      "Marked 7 messages as read",
    );
    assert.equal(
      formatCleanLogSummary("empty_trash", 12),
      "Emptied Trash (12 messages)",
    );
  });
});

describe("serializeCleanLogRecord", () => {
  it("serializes Date timestamps and clamps metrics", () => {
    const entry = serializeCleanLogRecord({
      id: "log_1",
      action: "delete",
      messageCount: 15,
      bytesFreed: 204800,
      summary: "  Permanently deleted 15 messages  ",
      createdAt: new Date("2026-11-17T09:00:00.000Z"),
    });

    assert.deepEqual(entry, {
      id: "log_1",
      action: "delete",
      messageCount: 15,
      bytesFreed: 204800,
      summary: "Permanently deleted 15 messages",
      createdAt: "2026-11-17T09:00:00.000Z",
    });
  });

  it("falls back to formatted summary when summary is blank", () => {
    const entry = serializeCleanLogRecord({
      id: "log_2",
      action: "empty_trash",
      messageCount: 4,
      bytesFreed: -5,
      summary: "   ",
      createdAt: "2026-11-17T10:00:00.000Z",
    });

    assert.deepEqual(entry, {
      id: "log_2",
      action: "empty_trash",
      messageCount: 4,
      bytesFreed: 0,
      summary: "Emptied Trash (4 messages)",
      createdAt: "2026-11-17T10:00:00.000Z",
    });
  });
});
