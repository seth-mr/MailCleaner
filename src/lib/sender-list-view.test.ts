import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SenderGroup } from "./gmail-grouping";
import type { SenderBrandNode } from "./sender-tree";
import type * as SenderListViewModule from "./sender-list-view";

const {
  INITIAL_VISIBLE_ITEMS,
  VISIBLE_ITEMS_STEP,
  SMALL_SENDER_MAX_MESSAGES,
  SMALL_SENDER_MAX_BYTES,
  filterSendersByQuery,
  filterBrandsByQuery,
  partitionSenderListView,
} = (await import(
  new URL("./sender-list-view.ts", import.meta.url).href
)) as typeof SenderListViewModule;

function makeSender(overrides: Partial<SenderGroup> = {}): SenderGroup {
  return {
    senderEmail: "news@example.com",
    senderName: "Example News",
    messageCount: 10,
    totalSizeBytes: 1024 * 1024,
    latestDate: "2026-11-01T12:00:00.000Z",
    sampleSubject: "Weekly digest",
    hasUnsubscribeHeader: true,
    messageIds: ["m1", "m2"],
    ...overrides,
  };
}

function makeBrand(overrides: Partial<SenderBrandNode> = {}): SenderBrandNode {
  const defaultSender = makeSender();
  return {
    brandKey: "example",
    brandLabel: "Example",
    messageCount: 10,
    totalSizeBytes: 1024 * 1024,
    latestDate: "2026-11-01T12:00:00.000Z",
    domains: [
      {
        host: "example.com",
        messageCount: 10,
        totalSizeBytes: 1024 * 1024,
        latestDate: "2026-11-01T12:00:00.000Z",
        senders: [defaultSender],
        messageIds: ["m1", "m2"],
      },
    ],
    messageIds: ["m1", "m2"],
    ...overrides,
  };
}

describe("sender-list-view constants", () => {
  it("exports expected pagination and long-tail thresholds", () => {
    assert.equal(INITIAL_VISIBLE_ITEMS, 15);
    assert.equal(VISIBLE_ITEMS_STEP, 20);
    assert.equal(SMALL_SENDER_MAX_MESSAGES, 2);
    assert.equal(SMALL_SENDER_MAX_BYTES, 500 * 1024);
  });
});

describe("filterSendersByQuery", () => {
  const senders: SenderGroup[] = [
    makeSender({
      senderEmail: "deals@promo.amazon.com",
      senderName: "Amazon Deals",
    }),
    makeSender({
      senderEmail: "billing@stripe.com",
      senderName: "Stripe Receipts",
    }),
    makeSender({
      senderEmail: "alerts@github.com",
      senderName: "GitHub Notifications",
    }),
  ];

  it("returns all senders when query is empty or whitespace", () => {
    assert.deepEqual(filterSendersByQuery(senders, ""), senders);
    assert.deepEqual(filterSendersByQuery(senders, "   "), senders);
  });

  it("matches case-insensitively on senderEmail, senderName, and domain", () => {
    assert.deepEqual(
      filterSendersByQuery(senders, "STRIPE").map((s) => s.senderEmail),
      ["billing@stripe.com"],
    );
    assert.deepEqual(
      filterSendersByQuery(senders, "notifications").map((s) => s.senderEmail),
      ["alerts@github.com"],
    );
    assert.deepEqual(
      filterSendersByQuery(senders, "promo.amazon.com").map(
        (s) => s.senderEmail,
      ),
      ["deals@promo.amazon.com"],
    );
  });
});

describe("filterBrandsByQuery", () => {
  const brands: SenderBrandNode[] = [
    makeBrand({
      brandKey: "amazon",
      brandLabel: "Amazon",
      domains: [
        {
          host: "marketplace.amazon.co.uk",
          messageCount: 5,
          totalSizeBytes: 800 * 1024,
          latestDate: null,
          senders: [
            makeSender({
              senderEmail: "orders@marketplace.amazon.co.uk",
              senderName: "Marketplace Orders",
            }),
          ],
          messageIds: ["a1"],
        },
      ],
    }),
    makeBrand({
      brandKey: "linear",
      brandLabel: "Linear",
      domains: [
        {
          host: "linear.app",
          messageCount: 4,
          totalSizeBytes: 600 * 1024,
          latestDate: null,
          senders: [
            makeSender({
              senderEmail: "notifications@linear.app",
              senderName: "Linear Workspace",
            }),
          ],
          messageIds: ["l1"],
        },
      ],
    }),
  ];

  it("returns all brands when query is empty or whitespace", () => {
    assert.deepEqual(filterBrandsByQuery(brands, ""), brands);
    assert.deepEqual(filterBrandsByQuery(brands, "  \t "), brands);
  });

  it("matches brandLabel, brandKey, domain host, senderEmail, and senderName", () => {
    assert.deepEqual(
      filterBrandsByQuery(brands, "LINEAR").map((b) => b.brandKey),
      ["linear"],
    );
    assert.deepEqual(
      filterBrandsByQuery(brands, "amazon.co.uk").map((b) => b.brandKey),
      ["amazon"],
    );
    assert.deepEqual(
      filterBrandsByQuery(brands, "orders@marketplace").map((b) => b.brandKey),
      ["amazon"],
    );
    assert.deepEqual(
      filterBrandsByQuery(brands, "workspace").map((b) => b.brandKey),
      ["linear"],
    );
  });
});

describe("partitionSenderListView", () => {
  it("separates long-tail senders and computes primaryRemainingCount", () => {
    const primary = Array.from({ length: 18 }, (_, index) =>
      makeSender({
        senderEmail: `primary-${index}@example.com`,
        messageCount: 5,
        totalSizeBytes: 600 * 1024,
      }),
    );
    const boundaryLargeByBytes = makeSender({
      senderEmail: "exact-500k@example.com",
      messageCount: 1,
      totalSizeBytes: SMALL_SENDER_MAX_BYTES,
    });
    const boundaryLargeByCount = makeSender({
      senderEmail: "three-small@example.com",
      messageCount: 3,
      totalSizeBytes: 1000,
    });
    const small = [
      makeSender({
        senderEmail: "tiny-1@example.com",
        messageCount: 1,
        totalSizeBytes: 12 * 1024,
      }),
      makeSender({
        senderEmail: "tiny-2@example.com",
        messageCount: 2,
        totalSizeBytes: SMALL_SENDER_MAX_BYTES - 1,
      }),
    ];

    const items = [
      ...primary,
      boundaryLargeByBytes,
      boundaryLargeByCount,
      ...small,
    ];

    const result = partitionSenderListView(items, {
      visibleLimit: INITIAL_VISIBLE_ITEMS,
      isSearchActive: false,
      showLongTailExpanded: false,
    });

    assert.equal(result.shouldCollapseLongTail, true);
    assert.equal(result.primaryVisible.length, 15);
    assert.equal(result.primaryRemainingCount, 5);
    assert.deepEqual(
      result.longTailItems.map((item) => item.senderEmail),
      ["tiny-1@example.com", "tiny-2@example.com"],
    );
  });

  it("collapses long-tail brand nodes using messageCount and totalSizeBytes", () => {
    const bigBrand = makeBrand({
      brandKey: "big",
      brandLabel: "Big",
      messageCount: 10,
      totalSizeBytes: 2 * 1024 * 1024,
    });
    const smallBrand = makeBrand({
      brandKey: "small",
      brandLabel: "Small",
      messageCount: 2,
      totalSizeBytes: 100 * 1024,
    });

    const result = partitionSenderListView([bigBrand, smallBrand], {
      visibleLimit: INITIAL_VISIBLE_ITEMS,
      isSearchActive: false,
      showLongTailExpanded: true,
    });

    assert.equal(result.shouldCollapseLongTail, true);
    assert.deepEqual(
      result.primaryVisible.map((b) => b.brandKey),
      ["big"],
    );
    assert.equal(result.primaryRemainingCount, 0);
    assert.deepEqual(
      result.longTailItems.map((b) => b.brandKey),
      ["small"],
    );
  });

  it("does not collapse long-tail items when isSearchActive is true", () => {
    const items = [
      makeSender({
        senderEmail: "big@example.com",
        messageCount: 10,
        totalSizeBytes: 1024 * 1024,
      }),
      makeSender({
        senderEmail: "small@example.com",
        messageCount: 1,
        totalSizeBytes: 4096,
      }),
    ];

    const result = partitionSenderListView(items, {
      visibleLimit: INITIAL_VISIBLE_ITEMS,
      isSearchActive: true,
      showLongTailExpanded: false,
    });

    assert.equal(result.shouldCollapseLongTail, false);
    assert.deepEqual(result.longTailItems, []);
    assert.equal(result.primaryVisible.length, 2);
    assert.equal(result.primaryRemainingCount, 0);
  });

  it("keeps all items in primaryVisible when all items are small", () => {
    const onlySmall = Array.from({ length: 18 }, (_, index) =>
      makeSender({
        senderEmail: `small-${index}@example.com`,
        messageCount: 1,
        totalSizeBytes: 8 * 1024,
      }),
    );

    const result = partitionSenderListView(onlySmall, {
      visibleLimit: INITIAL_VISIBLE_ITEMS,
      isSearchActive: false,
      showLongTailExpanded: false,
    });

    assert.equal(result.shouldCollapseLongTail, false);
    assert.deepEqual(result.longTailItems, []);
    assert.equal(result.primaryVisible.length, 15);
    assert.equal(result.primaryRemainingCount, 3);
  });

  it("keeps shouldCollapseLongTail false when there are no small items", () => {
    const onlyLarge = [
      makeSender({
        senderEmail: "large@example.com",
        messageCount: 5,
        totalSizeBytes: 900 * 1024,
      }),
    ];

    const result = partitionSenderListView(onlyLarge, {
      visibleLimit: INITIAL_VISIBLE_ITEMS,
      isSearchActive: false,
      showLongTailExpanded: false,
    });

    assert.equal(result.shouldCollapseLongTail, false);
    assert.deepEqual(result.longTailItems, []);
    assert.equal(result.primaryVisible.length, 1);
    assert.equal(result.primaryRemainingCount, 0);
  });
});
