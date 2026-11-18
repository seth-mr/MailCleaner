import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  GmailApiError,
  GmailAuthError,
  GmailRateLimitError,
  listMessagePreviewsForUser,
} from "@/lib/gmail";
import { normalizeMessageIds } from "@/lib/gmail-clean";

/**
 * Returns lightweight preview metadata for a list of Gmail message IDs,
 * using cached SQLite entries first to avoid unnecessary Gmail API quota usage.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  const candidate = body as Record<string, unknown>;
  const messageIds = normalizeMessageIds(candidate.messageIds);
  if (messageIds.length === 0) {
    return NextResponse.json(
      { error: "messageIds must contain at least one non-empty message ID." },
      { status: 400 },
    );
  }

  const limit =
    typeof candidate.limit === "number" && Number.isFinite(candidate.limit)
      ? Math.trunc(candidate.limit)
      : undefined;

  try {
    const messages = await listMessagePreviewsForUser(
      session.user.id,
      messageIds,
      limit,
    );
    return NextResponse.json({ messages }, { status: 200 });
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
      { error: "Failed to load email previews from Gmail." },
      { status: 502 },
    );
  }
}
