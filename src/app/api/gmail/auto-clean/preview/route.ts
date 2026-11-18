import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  AutoCleanRuleConflictError,
  GmailApiError,
  GmailAuthError,
  GmailRateLimitError,
  previewAutoCleanQueryForUser,
} from "@/lib/gmail";
import { validateAutoCleanPreviewInput } from "@/lib/gmail-filters";

/**
 * Performs a read-only dry-run preview for a CLEAN_QUERY Auto-Clean search
 * query without modifying any messages in Gmail.
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

  const validation = validateAutoCleanPreviewInput(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const preview = await previewAutoCleanQueryForUser(
      session.user.id,
      validation.data.query,
    );
    return NextResponse.json(preview, { status: 200 });
  } catch (error) {
    if (error instanceof GmailAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof AutoCleanRuleConflictError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
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
      { error: "Failed to preview Auto-Clean query." },
      { status: 502 },
    );
  }
}
