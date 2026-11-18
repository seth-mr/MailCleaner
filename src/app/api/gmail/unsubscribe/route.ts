import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  GmailApiError,
  GmailAuthError,
  GmailRateLimitError,
  unsubscribeFromSenderForUser,
} from "@/lib/gmail";
import { normalizeMessageIds } from "@/lib/gmail-clean";

/**
 * Attempts automatic unsubscribe (`List-Unsubscribe` One-Click POST or `mailto:`)
 * or extracts a manual unsubscribe link from headers or HTML for a sender.
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
  const senderEmail =
    typeof candidate.senderEmail === "string" ? candidate.senderEmail.trim() : "";
  if (senderEmail.length === 0) {
    return NextResponse.json(
      { error: "senderEmail must be a non-empty string." },
      { status: 400 },
    );
  }

  const messageIds = normalizeMessageIds(candidate.messageIds);
  if (messageIds.length === 0) {
    return NextResponse.json(
      { error: "messageIds must contain at least one non-empty message ID." },
      { status: 400 },
    );
  }

  try {
    const result = await unsubscribeFromSenderForUser(
      session.user.id,
      senderEmail,
      messageIds,
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
      { error: "Failed to unsubscribe from sender." },
      { status: 502 },
    );
  }
}
