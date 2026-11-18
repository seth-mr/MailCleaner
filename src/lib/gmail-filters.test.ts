import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type * as GmailFiltersModule from "./gmail-filters";

const {
  AUTO_CLEAN_RULE_TYPES,
  AUTO_CLEAN_RULE_ACTIONS,
  AUTO_CLEAN_RULE_SCHEDULES,
  AUTO_CLEAN_RULE_STATUSES,
  AUTO_CLEAN_PRESETS,
  isAutoCleanRuleType,
  isAutoCleanRuleAction,
  isAutoCleanRuleSchedule,
  isAutoCleanRuleStatus,
  computeNextRunAt,
  normalizeAutoCleanPattern,
  isValidAutoCleanPattern,
  buildGmailBlockFilterPayload,
  buildAutoCleanQueryFromBuilder,
  validateAutoCleanRuleInput,
  validateAutoCleanRuleUpdate,
  validateAutoCleanPreviewInput,
} = (await import(
  new URL("./gmail-filters.ts", import.meta.url).href
)) as typeof GmailFiltersModule;

describe("AUTO_CLEAN_RULE_TYPES & AUTO_CLEAN_PRESETS", () => {
  it("exports the three supported Auto-Clean rule types", () => {
    assert.deepEqual(AUTO_CLEAN_RULE_TYPES, [
      "BLOCK_SENDER",
      "BLOCK_DOMAIN",
      "CLEAN_QUERY",
    ]);
    assert.equal(isAutoCleanRuleType("BLOCK_SENDER"), true);
    assert.equal(isAutoCleanRuleType("BLOCK_DOMAIN"), true);
    assert.equal(isAutoCleanRuleType("CLEAN_QUERY"), true);
    assert.equal(isAutoCleanRuleType("DELETE_ALL"), false);
  });

  it("exports presets for promotions-90d, spam-30d, and social-90d", () => {
    assert.deepEqual(
      AUTO_CLEAN_PRESETS.map((preset) => preset.id),
      ["promotions-90d", "spam-30d", "social-90d"],
    );
    for (const preset of AUTO_CLEAN_PRESETS) {
      assert.equal(preset.type, "CLEAN_QUERY");
      assert.ok(preset.label.length > 0);
      assert.ok(preset.pattern.length > 0);
    }
  });
});

describe("buildGmailBlockFilterPayload", () => {
  it("builds a sender auto-trash payload using exact email", () => {
    assert.deepEqual(
      buildGmailBlockFilterPayload("BLOCK_SENDER", "  News@Shop.Example.COM "),
      {
        criteria: {
          from: "news@shop.example.com",
        },
        action: {
          addLabelIds: ["TRASH"],
          removeLabelIds: ["INBOX"],
        },
      },
    );
  });

  it("builds a domain auto-trash payload prefixed with @", () => {
    assert.deepEqual(
      buildGmailBlockFilterPayload("BLOCK_DOMAIN", "Mail.Example.COM"),
      {
        criteria: {
          from: "@mail.example.com",
        },
        action: {
          addLabelIds: ["TRASH"],
          removeLabelIds: ["INBOX"],
        },
      },
    );

    assert.deepEqual(
      buildGmailBlockFilterPayload("BLOCK_DOMAIN", "@mail.example.com."),
      {
        criteria: {
          from: "@mail.example.com",
        },
        action: {
          addLabelIds: ["TRASH"],
          removeLabelIds: ["INBOX"],
        },
      },
    );
  });

  it("throws when given an invalid pattern", () => {
    assert.throws(() =>
      buildGmailBlockFilterPayload("BLOCK_SENDER", "not-an-email"),
    );
    assert.throws(() =>
      buildGmailBlockFilterPayload("BLOCK_DOMAIN", "user@example.com"),
    );
  });
});

describe("validateAutoCleanRuleInput", () => {
  it("normalizes and accepts valid BLOCK_SENDER, BLOCK_DOMAIN, and CLEAN_QUERY rules", () => {
    assert.deepEqual(
      validateAutoCleanRuleInput({
        type: "BLOCK_SENDER",
        pattern: ' "Deals" <Deals@Mail.Example.COM> ',
        label: "  Deals Newsletter  ",
      }),
      {
        ok: true,
        data: {
          type: "BLOCK_SENDER",
          pattern: "deals@mail.example.com",
          label: "Deals Newsletter",
        },
      },
    );

    assert.deepEqual(
      validateAutoCleanRuleInput({
        type: "BLOCK_DOMAIN",
        pattern: " @Promo.Example.COM. ",
        label: "promo.example.com",
      }),
      {
        ok: true,
        data: {
          type: "BLOCK_DOMAIN",
          pattern: "promo.example.com",
          label: "promo.example.com",
        },
      },
    );

    assert.deepEqual(
      validateAutoCleanRuleInput({
        type: "CLEAN_QUERY",
        pattern: "  category:promotions   older_than:90d  ",
        label: "  Trash Promotions > 90d  ",
      }),
      {
        ok: true,
        data: {
          type: "CLEAN_QUERY",
          pattern: "category:promotions older_than:90d",
          label: "Trash Promotions > 90d",
        },
      },
    );
  });

  it("rejects malformed bodies, invalid types, invalid patterns, or blank labels", () => {
    assert.equal(validateAutoCleanRuleInput(null).ok, false);
    assert.equal(validateAutoCleanRuleInput([]).ok, false);
    assert.equal(
      validateAutoCleanRuleInput({
        type: "UNKNOWN",
        pattern: "a@b.com",
        label: "Test",
      }).ok,
      false,
    );
    assert.equal(
      validateAutoCleanRuleInput({
        type: "BLOCK_SENDER",
        pattern: "bad-sender",
        label: "Bad",
      }).ok,
      false,
    );
    assert.equal(
      validateAutoCleanRuleInput({
        type: "BLOCK_DOMAIN",
        pattern: "unknown",
        label: "Unknown",
      }).ok,
      false,
    );
    assert.equal(
      validateAutoCleanRuleInput({
        type: "BLOCK_DOMAIN",
        pattern: "user@example.com",
        label: "Not a domain",
      }).ok,
      false,
    );
    assert.equal(
      validateAutoCleanRuleInput({
        type: "CLEAN_QUERY",
        pattern: "   ",
        label: "Empty query",
      }).ok,
      false,
    );
    assert.equal(
      validateAutoCleanRuleInput({
        type: "CLEAN_QUERY",
        pattern: "in:spam older_than:30d",
        label: "   ",
      }).ok,
      false,
    );
  });

  it("exposes normalization and pattern checks cleanly", () => {
    assert.equal(
      normalizeAutoCleanPattern("BLOCK_DOMAIN", " @Sub.Domain.COM "),
      "sub.domain.com",
    );
    assert.equal(isValidAutoCleanPattern("CLEAN_QUERY", "in:spam"), true);
    assert.equal(isValidAutoCleanPattern("BLOCK_SENDER", "user@unknown"), false);
  });

  it("validates optional action, schedule, and isEnabled and rejects delete", () => {
    assert.deepEqual(
      validateAutoCleanRuleInput({
        type: "CLEAN_QUERY",
        pattern: "category:promotions older_than:90d",
        label: "Archive Promotions",
        action: "archive",
        schedule: "weekly",
        isEnabled: false,
      }),
      {
        ok: true,
        data: {
          type: "CLEAN_QUERY",
          pattern: "category:promotions older_than:90d",
          label: "Archive Promotions",
          action: "archive",
          schedule: "weekly",
          isEnabled: false,
        },
      },
    );

    assert.equal(
      validateAutoCleanRuleInput({
        type: "CLEAN_QUERY",
        pattern: "in:spam",
        label: "Never delete",
        action: "delete",
      }).ok,
      false,
    );

    assert.equal(
      validateAutoCleanRuleInput({
        type: "CLEAN_QUERY",
        pattern: "in:spam",
        label: "Bad schedule",
        schedule: "hourly",
      }).ok,
      false,
    );

    assert.equal(
      validateAutoCleanRuleInput({
        type: "CLEAN_QUERY",
        pattern: "in:spam",
        label: "Bad enabled",
        isEnabled: "true",
      }).ok,
      false,
    );
  });
});

describe("Auto-Clean actions, schedules, and computeNextRunAt", () => {
  it("exports safe actions without delete and valid schedules/statuses", () => {
    assert.deepEqual(AUTO_CLEAN_RULE_ACTIONS, ["trash", "archive", "mark_read"]);
    assert.deepEqual(AUTO_CLEAN_RULE_SCHEDULES, ["manual", "daily", "weekly"]);
    assert.deepEqual(AUTO_CLEAN_RULE_STATUSES, [
      "idle",
      "ok",
      "success",
      "error",
      "auth_error",
      "rate_limited",
    ]);

    assert.equal(isAutoCleanRuleAction("trash"), true);
    assert.equal(isAutoCleanRuleAction("archive"), true);
    assert.equal(isAutoCleanRuleAction("mark_read"), true);
    assert.equal(isAutoCleanRuleAction("delete"), false);
    assert.equal(isAutoCleanRuleAction("untrash"), false);

    assert.equal(isAutoCleanRuleSchedule("manual"), true);
    assert.equal(isAutoCleanRuleSchedule("daily"), true);
    assert.equal(isAutoCleanRuleSchedule("weekly"), true);
    assert.equal(isAutoCleanRuleSchedule("hourly"), false);

    assert.equal(isAutoCleanRuleStatus("idle"), true);
    assert.equal(isAutoCleanRuleStatus("ok"), true);
    assert.equal(isAutoCleanRuleStatus("success"), true);
    assert.equal(isAutoCleanRuleStatus("error"), true);
    assert.equal(isAutoCleanRuleStatus("auth_error"), true);
    assert.equal(isAutoCleanRuleStatus("rate_limited"), true);
    assert.equal(isAutoCleanRuleStatus("unknown"), false);
  });

  it("computes nextRunAt for manual, daily, and weekly schedules", () => {
    const base = new Date("2026-11-17T10:00:00.000Z");
    assert.equal(computeNextRunAt("manual", base), null);
    assert.equal(
      computeNextRunAt("daily", base)?.toISOString(),
      "2026-11-18T10:00:00.000Z",
    );
    assert.equal(
      computeNextRunAt("weekly", base)?.toISOString(),
      "2026-11-24T10:00:00.000Z",
    );
  });
});

describe("validateAutoCleanRuleUpdate", () => {
  it("accepts valid partial updates for isEnabled, schedule, and action", () => {
    assert.deepEqual(
      validateAutoCleanRuleUpdate({
        id: " rule_123 ",
        isEnabled: false,
        schedule: "daily",
        action: "mark_read",
      }),
      {
        ok: true,
        data: {
          id: "rule_123",
          isEnabled: false,
          schedule: "daily",
          action: "mark_read",
        },
      },
    );

    assert.deepEqual(
      validateAutoCleanRuleUpdate({
        id: "rule_123",
        action: "archive",
      }),
      {
        ok: true,
        data: {
          id: "rule_123",
          action: "archive",
        },
      },
    );
  });

  it("rejects missing id, empty updates, delete action, or invalid types", () => {
    assert.equal(validateAutoCleanRuleUpdate(null).ok, false);
    assert.equal(validateAutoCleanRuleUpdate({ id: "   ", isEnabled: true }).ok, false);
    assert.equal(validateAutoCleanRuleUpdate({ id: "rule_123" }).ok, false);
    assert.equal(
      validateAutoCleanRuleUpdate({ id: "rule_123", action: "delete" }).ok,
      false,
    );
    assert.equal(
      validateAutoCleanRuleUpdate({ id: "rule_123", schedule: "monthly" }).ok,
      false,
    );
    assert.equal(
      validateAutoCleanRuleUpdate({ id: "rule_123", isEnabled: 1 }).ok,
      false,
    );
  });
});

describe("validateAutoCleanPreviewInput", () => {
  it("normalizes and accepts valid preview queries", () => {
    assert.deepEqual(
      validateAutoCleanPreviewInput({
        query: "  category:promotions   older_than:90d  ",
      }),
      {
        ok: true,
        data: {
          query: "category:promotions older_than:90d",
        },
      },
    );
  });

  it("rejects invalid or blank preview queries", () => {
    assert.equal(validateAutoCleanPreviewInput(null).ok, false);
    assert.equal(validateAutoCleanPreviewInput({ query: "   " }).ok, false);
    assert.equal(validateAutoCleanPreviewInput({ query: 123 }).ok, false);
    assert.equal(
      validateAutoCleanPreviewInput({ query: "a".repeat(501) }).ok,
      false,
    );
  });
});

describe("buildAutoCleanQueryFromBuilder", () => {
  it("compiles preset, olderThan, unreadOnly, and hasAttachment into a Gmail query and label", () => {
    assert.deepEqual(
      buildAutoCleanQueryFromBuilder({
        preset: "promotions",
        olderThan: "3m",
        unreadOnly: true,
        hasAttachment: true,
      }),
      {
        query: "category:promotions older_than:3m has:attachment is:unread",
        label: "Promotions • > 3m • unread only • with attachments",
      },
    );

    assert.deepEqual(
      buildAutoCleanQueryFromBuilder({
        preset: "spam",
        olderThan: "6m",
        unreadOnly: false,
        hasAttachment: false,
      }),
      {
        query: "in:spam older_than:6m",
        label: "Spam • > 6m",
      },
    );

    assert.deepEqual(
      buildAutoCleanQueryFromBuilder({
        preset: "all",
        olderThan: "1y",
        unreadOnly: false,
        hasAttachment: false,
      }),
      {
        query: "older_than:1y",
        label: "All mail • > 1y",
      },
    );
  });

  it("returns null when no condition is selected", () => {
    assert.equal(buildAutoCleanQueryFromBuilder({}), null);
    assert.equal(
      buildAutoCleanQueryFromBuilder({
        preset: "all",
        olderThan: "any",
        unreadOnly: false,
        hasAttachment: false,
      }),
      null,
    );
  });
});
