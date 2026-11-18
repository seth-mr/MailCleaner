import { getValidGoogleAccessToken } from "@/lib/gmail-auth";
import {
  extractBrandKeyFromHost,
  extractSenderHostFromEmail,
  findMatchingProtectionRule,
  isSenderProtected,
  normalizeProtectionPattern,
  type ProtectionRuleRecord,
} from "@/lib/keep-safe";
import {
  buildGmailBlockFilterPayload,
  computeNextRunAt,
  isAutoCleanRuleAction,
  isAutoCleanRuleSchedule,
  isAutoCleanRuleStatus,
  isValidAutoCleanPattern,
  normalizeAutoCleanPattern,
  type AutoCleanRuleAction,
  type AutoCleanRuleRecord,
  type AutoCleanRuleSchedule,
  type ValidatedAutoCleanRuleInput,
  type ValidatedAutoCleanRuleUpdate,
} from "@/lib/gmail-filters";
import { prisma } from "@/lib/prisma";
import {
  GMAIL_BATCH_ENDPOINT,
  GMAIL_METADATA_BATCH_SIZE,
  buildGmailMetadataBatchRequest,
  extractMultipartBoundary,
  parseGmailBatchResponse,
} from "@/lib/gmail-batch";
import {
  GmailQuotaPacer,
  isGmailQuotaOrRateLimitError,
  parseRetryAfterSeconds,
} from "@/lib/gmail-quota";
import {
  chunkMessageIds,
  GMAIL_BATCH_LIMIT,
  normalizeMessageIds,
  type CleanAction,
} from "@/lib/gmail-clean";
import {
  buildGmailSearchQuery,
  DEFAULT_MAX_MESSAGES,
  groupMessagesBySender,
  MAX_MAX_MESSAGES,
  MIN_MAX_MESSAGES,
  parseFromHeader,
  type GmailFilterParams,
  type GmailMessageSummary,
  type SenderGroup,
} from "@/lib/gmail-grouping";
import {
  CLEAN_HISTORY_LIMIT,
  formatCleanLogSummary,
  serializeCleanLogRecord,
  type CleanHistoryAction,
  type CleanHistoryEntry,
} from "./clean-history";
import {
  extractEmailBodiesFromPayload,
  type GmailMimePayload,
} from "@/lib/gmail-preview";
import {
  buildRawRfc2822Email,
  extractUnsubscribeLinkFromHtml,
  hasOneClickUnsubscribePost,
  isSafePublicHttpUrl,
  parseListUnsubscribeHeader,
} from "@/lib/gmail-unsubscribe";

const GMAIL_MESSAGES_ENDPOINT =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GMAIL_MESSAGES_SEND_ENDPOINT =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GMAIL_FILTERS_ENDPOINT =
  "https://gmail.googleapis.com/gmail/v1/users/me/settings/filters";
const METADATA_BATCH_DELAY_MS = 450;
const GMAIL_QUOTA_MAX_UNITS_PER_WINDOW = 12_000;
const GMAIL_QUOTA_WINDOW_MS = 60_000;
const GMAIL_LIST_QUOTA_UNITS = 5;
const GMAIL_GET_QUOTA_UNITS = 5;
const GMAIL_BATCH_CLEAN_QUOTA_UNITS = 50;
const GMAIL_FILTER_QUOTA_UNITS = 50;
const GMAIL_SEND_QUOTA_UNITS = 100;
const AUTO_CLEAN_RUN_MAX_MESSAGES = 1000;
const UNSUBSCRIBE_INSPECT_LIMIT = 5;
const ONE_CLICK_TIMEOUT_MS = 8_000;

const globalForGmailQuota = globalThis as unknown as {
  gmailQuotaPacer: GmailQuotaPacer | undefined;
};

const existingQuotaPacer = globalForGmailQuota.gmailQuotaPacer;

/**
 * Shared Gmail API quota pacer kept across HMR reloads in development to
 * sustain request volume at or below 80% of the per-user minute limit (12,000/15,000).
 */
export const gmailQuotaPacer =
  existingQuotaPacer &&
  existingQuotaPacer.maxUnitsPerWindow === GMAIL_QUOTA_MAX_UNITS_PER_WINDOW &&
  existingQuotaPacer.windowMs === GMAIL_QUOTA_WINDOW_MS
    ? existingQuotaPacer
    : new GmailQuotaPacer({
        maxUnitsPerWindow: GMAIL_QUOTA_MAX_UNITS_PER_WINDOW,
        windowMs: GMAIL_QUOTA_WINDOW_MS,
      });

if (process.env.NODE_ENV !== "production") {
  globalForGmailQuota.gmailQuotaPacer = gmailQuotaPacer;
}
const MAX_GMAIL_RETRIES = 3;
const MAX_RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_RETRY_DELAYS_MS = [1000, 2000] as const;
const RETRY_BASE_DELAY_MS = 400;
const MAX_RETRY_DELAY_MS = 10_000;
const RETRYABLE_SERVER_STATUS_CODES = new Set([500, 502, 503, 504]);
const METADATA_HEADERS = [
  "From",
  "Subject",
  "Date",
  "List-Unsubscribe",
  "List-Unsubscribe-Post",
] as const;

interface GmailMessageListItem {
  id?: string;
}

interface GmailMessageListResponse {
  messages?: GmailMessageListItem[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
  error?: {
    code?: number;
    message?: string;
  };
}

interface GmailMessageHeader {
  name?: string;
  value?: string;
}

interface GmailMessageGetResponse {
  id?: string;
  sizeEstimate?: number;
  internalDate?: string;
  snippet?: string;
  payload?: GmailMimePayload & {
    headers?: GmailMessageHeader[];
  };
  error?: {
    code?: number;
    message?: string;
  };
}

export interface MessagePreviewItem {
  id: string;
  from: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  date: string | null;
  sizeBytes: number;
  hasUnsubscribeHeader: boolean;
}

export interface MessageDetailResult {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string | null;
  sizeEstimate: number;
  snippet: string;
  textBody: string | null;
  htmlBody: string | null;
}

export interface GroupedSendersResult {
  query: string;
  includeSpamTrash: boolean;
  scannedMessages: number;
  senders: SenderGroup[];
}

export interface GroupedSendersPageResult extends GroupedSendersResult {
  resultSizeEstimate: number;
  nextPageToken: string | null;
}

interface ListedMessageIdsResult {
  messageIds: string[];
  resultSizeEstimate: number;
  nextPageToken: string | null;
}

export interface CleanMessagesResult {
  action: CleanAction;
  processedCount: number;
  batches: number;
  skippedProtectedCount: number;
  reclaimedBytesAdded: number;
  totalReclaimedBytes: number;
  totalCleanedMessagesCount: number;
}

export class GmailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailAuthError";
  }
}

export class GmailApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "GmailApiError";
    this.status = status;
  }
}

export class GmailRateLimitError extends GmailApiError {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds = 20) {
    super(message, 429);
    this.name = "GmailRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class GmailSettingsScopeError extends GmailApiError {
  readonly code = "GMAIL_SETTINGS_SCOPE_REQUIRED";

  constructor(
    message = "Gmail settings permission is required. Please sign out and sign in again to grant Gmail filter management access.",
  ) {
    super(message, 403);
    this.name = "GmailSettingsScopeError";
  }
}

export class AutoCleanRuleConflictError extends Error {
  readonly status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "AutoCleanRuleConflictError";
    this.status = status;
  }
}

export class AutoCleanRuleNotFoundError extends Error {
  readonly status = 404;

  constructor(message: string) {
    super(message);
    this.name = "AutoCleanRuleNotFoundError";
  }
}

function clampMaxMessages(maxMessages?: number): number {
  if (typeof maxMessages !== "number" || !Number.isFinite(maxMessages)) {
    return DEFAULT_MAX_MESSAGES;
  }
  return Math.min(
    MAX_MAX_MESSAGES,
    Math.max(MIN_MAX_MESSAGES, Math.trunc(maxMessages)),
  );
}

async function resolveAccessToken(userId: string): Promise<string> {
  try {
    return await getValidGoogleAccessToken(userId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to authorize with Google.";
    if (message.includes("not configured")) {
      throw new GmailApiError("Google OAuth client credentials are not configured.", 500);
    }
    throw new GmailAuthError(message);
  }
}

interface GmailErrorPayload {
  error?: {
    message?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
}

function formatGmailErrorPayload(
  payload: GmailErrorPayload | null | undefined,
  status: number,
  fallback: string,
): { message: string; inspectText: string } {
  const apiMessage = payload?.error?.message?.trim() ?? "";
  const reasons = (payload?.error?.errors ?? [])
    .map((item) => item.reason?.trim() ?? "")
    .filter((reason) => reason.length > 0);
  const inspectText = [apiMessage, ...reasons].filter(Boolean).join(" ");

  if (apiMessage) {
    return {
      message: `${fallback} (${status}): ${apiMessage}`,
      inspectText,
    };
  }

  if (reasons.length > 0) {
    return {
      message: `${fallback} (${status}): ${reasons.join(", ")}`,
      inspectText,
    };
  }

  const fallbackMessage = `${fallback} (HTTP ${status}).`;
  return {
    message: fallbackMessage,
    inspectText: fallbackMessage,
  };
}

async function extractGmailErrorInfo(
  response: Response,
  fallback: string,
): Promise<{ message: string; inspectText: string }> {
  try {
    const payload = (await response.json()) as GmailErrorPayload;
    return formatGmailErrorPayload(payload, response.status, fallback);
  } catch {
    // Ignore non-JSON error bodies.
  }

  return formatGmailErrorPayload(null, response.status, fallback);
}

async function isRetryableQuotaResponse(response: Response): Promise<boolean> {
  if (isGmailQuotaOrRateLimitError(response.status, "")) {
    return true;
  }
  if (response.status !== 403) {
    return false;
  }

  try {
    const info = await extractGmailErrorInfo(
      response.clone(),
      "Gmail API request failed",
    );
    return isGmailQuotaOrRateLimitError(response.status, info.inspectText);
  } catch {
    return false;
  }
}

async function throwGmailResponseError(
  response: Response,
  fallback: string,
): Promise<never> {
  const { message, inspectText } = await extractGmailErrorInfo(
    response,
    fallback,
  );
  if (isGmailQuotaOrRateLimitError(response.status, inspectText)) {
    throw new GmailRateLimitError(
      message,
      parseRetryAfterSeconds(response.headers.get("Retry-After"), 20),
    );
  }
  throw new GmailApiError(message, response.status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function computeRetryDelayMs(attempt: number, response?: Response): number {
  const retryAfterHeader = response?.headers.get("Retry-After")?.trim();
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(MAX_RETRY_DELAY_MS, Math.round(seconds * 1000));
    }
  }

  const exponentialDelay = RETRY_BASE_DELAY_MS * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 150);
  return Math.min(MAX_RETRY_DELAY_MS, exponentialDelay + jitter);
}

/**
 * Executes a Gmail API request with brief retries on quota/rate-limit errors
 * (429 or quota-related 403) and exponential backoff on transient 5xx responses.
 */
async function fetchGmailWithRetry(
  url: string,
  init: RequestInit,
  networkErrorMessage: string,
): Promise<Response> {
  let serverRetryCount = 0;
  let rateLimitRetryCount = 0;

  while (true) {
    try {
      const response = await fetch(url, init);

      if (await isRetryableQuotaResponse(response)) {
        if (rateLimitRetryCount < MAX_RATE_LIMIT_RETRIES) {
          const delayMs =
            RATE_LIMIT_RETRY_DELAYS_MS[rateLimitRetryCount] ?? 2000;
          rateLimitRetryCount += 1;
          await response.body?.cancel().catch(() => {});
          await sleep(delayMs);
          continue;
        }
        return response;
      }

      if (
        RETRYABLE_SERVER_STATUS_CODES.has(response.status) &&
        serverRetryCount < MAX_GMAIL_RETRIES
      ) {
        const delayMs = computeRetryDelayMs(serverRetryCount, response);
        serverRetryCount += 1;
        await response.body?.cancel().catch(() => {});
        await sleep(delayMs);
        continue;
      }

      return response;
    } catch {
      if (serverRetryCount < MAX_GMAIL_RETRIES) {
        const delayMs = computeRetryDelayMs(serverRetryCount);
        serverRetryCount += 1;
        await sleep(delayMs);
        continue;
      }
      throw new GmailApiError(networkErrorMessage, 502);
    }
  }
}

function normalizeResultSizeEstimate(rawEstimate?: number): number {
  if (typeof rawEstimate !== "number" || !Number.isFinite(rawEstimate)) {
    return 0;
  }
  return Math.max(0, Math.trunc(rawEstimate));
}

async function listMatchingMessageIds(
  userId: string,
  accessToken: string,
  query: string,
  includeSpamTrash: boolean,
  maxMessages: number,
  options?: {
    pageToken?: string;
    singlePage?: boolean;
  },
): Promise<ListedMessageIdsResult> {
  const messageIds: string[] = [];
  const seenIds = new Set<string>();
  const singlePage = Boolean(options?.singlePage || options?.pageToken);
  let pageToken = options?.pageToken?.trim() || undefined;
  let resultSizeEstimate = 0;
  let nextPageToken: string | null = null;

  while (messageIds.length < maxMessages) {
    const remaining = maxMessages - messageIds.length;
    const params = new URLSearchParams({
      maxResults: String(Math.min(MAX_MAX_MESSAGES, remaining)),
      includeSpamTrash: String(includeSpamTrash),
    });

    if (query.length > 0) {
      params.set("q", query);
    }
    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    await gmailQuotaPacer.reserve(userId, GMAIL_LIST_QUOTA_UNITS);

    const response = await fetchGmailWithRetry(
      `${GMAIL_MESSAGES_ENDPOINT}?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      },
      "Network error while listing Gmail messages.",
    );

    if (response.status === 401) {
      throw new GmailAuthError("Gmail authorization expired or was revoked.");
    }

    if (!response.ok) {
      await throwGmailResponseError(
        response,
        "Gmail messages.list request failed",
      );
    }

    const payload = (await response.json()) as GmailMessageListResponse;
    const batch = payload.messages ?? [];
    if (resultSizeEstimate === 0 && payload.resultSizeEstimate !== undefined) {
      resultSizeEstimate = normalizeResultSizeEstimate(
        payload.resultSizeEstimate,
      );
    }
    nextPageToken = payload.nextPageToken?.trim() || null;

    for (const item of batch) {
      if (!item.id || seenIds.has(item.id)) {
        continue;
      }
      seenIds.add(item.id);
      messageIds.push(item.id);
      if (messageIds.length >= maxMessages) {
        break;
      }
    }

    if (singlePage || !nextPageToken || batch.length === 0) {
      break;
    }

    pageToken = nextPageToken;
  }

  return {
    messageIds,
    resultSizeEstimate,
    nextPageToken,
  };
}

function getHeaderValue(
  headers: GmailMessageHeader[],
  targetName: string,
): string {
  const normalizedTarget = targetName.toLowerCase();
  for (const header of headers) {
    if (header.name?.toLowerCase() === normalizedTarget) {
      return header.value ?? "";
    }
  }
  return "";
}

function resolveMessageDate(
  dateHeader: string,
  internalDate?: string,
): string | null {
  const trimmedHeader = dateHeader.trim();
  if (trimmedHeader.length > 0) {
    const parsedHeader = Date.parse(trimmedHeader);
    if (!Number.isNaN(parsedHeader)) {
      return new Date(parsedHeader).toISOString();
    }
  }

  if (internalDate) {
    const epochMs = Number(internalDate);
    if (Number.isFinite(epochMs) && epochMs > 0) {
      return new Date(epochMs).toISOString();
    }
  }

  return null;
}

function buildMessageSummary(
  payload: GmailMessageGetResponse,
  fallbackMessageId: string,
): GmailMessageSummary {
  const headers = payload.payload?.headers ?? [];

  const from = getHeaderValue(headers, "From");
  const subject = getHeaderValue(headers, "Subject");
  const dateHeader = getHeaderValue(headers, "Date");
  const listUnsubscribe = getHeaderValue(headers, "List-Unsubscribe").trim();
  const listUnsubscribePost = getHeaderValue(
    headers,
    "List-Unsubscribe-Post",
  ).trim();

  return {
    id: payload.id ?? fallbackMessageId,
    from,
    subject,
    date: resolveMessageDate(dateHeader, payload.internalDate),
    sizeBytes:
      typeof payload.sizeEstimate === "number" &&
      Number.isFinite(payload.sizeEstimate)
        ? Math.max(0, payload.sizeEstimate)
        : 0,
    hasUnsubscribeHeader:
      listUnsubscribe.length > 0 || listUnsubscribePost.length > 0,
  };
}

async function fetchMessageMetadataBatch(
  userId: string,
  accessToken: string,
  batchIds: string[],
): Promise<GmailMessageSummary[]> {
  if (batchIds.length === 0) {
    return [];
  }

  let pendingIds = [...batchIds];
  const summaries: GmailMessageSummary[] = [];

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    if (pendingIds.length === 0) {
      break;
    }

    await gmailQuotaPacer.reserve(
      userId,
      pendingIds.length * GMAIL_GET_QUOTA_UNITS,
    );

    const batchRequest = buildGmailMetadataBatchRequest(
      pendingIds,
      METADATA_HEADERS,
    );
    const response = await fetchGmailWithRetry(
      GMAIL_BATCH_ENDPOINT,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": batchRequest.contentType,
        },
        body: batchRequest.body,
        cache: "no-store",
      },
      "Network error while fetching Gmail message metadata batch.",
    );

    if (response.status === 401) {
      throw new GmailAuthError("Gmail authorization expired or was revoked.");
    }

    if (!response.ok) {
      await throwGmailResponseError(
        response,
        "Gmail batch messages.get request failed",
      );
    }

    const responseBoundary = extractMultipartBoundary(
      response.headers.get("Content-Type"),
    );
    if (!responseBoundary) {
      throw new GmailApiError(
        "Gmail batch response is missing a multipart boundary.",
        502,
      );
    }

    const rawText = await response.text();
    const parts = parseGmailBatchResponse<
      GmailMessageGetResponse & GmailErrorPayload
    >(rawText, responseBoundary);

    if (parts.length === 0 && pendingIds.length > 0) {
      throw new GmailApiError("Gmail batch response contained no parts.", 502);
    }

    const rateLimitedIds: string[] = [];
    let lastRateLimitMessage = "Gmail batch messages.get rate limit exceeded.";
    let lastRetryAfterSeconds: number | null = null;

    for (let partPosition = 0; partPosition < parts.length; partPosition += 1) {
      const part = parts[partPosition];
      const resolvedIndex =
        part.index !== null &&
        part.index >= 0 &&
        part.index < pendingIds.length
          ? part.index
          : partPosition;
      const messageId =
        pendingIds[resolvedIndex] ?? `batch-item-${resolvedIndex}`;

      if (part.status === 401) {
        throw new GmailAuthError("Gmail authorization expired or was revoked.");
      }

      if (part.status === 404) {
        // Message may have been deleted between messages.list and messages.get.
        continue;
      }

      if (part.status >= 200 && part.status < 300) {
        if (part.body) {
          summaries.push(buildMessageSummary(part.body, messageId));
        }
        continue;
      }

      const errorInfo = formatGmailErrorPayload(
        part.body,
        part.status,
        "Gmail messages.get request failed",
      );
      const inspectText = errorInfo.inspectText || part.rawBody;

      if (isGmailQuotaOrRateLimitError(part.status, inspectText)) {
        rateLimitedIds.push(messageId);
        lastRateLimitMessage = errorInfo.message;
        const partRetryAfter = parseRetryAfterSeconds(
          part.headers["retry-after"] ?? null,
          20,
        );
        lastRetryAfterSeconds =
          lastRetryAfterSeconds === null
            ? partRetryAfter
            : Math.max(lastRetryAfterSeconds, partRetryAfter);
        continue;
      }

      throw new GmailApiError(errorInfo.message, part.status);
    }

    if (rateLimitedIds.length === 0) {
      return summaries;
    }

    if (attempt >= MAX_RATE_LIMIT_RETRIES) {
      throw new GmailRateLimitError(
        lastRateLimitMessage,
        lastRetryAfterSeconds ?? 20,
      );
    }

    pendingIds = rateLimitedIds;
    await sleep(RATE_LIMIT_RETRY_DELAYS_MS[attempt] ?? 2000);
  }

  return summaries;
}

/**
 * Persists a batch of fetched message metadata summaries in SQLite immediately
 * so retries or subsequent filter scans do not re-request them from Gmail API.
 */
async function persistCachedMessages(
  userId: string,
  messages: GmailMessageSummary[],
): Promise<void> {
  if (messages.length === 0) {
    return;
  }

  const uniqueMessages = Array.from(
    new Map(messages.map((message) => [message.id, message])).values(),
  );
  const messageIds = uniqueMessages.map((message) => message.id);

  await prisma.$transaction([
    prisma.cachedMessage.deleteMany({
      where: {
        userId,
        gmailMessageId: { in: messageIds },
      },
    }),
    prisma.cachedMessage.createMany({
      data: uniqueMessages.map((message) => ({
        userId,
        gmailMessageId: message.id,
        fromHeader: message.from,
        subject: message.subject,
        dateIso: message.date,
        sizeBytes: message.sizeBytes,
        hasUnsubscribeHeader: message.hasUnsubscribeHeader,
      })),
    }),
  ]);
}

async function resolveMessageSummariesById(
  userId: string,
  messageIds: string[],
  existingAccessToken?: string,
): Promise<Map<string, GmailMessageSummary>> {
  const cachedRows = await prisma.cachedMessage.findMany({
    where: {
      userId,
      gmailMessageId: { in: messageIds },
    },
  });

  const summaryById = new Map<string, GmailMessageSummary>();
  for (const row of cachedRows) {
    summaryById.set(row.gmailMessageId, {
      id: row.gmailMessageId,
      from: row.fromHeader,
      subject: row.subject,
      date: row.dateIso,
      sizeBytes: row.sizeBytes,
      hasUnsubscribeHeader: row.hasUnsubscribeHeader,
    });
  }

  const missingIds = messageIds.filter((id) => !summaryById.has(id));
  if (missingIds.length === 0) {
    return summaryById;
  }

  const accessToken =
    existingAccessToken ?? (await resolveAccessToken(userId));

  for (
    let index = 0;
    index < missingIds.length;
    index += GMAIL_METADATA_BATCH_SIZE
  ) {
    if (index > 0) {
      await sleep(METADATA_BATCH_DELAY_MS);
    }
    const batch = missingIds.slice(index, index + GMAIL_METADATA_BATCH_SIZE);
    const batchResults = await fetchMessageMetadataBatch(
      userId,
      accessToken,
      batch,
    );

    if (batchResults.length > 0) {
      await persistCachedMessages(userId, batchResults);
      for (const summary of batchResults) {
        summaryById.set(summary.id, summary);
      }
    }
  }

  return summaryById;
}

async function fetchGroupedSendersInternal(
  userId: string,
  filters: GmailFilterParams & { singlePage?: boolean } = {},
): Promise<GroupedSendersPageResult> {
  const accessToken = await resolveAccessToken(userId);
  const { q, includeSpamTrash } = buildGmailSearchQuery(filters);
  const maxMessages = clampMaxMessages(filters.maxMessages);

  const { messageIds, resultSizeEstimate, nextPageToken } =
    await listMatchingMessageIds(
      userId,
      accessToken,
      q,
      includeSpamTrash,
      maxMessages,
      {
        pageToken: filters.pageToken,
        singlePage: filters.singlePage,
      },
    );

  if (messageIds.length === 0) {
    return {
      query: q,
      includeSpamTrash,
      scannedMessages: 0,
      resultSizeEstimate,
      nextPageToken,
      senders: [],
    };
  }

  const summaryById = await resolveMessageSummariesById(
    userId,
    messageIds,
    accessToken,
  );

  const summaries: GmailMessageSummary[] = [];
  for (const id of messageIds) {
    const summary = summaryById.get(id);
    if (summary) {
      summaries.push(summary);
    }
  }

  return {
    query: q,
    includeSpamTrash,
    scannedMessages: summaries.length,
    resultSizeEstimate,
    nextPageToken,
    senders: groupMessagesBySender(summaries),
  };
}

/**
 * Fetches a single page of matching Gmail messages for the authenticated user
 * and groups them by sender, returning cursor pagination metadata.
 */
export async function fetchGroupedSendersPageForUser(
  userId: string,
  filters: GmailFilterParams = {},
): Promise<GroupedSendersPageResult> {
  return fetchGroupedSendersInternal(userId, { ...filters, singlePage: true });
}

/**
 * Fetches matching Gmail messages for the authenticated user and groups them by sender.
 */
export async function fetchGroupedSendersForUser(
  userId: string,
  filters: GmailFilterParams = {},
): Promise<GroupedSendersPageResult> {
  return fetchGroupedSendersInternal(userId, filters);
}

async function getUserCleaningStats(userId: string): Promise<{
  totalReclaimedBytes: number;
  totalCleanedMessagesCount: number;
}> {
  const existingStats = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      reclaimedBytes: true,
      cleanedMessagesCount: true,
    },
  });

  return {
    totalReclaimedBytes: Number(existingStats?.reclaimedBytes ?? 0),
    totalCleanedMessagesCount: existingStats?.cleanedMessagesCount ?? 0,
  };
}

export interface CleanMessagesOptions {
  restoreReclaimedBytes?: number;
}

/**
 * Moves Gmail messages to Trash, restores them from Trash, or permanently deletes them
 * in batches of up to 1000, excluding any messages matching the user's Keep Safe protection rules
 * for destructive actions.
 */
export async function cleanMessagesForUser(
  userId: string,
  messageIds: string[],
  action: CleanAction,
  options?: CleanMessagesOptions,
): Promise<CleanMessagesResult> {
  const normalizedIds = normalizeMessageIds(messageIds);
  if (normalizedIds.length === 0) {
    const stats = await getUserCleaningStats(userId);
    return {
      action,
      processedCount: 0,
      batches: 0,
      skippedProtectedCount: 0,
      reclaimedBytesAdded: 0,
      totalReclaimedBytes: stats.totalReclaimedBytes,
      totalCleanedMessagesCount: stats.totalCleanedMessagesCount,
    };
  }

  const protectedRules = await prisma.protectedRule.findMany({
    where: { userId },
    select: {
      scope: true,
      pattern: true,
    },
  });

  let cleanableIds = normalizedIds;
  let skippedProtectedCount = 0;

  if (action !== "untrash" && protectedRules.length > 0) {
    const cachedRows = await prisma.cachedMessage.findMany({
      where: {
        userId,
        gmailMessageId: { in: normalizedIds },
      },
      select: {
        gmailMessageId: true,
        fromHeader: true,
      },
    });

    const protectedMessageIds = new Set<string>();
    for (const row of cachedRows) {
      if (isSenderProtected(row.fromHeader, protectedRules)) {
        protectedMessageIds.add(row.gmailMessageId);
      }
    }

    if (protectedMessageIds.size > 0) {
      cleanableIds = normalizedIds.filter((id) => !protectedMessageIds.has(id));
      skippedProtectedCount = normalizedIds.length - cleanableIds.length;
    }
  }

  if (cleanableIds.length === 0) {
    const stats = await getUserCleaningStats(userId);
    return {
      action,
      processedCount: 0,
      batches: 0,
      skippedProtectedCount,
      reclaimedBytesAdded: 0,
      totalReclaimedBytes: stats.totalReclaimedBytes,
      totalCleanedMessagesCount: stats.totalCleanedMessagesCount,
    };
  }

  const accessToken = await resolveAccessToken(userId);
  const batches = chunkMessageIds(cleanableIds, GMAIL_BATCH_LIMIT);
  const isBatchModify = action !== "delete";
  const endpoint = isBatchModify
    ? `${GMAIL_MESSAGES_ENDPOINT}/batchModify`
    : `${GMAIL_MESSAGES_ENDPOINT}/batchDelete`;

  let reclaimedBytesAdded = 0;
  let totalReclaimedBytes = 0;
  let totalCleanedMessagesCount = 0;
  let remainingRestoreBytes =
    action === "untrash" &&
    typeof options?.restoreReclaimedBytes === "number" &&
    Number.isFinite(options.restoreReclaimedBytes) &&
    options.restoreReclaimedBytes > 0
      ? Math.trunc(options.restoreReclaimedBytes)
      : 0;

  for (const batch of batches) {
    await gmailQuotaPacer.reserve(userId, GMAIL_BATCH_CLEAN_QUOTA_UNITS);

    const body =
      action === "trash"
        ? {
            ids: batch,
            addLabelIds: ["TRASH"],
            removeLabelIds: ["INBOX"],
          }
        : action === "untrash"
          ? {
              ids: batch,
              removeLabelIds: ["TRASH"],
              addLabelIds: ["INBOX"],
            }
          : action === "archive"
            ? {
                ids: batch,
                removeLabelIds: ["INBOX"],
              }
            : action === "mark_read"
              ? {
                  ids: batch,
                  removeLabelIds: ["UNREAD"],
                }
              : {
                  ids: batch,
                };

    const response = await fetchGmailWithRetry(
      endpoint,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      },
      "Network error while cleaning Gmail messages.",
    );

    if (response.status === 401) {
      throw new GmailAuthError("Gmail authorization expired or was revoked.");
    }

    if (!response.ok) {
      await throwGmailResponseError(
        response,
        isBatchModify
          ? "Gmail messages.batchModify request failed"
          : "Gmail messages.batchDelete request failed",
      );
    }

    if (action === "archive" || action === "mark_read") {
      continue;
    }

    if (action === "untrash") {
      const updatedUser = await prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({
          where: { id: userId },
          select: {
            reclaimedBytes: true,
            cleanedMessagesCount: true,
          },
        });

        const currentReclaimed = Math.max(
          0,
          Number(existing?.reclaimedBytes ?? 0),
        );
        const currentCleanedCount = Math.max(
          0,
          existing?.cleanedMessagesCount ?? 0,
        );
        const bytesToSubtract = Math.min(
          currentReclaimed,
          remainingRestoreBytes,
        );
        const countToSubtract = Math.min(currentCleanedCount, batch.length);
        const nextReclaimedBytes = Math.max(
          0,
          currentReclaimed - bytesToSubtract,
        );
        const nextCleanedMessagesCount = Math.max(
          0,
          currentCleanedCount - countToSubtract,
        );

        remainingRestoreBytes = Math.max(
          0,
          remainingRestoreBytes - bytesToSubtract,
        );

        return tx.user.update({
          where: { id: userId },
          data: {
            reclaimedBytes: nextReclaimedBytes,
            cleanedMessagesCount: nextCleanedMessagesCount,
          },
          select: {
            reclaimedBytes: true,
            cleanedMessagesCount: true,
          },
        });
      });

      totalReclaimedBytes = Number(updatedUser.reclaimedBytes);
      totalCleanedMessagesCount = updatedUser.cleanedMessagesCount;
      continue;
    }

    const cachedBatchRows = await prisma.cachedMessage.findMany({
      where: {
        userId,
        gmailMessageId: { in: batch },
      },
      select: {
        sizeBytes: true,
      },
    });

    let batchReclaimedBytes = 0;
    for (const row of cachedBatchRows) {
      if (
        typeof row.sizeBytes === "number" &&
        Number.isFinite(row.sizeBytes) &&
        row.sizeBytes > 0
      ) {
        batchReclaimedBytes += Math.max(0, Math.trunc(row.sizeBytes));
      }
    }

    const [, updatedUser] = await prisma.$transaction([
      prisma.cachedMessage.deleteMany({
        where: {
          userId,
          gmailMessageId: { in: batch },
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: {
          reclaimedBytes: { increment: batchReclaimedBytes },
          cleanedMessagesCount: { increment: batch.length },
        },
        select: {
          reclaimedBytes: true,
          cleanedMessagesCount: true,
        },
      }),
    ]);

    reclaimedBytesAdded += batchReclaimedBytes;
    totalReclaimedBytes = updatedUser.reclaimedBytes;
    totalCleanedMessagesCount = updatedUser.cleanedMessagesCount;
  }

  if (action === "archive" || action === "mark_read") {
    const stats = await getUserCleaningStats(userId);
    totalReclaimedBytes = stats.totalReclaimedBytes;
    totalCleanedMessagesCount = stats.totalCleanedMessagesCount;
  }

  if (cleanableIds.length > 0) {
    await recordCleanLogForUser(
      userId,
      action,
      cleanableIds.length,
      reclaimedBytesAdded,
    );
  }

  return {
    action,
    processedCount: cleanableIds.length,
    batches: batches.length,
    skippedProtectedCount,
    reclaimedBytesAdded,
    totalReclaimedBytes,
    totalCleanedMessagesCount,
  };
}

/**
 * Persists a `CleanLog` entry when a cleaning action affects at least one message.
 */
async function recordCleanLogForUser(
  userId: string,
  action: CleanHistoryAction,
  messageCount: number,
  bytesFreed: number,
): Promise<void> {
  if (messageCount <= 0) {
    return;
  }

  const safeBytesFreed =
    Number.isFinite(bytesFreed) && bytesFreed > 0 ? Math.trunc(bytesFreed) : 0;

  await prisma.cleanLog.create({
    data: {
      userId,
      action,
      messageCount,
      bytesFreed: safeBytesFreed,
      summary: formatCleanLogSummary(action, messageCount),
    },
  });
}

/**
 * Returns the most recent `CleanLog` entries for the user, ordered newest first.
 */
export async function listCleanHistoryForUser(
  userId: string,
  limit = CLEAN_HISTORY_LIMIT,
): Promise<CleanHistoryEntry[]> {
  const safeLimit =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? Math.min(CLEAN_HISTORY_LIMIT, Math.trunc(limit))
      : CLEAN_HISTORY_LIMIT;

  const rows = await prisma.cleanLog.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }],
    take: safeLimit,
    select: {
      id: true,
      action: true,
      messageCount: true,
      bytesFreed: true,
      summary: true,
      createdAt: true,
    },
  });

  return rows.map(serializeCleanLogRecord);
}

export interface EmptyTrashResult {
  deletedCount: number;
}

/**
 * Lists all messages currently in Gmail Trash (`in:trash`), deletes them in
 * batches of up to 1000 via `messages/batchDelete`, and removes matching
 * `CachedMessage` rows from the local database.
 */
export async function emptyTrashForUser(
  userId: string,
): Promise<EmptyTrashResult> {
  const accessToken = await resolveAccessToken(userId);
  const { messageIds: trashIds } = await listMatchingMessageIds(
    userId,
    accessToken,
    "in:trash",
    true,
    Number.POSITIVE_INFINITY,
  );

  if (trashIds.length === 0) {
    return { deletedCount: 0 };
  }

  const batches = chunkMessageIds(trashIds, GMAIL_BATCH_LIMIT);
  let deletedCount = 0;
  let bytesFreed = 0;

  for (const batch of batches) {
    await gmailQuotaPacer.reserve(userId, GMAIL_BATCH_CLEAN_QUOTA_UNITS);

    const response = await fetchGmailWithRetry(
      `${GMAIL_MESSAGES_ENDPOINT}/batchDelete`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: batch }),
        cache: "no-store",
      },
      "Network error while emptying Gmail Trash.",
    );

    if (response.status === 401) {
      throw new GmailAuthError("Gmail authorization expired or was revoked.");
    }

    if (!response.ok) {
      await throwGmailResponseError(
        response,
        "Gmail messages.batchDelete request failed",
      );
    }

    const cachedBatchRows = await prisma.cachedMessage.findMany({
      where: {
        userId,
        gmailMessageId: { in: batch },
      },
      select: {
        sizeBytes: true,
      },
    });

    for (const row of cachedBatchRows) {
      if (
        typeof row.sizeBytes === "number" &&
        Number.isFinite(row.sizeBytes) &&
        row.sizeBytes > 0
      ) {
        bytesFreed += Math.trunc(row.sizeBytes);
      }
    }

    await prisma.cachedMessage.deleteMany({
      where: {
        userId,
        gmailMessageId: { in: batch },
      },
    });

    deletedCount += batch.length;
  }

  if (deletedCount > 0) {
    await recordCleanLogForUser(userId, "empty_trash", deletedCount, bytesFreed);
  }

  return { deletedCount };
}

const MAX_PREVIEW_MESSAGE_IDS = 50;
const DEFAULT_PREVIEW_MESSAGE_LIMIT = 30;

function comparePreviewDatesDesc(a: string | null, b: string | null): number {
  const tsA = a ? Date.parse(a) : Number.NaN;
  const tsB = b ? Date.parse(b) : Number.NaN;
  const validA = !Number.isNaN(tsA);
  const validB = !Number.isNaN(tsB);

  if (validA && validB) {
    return tsB - tsA;
  }
  if (validA) {
    return -1;
  }
  if (validB) {
    return 1;
  }
  return 0;
}

/**
 * Returns lightweight preview items for up to 50 message IDs, serving cached
 * rows from SQLite first and batch-fetching only missing metadata from Gmail,
 * sorted by date descending.
 */
export async function listMessagePreviewsForUser(
  userId: string,
  messageIds: string[],
  limit = DEFAULT_PREVIEW_MESSAGE_LIMIT,
): Promise<MessagePreviewItem[]> {
  const effectiveLimit =
    typeof limit === "number" && Number.isFinite(limit)
      ? Math.min(MAX_PREVIEW_MESSAGE_IDS, Math.max(1, Math.trunc(limit)))
      : DEFAULT_PREVIEW_MESSAGE_LIMIT;
  const targetIds = normalizeMessageIds(messageIds).slice(0, effectiveLimit);
  if (targetIds.length === 0) {
    return [];
  }

  const summaryById = await resolveMessageSummariesById(userId, targetIds);
  const previews: MessagePreviewItem[] = [];

  for (const id of targetIds) {
    const summary = summaryById.get(id);
    if (!summary) {
      continue;
    }

    const parsedFrom = parseFromHeader(summary.from);
    previews.push({
      id: summary.id,
      from: summary.from,
      senderName: parsedFrom.name || summary.from || "Unknown sender",
      senderEmail: parsedFrom.email || summary.from || "unknown",
      subject: summary.subject,
      date: summary.date,
      sizeBytes: summary.sizeBytes,
      hasUnsubscribeHeader: summary.hasUnsubscribeHeader,
    });
  }

  previews.sort((a, b) => comparePreviewDatesDesc(a.date, b.date));
  return previews;
}

/**
 * Fetches full message headers and decoded MIME bodies (`text/plain` and `text/html`)
 * for a single Gmail message ID.
 */
export async function fetchMessageDetailForUser(
  userId: string,
  messageId: string,
): Promise<MessageDetailResult> {
  const trimmedId = typeof messageId === "string" ? messageId.trim() : "";
  if (trimmedId.length === 0) {
    throw new GmailApiError("Message ID is required.", 400);
  }

  const accessToken = await resolveAccessToken(userId);
  await gmailQuotaPacer.reserve(userId, GMAIL_GET_QUOTA_UNITS);

  const response = await fetchGmailWithRetry(
    `${GMAIL_MESSAGES_ENDPOINT}/${encodeURIComponent(trimmedId)}?format=full`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
    "Network error while fetching Gmail message details.",
  );

  if (response.status === 401) {
    throw new GmailAuthError("Gmail authorization expired or was revoked.");
  }

  if (!response.ok) {
    await throwGmailResponseError(response, "Gmail messages.get request failed");
  }

  const payload = (await response.json()) as GmailMessageGetResponse;
  const headers = payload.payload?.headers ?? [];
  const from = getHeaderValue(headers, "From");
  const to = getHeaderValue(headers, "To");
  const subject = getHeaderValue(headers, "Subject");
  const dateHeader = getHeaderValue(headers, "Date");
  const sizeEstimate =
    typeof payload.sizeEstimate === "number" &&
    Number.isFinite(payload.sizeEstimate)
      ? Math.max(0, payload.sizeEstimate)
      : 0;
  const snippet = typeof payload.snippet === "string" ? payload.snippet : "";
  const { textBody, htmlBody } = extractEmailBodiesFromPayload(payload.payload);

  return {
    id: payload.id ?? trimmedId,
    from,
    to,
    subject,
    date: resolveMessageDate(dateHeader, payload.internalDate),
    sizeEstimate,
    snippet,
    textBody,
    htmlBody,
  };
}

export type UnsubscribeResult =
  | {
      status: "unsubscribed";
      method: "one-click-http" | "mailto";
      target: string;
      senderEmail: string;
    }
  | {
      status: "action_required";
      method: "header-link" | "html-link";
      url: string;
      senderEmail: string;
    }
  | {
      status: "not_found";
      senderEmail: string;
    };

function isHttpOrHttpsUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function executeOneClickUnsubscribePost(url: string): Promise<boolean> {
  if (!isSafePublicHttpUrl(url)) {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ONE_CLICK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "List-Unsubscribe=One-Click",
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
    await response.body?.cancel().catch(() => {});
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sendUnsubscribeEmail(
  userId: string,
  accessToken: string,
  mailto: { email: string; subject: string; body: string },
): Promise<void> {
  await gmailQuotaPacer.reserve(userId, GMAIL_SEND_QUOTA_UNITS);

  const raw = buildRawRfc2822Email({
    to: mailto.email,
    subject: mailto.subject || "Unsubscribe",
    body: mailto.body || "Unsubscribe",
  });

  const response = await fetchGmailWithRetry(
    GMAIL_MESSAGES_SEND_ENDPOINT,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
      cache: "no-store",
    },
    "Network error while sending Gmail unsubscribe email.",
  );

  if (response.status === 401) {
    throw new GmailAuthError("Gmail authorization expired or was revoked.");
  }

  if (!response.ok) {
    await throwGmailResponseError(response, "Gmail messages.send request failed");
  }
}

/**
 * Inspects up to 5 recent messages from a sender to perform automatic
 * unsubscribe via RFC 8058 One-Click POST or `mailto:`, or returns a safe
 * HTTP/HTTPS fallback link when manual confirmation is required.
 */
export async function unsubscribeFromSenderForUser(
  userId: string,
  senderEmail: string,
  messageIds: string[],
): Promise<UnsubscribeResult> {
  const normalizedSenderEmail =
    typeof senderEmail === "string" ? senderEmail.trim() : "";
  const candidateIds = normalizeMessageIds(messageIds).slice(
    0,
    UNSUBSCRIBE_INSPECT_LIMIT,
  );

  if (candidateIds.length === 0) {
    return {
      status: "not_found",
      senderEmail: normalizedSenderEmail,
    };
  }

  const accessToken = await resolveAccessToken(userId);

  for (const messageId of candidateIds) {
    await gmailQuotaPacer.reserve(userId, GMAIL_GET_QUOTA_UNITS);

    const response = await fetchGmailWithRetry(
      `${GMAIL_MESSAGES_ENDPOINT}/${encodeURIComponent(messageId)}?format=full`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      },
      "Network error while fetching Gmail message for unsubscribe.",
    );

    if (response.status === 401) {
      throw new GmailAuthError("Gmail authorization expired or was revoked.");
    }

    if (response.status === 404) {
      continue;
    }

    if (!response.ok) {
      await throwGmailResponseError(response, "Gmail messages.get request failed");
    }

    const payload = (await response.json()) as GmailMessageGetResponse;
    const headers = payload.payload?.headers ?? [];
    const listUnsubscribe = getHeaderValue(headers, "List-Unsubscribe");
    const listUnsubscribePost = getHeaderValue(headers, "List-Unsubscribe-Post");

    const parsedHeader = parseListUnsubscribeHeader(listUnsubscribe);
    const hasOneClickPost = hasOneClickUnsubscribePost(listUnsubscribePost);

    if (hasOneClickPost) {
      const safeOneClickUrl = parsedHeader.httpUrls.find((url) =>
        isSafePublicHttpUrl(url),
      );
      if (safeOneClickUrl) {
        const succeeded = await executeOneClickUnsubscribePost(safeOneClickUrl);
        if (succeeded) {
          return {
            status: "unsubscribed",
            method: "one-click-http",
            target: safeOneClickUrl,
            senderEmail: normalizedSenderEmail,
          };
        }
      }
    }

    if (parsedHeader.mailtoTargets.length > 0) {
      const mailto = parsedHeader.mailtoTargets[0];
      await sendUnsubscribeEmail(userId, accessToken, mailto);
      return {
        status: "unsubscribed",
        method: "mailto",
        target: mailto.email,
        senderEmail: normalizedSenderEmail,
      };
    }

    const headerUrl =
      parsedHeader.httpUrls.find((url) => isHttpOrHttpsUrl(url)) ?? null;
    if (headerUrl) {
      return {
        status: "action_required",
        method: "header-link",
        url: headerUrl,
        senderEmail: normalizedSenderEmail,
      };
    }

    const { htmlBody } = extractEmailBodiesFromPayload(payload.payload);
    const htmlLink = htmlBody ? extractUnsubscribeLinkFromHtml(htmlBody) : null;
    if (htmlLink && isHttpOrHttpsUrl(htmlLink)) {
      return {
        status: "action_required",
        method: "html-link",
        url: htmlLink,
        senderEmail: normalizedSenderEmail,
      };
    }
  }

  return {
    status: "not_found",
    senderEmail: normalizedSenderEmail,
  };
}

interface GmailFilterResponse {
  id?: string;
}

export interface RunAutoCleanQueryResult {
  ruleId: string;
  cleanResult: CleanMessagesResult;
  rule: AutoCleanRuleRecord;
}

export interface AutoCleanPreviewSampleSender {
  email: string;
  name: string;
  count: number;
  isProtected: boolean;
}

export interface AutoCleanQueryPreviewResult {
  query: string;
  resultSizeEstimate: number;
  inspectedCount: number;
  cleanableCount: number;
  protectedCount: number;
  sampleSenders: AutoCleanPreviewSampleSender[];
}

const AUTO_CLEAN_PREVIEW_MAX_MESSAGES = 100;
const AUTO_CLEAN_PREVIEW_SAMPLE_SENDERS_LIMIT = 5;

const AUTO_CLEAN_RULE_SELECT = {
  id: true,
  type: true,
  label: true,
  pattern: true,
  action: true,
  schedule: true,
  isEnabled: true,
  nextRunAt: true,
  gmailFilterId: true,
  lastRunAt: true,
  lastRunCount: true,
  lastRunStatus: true,
  lastRunError: true,
} as const;

function serializeAutoCleanRule(row: {
  id: string;
  type: "BLOCK_SENDER" | "BLOCK_DOMAIN" | "CLEAN_QUERY";
  label: string;
  pattern: string;
  action: string;
  schedule: string;
  isEnabled: boolean;
  nextRunAt: Date | null;
  gmailFilterId: string | null;
  lastRunAt: Date | null;
  lastRunCount: number;
  lastRunStatus: string;
  lastRunError: string | null;
}): AutoCleanRuleRecord {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    pattern: row.pattern,
    action: isAutoCleanRuleAction(row.action) ? row.action : "trash",
    schedule: isAutoCleanRuleSchedule(row.schedule) ? row.schedule : "manual",
    isEnabled: Boolean(row.isEnabled),
    nextRunAt: row.nextRunAt ? row.nextRunAt.toISOString() : null,
    gmailFilterId: row.gmailFilterId,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    lastRunCount: row.lastRunCount,
    lastRunStatus: isAutoCleanRuleStatus(row.lastRunStatus)
      ? row.lastRunStatus
      : "idle",
    lastRunError: row.lastRunError ?? null,
  };
}

/**
 * Lists all Auto-Clean rules belonging to the user.
 */
export async function listAutoCleanRulesForUser(
  userId: string,
): Promise<AutoCleanRuleRecord[]> {
  const rows = await prisma.autoCleanRule.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }],
    select: AUTO_CLEAN_RULE_SELECT,
  });

  return rows.map(serializeAutoCleanRule);
}

function findProtectionConflictForBlockRule(
  type: "BLOCK_SENDER" | "BLOCK_DOMAIN",
  normalizedPattern: string,
  protectedRules: readonly ProtectionRuleRecord[],
): ProtectionRuleRecord | null {
  if (protectedRules.length === 0) {
    return null;
  }

  if (type === "BLOCK_SENDER") {
    return findMatchingProtectionRule(normalizedPattern, protectedRules);
  }

  const brandKey = extractBrandKeyFromHost(normalizedPattern);
  for (const rule of protectedRules) {
    const rulePattern = normalizeProtectionPattern(rule.scope, rule.pattern);
    if (!rulePattern) {
      continue;
    }
    if (rule.scope === "DOMAIN" && rulePattern === normalizedPattern) {
      return rule;
    }
    if (
      rule.scope === "BRAND" &&
      brandKey !== "unknown" &&
      rulePattern === brandKey
    ) {
      return rule;
    }
    if (
      rule.scope === "SENDER" &&
      extractSenderHostFromEmail(rulePattern) === normalizedPattern
    ) {
      return rule;
    }
  }

  return null;
}

async function throwGmailFilterResponseError(
  response: Response,
  fallback: string,
): Promise<never> {
  if (response.status === 401) {
    throw new GmailAuthError("Gmail authorization expired or was revoked.");
  }

  if (response.status === 403) {
    const info = await extractGmailErrorInfo(response.clone(), fallback);
    if (isGmailQuotaOrRateLimitError(response.status, info.inspectText)) {
      throw new GmailRateLimitError(
        info.message,
        parseRetryAfterSeconds(response.headers.get("Retry-After"), 20),
      );
    }
    throw new GmailSettingsScopeError(
      "Gmail settings permission is required to manage automatic Gmail filters. Please sign out and sign in again to grant filter permissions.",
    );
  }

  return throwGmailResponseError(response, fallback);
}

/**
 * Creates or updates an Auto-Clean rule for the user, provisioning a native
 * Gmail `users.settings.filters` auto-trash rule for `BLOCK_SENDER` and
 * `BLOCK_DOMAIN` while enforcing Keep Safe protections.
 */
export async function createAutoCleanRuleForUser(
  userId: string,
  input: ValidatedAutoCleanRuleInput,
): Promise<AutoCleanRuleRecord> {
  const normalizedPattern = normalizeAutoCleanPattern(
    input.type,
    input.pattern,
  );
  const label = input.label.trim();
  const action: AutoCleanRuleAction = input.action ?? "trash";
  const schedule: AutoCleanRuleSchedule = input.schedule ?? "manual";
  const isEnabled = input.isEnabled ?? true;
  const nextRunAt = isEnabled ? computeNextRunAt(schedule) : null;

  if (input.type === "CLEAN_QUERY") {
    const savedRule = await prisma.autoCleanRule.upsert({
      where: {
        userId_type_pattern: {
          userId,
          type: "CLEAN_QUERY",
          pattern: normalizedPattern,
        },
      },
      update: {
        label,
        action,
        schedule,
        isEnabled,
        nextRunAt,
      },
      create: {
        userId,
        type: "CLEAN_QUERY",
        label,
        pattern: normalizedPattern,
        action,
        schedule,
        isEnabled,
        nextRunAt,
        gmailFilterId: null,
      },
      select: AUTO_CLEAN_RULE_SELECT,
    });
    return serializeAutoCleanRule(savedRule);
  }

  const protectedRules = await prisma.protectedRule.findMany({
    where: { userId },
    select: {
      scope: true,
      pattern: true,
    },
  });

  const conflict = findProtectionConflictForBlockRule(
    input.type,
    normalizedPattern,
    protectedRules,
  );
  if (conflict) {
    throw new AutoCleanRuleConflictError(
      `Cannot block "${normalizedPattern}" because it is protected by Keep safe (${conflict.scope.toLowerCase()}: ${conflict.pattern}).`,
      409,
    );
  }

  const existingRule = await prisma.autoCleanRule.findUnique({
    where: {
      userId_type_pattern: {
        userId,
        type: input.type,
        pattern: normalizedPattern,
      },
    },
    select: {
      id: true,
      gmailFilterId: true,
    },
  });

  if (existingRule?.gmailFilterId) {
    const updatedRule = await prisma.autoCleanRule.update({
      where: { id: existingRule.id },
      data: {
        label,
        action,
        schedule,
        isEnabled,
        nextRunAt,
      },
      select: AUTO_CLEAN_RULE_SELECT,
    });
    return serializeAutoCleanRule(updatedRule);
  }

  const accessToken = await resolveAccessToken(userId);
  const filterPayload = buildGmailBlockFilterPayload(
    input.type,
    normalizedPattern,
  );

  await gmailQuotaPacer.reserve(userId, GMAIL_FILTER_QUOTA_UNITS);

  const response = await fetchGmailWithRetry(
    GMAIL_FILTERS_ENDPOINT,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(filterPayload),
      cache: "no-store",
    },
    "Network error while creating Gmail filter.",
  );

  if (!response.ok) {
    await throwGmailFilterResponseError(
      response,
      "Gmail settings.filters.create request failed",
    );
  }

  const createdFilter = (await response.json()) as GmailFilterResponse;
  const gmailFilterId =
    typeof createdFilter.id === "string" && createdFilter.id.trim().length > 0
      ? createdFilter.id.trim()
      : null;

  const savedRule = await prisma.autoCleanRule.upsert({
    where: {
      userId_type_pattern: {
        userId,
        type: input.type,
        pattern: normalizedPattern,
      },
    },
    update: {
      label,
      action,
      schedule,
      isEnabled,
      nextRunAt,
      gmailFilterId,
    },
    create: {
      userId,
      type: input.type,
      label,
      pattern: normalizedPattern,
      action,
      schedule,
      isEnabled,
      nextRunAt,
      gmailFilterId,
    },
    select: AUTO_CLEAN_RULE_SELECT,
  });

  return serializeAutoCleanRule(savedRule);
}

/**
 * Updates mutable scheduling/action/enabled settings for an existing Auto-Clean rule.
 */
export async function updateAutoCleanRuleForUser(
  userId: string,
  input: ValidatedAutoCleanRuleUpdate,
): Promise<AutoCleanRuleRecord> {
  const existingRule = await prisma.autoCleanRule.findFirst({
    where: {
      id: input.id,
      userId,
    },
    select: AUTO_CLEAN_RULE_SELECT,
  });

  if (!existingRule) {
    throw new AutoCleanRuleNotFoundError("Auto-Clean rule not found.");
  }

  const nextIsEnabled =
    input.isEnabled !== undefined ? input.isEnabled : existingRule.isEnabled;
  const nextSchedule: AutoCleanRuleSchedule =
    input.schedule !== undefined
      ? input.schedule
      : isAutoCleanRuleSchedule(existingRule.schedule)
        ? existingRule.schedule
        : "manual";
  const nextAction: AutoCleanRuleAction =
    input.action !== undefined
      ? input.action
      : isAutoCleanRuleAction(existingRule.action)
        ? existingRule.action
        : "trash";

  const nextRunAt = !nextIsEnabled
    ? null
    : input.schedule !== undefined || input.isEnabled !== undefined
      ? computeNextRunAt(nextSchedule)
      : existingRule.nextRunAt;

  const updatedRule = await prisma.autoCleanRule.update({
    where: { id: existingRule.id },
    data: {
      isEnabled: nextIsEnabled,
      schedule: nextSchedule,
      action: nextAction,
      nextRunAt,
    },
    select: AUTO_CLEAN_RULE_SELECT,
  });

  return serializeAutoCleanRule(updatedRule);
}

/**
 * Deletes an Auto-Clean rule for the user, removing the linked native Gmail
 * filter when `gmailFilterId` is set (ignoring 404 responses from Gmail).
 */
export async function deleteAutoCleanRuleForUser(
  userId: string,
  ruleId: string,
): Promise<{ removed: boolean }> {
  const trimmedRuleId = typeof ruleId === "string" ? ruleId.trim() : "";
  if (!trimmedRuleId) {
    throw new AutoCleanRuleConflictError("Rule ID is required.", 400);
  }

  const existingRule = await prisma.autoCleanRule.findFirst({
    where: {
      id: trimmedRuleId,
      userId,
    },
    select: {
      id: true,
      gmailFilterId: true,
    },
  });

  if (!existingRule) {
    return { removed: true };
  }

  if (existingRule.gmailFilterId) {
    const accessToken = await resolveAccessToken(userId);
    await gmailQuotaPacer.reserve(userId, GMAIL_FILTER_QUOTA_UNITS);

    const response = await fetchGmailWithRetry(
      `${GMAIL_FILTERS_ENDPOINT}/${encodeURIComponent(existingRule.gmailFilterId)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      },
      "Network error while deleting Gmail filter.",
    );

    if (response.status !== 404 && !response.ok) {
      await throwGmailFilterResponseError(
        response,
        "Gmail settings.filters.delete request failed",
      );
    }
  }

  await prisma.autoCleanRule.deleteMany({
    where: {
      id: existingRule.id,
      userId,
    },
  });

  return { removed: true };
}

/**
 * Runs a saved `CLEAN_QUERY` Auto-Clean rule by listing up to 1000 matching
 * Gmail messages, applying its safe configured action (`trash`, `archive`, or
 * `mark_read`) to unprotected ones, and recording run stats/status/nextRunAt.
 */
export async function runAutoCleanQueryRuleForUser(
  userId: string,
  ruleId: string,
): Promise<RunAutoCleanQueryResult> {
  const trimmedRuleId = typeof ruleId === "string" ? ruleId.trim() : "";
  if (!trimmedRuleId) {
    throw new AutoCleanRuleConflictError("Rule ID is required.", 400);
  }

  const rule = await prisma.autoCleanRule.findFirst({
    where: {
      id: trimmedRuleId,
      userId,
    },
    select: AUTO_CLEAN_RULE_SELECT,
  });

  if (!rule) {
    throw new AutoCleanRuleNotFoundError("Auto-Clean rule not found.");
  }

  if (rule.type !== "CLEAN_QUERY") {
    throw new AutoCleanRuleConflictError(
      "Only CLEAN_QUERY rules can be executed manually.",
      400,
    );
  }

  const safeAction: AutoCleanRuleAction = isAutoCleanRuleAction(rule.action)
    ? rule.action
    : "trash";
  const schedule: AutoCleanRuleSchedule = isAutoCleanRuleSchedule(rule.schedule)
    ? rule.schedule
    : "manual";

  try {
    const accessToken = await resolveAccessToken(userId);
    const { messageIds } = await listMatchingMessageIds(
      userId,
      accessToken,
      rule.pattern,
      rule.pattern.includes("in:spam"),
      AUTO_CLEAN_RUN_MAX_MESSAGES,
    );

    const cleanResult = await cleanMessagesForUser(
      userId,
      messageIds,
      safeAction,
    );

    const now = new Date();
    const updatedRule = await prisma.autoCleanRule.update({
      where: { id: rule.id },
      data: {
        lastRunAt: now,
        lastRunCount: cleanResult.processedCount,
        lastRunStatus: "ok",
        lastRunError: null,
        nextRunAt: rule.isEnabled ? computeNextRunAt(schedule, now) : null,
      },
      select: AUTO_CLEAN_RULE_SELECT,
    });

    return {
      ruleId: updatedRule.id,
      cleanResult,
      rule: serializeAutoCleanRule(updatedRule),
    };
  } catch (error) {
    const now = new Date();
    const errorMessage =
      error instanceof Error && error.message.trim().length > 0
        ? error.message.trim().slice(0, 500)
        : "Auto-Clean execution failed.";

    await prisma.autoCleanRule.update({
      where: { id: rule.id },
      data: {
        lastRunAt: now,
        lastRunStatus: "error",
        lastRunError: errorMessage,
        nextRunAt: rule.isEnabled ? computeNextRunAt(schedule, now) : null,
      },
    });

    throw error;
  }
}

/**
 * Performs a read-only dry-run preview of a Gmail search query by inspecting up
 * to 100 matching messages, counting Keep Safe protections, and returning the
 * top 5 senders without modifying any emails.
 */
export async function previewAutoCleanQueryForUser(
  userId: string,
  rawQuery: string,
): Promise<AutoCleanQueryPreviewResult> {
  const query = normalizeAutoCleanPattern("CLEAN_QUERY", rawQuery);
  if (!isValidAutoCleanPattern("CLEAN_QUERY", query)) {
    throw new AutoCleanRuleConflictError("Invalid Auto-Clean preview query.", 400);
  }

  const accessToken = await resolveAccessToken(userId);
  const { messageIds, resultSizeEstimate } = await listMatchingMessageIds(
    userId,
    accessToken,
    query,
    query.includes("in:spam"),
    AUTO_CLEAN_PREVIEW_MAX_MESSAGES,
    { singlePage: true },
  );

  if (messageIds.length === 0) {
    return {
      query,
      resultSizeEstimate,
      inspectedCount: 0,
      cleanableCount: 0,
      protectedCount: 0,
      sampleSenders: [],
    };
  }

  const [protectedRules, summaryById] = await Promise.all([
    prisma.protectedRule.findMany({
      where: { userId },
      select: {
        scope: true,
        pattern: true,
      },
    }),
    resolveMessageSummariesById(userId, messageIds, accessToken),
  ]);

  let cleanableCount = 0;
  let protectedCount = 0;
  const senderCounts = new Map<string, AutoCleanPreviewSampleSender>();

  for (const messageId of messageIds) {
    const summary = summaryById.get(messageId);
    if (!summary) {
      cleanableCount += 1;
      continue;
    }

    const isProtected =
      protectedRules.length > 0 &&
      isSenderProtected(summary.from, protectedRules);

    if (isProtected) {
      protectedCount += 1;
    } else {
      cleanableCount += 1;
    }

    const parsed = parseFromHeader(summary.from);
    const email = parsed.email || summary.from.trim().toLowerCase() || "unknown";
    const name = parsed.name || email;
    const existing = senderCounts.get(email);
    if (existing) {
      existing.count += 1;
      if (isProtected) {
        existing.isProtected = true;
      }
    } else {
      senderCounts.set(email, {
        email,
        name,
        count: 1,
        isProtected,
      });
    }
  }

  const sampleSenders = Array.from(senderCounts.values())
    .sort((a, b) => b.count - a.count || a.email.localeCompare(b.email))
    .slice(0, AUTO_CLEAN_PREVIEW_SAMPLE_SENDERS_LIMIT);

  return {
    query,
    resultSizeEstimate,
    inspectedCount: messageIds.length,
    cleanableCount,
    protectedCount,
    sampleSenders,
  };
}

export interface CronAutoCleanRuleOutcome {
  ruleId: string;
  userId: string;
  status: "success" | "auth_error" | "rate_limited" | "error";
  processedCount: number;
  error?: string;
}

export interface RunDueAutoCleanRulesResult {
  scannedCount: number;
  succeededCount: number;
  failedCount: number;
  outcomes: CronAutoCleanRuleOutcome[];
}

const CRON_RATE_LIMIT_RETRY_DELAY_MS = 15 * 60 * 1000;

/**
 * Executes up to `limit` due scheduled `CLEAN_QUERY` Auto-Clean rules
 * (`isEnabled: true`, `schedule` in `["daily", "weekly"]`, `nextRunAt <= now`).
 * Handles `GmailAuthError` by disabling the rule and `GmailRateLimitError`
 * by postponing `nextRunAt` by 15 minutes.
 */
export async function runDueAutoCleanRules(
  limit = 10,
): Promise<RunDueAutoCleanRulesResult> {
  const take =
    typeof limit === "number" && Number.isFinite(limit)
      ? Math.max(1, Math.min(50, Math.floor(limit)))
      : 10;
  const now = new Date();

  const dueRules = await prisma.autoCleanRule.findMany({
    where: {
      isEnabled: true,
      type: "CLEAN_QUERY",
      schedule: { in: ["daily", "weekly"] },
      nextRunAt: { lte: now },
    },
    orderBy: { nextRunAt: "asc" },
    take,
    select: {
      id: true,
      userId: true,
      pattern: true,
      action: true,
      schedule: true,
    },
  });

  const outcomes: CronAutoCleanRuleOutcome[] = [];
  let succeededCount = 0;
  let failedCount = 0;

  for (const rule of dueRules) {
    const safeAction: AutoCleanRuleAction = isAutoCleanRuleAction(rule.action)
      ? rule.action
      : "trash";
    const schedule: AutoCleanRuleSchedule = isAutoCleanRuleSchedule(rule.schedule)
      ? rule.schedule
      : "daily";

    try {
      const accessToken = await resolveAccessToken(rule.userId);
      const { messageIds } = await listMatchingMessageIds(
        rule.userId,
        accessToken,
        rule.pattern,
        rule.pattern.includes("in:spam"),
        AUTO_CLEAN_RUN_MAX_MESSAGES,
      );

      const cleanResult = await cleanMessagesForUser(
        rule.userId,
        messageIds,
        safeAction,
      );

      const runAt = new Date();
      await prisma.autoCleanRule.update({
        where: { id: rule.id },
        data: {
          lastRunAt: runAt,
          lastRunCount: cleanResult.processedCount,
          lastRunStatus: "success",
          lastRunError: null,
          nextRunAt: computeNextRunAt(schedule, runAt),
        },
      });

      succeededCount += 1;
      outcomes.push({
        ruleId: rule.id,
        userId: rule.userId,
        status: "success",
        processedCount: cleanResult.processedCount,
      });
    } catch (error) {
      const runAt = new Date();
      const errorMessage =
        error instanceof Error && error.message.trim().length > 0
          ? error.message.trim().slice(0, 500)
          : "Auto-Clean execution failed.";

      if (error instanceof GmailAuthError) {
        await prisma.autoCleanRule.update({
          where: { id: rule.id },
          data: {
            lastRunAt: runAt,
            lastRunStatus: "auth_error",
            lastRunError: errorMessage,
            isEnabled: false,
            nextRunAt: null,
          },
        });

        failedCount += 1;
        outcomes.push({
          ruleId: rule.id,
          userId: rule.userId,
          status: "auth_error",
          processedCount: 0,
          error: errorMessage,
        });
      } else if (error instanceof GmailRateLimitError) {
        await prisma.autoCleanRule.update({
          where: { id: rule.id },
          data: {
            lastRunAt: runAt,
            lastRunStatus: "rate_limited",
            lastRunError: errorMessage,
            nextRunAt: new Date(runAt.getTime() + CRON_RATE_LIMIT_RETRY_DELAY_MS),
          },
        });

        failedCount += 1;
        outcomes.push({
          ruleId: rule.id,
          userId: rule.userId,
          status: "rate_limited",
          processedCount: 0,
          error: errorMessage,
        });
      } else {
        await prisma.autoCleanRule.update({
          where: { id: rule.id },
          data: {
            lastRunAt: runAt,
            lastRunStatus: "error",
            lastRunError: errorMessage,
            nextRunAt: computeNextRunAt(schedule, runAt),
          },
        });

        failedCount += 1;
        outcomes.push({
          ruleId: rule.id,
          userId: rule.userId,
          status: "error",
          processedCount: 0,
          error: errorMessage,
        });
      }
    }
  }

  return {
    scannedCount: dueRules.length,
    succeededCount,
    failedCount,
    outcomes,
  };
}
