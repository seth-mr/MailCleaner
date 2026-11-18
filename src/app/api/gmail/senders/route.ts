import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  fetchGroupedSendersPageForUser,
  GmailApiError,
  GmailAuthError,
  GmailRateLimitError,
} from "@/lib/gmail";
import {
  DEFAULT_MAX_MESSAGES,
  GMAIL_AGE_FILTERS,
  GMAIL_PRESET_FILTERS,
  GMAIL_SIZE_FILTERS,
  MAX_MAX_MESSAGES,
  MIN_MAX_MESSAGES,
  type GmailAgeFilter,
  type GmailFilterParams,
  type GmailPresetFilter,
  type GmailSizeFilter,
} from "@/lib/gmail-grouping";

function parseEnumParam<T extends string>(
  rawValue: string | null,
  allowedValues: readonly T[],
  defaultValue: T,
): T | null {
  if (rawValue === null || rawValue === "") {
    return defaultValue;
  }
  if ((allowedValues as readonly string[]).includes(rawValue)) {
    return rawValue as T;
  }
  return null;
}

function parseMaxMessagesParam(rawValue: string | null): number | null {
  if (rawValue === null || rawValue === "") {
    return DEFAULT_MAX_MESSAGES;
  }

  const trimmed = rawValue.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < MIN_MAX_MESSAGES ||
    parsed > MAX_MAX_MESSAGES
  ) {
    return null;
  }

  return parsed;
}

function parseBooleanParam(
  rawValue: string | null,
  defaultValue: boolean,
): boolean | null {
  if (rawValue === null || rawValue === "") {
    return defaultValue;
  }
  if (rawValue === "true") {
    return true;
  }
  if (rawValue === "false") {
    return false;
  }
  return null;
}

const MAX_PAGE_TOKEN_LENGTH = 512;

function parsePageTokenParam(
  rawValue: string | null,
): { ok: true; pageToken?: string } | { ok: false; error: string } {
  if (rawValue === null) {
    return { ok: true, pageToken: undefined };
  }

  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      error: "Invalid pageToken parameter. Expected a non-empty string.",
    };
  }

  if (trimmed.length > MAX_PAGE_TOKEN_LENGTH) {
    return {
      ok: false,
      error: `Invalid pageToken parameter. Maximum length is ${MAX_PAGE_TOKEN_LENGTH} characters.`,
    };
  }

  return { ok: true, pageToken: trimmed };
}

function parseQueryFilters(
  searchParams: URLSearchParams,
): { ok: true; filters: GmailFilterParams } | { ok: false; error: string } {
  const preset = parseEnumParam<GmailPresetFilter>(
    searchParams.get("preset"),
    GMAIL_PRESET_FILTERS,
    "all",
  );
  if (!preset) {
    return {
      ok: false,
      error: `Invalid preset parameter. Expected one of: ${GMAIL_PRESET_FILTERS.join(", ")}.`,
    };
  }

  const olderThan = parseEnumParam<GmailAgeFilter>(
    searchParams.get("olderThan"),
    GMAIL_AGE_FILTERS,
    "any",
  );
  if (!olderThan) {
    return {
      ok: false,
      error: `Invalid olderThan parameter. Expected one of: ${GMAIL_AGE_FILTERS.join(", ")}.`,
    };
  }

  const largerThan = parseEnumParam<GmailSizeFilter>(
    searchParams.get("largerThan"),
    GMAIL_SIZE_FILTERS,
    "any",
  );
  if (!largerThan) {
    return {
      ok: false,
      error: `Invalid largerThan parameter. Expected one of: ${GMAIL_SIZE_FILTERS.join(", ")}.`,
    };
  }

  const hasAttachment = parseBooleanParam(
    searchParams.get("hasAttachment"),
    false,
  );
  if (hasAttachment === null) {
    return {
      ok: false,
      error: 'Invalid hasAttachment parameter. Expected "true" or "false".',
    };
  }

  const unreadOnly = parseBooleanParam(
    searchParams.get("unreadOnly"),
    false,
  );
  if (unreadOnly === null) {
    return {
      ok: false,
      error: 'Invalid unreadOnly parameter. Expected "true" or "false".',
    };
  }

  const maxMessages = parseMaxMessagesParam(searchParams.get("maxMessages"));
  if (maxMessages === null) {
    return {
      ok: false,
      error: `Invalid maxMessages parameter. Expected an integer between ${MIN_MAX_MESSAGES} and ${MAX_MAX_MESSAGES}.`,
    };
  }

  const rawSearch = searchParams.get("search") ?? "";
  if (rawSearch.length > 500) {
    return {
      ok: false,
      error: "Invalid search parameter. Maximum length is 500 characters.",
    };
  }

  const parsedPageToken = parsePageTokenParam(searchParams.get("pageToken"));
  if (!parsedPageToken.ok) {
    return parsedPageToken;
  }

  return {
    ok: true,
    filters: {
      preset,
      olderThan,
      largerThan,
      hasAttachment,
      unreadOnly,
      search: rawSearch,
      maxMessages,
      pageToken: parsedPageToken.pageToken,
    },
  };
}

/**
 * Lists a page of Gmail messages matching quick filters for the authenticated user,
 * grouped by sender and ordered by total size descending.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedQuery = parseQueryFilters(new URL(request.url).searchParams);
  if (!parsedQuery.ok) {
    return NextResponse.json({ error: parsedQuery.error }, { status: 400 });
  }

  try {
    const result = await fetchGroupedSendersPageForUser(
      session.user.id,
      parsedQuery.filters,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof GmailAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof GmailRateLimitError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "GMAIL_RATE_LIMIT",
          retryAfterSeconds: error.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(error.retryAfterSeconds),
          },
        },
      );
    }

    if (error instanceof GmailApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return NextResponse.json(
      { error: "Failed to fetch grouped senders from Gmail." },
      { status: 502 },
    );
  }
}
