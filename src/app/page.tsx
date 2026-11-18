import { Suspense } from "react";
import { connection } from "next/server";
import { auth, signIn, signOut } from "@/auth";
import { LandingPage } from "@/components/landing-page";
import { MailCleanerDashboard } from "@/components/mail-cleaner-dashboard";
import { listCleanHistoryForUser } from "@/lib/gmail";
import { prisma } from "@/lib/prisma";

async function handleSignIn() {
  "use server";
  await signIn("google");
}

async function handleSignOut() {
  "use server";
  await signOut();
}

async function AuthenticatedHome() {
  await connection();
  const session = await auth();

  if (!session?.user?.id) {
    return <LandingPage onSignIn={handleSignIn} />;
  }

  const [
    userStats,
    initialProtectedRules,
    initialAutoCleanRules,
    initialCleanHistory,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        reclaimedBytes: true,
        cleanedMessagesCount: true,
      },
    }),
    prisma.protectedRule.findMany({
      where: { userId: session.user.id },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        scope: true,
        pattern: true,
      },
    }),
    prisma.autoCleanRule.findMany({
      where: { userId: session.user.id },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        type: true,
        label: true,
        pattern: true,
        gmailFilterId: true,
        lastRunAt: true,
        lastRunCount: true,
      },
    }),
    listCleanHistoryForUser(session.user.id),
  ]);

  const serializedAutoCleanRules = initialAutoCleanRules.map((rule) => ({
    ...rule,
    lastRunAt: rule.lastRunAt ? rule.lastRunAt.toISOString() : null,
  }));

  return (
    <MailCleanerDashboard
      user={{
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        passStatus: session.user.passStatus,
        passExpiresAt: session.user.passExpiresAt
          ? new Date(session.user.passExpiresAt).toISOString()
          : null,
        reclaimedBytes: Number(userStats?.reclaimedBytes ?? 0),
        cleanedMessagesCount: userStats?.cleanedMessagesCount ?? 0,
      }}
      initialProtectedRules={initialProtectedRules}
      initialAutoCleanRules={serializedAutoCleanRules}
      initialCleanHistory={initialCleanHistory}
      onSignOut={handleSignOut}
    />
  );
}

export default function Home() {
  return (
    <Suspense fallback={<LandingPage onSignIn={handleSignIn} isCheckingSession />}>
      <AuthenticatedHome />
    </Suspense>
  );
}
