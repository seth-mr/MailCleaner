import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runDueAutoCleanRules } from "@/lib/gmail";

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim() ?? "";
  if (!cronSecret) {
    return false;
  }

  const expected = `Bearer ${cronSecret}`;
  const authHeader = request.headers.get("authorization") ?? "";

  if (authHeader.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}

/**
 * Cron endpoint that executes up to 10 due scheduled Auto-Clean rules.
 * Requires `Authorization: Bearer ${process.env.CRON_SECRET}`.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDueAutoCleanRules(10);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[cron/auto-clean] Failed to run due Auto-Clean rules:", error);
    return NextResponse.json(
      { error: "Failed to run due Auto-Clean rules." },
      { status: 500 },
    );
  }
}
