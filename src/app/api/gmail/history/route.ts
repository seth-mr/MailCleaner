import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listCleanHistoryForUser } from "@/lib/gmail";

/**
 * Returns the authenticated user's most recent 25 cleaning activity entries.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const entries = await listCleanHistoryForUser(session.user.id);
    return NextResponse.json({ entries }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to load clean activity history." },
      { status: 500 },
    );
  }
}
