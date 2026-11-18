import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type * as GmailGroupingModule from "./gmail-grouping";

const {
  GMAIL_PRESET_FILTERS,
  buildGmailSearchQuery,
  parseFromHeader,
  groupMessagesBySender,
  mergeSenderGroups,
} = (await import(
  new URL("./gmail-grouping.ts", import.meta.url).href
)) as typeof GmailGroupingModule;

describe("buildGmailSearchQuery", () => {
  it("returns an empty query and includeSpamTrash=false by default", () => {
    assert.deepEqual(buildGmailSearchQuery({}), {
      q: "",
      includeSpamTrash: false,
    });

    assert.deepEqual(
      buildGmailSearchQuery({
        preset: "all",
        olderThan: "any",
        largerThan: "any",
        search: "   ",
      }),
      {
        q: "",
        includeSpamTrash: false,
      },
    );
  });

  it("builds category:promotions for promotions preset without spam/trash", () => {
    assert.deepEqual(
      buildGmailSearchQuery({
        preset: "promotions",
        olderThan: "6m",
        largerThan: "1M",
        search: "  newsletter  ",
      }),
      {
        q: "category:promotions older_than:6m larger:1M newsletter",
        includeSpamTrash: false,
      },
    );
  });

  it("builds in:spam and sets includeSpamTrash=true for spam preset", () => {
    assert.deepEqual(
      buildGmailSearchQuery({
        preset: "spam",
        olderThan: "1y",
        largerThan: "10M",
        search: "offer",
      }),
      {
        q: "in:spam older_than:1y larger:10M offer",
        includeSpamTrash: true,
      },
    );
  });

  it("includes has:attachment when hasAttachment is true and omits it when false or omitted", () => {
    assert.deepEqual(
      buildGmailSearchQuery({
        hasAttachment: true,
      }),
      {
        q: "has:attachment",
        includeSpamTrash: false,
      },
    );

    assert.deepEqual(
      buildGmailSearchQuery({
        preset: "all",
        largerThan: "5M",
        hasAttachment: true,
        search: "invoice",
      }),
      {
        q: "larger:5M has:attachment invoice",
        includeSpamTrash: false,
      },
    );

    assert.deepEqual(
      buildGmailSearchQuery({
        preset: "promotions",
        hasAttachment: false,
      }),
      {
        q: "category:promotions",
        includeSpamTrash: false,
      },
    );
  });

  it("supports social and updates category presets without spam/trash", () => {
    assert.deepEqual([...GMAIL_PRESET_FILTERS], [
      "all",
      "promotions",
      "social",
      "updates",
      "spam",
    ]);

    assert.deepEqual(buildGmailSearchQuery({ preset: "social" }), {
      q: "category:social",
      includeSpamTrash: false,
    });

    assert.deepEqual(buildGmailSearchQuery({ preset: "updates" }), {
      q: "category:updates",
      includeSpamTrash: false,
    });
  });

  it("includes is:unread when unreadOnly is true and combines with presets and other filters", () => {
    assert.deepEqual(buildGmailSearchQuery({ unreadOnly: true }), {
      q: "is:unread",
      includeSpamTrash: false,
    });

    assert.deepEqual(
      buildGmailSearchQuery({
        preset: "social",
        olderThan: "3m",
        largerThan: "1M",
        hasAttachment: true,
        unreadOnly: true,
        search: "digest",
      }),
      {
        q: "category:social older_than:3m larger:1M has:attachment is:unread digest",
        includeSpamTrash: false,
      },
    );

    assert.deepEqual(
      buildGmailSearchQuery({
        preset: "updates",
        unreadOnly: false,
      }),
      {
        q: "category:updates",
        includeSpamTrash: false,
      },
    );
  });
});

describe("parseFromHeader", () => {
  it("extracts display name and lowercase email from Name <email>", () => {
    assert.deepEqual(parseFromHeader("Acme Store <News@Acme.COM>"), {
      email: "news@acme.com",
      name: "Acme Store",
    });
  });

  it("unquotes quoted display names and unescapes escaped quotes", () => {
    assert.deepEqual(parseFromHeader('"Acme, Inc." <Billing@Acme.COM>'), {
      email: "billing@acme.com",
      name: "Acme, Inc.",
    });

    assert.deepEqual(
      parseFromHeader('"Team \\"Deals\\"" <Deals@Shop.COM>'),
      {
        email: "deals@shop.com",
        name: 'Team "Deals"',
      },
    );
  });

  it("supports bare email addresses and angle-bracket-only addresses", () => {
    assert.deepEqual(parseFromHeader("  Alerts@Example.ORG "), {
      email: "alerts@example.org",
      name: "alerts@example.org",
    });

    assert.deepEqual(parseFromHeader("<NoReply@Example.NET>"), {
      email: "noreply@example.net",
      name: "noreply@example.net",
    });
  });

  it("handles empty From headers gracefully", () => {
    assert.deepEqual(parseFromHeader("   "), {
      email: "",
      name: "",
    });
  });
});

describe("groupMessagesBySender", () => {
  it("returns an empty array when given no messages", () => {
    assert.deepEqual(groupMessagesBySender([]), []);
  });

  it("groups by normalized sender email, aggregates size/count/unsubscribe, and sorts properly", () => {
    const groups = groupMessagesBySender([
      {
        id: "m1",
        from: "news@shop.com",
        subject: "Older promo",
        date: "2026-01-01T10:00:00.000Z",
        sizeBytes: 1_000,
        hasUnsubscribeHeader: false,
      },
      {
        id: "m2",
        from: '"Shop Deals" <NEWS@SHOP.COM>',
        subject: "Latest promo",
        date: "2026-05-01T12:00:00.000Z",
        sizeBytes: 2_500,
        hasUnsubscribeHeader: true,
      },
      {
        id: "m3",
        from: "Big Files <files@cloud.io>",
        subject: "Monthly archive",
        date: "2026-03-10T08:00:00.000Z",
        sizeBytes: 5_000,
        hasUnsubscribeHeader: false,
      },
      {
        id: "m4",
        from: "Digest A <a@digest.org>",
        subject: "Issue 1",
        date: "2026-02-01T00:00:00.000Z",
        sizeBytes: 1_500,
        hasUnsubscribeHeader: false,
      },
      {
        id: "m5",
        from: "Digest B <b@digest.org>",
        subject: "Part 1",
        date: "2026-02-01T00:00:00.000Z",
        sizeBytes: 750,
        hasUnsubscribeHeader: true,
      },
      {
        id: "m6",
        from: "Digest B <b@digest.org>",
        subject: "Part 2",
        date: "2026-02-02T00:00:00.000Z",
        sizeBytes: 750,
        hasUnsubscribeHeader: false,
      },
    ]);

    assert.equal(groups.length, 4);

    // Highest totalSizeBytes first (files@cloud.io: 5000)
    assert.deepEqual(groups[0], {
      senderEmail: "files@cloud.io",
      senderName: "Big Files",
      messageCount: 1,
      totalSizeBytes: 5_000,
      latestDate: "2026-03-10T08:00:00.000Z",
      sampleSubject: "Monthly archive",
      hasUnsubscribeHeader: false,
      messageIds: ["m3"],
    });

    // Second (news@shop.com: 3500, merged case-insensitively)
    assert.deepEqual(groups[1], {
      senderEmail: "news@shop.com",
      senderName: "Shop Deals",
      messageCount: 2,
      totalSizeBytes: 3_500,
      latestDate: "2026-05-01T12:00:00.000Z",
      sampleSubject: "Latest promo",
      hasUnsubscribeHeader: true,
      messageIds: ["m1", "m2"],
    });

    // Tie on totalSizeBytes (1500): b@digest.org has messageCount 2 > a@digest.org messageCount 1
    assert.equal(groups[2].senderEmail, "b@digest.org");
    assert.equal(groups[2].messageCount, 2);
    assert.equal(groups[2].totalSizeBytes, 1_500);
    assert.equal(groups[2].latestDate, "2026-02-02T00:00:00.000Z");
    assert.equal(groups[2].sampleSubject, "Part 2");
    assert.equal(groups[2].hasUnsubscribeHeader, true);
    assert.deepEqual(groups[2].messageIds, ["m5", "m6"]);

    assert.equal(groups[3].senderEmail, "a@digest.org");
    assert.equal(groups[3].messageCount, 1);
    assert.equal(groups[3].totalSizeBytes, 1_500);
  });

  it("keeps the latest date and subject even when older messages appear later in input", () => {
    const groups = groupMessagesBySender([
      {
        id: "newer",
        from: "Team <team@example.com>",
        subject: "Newest update",
        date: "2026-06-01T12:00:00.000Z",
        sizeBytes: 400,
        hasUnsubscribeHeader: false,
      },
      {
        id: "older",
        from: "Team <team@example.com>",
        subject: "Old update",
        date: "2025-12-01T12:00:00.000Z",
        sizeBytes: 600,
        hasUnsubscribeHeader: true,
      },
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].latestDate, "2026-06-01T12:00:00.000Z");
    assert.equal(groups[0].sampleSubject, "Newest update");
    assert.equal(groups[0].totalSizeBytes, 1_000);
    assert.equal(groups[0].hasUnsubscribeHeader, true);
  });
});

describe("mergeSenderGroups", () => {
  it("returns an empty array when both inputs are empty", () => {
    assert.deepEqual(mergeSenderGroups([], []), []);
  });

  it("merges matching senders, keeps latest metadata, explicit display names, and logical OR unsubscribe", () => {
    const existing = [
      {
        senderEmail: "news@shop.com",
        senderName: "news@shop.com",
        messageCount: 1,
        totalSizeBytes: 1_500,
        latestDate: "2026-02-01T10:00:00.000Z",
        sampleSubject: "Older newsletter",
        hasUnsubscribeHeader: false,
        messageIds: ["m1"],
      },
      {
        senderEmail: "files@cloud.io",
        senderName: "Cloud Files",
        messageCount: 1,
        totalSizeBytes: 3_000,
        latestDate: "2026-03-01T10:00:00.000Z",
        sampleSubject: "Backup ready",
        hasUnsubscribeHeader: false,
        messageIds: ["m2"],
      },
    ];

    const incoming = [
      {
        senderEmail: "NEWS@SHOP.COM",
        senderName: "Shop Deals",
        messageCount: 2,
        totalSizeBytes: 2_500,
        latestDate: "2026-05-10T12:00:00.000Z",
        sampleSubject: "Spring sale",
        hasUnsubscribeHeader: true,
        messageIds: ["m3", "m4"],
      },
      {
        senderEmail: "alerts@bank.com",
        senderName: "Bank Alerts",
        messageCount: 1,
        totalSizeBytes: 1_000,
        latestDate: "2026-04-01T08:00:00.000Z",
        sampleSubject: "Statement",
        hasUnsubscribeHeader: false,
        messageIds: ["m5"],
      },
    ];

    const merged = mergeSenderGroups(existing, incoming);

    assert.equal(merged.length, 3);
    assert.deepEqual(merged[0], {
      senderEmail: "news@shop.com",
      senderName: "Shop Deals",
      messageCount: 3,
      totalSizeBytes: 4_000,
      latestDate: "2026-05-10T12:00:00.000Z",
      sampleSubject: "Spring sale",
      hasUnsubscribeHeader: true,
      messageIds: ["m1", "m3", "m4"],
    });
    assert.equal(merged[1].senderEmail, "files@cloud.io");
    assert.equal(merged[2].senderEmail, "alerts@bank.com");

    // Input objects and arrays must remain unmutated.
    assert.deepEqual(existing[0].messageIds, ["m1"]);
    assert.equal(existing[0].messageCount, 1);
  });

  it("deduplicates overlapping messageIds and keeps explicit display names even if incoming is older", () => {
    const existing = [
      {
        senderEmail: "digest@news.org",
        senderName: "digest@news.org",
        messageCount: 2,
        totalSizeBytes: 2_000,
        latestDate: "2026-06-01T00:00:00.000Z",
        sampleSubject: "Latest digest",
        hasUnsubscribeHeader: false,
        messageIds: ["m1", "m2"],
      },
    ];

    const incoming = [
      {
        senderEmail: "digest@news.org",
        senderName: "Daily Digest",
        messageCount: 2,
        totalSizeBytes: 1_000,
        latestDate: "2026-01-01T00:00:00.000Z",
        sampleSubject: "Old digest",
        hasUnsubscribeHeader: true,
        messageIds: ["m2", "m3"],
      },
      {
        senderEmail: "digest@news.org",
        senderName: "Daily Digest",
        messageCount: 1,
        totalSizeBytes: 1_000,
        latestDate: "2026-01-01T00:00:00.000Z",
        sampleSubject: "Old digest",
        hasUnsubscribeHeader: false,
        messageIds: ["m1"],
      },
    ];

    const merged = mergeSenderGroups(existing, incoming);

    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0], {
      senderEmail: "digest@news.org",
      senderName: "Daily Digest",
      messageCount: 3,
      totalSizeBytes: 2_500,
      latestDate: "2026-06-01T00:00:00.000Z",
      sampleSubject: "Latest digest",
      hasUnsubscribeHeader: true,
      messageIds: ["m1", "m2", "m3"],
    });
  });

  it("sorts ties by totalSizeBytes desc, then messageCount desc, then senderEmail asc", () => {
    const merged = mergeSenderGroups(
      [
        {
          senderEmail: "b@example.com",
          senderName: "B",
          messageCount: 1,
          totalSizeBytes: 2_000,
          latestDate: null,
          sampleSubject: "B1",
          hasUnsubscribeHeader: false,
          messageIds: ["b1"],
        },
        {
          senderEmail: "c@example.com",
          senderName: "C",
          messageCount: 2,
          totalSizeBytes: 2_000,
          latestDate: null,
          sampleSubject: "C1",
          hasUnsubscribeHeader: false,
          messageIds: ["c1", "c2"],
        },
      ],
      [
        {
          senderEmail: "a@example.com",
          senderName: "A",
          messageCount: 2,
          totalSizeBytes: 2_000,
          latestDate: null,
          sampleSubject: "A1",
          hasUnsubscribeHeader: false,
          messageIds: ["a1", "a2"],
        },
      ],
    );

    assert.deepEqual(
      merged.map((group) => group.senderEmail),
      ["a@example.com", "c@example.com", "b@example.com"],
    );
  });
});
