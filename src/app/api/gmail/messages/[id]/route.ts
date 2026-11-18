import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  fetchMessageDetailForUser,
  GmailApiError,
  GmailAuthError,
  GmailRateLimitError,
} from "@/lib/gmail";

/**
 * Fetches full headers and decoded text/HTML content for a single Gmail message.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const messageId = typeof id === "string" ? id.trim() : "";
  if (messageId.length === 0) {
    return NextResponse.json(
      { error: "Message ID is required." },
      { status: 400 },
    );
  }

  try {
    const detail = await fetchMessageDetailForUser(session.user.id, messageId);
    return NextResponse.json(detail, { status: 200 });
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
      const status =
        error.status === 404 || error.status === 400 || error.status === 401
          ? error.status
          : 502;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json(
      { error: "Failed to load email content from Gmail." },
      { status: 502 },
    );
  }
}
