export const GMAIL_PRESET_FILTERS = [
  "all",
  "promotions",
  "social",
  "updates",
  "spam",
] as const;
export type GmailPresetFilter = (typeof GMAIL_PRESET_FILTERS)[number];

export const GMAIL_AGE_FILTERS = ["any", "3m", "6m", "1y", "2y"] as const;
export type GmailAgeFilter = (typeof GMAIL_AGE_FILTERS)[number];

export const GMAIL_SIZE_FILTERS = ["any", "1M", "5M", "10M"] as const;
export type GmailSizeFilter = (typeof GMAIL_SIZE_FILTERS)[number];

export const DEFAULT_MAX_MESSAGES = 200;
export const MIN_MAX_MESSAGES = 1;
export const MAX_MAX_MESSAGES = 500;

export interface GmailFilterParams {
  preset?: GmailPresetFilter;
  olderThan?: GmailAgeFilter;
  largerThan?: GmailSizeFilter;
  hasAttachment?: boolean;
  unreadOnly?: boolean;
  search?: string;
  maxMessages?: number;
  pageToken?: string;
}

export interface GmailMessageSummary {
  id: string;
  from: string;
  subject: string;
  date: string | null;
  sizeBytes: number;
  hasUnsubscribeHeader: boolean;
}

export interface SenderGroup {
  senderEmail: string;
  senderName: string;
  messageCount: number;
  totalSizeBytes: number;
  latestDate: string | null;
  sampleSubject: string;
  hasUnsubscribeHeader: boolean;
  messageIds: string[];
}

/**
 * Builds the Gmail search query string and spam/trash inclusion flag
 * from the given quick-filter parameters.
 */
export function buildGmailSearchQuery(filters: GmailFilterParams = {}): {
  q: string;
  includeSpamTrash: boolean;
} {
  const tokens: string[] = [];
  const preset = filters.preset ?? "all";
  const olderThan = filters.olderThan ?? "any";
  const largerThan = filters.largerThan ?? "any";
  const search = filters.search?.trim() ?? "";

  if (preset === "promotions") {
    tokens.push("category:promotions");
  } else if (preset === "social") {
    tokens.push("category:social");
  } else if (preset === "updates") {
    tokens.push("category:updates");
  } else if (preset === "spam") {
    tokens.push("in:spam");
  }

  if (olderThan !== "any") {
    tokens.push(`older_than:${olderThan}`);
  }

  if (largerThan !== "any") {
    tokens.push(`larger:${largerThan}`);
  }

  if (filters.hasAttachment === true) {
    tokens.push("has:attachment");
  }

  if (filters.unreadOnly === true) {
    tokens.push("is:unread");
  }

  if (search.length > 0) {
    tokens.push(search);
  }

  return {
    q: tokens.join(" "),
    includeSpamTrash: preset === "spam",
  };
}

function unquoteDisplayName(rawName: string): string {
  const trimmed = rawName.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed
      .slice(1, -1)
      .replace(/\\(["\\])/g, "$1")
      .trim();
  }
  return trimmed;
}

/**
 * Parses a raw RFC 5322 `From` header into a lowercase email address
 * and a readable display name.
 */
export function parseFromHeader(rawFrom: string): {
  email: string;
  name: string;
} {
  const trimmed = rawFrom.trim();
  if (!trimmed) {
    return { email: "", name: "" };
  }

  const angleBracketMatch = /^(.*)<([^<>]+)>\s*$/.exec(trimmed);
  if (angleBracketMatch) {
    const email = angleBracketMatch[2].trim().toLowerCase();
    const parsedName = unquoteDisplayName(angleBracketMatch[1]);
    return {
      email,
      name: parsedName || email,
    };
  }

  const normalizedEmail = trimmed.toLowerCase();
  return {
    email: normalizedEmail,
    name: normalizedEmail,
  };
}

function parseTimestamp(dateValue: string | null): number {
  if (!dateValue) {
    return Number.NaN;
  }
  return Date.parse(dateValue);
}

function normalizeDateIso(dateValue: string | null): string | null {
  const timestamp = parseTimestamp(dateValue);
  if (Number.isNaN(timestamp)) {
    return dateValue;
  }
  return new Date(timestamp).toISOString();
}

function isNewerMessage(
  candidateTimestamp: number,
  currentTimestamp: number,
): boolean {
  if (Number.isNaN(candidateTimestamp)) {
    return false;
  }
  if (Number.isNaN(currentTimestamp)) {
    return true;
  }
  return candidateTimestamp > currentTimestamp;
}

function compareSenderGroups(a: SenderGroup, b: SenderGroup): number {
  if (b.totalSizeBytes !== a.totalSizeBytes) {
    return b.totalSizeBytes - a.totalSizeBytes;
  }
  if (b.messageCount !== a.messageCount) {
    return b.messageCount - a.messageCount;
  }
  return a.senderEmail.localeCompare(b.senderEmail);
}

/**
 * Groups Gmail message summaries by normalized sender email,
 * aggregating size, message count, latest metadata, and unsubscribe support,
 * sorted by `totalSizeBytes` descending (tie-broken by `messageCount` descending).
 */
export function groupMessagesBySender(
  messages: GmailMessageSummary[],
): SenderGroup[] {
  interface MutableSenderAccumulator {
    group: SenderGroup;
    latestTimestamp: number;
  }

  const groupsByEmail = new Map<string, MutableSenderAccumulator>();

  for (const message of messages) {
    const parsed = parseFromHeader(message.from);
    const senderEmail = parsed.email || "unknown";
    const senderName = parsed.name || senderEmail;
    const safeSizeBytes =
      typeof message.sizeBytes === "number" && Number.isFinite(message.sizeBytes)
        ? Math.max(0, message.sizeBytes)
        : 0;
    const candidateTimestamp = parseTimestamp(message.date);
    const normalizedDate = normalizeDateIso(message.date);
    const trimmedSubject = message.subject.trim();

    const existing = groupsByEmail.get(senderEmail);
    if (!existing) {
      groupsByEmail.set(senderEmail, {
        group: {
          senderEmail,
          senderName,
          messageCount: 1,
          totalSizeBytes: safeSizeBytes,
          latestDate: normalizedDate,
          sampleSubject: trimmedSubject,
          hasUnsubscribeHeader: Boolean(message.hasUnsubscribeHeader),
          messageIds: [message.id],
        },
        latestTimestamp: candidateTimestamp,
      });
      continue;
    }

    existing.group.messageCount += 1;
    existing.group.totalSizeBytes += safeSizeBytes;
    existing.group.hasUnsubscribeHeader =
      existing.group.hasUnsubscribeHeader ||
      Boolean(message.hasUnsubscribeHeader);
    existing.group.messageIds.push(message.id);

    // Prefer an explicit display name over a bare email fallback.
    if (
      existing.group.senderName === existing.group.senderEmail &&
      senderName !== senderEmail
    ) {
      existing.group.senderName = senderName;
    }

    if (isNewerMessage(candidateTimestamp, existing.latestTimestamp)) {
      existing.latestTimestamp = candidateTimestamp;
      existing.group.latestDate = normalizedDate;
      if (trimmedSubject.length > 0) {
        existing.group.sampleSubject = trimmedSubject;
      }
      if (senderName !== senderEmail) {
        existing.group.senderName = senderName;
      }
    } else if (!existing.group.sampleSubject && trimmedSubject.length > 0) {
      existing.group.sampleSubject = trimmedSubject;
    }
  }

  return Array.from(groupsByEmail.values())
    .map((entry) => entry.group)
    .sort(compareSenderGroups);
}

/**
 * Merges incoming sender groups into existing groups by normalized `senderEmail`,
 * deduplicating `messageIds`, updating counts/sizes/latest metadata, and sorting
 * by `totalSizeBytes` descending (tie-broken by `messageCount`, then `senderEmail`).
 */
export function mergeSenderGroups(
  existing: SenderGroup[],
  incoming: SenderGroup[],
): SenderGroup[] {
  interface MutableMergeAccumulator {
    group: SenderGroup;
    seenIds: Set<string>;
    latestTimestamp: number;
  }

  const mergedByEmail = new Map<string, MutableMergeAccumulator>();

  const absorbGroup = (candidate: SenderGroup) => {
    const senderEmail = candidate.senderEmail.trim().toLowerCase() || "unknown";
    const trimmedName = candidate.senderName.trim();
    const senderName = trimmedName || senderEmail;
    const safeSizeBytes =
      typeof candidate.totalSizeBytes === "number" &&
      Number.isFinite(candidate.totalSizeBytes)
        ? Math.max(0, candidate.totalSizeBytes)
        : 0;
    const safeMessageCount =
      typeof candidate.messageCount === "number" &&
      Number.isFinite(candidate.messageCount)
        ? Math.max(0, Math.trunc(candidate.messageCount))
        : 0;
    const candidateTimestamp = parseTimestamp(candidate.latestDate);
    const normalizedDate = normalizeDateIso(candidate.latestDate);
    const trimmedSubject = candidate.sampleSubject.trim();

    const current = mergedByEmail.get(senderEmail);
    if (!current) {
      const seenIds = new Set<string>();
      const dedupedIds: string[] = [];
      for (const id of candidate.messageIds) {
        if (!seenIds.has(id)) {
          seenIds.add(id);
          dedupedIds.push(id);
        }
      }

      const initialCount =
        candidate.messageIds.length > 0 ? dedupedIds.length : safeMessageCount;

      mergedByEmail.set(senderEmail, {
        group: {
          senderEmail,
          senderName,
          messageCount: initialCount,
          totalSizeBytes: safeSizeBytes,
          latestDate: normalizedDate,
          sampleSubject: trimmedSubject,
          hasUnsubscribeHeader: Boolean(candidate.hasUnsubscribeHeader),
          messageIds: dedupedIds,
        },
        seenIds,
        latestTimestamp: candidateTimestamp,
      });
      return;
    }

    let addedIdsCount = 0;
    for (const id of candidate.messageIds) {
      if (!current.seenIds.has(id)) {
        current.seenIds.add(id);
        current.group.messageIds.push(id);
        addedIdsCount += 1;
      }
    }

    if (candidate.messageIds.length === 0) {
      current.group.messageCount += safeMessageCount;
      current.group.totalSizeBytes += safeSizeBytes;
    } else if (addedIdsCount > 0) {
      current.group.messageCount = current.seenIds.size;
      current.group.totalSizeBytes +=
        addedIdsCount === candidate.messageIds.length
          ? safeSizeBytes
          : Math.round(
              (safeSizeBytes * addedIdsCount) / candidate.messageIds.length,
            );
    }

    current.group.hasUnsubscribeHeader =
      current.group.hasUnsubscribeHeader ||
      Boolean(candidate.hasUnsubscribeHeader);

    // Prefer an explicit display name over a bare email fallback.
    if (
      current.group.senderName === current.group.senderEmail &&
      senderName !== senderEmail
    ) {
      current.group.senderName = senderName;
    }

    if (isNewerMessage(candidateTimestamp, current.latestTimestamp)) {
      current.latestTimestamp = candidateTimestamp;
      current.group.latestDate = normalizedDate;
      if (trimmedSubject.length > 0) {
        current.group.sampleSubject = trimmedSubject;
      }
      if (senderName !== senderEmail) {
        current.group.senderName = senderName;
      }
    } else if (!current.group.sampleSubject && trimmedSubject.length > 0) {
      current.group.sampleSubject = trimmedSubject;
    }
  };

  for (const group of existing) {
    absorbGroup(group);
  }
  for (const group of incoming) {
    absorbGroup(group);
  }

  return Array.from(mergedByEmail.values())
    .map((entry) => entry.group)
    .sort(compareSenderGroups);
}
