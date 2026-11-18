import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  pickRevocationToken,
  revokeGoogleToken,
} from "@/lib/account-disconnect";
import { prisma } from "@/lib/prisma";

/**
 * Revokes the authenticated user's Google OAuth tokens (best-effort) and
 * deletes all local cached metadata, rules, sessions, and OAuth account rows.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const googleAccounts = await prisma.account.findMany({
    where: {
      userId,
      provider: "google",
    },
    select: {
      refresh_token: true,
      access_token: true,
    },
  });

  const tokensToRevoke = Array.from(
    new Set(
      googleAccounts
        .map((account) => pickRevocationToken(account))
        .filter((token): token is string => token !== null),
    ),
  );

  let revokedWithGoogle = false;
  if (tokensToRevoke.length > 0) {
    const revocationResults = await Promise.all(
      tokensToRevoke.map((token) => revokeGoogleToken(token)),
    );
    revokedWithGoogle = revocationResults.some(Boolean);
  }

  try {
    const [deletedCached, deletedProtected, deletedAutoClean] =
      await prisma.$transaction([
        prisma.cachedMessage.deleteMany({
          where: { userId },
        }),
        prisma.protectedRule.deleteMany({
          where: { userId },
        }),
        prisma.autoCleanRule.deleteMany({
          where: { userId },
        }),
        prisma.session.deleteMany({
          where: { userId },
        }),
        prisma.account.deleteMany({
          where: { userId },
        }),
        prisma.user.update({
          where: { id: userId },
          data: {
            reclaimedBytes: 0,
            cleanedMessagesCount: 0,
          },
        }),
      ]);

    return NextResponse.json(
      {
        disconnected: true,
        revokedWithGoogle,
        deletedCachedMessages: deletedCached.count,
        deletedProtectedRules: deletedProtected.count,
        deletedAutoCleanRules: deletedAutoClean.count,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to delete local cache and disconnect account." },
      { status: 500 },
    );
  }
}
