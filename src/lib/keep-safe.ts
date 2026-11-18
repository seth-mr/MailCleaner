import type { SenderGroup } from "./gmail-grouping";

export const PROTECTION_SCOPES = ["SENDER", "DOMAIN", "BRAND"] as const;
export type ProtectionScopeType = (typeof PROTECTION_SCOPES)[number];

export interface ProtectionRuleRecord {
  id?: string;
  scope: ProtectionScopeType;
  pattern: string;
  createdAt?: string | Date;
}

const COMPOUND_PUBLIC_SUFFIXES = new Set<string>([
  "com.mx",
  "co.uk",
  "com.br",
  "com.ar",
  "com.au",
  "co.jp",
  "org.uk",
  "net.mx",
  "gob.mx",
  "edu.mx",
  "org.mx",
  "co.in",
  "co.nz",
  "co.za",
  "co.kr",
  "co.il",
  "co.id",
  "co.th",
  "com.co",
  "com.es",
  "com.pe",
  "com.cl",
  "com.tr",
  "com.cn",
  "com.hk",
  "com.tw",
  "com.sg",
  "com.uy",
  "com.ve",
  "com.ec",
  "ac.uk",
  "gov.uk",
  "net.uk",
  "net.au",
  "org.au",
  "ne.jp",
  "or.jp",
]);

/**
 * Type guard verifying whether an unknown value is a supported protection scope.
 */
export function isProtectionScope(value: unknown): value is ProtectionScopeType {
  return (
    typeof value === "string" &&
    (PROTECTION_SCOPES as readonly string[]).includes(value)
  );
}

/**
 * Extracts a normalized lowercase email address from either a plain email
 * string or an RFC 5322 `From` header (e.g. `"Name <user@example.com>"`).
 */
export function extractNormalizedEmail(rawSender: string): string {
  if (typeof rawSender !== "string") {
    return "";
  }

  const trimmed = rawSender.trim();
  if (!trimmed) {
    return "";
  }

  const angleBracketMatch = /^(.*)<([^<>]+)>\s*$/.exec(trimmed);
  if (angleBracketMatch) {
    return angleBracketMatch[2].trim().toLowerCase();
  }

  return trimmed.toLowerCase();
}

/**
 * Extracts the normalized lowercase host domain from a sender email or `From`
 * header, returning `"unknown"` if no valid host is present.
 */
export function extractSenderHostFromEmail(rawSender: string): string {
  const email = extractNormalizedEmail(rawSender);
  if (!email) {
    return "unknown";
  }

  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) {
    return "unknown";
  }

  const rawHost = email
    .slice(atIndex + 1)
    .trim()
    .replace(/>+$/, "")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase();

  if (!rawHost || /\s/.test(rawHost)) {
    return "unknown";
  }

  return rawHost;
}

/**
 * Extracts the primary brand key from a host domain by stripping its TLD or
 * common compound public suffix (matching `sender-tree.ts`).
 */
export function extractBrandKeyFromHost(host: string): string {
  if (typeof host !== "string") {
    return "unknown";
  }

  const normalized = host.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!normalized || normalized === "unknown") {
    return "unknown";
  }

  const labels = normalized.split(".").filter(Boolean);
  if (labels.length === 0) {
    return "unknown";
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.every((part) => /^\d+$/.test(part))) {
    return normalized;
  }

  if (labels.length >= 3) {
    const compoundSuffix = `${labels[labels.length - 2]}.${labels[labels.length - 1]}`;
    if (COMPOUND_PUBLIC_SUFFIXES.has(compoundSuffix)) {
      return labels[labels.length - 3];
    }
  }

  return labels[labels.length - 2];
}

/**
 * Normalizes a keep-safe rule pattern according to its scope (`SENDER`,
 * `DOMAIN`, or `BRAND`) via trimming and lowercasing.
 */
export function normalizeProtectionPattern(
  scope: ProtectionScopeType,
  rawPattern: string,
): string {
  if (typeof rawPattern !== "string") {
    return "";
  }

  const trimmed = rawPattern.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  if (scope === "SENDER") {
    return extractNormalizedEmail(trimmed);
  }

  if (scope === "DOMAIN") {
    return trimmed.replace(/^@+/, "").replace(/^\.+|\.+$/g, "");
  }

  return trimmed.replace(/^\.+|\.+$/g, "");
}

/**
 * Validates whether a normalized protection pattern is structurally valid for
 * the given scope.
 */
export function isValidProtectionPattern(
  scope: ProtectionScopeType,
  normalizedPattern: string,
): boolean {
  if (!normalizedPattern || /\s/.test(normalizedPattern)) {
    return false;
  }

  if (scope === "SENDER") {
    const atIndex = normalizedPattern.indexOf("@");
    const lastAtIndex = normalizedPattern.lastIndexOf("@");
    if (atIndex <= 0 || atIndex !== lastAtIndex) {
      return false;
    }
    const domainPart = normalizedPattern.slice(atIndex + 1);
    return domainPart.length > 0 && domainPart !== "unknown";
  }

  return normalizedPattern !== "unknown";
}

/**
 * Checks whether a specific `(scope, pattern)` rule exists in `rules`.
 */
export function hasProtectionRule(
  rules: readonly ProtectionRuleRecord[],
  scope: ProtectionScopeType,
  pattern: string,
): boolean {
  const normalizedTarget = normalizeProtectionPattern(scope, pattern);
  if (!normalizedTarget) {
    return false;
  }

  return rules.some(
    (rule) =>
      rule.scope === scope &&
      normalizeProtectionPattern(rule.scope, rule.pattern) === normalizedTarget,
  );
}

/**
 * Returns the first matching protection rule for a sender email or `From` header,
 * checking exact `SENDER`, host `DOMAIN`, and `BRAND` rules.
 */
export function findMatchingProtectionRule(
  senderEmail: string,
  rules: readonly ProtectionRuleRecord[],
): ProtectionRuleRecord | null {
  if (rules.length === 0) {
    return null;
  }

  const normalizedEmail = extractNormalizedEmail(senderEmail);
  if (!normalizedEmail) {
    return null;
  }

  const host = extractSenderHostFromEmail(normalizedEmail);
  const brand = extractBrandKeyFromHost(host);

  for (const rule of rules) {
    const pattern = normalizeProtectionPattern(rule.scope, rule.pattern);
    if (!pattern) {
      continue;
    }

    if (rule.scope === "SENDER" && normalizedEmail === pattern) {
      return rule;
    }

    if (rule.scope === "DOMAIN" && host !== "unknown" && host === pattern) {
      return rule;
    }

    if (rule.scope === "BRAND" && brand !== "unknown" && brand === pattern) {
      return rule;
    }
  }

  return null;
}

/**
 * Returns `true` when `senderEmail` (plain email or `From` header) matches any
 * active `SENDER`, `DOMAIN`, or `BRAND` protection rule.
 */
export function isSenderProtected(
  senderEmail: string,
  rules: readonly ProtectionRuleRecord[],
): boolean {
  return findMatchingProtectionRule(senderEmail, rules) !== null;
}

/**
 * Splits `senders` into `{ cleanable, protectedSenders }` without mutating the
 * input array.
 */
export function partitionSendersByProtection(
  senders: readonly SenderGroup[],
  rules: readonly ProtectionRuleRecord[],
): {
  cleanable: SenderGroup[];
  protectedSenders: SenderGroup[];
} {
  const cleanable: SenderGroup[] = [];
  const protectedSenders: SenderGroup[] = [];

  for (const sender of senders) {
    if (isSenderProtected(sender.senderEmail, rules)) {
      protectedSenders.push(sender);
    } else {
      cleanable.push(sender);
    }
  }

  return { cleanable, protectedSenders };
}
