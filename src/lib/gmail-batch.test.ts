import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type * as GmailBatchModule from "./gmail-batch";

const {
  GMAIL_BATCH_ENDPOINT,
  GMAIL_METADATA_BATCH_SIZE,
  buildGmailMetadataBatchRequest,
  extractMultipartBoundary,
  parseGmailBatchResponse,
} = (await import(
  new URL("./gmail-batch.ts", import.meta.url).href
)) as typeof GmailBatchModule;

describe("gmail-batch constants", () => {
  it("exports the official Gmail batch endpoint and metadata batch size", () => {
    assert.equal(
      GMAIL_BATCH_ENDPOINT,
      "https://www.googleapis.com/batch/gmail/v1",
    );
    assert.equal(GMAIL_METADATA_BATCH_SIZE, 20);
  });
});

describe("buildGmailMetadataBatchRequest", () => {
  it("builds a multipart/mixed request with encoded IDs, fields, and metadataHeaders", () => {
    const request = buildGmailMetadataBatchRequest(
      ["msg-1", "msg/2"],
      ["From", "Subject", "List-Unsubscribe"],
      "batch_test_123",
    );

    assert.equal(request.boundary, "batch_test_123");
    assert.equal(
      request.contentType,
      "multipart/mixed; boundary=batch_test_123",
    );

    const expectedQuery =
      "format=metadata&fields=id%2CsizeEstimate%2CinternalDate%2Cpayload%2Fheaders&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=List-Unsubscribe";

    assert.equal(
      request.body.includes(
        [
          "--batch_test_123",
          "Content-Type: application/http",
          "Content-ID: <item-0>",
          "",
          `GET /gmail/v1/users/me/messages/msg-1?${expectedQuery}`,
        ].join("\r\n"),
      ),
      true,
    );
    assert.equal(
      request.body.includes(
        [
          "--batch_test_123",
          "Content-Type: application/http",
          "Content-ID: <item-1>",
          "",
          `GET /gmail/v1/users/me/messages/msg%2F2?${expectedQuery}`,
        ].join("\r\n"),
      ),
      true,
    );
    assert.equal(request.body.endsWith("--batch_test_123--\r\n"), true);
  });

  it("generates a unique boundary when none is provided", () => {
    const first = buildGmailMetadataBatchRequest(["msg-1"], ["From"]);
    const second = buildGmailMetadataBatchRequest(["msg-1"], ["From"]);

    assert.ok(first.boundary.length > 0);
    assert.notEqual(first.boundary, second.boundary);
    assert.equal(
      first.contentType,
      `multipart/mixed; boundary=${first.boundary}`,
    );
  });

  it("handles an empty messageIds list cleanly", () => {
    const request = buildGmailMetadataBatchRequest([], ["From"], "empty_b");
    assert.equal(request.body, "--empty_b--\r\n");
  });
});

describe("extractMultipartBoundary", () => {
  it("extracts unquoted and quoted boundaries case-insensitively", () => {
    assert.equal(
      extractMultipartBoundary("multipart/mixed; boundary=batch_abc_123"),
      "batch_abc_123",
    );
    assert.equal(
      extractMultipartBoundary('multipart/mixed; boundary="batch_quoted==1"'),
      "batch_quoted==1",
    );
    assert.equal(
      extractMultipartBoundary(
        'multipart/mixed; charset=utf-8; BOUNDARY="b-99"; extra=1',
      ),
      "b-99",
    );
  });

  it("returns null when Content-Type is missing or has no boundary", () => {
    assert.equal(extractMultipartBoundary(null), null);
    assert.equal(extractMultipartBoundary(""), null);
    assert.equal(extractMultipartBoundary("application/json"), null);
    assert.equal(extractMultipartBoundary('multipart/mixed; boundary=""'), null);
  });
});

describe("parseGmailBatchResponse", () => {
  it("parses mixed 200, 404, and 403 quota responses with CRLF line endings", () => {
    const boundary = "batch_resp_crlf";
    const rawResponse = [
      "Preamble ignored",
      `--${boundary}`,
      "Content-Type: application/http",
      "Content-ID: <response-item-0>",
      "",
      "HTTP/1.1 200 OK",
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify({
        id: "msg-0",
        sizeEstimate: 2048,
        internalDate: "1700000000000",
        payload: { headers: [{ name: "From", value: "a@example.com" }] },
      }),
      `--${boundary}`,
      "Content-Type: application/http",
      "Content-ID: <response-item-1>",
      "",
      "HTTP/1.1 404 Not Found",
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify({
        error: { code: 404, message: "Requested entity was not found." },
      }),
      `--${boundary}`,
      "Content-Type: application/http",
      "Content-ID: <response-item-2>",
      "",
      "HTTP/1.1 403 Forbidden",
      "Content-Type: application/json; charset=UTF-8",
      "Retry-After: 12",
      "",
      JSON.stringify({
        error: {
          code: 403,
          message: "Quota exceeded for quota metric 'Total Query Cost'.",
          errors: [{ reason: "userRateLimitExceeded" }],
        },
      }),
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const parts = parseGmailBatchResponse<{
      id?: string;
      error?: { code?: number; message?: string };
    }>(rawResponse, boundary);

    assert.equal(parts.length, 3);

    assert.equal(parts[0].contentId, "<response-item-0>");
    assert.equal(parts[0].index, 0);
    assert.equal(parts[0].status, 200);
    assert.equal(parts[0].statusText, "OK");
    assert.equal(parts[0].body?.id, "msg-0");

    assert.equal(parts[1].contentId, "<response-item-1>");
    assert.equal(parts[1].index, 1);
    assert.equal(parts[1].status, 404);
    assert.equal(parts[1].body?.error?.code, 404);

    assert.equal(parts[2].contentId, "<response-item-2>");
    assert.equal(parts[2].index, 2);
    assert.equal(parts[2].status, 403);
    assert.equal(parts[2].headers["retry-after"], "12");
    assert.equal(
      parts[2].body?.error?.message,
      "Quota exceeded for quota metric 'Total Query Cost'.",
    );
  });

  it("parses LF-delimited responses and <item-N> Content-IDs including empty bodies", () => {
    const boundary = "batch_resp_lf";
    const rawResponse = [
      `--${boundary}`,
      "Content-Type: application/http",
      "Content-ID: <item-0>",
      "",
      "HTTP/1.1 200 OK",
      "",
      '{"id":"m0"}',
      `--${boundary}`,
      "Content-Type: application/http",
      "Content-ID: <item-1>",
      "",
      "HTTP/1.1 404 Not Found",
      "",
      `--${boundary}`,
      "Content-Type: application/http",
      "",
      "HTTP/1.1 429 Too Many Requests",
      "Retry-After: 8",
      "",
      "rate limited",
      `--${boundary}--`,
    ].join("\n");

    const parts = parseGmailBatchResponse<{ id?: string }>(
      rawResponse,
      boundary,
    );

    assert.equal(parts.length, 3);
    assert.equal(parts[0].index, 0);
    assert.equal(parts[0].body?.id, "m0");

    assert.equal(parts[1].index, 1);
    assert.equal(parts[1].status, 404);
    assert.equal(parts[1].rawBody, "");
    assert.equal(parts[1].body, null);

    assert.equal(parts[2].contentId, null);
    assert.equal(parts[2].index, null);
    assert.equal(parts[2].status, 429);
    assert.equal(parts[2].headers["retry-after"], "8");
    assert.equal(parts[2].rawBody, "rate limited");
    assert.equal(parts[2].body, null);
  });
});
