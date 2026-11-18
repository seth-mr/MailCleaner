import type { SenderGroup } from "./gmail-grouping";

export const SENDER_SORT_OPTIONS = ["size", "count", "domains"] as const;
export type SenderSortBy = (typeof SENDER_SORT_OPTIONS)[number];

export interface SenderDomainNode {
  host: string;
  messageCount: number;
  totalSizeBytes: number;
  latestDate: string | null;
  senders: SenderGroup[];
  messageIds: string[];
}

export interface SenderBrandNode {
  brandKey: string;
  brandLabel: string;
  messageCount: number;
  totalSizeBytes: number;
  latestDate: string | null;
  domains: SenderDomainNode[];
  messageIds: string[];
}

const COMPOUND_PUBLIC_SUFFIXES = new Set<string>([
  "com.mx",
  "co.uk",
  "com.br",
  "com.ar",
  "com.au",
  "co.jp",
  "org.uk",
  "net.mx",
  "gob.mx",
  "edu.mx",
  "org.mx",
  "co.in",
  "co.nz",
  "co.za",
  "co.kr",
  "co.il",
  "co.id",
  "co.th",
  "com.co",
  "com.es",
  "com.pe",
  "com.cl",
  "com.tr",
  "com.cn",
  "com.hk",
  "com.tw",
  "com.sg",
  "com.uy",
  "com.ve",
  "com.ec",
  "ac.uk",
  "gov.uk",
  "net.uk",
  "net.au",
  "org.au",
  "ne.jp",
  "or.jp",
]);

/**
 * Extracts the normalized lowercase host domain from a sender email address,
 * returning `"unknown"` if no valid host is present.
 */
export function extractSenderHost(senderEmail: string): string {
  if (typeof senderEmail !== "string") {
    return "unknown";
  }

  const trimmed = senderEmail.trim();
  if (!trimmed) {
    return "unknown";
  }

  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex === -1) {
    return "unknown";
  }

  const rawHost = trimmed
    .slice(atIndex + 1)
    .trim()
    .replace(/>+$/, "")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase();

  if (!rawHost || /\s/.test(rawHost)) {
    return "unknown";
  }

  return rawHost;
}

/**
 * Extracts the primary brand label from a host domain by stripping its TLD or
 * common compound public suffix (e.g. `.com.mx`, `.co.uk`).
 */
export function extractBrandKey(host: string): string {
  if (typeof host !== "string") {
    return "unknown";
  }

  const normalized = host.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!normalized || normalized === "unknown") {
    return "unknown";
  }

  const labels = normalized.split(".").filter(Boolean);
  if (labels.length === 0) {
    return "unknown";
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.every((part) => /^\d+$/.test(part))) {
    return normalized;
  }

  if (labels.length >= 3) {
    const compoundSuffix = `${labels[labels.length - 2]}.${labels[labels.length - 1]}`;
    if (COMPOUND_PUBLIC_SUFFIXES.has(compoundSuffix)) {
      return labels[labels.length - 3];
    }
  }

  return labels[labels.length - 2];
}

function formatBrandLabel(brandKey: string): string {
  if (!brandKey || brandKey === "unknown") {
    return "Unknown";
  }
  if (/^[a-z]/.test(brandKey)) {
    return brandKey.charAt(0).toUpperCase() + brandKey.slice(1);
  }
  return brandKey;
}

function sanitizeSizeBytes(value: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function sanitizeMessageCount(value: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function selectLatestDate(dates: Array<string | null>): string | null {
  let bestDate: string | null = null;
  let bestTimestamp = Number.NaN;

  for (const candidate of dates) {
    if (!candidate) {
      continue;
    }
    const timestamp = Date.parse(candidate);
    if (!Number.isNaN(timestamp)) {
      const normalized = new Date(timestamp).toISOString();
      if (Number.isNaN(bestTimestamp) || timestamp > bestTimestamp) {
        bestTimestamp = timestamp;
        bestDate = normalized;
      }
    } else if (bestDate === null) {
      bestDate = candidate;
    }
  }

  return bestDate;
}

function collectDeduplicatedIds(idLists: Iterable<string[]>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const ids of idLists) {
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    }
  }

  return result;
}

function compareMetrics(
  a: { totalSizeBytes: number; messageCount: number },
  b: { totalSizeBytes: number; messageCount: number },
  keyA: string,
  keyB: string,
  sortBy: SenderSortBy = "size",
): number {
  if (sortBy === "count") {
    if (b.messageCount !== a.messageCount) {
      return b.messageCount - a.messageCount;
    }
    if (b.totalSizeBytes !== a.totalSizeBytes) {
      return b.totalSizeBytes - a.totalSizeBytes;
    }
    return keyA.localeCompare(keyB);
  }

  if (b.totalSizeBytes !== a.totalSizeBytes) {
    return b.totalSizeBytes - a.totalSizeBytes;
  }
  if (b.messageCount !== a.messageCount) {
    return b.messageCount - a.messageCount;
  }
  return keyA.localeCompare(keyB);
}

/**
 * Returns a new array of sender groups sorted by storage used descending
 * (for `"size"` and `"domains"`) or by message count descending (`"count"`).
 */
export function sortSenderGroups(
  senders: SenderGroup[],
  sortBy: SenderSortBy = "size",
): SenderGroup[] {
  return [...senders].sort((a, b) =>
    compareMetrics(
      {
        totalSizeBytes: sanitizeSizeBytes(a.totalSizeBytes),
        messageCount: sanitizeMessageCount(a.messageCount),
      },
      {
        totalSizeBytes: sanitizeSizeBytes(b.totalSizeBytes),
        messageCount: sanitizeMessageCount(b.messageCount),
      },
      a.senderEmail,
      b.senderEmail,
      sortBy,
    ),
  );
}

/**
 * Builds a 3-level hierarchy: Brand -> Domain/Subdomain -> Exact Senders,
 * aggregating counts, total sizes, latest dates, and deduplicated message IDs
 * at every level and sorting each level according to `sortBy`.
 */
export function buildSenderBrandTree(
  senders: SenderGroup[],
  sortBy: SenderSortBy = "size",
): SenderBrandNode[] {
  if (senders.length === 0) {
    return [];
  }

  const brandsMap = new Map<string, Map<string, SenderGroup[]>>();

  for (const sender of senders) {
    const host = extractSenderHost(sender.senderEmail);
    const brandKey = extractBrandKey(host);

    let domainsMap = brandsMap.get(brandKey);
    if (!domainsMap) {
      domainsMap = new Map<string, SenderGroup[]>();
      brandsMap.set(brandKey, domainsMap);
    }

    let domainSenders = domainsMap.get(host);
    if (!domainSenders) {
      domainSenders = [];
      domainsMap.set(host, domainSenders);
    }

    domainSenders.push(sender);
  }

  const brandNodes: SenderBrandNode[] = [];

  for (const [brandKey, domainsMap] of brandsMap.entries()) {
    const domainNodes: SenderDomainNode[] = [];

    for (const [host, rawSenders] of domainsMap.entries()) {
      const sortedSenders = sortSenderGroups(rawSenders, sortBy);

      const messageCount = sortedSenders.reduce(
        (sum, sender) => sum + sanitizeMessageCount(sender.messageCount),
        0,
      );
      const totalSizeBytes = sortedSenders.reduce(
        (sum, sender) => sum + sanitizeSizeBytes(sender.totalSizeBytes),
        0,
      );
      const latestDate = selectLatestDate(
        sortedSenders.map((sender) => sender.latestDate),
      );
      const messageIds = collectDeduplicatedIds(
        sortedSenders.map((sender) => sender.messageIds),
      );

      domainNodes.push({
        host,
        messageCount,
        totalSizeBytes,
        latestDate,
        senders: sortedSenders,
        messageIds,
      });
    }

    domainNodes.sort((a, b) => {
      if (sortBy === "domains" && b.senders.length !== a.senders.length) {
        return b.senders.length - a.senders.length;
      }
      return compareMetrics(a, b, a.host, b.host, sortBy);
    });

    const brandMessageCount = domainNodes.reduce(
      (sum, domain) => sum + domain.messageCount,
      0,
    );
    const brandTotalSizeBytes = domainNodes.reduce(
      (sum, domain) => sum + domain.totalSizeBytes,
      0,
    );
    const brandLatestDate = selectLatestDate(
      domainNodes.map((domain) => domain.latestDate),
    );
    const brandMessageIds = collectDeduplicatedIds(
      domainNodes.map((domain) => domain.messageIds),
    );

    brandNodes.push({
      brandKey,
      brandLabel: formatBrandLabel(brandKey),
      messageCount: brandMessageCount,
      totalSizeBytes: brandTotalSizeBytes,
      latestDate: brandLatestDate,
      domains: domainNodes,
      messageIds: brandMessageIds,
    });
  }

  brandNodes.sort((a, b) => {
    if (sortBy === "domains" && b.domains.length !== a.domains.length) {
      return b.domains.length - a.domains.length;
    }
    return compareMetrics(a, b, a.brandKey, b.brandKey, sortBy);
  });

  return brandNodes;
}
