import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type * as AccountDisconnectModule from "./account-disconnect";

const { GOOGLE_REVOKE_ENDPOINT, pickRevocationToken, revokeGoogleToken } =
  (await import(
    new URL("./account-disconnect.ts", import.meta.url).href
  )) as typeof AccountDisconnectModule;

describe("GOOGLE_REVOKE_ENDPOINT", () => {
  it("points to Google's OAuth 2.0 token revocation endpoint", () => {
    assert.equal(
      GOOGLE_REVOKE_ENDPOINT,
      "https://oauth2.googleapis.com/revoke",
    );
  });
});

describe("pickRevocationToken", () => {
  it("prioritizes refresh_token when both refresh_token and access_token exist", () => {
    assert.equal(
      pickRevocationToken({
        refresh_token: "refresh-123",
        access_token: "access-456",
      }),
      "refresh-123",
    );
  });

  it("falls back to access_token when refresh_token is absent or blank", () => {
    assert.equal(
      pickRevocationToken({
        refresh_token: null,
        access_token: "access-456",
      }),
      "access-456",
    );
    assert.equal(
      pickRevocationToken({
        refresh_token: "   ",
        access_token: " access-789 ",
      }),
      "access-789",
    );
  });

  it("returns null when neither token is usable", () => {
    assert.equal(pickRevocationToken({}), null);
    assert.equal(
      pickRevocationToken({ refresh_token: null, access_token: null }),
      null,
    );
    assert.equal(
      pickRevocationToken({ refresh_token: "", access_token: "   " }),
      null,
    );
  });
});

describe("revokeGoogleToken", () => {
  it("POSTs form-urlencoded token to Google revoke endpoint and returns true on 200", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;

    const mockFetch: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(null, { status: 200 });
    };

    const result = await revokeGoogleToken("refresh-abc", {
      fetchImpl: mockFetch,
    });

    assert.equal(result, true);
    assert.equal(capturedUrl, GOOGLE_REVOKE_ENDPOINT);
    assert.equal(capturedInit?.method, "POST");
    assert.deepEqual(capturedInit?.headers, {
      "Content-Type": "application/x-www-form-urlencoded",
    });
    assert.equal(capturedInit?.body, "token=refresh-abc");
    assert.ok(capturedInit?.signal);
  });

  it("returns false without throwing when Google returns 400 for an expired token", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 400,
      });

    const result = await revokeGoogleToken("expired-token", {
      fetchImpl: mockFetch,
    });

    assert.equal(result, false);
  });

  it("returns false without throwing on network errors or timeouts", async () => {
    const failingFetch: typeof fetch = async () => {
      throw new Error("network down");
    };

    assert.equal(
      await revokeGoogleToken("token-1", { fetchImpl: failingFetch }),
      false,
    );

    const slowFetch: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });

    assert.equal(
      await revokeGoogleToken("token-2", {
        fetchImpl: slowFetch,
        timeoutMs: 10,
      }),
      false,
    );
  });

  it("returns false immediately for empty tokens", async () => {
    let called = false;
    const mockFetch: typeof fetch = async () => {
      called = true;
      return new Response(null, { status: 200 });
    };

    assert.equal(
      await revokeGoogleToken("   ", { fetchImpl: mockFetch }),
      false,
    );
    assert.equal(called, false);
  });
});
