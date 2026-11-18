import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  emptyTrashForUser,
  GmailApiError,
  GmailAuthError,
} from "@/lib/gmail";
import { validateEmptyTrashBody } from "@/lib/gmail-clean";

/**
 * Permanently deletes all messages in Gmail Trash (`in:trash`) for the
 * authenticated user after explicit confirmation.
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

  const validation = validateEmptyTrashBody(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const result = await emptyTrashForUser(session.user.id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof GmailAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof GmailApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return NextResponse.json(
      { error: "Failed to empty Gmail Trash." },
      { status: 502 },
    );
  }
}
