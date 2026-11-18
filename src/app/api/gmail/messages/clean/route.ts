import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  cleanMessagesForUser,
  GmailApiError,
  GmailAuthError,
} from "@/lib/gmail";
import { validateCleanRequestBody } from "@/lib/gmail-clean";

/**
 * Moves selected Gmail messages to Trash, restores them from Trash,
 * or permanently deletes them for the authenticated user.
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

  const validation = validateCleanRequestBody(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const result = await cleanMessagesForUser(
      session.user.id,
      validation.data.messageIds,
      validation.data.action,
      {
        restoreReclaimedBytes: validation.data.restoreReclaimedBytes,
      },
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof GmailAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof GmailApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return NextResponse.json(
      { error: "Failed to clean Gmail messages." },
      { status: 502 },
    );
  }
}
