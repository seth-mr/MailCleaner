import type { SenderGroup } from "./gmail-grouping";
import type { SenderBrandNode } from "./sender-tree";

export const INITIAL_VISIBLE_ITEMS = 15;
export const VISIBLE_ITEMS_STEP = 20;
export const SMALL_SENDER_MAX_MESSAGES = 2;
export const SMALL_SENDER_MAX_BYTES = 500 * 1024;

export interface PartitionSenderListViewOptions {
  visibleLimit: number;
  isSearchActive: boolean;
  showLongTailExpanded: boolean;
}

export interface PartitionSenderListViewResult<T> {
  primaryVisible: T[];
  primaryRemainingCount: number;
  longTailItems: T[];
  shouldCollapseLongTail: boolean;
}

function normalizeSearchQuery(query: string): string {
  return typeof query === "string" ? query.trim().toLowerCase() : "";
}

function isLongTailItem(item: SenderGroup | SenderBrandNode): boolean {
  return (
    item.messageCount <= SMALL_SENDER_MAX_MESSAGES &&
    item.totalSizeBytes < SMALL_SENDER_MAX_BYTES
  );
}

function matchesSenderQuery(
  sender: SenderGroup,
  normalizedQuery: string,
): boolean {
  return (
    sender.senderEmail.toLowerCase().includes(normalizedQuery) ||
    sender.senderName.toLowerCase().includes(normalizedQuery)
  );
}

/**
 * Filters flat sender groups by case-insensitive substring match against
 * sender email, display name, or extracted domain host.
 */
export function filterSendersByQuery(
  senders: SenderGroup[],
  query: string,
): SenderGroup[] {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    return senders;
  }

  return senders.filter((sender) =>
    matchesSenderQuery(sender, normalizedQuery),
  );
}

/**
 * Filters brand tree nodes by case-insensitive substring match against
 * brand label/key, any domain host, or any nested sender email/name.
 */
export function filterBrandsByQuery(
  brands: SenderBrandNode[],
  query: string,
): SenderBrandNode[] {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    return brands;
  }

  return brands.filter((brand) => {
    if (
      brand.brandLabel.toLowerCase().includes(normalizedQuery) ||
      brand.brandKey.toLowerCase().includes(normalizedQuery)
    ) {
      return true;
    }

    return brand.domains.some(
      (domainNode) =>
        domainNode.host.toLowerCase().includes(normalizedQuery) ||
        domainNode.senders.some((sender) =>
          matchesSenderQuery(sender, normalizedQuery),
        ),
    );
  });
}

/**
 * Partitions a sender or brand list into a progressively windowed primary slice
 * and an optional collapsed long-tail group for small senders.
 */
export function partitionSenderListView<
  T extends SenderGroup | SenderBrandNode,
>(
  items: T[],
  options: PartitionSenderListViewOptions,
): PartitionSenderListViewResult<T> {
  const safeLimit = Number.isFinite(options.visibleLimit)
    ? Math.max(0, Math.floor(options.visibleLimit))
    : INITIAL_VISIBLE_ITEMS;

  if (options.isSearchActive) {
    const primaryVisible = items.slice(0, safeLimit);
    return {
      primaryVisible,
      primaryRemainingCount: Math.max(0, items.length - primaryVisible.length),
      longTailItems: [],
      shouldCollapseLongTail: false,
    };
  }

  const primaryItems: T[] = [];
  const longTailItems: T[] = [];

  for (const item of items) {
    if (isLongTailItem(item)) {
      longTailItems.push(item);
    } else {
      primaryItems.push(item);
    }
  }

  const shouldCollapseLongTail =
    primaryItems.length > 0 && longTailItems.length > 0;

  if (!shouldCollapseLongTail) {
    const primaryVisible = items.slice(0, safeLimit);
    return {
      primaryVisible,
      primaryRemainingCount: Math.max(0, items.length - primaryVisible.length),
      longTailItems: [],
      shouldCollapseLongTail: false,
    };
  }

  const primaryVisible = primaryItems.slice(0, safeLimit);
  return {
    primaryVisible,
    primaryRemainingCount: Math.max(
      0,
      primaryItems.length - primaryVisible.length,
    ),
    longTailItems,
    shouldCollapseLongTail: true,
  };
}
