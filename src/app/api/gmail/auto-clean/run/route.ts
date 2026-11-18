import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  AutoCleanRuleConflictError,
  AutoCleanRuleNotFoundError,
  GmailApiError,
  GmailAuthError,
  GmailRateLimitError,
  runAutoCleanQueryRuleForUser,
} from "@/lib/gmail";

/**
 * Executes a saved CLEAN_QUERY Auto-Clean rule on demand by applying its
 * configured safe action (`trash`, `archive`, or `mark_read`) to up to 1000
 * matching unprotected messages and updating run statistics.
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
  const ruleId =
    typeof candidate.ruleId === "string" ? candidate.ruleId.trim() : "";
  if (!ruleId) {
    return NextResponse.json(
      { error: "ruleId must be a non-empty string." },
      { status: 400 },
    );
  }

  try {
    const result = await runAutoCleanQueryRuleForUser(session.user.id, ruleId);
    return NextResponse.json(
      {
        ruleId: result.ruleId,
        cleanResult: result.cleanResult,
        rule: result.rule,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof GmailAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof AutoCleanRuleNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
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
      { error: "Failed to run Auto-Clean rule." },
      { status: 502 },
    );
  }
}
