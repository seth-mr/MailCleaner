import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SenderGroup } from "./gmail-grouping";
import type * as KeepSafeModule from "./keep-safe";

const {
  PROTECTION_SCOPES,
  normalizeProtectionPattern,
  isValidProtectionPattern,
  isProtectionScope,
  hasProtectionRule,
  findMatchingProtectionRule,
  isSenderProtected,
  partitionSendersByProtection,
} = (await import(
  new URL("./keep-safe.ts", import.meta.url).href
)) as typeof KeepSafeModule;

function makeSender(senderEmail: string, messageIds: string[]): SenderGroup {
  return {
    senderEmail,
    senderName: senderEmail,
    messageCount: messageIds.length,
    totalSizeBytes: messageIds.length * 1_000,
    latestDate: "2026-05-01T00:00:00.000Z",
    sampleSubject: "Test message",
    hasUnsubscribeHeader: false,
    messageIds,
  };
}

describe("PROTECTION_SCOPES & normalizeProtectionPattern", () => {
  it("exposes the three expected protection scopes", () => {
    assert.deepEqual(PROTECTION_SCOPES, ["SENDER", "DOMAIN", "BRAND"]);
    assert.equal(isProtectionScope("SENDER"), true);
    assert.equal(isProtectionScope("DOMAIN"), true);
    assert.equal(isProtectionScope("BRAND"), true);
    assert.equal(isProtectionScope("OTHER"), false);
  });

  it("normalizes patterns by trimming and lowercasing", () => {
    assert.equal(
      normalizeProtectionPattern("SENDER", "  Transaction@Notice.AliExpress.COM  "),
      "transaction@notice.aliexpress.com",
    );
    assert.equal(
      normalizeProtectionPattern("SENDER", ' "AliExpress" <Orders@AliExpress.COM> '),
      "orders@aliexpress.com",
    );
    assert.equal(
      normalizeProtectionPattern("DOMAIN", "  Notice.AliExpress.COM. "),
      "notice.aliexpress.com",
    );
    assert.equal(
      normalizeProtectionPattern("DOMAIN", " @Mail.Amazon.COM.MX "),
      "mail.amazon.com.mx",
    );
    assert.equal(
      normalizeProtectionPattern("BRAND", "  AliExpress  "),
      "aliexpress",
    );
    assert.equal(normalizeProtectionPattern("BRAND", "   "), "");
  });

  it("validates normalized patterns by scope", () => {
    assert.equal(
      isValidProtectionPattern("SENDER", "user@notice.aliexpress.com"),
      true,
    );
    assert.equal(isValidProtectionPattern("SENDER", "invalid"), false);
    assert.equal(isValidProtectionPattern("SENDER", "user@unknown"), false);
    assert.equal(
      isValidProtectionPattern("DOMAIN", "notice.aliexpress.com"),
      true,
    );
    assert.equal(isValidProtectionPattern("DOMAIN", "unknown"), false);
    assert.equal(isValidProtectionPattern("BRAND", "aliexpress"), true);
    assert.equal(isValidProtectionPattern("BRAND", "bad brand"), false);
  });
});

describe("isSenderProtected", () => {
  it("protects exact SENDER matches across plain email and From headers", () => {
    const rules = [
      { scope: "SENDER" as const, pattern: "Billing@Bank.COM" },
    ];

    assert.equal(isSenderProtected("billing@bank.com", rules), true);
    assert.equal(
      isSenderProtected('"My Bank" <Billing@Bank.com>', rules),
      true,
    );
    assert.equal(isSenderProtected("promo@bank.com", rules), false);
    assert.equal(hasProtectionRule(rules, "SENDER", "billing@bank.com"), true);
  });

  it("protects matching DOMAIN host while allowing sibling subdomains", () => {
    const rules = [
      { scope: "DOMAIN" as const, pattern: "notice.aliexpress.com" },
    ];

    assert.equal(
      isSenderProtected("transaction@notice.aliexpress.com", rules),
      true,
    );
    assert.equal(
      isSenderProtected(
        "AliExpress Orders <Transaction@Notice.AliExpress.COM>",
        rules,
      ),
      true,
    );
    assert.equal(
      isSenderProtected("promo@mail.aliexpress.com", rules),
      false,
    );
    assert.equal(isSenderProtected("offers@aliexpress.ru", rules), false);
  });

  it("protects all subdomains and TLDs under a protected BRAND including compound public suffixes", () => {
    const rules = [
      { scope: "BRAND" as const, pattern: "amazon" },
    ];

    assert.equal(isSenderProtected("orders@orders.amazon.com.mx", rules), true);
    assert.equal(
      isSenderProtected('"Amazon" <store-news@amazon.com>', rules),
      true,
    );
    assert.equal(isSenderProtected("deals@amazon.co.uk", rules), true);
    assert.equal(isSenderProtected("news@mail.aliexpress.com", rules), false);
    assert.equal(isSenderProtected("unknown", rules), false);
  });

  it("returns the matching rule when protected and null otherwise", () => {
    const domainRule = {
      id: "rule-1",
      scope: "DOMAIN" as const,
      pattern: "notice.aliexpress.com",
    };

    assert.equal(
      findMatchingProtectionRule("transaction@notice.aliexpress.com", [
        domainRule,
      ]),
      domainRule,
    );
    assert.equal(
      findMatchingProtectionRule("promo@mail.aliexpress.com", [domainRule]),
      null,
    );
  });
});

describe("partitionSendersByProtection", () => {
  it("separates protected senders from cleanable senders without mutating input", () => {
    const senders: SenderGroup[] = [
      makeSender("promo@mail.aliexpress.com", ["m1", "m2"]),
      makeSender("transaction@notice.aliexpress.com", ["m3"]),
      makeSender("orders@orders.amazon.com.mx", ["m4", "m5"]),
      makeSender("vip@github.com", ["m6"]),
      makeSender("spam@newsletter.example.com", ["m7"]),
    ];

    const snapshot = senders.map((sender) => ({
      ...sender,
      messageIds: [...sender.messageIds],
    }));

    const rules = [
      { scope: "DOMAIN" as const, pattern: "notice.aliexpress.com" },
      { scope: "BRAND" as const, pattern: "amazon" },
      { scope: "SENDER" as const, pattern: "vip@github.com" },
    ];

    const { cleanable, protectedSenders } = partitionSendersByProtection(
      senders,
      rules,
    );

    assert.deepEqual(senders, snapshot);
    assert.deepEqual(
      cleanable.map((sender) => sender.senderEmail),
      ["promo@mail.aliexpress.com", "spam@newsletter.example.com"],
    );
    assert.deepEqual(
      protectedSenders.map((sender) => sender.senderEmail),
      [
        "transaction@notice.aliexpress.com",
        "orders@orders.amazon.com.mx",
        "vip@github.com",
      ],
    );
  });

  it("keeps all senders cleanable when there are no rules", () => {
    const senders = [makeSender("a@example.com", ["1"])];
    const result = partitionSendersByProtection(senders, []);
    assert.deepEqual(result.cleanable, senders);
    assert.deepEqual(result.protectedSenders, []);
  });
});
