import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  AutoCleanRuleConflictError,
  AutoCleanRuleNotFoundError,
  createAutoCleanRuleForUser,
  deleteAutoCleanRuleForUser,
  GmailApiError,
  GmailAuthError,
  GmailRateLimitError,
  GmailSettingsScopeError,
  listAutoCleanRulesForUser,
  updateAutoCleanRuleForUser,
} from "@/lib/gmail";
import {
  validateAutoCleanRuleInput,
  validateAutoCleanRuleUpdate,
} from "@/lib/gmail-filters";

function handleFilterRouteError(error: unknown, fallbackMessage: string) {
  if (error instanceof GmailAuthError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (error instanceof GmailSettingsScopeError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: 403 },
    );
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

  return NextResponse.json({ error: fallbackMessage }, { status: 502 });
}

/**
 * Lists all active Auto-Clean and Gmail block rules for the authenticated user.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rules = await listAutoCleanRulesForUser(session.user.id);
  return NextResponse.json({ rules }, { status: 200 });
}

/**
 * Creates or updates an Auto-Clean rule (and native Gmail filter for
 * BLOCK_SENDER / BLOCK_DOMAIN) for the authenticated user.
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

  const validation = validateAutoCleanRuleInput(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const rule = await createAutoCleanRuleForUser(
      session.user.id,
      validation.data,
    );
    return NextResponse.json({ rule }, { status: 200 });
  } catch (error) {
    return handleFilterRouteError(error, "Failed to create Auto-Clean rule.");
  }
}

/**
 * Updates `isEnabled`, `schedule`, and/or `action` on an Auto-Clean rule.
 */
export async function PATCH(request: NextRequest) {
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

  const validation = validateAutoCleanRuleUpdate(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const rule = await updateAutoCleanRuleForUser(
      session.user.id,
      validation.data,
    );
    return NextResponse.json({ rule }, { status: 200 });
  } catch (error) {
    return handleFilterRouteError(error, "Failed to update Auto-Clean rule.");
  }
}

/**
 * Removes an Auto-Clean rule and its linked native Gmail filter (if any).
 */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let ruleId = request.nextUrl.searchParams.get("id")?.trim() ?? "";

  if (!ruleId) {
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    if (typeof body === "object" && body !== null && !Array.isArray(body)) {
      const candidate = body as Record<string, unknown>;
      if (typeof candidate.id === "string") {
        ruleId = candidate.id.trim();
      }
    }
  }

  if (!ruleId) {
    return NextResponse.json(
      { error: "Rule id is required." },
      { status: 400 },
    );
  }

  try {
    const result = await deleteAutoCleanRuleForUser(session.user.id, ruleId);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleFilterRouteError(error, "Failed to delete Auto-Clean rule.");
  }
}
