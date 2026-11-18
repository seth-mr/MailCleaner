import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SenderGroup } from "./gmail-grouping";
import type * as SenderTreeModule from "./sender-tree";

const {
  SENDER_SORT_OPTIONS,
  extractSenderHost,
  extractBrandKey,
  sortSenderGroups,
  buildSenderBrandTree,
} = (await import(
  new URL("./sender-tree.ts", import.meta.url).href
)) as typeof SenderTreeModule;

describe("extractSenderHost", () => {
  it("extracts lowercase host domains from standard and subdomain email addresses", () => {
    assert.equal(
      extractSenderHost("promo@mail.aliexpress.com"),
      "mail.aliexpress.com",
    );
    assert.equal(
      extractSenderHost("  Deals@Notice.AliExpress.COM  "),
      "notice.aliexpress.com",
    );
    assert.equal(
      extractSenderHost("orders@orders.amazon.com.mx"),
      "orders.amazon.com.mx",
    );
  });

  it("falls back to unknown when sender email lacks a valid host", () => {
    assert.equal(extractSenderHost(""), "unknown");
    assert.equal(extractSenderHost("   "), "unknown");
    assert.equal(extractSenderHost("unknown"), "unknown");
    assert.equal(extractSenderHost("invalid-email"), "unknown");
    assert.equal(extractSenderHost("user@"), "unknown");
    assert.equal(extractSenderHost("user@bad host.com"), "unknown");
  });
});

describe("extractBrandKey", () => {
  it("extracts the brand label across subdomains and different TLDs", () => {
    assert.equal(extractBrandKey("mail.aliexpress.com"), "aliexpress");
    assert.equal(extractBrandKey("notice.aliexpress.com"), "aliexpress");
    assert.equal(extractBrandKey("a.b.aliexpress.com"), "aliexpress");
    assert.equal(extractBrandKey("aliexpress.ru"), "aliexpress");
    assert.equal(extractBrandKey("MAIL.GOOGLE.COM"), "google");
  });

  it("handles common compound public suffixes without grouping by com or co", () => {
    assert.equal(extractBrandKey("orders.amazon.com.mx"), "amazon");
    assert.equal(extractBrandKey("amazon.com.mx"), "amazon");
    assert.equal(extractBrandKey("news.bbc.co.uk"), "bbc");
    assert.equal(extractBrandKey("offers.mercadolivre.com.br"), "mercadolivre");
    assert.equal(extractBrandKey("alerts.galicia.com.ar"), "galicia");
    assert.equal(extractBrandKey("deals.myer.com.au"), "myer");
    assert.equal(extractBrandKey("info.rakuten.co.jp"), "rakuten");
    assert.equal(extractBrandKey("support.charity.org.uk"), "charity");
    assert.equal(extractBrandKey("billing.telmex.net.mx"), "telmex");
    assert.equal(extractBrandKey("citas.sat.gob.mx"), "sat");
    assert.equal(extractBrandKey("avisos.unam.edu.mx"), "unam");
  });

  it("falls back cleanly for unknown, single-label, and IP hosts", () => {
    assert.equal(extractBrandKey(""), "unknown");
    assert.equal(extractBrandKey("unknown"), "unknown");
    assert.equal(extractBrandKey("localhost"), "localhost");
    assert.equal(extractBrandKey("192.168.1.10"), "192.168.1.10");
  });
});

describe("buildSenderBrandTree", () => {
  it("returns an empty array when given no senders", () => {
    assert.deepEqual(buildSenderBrandTree([]), []);
  });

  it("groups multi-domain AliExpress and Amazon senders under their brands with accurate subtotals and sorting", () => {
    const input: SenderGroup[] = [
      {
        senderEmail: "promo@mail.aliexpress.com",
        senderName: "AliExpress Promo",
        messageCount: 3,
        totalSizeBytes: 3_000,
        latestDate: "2026-04-01T10:00:00.000Z",
        sampleSubject: "Flash deals",
        hasUnsubscribeHeader: true,
        messageIds: ["m1", "m2", "m3"],
      },
      {
        senderEmail: "deals@mail.aliexpress.com",
        senderName: "AliExpress Deals",
        messageCount: 2,
        totalSizeBytes: 2_000,
        latestDate: "2026-05-01T12:00:00.000Z",
        sampleSubject: "Weekend coupons",
        hasUnsubscribeHeader: true,
        messageIds: ["m4", "m5"],
      },
      {
        senderEmail: "transaction@notice.aliexpress.com",
        senderName: "AliExpress Orders",
        messageCount: 1,
        totalSizeBytes: 4_000,
        latestDate: "2026-05-10T08:00:00.000Z",
        sampleSubject: "Order shipped",
        hasUnsubscribeHeader: false,
        messageIds: ["m6"],
      },
      {
        senderEmail: "offers@aliexpress.ru",
        senderName: "AliExpress RU",
        messageCount: 1,
        totalSizeBytes: 1_000,
        latestDate: "2026-03-01T00:00:00.000Z",
        sampleSubject: "RU Sale",
        hasUnsubscribeHeader: true,
        messageIds: ["m7"],
      },
      {
        senderEmail: "orders@orders.amazon.com.mx",
        senderName: "Amazon Mexico",
        messageCount: 2,
        totalSizeBytes: 6_000,
        latestDate: "2026-05-05T09:00:00.000Z",
        sampleSubject: "Your package",
        hasUnsubscribeHeader: false,
        messageIds: ["a1", "a2"],
      },
      {
        senderEmail: "store-news@amazon.com",
        senderName: "Amazon News",
        messageCount: 1,
        totalSizeBytes: 1_500,
        latestDate: "2026-02-01T09:00:00.000Z",
        sampleSubject: "Prime Day",
        hasUnsubscribeHeader: true,
        messageIds: ["a3"],
      },
    ];

    const snapshot = input.map((sender) => ({
      ...sender,
      messageIds: [...sender.messageIds],
    }));

    const tree = buildSenderBrandTree(input);

    // Input array and items must remain unmutated.
    assert.deepEqual(input, snapshot);

    // AliExpress total = 10,000 bytes (7 emails) > Amazon total = 7,500 bytes (3 emails)
    assert.equal(tree.length, 2);

    const ali = tree[0];
    assert.equal(ali.brandKey, "aliexpress");
    assert.equal(ali.brandLabel, "Aliexpress");
    assert.equal(ali.messageCount, 7);
    assert.equal(ali.totalSizeBytes, 10_000);
    assert.equal(ali.latestDate, "2026-05-10T08:00:00.000Z");
    assert.deepEqual(ali.messageIds, [
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
      "m6",
      "m7",
    ]);

    // Domains sorted by totalSizeBytes desc: mail.aliexpress.com (5000) > notice.aliexpress.com (4000) > aliexpress.ru (1000)
    assert.deepEqual(
      ali.domains.map((domain) => domain.host),
      ["mail.aliexpress.com", "notice.aliexpress.com", "aliexpress.ru"],
    );

    const mailAli = ali.domains[0];
    assert.equal(mailAli.messageCount, 5);
    assert.equal(mailAli.totalSizeBytes, 5_000);
    assert.equal(mailAli.latestDate, "2026-05-01T12:00:00.000Z");
    assert.deepEqual(mailAli.messageIds, ["m1", "m2", "m3", "m4", "m5"]);
    assert.deepEqual(
      mailAli.senders.map((sender) => sender.senderEmail),
      ["promo@mail.aliexpress.com", "deals@mail.aliexpress.com"],
    );

    const amazon = tree[1];
    assert.equal(amazon.brandKey, "amazon");
    assert.equal(amazon.brandLabel, "Amazon");
    assert.equal(amazon.messageCount, 3);
    assert.equal(amazon.totalSizeBytes, 7_500);
    assert.deepEqual(
      amazon.domains.map((domain) => domain.host),
      ["orders.amazon.com.mx", "amazon.com"],
    );
  });

  it("deduplicates overlapping messageIds and resolves ties by messageCount desc then alphabetically", () => {
    const tree = buildSenderBrandTree([
      {
        senderEmail: "b@beta.com",
        senderName: "Beta B",
        messageCount: 1,
        totalSizeBytes: 2_000,
        latestDate: null,
        sampleSubject: "B",
        hasUnsubscribeHeader: false,
        messageIds: ["shared-1"],
      },
      {
        senderEmail: "a@alpha.com",
        senderName: "Alpha A",
        messageCount: 1,
        totalSizeBytes: 2_000,
        latestDate: null,
        sampleSubject: "A",
        hasUnsubscribeHeader: false,
        messageIds: ["a-1"],
      },
      {
        senderEmail: "c1@gamma.com",
        senderName: "Gamma 1",
        messageCount: 1,
        totalSizeBytes: 1_000,
        latestDate: null,
        sampleSubject: "G1",
        hasUnsubscribeHeader: false,
        messageIds: ["shared-1", "g-1"],
      },
      {
        senderEmail: "c2@gamma.com",
        senderName: "Gamma 2",
        messageCount: 1,
        totalSizeBytes: 1_000,
        latestDate: null,
        sampleSubject: "G2",
        hasUnsubscribeHeader: false,
        messageIds: ["g-1", "g-2"],
      },
    ]);

    // All three brands have 2,000 bytes: gamma has 2 messages > alpha (1) and beta (1); alpha < beta alphabetically
    assert.deepEqual(
      tree.map((brand) => brand.brandKey),
      ["gamma", "alpha", "beta"],
    );
    assert.deepEqual(tree[0].messageIds, ["shared-1", "g-1", "g-2"]);
    assert.deepEqual(tree[0].domains[0].messageIds, ["shared-1", "g-1", "g-2"]);
  });

  it("supports sorting by size, count, and domains across brands, domains, and senders", () => {
    assert.deepEqual(SENDER_SORT_OPTIONS, ["size", "count", "domains"]);

    const senders: SenderGroup[] = [
      // Brand alpha: 1 domain, 1 sender, 10 emails, 50,000 bytes (largest storage)
      {
        senderEmail: "heavy@alpha.com",
        senderName: "Alpha Heavy",
        messageCount: 10,
        totalSizeBytes: 50_000,
        latestDate: "2026-05-01T00:00:00.000Z",
        sampleSubject: "Large attachment",
        hasUnsubscribeHeader: false,
        messageIds: ["a1"],
      },
      // Brand beta: 2 domains, 2 senders, 40 emails, 10,000 bytes (highest message count)
      {
        senderEmail: "news@mail.beta.com",
        senderName: "Beta Mail",
        messageCount: 30,
        totalSizeBytes: 4_000,
        latestDate: "2026-05-02T00:00:00.000Z",
        sampleSubject: "Daily digest",
        hasUnsubscribeHeader: true,
        messageIds: ["b1"],
      },
      {
        senderEmail: "alerts@alerts.beta.com",
        senderName: "Beta Alerts",
        messageCount: 10,
        totalSizeBytes: 6_000,
        latestDate: "2026-05-03T00:00:00.000Z",
        sampleSubject: "Alert",
        hasUnsubscribeHeader: false,
        messageIds: ["b2"],
      },
      // Brand gamma: 3 domains, 5 senders, 5 emails, 5,000 bytes (most domains)
      {
        senderEmail: "one@d1.gamma.com",
        senderName: "Gamma D1-1",
        messageCount: 1,
        totalSizeBytes: 1_000,
        latestDate: null,
        sampleSubject: "G1",
        hasUnsubscribeHeader: false,
        messageIds: ["g1"],
      },
      {
        senderEmail: "two@d1.gamma.com",
        senderName: "Gamma D1-2",
        messageCount: 1,
        totalSizeBytes: 1_500,
        latestDate: null,
        sampleSubject: "G2",
        hasUnsubscribeHeader: false,
        messageIds: ["g2"],
      },
      {
        senderEmail: "three@d1.gamma.com",
        senderName: "Gamma D1-3",
        messageCount: 1,
        totalSizeBytes: 500,
        latestDate: null,
        sampleSubject: "G3",
        hasUnsubscribeHeader: false,
        messageIds: ["g3"],
      },
      {
        senderEmail: "one@d2.gamma.com",
        senderName: "Gamma D2-1",
        messageCount: 2,
        totalSizeBytes: 2_500,
        latestDate: null,
        sampleSubject: "G4",
        hasUnsubscribeHeader: false,
        messageIds: ["g4"],
      },
      {
        senderEmail: "one@d3.gamma.com",
        senderName: "Gamma D3-1",
        messageCount: 1,
        totalSizeBytes: 3_500,
        latestDate: null,
        sampleSubject: "G5",
        hasUnsubscribeHeader: false,
        messageIds: ["g5"],
      },
    ];

    const bySize = buildSenderBrandTree(senders, "size");
    assert.deepEqual(
      bySize.map((brand) => brand.brandKey),
      ["alpha", "beta", "gamma"],
    );
    assert.deepEqual(
      bySize[1].domains.map((domain) => domain.host),
      ["alerts.beta.com", "mail.beta.com"],
    );

    const byCount = buildSenderBrandTree(senders, "count");
    assert.deepEqual(
      byCount.map((brand) => brand.brandKey),
      ["beta", "alpha", "gamma"],
    );
    assert.deepEqual(
      byCount[0].domains.map((domain) => domain.host),
      ["mail.beta.com", "alerts.beta.com"],
    );
    assert.deepEqual(
      byCount[2].domains.map((domain) => domain.host),
      ["d1.gamma.com", "d2.gamma.com", "d3.gamma.com"],
    );

    const byDomains = buildSenderBrandTree(senders, "domains");
    assert.deepEqual(
      byDomains.map((brand) => brand.brandKey),
      ["gamma", "beta", "alpha"],
    );
    // For gamma in "domains" mode: d1.gamma.com has 3 senders (3000 bytes), d3.gamma.com has 1 sender (3500 bytes) > d2.gamma.com (2500 bytes)
    assert.deepEqual(
      byDomains[0].domains.map((domain) => domain.host),
      ["d1.gamma.com", "d3.gamma.com", "d2.gamma.com"],
    );
    // Senders inside d1.gamma.com are sorted by totalSizeBytes desc
    assert.deepEqual(
      byDomains[0].domains[0].senders.map((sender) => sender.senderEmail),
      ["two@d1.gamma.com", "one@d1.gamma.com", "three@d1.gamma.com"],
    );
  });
});

describe("sortSenderGroups", () => {
  it("sorts flat sender groups without mutating input across size, count, and domains modes", () => {
    const input: SenderGroup[] = [
      {
        senderEmail: "many@example.com",
        senderName: "Many Small",
        messageCount: 50,
        totalSizeBytes: 5_000,
        latestDate: null,
        sampleSubject: "Many",
        hasUnsubscribeHeader: true,
        messageIds: ["m1"],
      },
      {
        senderEmail: "heavy@example.com",
        senderName: "Few Heavy",
        messageCount: 2,
        totalSizeBytes: 100_000,
        latestDate: null,
        sampleSubject: "Heavy",
        hasUnsubscribeHeader: false,
        messageIds: ["h1"],
      },
      {
        senderEmail: "mid@example.com",
        senderName: "Mid",
        messageCount: 10,
        totalSizeBytes: 20_000,
        latestDate: null,
        sampleSubject: "Mid",
        hasUnsubscribeHeader: false,
        messageIds: ["d1"],
      },
    ];

    const originalOrder = input.map((item) => item.senderEmail);

    assert.deepEqual(
      sortSenderGroups(input, "size").map((item) => item.senderEmail),
      ["heavy@example.com", "mid@example.com", "many@example.com"],
    );
    assert.deepEqual(
      sortSenderGroups(input, "domains").map((item) => item.senderEmail),
      ["heavy@example.com", "mid@example.com", "many@example.com"],
    );
    assert.deepEqual(
      sortSenderGroups(input, "count").map((item) => item.senderEmail),
      ["many@example.com", "mid@example.com", "heavy@example.com"],
    );
    assert.deepEqual(
      input.map((item) => item.senderEmail),
      originalOrder,
    );
  });
});
