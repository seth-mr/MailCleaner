import type {
  GmailAgeFilter,
  GmailPresetFilter,
} from "./gmail-grouping";

export const AUTO_CLEAN_RULE_TYPES = [
  "BLOCK_SENDER",
  "BLOCK_DOMAIN",
  "CLEAN_QUERY",
] as const;

export type AutoCleanRuleTypeValue = (typeof AUTO_CLEAN_RULE_TYPES)[number];

export const AUTO_CLEAN_RULE_ACTIONS = [
  "trash",
  "archive",
  "mark_read",
] as const;

export type AutoCleanRuleAction = (typeof AUTO_CLEAN_RULE_ACTIONS)[number];

export const AUTO_CLEAN_RULE_SCHEDULES = [
  "manual",
  "daily",
  "weekly",
] as const;

export type AutoCleanRuleSchedule = (typeof AUTO_CLEAN_RULE_SCHEDULES)[number];

export const AUTO_CLEAN_RULE_STATUSES = [
  "idle",
  "ok",
  "success",
  "error",
  "auth_error",
  "rate_limited",
] as const;

export type AutoCleanRuleStatus = (typeof AUTO_CLEAN_RULE_STATUSES)[number];

export interface AutoCleanPreset {
  id: "promotions-90d" | "spam-30d" | "social-90d";
  type: "CLEAN_QUERY";
  label: string;
  pattern: string;
}

export const AUTO_CLEAN_PRESETS: readonly AutoCleanPreset[] = [
  {
    id: "promotions-90d",
    type: "CLEAN_QUERY",
    label: "Trash Promotions > 90d",
    pattern: "category:promotions older_than:90d",
  },
  {
    id: "spam-30d",
    type: "CLEAN_QUERY",
    label: "Trash Spam > 30d",
    pattern: "in:spam older_than:30d",
  },
  {
    id: "social-90d",
    type: "CLEAN_QUERY",
    label: "Trash Social > 90d",
    pattern: "category:social older_than:90d",
  },
] as const;

export interface AutoCleanRuleRecord {
  id: string;
  type: AutoCleanRuleTypeValue;
  label: string;
  pattern: string;
  action?: AutoCleanRuleAction;
  schedule?: AutoCleanRuleSchedule;
  isEnabled?: boolean;
  nextRunAt?: string | null;
  gmailFilterId: string | null;
  lastRunAt: string | null;
  lastRunCount: number;
  lastRunStatus?: AutoCleanRuleStatus;
  lastRunError?: string | null;
}

export interface GmailFilterPayload {
  criteria: {
    from: string;
  };
  action: {
    addLabelIds: ["TRASH"];
    removeLabelIds: ["INBOX"];
  };
}

export interface ValidatedAutoCleanRuleInput {
  type: AutoCleanRuleTypeValue;
  pattern: string;
  label: string;
  action?: AutoCleanRuleAction;
  schedule?: AutoCleanRuleSchedule;
  isEnabled?: boolean;
}

export type AutoCleanRuleValidationResult =
  | { ok: true; data: ValidatedAutoCleanRuleInput }
  | { ok: false; error: string };

export interface ValidatedAutoCleanRuleUpdate {
  id: string;
  isEnabled?: boolean;
  schedule?: AutoCleanRuleSchedule;
  action?: AutoCleanRuleAction;
}

export type AutoCleanRuleUpdateValidationResult =
  | { ok: true; data: ValidatedAutoCleanRuleUpdate }
  | { ok: false; error: string };

export interface ValidatedAutoCleanPreviewInput {
  query: string;
}

export type AutoCleanPreviewValidationResult =
  | { ok: true; data: ValidatedAutoCleanPreviewInput }
  | { ok: false; error: string };

const MAX_CLEAN_QUERY_LENGTH = 500;
const MAX_RULE_LABEL_LENGTH = 200;

/**
 * Type guard verifying whether an unknown value is a supported Auto-Clean rule type.
 */
export function isAutoCleanRuleType(
  value: unknown,
): value is AutoCleanRuleTypeValue {
  return (
    typeof value === "string" &&
    (AUTO_CLEAN_RULE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Type guard verifying whether an unknown value is a safe Auto-Clean rule action.
 * Permanent deletion ("delete") is intentionally never allowed.
 */
export function isAutoCleanRuleAction(
  value: unknown,
): value is AutoCleanRuleAction {
  return (
    typeof value === "string" &&
    (AUTO_CLEAN_RULE_ACTIONS as readonly string[]).includes(value)
  );
}

/**
 * Type guard verifying whether an unknown value is a supported Auto-Clean schedule.
 */
export function isAutoCleanRuleSchedule(
  value: unknown,
): value is AutoCleanRuleSchedule {
  return (
    typeof value === "string" &&
    (AUTO_CLEAN_RULE_SCHEDULES as readonly string[]).includes(value)
  );
}

/**
 * Type guard verifying whether an unknown value is a supported Auto-Clean run status.
 */
export function isAutoCleanRuleStatus(
  value: unknown,
): value is AutoCleanRuleStatus {
  return (
    typeof value === "string" &&
    (AUTO_CLEAN_RULE_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Computes the next scheduled execution timestamp for an Auto-Clean rule.
 * Returns `null` for `"manual"` schedules.
 */
export function computeNextRunAt(
  schedule: AutoCleanRuleSchedule,
  fromDate: Date = new Date(),
): Date | null {
  if (schedule === "manual") {
    return null;
  }

  const days = schedule === "daily" ? 1 : 7;
  return new Date(fromDate.getTime() + days * 24 * 60 * 60 * 1000);
}

function extractNormalizedEmailAddress(rawSender: string): string {
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
 * Normalizes an Auto-Clean rule pattern according to its rule type.
 */
export function normalizeAutoCleanPattern(
  type: AutoCleanRuleTypeValue,
  rawPattern: string,
): string {
  if (typeof rawPattern !== "string") {
    return "";
  }

  const trimmed = rawPattern.trim();
  if (!trimmed) {
    return "";
  }

  if (type === "BLOCK_SENDER") {
    return extractNormalizedEmailAddress(trimmed);
  }

  if (type === "BLOCK_DOMAIN") {
    return trimmed
      .toLowerCase()
      .replace(/^@+/, "")
      .replace(/^\.+|\.+$/g, "");
  }

  return trimmed.replace(/\s+/g, " ");
}

/**
 * Validates whether a normalized pattern is structurally valid for the given rule type.
 */
export function isValidAutoCleanPattern(
  type: AutoCleanRuleTypeValue,
  normalizedPattern: string,
): boolean {
  if (!normalizedPattern) {
    return false;
  }

  if (type === "BLOCK_SENDER") {
    if (/\s/.test(normalizedPattern)) {
      return false;
    }
    const atIndex = normalizedPattern.indexOf("@");
    const lastAtIndex = normalizedPattern.lastIndexOf("@");
    if (atIndex <= 0 || atIndex !== lastAtIndex) {
      return false;
    }
    const domainPart = normalizedPattern.slice(atIndex + 1);
    return domainPart.length > 0 && domainPart !== "unknown";
  }

  if (type === "BLOCK_DOMAIN") {
    return (
      !/\s/.test(normalizedPattern) &&
      !normalizedPattern.includes("@") &&
      normalizedPattern !== "unknown"
    );
  }

  return normalizedPattern.length <= MAX_CLEAN_QUERY_LENGTH;
}

/**
 * Builds the Gmail `users.settings.filters` request payload that automatically
 * sends matching future emails directly to Trash and removes them from Inbox.
 */
export function buildGmailBlockFilterPayload(
  type: "BLOCK_SENDER" | "BLOCK_DOMAIN",
  pattern: string,
): GmailFilterPayload {
  const normalizedPattern = normalizeAutoCleanPattern(type, pattern);
  if (!isValidAutoCleanPattern(type, normalizedPattern)) {
    throw new Error(`Invalid ${type} filter pattern.`);
  }

  return {
    criteria: {
      from: type === "BLOCK_DOMAIN" ? `@${normalizedPattern}` : normalizedPattern,
    },
    action: {
      addLabelIds: ["TRASH"],
      removeLabelIds: ["INBOX"],
    },
  };
}

/**
 * Validates and normalizes an incoming Auto-Clean rule creation payload.
 */
export function validateAutoCleanRuleInput(
  body: unknown,
): AutoCleanRuleValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const candidate = body as Record<string, unknown>;
  if (!isAutoCleanRuleType(candidate.type)) {
    return {
      ok: false,
      error: "type must be one of BLOCK_SENDER, BLOCK_DOMAIN, or CLEAN_QUERY.",
    };
  }

  if (typeof candidate.pattern !== "string") {
    return { ok: false, error: "pattern must be a non-empty string." };
  }

  const normalizedPattern = normalizeAutoCleanPattern(
    candidate.type,
    candidate.pattern,
  );
  if (!isValidAutoCleanPattern(candidate.type, normalizedPattern)) {
    return {
      ok: false,
      error: `Invalid pattern for rule type ${candidate.type}.`,
    };
  }

  if (typeof candidate.label !== "string") {
    return { ok: false, error: "label must be a non-empty string." };
  }

  const normalizedLabel = candidate.label.trim().replace(/\s+/g, " ");
  if (
    normalizedLabel.length === 0 ||
    normalizedLabel.length > MAX_RULE_LABEL_LENGTH
  ) {
    return {
      ok: false,
      error: `label must be between 1 and ${MAX_RULE_LABEL_LENGTH} characters.`,
    };
  }

  const data: ValidatedAutoCleanRuleInput = {
    type: candidate.type,
    pattern: normalizedPattern,
    label: normalizedLabel,
  };

  if (candidate.action !== undefined) {
    if (!isAutoCleanRuleAction(candidate.action)) {
      return {
        ok: false,
        error: 'action must be one of "trash", "archive", or "mark_read".',
      };
    }
    data.action = candidate.action;
  }

  if (candidate.schedule !== undefined) {
    if (!isAutoCleanRuleSchedule(candidate.schedule)) {
      return {
        ok: false,
        error: 'schedule must be one of "manual", "daily", or "weekly".',
      };
    }
    data.schedule = candidate.schedule;
  }

  if (candidate.isEnabled !== undefined) {
    if (typeof candidate.isEnabled !== "boolean") {
      return {
        ok: false,
        error: "isEnabled must be a boolean.",
      };
    }
    data.isEnabled = candidate.isEnabled;
  }

  return {
    ok: true,
    data,
  };
}

/**
 * Validates an incoming Auto-Clean rule update payload (`PATCH /api/gmail/filters`).
 */
export function validateAutoCleanRuleUpdate(
  body: unknown,
): AutoCleanRuleUpdateValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const candidate = body as Record<string, unknown>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  if (!id) {
    return { ok: false, error: "id must be a non-empty string." };
  }

  const data: ValidatedAutoCleanRuleUpdate = { id };
  let hasUpdateField = false;

  if (candidate.isEnabled !== undefined) {
    if (typeof candidate.isEnabled !== "boolean") {
      return { ok: false, error: "isEnabled must be a boolean." };
    }
    data.isEnabled = candidate.isEnabled;
    hasUpdateField = true;
  }

  if (candidate.schedule !== undefined) {
    if (!isAutoCleanRuleSchedule(candidate.schedule)) {
      return {
        ok: false,
        error: 'schedule must be one of "manual", "daily", or "weekly".',
      };
    }
    data.schedule = candidate.schedule;
    hasUpdateField = true;
  }

  if (candidate.action !== undefined) {
    if (!isAutoCleanRuleAction(candidate.action)) {
      return {
        ok: false,
        error: 'action must be one of "trash", "archive", or "mark_read".',
      };
    }
    data.action = candidate.action;
    hasUpdateField = true;
  }

  if (!hasUpdateField) {
    return {
      ok: false,
      error: "At least one of isEnabled, schedule, or action must be provided.",
    };
  }

  return { ok: true, data };
}

/**
 * Validates an incoming Auto-Clean dry-run preview payload (`POST /api/gmail/auto-clean/preview`).
 */
export function validateAutoCleanPreviewInput(
  body: unknown,
): AutoCleanPreviewValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const candidate = body as Record<string, unknown>;
  if (typeof candidate.query !== "string") {
    return { ok: false, error: "query must be a non-empty string." };
  }

  const normalizedQuery = normalizeAutoCleanPattern("CLEAN_QUERY", candidate.query);
  if (!isValidAutoCleanPattern("CLEAN_QUERY", normalizedQuery)) {
    return {
      ok: false,
      error: `query must be between 1 and ${MAX_CLEAN_QUERY_LENGTH} characters.`,
    };
  }

  return {
    ok: true,
    data: {
      query: normalizedQuery,
    },
  };
}

export interface AutoCleanRuleBuilderInput {
  preset?: GmailPresetFilter;
  olderThan?: GmailAgeFilter;
  unreadOnly?: boolean;
  hasAttachment?: boolean;
}

export interface AutoCleanBuilderQueryResult {
  query: string;
  label: string;
}

const BUILDER_PRESET_LABELS: Record<GmailPresetFilter, string> = {
  all: "All mail",
  promotions: "Promotions",
  social: "Social",
  updates: "Updates",
  spam: "Spam",
};

/**
 * Compiles visual rule builder fields (`preset`, `olderThan`, `unreadOnly`,
 * `hasAttachment`) into a normalized Gmail search query and a human-readable
 * rule label. Returns `null` when no filter condition is selected.
 */
export function buildAutoCleanQueryFromBuilder(
  input: AutoCleanRuleBuilderInput,
): AutoCleanBuilderQueryResult | null {
  const preset: GmailPresetFilter = input.preset ?? "all";
  const olderThan: GmailAgeFilter = input.olderThan ?? "any";
  const unreadOnly = input.unreadOnly === true;
  const hasAttachment = input.hasAttachment === true;

  const tokens: string[] = [];
  if (preset === "promotions") {
    tokens.push("category:promotions");
  } else if (preset === "social") {
    tokens.push("category:social");
  } else if (preset === "updates") {
    tokens.push("category:updates");
  } else if (preset === "spam") {
    tokens.push("in:spam");
  }

  if (olderThan !== "any") {
    tokens.push(`older_than:${olderThan}`);
  }
  if (hasAttachment) {
    tokens.push("has:attachment");
  }
  if (unreadOnly) {
    tokens.push("is:unread");
  }

  const query = normalizeAutoCleanPattern("CLEAN_QUERY", tokens.join(" "));
  if (!isValidAutoCleanPattern("CLEAN_QUERY", query)) {
    return null;
  }

  const labelParts: string[] = [BUILDER_PRESET_LABELS[preset]];
  if (olderThan !== "any") {
    labelParts.push(`> ${olderThan}`);
  }
  if (unreadOnly) {
    labelParts.push("unread only");
  }
  if (hasAttachment) {
    labelParts.push("with attachments");
  }

  return {
    query,
    label: labelParts.join(" • ").slice(0, MAX_RULE_LABEL_LENGTH),
  };
}
