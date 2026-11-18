import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type * as GmailCleanModule from "./gmail-clean";

const {
  GMAIL_BATCH_LIMIT,
  normalizeMessageIds,
  chunkMessageIds,
  validateCleanRequestBody,
  validateEmptyTrashBody,
} = (await import(
  new URL("./gmail-clean.ts", import.meta.url).href
)) as typeof GmailCleanModule;

describe("normalizeMessageIds", () => {
  it("returns an empty array for non-array inputs", () => {
    assert.deepEqual(normalizeMessageIds(null), []);
    assert.deepEqual(normalizeMessageIds(undefined), []);
    assert.deepEqual(normalizeMessageIds("msg-1"), []);
    assert.deepEqual(normalizeMessageIds({ id: "msg-1" }), []);
  });

  it("trims strings, drops non-strings and blanks, and deduplicates preserving order", () => {
    assert.deepEqual(
      normalizeMessageIds([
        "  msg-1 ",
        "",
        "   ",
        123,
        null,
        "msg-2",
        "msg-1",
        "  msg-2  ",
        "msg-3",
      ]),
      ["msg-1", "msg-2", "msg-3"],
    );
  });
});

describe("chunkMessageIds", () => {
  it("exports GMAIL_BATCH_LIMIT as 1000", () => {
    assert.equal(GMAIL_BATCH_LIMIT, 1000);
  });

  it("returns an empty array when given no IDs", () => {
    assert.deepEqual(chunkMessageIds([]), []);
  });

  it("splits IDs into chunks of the given size", () => {
    assert.deepEqual(chunkMessageIds(["a", "b", "c", "d", "e"], 2), [
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ]);
    assert.deepEqual(chunkMessageIds(["a", "b", "c"], 3), [["a", "b", "c"]]);
  });

  it("defaults to batches of 1000", () => {
    const ids = Array.from({ length: 2005 }, (_, i) => `m-${i}`);
    const chunks = chunkMessageIds(ids);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].length, 1000);
    assert.equal(chunks[1].length, 1000);
    assert.equal(chunks[2].length, 5);
  });

  it("throws when chunkSize is not a positive integer", () => {
    assert.throws(() => chunkMessageIds(["a"], 0), RangeError);
    assert.throws(() => chunkMessageIds(["a"], -5), RangeError);
    assert.throws(() => chunkMessageIds(["a"], 1.5), RangeError);
  });
});

describe("validateCleanRequestBody", () => {
  it("accepts a valid trash request without confirmPermanentDelete", () => {
    assert.deepEqual(
      validateCleanRequestBody({
        messageIds: [" m1 ", "m2", "m1", ""],
        action: "trash",
      }),
      {
        ok: true,
        data: {
          messageIds: ["m1", "m2"],
          action: "trash",
          confirmPermanentDelete: false,
        },
      },
    );
  });

  it("accepts a valid delete request when confirmPermanentDelete is strictly true", () => {
    assert.deepEqual(
      validateCleanRequestBody({
        messageIds: ["m1", "m2"],
        action: "delete",
        confirmPermanentDelete: true,
      }),
      {
        ok: true,
        data: {
          messageIds: ["m1", "m2"],
          action: "delete",
          confirmPermanentDelete: true,
        },
      },
    );
  });

  it("rejects delete requests without explicit confirmPermanentDelete: true", () => {
    const missingFlag = validateCleanRequestBody({
      messageIds: ["m1"],
      action: "delete",
    });
    assert.equal(missingFlag.ok, false);

    const falseFlag = validateCleanRequestBody({
      messageIds: ["m1"],
      action: "delete",
      confirmPermanentDelete: false,
    });
    assert.equal(falseFlag.ok, false);

    const stringFlag = validateCleanRequestBody({
      messageIds: ["m1"],
      action: "delete",
      confirmPermanentDelete: "true",
    });
    assert.equal(stringFlag.ok, false);
  });

  it("accepts a valid untrash request with optional restoreReclaimedBytes", () => {
    assert.deepEqual(
      validateCleanRequestBody({
        messageIds: ["m1", "m2"],
        action: "untrash",
      }),
      {
        ok: true,
        data: {
          messageIds: ["m1", "m2"],
          action: "untrash",
          confirmPermanentDelete: false,
        },
      },
    );

    assert.deepEqual(
      validateCleanRequestBody({
        messageIds: ["m1"],
        action: "untrash",
        restoreReclaimedBytes: 2048,
      }),
      {
        ok: true,
        data: {
          messageIds: ["m1"],
          action: "untrash",
          confirmPermanentDelete: false,
          restoreReclaimedBytes: 2048,
        },
      },
    );

    assert.deepEqual(
      validateCleanRequestBody({
        messageIds: ["m1"],
        action: "untrash",
        restoreReclaimedBytes: 0,
      }),
      {
        ok: true,
        data: {
          messageIds: ["m1"],
          action: "untrash",
          confirmPermanentDelete: false,
          restoreReclaimedBytes: 0,
        },
      },
    );
  });

  it("rejects untrash requests with invalid restoreReclaimedBytes", () => {
    assert.equal(
      validateCleanRequestBody({
        messageIds: ["m1"],
        action: "untrash",
        restoreReclaimedBytes: -10,
      }).ok,
      false,
    );
    assert.equal(
      validateCleanRequestBody({
        messageIds: ["m1"],
        action: "untrash",
        restoreReclaimedBytes: Number.NaN,
      }).ok,
      false,
    );
    assert.equal(
      validateCleanRequestBody({
        messageIds: ["m1"],
        action: "untrash",
        restoreReclaimedBytes: Number.POSITIVE_INFINITY,
      }).ok,
      false,
    );
    assert.equal(
      validateCleanRequestBody({
        messageIds: ["m1"],
        action: "untrash",
        restoreReclaimedBytes: "2048",
      }).ok,
      false,
    );
  });

  it("accepts archive and mark_read requests without confirmPermanentDelete", () => {
    assert.deepEqual(
      validateCleanRequestBody({
        messageIds: [" m1 ", "m2"],
        action: "archive",
      }),
      {
        ok: true,
        data: {
          messageIds: ["m1", "m2"],
          action: "archive",
          confirmPermanentDelete: false,
        },
      },
    );

    assert.deepEqual(
      validateCleanRequestBody({
        messageIds: ["m1", "m2"],
        action: "mark_read",
      }),
      {
        ok: true,
        data: {
          messageIds: ["m1", "m2"],
          action: "mark_read",
          confirmPermanentDelete: false,
        },
      },
    );
  });

  it("rejects unsupported actions", () => {
    const result = validateCleanRequestBody({
      messageIds: ["m1"],
      action: "spam",
    });
    assert.equal(result.ok, false);
  });

  it("rejects empty or invalid messageIds", () => {
    assert.equal(
      validateCleanRequestBody({
        messageIds: [],
        action: "trash",
      }).ok,
      false,
    );

    assert.equal(
      validateCleanRequestBody({
        messageIds: ["   ", ""],
        action: "trash",
      }).ok,
      false,
    );

    assert.equal(
      validateCleanRequestBody({
        messageIds: "m1",
        action: "trash",
      }).ok,
      false,
    );
  });

  it("rejects non-object bodies", () => {
    assert.equal(validateCleanRequestBody(null).ok, false);
    assert.equal(validateCleanRequestBody([]).ok, false);
    assert.equal(validateCleanRequestBody("invalid").ok, false);
  });
});

describe("validateEmptyTrashBody", () => {
  it("accepts confirmEmptyTrash: true", () => {
    assert.deepEqual(validateEmptyTrashBody({ confirmEmptyTrash: true }), {
      ok: true,
      data: {
        confirmEmptyTrash: true,
      },
    });
  });

  it("rejects bodies without explicit confirmEmptyTrash: true", () => {
    assert.equal(validateEmptyTrashBody({}).ok, false);
    assert.equal(validateEmptyTrashBody({ confirmEmptyTrash: false }).ok, false);
    assert.equal(validateEmptyTrashBody({ confirmEmptyTrash: "true" }).ok, false);
    assert.equal(validateEmptyTrashBody(null).ok, false);
    assert.equal(validateEmptyTrashBody([]).ok, false);
    assert.equal(validateEmptyTrashBody("invalid").ok, false);
  });
});
