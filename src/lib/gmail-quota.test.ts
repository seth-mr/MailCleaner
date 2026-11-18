import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type * as GmailQuotaModule from "./gmail-quota";

const {
  GmailQuotaPacer,
  isGmailQuotaOrRateLimitError,
  parseRetryAfterSeconds,
} = (await import(
  new URL("./gmail-quota.ts", import.meta.url).href
)) as typeof GmailQuotaModule;

describe("isGmailQuotaOrRateLimitError", () => {
  it("returns true for HTTP 429 regardless of message", () => {
    assert.equal(isGmailQuotaOrRateLimitError(429, ""), true);
    assert.equal(
      isGmailQuotaOrRateLimitError(429, "Too Many Requests"),
      true,
    );
  });

  it("returns true for HTTP 403 Gmail Total Query Cost quota errors", () => {
    const gmailTotalQueryCostMessage =
      "Gmail messages.get request failed (403): Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user' of service 'gmail.googleapis.com' for consumer 'project_number:123456789'.";

    assert.equal(
      isGmailQuotaOrRateLimitError(403, gmailTotalQueryCostMessage),
      true,
    );
  });

  it("matches all quota and rate-limit indicators case-insensitively on 403", () => {
    assert.equal(isGmailQuotaOrRateLimitError(403, "QUOTA EXCEEDED"), true);
    assert.equal(isGmailQuotaOrRateLimitError(403, "Total Query Cost"), true);
    assert.equal(isGmailQuotaOrRateLimitError(403, "Units Per Minute"), true);
    assert.equal(isGmailQuotaOrRateLimitError(403, "rateLimitExceeded"), true);
    assert.equal(
      isGmailQuotaOrRateLimitError(403, "userRateLimitExceeded"),
      true,
    );
    assert.equal(
      isGmailQuotaOrRateLimitError(403, "Too Many Concurrent Requests"),
      true,
    );
  });

  it("returns false for 403 insufficient scopes or disabled Gmail API", () => {
    assert.equal(
      isGmailQuotaOrRateLimitError(
        403,
        "Request had insufficient authentication scopes.",
      ),
      false,
    );
    assert.equal(
      isGmailQuotaOrRateLimitError(
        403,
        "Gmail API has not been used in project 12345 before or it is disabled.",
      ),
      false,
    );
    assert.equal(
      isGmailQuotaOrRateLimitError(403, "Insufficient Permission"),
      false,
    );
  });

  it("returns false for non-403/429 statuses even when message mentions quota", () => {
    assert.equal(isGmailQuotaOrRateLimitError(400, "Quota exceeded"), false);
    assert.equal(isGmailQuotaOrRateLimitError(401, "rateLimitExceeded"), false);
    assert.equal(isGmailQuotaOrRateLimitError(500, "Quota exceeded"), false);
  });
});

describe("parseRetryAfterSeconds", () => {
  it("returns defaultSeconds when header is null, empty, or non-numeric", () => {
    assert.equal(parseRetryAfterSeconds(null), 20);
    assert.equal(parseRetryAfterSeconds(null, 15), 15);
    assert.equal(parseRetryAfterSeconds(""), 20);
    assert.equal(parseRetryAfterSeconds("   "), 20);
    assert.equal(parseRetryAfterSeconds("abc", 25), 25);
    assert.equal(
      parseRetryAfterSeconds("Wed, 21 Oct 2026 07:28:00 GMT", 30),
      30,
    );
  });

  it("returns defaultSeconds for non-positive numeric values", () => {
    assert.equal(parseRetryAfterSeconds("0"), 20);
    assert.equal(parseRetryAfterSeconds("-10", 18), 18);
  });

  it("parses valid numeric strings and clamps between 5 and 120 seconds", () => {
    assert.equal(parseRetryAfterSeconds("1"), 5);
    assert.equal(parseRetryAfterSeconds("4"), 5);
    assert.equal(parseRetryAfterSeconds("5"), 5);
    assert.equal(parseRetryAfterSeconds(" 18 "), 18);
    assert.equal(parseRetryAfterSeconds("120"), 120);
    assert.equal(parseRetryAfterSeconds("300"), 120);
    assert.equal(parseRetryAfterSeconds("12.2"), 13);
  });
});

describe("GmailQuotaPacer", () => {
  it("allows consumption within the budget with zero wait time", () => {
    const pacer = new GmailQuotaPacer({
      maxUnitsPerWindow: 10_500,
      windowMs: 60_000,
    });

    assert.equal(pacer.getWaitMs("user-1", 500, 1_000), 0);
    pacer.recordUsage("user-1", 5_000, 1_000);
    assert.equal(pacer.getWaitMs("user-1", 5_500, 2_000), 0);
    pacer.recordUsage("user-1", 5_500, 2_000);
    assert.equal(pacer.getWaitMs("user-1", 1, 2_000), 59_000);
  });

  it("computes the wait time until enough older usage expires (minimum 50ms)", () => {
    const pacer = new GmailQuotaPacer({
      maxUnitsPerWindow: 100,
      windowMs: 60_000,
    });

    pacer.recordUsage("user-1", 40, 1_000);
    pacer.recordUsage("user-1", 50, 10_000);

    // 90 used + 25 needed = 115 -> excess 15, freeing first 40-unit entry at 61_000ms.
    assert.equal(pacer.getWaitMs("user-1", 25, 20_000), 41_000);

    // 90 used + 60 needed = 150 -> excess 50, requires both entries to expire at 70_000ms.
    assert.equal(pacer.getWaitMs("user-1", 60, 20_000), 50_000);

    // Clamps short positive waits to at least 50ms.
    assert.equal(pacer.getWaitMs("user-1", 25, 60_990), 50);
  });

  it("frees quota capacity as nowMs advances past windowMs", () => {
    const pacer = new GmailQuotaPacer({
      maxUnitsPerWindow: 100,
      windowMs: 60_000,
    });

    pacer.recordUsage("user-1", 60, 1_000);
    pacer.recordUsage("user-1", 40, 15_000);

    assert.equal(pacer.getWaitMs("user-1", 20, 60_999), 50);
    // At t = 61_000, the 60-unit entry from t = 1_000 has expired.
    assert.equal(pacer.getWaitMs("user-1", 60, 61_000), 0);
    // Remaining 40 units from t = 15_000 still block a 61-unit request until 75_000.
    assert.equal(pacer.getWaitMs("user-1", 61, 61_000), 14_000);
    // At t = 75_000, all previous usage has expired.
    assert.equal(pacer.getWaitMs("user-1", 100, 75_000), 0);
  });

  it("isolates quota budgets between different users", () => {
    const pacer = new GmailQuotaPacer({
      maxUnitsPerWindow: 100,
      windowMs: 60_000,
    });

    pacer.recordUsage("user-a", 100, 5_000);
    assert.equal(pacer.getWaitMs("user-a", 10, 6_000), 59_000);
    assert.equal(pacer.getWaitMs("user-b", 100, 6_000), 0);
  });

  it("reserves quota asynchronously and waits when the sliding window is full", async () => {
    const pacer = new GmailQuotaPacer({
      maxUnitsPerWindow: 100,
      windowMs: 80,
    });

    await pacer.reserve("user-async", 80);
    assert.equal(pacer.getWaitMs("user-async", 30) > 0, true);

    await pacer.reserve("user-async", 30);
    assert.equal(pacer.getWaitMs("user-async", 70), 0);
  });
});
