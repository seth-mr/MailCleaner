import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type * as GmailUnsubscribeModule from "./gmail-unsubscribe";

const {
  parseListUnsubscribeHeader,
  hasOneClickUnsubscribePost,
  isSafePublicHttpUrl,
  extractUnsubscribeLinkFromHtml,
  buildRawRfc2822Email,
  summarizeBulkUnsubscribeResults,
} = (await import(
  new URL("./gmail-unsubscribe.ts", import.meta.url).href
)) as typeof GmailUnsubscribeModule;

function decodeBase64UrlUtf8(encoded: string): string {
  const standardBase64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (standardBase64.length % 4)) % 4;
  const padded =
    paddingLength === 0
      ? standardBase64
      : standardBase64 + "=".repeat(paddingLength);
  return Buffer.from(padded, "base64").toString("utf8");
}

describe("parseListUnsubscribeHeader", () => {
  it("returns empty arrays for empty or non-matching headers", () => {
    assert.deepEqual(parseListUnsubscribeHeader(""), {
      httpUrls: [],
      mailtoTargets: [],
    });
    assert.deepEqual(parseListUnsubscribeHeader("   "), {
      httpUrls: [],
      mailtoTargets: [],
    });
  });

  it("extracts http/https URLs and mailto targets with subject and body", () => {
    const header =
      "<mailto:unsubscribe@example.com?subject=Stop%20Sending&body=Please%20remove%20me>, <https://example.com/unsub?token=abc&id=42>";

    assert.deepEqual(parseListUnsubscribeHeader(header), {
      httpUrls: ["https://example.com/unsub?token=abc&id=42"],
      mailtoTargets: [
        {
          email: "unsubscribe@example.com",
          subject: "Stop Sending",
          body: "Please remove me",
        },
      ],
    });
  });

  it("handles comma-separated entries without angle brackets and commas inside angle brackets", () => {
    const header =
      "<https://example.com/unsub?items=1,2>, http://news.example.org/out, mailto:optout@example.org";

    assert.deepEqual(parseListUnsubscribeHeader(header), {
      httpUrls: [
        "https://example.com/unsub?items=1,2",
        "http://news.example.org/out",
      ],
      mailtoTargets: [
        {
          email: "optout@example.org",
          subject: "",
          body: "",
        },
      ],
    });
  });

  it("filters out unsafe protocols and malformed email addresses", () => {
    const header =
      "<javascript:alert(1)>, <data:text/html,xss>, <ftp://example.com/file>, <mailto:invalid-email>, <mailto:valid@example.com>, <https://safe.example.com/unsub>";

    assert.deepEqual(parseListUnsubscribeHeader(header), {
      httpUrls: ["https://safe.example.com/unsub"],
      mailtoTargets: [
        {
          email: "valid@example.com",
          subject: "",
          body: "",
        },
      ],
    });
  });
});

describe("hasOneClickUnsubscribePost", () => {
  it("returns true for List-Unsubscribe=One-Click case-insensitively", () => {
    assert.equal(hasOneClickUnsubscribePost("List-Unsubscribe=One-Click"), true);
    assert.equal(hasOneClickUnsubscribePost("list-unsubscribe=one-click"), true);
    assert.equal(
      hasOneClickUnsubscribePost("List-Unsubscribe=One-Click; charset=utf-8"),
      true,
    );
  });

  it("returns false for missing or unrelated headers", () => {
    assert.equal(hasOneClickUnsubscribePost(""), false);
    assert.equal(hasOneClickUnsubscribePost("List-Unsubscribe=Two-Click"), false);
    assert.equal(hasOneClickUnsubscribePost("X-List-Unsubscribe=One-Click"), false);
  });
});

describe("isSafePublicHttpUrl", () => {
  it("allows valid public http and https URLs", () => {
    assert.equal(isSafePublicHttpUrl("https://example.com/unsubscribe"), true);
    assert.equal(
      isSafePublicHttpUrl("http://news.acme.org/opt-out?id=123"),
      true,
    );
    assert.equal(isSafePublicHttpUrl("https://8.8.8.8/unsubscribe"), true);
    assert.equal(
      isSafePublicHttpUrl("https://[2606:4700:4700::1111]/unsub"),
      true,
    );
  });

  it("rejects non-http(s) protocols and URLs with embedded credentials", () => {
    assert.equal(isSafePublicHttpUrl("javascript:alert(1)"), false);
    assert.equal(isSafePublicHttpUrl("data:text/plain,hi"), false);
    assert.equal(isSafePublicHttpUrl("file:///etc/passwd"), false);
    assert.equal(isSafePublicHttpUrl("ftp://example.com/unsub"), false);
    assert.equal(
      isSafePublicHttpUrl("https://user:pass@example.com/unsub"),
      false,
    );
    assert.equal(isSafePublicHttpUrl("not a url"), false);
  });

  it("blocks localhost, .local, .internal, and private/loopback/link-local IPv4 & IPv6 ranges (SSRF protection)", () => {
    const blockedUrls = [
      "http://localhost/unsub",
      "https://localhost:3000/unsub",
      "http://sub.localhost./unsub",
      "http://printer.local/unsub",
      "https://metadata.internal/unsub",
      "http://127.0.0.1/unsub",
      "http://127.12.34.56:8080/unsub",
      "http://10.0.0.1/unsub",
      "http://172.16.0.1/unsub",
      "http://172.31.255.254/unsub",
      "http://192.168.1.10/unsub",
      "http://169.254.169.254/latest/meta-data/",
      "http://0.0.0.0/unsub",
      "http://[::1]/unsub",
      "http://[0:0:0:0:0:0:0:1]/unsub",
      "http://[::ffff:127.0.0.1]/unsub",
      "http://[::ffff:10.0.0.5]/unsub",
      "http://[fc00::1]/unsub",
      "http://[fd12:3456::1]/unsub",
      "http://[fe80::1]/unsub",
      "http://2130706433/unsub",
    ];

    for (const url of blockedUrls) {
      assert.equal(isSafePublicHttpUrl(url), false, `Expected blocked: ${url}`);
    }
  });

  it("allows public 172.x addresses outside 172.16.0.0/12", () => {
    assert.equal(isSafePublicHttpUrl("https://172.15.0.1/unsub"), true);
    assert.equal(isSafePublicHttpUrl("https://172.32.0.1/unsub"), true);
  });
});

describe("extractUnsubscribeLinkFromHtml", () => {
  it("extracts unsubscribe links by anchor text or URL and decodes &amp;", () => {
    const html = `
      <div>
        <p>Thanks for reading! <a href="https://example.com/view?a=1&amp;b=2">View in browser</a></p>
        <p>Don't want these emails? <a href="https://example.com/list/out?token=xyz&amp;lang=en"><span>Unsubscribe</span> here</a>.</p>
      </div>
    `;

    assert.equal(
      extractUnsubscribeLinkFromHtml(html),
      "https://example.com/list/out?token=xyz&lang=en",
    );
  });

  it("matches Spanish and alternative opt-out keywords", () => {
    assert.equal(
      extractUnsubscribeLinkFromHtml(
        '<a href="https://tienda.es/baja?u=1">Darse de baja de esta lista</a>',
      ),
      "https://tienda.es/baja?u=1",
    );
    assert.equal(
      extractUnsubscribeLinkFromHtml(
        '<a href="https://example.com/optout?id=9">Click here</a>',
      ),
      "https://example.com/optout?id=9",
    );
    assert.equal(
      extractUnsubscribeLinkFromHtml(
        '<a href="https://example.com/prefs">Manage preferences</a>',
      ),
      "https://example.com/prefs",
    );
  });

  it("ignores unsafe protocols such as javascript: and data:", () => {
    const html = `
      <a href="javascript:alert(1)">Unsubscribe</a>
      <a href="data:text/html,unsubscribe">Opt-out</a>
      <a href="https://example.com/real-opt-out">Opt-out</a>
    `;

    assert.equal(
      extractUnsubscribeLinkFromHtml(html),
      "https://example.com/real-opt-out",
    );
    assert.equal(
      extractUnsubscribeLinkFromHtml('<a href="javascript:void(0)">Unsubscribe</a>'),
      null,
    );
  });

  it("returns null when no unsubscribe link is present", () => {
    assert.equal(
      extractUnsubscribeLinkFromHtml('<p><a href="https://example.com">Home</a></p>'),
      null,
    );
    assert.equal(extractUnsubscribeLinkFromHtml(""), null);
  });
});

describe("buildRawRfc2822Email", () => {
  it("builds a Base64URL-encoded RFC 2822 message", () => {
    const encoded = buildRawRfc2822Email({
      to: "unsub@example.com",
      subject: "Unsubscribe",
      body: "Please unsubscribe me.",
    });

    assert.equal(encoded.includes("+"), false);
    assert.equal(encoded.includes("/"), false);
    assert.equal(encoded.includes("="), false);

    const decoded = decodeBase64UrlUtf8(encoded);
    assert.equal(decoded.includes("To: unsub@example.com\r\n"), true);
    assert.equal(decoded.includes("Subject: Unsubscribe\r\n"), true);
    assert.equal(decoded.endsWith("\r\n\r\nPlease unsubscribe me."), true);
  });

  it("sanitizes CR and LF characters in headers to prevent header injection", () => {
    const encoded = buildRawRfc2822Email({
      to: "unsub@example.com\r\nBcc: attacker@evil.com",
      subject: "Unsubscribe\nX-Injected: bad\r\nCc: other@evil.com",
      body: "Body line 1\r\nBody line 2",
    });

    const decoded = decodeBase64UrlUtf8(encoded);
    const headerSection = decoded.split("\r\n\r\n")[0] ?? "";

    assert.equal(headerSection.includes("\r\nBcc:"), false);
    assert.equal(headerSection.includes("\nX-Injected:"), false);
    assert.equal(headerSection.includes("\r\nCc:"), false);
    assert.equal(
      headerSection.startsWith("To: unsub@example.com Bcc: attacker@evil.com\r\n"),
      true,
    );
  });
});

describe("summarizeBulkUnsubscribeResults", () => {
  it("returns zeroed counts for an empty outcome list", () => {
    assert.deepEqual(summarizeBulkUnsubscribeResults([]), {
      totalAttempted: 0,
      unsubscribed: 0,
      manualRequired: 0,
      notFound: 0,
      failed: 0,
      cancelled: false,
    });
  });

  it("accumulates unsubscribed, manualRequired, notFound, and failed counts", () => {
    const summary = summarizeBulkUnsubscribeResults([
      { senderEmail: "a@example.com", status: "unsubscribed" },
      { senderEmail: "b@example.com", status: "action_required" },
      { senderEmail: "c@example.com", status: "unsubscribed" },
      { senderEmail: "d@example.com", status: "not_found" },
      { senderEmail: "e@example.com", status: "failed" },
      { senderEmail: "f@example.com", status: "action_required" },
    ]);

    assert.deepEqual(summary, {
      totalAttempted: 6,
      unsubscribed: 2,
      manualRequired: 2,
      notFound: 1,
      failed: 1,
      cancelled: false,
    });
  });

  it("preserves cancelled flag when bulk unsubscribe is stopped early", () => {
    const summary = summarizeBulkUnsubscribeResults(
      [{ senderEmail: "a@example.com", status: "unsubscribed" }],
      { cancelled: true },
    );

    assert.deepEqual(summary, {
      totalAttempted: 1,
      unsubscribed: 1,
      manualRequired: 0,
      notFound: 0,
      failed: 0,
      cancelled: true,
    });
  });
});
