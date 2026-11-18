import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  isProtectionScope,
  isValidProtectionPattern,
  normalizeProtectionPattern,
  type ProtectionScopeType,
} from "@/lib/keep-safe";
import { prisma } from "@/lib/prisma";

interface ValidatedRuleInput {
  scope: ProtectionScopeType;
  pattern: string;
}

async function parseAndValidateRuleBody(
  request: NextRequest,
): Promise<
  { ok: true; data: ValidatedRuleInput } | { ok: false; error: string }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: "Invalid JSON request body." };
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const candidate = body as Record<string, unknown>;
  if (!isProtectionScope(candidate.scope)) {
    return {
      ok: false,
      error: "scope must be one of SENDER, DOMAIN, or BRAND.",
    };
  }

  if (typeof candidate.pattern !== "string") {
    return { ok: false, error: "pattern must be a non-empty string." };
  }

  const normalizedPattern = normalizeProtectionPattern(
    candidate.scope,
    candidate.pattern,
  );
  if (!isValidProtectionPattern(candidate.scope, normalizedPattern)) {
    return {
      ok: false,
      error: `Invalid pattern for scope ${candidate.scope}.`,
    };
  }

  return {
    ok: true,
    data: {
      scope: candidate.scope,
      pattern: normalizedPattern,
    },
  };
}

/**
 * Lists all active Keep Safe protection rules for the authenticated user.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rules = await prisma.protectedRule.findMany({
    where: { userId: session.user.id },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      scope: true,
      pattern: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ rules }, { status: 200 });
}

/**
 * Creates or ensures a Keep Safe protection rule for the authenticated user.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const validation = await parseAndValidateRuleBody(request);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const rule = await prisma.protectedRule.upsert({
    where: {
      userId_scope_pattern: {
        userId: session.user.id,
        scope: validation.data.scope,
        pattern: validation.data.pattern,
      },
    },
    update: {},
    create: {
      userId: session.user.id,
      scope: validation.data.scope,
      pattern: validation.data.pattern,
    },
    select: {
      id: true,
      scope: true,
      pattern: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ rule }, { status: 200 });
}

/**
 * Removes a Keep Safe protection rule for the authenticated user.
 */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const validation = await parseAndValidateRuleBody(request);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  await prisma.protectedRule.deleteMany({
    where: {
      userId: session.user.id,
      scope: validation.data.scope,
      pattern: validation.data.pattern,
    },
  });

  return NextResponse.json({ removed: true }, { status: 200 });
}
