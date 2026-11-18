"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import type { PassStatus } from "@prisma/client";
import {
  AlertTriangle,
  Archive,
  Ban,
  BookmarkPlus,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  FolderTree,
  Globe,
  History,
  Inbox,
  Info,
  LayoutGrid,
  List,
  Loader2,
  LogOut,
  Mail,
  MailOpen,
  MailX,
  MoreHorizontal,
  Paperclip,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import {
  ThemeLangControls,
  useAppPreferences,
} from "@/components/app-preferences-provider";
import {
  PrivacySettingsModal,
  PrivacyTrustBadgeStrip,
} from "@/components/privacy-trust-panel";
import { AccessibleDialog } from "@/components/ui/accessible-dialog";
import { Button } from "@/components/ui/button";
import {
  getAppTranslations,
  getIntlLocale,
  type AppTranslations,
} from "@/lib/i18n";
import type {
  AutoCleanQueryPreviewResult,
  MessageDetailResult,
  MessagePreviewItem,
  UnsubscribeResult,
} from "@/lib/gmail";
import type { CleanAction } from "@/lib/gmail-clean";
import {
  AUTO_CLEAN_PRESETS,
  AUTO_CLEAN_RULE_ACTIONS,
  AUTO_CLEAN_RULE_SCHEDULES,
  buildAutoCleanQueryFromBuilder,
  isValidAutoCleanPattern,
  normalizeAutoCleanPattern,
  type AutoCleanRuleAction,
  type AutoCleanRuleRecord,
  type AutoCleanRuleSchedule,
  type AutoCleanRuleStatus,
  type AutoCleanRuleTypeValue,
} from "@/lib/gmail-filters";
import {
  buildGmailSearchQuery,
  mergeSenderGroups,
  type GmailAgeFilter,
  type GmailPresetFilter,
  type GmailSizeFilter,
  type SenderGroup,
} from "@/lib/gmail-grouping";
import { parseRetryAfterSeconds } from "@/lib/gmail-quota";
import {
  summarizeBulkUnsubscribeResults,
  type BulkUnsubscribeItemOutcome,
} from "@/lib/gmail-unsubscribe";
import {
  extractSenderHostFromEmail,
  findMatchingProtectionRule,
  hasProtectionRule,
  isValidProtectionPattern,
  normalizeProtectionPattern,
  partitionSendersByProtection,
  type ProtectionRuleRecord,
  type ProtectionScopeType,
} from "@/lib/keep-safe";
import {
  buildSenderBrandTree,
  sortSenderGroups,
  type SenderBrandNode,
  type SenderDomainNode,
  type SenderSortBy,
} from "@/lib/sender-tree";
import {
  INITIAL_VISIBLE_ITEMS,
  VISIBLE_ITEMS_STEP,
  filterBrandsByQuery,
  filterSendersByQuery,
  partitionSenderListView,
} from "@/lib/sender-list-view";
import type { CleanHistoryEntry } from "@/lib/clean-history";

export interface DashboardUser {
  name: string | null;
  email: string | null;
  passStatus: PassStatus;
  passExpiresAt: string | null;
  reclaimedBytes: number;
  cleanedMessagesCount: number;
}

interface MailCleanerDashboardProps {
  user: DashboardUser;
  initialProtectedRules?: ProtectionRuleRecord[];
  initialAutoCleanRules?: AutoCleanRuleRecord[];
  initialCleanHistory?: CleanHistoryEntry[];
  onSignOut: () => Promise<void>;
}

interface SendersApiResponse {
  query: string;
  includeSpamTrash: boolean;
  scannedMessages: number;
  resultSizeEstimate: number;
  nextPageToken: string | null;
  senders: SenderGroup[];
  error?: string;
  code?: string;
  retryAfterSeconds?: number;
}

interface ScanFilterParams {
  preset: GmailPresetFilter;
  olderThan: GmailAgeFilter;
  largerThan: GmailSizeFilter;
  hasAttachment: boolean;
  unreadOnly: boolean;
  search: string;
}

interface CleanApiResponse {
  action: CleanAction;
  processedCount: number;
  batches: number;
  skippedProtectedCount?: number;
  reclaimedBytesAdded?: number;
  totalReclaimedBytes?: number;
  totalCleanedMessagesCount?: number;
  error?: string;
}

interface PendingPermanentDelete {
  senders: SenderGroup[];
  messageIds: string[];
  totalSizeBytes: number;
  skippedProtectedCount: number;
}

interface PreviewTarget {
  title: string;
  subtitle: string;
  senders: SenderGroup[];
  messageIds: string[];
  messageCount: number;
  totalSizeBytes: number;
}

interface PreviewApiResponse {
  messages?: MessagePreviewItem[];
  error?: string;
}

type MessageDetailApiResponse = MessageDetailResult & {
  error?: string;
};

type SenderUnsubscribeState =
  | { status: "loading" }
  | {
      status: "unsubscribed";
      method: "one-click-http" | "mailto";
      target: string;
    }
  | {
      status: "action_required";
      method: "header-link" | "html-link";
      url: string;
    }
  | { status: "not_found" };

type UnsubscribeApiResponse = UnsubscribeResult & {
  error?: string;
};

interface FeedbackBanner {
  variant: "success" | "info";
  title: string;
  message: string;
  canUndo?: boolean;
}

interface TrashUndoSnapshot {
  senders: SenderGroup[];
  messageIds: string[];
  reclaimedBytesAdded: number;
  removedMessageCount: number;
}

const ONBOARDING_DISMISSED_KEY = "mailcleaner-onboarding-dismissed";
const ONBOARDING_CHANGE_EVENT = "mailcleaner-onboarding-change";

function subscribeOnboardingDismissed(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(ONBOARDING_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(ONBOARDING_CHANGE_EVENT, onStoreChange);
  };
}

function getOnboardingDismissedSnapshot(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true";
  } catch {
    return true;
  }
}

function getOnboardingDismissedServerSnapshot(): boolean {
  return true;
}

function useOnboardingDismissed(): [boolean, () => void] {
  const isDismissed = useSyncExternalStore(
    subscribeOnboardingDismissed,
    getOnboardingDismissedSnapshot,
    getOnboardingDismissedServerSnapshot,
  );

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true");
    } catch {
      // Ignore storage write errors in restricted browsing modes.
    }
    window.dispatchEvent(new Event(ONBOARDING_CHANGE_EVENT));
  }, []);

  return [isDismissed, dismiss];
}

function AnimatedScanCount({
  value,
  intlLocale,
}: {
  value: number;
  intlLocale: string;
}) {
  const [displayValue, setDisplayValue] = useState<number>(value);

  useEffect(() => {
    if (displayValue === value) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setDisplayValue((prev) => {
        if (prev === value) {
          return prev;
        }
        if (value < prev) {
          return value;
        }
        const diff = value - prev;
        const step = diff <= 250 ? 1 : Math.ceil(diff / 120);
        return Math.min(value, prev + step);
      });
    }, 22);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [displayValue, value]);

  return <>{displayValue.toLocaleString(intlLocale)}</>;
}

function isSafeExternalHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const PASS_STATUS_STYLES: Record<PassStatus, string> = {
  TRIAL:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  ACTIVE:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  EXPIRED: "border-destructive/30 bg-destructive/10 text-destructive",
};

const PRESET_VALUES: readonly GmailPresetFilter[] = [
  "all",
  "promotions",
  "social",
  "updates",
  "spam",
];

const AGE_VALUES: readonly GmailAgeFilter[] = ["any", "3m", "6m", "1y", "2y"];

const SIZE_VALUES: readonly GmailSizeFilter[] = ["any", "1M", "5M", "10M"];

const SORT_VALUES: readonly SenderSortBy[] = ["size", "count", "domains"];

const PREVIEW_MAX_MESSAGES = 30;

const FULL_SCAN_MAX_MESSAGES = 200_000;
const SCAN_PAGE_SIZE = 100;
const INTER_PAGE_DELAY_MS = 100;
const MAX_CONSECUTIVE_EMPTY_PAGES = 5;

class ScanRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "ScanRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(
  isoDate: string | null,
  intlLocale: string,
  unknownLabel: string,
): string {
  if (!isoDate) {
    return unknownLabel;
  }
  const timestamp = Date.parse(isoDate);
  if (Number.isNaN(timestamp)) {
    return unknownLabel;
  }
  return new Intl.DateTimeFormat(intlLocale, {
    dateStyle: "medium",
  }).format(new Date(timestamp));
}

function formatDateTime(
  isoDate: string | null,
  intlLocale: string,
  unknownLabel: string,
): string {
  if (!isoDate) {
    return unknownLabel;
  }
  const timestamp = Date.parse(isoDate);
  if (Number.isNaN(timestamp)) {
    return unknownLabel;
  }
  return new Intl.DateTimeFormat(intlLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatPassExpiry(
  isoDate: string | null,
  intlLocale: string,
): string | null {
  if (!isoDate) {
    return null;
  }
  const timestamp = Date.parse(isoDate);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return new Intl.DateTimeFormat(intlLocale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function collectUniqueMessageIds(targetSenders: SenderGroup[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const sender of targetSenders) {
    for (const id of sender.messageIds) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

type ResultsViewMode = "tree" | "flat" | "cards";

function getDomainExpansionKey(brandKey: string, host: string): string {
  return `${brandKey}::${host}`;
}

const BRAND_AVATAR_PALETTES = [
  "border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:border-emerald-400/35 dark:bg-emerald-400/15 dark:text-emerald-300",
  "border-sky-500/35 bg-sky-500/15 text-sky-700 dark:border-sky-400/35 dark:bg-sky-400/15 dark:text-sky-300",
  "border-violet-500/35 bg-violet-500/15 text-violet-700 dark:border-violet-400/35 dark:bg-violet-400/15 dark:text-violet-300",
  "border-amber-500/35 bg-amber-500/15 text-amber-800 dark:border-amber-400/35 dark:bg-amber-400/15 dark:text-amber-300",
  "border-rose-500/35 bg-rose-500/15 text-rose-700 dark:border-rose-400/35 dark:bg-rose-400/15 dark:text-rose-300",
  "border-teal-500/35 bg-teal-500/15 text-teal-700 dark:border-teal-400/35 dark:bg-teal-400/15 dark:text-teal-300",
  "border-indigo-500/35 bg-indigo-500/15 text-indigo-700 dark:border-indigo-400/35 dark:bg-indigo-400/15 dark:text-indigo-300",
  "border-orange-500/35 bg-orange-500/15 text-orange-800 dark:border-orange-400/35 dark:bg-orange-400/15 dark:text-orange-300",
] as const;

function getBrandAvatarMeta(
  brandLabel: string,
  brandKey: string,
): { initials: string; paletteClass: string } {
  const source = (brandLabel || brandKey || "?").trim();
  const words = source
    .split(/[\s._-]+/)
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean);

  let initials = "?";
  if (words.length >= 2) {
    initials = `${words[0][0]}${words[1][0]}`.toUpperCase();
  } else if (words.length === 1) {
    initials = words[0].slice(0, 2).toUpperCase();
  } else {
    initials = source.slice(0, 2).toUpperCase() || "?";
  }

  const hashInput = (brandKey || brandLabel || "brand").toLowerCase();
  let hash = 0;
  for (let index = 0; index < hashInput.length; index += 1) {
    hash = (hash * 31 + hashInput.charCodeAt(index)) >>> 0;
  }

  const paletteClass =
    BRAND_AVATAR_PALETTES[hash % BRAND_AVATAR_PALETTES.length];
  return { initials, paletteClass };
}

function getShareBarScale(partBytes: number, totalBytes: number): number {
  if (!Number.isFinite(partBytes) || !Number.isFinite(totalBytes)) {
    return 0;
  }
  if (partBytes <= 0 || totalBytes <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0.03, partBytes / totalBytes));
}

interface TriStateCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}

function TriStateCheckbox({
  checked,
  indeterminate = false,
  onChange,
  disabled,
  ariaLabel,
  className,
}: TriStateCheckboxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate && !checked;
    }
  }, [indeterminate, checked]);

  return (
    <span className="inline-flex size-6 shrink-0 items-center justify-center">
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel}
        className={className}
      />
    </span>
  );
}

function getKeepSafeRuleKey(scope: ProtectionScopeType, pattern: string): string {
  return `${scope}:${normalizeProtectionPattern(scope, pattern)}`;
}

function getAutoCleanRuleKey(
  type: AutoCleanRuleTypeValue,
  pattern: string,
): string {
  return `${type}:${normalizeAutoCleanPattern(type, pattern)}`;
}

function findAutoCleanRule(
  rules: readonly AutoCleanRuleRecord[],
  type: AutoCleanRuleTypeValue,
  pattern: string,
): AutoCleanRuleRecord | undefined {
  const normalizedTarget = normalizeAutoCleanPattern(type, pattern);
  if (!normalizedTarget) {
    return undefined;
  }

  return rules.find(
    (rule) =>
      rule.type === type &&
      normalizeAutoCleanPattern(rule.type, rule.pattern) === normalizedTarget,
  );
}

function buildCurrentFilterAutoCleanRule(
  params: ScanFilterParams,
  t: AppTranslations["dashboard"],
): {
  pattern: string;
  label: string;
} | null {
  const { q } = buildGmailSearchQuery(params);
  if (!q) {
    return null;
  }

  const labelParts: string[] = [t.filters.presets[params.preset]];

  if (params.olderThan !== "any") {
    labelParts.push(`> ${params.olderThan}`);
  }
  if (params.largerThan !== "any") {
    labelParts.push(`>= ${params.largerThan}`);
  }
  if (params.hasAttachment) {
    labelParts.push(t.autoClean.currentFilterWithAttachments);
  }
  if (params.unreadOnly) {
    labelParts.push(t.autoClean.currentFilterUnreadOnly);
  }
  if (params.search.trim().length > 0) {
    labelParts.push(`"${params.search.trim()}"`);
  }

  return {
    pattern: q,
    label: t.autoClean.currentFilterRuleLabel(labelParts),
  };
}

function BlockedInGmailBadge({
  label,
  title,
}: {
  label: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-300"
    >
      <Ban className="size-3" />
      {label}
    </span>
  );
}

interface RowMoreActionsMenuProps {
  label: string;
  children: (closeMenu: () => void) => React.ReactNode;
}

/** Accessible row overflow menu with Escape and outside-click dismissal. */
function RowMoreActionsMenu({ label, children }: RowMoreActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={label}
        title={label}
        onClick={() => setIsOpen((prev) => !prev)}
        className="mc-btn-press size-7 p-0 text-muted-foreground hover:text-foreground"
      >
        <MoreHorizontal className="size-4" />
      </Button>

      {isOpen ? (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {children(() => setIsOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

interface BlockAutoTrashMenuItemProps {
  type: "BLOCK_SENDER" | "BLOCK_DOMAIN";
  pattern: string;
  isBlocked: boolean;
  isProtected: boolean;
  isPending: boolean;
  disabled?: boolean;
  t: AppTranslations["dashboard"]["tree"];
  onBlock: () => void;
  onAfterSelect: () => void;
}

function BlockAutoTrashMenuItem({
  type,
  pattern,
  isBlocked,
  isProtected,
  isPending,
  disabled = false,
  t,
  onBlock,
  onAfterSelect,
}: BlockAutoTrashMenuItemProps) {
  const normalizedPattern = normalizeAutoCleanPattern(type, pattern);
  const canBlock = isValidAutoCleanPattern(type, normalizedPattern);

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled || isProtected || isBlocked || isPending || !canBlock}
      title={
        isProtected
          ? t.blockProtectedTooltip
          : isBlocked
            ? t.blockAlreadyTooltip
            : t.blockActionTooltip
      }
      onClick={() => {
        onAfterSelect();
        onBlock();
      }}
      className="flex min-h-7 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
      ) : isBlocked ? (
        <CheckCircle2 className="size-3.5 shrink-0 text-amber-600 dark:text-amber-300" />
      ) : (
        <Ban className="size-3.5 shrink-0" />
      )}
      <span>
        {isBlocked ? t.blockedInGmailLabel : t.blockAutoTrashLabel}
      </span>
    </button>
  );
}

interface KeepSafeBadgeProps {
  label: string;
  title?: string;
}

function KeepSafeBadge({ label, title }: KeepSafeBadgeProps) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
    >
      <ShieldCheck className="size-3" />
      {label}
    </span>
  );
}

interface KeepSafeMenuItemProps {
  scope: ProtectionScopeType;
  pattern: string;
  label: string;
  isDirectProtected: boolean;
  isPending: boolean;
  disabled?: boolean;
  t: AppTranslations["dashboard"]["tree"];
  onToggle: (
    scope: ProtectionScopeType,
    pattern: string,
    label: string,
  ) => void;
  onAfterSelect: () => void;
}

function KeepSafeMenuItem({
  scope,
  pattern,
  label,
  isDirectProtected,
  isPending,
  disabled = false,
  t,
  onToggle,
  onAfterSelect,
}: KeepSafeMenuItemProps) {
  const normalizedPattern = normalizeProtectionPattern(scope, pattern);
  const canToggle = isValidProtectionPattern(scope, normalizedPattern);

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled || isPending || !canToggle}
      onClick={() => {
        onAfterSelect();
        onToggle(scope, normalizedPattern, label);
      }}
      className={`flex min-h-7 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 ${
        isDirectProtected
          ? "text-emerald-700 dark:text-emerald-300"
          : ""
      }`}
    >
      {isPending ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
      ) : (
        <ShieldCheck className="size-3.5 shrink-0" />
      )}
      <span>{isDirectProtected ? t.protectedLabel : t.keepSafeLabel}</span>
    </button>
  );
}

interface EmailPreviewModalProps {
  target: PreviewTarget;
  protectedRules: ProtectionRuleRecord[];
  isBusy: boolean;
  isPermanentDeleteOpen: boolean;
  t: AppTranslations["dashboard"];
  intlLocale: string;
  onClose: () => void;
  onMoveToTrash: (targetSenders: SenderGroup[]) => void;
  onDeletePermanently: (targetSenders: SenderGroup[]) => void;
}

function EmailPreviewModal({
  target,
  protectedRules,
  isBusy,
  isPermanentDeleteOpen,
  t,
  intlLocale,
  onClose,
  onMoveToTrash,
  onDeletePermanently,
}: EmailPreviewModalProps) {
  const [previews, setPreviews] = useState<MessagePreviewItem[]>([]);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsById, setDetailsById] = useState<
    Record<string, MessageDetailResult>
  >({});
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [bodyViewMode, setBodyViewMode] = useState<"formatted" | "plain">(
    "formatted",
  );

  const detailsCacheRef = useRef<Record<string, MessageDetailResult>>({});
  const detailAbortRef = useRef<AbortController | null>(null);

  const loadMessageDetail = useCallback(
    async (messageId: string, parentSignal?: AbortSignal) => {
      const cached = detailsCacheRef.current[messageId];
      if (cached) {
        setSelectedId(messageId);
        setDetailError(null);
        setIsLoadingDetail(false);
        return;
      }

      if (detailAbortRef.current) {
        detailAbortRef.current.abort();
      }

      const controller = new AbortController();
      detailAbortRef.current = controller;

      const handleParentAbort = () => controller.abort();
      if (parentSignal) {
        if (parentSignal.aborted) {
          controller.abort();
          return;
        }
        parentSignal.addEventListener("abort", handleParentAbort, {
          once: true,
        });
      }

      setSelectedId(messageId);
      setIsLoadingDetail(true);
      setDetailError(null);

      try {
        const response = await fetch(
          `/api/gmail/messages/${encodeURIComponent(messageId)}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          },
        );

        const payload = (await response.json()) as MessageDetailApiResponse;
        if (!response.ok) {
          throw new Error(
            payload.error || t.errors.failedLoadMessageDetail(response.status),
          );
        }

        if (controller.signal.aborted) {
          return;
        }

        detailsCacheRef.current[messageId] = payload;
        setDetailsById((prev) => ({
          ...prev,
          [messageId]: payload,
        }));
      } catch (error) {
        const isAbort =
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError") ||
          (error instanceof Error && error.name === "AbortError");
        if (!isAbort) {
          setDetailError(
            error instanceof Error
              ? error.message
              : t.errors.failedLoadMessageDetailFallback,
          );
        }
      } finally {
        if (parentSignal) {
          parentSignal.removeEventListener("abort", handleParentAbort);
        }
        if (detailAbortRef.current === controller) {
          setIsLoadingDetail(false);
          detailAbortRef.current = null;
        }
      }
    },
    [t.errors],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function fetchPreviewList() {
      try {
        const response = await fetch("/api/gmail/messages/preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messageIds: target.messageIds,
            limit: PREVIEW_MAX_MESSAGES,
          }),
          cache: "no-store",
          signal: controller.signal,
        });

        const payload = (await response.json()) as PreviewApiResponse;
        if (!response.ok) {
          throw new Error(
            payload.error || t.errors.failedLoadPreviews(response.status),
          );
        }

        if (controller.signal.aborted) {
          return;
        }

        const loaded = Array.isArray(payload.messages) ? payload.messages : [];
        setPreviews(loaded);
        setIsLoadingList(false);

        if (loaded.length > 0) {
          await loadMessageDetail(loaded[0].id, controller.signal);
        }
      } catch (error) {
        const isAbort =
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError") ||
          (error instanceof Error && error.name === "AbortError");
        if (!isAbort) {
          setListError(
            error instanceof Error
              ? error.message
              : t.errors.failedLoadPreviewsFallback,
          );
          setIsLoadingList(false);
        }
      }
    }

    void fetchPreviewList();

    return () => {
      controller.abort();
      if (detailAbortRef.current) {
        detailAbortRef.current.abort();
        detailAbortRef.current = null;
      }
    };
  }, [target.messageIds, loadMessageDetail, t.errors]);

  const { cleanable: cleanableTargetSenders, protectedSenders: protectedTargetSenders } =
    useMemo(
      () => partitionSendersByProtection(target.senders, protectedRules),
      [target.senders, protectedRules],
    );
  const selectedDetail = selectedId ? (detailsById[selectedId] ?? null) : null;
  const hasHtmlBody = Boolean(selectedDetail?.htmlBody);
  const effectiveViewMode =
    bodyViewMode === "formatted" && hasHtmlBody ? "formatted" : "plain";

  return (
    <AccessibleDialog
      open
      onClose={onClose}
      ariaLabelledBy="email-preview-title"
      closeOnEscape={!isPermanentDeleteOpen}
      closeOnBackdropClick={!isPermanentDeleteOpen}
      zIndexClassName="z-40"
      overlayClassName="p-3 sm:p-6"
      contentClassName="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl shadow-black/60"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="email-preview-title"
                className="truncate text-base font-semibold"
              >
                {target.title}
              </h2>
              <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
                {target.subtitle}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>
                {t.tree.emailCount(
                  target.messageCount,
                  target.messageCount.toLocaleString(intlLocale),
                )}
              </span>
              <span className="font-medium text-foreground">
                {formatBytes(target.totalSizeBytes)}
              </span>
              {target.messageIds.length > PREVIEW_MAX_MESSAGES ? (
                <span>
                  {t.previewModal.showingUpTo(
                    PREVIEW_MAX_MESSAGES,
                    target.messageIds.length.toLocaleString(intlLocale),
                  )}
                </span>
              ) : null}
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label={t.previewModal.closeAriaLabel}
            className="shrink-0"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-12">
          <div className="min-h-[180px] overflow-y-auto border-b border-border md:col-span-4 md:min-h-0 md:border-r md:border-b-0">
            {isLoadingList ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                <span>{t.previewModal.loadingList}</span>
              </div>
            ) : listError ? (
              <div className="p-4 text-xs text-destructive">{listError}</div>
            ) : previews.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {t.previewModal.emptyList}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {previews.map((item) => {
                  const isActive = selectedId === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => void loadMessageDetail(item.id)}
                        className={`w-full space-y-1 px-4 py-3 text-left transition-colors ${
                          isActive
                            ? "bg-muted"
                            : "hover:bg-muted/40"
                        }`}
                      >
                        <p className="truncate text-sm font-medium text-foreground">
                          {item.subject || t.tree.noSubject}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.senderName}
                          {item.senderName !== item.senderEmail
                            ? ` <${item.senderEmail}>`
                            : ""}
                        </p>
                        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span>
                            {formatDate(
                              item.date,
                              intlLocale,
                              t.tree.unknownDate,
                            )}
                          </span>
                          <span className="font-medium text-foreground">
                            {formatBytes(item.sizeBytes)}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden md:col-span-8">
            {!selectedId ? (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
                {isLoadingList
                  ? t.previewModal.loadingEmails
                  : t.previewModal.selectEmailPrompt}
              </div>
            ) : isLoadingDetail && !selectedDetail ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                <span>{t.previewModal.loadingContent}</span>
              </div>
            ) : detailError && !selectedDetail ? (
              <div className="p-6 text-xs text-destructive">{detailError}</div>
            ) : selectedDetail ? (
              <>
                <div className="flex flex-col gap-3 border-b border-border bg-muted/20 px-5 py-3.5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1 text-xs">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {selectedDetail.subject || t.tree.noSubject}
                    </p>
                    <p className="truncate text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {t.previewModal.fromLabel}
                      </span>{" "}
                      {selectedDetail.from || t.previewModal.unknownSender}
                    </p>
                    {selectedDetail.to ? (
                      <p className="truncate text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {t.previewModal.toLabel}
                        </span>{" "}
                        {selectedDetail.to}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {t.previewModal.dateLabel}
                      </span>{" "}
                      {formatDateTime(
                        selectedDetail.date,
                        intlLocale,
                        t.tree.unknownDate,
                      )}{" "}
                      • {formatBytes(selectedDetail.sizeEstimate)}
                    </p>
                  </div>

                  <div
                    role="group"
                    aria-label={t.previewModal.bodyFormatAriaLabel}
                    className="inline-flex shrink-0 items-center rounded-lg border border-border bg-background p-0.5"
                  >
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        effectiveViewMode === "formatted" ? "default" : "ghost"
                      }
                      disabled={!hasHtmlBody}
                      onClick={() => setBodyViewMode("formatted")}
                      className="h-7 px-2.5 text-xs"
                    >
                      {t.previewModal.formatted}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        effectiveViewMode === "plain" ? "default" : "ghost"
                      }
                      onClick={() => setBodyViewMode("plain")}
                      className="h-7 px-2.5 text-xs"
                    >
                      {t.previewModal.plainText}
                    </Button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto p-4">
                  {effectiveViewMode === "formatted" &&
                  selectedDetail.htmlBody ? (
                    <iframe
                      sandbox=""
                      title={selectedDetail.subject || t.previewModal.iframeTitle}
                      srcDoc={selectedDetail.htmlBody}
                      className="h-full min-h-[320px] w-full rounded-lg border border-border bg-white"
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/20 p-4 font-sans text-sm leading-relaxed text-foreground">
                      {selectedDetail.textBody ||
                        selectedDetail.snippet ||
                        t.previewModal.noReadableContent}
                    </pre>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {t.previewModal.sendersInScope(
                target.senders.length,
                target.senders.length.toLocaleString(intlLocale),
              )}
            </span>
            {protectedTargetSenders.length > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="size-3" />
                {t.previewModal.protectedKeptSafe(protectedTargetSenders.length)}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {t.previewModal.close}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy || cleanableTargetSenders.length === 0}
              onClick={() => onMoveToTrash(target.senders)}
            >
              <Trash2 className="size-3.5" />
              {t.tree.moveToTrash}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isBusy || cleanableTargetSenders.length === 0}
              onClick={() => onDeletePermanently(target.senders)}
            >
              <ShieldAlert className="size-3.5" />
              {t.tree.deletePermanently}
            </Button>
          </div>
        </div>
    </AccessibleDialog>
  );
}

interface SenderRowProps {
  sender: SenderGroup;
  isSelected: boolean;
  isBusy: boolean;
  isCleaning: boolean;
  indented?: boolean;
  protectedRules: ProtectionRuleRecord[];
  autoCleanRules: AutoCleanRuleRecord[];
  pendingRuleKey: string | null;
  pendingAutoCleanKey: string | null;
  unsubscribeState?: SenderUnsubscribeState;
  t: AppTranslations["dashboard"]["tree"];
  intlLocale: string;
  onToggleSelect: (senderEmail: string) => void;
  onToggleKeepSafe: (
    scope: ProtectionScopeType,
    pattern: string,
    label: string,
  ) => void;
  onBlockSender: (sender: SenderGroup) => void;
  onViewEmails: (sender: SenderGroup) => void;
  onUnsubscribe: (sender: SenderGroup) => void;
  onMoveToTrash: (sender: SenderGroup) => void;
  onArchive: (sender: SenderGroup) => void;
  onMarkAsRead: (sender: SenderGroup) => void;
  onDeletePermanently: (sender: SenderGroup) => void;
}

function SenderRow({
  sender,
  isSelected,
  isBusy,
  isCleaning,
  indented = false,
  protectedRules,
  autoCleanRules,
  pendingRuleKey,
  pendingAutoCleanKey,
  unsubscribeState,
  t,
  intlLocale,
  onToggleSelect,
  onToggleKeepSafe,
  onBlockSender,
  onViewEmails,
  onUnsubscribe,
  onMoveToTrash,
  onArchive,
  onMarkAsRead,
  onDeletePermanently,
}: SenderRowProps) {
  const isUnsubscribing = unsubscribeState?.status === "loading";
  const isUnsubscribed = unsubscribeState?.status === "unsubscribed";
  const actionRequiredUrl =
    unsubscribeState?.status === "action_required" &&
    isSafeExternalHttpUrl(unsubscribeState.url)
      ? unsubscribeState.url
      : null;

  const matchingRule = findMatchingProtectionRule(
    sender.senderEmail,
    protectedRules,
  );
  const isProtected = matchingRule !== null;
  const hasDirectSenderRule = hasProtectionRule(
    protectedRules,
    "SENDER",
    sender.senderEmail,
  );
  const isRulePending =
    pendingRuleKey === getKeepSafeRuleKey("SENDER", sender.senderEmail);
  const senderHost = extractSenderHostFromEmail(sender.senderEmail);
  const directBlockSenderRule = findAutoCleanRule(
    autoCleanRules,
    "BLOCK_SENDER",
    sender.senderEmail,
  );
  const parentBlockDomainRule =
    senderHost !== "unknown"
      ? findAutoCleanRule(autoCleanRules, "BLOCK_DOMAIN", senderHost)
      : undefined;
  const isSenderBlocked = Boolean(
    directBlockSenderRule || parentBlockDomainRule,
  );
  const isBlockSenderPending =
    pendingAutoCleanKey ===
    getAutoCleanRuleKey("BLOCK_SENDER", sender.senderEmail);
  const protectionTitle = matchingRule
    ? t.protectedByRuleTitle(matchingRule.scope, matchingRule.pattern)
    : undefined;
  const effectiveSelected = isSelected && !isProtected;

  return (
    <li
      className={`flex flex-col gap-4 border-l-2 transition-colors sm:flex-row sm:items-center sm:justify-between ${
        indented ? "bg-background/60 py-3.5 pr-4 pl-10 sm:pl-16" : "px-4 py-4"
      } ${
        isProtected
          ? "border-l-emerald-500/70 bg-emerald-500/[0.06] ring-1 ring-inset ring-emerald-500/25"
          : effectiveSelected
            ? "border-l-primary/80 bg-primary/[0.04] ring-1 ring-inset ring-primary/25"
            : "border-l-transparent hover:bg-muted/25"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={effectiveSelected}
            onChange={() => onToggleSelect(sender.senderEmail)}
            disabled={isBusy || isProtected}
            aria-label={t.selectSenderAriaLabel(sender.senderEmail)}
            className="size-4 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold">
              {sender.senderName}
            </span>
            {sender.senderName !== sender.senderEmail ? (
              <span className="truncate text-xs text-muted-foreground">
                &lt;{sender.senderEmail}&gt;
              </span>
            ) : null}
            {isProtected ? (
              <KeepSafeBadge label={t.keepSafeLabel} title={protectionTitle} />
            ) : null}
            {isSenderBlocked ? (
              <BlockedInGmailBadge
                label={t.blockedInGmailLabel}
                title={
                  directBlockSenderRule
                    ? t.blockedInGmailDirectTitle(directBlockSenderRule.pattern)
                    : t.blockedInGmailDomainTitle(
                        parentBlockDomainRule?.pattern ?? senderHost,
                      )
                }
              />
            ) : null}
            {isUnsubscribed ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-3" />
                {unsubscribeState.method === "one-click-http"
                  ? t.unsubscribedOneClick
                  : t.unsubscribedEmailSent}
              </span>
            ) : sender.hasUnsubscribeHeader ? (
              <span className="inline-flex items-center rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                {t.unsubscribeAvailable}
              </span>
            ) : null}
            {unsubscribeState?.status === "not_found" ? (
              <span className="text-[11px] text-muted-foreground">
                {t.noUnsubscribeFound}
              </span>
            ) : null}
          </div>

          <p className="truncate text-xs text-muted-foreground">
            {sender.sampleSubject || t.noSubject}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
            <span>
              {t.latestDate(
                formatDate(sender.latestDate, intlLocale, t.unknownDate),
              )}
            </span>
            <span>
              {t.emailCount(
                sender.messageCount,
                sender.messageCount.toLocaleString(intlLocale),
              )}
            </span>
            <span className="font-medium text-foreground tabular-nums">
              {formatBytes(sender.totalSizeBytes)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-7 sm:pl-0">
        {actionRequiredUrl ? (
          <a
            href={actionRequiredUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-500/20 dark:text-amber-200"
          >
            <ExternalLink className="size-3.5" />
            {t.completeUnsubscribe}
          </a>
        ) : null}

        {!isUnsubscribed ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mc-btn-press"
            disabled={
              isCleaning || isUnsubscribing || sender.messageIds.length === 0
            }
            onClick={() => onUnsubscribe(sender)}
          >
            {isUnsubscribing ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                {t.unsubscribing}
              </>
            ) : (
              <>
                <MailX className="size-3.5" />
                {t.unsubscribe}
              </>
            )}
          </Button>
        ) : null}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mc-btn-press"
          disabled={isCleaning || sender.messageIds.length === 0}
          onClick={() => onViewEmails(sender)}
        >
          <Eye className="size-3.5" />
          {t.viewEmails}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mc-btn-press"
          disabled={isBusy || isProtected}
          onClick={() => onMoveToTrash(sender)}
        >
          <Trash2 className="size-3.5" />
          {t.moveToTrash}
        </Button>

        <RowMoreActionsMenu label={t.moreActionsLabel}>
          {(closeMenu) => (
            <>
              <KeepSafeMenuItem
                scope="SENDER"
                pattern={sender.senderEmail}
                label={sender.senderEmail}
                isDirectProtected={hasDirectSenderRule}
                isPending={isRulePending}
                disabled={isCleaning}
                t={t}
                onToggle={onToggleKeepSafe}
                onAfterSelect={closeMenu}
              />

              <BlockAutoTrashMenuItem
                type="BLOCK_SENDER"
                pattern={sender.senderEmail}
                isBlocked={isSenderBlocked}
                isProtected={isProtected}
                isPending={isBlockSenderPending}
                disabled={isCleaning}
                t={t}
                onBlock={() => onBlockSender(sender)}
                onAfterSelect={closeMenu}
              />

              <button
                type="button"
                role="menuitem"
                disabled={isBusy || isProtected}
                onClick={() => {
                  closeMenu();
                  onArchive(sender);
                }}
                className="flex min-h-7 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Archive className="size-3.5 shrink-0" />
                <span>{t.archive}</span>
              </button>

              <button
                type="button"
                role="menuitem"
                disabled={isBusy || isProtected}
                onClick={() => {
                  closeMenu();
                  onMarkAsRead(sender);
                }}
                className="flex min-h-7 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <MailOpen className="size-3.5 shrink-0" />
                <span>{t.markAsRead}</span>
              </button>

              <button
                type="button"
                role="menuitem"
                disabled={isBusy || isProtected}
                onClick={() => {
                  closeMenu();
                  onDeletePermanently(sender);
                }}
                className="flex min-h-7 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ShieldAlert className="size-3.5 shrink-0" />
                <span>{t.deletePermanently}</span>
              </button>
            </>
          )}
        </RowMoreActionsMenu>
      </div>
    </li>
  );
}

interface DomainTreeRowProps {
  brandKey: string;
  domain: SenderDomainNode;
  totalScannedBytes: number;
  isExpanded: boolean;
  isBusy: boolean;
  isCleaning: boolean;
  selectedEmails: Set<string>;
  protectedRules: ProtectionRuleRecord[];
  autoCleanRules: AutoCleanRuleRecord[];
  pendingRuleKey: string | null;
  pendingAutoCleanKey: string | null;
  unsubscribeStates: Record<string, SenderUnsubscribeState>;
  t: AppTranslations["dashboard"]["tree"];
  intlLocale: string;
  onToggleExpand: (domainKey: string) => void;
  onToggleGroupSelection: (senders: SenderGroup[], shouldSelect: boolean) => void;
  onToggleSenderSelection: (senderEmail: string) => void;
  onToggleKeepSafe: (
    scope: ProtectionScopeType,
    pattern: string,
    label: string,
  ) => void;
  onBlockDomain: (domain: SenderDomainNode) => void;
  onBlockSender: (sender: SenderGroup) => void;
  onViewDomainEmails: (domain: SenderDomainNode) => void;
  onViewSenderEmails: (sender: SenderGroup) => void;
  onUnsubscribe: (sender: SenderGroup) => void;
  onMoveToTrash: (targetSenders: SenderGroup[]) => void;
  onArchive: (targetSenders: SenderGroup[]) => void;
  onMarkAsRead: (targetSenders: SenderGroup[]) => void;
  onDeletePermanently: (targetSenders: SenderGroup[]) => void;
}

function DomainTreeRow({
  brandKey,
  domain,
  totalScannedBytes,
  isExpanded,
  isBusy,
  isCleaning,
  selectedEmails,
  protectedRules,
  autoCleanRules,
  pendingRuleKey,
  pendingAutoCleanKey,
  unsubscribeStates,
  t,
  intlLocale,
  onToggleExpand,
  onToggleGroupSelection,
  onToggleSenderSelection,
  onToggleKeepSafe,
  onBlockDomain,
  onBlockSender,
  onViewDomainEmails,
  onViewSenderEmails,
  onUnsubscribe,
  onMoveToTrash,
  onArchive,
  onMarkAsRead,
  onDeletePermanently,
}: DomainTreeRowProps) {
  const domainKey = getDomainExpansionKey(brandKey, domain.host);
  const { cleanable: cleanableSenders, protectedSenders } = useMemo(
    () => partitionSendersByProtection(domain.senders, protectedRules),
    [domain.senders, protectedRules],
  );
  const hasDirectDomainRule = hasProtectionRule(
    protectedRules,
    "DOMAIN",
    domain.host,
  );
  const hasParentBrandRule = hasProtectionRule(
    protectedRules,
    "BRAND",
    brandKey,
  );
  const isDomainProtected = hasDirectDomainRule || hasParentBrandRule;
  const normalizedDomainPattern = normalizeAutoCleanPattern(
    "BLOCK_DOMAIN",
    domain.host,
  );
  const hasProtectedSenderInDomain = protectedRules.some(
    (rule) =>
      rule.scope === "SENDER" &&
      extractSenderHostFromEmail(rule.pattern) === normalizedDomainPattern,
  );
  const isDomainBlockProtected =
    isDomainProtected || hasProtectedSenderInDomain;
  const blockDomainRule = findAutoCleanRule(
    autoCleanRules,
    "BLOCK_DOMAIN",
    domain.host,
  );
  const isDomainBlocked = Boolean(blockDomainRule);
  const isBlockDomainPending =
    pendingAutoCleanKey === getAutoCleanRuleKey("BLOCK_DOMAIN", domain.host);
  const isRulePending =
    pendingRuleKey === getKeepSafeRuleKey("DOMAIN", domain.host);

  const selectedCount = cleanableSenders.filter((sender) =>
    selectedEmails.has(sender.senderEmail),
  ).length;
  const allDomainSelected =
    cleanableSenders.length > 0 && selectedCount === cleanableSenders.length;
  const someDomainSelected =
    selectedCount > 0 && selectedCount < cleanableSenders.length;
  const domainShareScale = getShareBarScale(
    domain.totalSizeBytes,
    totalScannedBytes,
  );

  return (
    <li className="border-t border-border/70">
      <div
        className={`flex flex-col gap-3 border-l-2 py-3.5 pr-4 pl-6 transition-colors sm:flex-row sm:items-center sm:justify-between sm:pl-10 ${
          isDomainProtected
            ? "border-l-emerald-500/70 bg-emerald-500/[0.06] ring-1 ring-inset ring-emerald-500/25"
            : allDomainSelected
              ? "border-l-primary/80 bg-primary/[0.04] ring-1 ring-inset ring-primary/25"
              : someDomainSelected
                ? "border-l-primary/45 bg-primary/[0.025]"
                : "border-l-transparent bg-muted/15 hover:bg-muted/30"
        }`}
      >
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <button
            type="button"
            onClick={() => onToggleExpand(domainKey)}
            aria-expanded={isExpanded}
            aria-label={
              isExpanded
                ? t.collapseLabel(domain.host)
                : t.expandLabel(domain.host)
            }
            className="mc-btn-press mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight
              className={`size-4 transition-transform duration-200 ${
                isExpanded ? "rotate-90 text-foreground" : ""
              }`}
            />
          </button>

          <TriStateCheckbox
            checked={allDomainSelected}
            indeterminate={someDomainSelected}
            onChange={() =>
              onToggleGroupSelection(cleanableSenders, !allDomainSelected)
            }
            disabled={isBusy || cleanableSenders.length === 0}
            ariaLabel={t.selectCleanableInLabel(domain.host)}
            className="mt-1.5 size-4 shrink-0 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
          />

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex max-w-full flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleExpand(domainKey)}
                className="flex max-w-full items-center gap-2 text-left"
              >
                <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-mono text-xs font-semibold sm:text-sm">
                  {domain.host}
                </span>
              </button>
              {isDomainProtected ? (
                <KeepSafeBadge
                  label={t.keepSafeLabel}
                  title={
                    hasDirectDomainRule
                      ? t.protectedByRuleTitle("DOMAIN", domain.host)
                      : t.protectedByRuleTitle("BRAND", brandKey)
                  }
                />
              ) : null}
              {isDomainBlocked ? (
                <BlockedInGmailBadge
                  label={t.blockedInGmailLabel}
                  title={t.blockedInGmailDirectTitle(
                    `@${blockDomainRule?.pattern ?? domain.host}`,
                  )}
                />
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
              <span>
                {t.senderCount(
                  domain.senders.length,
                  domain.senders.length.toLocaleString(intlLocale),
                )}
              </span>
              {protectedSenders.length > 0 ? (
                <span className="text-emerald-700 dark:text-emerald-300">
                  {t.protectedCount(protectedSenders.length)}
                </span>
              ) : null}
              <span>
                {t.emailCount(
                  domain.messageCount,
                  domain.messageCount.toLocaleString(intlLocale),
                )}
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground tabular-nums">
                <span>{formatBytes(domain.totalSizeBytes)}</span>
                {totalScannedBytes > 0 ? (
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-12 overflow-hidden rounded-full bg-muted"
                  >
                    <span
                      className={`block h-full w-full origin-left rounded-full transition-transform duration-300 ease-out ${
                        isDomainProtected
                          ? "bg-emerald-500/80 dark:bg-emerald-400/80"
                          : "bg-primary/75"
                      }`}
                      style={{ transform: `scaleX(${domainShareScale})` }}
                    />
                  </span>
                ) : null}
              </span>
              <span>
                {t.latestDate(
                  formatDate(domain.latestDate, intlLocale, t.unknownDate),
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 pl-9 sm:pl-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mc-btn-press"
            disabled={isCleaning || domain.messageIds.length === 0}
            onClick={() => onViewDomainEmails(domain)}
          >
            <Eye className="size-3.5" />
            {t.viewEmails}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mc-btn-press"
            disabled={isBusy || cleanableSenders.length === 0}
            onClick={() => onMoveToTrash(domain.senders)}
          >
            <Trash2 className="size-3.5" />
            {t.moveToTrash}
          </Button>

          <RowMoreActionsMenu label={t.moreActionsLabel}>
            {(closeMenu) => (
              <>
                <KeepSafeMenuItem
                  scope="DOMAIN"
                  pattern={domain.host}
                  label={domain.host}
                  isDirectProtected={hasDirectDomainRule}
                  isPending={isRulePending}
                  disabled={isCleaning}
                  t={t}
                  onToggle={onToggleKeepSafe}
                  onAfterSelect={closeMenu}
                />

                <BlockAutoTrashMenuItem
                  type="BLOCK_DOMAIN"
                  pattern={domain.host}
                  isBlocked={isDomainBlocked}
                  isProtected={isDomainBlockProtected}
                  isPending={isBlockDomainPending}
                  disabled={isCleaning}
                  t={t}
                  onBlock={() => onBlockDomain(domain)}
                  onAfterSelect={closeMenu}
                />

                <button
                  type="button"
                  role="menuitem"
                  disabled={isBusy || cleanableSenders.length === 0}
                  onClick={() => {
                    closeMenu();
                    onDeletePermanently(domain.senders);
                  }}
                  className="flex min-h-7 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ShieldAlert className="size-3.5 shrink-0" />
                  <span>{t.deletePermanently}</span>
                </button>
              </>
            )}
          </RowMoreActionsMenu>
        </div>
      </div>

      <div
        className="mc-accordion"
        data-open={isExpanded ? "true" : "false"}
      >
        <div className="mc-accordion-inner">
          <ul className="divide-y divide-border/70 border-t border-border/70">
            {domain.senders.map((sender) => (
              <SenderRow
                key={sender.senderEmail}
                sender={sender}
                isSelected={selectedEmails.has(sender.senderEmail)}
                isBusy={isBusy}
                isCleaning={isCleaning}
                indented
                protectedRules={protectedRules}
                autoCleanRules={autoCleanRules}
                pendingRuleKey={pendingRuleKey}
                pendingAutoCleanKey={pendingAutoCleanKey}
                unsubscribeState={unsubscribeStates[sender.senderEmail]}
                t={t}
                intlLocale={intlLocale}
                onToggleSelect={onToggleSenderSelection}
                onToggleKeepSafe={onToggleKeepSafe}
                onBlockSender={onBlockSender}
                onViewEmails={onViewSenderEmails}
                onUnsubscribe={onUnsubscribe}
                onMoveToTrash={(target) => onMoveToTrash([target])}
                onArchive={(target) => onArchive([target])}
                onMarkAsRead={(target) => onMarkAsRead([target])}
                onDeletePermanently={(target) => onDeletePermanently([target])}
              />
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

interface BrandTreeRowProps {
  brand: SenderBrandNode;
  totalScannedBytes: number;
  isExpanded: boolean;
  expandedDomains: Set<string>;
  isBusy: boolean;
  isCleaning: boolean;
  selectedEmails: Set<string>;
  protectedRules: ProtectionRuleRecord[];
  autoCleanRules: AutoCleanRuleRecord[];
  pendingRuleKey: string | null;
  pendingAutoCleanKey: string | null;
  unsubscribeStates: Record<string, SenderUnsubscribeState>;
  t: AppTranslations["dashboard"]["tree"];
  intlLocale: string;
  onToggleBrandExpand: (brandKey: string) => void;
  onToggleDomainExpand: (domainKey: string) => void;
  onToggleGroupSelection: (senders: SenderGroup[], shouldSelect: boolean) => void;
  onToggleSenderSelection: (senderEmail: string) => void;
  onToggleKeepSafe: (
    scope: ProtectionScopeType,
    pattern: string,
    label: string,
  ) => void;
  onBlockDomain: (domain: SenderDomainNode) => void;
  onBlockSender: (sender: SenderGroup) => void;
  onViewBrandEmails: (brand: SenderBrandNode) => void;
  onViewDomainEmails: (domain: SenderDomainNode) => void;
  onViewSenderEmails: (sender: SenderGroup) => void;
  onUnsubscribe: (sender: SenderGroup) => void;
  onMoveToTrash: (targetSenders: SenderGroup[]) => void;
  onArchive: (targetSenders: SenderGroup[]) => void;
  onMarkAsRead: (targetSenders: SenderGroup[]) => void;
  onDeletePermanently: (targetSenders: SenderGroup[]) => void;
}

function BrandTreeRow({
  brand,
  totalScannedBytes,
  isExpanded,
  expandedDomains,
  isBusy,
  isCleaning,
  selectedEmails,
  protectedRules,
  autoCleanRules,
  pendingRuleKey,
  pendingAutoCleanKey,
  unsubscribeStates,
  t,
  intlLocale,
  onToggleBrandExpand,
  onToggleDomainExpand,
  onToggleGroupSelection,
  onToggleSenderSelection,
  onToggleKeepSafe,
  onBlockDomain,
  onBlockSender,
  onViewBrandEmails,
  onViewDomainEmails,
  onViewSenderEmails,
  onUnsubscribe,
  onMoveToTrash,
  onArchive,
  onMarkAsRead,
  onDeletePermanently,
}: BrandTreeRowProps) {
  const brandSenders = useMemo(
    () => brand.domains.flatMap((domain) => domain.senders),
    [brand.domains],
  );
  const { cleanable: cleanableSenders, protectedSenders } = useMemo(
    () => partitionSendersByProtection(brandSenders, protectedRules),
    [brandSenders, protectedRules],
  );
  const isBrandProtected = hasProtectionRule(
    protectedRules,
    "BRAND",
    brand.brandKey,
  );
  const isRulePending =
    pendingRuleKey === getKeepSafeRuleKey("BRAND", brand.brandKey);

  const selectedCount = cleanableSenders.filter((sender) =>
    selectedEmails.has(sender.senderEmail),
  ).length;
  const allBrandSelected =
    cleanableSenders.length > 0 && selectedCount === cleanableSenders.length;
  const someBrandSelected =
    selectedCount > 0 && selectedCount < cleanableSenders.length;
  const brandAvatar = useMemo(
    () => getBrandAvatarMeta(brand.brandLabel, brand.brandKey),
    [brand.brandLabel, brand.brandKey],
  );
  const brandShareScale = getShareBarScale(
    brand.totalSizeBytes,
    totalScannedBytes,
  );

  return (
    <li
      className={`overflow-hidden rounded-2xl border bg-card transition-colors ${
        isBrandProtected
          ? "border-emerald-500/40 bg-emerald-500/[0.06] ring-1 ring-inset ring-emerald-500/20"
          : allBrandSelected
            ? "border-primary/50 bg-primary/[0.04] ring-1 ring-inset ring-primary/20"
            : someBrandSelected
              ? "border-primary/35 bg-primary/[0.025]"
              : "border-border"
      }`}
    >
      <div
        className={`flex flex-col gap-3 px-5 py-4.5 transition-colors sm:flex-row sm:items-center sm:justify-between ${
          !isBrandProtected && !allBrandSelected && !someBrandSelected
            ? "hover:bg-muted/25"
            : ""
        }`}
      >
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <button
            type="button"
            onClick={() => onToggleBrandExpand(brand.brandKey)}
            aria-expanded={isExpanded}
            aria-label={
              isExpanded
                ? t.collapseLabel(brand.brandLabel)
                : t.expandLabel(brand.brandLabel)
            }
            className="mc-btn-press mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight
              className={`size-4 transition-transform duration-200 ${
                isExpanded ? "rotate-90 text-foreground" : ""
              }`}
            />
          </button>

          <TriStateCheckbox
            checked={allBrandSelected}
            indeterminate={someBrandSelected}
            onChange={() =>
              onToggleGroupSelection(cleanableSenders, !allBrandSelected)
            }
            disabled={isBusy || cleanableSenders.length === 0}
            ariaLabel={t.selectCleanableInLabel(brand.brandLabel)}
            className="mt-1.5 size-4 shrink-0 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
          />

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex max-w-full flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleBrandExpand(brand.brandKey)}
                className="flex max-w-full flex-wrap items-center gap-2 text-left"
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl border text-xs font-bold tracking-tight ${brandAvatar.paletteClass}`}
                >
                  {brandAvatar.initials}
                </span>
                <span className="truncate text-base font-semibold">
                  {brand.brandLabel}
                </span>
                {brand.brandLabel.toLowerCase() !== brand.brandKey ? (
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    ({brand.brandKey})
                  </span>
                ) : null}
              </button>
              {isBrandProtected ? (
                <KeepSafeBadge
                  label={t.keepSafeLabel}
                  title={t.protectedByRuleTitle("BRAND", brand.brandKey)}
                />
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
              <span>
                {t.domainCount(
                  brand.domains.length,
                  brand.domains.length.toLocaleString(intlLocale),
                )}
              </span>
              <span>
                {t.senderCount(
                  brandSenders.length,
                  brandSenders.length.toLocaleString(intlLocale),
                )}
              </span>
              {protectedSenders.length > 0 ? (
                <span className="text-emerald-700 dark:text-emerald-300">
                  {t.protectedCount(protectedSenders.length)}
                </span>
              ) : null}
              <span>
                {t.emailCount(
                  brand.messageCount,
                  brand.messageCount.toLocaleString(intlLocale),
                )}
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground tabular-nums">
                <span>{formatBytes(brand.totalSizeBytes)}</span>
                {totalScannedBytes > 0 ? (
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-14 overflow-hidden rounded-full bg-muted"
                  >
                    <span
                      className={`block h-full w-full origin-left rounded-full transition-transform duration-300 ease-out ${
                        isBrandProtected
                          ? "bg-emerald-500/80 dark:bg-emerald-400/80"
                          : "bg-primary/75"
                      }`}
                      style={{ transform: `scaleX(${brandShareScale})` }}
                    />
                  </span>
                ) : null}
              </span>
              <span>
                {t.latestDate(
                  formatDate(brand.latestDate, intlLocale, t.unknownDate),
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 pl-9 sm:pl-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mc-btn-press"
            disabled={isCleaning || brand.messageIds.length === 0}
            onClick={() => onViewBrandEmails(brand)}
          >
            <Eye className="size-3.5" />
            {t.viewEmails}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mc-btn-press"
            disabled={isBusy || cleanableSenders.length === 0}
            onClick={() => onMoveToTrash(brandSenders)}
          >
            <Trash2 className="size-3.5" />
            {t.moveToTrash}
          </Button>

          <RowMoreActionsMenu label={t.moreActionsLabel}>
            {(closeMenu) => (
              <>
                <KeepSafeMenuItem
                  scope="BRAND"
                  pattern={brand.brandKey}
                  label={brand.brandLabel}
                  isDirectProtected={isBrandProtected}
                  isPending={isRulePending}
                  disabled={isCleaning}
                  t={t}
                  onToggle={onToggleKeepSafe}
                  onAfterSelect={closeMenu}
                />

                <button
                  type="button"
                  role="menuitem"
                  disabled={isBusy || cleanableSenders.length === 0}
                  onClick={() => {
                    closeMenu();
                    onDeletePermanently(brandSenders);
                  }}
                  className="flex min-h-7 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ShieldAlert className="size-3.5 shrink-0" />
                  <span>{t.deletePermanently}</span>
                </button>
              </>
            )}
          </RowMoreActionsMenu>
        </div>
      </div>

      <div
        className="mc-accordion"
        data-open={isExpanded ? "true" : "false"}
      >
        <div className="mc-accordion-inner">
          <ul>
            {brand.domains.map((domain) => {
              const domainKey = getDomainExpansionKey(
                brand.brandKey,
                domain.host,
              );
              return (
                <DomainTreeRow
                  key={domainKey}
                  brandKey={brand.brandKey}
                  domain={domain}
                  totalScannedBytes={totalScannedBytes}
                  isExpanded={expandedDomains.has(domainKey)}
                  isBusy={isBusy}
                  isCleaning={isCleaning}
                  selectedEmails={selectedEmails}
                  protectedRules={protectedRules}
                  autoCleanRules={autoCleanRules}
                  pendingRuleKey={pendingRuleKey}
                  pendingAutoCleanKey={pendingAutoCleanKey}
                  unsubscribeStates={unsubscribeStates}
                  t={t}
                  intlLocale={intlLocale}
                  onToggleExpand={onToggleDomainExpand}
                  onToggleGroupSelection={onToggleGroupSelection}
                  onToggleSenderSelection={onToggleSenderSelection}
                  onToggleKeepSafe={onToggleKeepSafe}
                  onBlockDomain={onBlockDomain}
                  onBlockSender={onBlockSender}
                  onViewDomainEmails={onViewDomainEmails}
                  onViewSenderEmails={onViewSenderEmails}
                  onUnsubscribe={onUnsubscribe}
                  onMoveToTrash={onMoveToTrash}
                  onArchive={onArchive}
                  onMarkAsRead={onMarkAsRead}
                  onDeletePermanently={onDeletePermanently}
                />
              );
            })}
          </ul>
        </div>
      </div>
    </li>
  );
}

interface BrandGridCardProps {
  brand: SenderBrandNode;
  totalScannedBytes: number;
  isExpanded: boolean;
  expandedDomains: Set<string>;
  isBusy: boolean;
  isCleaning: boolean;
  selectedEmails: Set<string>;
  protectedRules: ProtectionRuleRecord[];
  autoCleanRules: AutoCleanRuleRecord[];
  pendingRuleKey: string | null;
  pendingAutoCleanKey: string | null;
  unsubscribeStates: Record<string, SenderUnsubscribeState>;
  t: AppTranslations["dashboard"]["tree"];
  intlLocale: string;
  onToggleBrandExpand: (brandKey: string) => void;
  onToggleDomainExpand: (domainKey: string) => void;
  onToggleGroupSelection: (senders: SenderGroup[], shouldSelect: boolean) => void;
  onToggleSenderSelection: (senderEmail: string) => void;
  onToggleKeepSafe: (
    scope: ProtectionScopeType,
    pattern: string,
    label: string,
  ) => void;
  onBlockDomain: (domain: SenderDomainNode) => void;
  onBlockSender: (sender: SenderGroup) => void;
  onViewBrandEmails: (brand: SenderBrandNode) => void;
  onViewDomainEmails: (domain: SenderDomainNode) => void;
  onViewSenderEmails: (sender: SenderGroup) => void;
  onUnsubscribe: (sender: SenderGroup) => void;
  onMoveToTrash: (targetSenders: SenderGroup[]) => void;
  onArchive: (targetSenders: SenderGroup[]) => void;
  onMarkAsRead: (targetSenders: SenderGroup[]) => void;
  onDeletePermanently: (targetSenders: SenderGroup[]) => void;
}

function BrandGridCard({
  brand,
  totalScannedBytes,
  isExpanded,
  expandedDomains,
  isBusy,
  isCleaning,
  selectedEmails,
  protectedRules,
  autoCleanRules,
  pendingRuleKey,
  pendingAutoCleanKey,
  unsubscribeStates,
  t,
  intlLocale,
  onToggleBrandExpand,
  onToggleDomainExpand,
  onToggleGroupSelection,
  onToggleSenderSelection,
  onToggleKeepSafe,
  onBlockDomain,
  onBlockSender,
  onViewBrandEmails,
  onViewDomainEmails,
  onViewSenderEmails,
  onUnsubscribe,
  onMoveToTrash,
  onArchive,
  onMarkAsRead,
  onDeletePermanently,
}: BrandGridCardProps) {
  const brandSenders = useMemo(
    () => brand.domains.flatMap((domain) => domain.senders),
    [brand.domains],
  );
  const { cleanable: cleanableSenders, protectedSenders } = useMemo(
    () => partitionSendersByProtection(brandSenders, protectedRules),
    [brandSenders, protectedRules],
  );
  const isBrandProtected = hasProtectionRule(
    protectedRules,
    "BRAND",
    brand.brandKey,
  );
  const isRulePending =
    pendingRuleKey === getKeepSafeRuleKey("BRAND", brand.brandKey);

  const selectedCount = cleanableSenders.filter((sender) =>
    selectedEmails.has(sender.senderEmail),
  ).length;
  const allBrandSelected =
    cleanableSenders.length > 0 && selectedCount === cleanableSenders.length;
  const someBrandSelected =
    selectedCount > 0 && selectedCount < cleanableSenders.length;
  const brandAvatar = useMemo(
    () => getBrandAvatarMeta(brand.brandLabel, brand.brandKey),
    [brand.brandLabel, brand.brandKey],
  );
  const brandShareScale = getShareBarScale(
    brand.totalSizeBytes,
    totalScannedBytes,
  );

  const sanitizedBrandKey = brand.brandKey.replace(/[^a-zA-Z0-9_-]/g, "-");

  return (
    <li
      style={{ viewTransitionName: `brand-card-${sanitizedBrandKey}` }}
      className={`h-full transition-all duration-300 ease-out ${
        isExpanded ? "sm:col-span-2 lg:col-span-3" : ""
      }`}
    >
      <article
        className={`flex h-full flex-col justify-between gap-4 rounded-xl border p-4 transition-all duration-300 ease-out ${
          isBrandProtected
            ? "border-emerald-500/40 bg-emerald-500/[0.06] ring-1 ring-inset ring-emerald-500/20"
            : allBrandSelected
              ? "border-primary/50 bg-primary/[0.04] ring-1 ring-inset ring-primary/20"
              : someBrandSelected
                ? "border-primary/35 bg-primary/[0.025]"
                : "border-border bg-card hover:bg-muted/25"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <TriStateCheckbox
              checked={allBrandSelected}
              indeterminate={someBrandSelected}
              onChange={() =>
                onToggleGroupSelection(cleanableSenders, !allBrandSelected)
              }
              disabled={isBusy || cleanableSenders.length === 0}
              ariaLabel={t.selectCleanableInLabel(brand.brandLabel)}
              className="mt-1 size-4 shrink-0 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span
              aria-hidden="true"
              className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg border text-xs font-bold tracking-tight ${brandAvatar.paletteClass}`}
            >
              {brandAvatar.initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-sm font-semibold">
                  {brand.brandLabel}
                </span>
                {isBrandProtected ? (
                  <KeepSafeBadge
                    label={t.keepSafeLabel}
                    title={t.protectedByRuleTitle("BRAND", brand.brandKey)}
                  />
                ) : null}
              </div>
              {brand.brandLabel.toLowerCase() !== brand.brandKey ? (
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {brand.brandKey}
                </p>
              ) : null}
            </div>
          </div>

          <RowMoreActionsMenu label={t.moreActionsLabel}>
            {(closeMenu) => (
              <>
                <KeepSafeMenuItem
                  scope="BRAND"
                  pattern={brand.brandKey}
                  label={brand.brandLabel}
                  isDirectProtected={isBrandProtected}
                  isPending={isRulePending}
                  disabled={isCleaning}
                  t={t}
                  onToggle={onToggleKeepSafe}
                  onAfterSelect={closeMenu}
                />

                <button
                  type="button"
                  role="menuitem"
                  disabled={isBusy || cleanableSenders.length === 0}
                  onClick={() => {
                    closeMenu();
                    onDeletePermanently(brandSenders);
                  }}
                  className="flex min-h-7 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ShieldAlert className="size-3.5 shrink-0" />
                  <span>{t.deletePermanently}</span>
                </button>
              </>
            )}
          </RowMoreActionsMenu>
        </div>

        <div className="space-y-2.5">
          <div className="space-y-1.5">
            <div className="text-xl font-semibold tracking-tight text-foreground tabular-nums">
              {formatBytes(brand.totalSizeBytes)}
            </div>
            {totalScannedBytes > 0 ? (
              <div
                aria-hidden="true"
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={`h-full w-full origin-left rounded-full transition-transform duration-300 ease-out ${
                    isBrandProtected
                      ? "bg-emerald-500/80 dark:bg-emerald-400/80"
                      : "bg-primary/75"
                  }`}
                  style={{ transform: `scaleX(${brandShareScale})` }}
                />
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
            <span>
              {t.domainCount(
                brand.domains.length,
                brand.domains.length.toLocaleString(intlLocale),
              )}
            </span>
            <span>
              {t.senderCount(
                brandSenders.length,
                brandSenders.length.toLocaleString(intlLocale),
              )}
            </span>
            <span>
              {t.emailCount(
                brand.messageCount,
                brand.messageCount.toLocaleString(intlLocale),
              )}
            </span>
            {protectedSenders.length > 0 ? (
              <span className="text-emerald-700 dark:text-emerald-300">
                {t.protectedCount(protectedSenders.length)}
              </span>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground tabular-nums">
            {t.latestDate(
              formatDate(brand.latestDate, intlLocale, t.unknownDate),
            )}
          </p>

          {brand.domains.length > 0 ? (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1">
                {brand.domains.slice(0, 3).map((domain) => (
                  <button
                    key={domain.host}
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => onToggleBrandExpand(brand.brandKey)}
                    className="max-w-full truncate rounded-md border border-border/80 bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
                    title={domain.host}
                  >
                    {domain.host}
                  </button>
                ))}
                {brand.domains.length > 3 ? (
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => onToggleBrandExpand(brand.brandKey)}
                    className="rounded-md border border-border/80 bg-muted/30 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
                  >
                    {t.moreSubdomainsCount(brand.domains.length - 3)}
                  </button>
                ) : null}
              </div>
              <div>
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => onToggleBrandExpand(brand.brandKey)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <ChevronRight
                    className={`size-3.5 shrink-0 transition-transform duration-200 ${
                      isExpanded ? "rotate-90" : ""
                    }`}
                  />
                  <Globe className="size-3 shrink-0" />
                  <span>{t.viewSubdomains(brand.domains.length)}</span>
                </button>
              </div>
              <div
                className="mc-accordion"
                data-open={isExpanded ? "true" : "false"}
              >
                <div className="mc-accordion-inner">
                  <div className="pt-2">
                    <ul className="overflow-hidden rounded-lg border border-border/70 bg-background/50 [&>li:first-child]:border-t-0">
                      {brand.domains.map((domain) => {
                        const domainKey = getDomainExpansionKey(
                          brand.brandKey,
                          domain.host,
                        );
                        return (
                          <DomainTreeRow
                            key={domainKey}
                            brandKey={brand.brandKey}
                            domain={domain}
                            totalScannedBytes={totalScannedBytes}
                            isExpanded={expandedDomains.has(domainKey)}
                            isBusy={isBusy}
                            isCleaning={isCleaning}
                            selectedEmails={selectedEmails}
                            protectedRules={protectedRules}
                            autoCleanRules={autoCleanRules}
                            pendingRuleKey={pendingRuleKey}
                            pendingAutoCleanKey={pendingAutoCleanKey}
                            unsubscribeStates={unsubscribeStates}
                            t={t}
                            intlLocale={intlLocale}
                            onToggleExpand={onToggleDomainExpand}
                            onToggleGroupSelection={onToggleGroupSelection}
                            onToggleSenderSelection={onToggleSenderSelection}
                            onToggleKeepSafe={onToggleKeepSafe}
                            onBlockDomain={onBlockDomain}
                            onBlockSender={onBlockSender}
                            onViewDomainEmails={onViewDomainEmails}
                            onViewSenderEmails={onViewSenderEmails}
                            onUnsubscribe={onUnsubscribe}
                            onMoveToTrash={onMoveToTrash}
                            onArchive={onArchive}
                            onMarkAsRead={onMarkAsRead}
                            onDeletePermanently={onDeletePermanently}
                          />
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mc-btn-press flex-1"
            disabled={isCleaning || brand.messageIds.length === 0}
            onClick={() => onViewBrandEmails(brand)}
          >
            <Eye className="size-3.5" />
            {t.viewEmails}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mc-btn-press flex-1"
            disabled={isBusy || cleanableSenders.length === 0}
            onClick={() => onMoveToTrash(brandSenders)}
          >
            <Trash2 className="size-3.5" />
            {t.moveToTrash}
          </Button>
        </div>
      </article>
    </li>
  );
}

export function MailCleanerDashboard({
  user,
  initialProtectedRules = [],
  initialAutoCleanRules = [],
  initialCleanHistory = [],
  onSignOut,
}: MailCleanerDashboardProps) {
  const { lang } = useAppPreferences();
  const t = getAppTranslations(lang).dashboard;
  const intlLocale = getIntlLocale(lang);

  const [preset, setPreset] = useState<GmailPresetFilter>("all");
  const [olderThan, setOlderThan] = useState<GmailAgeFilter>("any");
  const [largerThan, setLargerThan] = useState<GmailSizeFilter>("any");
  const [hasAttachment, setHasAttachment] = useState<boolean>(false);
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [onlyUnsubscribable, setOnlyUnsubscribable] = useState<boolean>(false);
  const [search, setSearch] = useState("");
  const [reclaimedBytes, setReclaimedBytes] = useState<number>(
    user.reclaimedBytes,
  );
  const [cleanedMessagesCount, setCleanedMessagesCount] = useState<number>(
    user.cleanedMessagesCount,
  );

  const [senders, setSenders] = useState<SenderGroup[]>([]);
  const [scannedMessages, setScannedMessages] = useState<number>(0);
  const [estimatedTotal, setEstimatedTotal] = useState<number | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<ScanFilterParams>({
    preset: "all",
    olderThan: "any",
    largerThan: "any",
    hasAttachment: false,
    unreadOnly: false,
    search: "",
  });
  const [activeQuery, setActiveQuery] = useState<string>("");
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(
    () => new Set(),
  );
  const [viewMode, setViewMode] = useState<ResultsViewMode>("tree");
  const [sortBy, setSortBy] = useState<SenderSortBy>("size");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [visibleCount, setVisibleCount] = useState<number>(
    INITIAL_VISIBLE_ITEMS,
  );
  const [showLongTail, setShowLongTail] = useState<boolean>(false);
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(
    () => new Set(),
  );

  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [isCleaning, setIsCleaning] = useState<boolean>(false);
  const [cleaningAction, setCleaningAction] = useState<
    CleanAction | "empty_trash" | null
  >(null);
  const [isEmptyTrashModalOpen, setIsEmptyTrashModalOpen] =
    useState<boolean>(false);
  const [protectedRules, setProtectedRules] = useState<ProtectionRuleRecord[]>(
    initialProtectedRules,
  );
  const [pendingRuleKey, setPendingRuleKey] = useState<string | null>(null);
  const [autoCleanRules, setAutoCleanRules] = useState<AutoCleanRuleRecord[]>(
    initialAutoCleanRules,
  );
  const [pendingAutoCleanKey, setPendingAutoCleanKey] = useState<string | null>(
    null,
  );
  const [runningRuleId, setRunningRuleId] = useState<string | null>(null);
  const [removingRuleId, setRemovingRuleId] = useState<string | null>(null);
  const [updatingRuleId, setUpdatingRuleId] = useState<string | null>(null);
  const [builderPreset, setBuilderPreset] =
    useState<GmailPresetFilter>("promotions");
  const [builderOlderThan, setBuilderOlderThan] =
    useState<GmailAgeFilter>("3m");
  const [builderUnreadOnly, setBuilderUnreadOnly] = useState<boolean>(false);
  const [builderHasAttachment, setBuilderHasAttachment] =
    useState<boolean>(false);
  const [builderAction, setBuilderAction] =
    useState<AutoCleanRuleAction>("trash");
  const [builderSchedule, setBuilderSchedule] =
    useState<AutoCleanRuleSchedule>("weekly");
  const [isPreviewingBuilder, setIsPreviewingBuilder] =
    useState<boolean>(false);
  const [builderPreviewResult, setBuilderPreviewResult] =
    useState<AutoCleanQueryPreviewResult | null>(null);
  const [builderPreviewError, setBuilderPreviewError] = useState<string | null>(
    null,
  );
  const [unsubscribeStates, setUnsubscribeStates] = useState<
    Record<string, SenderUnsubscribeState>
  >({});
  const [bulkUnsubscribeProgress, setBulkUnsubscribeProgress] = useState<{
    current: number;
    total: number;
    currentSender: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<FeedbackBanner | null>(
    null,
  );

  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] =
    useState<PendingPermanentDelete | null>(null);
  const [confirmDeleteChecked, setConfirmDeleteChecked] =
    useState<boolean>(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"clean" | "rules" | "history">(
    "clean",
  );
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState<boolean>(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState<boolean>(false);
  const [isAutoCleanExpanded, setIsAutoCleanExpanded] =
    useState<boolean>(true);
  const [cleanHistory, setCleanHistory] =
    useState<CleanHistoryEntry[]>(initialCleanHistory);
  const [isCleanHistoryExpanded, setIsCleanHistoryExpanded] =
    useState<boolean>(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [lastTrashSnapshot, setLastTrashSnapshot] =
    useState<TrashUndoSnapshot | null>(null);
  const [isUndoing, setIsUndoing] = useState<boolean>(false);
  const [isOnboardingDismissed, dismissOnboarding] = useOnboardingDismissed();

  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const filtersPopoverRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scanRunIdRef = useRef<number>(0);
  const scannedMessagesRef = useRef<number>(0);
  const bulkUnsubscribeCancelRef = useRef<boolean>(false);
  const bulkUnsubscribeAbortRef = useRef<AbortController | null>(null);
  const unsubscribeStatesRef = useRef(unsubscribeStates);
  const tRef = useRef(t);

  const refreshCleanHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch("/api/gmail/history", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as {
        entries?: CleanHistoryEntry[];
      };
      if (Array.isArray(payload.entries)) {
        setCleanHistory(payload.entries);
      }
    } catch {
      // Best-effort refresh; keep existing history if network fails.
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        accountMenuRef.current &&
        event.target instanceof Node &&
        !accountMenuRef.current.contains(event.target)
      ) {
        setIsAccountMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsAccountMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountMenuOpen]);

  useEffect(() => {
    if (!isFiltersOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        filtersPopoverRef.current &&
        event.target instanceof Node &&
        !filtersPopoverRef.current.contains(event.target)
      ) {
        setIsFiltersOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsFiltersOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFiltersOpen]);

  useEffect(() => {
    unsubscribeStatesRef.current = unsubscribeStates;
  }, [unsubscribeStates]);

  const abortActiveScan = useCallback(() => {
    scanRunIdRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const fetchSendersPage = useCallback(
    async (
      params: ScanFilterParams,
      batchLimit: number,
      pageToken: string | null,
      signal: AbortSignal,
    ) => {
      const searchParams = new URLSearchParams({
        preset: params.preset,
        olderThan: params.olderThan,
        largerThan: params.largerThan,
        hasAttachment: String(params.hasAttachment),
        unreadOnly: String(params.unreadOnly),
        maxMessages: String(batchLimit),
      });
      if (params.search.trim().length > 0) {
        searchParams.set("search", params.search.trim());
      }
      if (pageToken) {
        searchParams.set("pageToken", pageToken);
      }

      const response = await fetch(
        `/api/gmail/senders?${searchParams.toString()}`,
        {
          method: "GET",
          cache: "no-store",
          signal,
        },
      );

      let payload: Partial<SendersApiResponse> = {};
      try {
        payload = (await response.json()) as Partial<SendersApiResponse>;
      } catch {
        payload = {};
      }

      if (response.status === 429 || payload.code === "GMAIL_RATE_LIMIT") {
        const retryAfterSeconds =
          typeof payload.retryAfterSeconds === "number" &&
          Number.isFinite(payload.retryAfterSeconds)
            ? parseRetryAfterSeconds(String(payload.retryAfterSeconds), 20)
            : parseRetryAfterSeconds(response.headers.get("Retry-After"), 20);
        throw new ScanRateLimitError(
          payload.error || tRef.current.banners.scanRateLimitFallback,
          retryAfterSeconds,
        );
      }

      if (!response.ok) {
        throw new Error(
          payload.error || tRef.current.errors.failedScanInbox(response.status),
        );
      }

      return payload as SendersApiResponse;
    },
    [],
  );

  const runPaginatedScanLoop = useCallback(
    async (options: {
      params: ScanFilterParams;
      startPageToken: string | null;
      maxToFetch: number;
    }) => {
      abortActiveScan();

      const controller = new AbortController();
      abortControllerRef.current = controller;
      const runId = scanRunIdRef.current;

      let cursor: string | null = options.startPageToken;
      let fetchedInRun = 0;
      let consecutiveEmptyPages = 0;

      try {
        while (fetchedInRun < options.maxToFetch) {
          if (controller.signal.aborted || scanRunIdRef.current !== runId) {
            break;
          }

          const remaining = options.maxToFetch - fetchedInRun;
          const batchLimit = Math.min(SCAN_PAGE_SIZE, remaining);
          const previousCursor = cursor;

          let result: SendersApiResponse;
          try {
            result = await fetchSendersPage(
              options.params,
              batchLimit,
              cursor,
              controller.signal,
            );
          } catch (pageError) {
            if (pageError instanceof ScanRateLimitError) {
              if (controller.signal.aborted || scanRunIdRef.current !== runId) {
                break;
              }
              await sleepWithAbort(
                pageError.retryAfterSeconds * 1000,
                controller.signal,
              );
              if (controller.signal.aborted || scanRunIdRef.current !== runId) {
                break;
              }
              continue;
            }
            throw pageError;
          }

          if (controller.signal.aborted || scanRunIdRef.current !== runId) {
            break;
          }

          if (result.senders.length > 0) {
            setSenders((prev) => mergeSenderGroups(prev, result.senders));
          }

          fetchedInRun += result.scannedMessages;
          scannedMessagesRef.current += result.scannedMessages;
          setScannedMessages(scannedMessagesRef.current);
          setActiveQuery(result.query);

          if (result.resultSizeEstimate > 0) {
            setEstimatedTotal((prev) =>
              prev === null
                ? result.resultSizeEstimate
                : Math.max(prev, result.resultSizeEstimate),
            );
          }

          cursor = result.nextPageToken;
          setNextPageToken(cursor);

          if (result.scannedMessages === 0) {
            consecutiveEmptyPages += 1;
            if (consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY_PAGES) {
              break;
            }
          } else {
            consecutiveEmptyPages = 0;
          }

          if (!cursor || cursor === previousCursor) {
            break;
          }

          if (fetchedInRun < options.maxToFetch) {
            await sleepWithAbort(INTER_PAGE_DELAY_MS, controller.signal);
          }
        }
      } catch (error) {
        const isAbortError =
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError") ||
          (error instanceof Error && error.name === "AbortError");

        if (!isAbortError && scanRunIdRef.current === runId) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : tRef.current.banners.scanErrorFallback,
          );
        }
      } finally {
        if (scanRunIdRef.current === runId) {
          setIsScanning(false);
          if (abortControllerRef.current === controller) {
            abortControllerRef.current = null;
          }
        }
      }
    },
    [abortActiveScan, fetchSendersPage],
  );

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void runPaginatedScanLoop({
        params: {
          preset: "all",
          olderThan: "any",
          largerThan: "any",
          hasAttachment: false,
          unreadOnly: false,
          search: "",
        },
        startPageToken: null,
        maxToFetch: FULL_SCAN_MAX_MESSAGES,
      });
    }, 0);

    return () => {
      window.clearTimeout(timerId);
      abortActiveScan();
      bulkUnsubscribeCancelRef.current = true;
      bulkUnsubscribeAbortRef.current?.abort();
    };
  }, [runPaginatedScanLoop, abortActiveScan]);

  const abortOnFilterChange = useCallback(
    (clearCursor: boolean) => {
      if (isScanning) {
        abortActiveScan();
        setIsScanning(false);
      }
      if (clearCursor) {
        setNextPageToken(null);
      }
    },
    [isScanning, abortActiveScan],
  );

  const handleStopScan = () => {
    abortActiveScan();
    setIsScanning(false);
  };

  const handleLoadMore = () => {
    if (isScanning || isCleaning || !nextPageToken) {
      return;
    }
    setIsScanning(true);
    setErrorMessage(null);
    setFeedbackBanner(null);
    void runPaginatedScanLoop({
      params: activeFilters,
      startPageToken: nextPageToken,
      maxToFetch: FULL_SCAN_MAX_MESSAGES,
    });
  };

  const startFreshScan = (nextParams: ScanFilterParams) => {
    bulkUnsubscribeCancelRef.current = true;
    bulkUnsubscribeAbortRef.current?.abort();
    scannedMessagesRef.current = 0;
    setIsScanning(true);
    setErrorMessage(null);
    setFeedbackBanner(null);
    setLastTrashSnapshot(null);
    setSenders([]);
    setScannedMessages(0);
    setEstimatedTotal(null);
    setNextPageToken(null);
    setSelectedEmails(new Set());
    setExpandedBrands(new Set());
    setExpandedDomains(new Set());
    setUnsubscribeStates({});
    setPreviewTarget(null);
    setActiveFilters(nextParams);
    void runPaginatedScanLoop({
      params: nextParams,
      startPageToken: null,
      maxToFetch: FULL_SCAN_MAX_MESSAGES,
    });
  };

  const handleScanSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCleaning || bulkUnsubscribeProgress !== null) {
      return;
    }
    startFreshScan({
      preset,
      olderThan,
      largerThan,
      hasAttachment,
      unreadOnly,
      search,
    });
  };

  const handleResetFilters = () => {
    if (isCleaning || bulkUnsubscribeProgress !== null) {
      return;
    }
    const defaultParams: ScanFilterParams = {
      preset: "all",
      olderThan: "any",
      largerThan: "any",
      hasAttachment: false,
      unreadOnly: false,
      search: "",
    };
    abortOnFilterChange(true);
    setPreset("all");
    setOlderThan("any");
    setLargerThan("any");
    setHasAttachment(false);
    setUnreadOnly(false);
    setOnlyUnsubscribable(false);
    setSearch("");
    setSearchQuery("");
    setVisibleCount(INITIAL_VISIBLE_ITEMS);
    setShowLongTail(false);
    startFreshScan(defaultParams);
  };

  const visibleSenders = useMemo(() => {
    if (!onlyUnsubscribable) {
      return senders;
    }
    return senders.filter(
      (sender) =>
        sender.hasUnsubscribeHeader ||
        unsubscribeStates[sender.senderEmail]?.status === "action_required",
    );
  }, [senders, onlyUnsubscribable, unsubscribeStates]);

  const brandTree = useMemo(
    () => buildSenderBrandTree(visibleSenders, sortBy),
    [visibleSenders, sortBy],
  );
  const sortedSenders = useMemo(
    () => sortSenderGroups(visibleSenders, sortBy),
    [visibleSenders, sortBy],
  );

  const isSearchActive = searchQuery.trim().length > 0;
  const filteredBrandTree = useMemo(
    () => filterBrandsByQuery(brandTree, searchQuery),
    [brandTree, searchQuery],
  );
  const filteredSortedSenders = useMemo(
    () => filterSendersByQuery(sortedSenders, searchQuery),
    [sortedSenders, searchQuery],
  );
  const treeViewPartition = useMemo(
    () =>
      partitionSenderListView(filteredBrandTree, {
        visibleLimit: visibleCount,
        isSearchActive,
        showLongTailExpanded: showLongTail,
      }),
    [filteredBrandTree, visibleCount, isSearchActive, showLongTail],
  );
  const flatViewPartition = useMemo(
    () =>
      partitionSenderListView(filteredSortedSenders, {
        visibleLimit: visibleCount,
        isSearchActive,
        showLongTailExpanded: showLongTail,
      }),
    [filteredSortedSenders, visibleCount, isSearchActive, showLongTail],
  );
  const activeFilteredCount =
    viewMode === "flat"
      ? filteredSortedSenders.length
      : filteredBrandTree.length;

  const { cleanable: cleanableSenders, protectedSenders } = useMemo(
    () => partitionSendersByProtection(visibleSenders, protectedRules),
    [visibleSenders, protectedRules],
  );

  const protectedEmailSet = useMemo(
    () => new Set(protectedSenders.map((sender) => sender.senderEmail)),
    [protectedSenders],
  );

  const totalSizeBytes = useMemo(
    () => senders.reduce((sum, sender) => sum + sender.totalSizeBytes, 0),
    [senders],
  );

  const selectedSenders = useMemo(
    () =>
      senders.filter(
        (sender) =>
          selectedEmails.has(sender.senderEmail) &&
          !protectedEmailSet.has(sender.senderEmail),
      ),
    [senders, selectedEmails, protectedEmailSet],
  );

  const selectedMessageIds = useMemo(
    () => collectUniqueMessageIds(selectedSenders),
    [selectedSenders],
  );

  const selectedSizeBytes = useMemo(
    () =>
      selectedSenders.reduce((sum, sender) => sum + sender.totalSizeBytes, 0),
    [selectedSenders],
  );

  const eligibleUnsubscribeSenders = useMemo(
    () =>
      selectedSenders.filter(
        (sender) =>
          sender.messageIds.length > 0 &&
          (sender.hasUnsubscribeHeader ||
            unsubscribeStates[sender.senderEmail]?.status ===
              "action_required") &&
          unsubscribeStates[sender.senderEmail]?.status !== "unsubscribed",
      ),
    [selectedSenders, unsubscribeStates],
  );

  const allSelected =
    cleanableSenders.length > 0 &&
    selectedSenders.length === cleanableSenders.length;
  const someSelected =
    selectedSenders.length > 0 &&
    selectedSenders.length < cleanableSenders.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedEmails(new Set());
      return;
    }
    setSelectedEmails(
      new Set(cleanableSenders.map((sender) => sender.senderEmail)),
    );
  };

  const toggleSenderSelection = (senderEmail: string) => {
    if (protectedEmailSet.has(senderEmail)) {
      return;
    }
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(senderEmail)) {
        next.delete(senderEmail);
      } else {
        next.add(senderEmail);
      }
      return next;
    });
  };

  const toggleGroupSelection = (
    targetSenders: SenderGroup[],
    shouldSelect: boolean,
  ) => {
    const cleanableTargets = shouldSelect
      ? partitionSendersByProtection(targetSenders, protectedRules).cleanable
      : targetSenders;
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      for (const sender of cleanableTargets) {
        if (shouldSelect) {
          next.add(sender.senderEmail);
        } else {
          next.delete(sender.senderEmail);
        }
      }
      return next;
    });
  };

  const handleToggleKeepSafe = async (
    scope: ProtectionScopeType,
    rawPattern: string,
    label: string,
  ) => {
    if (isCleaning || pendingRuleKey !== null) {
      return;
    }

    const normalizedPattern = normalizeProtectionPattern(scope, rawPattern);
    if (!isValidProtectionPattern(scope, normalizedPattern)) {
      return;
    }

    const ruleKey = getKeepSafeRuleKey(scope, normalizedPattern);
    const isCurrentlyProtected = hasProtectionRule(
      protectedRules,
      scope,
      normalizedPattern,
    );

    setPendingRuleKey(ruleKey);
    setErrorMessage(null);
    setFeedbackBanner(null);

    try {
      const response = await fetch("/api/keep-safe", {
        method: isCurrentlyProtected ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scope,
          pattern: normalizedPattern,
        }),
      });

      const payload = (await response.json()) as {
        rule?: ProtectionRuleRecord;
        removed?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          payload.error || t.errors.failedUpdateKeepSafe(response.status),
        );
      }

      if (isCurrentlyProtected) {
        setProtectedRules((prev) =>
          prev.filter(
            (rule) =>
              !(
                rule.scope === scope &&
                normalizeProtectionPattern(rule.scope, rule.pattern) ===
                  normalizedPattern
              ),
          ),
        );
        setFeedbackBanner({
          variant: "info",
          title: t.banners.keepSafeRemovedTitle,
          message: t.banners.keepSafeRemovedMessage(
            label,
            t.keepSafeStrip.scopeLabel(scope),
          ),
        });
      } else {
        const addedRule: ProtectionRuleRecord = payload.rule ?? {
          scope,
          pattern: normalizedPattern,
        };
        const nextRules = [
          addedRule,
          ...protectedRules.filter(
            (rule) =>
              !(
                rule.scope === scope &&
                normalizeProtectionPattern(rule.scope, rule.pattern) ===
                  normalizedPattern
              ),
          ),
        ];
        setProtectedRules(nextRules);
        const { protectedSenders: newlyProtected } =
          partitionSendersByProtection(senders, nextRules);
        const newlyProtectedEmails = new Set(
          newlyProtected.map((sender) => sender.senderEmail),
        );
        setSelectedEmails((prev) => {
          const next = new Set(prev);
          for (const email of newlyProtectedEmails) {
            next.delete(email);
          }
          return next;
        });
        setFeedbackBanner({
          variant: "success",
          title: t.banners.keepSafeEnabledTitle,
          message: t.banners.keepSafeEnabledMessage(
            label,
            t.keepSafeStrip.scopeLabel(scope),
          ),
        });
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t.banners.keepSafeErrorFallback,
      );
    } finally {
      setPendingRuleKey(null);
    }
  };

  const currentFilterAutoCleanRule = useMemo(
    () =>
      buildCurrentFilterAutoCleanRule(
        {
          preset,
          olderThan,
          largerThan,
          hasAttachment,
          unreadOnly,
          search,
        },
        t,
      ),
    [preset, olderThan, largerThan, hasAttachment, unreadOnly, search, t],
  );

  const builderCompiled = useMemo(
    () =>
      buildAutoCleanQueryFromBuilder({
        preset: builderPreset,
        olderThan: builderOlderThan,
        unreadOnly: builderUnreadOnly,
        hasAttachment: builderHasAttachment,
      }),
    [builderPreset, builderOlderThan, builderUnreadOnly, builderHasAttachment],
  );

  const handlePreviewBuilderImpact = async () => {
    if (!builderCompiled || isPreviewingBuilder) {
      return;
    }

    setIsPreviewingBuilder(true);
    setBuilderPreviewError(null);

    try {
      const response = await fetch("/api/gmail/auto-clean/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: builderCompiled.query,
        }),
      });

      const payload = (await response.json()) as Partial<AutoCleanQueryPreviewResult> & {
        error?: string;
      };

      if (!response.ok || typeof payload.query !== "string") {
        throw new Error(
          payload.error || t.errors.failedPreviewAutoClean(response.status),
        );
      }

      setBuilderPreviewResult({
        query: payload.query,
        resultSizeEstimate: payload.resultSizeEstimate ?? 0,
        inspectedCount: payload.inspectedCount ?? 0,
        cleanableCount: payload.cleanableCount ?? 0,
        protectedCount: payload.protectedCount ?? 0,
        sampleSenders: Array.isArray(payload.sampleSenders)
          ? payload.sampleSenders
          : [],
      });
    } catch (error) {
      setBuilderPreviewResult(null);
      setBuilderPreviewError(
        error instanceof Error
          ? error.message
          : t.errors.failedPreviewAutoClean(502),
      );
    } finally {
      setIsPreviewingBuilder(false);
    }
  };

  const handleUpdateAutoCleanRule = async (
    ruleId: string,
    patch: {
      isEnabled?: boolean;
      schedule?: AutoCleanRuleSchedule;
      action?: AutoCleanRuleAction;
    },
  ) => {
    if (
      isCleaning ||
      pendingAutoCleanKey !== null ||
      runningRuleId !== null ||
      removingRuleId !== null ||
      updatingRuleId !== null
    ) {
      return;
    }

    setUpdatingRuleId(ruleId);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/gmail/filters", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: ruleId,
          ...patch,
        }),
      });

      const payload = (await response.json()) as {
        rule?: AutoCleanRuleRecord;
        error?: string;
      };

      if (!response.ok || !payload.rule) {
        throw new Error(
          payload.error || t.errors.failedUpdateAutoClean(response.status),
        );
      }

      const updatedRule = payload.rule;
      setAutoCleanRules((prev) =>
        prev.map((item) => (item.id === updatedRule.id ? updatedRule : item)),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t.errors.failedUpdateAutoClean(502),
      );
    } finally {
      setUpdatingRuleId(null);
    }
  };

  const handleCreateAutoCleanRule = async (input: {
    type: AutoCleanRuleTypeValue;
    pattern: string;
    label: string;
    action?: AutoCleanRuleAction;
    schedule?: AutoCleanRuleSchedule;
  }) => {
    if (
      isCleaning ||
      pendingAutoCleanKey !== null ||
      runningRuleId !== null ||
      removingRuleId !== null ||
      updatingRuleId !== null
    ) {
      return;
    }

    const normalizedPattern = normalizeAutoCleanPattern(
      input.type,
      input.pattern,
    );
    if (!isValidAutoCleanPattern(input.type, normalizedPattern)) {
      return;
    }

    const ruleKey = getAutoCleanRuleKey(input.type, normalizedPattern);
    if (input.type === "CLEAN_QUERY") {
      setIsAutoCleanExpanded(true);
    }
    setPendingAutoCleanKey(ruleKey);
    setErrorMessage(null);
    setFeedbackBanner(null);

    try {
      const response = await fetch("/api/gmail/filters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: input.type,
          pattern: normalizedPattern,
          label: input.label.trim() || normalizedPattern,
          ...(input.action ? { action: input.action } : {}),
          ...(input.schedule ? { schedule: input.schedule } : {}),
        }),
      });

      const payload = (await response.json()) as {
        rule?: AutoCleanRuleRecord;
        error?: string;
        code?: string;
      };

      if (!response.ok) {
        if (
          response.status === 403 &&
          payload.code === "GMAIL_SETTINGS_SCOPE_REQUIRED"
        ) {
          throw new Error(
            payload.error || t.banners.gmailSettingsScopeRequiredSave,
          );
        }
        throw new Error(
          payload.error || t.errors.failedCreateAutoClean(response.status),
        );
      }

      if (payload.rule) {
        const savedRule = payload.rule;
        setAutoCleanRules((prev) => [
          savedRule,
          ...prev.filter((existing) => existing.id !== savedRule.id),
        ]);
      }

      const trimmedLabel = input.label.trim() || normalizedPattern;
      setFeedbackBanner({
        variant: "success",
        title:
          input.type === "CLEAN_QUERY"
            ? t.banners.autoCleanSavedTitle
            : t.banners.blockedInGmailTitle,
        message:
          input.type === "CLEAN_QUERY"
            ? t.banners.autoCleanSavedMessage(trimmedLabel)
            : t.banners.blockedInGmailMessage(
                input.type === "BLOCK_DOMAIN"
                  ? `@${normalizedPattern}`
                  : normalizedPattern,
              ),
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t.banners.autoCleanSaveErrorFallback,
      );
    } finally {
      setPendingAutoCleanKey(null);
    }
  };

  const handleBlockSender = (targetSender: SenderGroup) => {
    const label =
      targetSender.senderName &&
      targetSender.senderName !== targetSender.senderEmail
        ? `${targetSender.senderName} <${targetSender.senderEmail}>`
        : targetSender.senderEmail;
    void handleCreateAutoCleanRule({
      type: "BLOCK_SENDER",
      pattern: targetSender.senderEmail,
      label,
    });
  };

  const handleBlockDomain = (domain: SenderDomainNode) => {
    void handleCreateAutoCleanRule({
      type: "BLOCK_DOMAIN",
      pattern: domain.host,
      label: domain.host,
    });
  };

  const handleDeleteAutoCleanRule = async (rule: AutoCleanRuleRecord) => {
    if (
      isCleaning ||
      pendingAutoCleanKey !== null ||
      runningRuleId !== null ||
      removingRuleId !== null
    ) {
      return;
    }

    setRemovingRuleId(rule.id);
    setErrorMessage(null);
    setFeedbackBanner(null);

    try {
      const response = await fetch("/api/gmail/filters", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: rule.id }),
      });

      const payload = (await response.json()) as {
        removed?: boolean;
        error?: string;
        code?: string;
      };

      if (!response.ok) {
        if (
          response.status === 403 &&
          payload.code === "GMAIL_SETTINGS_SCOPE_REQUIRED"
        ) {
          throw new Error(
            payload.error || t.banners.gmailSettingsScopeRequiredRemove,
          );
        }
        throw new Error(
          payload.error || t.errors.failedRemoveAutoClean(response.status),
        );
      }

      setAutoCleanRules((prev) => prev.filter((item) => item.id !== rule.id));
      setFeedbackBanner({
        variant: "info",
        title: t.banners.ruleRemovedTitle,
        message:
          rule.type === "CLEAN_QUERY"
            ? t.banners.autoCleanRemovedMessage(rule.label)
            : t.banners.blockFilterRemovedMessage(rule.label),
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t.banners.autoCleanRemoveErrorFallback,
      );
    } finally {
      setRemovingRuleId(null);
    }
  };

  const handleRunAutoCleanRule = async (rule: AutoCleanRuleRecord) => {
    if (
      isCleaning ||
      pendingAutoCleanKey !== null ||
      runningRuleId !== null ||
      removingRuleId !== null ||
      rule.type !== "CLEAN_QUERY"
    ) {
      return;
    }

    setRunningRuleId(rule.id);
    setErrorMessage(null);
    setFeedbackBanner(null);

    try {
      const response = await fetch("/api/gmail/auto-clean/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ruleId: rule.id }),
      });

      const payload = (await response.json()) as {
        ruleId?: string;
        cleanResult?: CleanApiResponse;
        rule?: AutoCleanRuleRecord;
        error?: string;
      };

      if (!response.ok || !payload.cleanResult) {
        throw new Error(
          payload.error || t.errors.failedRunAutoClean(response.status),
        );
      }

      const { cleanResult } = payload;

      if (
        typeof cleanResult.totalReclaimedBytes === "number" &&
        Number.isFinite(cleanResult.totalReclaimedBytes)
      ) {
        setReclaimedBytes(cleanResult.totalReclaimedBytes);
      } else if (
        typeof cleanResult.reclaimedBytesAdded === "number" &&
        Number.isFinite(cleanResult.reclaimedBytesAdded)
      ) {
        const addedBytes = cleanResult.reclaimedBytesAdded;
        setReclaimedBytes((prev) => prev + addedBytes);
      }

      if (
        typeof cleanResult.totalCleanedMessagesCount === "number" &&
        Number.isFinite(cleanResult.totalCleanedMessagesCount)
      ) {
        setCleanedMessagesCount(cleanResult.totalCleanedMessagesCount);
      } else {
        setCleanedMessagesCount((prev) => prev + cleanResult.processedCount);
      }

      setAutoCleanRules((prev) =>
        prev.map((item) => {
          if (item.id !== rule.id) {
            return item;
          }
          if (payload.rule) {
            return payload.rule;
          }
          return {
            ...item,
            lastRunAt: new Date().toISOString(),
            lastRunCount: cleanResult.processedCount,
          };
        }),
      );

      const skippedCount =
        typeof cleanResult.skippedProtectedCount === "number" &&
        Number.isFinite(cleanResult.skippedProtectedCount)
          ? cleanResult.skippedProtectedCount
          : 0;
      const protectedNote =
        skippedCount > 0 ? t.banners.keptProtectedNote(skippedCount) : "";

      if (cleanResult.processedCount > 0) {
        void refreshCleanHistory();
      }

      setFeedbackBanner({
        variant: cleanResult.processedCount > 0 ? "success" : "info",
        title: t.banners.autoCleanCompletedTitle,
        message:
          cleanResult.processedCount > 0
            ? t.banners.autoCleanCompletedMovedMessage(
                cleanResult.processedCount,
                rule.label,
                protectedNote,
              )
            : t.banners.autoCleanCompletedNoneMessage(
                rule.label,
                protectedNote,
              ),
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t.banners.autoCleanRunErrorFallback,
      );
    } finally {
      setRunningRuleId(null);
    }
  };

  const toggleBrandExpanded = (brandKey: string) => {
    const updateExpandedBrands = () => {
      setExpandedBrands((prev) => {
        const next = new Set(prev);
        if (next.has(brandKey)) {
          next.delete(brandKey);
        } else {
          next.add(brandKey);
        }
        return next;
      });
    };

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const docWithViewTransition =
      typeof document !== "undefined"
        ? (document as Document & {
            startViewTransition?: (callback: () => void) => unknown;
          })
        : null;

    if (
      viewMode === "cards" &&
      !prefersReducedMotion &&
      typeof docWithViewTransition?.startViewTransition === "function"
    ) {
      docWithViewTransition.startViewTransition(() => {
        flushSync(updateExpandedBrands);
      });
      return;
    }

    updateExpandedBrands();
  };

  const toggleDomainExpanded = (domainKey: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domainKey)) {
        next.delete(domainKey);
      } else {
        next.add(domainKey);
      }
      return next;
    });
  };

  const expandAllTree = () => {
    setExpandedBrands(new Set(brandTree.map((brand) => brand.brandKey)));
    setExpandedDomains(
      new Set(
        brandTree.flatMap((brand) =>
          brand.domains.map((domain) =>
            getDomainExpansionKey(brand.brandKey, domain.host),
          ),
        ),
      ),
    );
  };

  const collapseAllTree = () => {
    setExpandedBrands(new Set());
    setExpandedDomains(new Set());
  };

  const executeCleanAction = async (
    targetSenders: SenderGroup[],
    action: "trash" | "delete" | "archive" | "mark_read",
    confirmPermanentDelete: boolean,
  ) => {
    const {
      cleanable: cleanableTargets,
      protectedSenders: protectedTargets,
    } = partitionSendersByProtection(targetSenders, protectedRules);
    const messageIds = collectUniqueMessageIds(cleanableTargets);
    const cleanableIdSet = new Set(messageIds);
    const clientProtectedMessageCount = collectUniqueMessageIds(
      protectedTargets,
    ).filter((id) => !cleanableIdSet.has(id)).length;

    if (messageIds.length === 0) {
      if (clientProtectedMessageCount > 0) {
        setFeedbackBanner({
          variant: "info",
          title: t.banners.protectedKeptSafeTitle,
          message: t.banners.protectedKeptSafeNoActionMessage(
            clientProtectedMessageCount,
            action,
          ),
        });
      }
      setPendingDelete(null);
      setConfirmDeleteChecked(false);
      return;
    }

    setIsCleaning(true);
    setCleaningAction(action);
    setErrorMessage(null);
    setFeedbackBanner(null);
    setLastTrashSnapshot(null);

    try {
      const response = await fetch("/api/gmail/messages/clean", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messageIds,
          action,
          confirmPermanentDelete,
        }),
      });

      const payload = (await response.json()) as CleanApiResponse;
      if (!response.ok) {
        throw new Error(
          payload.error || t.errors.failedCleanMessages(response.status),
        );
      }

      const serverSkippedCount =
        typeof payload.skippedProtectedCount === "number" &&
        Number.isFinite(payload.skippedProtectedCount)
          ? payload.skippedProtectedCount
          : 0;
      const totalKeptSafeCount =
        clientProtectedMessageCount + serverSkippedCount;

      if (payload.processedCount > 0) {
        const cleanedEmails = new Set(
          cleanableTargets.map((sender) => sender.senderEmail),
        );
        const removedMessageCount = cleanableTargets.reduce(
          (sum, sender) => sum + sender.messageCount,
          0,
        );

        if (action !== "mark_read") {
          setSenders((prev) =>
            prev.filter((sender) => !cleanedEmails.has(sender.senderEmail)),
          );
          const nextScannedCount = Math.max(
            0,
            scannedMessagesRef.current - removedMessageCount,
          );
          scannedMessagesRef.current = nextScannedCount;
          setScannedMessages(nextScannedCount);
        }

        setSelectedEmails((prev) => {
          const next = new Set(prev);
          for (const email of cleanedEmails) {
            next.delete(email);
          }
          return next;
        });

        if (action === "trash") {
          setLastTrashSnapshot({
            senders: cleanableTargets,
            messageIds,
            reclaimedBytesAdded:
              typeof payload.reclaimedBytesAdded === "number" &&
              Number.isFinite(payload.reclaimedBytesAdded)
                ? Math.max(0, Math.trunc(payload.reclaimedBytesAdded))
                : 0,
            removedMessageCount,
          });
        }
      }

      if (action === "trash" || action === "delete") {
        if (
          typeof payload.totalReclaimedBytes === "number" &&
          Number.isFinite(payload.totalReclaimedBytes)
        ) {
          setReclaimedBytes(payload.totalReclaimedBytes);
        } else if (
          typeof payload.reclaimedBytesAdded === "number" &&
          Number.isFinite(payload.reclaimedBytesAdded)
        ) {
          const addedBytes = payload.reclaimedBytesAdded;
          setReclaimedBytes((prev) => prev + addedBytes);
        }

        if (
          typeof payload.totalCleanedMessagesCount === "number" &&
          Number.isFinite(payload.totalCleanedMessagesCount)
        ) {
          setCleanedMessagesCount(payload.totalCleanedMessagesCount);
        } else {
          setCleanedMessagesCount((prev) => prev + payload.processedCount);
        }
      }

      const baseSummary =
        action === "trash"
          ? t.banners.cleanupTrashSummary(
              payload.processedCount,
              cleanableTargets.length,
            )
          : action === "archive"
            ? t.banners.cleanupArchiveSummary(
                payload.processedCount,
                cleanableTargets.length,
              )
            : action === "mark_read"
              ? t.banners.cleanupMarkReadSummary(
                  payload.processedCount,
                  cleanableTargets.length,
                )
              : t.banners.cleanupDeleteSummary(
                  payload.processedCount,
                  cleanableTargets.length,
                );
      const protectedNote =
        totalKeptSafeCount > 0
          ? t.banners.keptProtectedNote(totalKeptSafeCount)
          : "";

      if (payload.processedCount > 0) {
        void refreshCleanHistory();
      }

      setFeedbackBanner({
        variant: payload.processedCount > 0 ? "success" : "info",
        title:
          payload.processedCount > 0
            ? t.banners.cleanupCompletedTitle
            : t.banners.protectedKeptSafeTitle,
        message:
          payload.processedCount > 0
            ? `${baseSummary}${protectedNote}`
            : t.banners.protectedKeptSafeNoActionMessage(
                totalKeptSafeCount,
                action,
              ),
        canUndo: action === "trash" && payload.processedCount > 0,
      });
      setPendingDelete(null);
      setConfirmDeleteChecked(false);
      setPreviewTarget(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t.banners.cleanupErrorFallback,
      );
    } finally {
      setIsCleaning(false);
      setCleaningAction(null);
    }
  };

  const handleEmptyTrash = async () => {
    setIsCleaning(true);
    setCleaningAction("empty_trash");
    setErrorMessage(null);
    setFeedbackBanner(null);

    try {
      const response = await fetch("/api/gmail/trash/empty", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmEmptyTrash: true,
        }),
      });

      const payload = (await response.json()) as {
        deletedCount?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          payload.error || t.errors.failedEmptyTrash(response.status),
        );
      }

      const deletedCount =
        typeof payload.deletedCount === "number" &&
        Number.isFinite(payload.deletedCount)
          ? Math.max(0, Math.trunc(payload.deletedCount))
          : 0;

      if (deletedCount > 0) {
        void refreshCleanHistory();
      }

      setFeedbackBanner({
        variant: deletedCount > 0 ? "success" : "info",
        title: t.banners.emptyTrashCompletedTitle,
        message: t.banners.emptyTrashCompletedSummary(deletedCount),
      });
      setIsEmptyTrashModalOpen(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t.banners.emptyTrashErrorFallback,
      );
    } finally {
      setIsCleaning(false);
      setCleaningAction(null);
    }
  };

  const handleUndoLastTrash = async () => {
    if (!lastTrashSnapshot || isCleaning || isUndoing) {
      return;
    }

    const snapshot = lastTrashSnapshot;
    setIsUndoing(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/gmail/messages/clean", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messageIds: snapshot.messageIds,
          action: "untrash",
          confirmPermanentDelete: false,
          restoreReclaimedBytes: snapshot.reclaimedBytesAdded,
        }),
      });

      const payload = (await response.json()) as CleanApiResponse;
      if (!response.ok) {
        throw new Error(
          payload.error || t.errors.failedCleanMessages(response.status),
        );
      }

      setSenders((prev) => mergeSenderGroups(prev, snapshot.senders));
      scannedMessagesRef.current += snapshot.removedMessageCount;
      setScannedMessages(scannedMessagesRef.current);

      if (
        typeof payload.totalReclaimedBytes === "number" &&
        Number.isFinite(payload.totalReclaimedBytes)
      ) {
        setReclaimedBytes(Math.max(0, payload.totalReclaimedBytes));
      } else {
        setReclaimedBytes((prev) =>
          Math.max(0, prev - snapshot.reclaimedBytesAdded),
        );
      }

      if (
        typeof payload.totalCleanedMessagesCount === "number" &&
        Number.isFinite(payload.totalCleanedMessagesCount)
      ) {
        setCleanedMessagesCount(
          Math.max(0, payload.totalCleanedMessagesCount),
        );
      } else {
        setCleanedMessagesCount((prev) =>
          Math.max(0, prev - payload.processedCount),
        );
      }

      if (payload.processedCount > 0) {
        void refreshCleanHistory();
      }

      setLastTrashSnapshot(null);
      setFeedbackBanner({
        variant: "info",
        title: t.banners.undoCompletedTitle,
        message: t.banners.undoCompletedSummary(
          payload.processedCount,
          snapshot.senders.length,
        ),
        canUndo: false,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t.banners.cleanupErrorFallback,
      );
    } finally {
      setIsUndoing(false);
    }
  };

  const handleUnsubscribeSender = async (sender: SenderGroup) => {
    if (isCleaning || sender.messageIds.length === 0) {
      return;
    }

    const currentState = unsubscribeStates[sender.senderEmail];
    if (currentState?.status === "loading") {
      return;
    }

    setUnsubscribeStates((prev) => ({
      ...prev,
      [sender.senderEmail]: { status: "loading" },
    }));
    setErrorMessage(null);
    setFeedbackBanner(null);

    try {
      const response = await fetch("/api/gmail/unsubscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          senderEmail: sender.senderEmail,
          messageIds: sender.messageIds,
        }),
      });

      const payload = (await response.json()) as UnsubscribeApiResponse;
      if (!response.ok) {
        throw new Error(
          payload.error ||
            t.errors.failedUnsubscribe(sender.senderEmail, response.status),
        );
      }

      if (payload.status === "unsubscribed") {
        setUnsubscribeStates((prev) => ({
          ...prev,
          [sender.senderEmail]: {
            status: "unsubscribed",
            method: payload.method,
            target: payload.target,
          },
        }));
        setFeedbackBanner({
          variant: "success",
          title: t.banners.unsubscribedTitle,
          message:
            payload.method === "one-click-http"
              ? t.banners.unsubscribedOneClickMessage(sender.senderEmail)
              : t.banners.unsubscribedMailtoMessage(
                  payload.target,
                  sender.senderEmail,
                ),
        });
        return;
      }

      if (payload.status === "action_required") {
        setUnsubscribeStates((prev) => ({
          ...prev,
          [sender.senderEmail]: {
            status: "action_required",
            method: payload.method,
            url: payload.url,
          },
        }));
        setFeedbackBanner({
          variant: "info",
          title: t.banners.unsubscribeActionRequiredTitle,
          message: t.banners.unsubscribeActionRequiredMessage(
            sender.senderEmail,
          ),
        });
        return;
      }

      setUnsubscribeStates((prev) => ({
        ...prev,
        [sender.senderEmail]: { status: "not_found" },
      }));
      setFeedbackBanner({
        variant: "info",
        title: t.banners.unsubscribeNotFoundTitle,
        message: t.banners.unsubscribeNotFoundMessage(sender.senderEmail),
      });
    } catch (error) {
      setUnsubscribeStates((prev) => {
        const next = { ...prev };
        if (currentState) {
          next[sender.senderEmail] = currentState;
        } else {
          delete next[sender.senderEmail];
        }
        return next;
      });
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t.banners.unsubscribeErrorFallback(sender.senderEmail),
      );
    }
  };

  const handleStopBulkUnsubscribe = () => {
    bulkUnsubscribeCancelRef.current = true;
    bulkUnsubscribeAbortRef.current?.abort();
  };

  const handleBulkUnsubscribe = async () => {
    if (isBusy || eligibleUnsubscribeSenders.length === 0) {
      return;
    }

    const targets = [...eligibleUnsubscribeSenders];
    const outcomes: BulkUnsubscribeItemOutcome[] = [];
    bulkUnsubscribeCancelRef.current = false;
    setErrorMessage(null);
    setFeedbackBanner(null);

    try {
      for (let i = 0; i < targets.length; i += 1) {
        if (bulkUnsubscribeCancelRef.current) {
          break;
        }

        const sender = targets[i];
        const previousState = unsubscribeStatesRef.current[sender.senderEmail];

        setBulkUnsubscribeProgress({
          current: i + 1,
          total: targets.length,
          currentSender: sender.senderEmail,
        });
        setUnsubscribeStates((prev) => ({
          ...prev,
          [sender.senderEmail]: { status: "loading" },
        }));

        const controller = new AbortController();
        bulkUnsubscribeAbortRef.current = controller;

        try {
          const response = await fetch("/api/gmail/unsubscribe", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              senderEmail: sender.senderEmail,
              messageIds: sender.messageIds,
            }),
            signal: controller.signal,
          });

          const payload = (await response.json()) as UnsubscribeApiResponse;
          if (!response.ok) {
            throw new Error(
              payload.error ||
                t.errors.failedUnsubscribe(sender.senderEmail, response.status),
            );
          }

          if (payload.status === "unsubscribed") {
            setUnsubscribeStates((prev) => ({
              ...prev,
              [sender.senderEmail]: {
                status: "unsubscribed",
                method: payload.method,
                target: payload.target,
              },
            }));
            outcomes.push({
              senderEmail: sender.senderEmail,
              status: "unsubscribed",
            });
          } else if (payload.status === "action_required") {
            setUnsubscribeStates((prev) => ({
              ...prev,
              [sender.senderEmail]: {
                status: "action_required",
                method: payload.method,
                url: payload.url,
              },
            }));
            outcomes.push({
              senderEmail: sender.senderEmail,
              status: "action_required",
            });
          } else {
            setUnsubscribeStates((prev) => ({
              ...prev,
              [sender.senderEmail]: { status: "not_found" },
            }));
            outcomes.push({
              senderEmail: sender.senderEmail,
              status: "not_found",
            });
          }
        } catch (error) {
          setUnsubscribeStates((prev) => {
            const next = { ...prev };
            if (previousState) {
              next[sender.senderEmail] = previousState;
            } else {
              delete next[sender.senderEmail];
            }
            return next;
          });

          if (
            (error instanceof DOMException && error.name === "AbortError") ||
            bulkUnsubscribeCancelRef.current
          ) {
            break;
          }

          outcomes.push({
            senderEmail: sender.senderEmail,
            status: "failed",
          });
        } finally {
          if (bulkUnsubscribeAbortRef.current === controller) {
            bulkUnsubscribeAbortRef.current = null;
          }
        }
      }
    } finally {
      bulkUnsubscribeAbortRef.current = null;
      setBulkUnsubscribeProgress(null);

      const wasCancelled = bulkUnsubscribeCancelRef.current;
      const summary = summarizeBulkUnsubscribeResults(outcomes, {
        cancelled: wasCancelled,
      });

      if (summary.totalAttempted > 0 || wasCancelled) {
        setFeedbackBanner({
          variant:
            summary.unsubscribed > 0 && summary.failed === 0
              ? "success"
              : "info",
          title: wasCancelled
            ? t.banners.bulkUnsubscribeStoppedTitle
            : t.banners.bulkUnsubscribeCompleteTitle,
          message: t.banners.bulkUnsubscribeSummaryMessage(summary),
        });
      }
    }
  };

  const openPermanentDeleteModal = (targetSenders: SenderGroup[]) => {
    const {
      cleanable: cleanableTargets,
      protectedSenders: protectedTargets,
    } = partitionSendersByProtection(targetSenders, protectedRules);
    const messageIds = collectUniqueMessageIds(cleanableTargets);
    const cleanableIdSet = new Set(messageIds);
    const skippedProtectedCount = collectUniqueMessageIds(
      protectedTargets,
    ).filter((id) => !cleanableIdSet.has(id)).length;

    if (messageIds.length === 0) {
      if (skippedProtectedCount > 0) {
        setFeedbackBanner({
          variant: "info",
          title: t.banners.protectedKeptSafeTitle,
          message: t.banners.protectedKeptSafeNoActionMessage(
            skippedProtectedCount,
            "delete",
          ),
        });
      }
      return;
    }

    const size = cleanableTargets.reduce(
      (sum, sender) => sum + sender.totalSizeBytes,
      0,
    );
    setConfirmDeleteChecked(false);
    setPendingDelete({
      senders: cleanableTargets,
      messageIds,
      totalSizeBytes: size,
      skippedProtectedCount,
    });
  };

  const openPreviewForBrand = (brand: SenderBrandNode) => {
    if (brand.messageIds.length === 0) {
      return;
    }
    const brandSenders = brand.domains.flatMap((domain) => domain.senders);
    setPreviewTarget({
      title: brand.brandLabel,
      subtitle: t.previewModal.brandSubtitle(
        brand.domains.length,
        brandSenders.length,
      ),
      senders: brandSenders,
      messageIds: brand.messageIds,
      messageCount: brand.messageCount,
      totalSizeBytes: brand.totalSizeBytes,
    });
  };

  const openPreviewForDomain = (domain: SenderDomainNode) => {
    if (domain.messageIds.length === 0) {
      return;
    }
    setPreviewTarget({
      title: domain.host,
      subtitle: t.previewModal.domainSubtitle(domain.senders.length),
      senders: domain.senders,
      messageIds: domain.messageIds,
      messageCount: domain.messageCount,
      totalSizeBytes: domain.totalSizeBytes,
    });
  };

  const openPreviewForSender = (sender: SenderGroup) => {
    if (sender.messageIds.length === 0) {
      return;
    }
    setPreviewTarget({
      title: sender.senderName,
      subtitle: sender.senderEmail,
      senders: [sender],
      messageIds: sender.messageIds,
      messageCount: sender.messageCount,
      totalSizeBytes: sender.totalSizeBytes,
    });
  };

  const formattedExpiry = formatPassExpiry(user.passExpiresAt, intlLocale);
  const badgeClasses = PASS_STATUS_STYLES[user.passStatus];
  const isBulkUnsubscribing = bulkUnsubscribeProgress !== null;
  const isBusy = isScanning || isCleaning || isBulkUnsubscribing;
  const cleaningActionLabel =
    cleaningAction === "trash"
      ? t.results.movingToTrashStatus
      : cleaningAction === "archive"
        ? t.results.archivingStatus
        : cleaningAction === "mark_read"
          ? t.results.markingAsReadStatus
          : cleaningAction === "empty_trash"
            ? t.results.emptyingTrashStatus
            : cleaningAction === "delete"
              ? t.results.deletingPermanentlyStatus
              : null;

  const displayProgressTotal =
    estimatedTotal !== null ? Math.max(scannedMessages, estimatedTotal) : 0;
  const progressPercent =
    estimatedTotal !== null && displayProgressTotal > 0
      ? Math.min(
          100,
          Math.round((scannedMessages / displayProgressTotal) * 100),
        )
      : 0;

  const isAutoCleanOpen =
    isAutoCleanExpanded ||
    runningRuleId !== null ||
    (pendingAutoCleanKey !== null &&
      pendingAutoCleanKey.startsWith("CLEAN_QUERY:"));

  const hasActiveScanFilters =
    preset !== "all" ||
    olderThan !== "any" ||
    largerThan !== "any" ||
    hasAttachment ||
    unreadOnly ||
    onlyUnsubscribable ||
    search.trim().length > 0 ||
    activeFilters.preset !== "all" ||
    activeFilters.olderThan !== "any" ||
    activeFilters.largerThan !== "any" ||
    activeFilters.hasAttachment ||
    activeFilters.unreadOnly ||
    activeFilters.search.trim().length > 0;

  const activeSecondaryFilterCount =
    (olderThan !== "any" ? 1 : 0) +
    (largerThan !== "any" ? 1 : 0) +
    (hasAttachment ? 1 : 0) +
    (unreadOnly ? 1 : 0) +
    (search.trim().length > 0 ? 1 : 0);

  const rulesTabBadgeCount = autoCleanRules.length + protectedRules.length;

  const renderBrandTreeRow = (brand: SenderBrandNode) => (
    <BrandTreeRow
      key={brand.brandKey}
      brand={brand}
      totalScannedBytes={totalSizeBytes}
      isExpanded={expandedBrands.has(brand.brandKey)}
      expandedDomains={expandedDomains}
      isBusy={isBusy}
      isCleaning={isCleaning}
      selectedEmails={selectedEmails}
      protectedRules={protectedRules}
      autoCleanRules={autoCleanRules}
      pendingRuleKey={pendingRuleKey}
      pendingAutoCleanKey={pendingAutoCleanKey}
      unsubscribeStates={unsubscribeStates}
      t={t.tree}
      intlLocale={intlLocale}
      onToggleBrandExpand={toggleBrandExpanded}
      onToggleDomainExpand={toggleDomainExpanded}
      onToggleGroupSelection={toggleGroupSelection}
      onToggleSenderSelection={toggleSenderSelection}
      onToggleKeepSafe={(scope, pattern, label) =>
        void handleToggleKeepSafe(scope, pattern, label)
      }
      onBlockDomain={handleBlockDomain}
      onBlockSender={handleBlockSender}
      onViewBrandEmails={openPreviewForBrand}
      onViewDomainEmails={openPreviewForDomain}
      onViewSenderEmails={openPreviewForSender}
      onUnsubscribe={(target) => void handleUnsubscribeSender(target)}
      onMoveToTrash={(targetSenders) =>
        void executeCleanAction(targetSenders, "trash", false)
      }
      onArchive={(targetSenders) =>
        void executeCleanAction(targetSenders, "archive", false)
      }
      onMarkAsRead={(targetSenders) =>
        void executeCleanAction(targetSenders, "mark_read", false)
      }
      onDeletePermanently={openPermanentDeleteModal}
    />
  );

  const renderBrandGridCard = (brand: SenderBrandNode) => (
    <BrandGridCard
      key={brand.brandKey}
      brand={brand}
      totalScannedBytes={totalSizeBytes}
      isExpanded={expandedBrands.has(brand.brandKey)}
      expandedDomains={expandedDomains}
      isBusy={isBusy}
      isCleaning={isCleaning}
      selectedEmails={selectedEmails}
      protectedRules={protectedRules}
      autoCleanRules={autoCleanRules}
      pendingRuleKey={pendingRuleKey}
      pendingAutoCleanKey={pendingAutoCleanKey}
      unsubscribeStates={unsubscribeStates}
      t={t.tree}
      intlLocale={intlLocale}
      onToggleBrandExpand={toggleBrandExpanded}
      onToggleDomainExpand={toggleDomainExpanded}
      onToggleGroupSelection={toggleGroupSelection}
      onToggleSenderSelection={toggleSenderSelection}
      onToggleKeepSafe={(scope, pattern, label) =>
        void handleToggleKeepSafe(scope, pattern, label)
      }
      onBlockDomain={handleBlockDomain}
      onBlockSender={handleBlockSender}
      onViewBrandEmails={openPreviewForBrand}
      onViewDomainEmails={openPreviewForDomain}
      onViewSenderEmails={openPreviewForSender}
      onUnsubscribe={(target) => void handleUnsubscribeSender(target)}
      onMoveToTrash={(targetSenders) =>
        void executeCleanAction(targetSenders, "trash", false)
      }
      onArchive={(targetSenders) =>
        void executeCleanAction(targetSenders, "archive", false)
      }
      onMarkAsRead={(targetSenders) =>
        void executeCleanAction(targetSenders, "mark_read", false)
      }
      onDeletePermanently={openPermanentDeleteModal}
    />
  );

  const renderSenderRow = (sender: SenderGroup) => (
    <SenderRow
      key={sender.senderEmail}
      sender={sender}
      isSelected={selectedEmails.has(sender.senderEmail)}
      isBusy={isBusy}
      isCleaning={isCleaning}
      protectedRules={protectedRules}
      autoCleanRules={autoCleanRules}
      pendingRuleKey={pendingRuleKey}
      pendingAutoCleanKey={pendingAutoCleanKey}
      unsubscribeState={unsubscribeStates[sender.senderEmail]}
      t={t.tree}
      intlLocale={intlLocale}
      onToggleSelect={toggleSenderSelection}
      onToggleKeepSafe={(scope, pattern, label) =>
        void handleToggleKeepSafe(scope, pattern, label)
      }
      onBlockSender={handleBlockSender}
      onViewEmails={openPreviewForSender}
      onUnsubscribe={(target) => void handleUnsubscribeSender(target)}
      onMoveToTrash={(target) =>
        void executeCleanAction([target], "trash", false)
      }
      onArchive={(target) =>
        void executeCleanAction([target], "archive", false)
      }
      onMarkAsRead={(target) =>
        void executeCleanAction([target], "mark_read", false)
      }
      onDeletePermanently={(target) => openPermanentDeleteModal([target])}
    />
  );

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-emerald-500/25 selection:text-foreground">
      <header className="border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl border border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300">
              <Inbox className="size-4.5" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight sm:text-lg">
                mailCleaner
              </h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                {t.tagline}
              </p>
            </div>
          </div>

          <nav
            aria-label={t.tabs.navAriaLabel}
            role="tablist"
            className="order-3 flex w-full items-center gap-1 rounded-xl border border-border bg-muted/40 p-1 sm:order-2 sm:w-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "clean"}
              onClick={() => setActiveTab("clean")}
              className={`inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors sm:flex-initial ${
                activeTab === "clean"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="size-3.5" />
              <span>{t.tabs.clean}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "rules"}
              onClick={() => setActiveTab("rules")}
              className={`inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors sm:flex-initial ${
                activeTab === "rules"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ShieldCheck className="size-3.5" />
              <span>{t.tabs.rules}</span>
              <span className="rounded-full border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {rulesTabBadgeCount}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "history"}
              onClick={() => setActiveTab("history")}
              className={`inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors sm:flex-initial ${
                activeTab === "history"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <History className="size-3.5" />
              <span>{t.tabs.history}</span>
              <span className="rounded-full border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {cleanHistory.length}
              </span>
            </button>
          </nav>

          <div
            ref={accountMenuRef}
            className="relative order-2 flex items-center gap-2 sm:order-3"
          >
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={isAccountMenuOpen}
              onClick={() => setIsAccountMenuOpen((prev) => !prev)}
              className="mc-btn-press inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <User className="size-3.5" />
              </span>
              <span className="hidden max-w-[140px] truncate sm:inline">
                {user.name || user.email || t.accountMenu.buttonLabel}
              </span>
              <span className="sm:hidden">{t.accountMenu.buttonLabel}</span>
              <ChevronDown
                className={`size-3.5 text-muted-foreground transition-transform duration-150 ${
                  isAccountMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isAccountMenuOpen ? (
              <div
                role="menu"
                aria-label={t.accountMenu.menuAriaLabel}
                className="absolute top-full right-0 z-50 mt-2 w-72 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl"
              >
                <div className="space-y-1 border-b border-border pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">
                      {user.name || t.accountMenu.buttonLabel}
                    </p>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeClasses}`}
                    >
                      {t.passStatusLabel(user.passStatus)}
                    </span>
                  </div>
                  {user.email ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  ) : null}
                  {formattedExpiry ? (
                    <p className="text-[11px] text-muted-foreground">
                      {t.passExpires(formattedExpiry)}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-2 border-b border-border py-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t.accountMenu.preferencesLabel}
                  </span>
                  <ThemeLangControls />
                </div>

                <div className="mt-2 space-y-1.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsAccountMenuOpen(false);
                      setIsPrivacyModalOpen(true);
                    }}
                    className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <Shield className="size-3.5 text-muted-foreground" />
                    <span>{t.privacyAndData}</span>
                  </button>

                  <form action={onSignOut}>
                    <button
                      type="submit"
                      role="menuitem"
                      className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <LogOut className="size-3.5" />
                      <span>{t.signOut}</span>
                    </button>
                  </form>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main
        className={`mx-auto max-w-6xl space-y-4 px-4 py-5 sm:px-6 ${
          activeTab === "clean" && selectedSenders.length > 0 ? "pb-24" : ""
        }`}
      >
        {activeTab === "clean" ? (
          <>
            <section
              aria-label={t.summary.scannedMessages}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-xs"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs sm:text-sm">
                <span
                  title={
                    activeQuery
                      ? t.summary.queryPrefix(activeQuery)
                      : t.summary.queryAll
                  }
                  className="inline-flex items-center gap-1.5 font-medium tabular-nums"
                >
                  <Mail className="size-3.5 text-muted-foreground" />
                  <span>
                    {t.summary.scannedMessages}:{" "}
                    <AnimatedScanCount
                      value={scannedMessages}
                      intlLocale={intlLocale}
                    />
                  </span>
                </span>

                <span
                  aria-hidden="true"
                  className="hidden text-border sm:inline"
                >
                  |
                </span>

                <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
                  <Users className="size-3.5 text-muted-foreground" />
                  <span>
                    {t.summary.compactSendersSize(
                      senders.length,
                      senders.length.toLocaleString(intlLocale),
                      formatBytes(totalSizeBytes),
                    )}
                  </span>
                </span>

                <span
                  aria-hidden="true"
                  className="hidden text-border sm:inline"
                >
                  |
                </span>

                <span
                  title={t.summary.emailsCleaned(
                    cleanedMessagesCount.toLocaleString(intlLocale),
                  )}
                  className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 tabular-nums dark:text-emerald-300"
                >
                  <Sparkles className="size-3.5" />
                  <span>
                    {t.summary.compactReclaimed(formatBytes(reclaimedBytes))}
                  </span>
                </span>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mc-btn-press min-h-8"
                disabled={isBusy}
                onClick={() => setIsEmptyTrashModalOpen(true)}
              >
                <Trash2 className="size-3.5" />
                {t.results.emptyTrash}
              </Button>
            </section>

            <section className="rounded-xl border border-border bg-card p-3 shadow-xs">
              <form
                onSubmit={(event) => {
                  setIsFiltersOpen(false);
                  handleScanSubmit(event);
                }}
                className="flex flex-wrap items-center justify-between gap-2.5"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {PRESET_VALUES.map((presetValue) => {
                    const isActive = preset === presetValue;
                    return (
                      <Button
                        key={presetValue}
                        type="button"
                        size="sm"
                        variant={isActive ? "default" : "outline"}
                        className={`mc-btn-press min-h-8 ${isActive ? "shadow-xs" : ""}`.trim()}
                        disabled={isCleaning}
                        onClick={() => {
                          abortOnFilterChange(true);
                          setPreset(presetValue);
                        }}
                      >
                        {t.filters.presets[presetValue]}
                      </Button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div ref={filtersPopoverRef} className="relative">
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        activeSecondaryFilterCount > 0 ? "secondary" : "outline"
                      }
                      aria-expanded={isFiltersOpen}
                      aria-haspopup="dialog"
                      disabled={isCleaning}
                      onClick={() => setIsFiltersOpen((prev) => !prev)}
                      className="mc-btn-press min-h-8"
                    >
                      <SlidersHorizontal className="size-3.5" />
                      <span>{t.filters.filtersButton}</span>
                      {activeSecondaryFilterCount > 0 ? (
                        <span className="inline-flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white tabular-nums">
                          {activeSecondaryFilterCount}
                        </span>
                      ) : null}
                    </Button>

                    {isFiltersOpen ? (
                      <div
                        role="dialog"
                        aria-label={t.filters.filtersPopoverAriaLabel}
                        className="absolute top-full right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl sm:w-96"
                      >
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label
                              htmlFor="filter-search"
                              className="block text-xs font-medium text-muted-foreground"
                            >
                              {t.filters.searchLabel}
                            </label>
                            <div className="relative">
                              <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
                              <input
                                id="filter-search"
                                type="text"
                                value={search}
                                onChange={(event) => {
                                  abortOnFilterChange(true);
                                  setSearch(event.target.value);
                                }}
                                placeholder={t.filters.searchPlaceholder}
                                disabled={isCleaning}
                                className="h-8 w-full rounded-lg border border-input bg-background pr-3 pl-8 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="space-y-1">
                              <label
                                htmlFor="filter-age"
                                className="block text-xs font-medium text-muted-foreground"
                              >
                                {t.filters.ageLabel}
                              </label>
                              <select
                                id="filter-age"
                                value={olderThan}
                                onChange={(event) => {
                                  abortOnFilterChange(true);
                                  setOlderThan(
                                    event.target.value as GmailAgeFilter,
                                  );
                                }}
                                disabled={isCleaning}
                                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
                              >
                                {AGE_VALUES.map((ageValue) => (
                                  <option
                                    key={ageValue}
                                    value={ageValue}
                                    className="bg-popover text-popover-foreground"
                                  >
                                    {t.filters.ageOptions[ageValue]}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label
                                htmlFor="filter-size"
                                className="block text-xs font-medium text-muted-foreground"
                              >
                                {t.filters.sizeLabel}
                              </label>
                              <select
                                id="filter-size"
                                value={largerThan}
                                onChange={(event) => {
                                  abortOnFilterChange(true);
                                  setLargerThan(
                                    event.target.value as GmailSizeFilter,
                                  );
                                }}
                                disabled={isCleaning}
                                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
                              >
                                {SIZE_VALUES.map((sizeValue) => (
                                  <option
                                    key={sizeValue}
                                    value={sizeValue}
                                    className="bg-popover text-popover-foreground"
                                  >
                                    {t.filters.sizeOptions[sizeValue]}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <Button
                              type="button"
                              size="sm"
                              variant={hasAttachment ? "default" : "outline"}
                              aria-pressed={hasAttachment}
                              className="mc-btn-press min-h-8 text-xs"
                              disabled={isCleaning}
                              onClick={() => {
                                abortOnFilterChange(true);
                                setHasAttachment((prev) => !prev);
                              }}
                            >
                              <Paperclip className="size-3.5" />
                              {t.filters.withAttachments}
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              variant={
                                hasAttachment && largerThan === "5M"
                                  ? "default"
                                  : "outline"
                              }
                              aria-pressed={
                                hasAttachment && largerThan === "5M"
                              }
                              className="mc-btn-press min-h-8 text-xs"
                              disabled={isCleaning || isBulkUnsubscribing}
                              onClick={() => {
                                abortOnFilterChange(true);
                                setHasAttachment(true);
                                setLargerThan("5M");
                              }}
                            >
                              <Paperclip className="size-3.5" />
                              {t.filters.heavyAttachments}
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              variant={unreadOnly ? "default" : "outline"}
                              aria-pressed={unreadOnly}
                              className="mc-btn-press min-h-8 text-xs"
                              disabled={isCleaning || isBulkUnsubscribing}
                              onClick={() => {
                                abortOnFilterChange(true);
                                setUnreadOnly((prev) => !prev);
                              }}
                            >
                              <Mail className="size-3.5" />
                              {t.filters.unreadOnly}
                            </Button>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                            {currentFilterAutoCleanRule ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mc-btn-press min-h-8 text-xs"
                                disabled={
                                  isCleaning ||
                                  pendingAutoCleanKey !== null ||
                                  runningRuleId !== null ||
                                  removingRuleId !== null ||
                                  Boolean(
                                    findAutoCleanRule(
                                      autoCleanRules,
                                      "CLEAN_QUERY",
                                      currentFilterAutoCleanRule.pattern,
                                    ),
                                  )
                                }
                                onClick={() =>
                                  void handleCreateAutoCleanRule({
                                    type: "CLEAN_QUERY",
                                    pattern: currentFilterAutoCleanRule.pattern,
                                    label: currentFilterAutoCleanRule.label,
                                  })
                                }
                              >
                                {pendingAutoCleanKey ===
                                getAutoCleanRuleKey(
                                  "CLEAN_QUERY",
                                  currentFilterAutoCleanRule.pattern,
                                ) ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <BookmarkPlus className="size-3.5" />
                                )}
                                {t.autoClean.saveCurrentFilter}
                              </Button>
                            ) : (
                              <span />
                            )}

                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mc-btn-press min-h-8 text-xs"
                              disabled={
                                isCleaning ||
                                isBulkUnsubscribing ||
                                !hasActiveScanFilters
                              }
                              onClick={() => {
                                setIsFiltersOpen(false);
                                handleResetFilters();
                              }}
                            >
                              <RotateCcw className="size-3.5" />
                              {t.filters.resetButton}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <Button
                    type="submit"
                    size="sm"
                    disabled={isCleaning}
                    className="mc-btn-press min-h-8 bg-brand text-white hover:bg-brand/90"
                  >
                    {isScanning ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    {t.filters.scanInbox}
                  </Button>
                </div>
              </form>
            </section>

            {!isOnboardingDismissed ? (
          <section
            aria-label={t.onboarding.ariaLabel}
            className="flex flex-col gap-3 rounded-xl border border-brand-border bg-brand-soft/40 p-4 shadow-xs"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-brand">
                <Sparkles className="size-4 shrink-0" />
                <span>{t.onboarding.title}</span>
              </div>
              <button
                type="button"
                onClick={dismissOnboarding}
                aria-label={t.onboarding.dismissAriaLabel}
                className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <ol className="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-3">
              <li className="rounded-lg border border-border/70 bg-card/70 px-3 py-2">
                <p className="font-semibold text-foreground">
                  {t.onboarding.step1Title}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {t.onboarding.step1Desc}
                </p>
              </li>
              <li className="rounded-lg border border-border/70 bg-card/70 px-3 py-2">
                <p className="font-semibold text-foreground">
                  {t.onboarding.step2Title}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {t.onboarding.step2Desc}
                </p>
              </li>
              <li className="rounded-lg border border-border/70 bg-card/70 px-3 py-2">
                <p className="font-semibold text-foreground">
                  {t.onboarding.step3Title}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {t.onboarding.step3Desc}
                </p>
              </li>
            </ol>
          </section>
        ) : null}
          </>
        ) : null}

        {errorMessage ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">{t.banners.actionFailed}</p>
              <p className="mt-0.5 text-xs opacity-90">{errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              aria-label={t.banners.dismissAriaLabel}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-destructive/80 transition-colors hover:bg-destructive/15 hover:text-destructive"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}

        {feedbackBanner ? (
          <div
            role="status"
            className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
              feedbackBanner.variant === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
            }`}
          >
            {feedbackBanner.variant === "success" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0" />
            )}
            <div className="flex-1">
              <p className="font-medium">{feedbackBanner.title}</p>
              <p className="mt-0.5 text-xs opacity-90">
                {feedbackBanner.message}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {feedbackBanner.canUndo && lastTrashSnapshot ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isCleaning || isUndoing}
                  onClick={() => void handleUndoLastTrash()}
                  className="mc-btn-press h-7 border-current/30 bg-background/80 px-2.5 text-xs text-foreground hover:bg-background"
                >
                  {isUndoing ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  {isUndoing ? t.banners.undoingButton : t.banners.undoButton}
                </Button>
              ) : null}
              <button
                type="button"
                onClick={() => setFeedbackBanner(null)}
                aria-label={t.banners.dismissAriaLabel}
                className="inline-flex size-6 items-center justify-center rounded-md opacity-75 transition-opacity hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        ) : null}

        {activeTab === "rules" ? (
          <>
            <section
              aria-label={t.autoClean.ariaLabel}
              className="rounded-xl border border-border bg-card p-4 shadow-xs"
            >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Ban className="size-4 text-primary" />
                <h2 className="text-sm font-semibold">{t.autoClean.title}</h2>
                <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                  {autoCleanRules.length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t.autoClean.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {currentFilterAutoCleanRule ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mc-btn-press"
                  disabled={
                    isCleaning ||
                    pendingAutoCleanKey !== null ||
                    runningRuleId !== null ||
                    removingRuleId !== null ||
                    Boolean(
                      findAutoCleanRule(
                        autoCleanRules,
                        "CLEAN_QUERY",
                        currentFilterAutoCleanRule.pattern,
                      ),
                    )
                  }
                  onClick={() =>
                    void handleCreateAutoCleanRule({
                      type: "CLEAN_QUERY",
                      pattern: currentFilterAutoCleanRule.pattern,
                      label: currentFilterAutoCleanRule.label,
                    })
                  }
                >
                  {pendingAutoCleanKey ===
                  getAutoCleanRuleKey(
                    "CLEAN_QUERY",
                    currentFilterAutoCleanRule.pattern,
                  ) ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <BookmarkPlus className="size-3.5" />
                  )}
                  {t.autoClean.saveCurrentFilter}
                </Button>
              ) : null}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={isAutoCleanOpen}
                aria-controls="auto-clean-rules-panel"
                onClick={() => setIsAutoCleanExpanded((prev) => !prev)}
                className="mc-btn-press tabular-nums"
              >
                <span>
                  {t.autoClean.toggleAutoClean(
                    isAutoCleanOpen,
                    autoCleanRules.length,
                  )}
                </span>
                <ChevronDown
                  className={`size-4 transition-transform duration-200 ${
                    isAutoCleanOpen ? "rotate-180" : ""
                  }`}
                />
              </Button>
            </div>
          </div>

          <div
            id="auto-clean-rules-panel"
            className="mc-accordion"
            data-open={isAutoCleanOpen ? "true" : "false"}
          >
            <div className="mc-accordion-inner">
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.autoClean.quickPresetsLabel}
                </span>
                {AUTO_CLEAN_PRESETS.map((presetItem) => {
                  const existingPreset = findAutoCleanRule(
                    autoCleanRules,
                    presetItem.type,
                    presetItem.pattern,
                  );
                  const isPresetPending =
                    pendingAutoCleanKey ===
                    getAutoCleanRuleKey(presetItem.type, presetItem.pattern);
                  const presetLabel = t.autoClean.presetLabels[presetItem.id];

                  return (
                    <Button
                      key={presetItem.id}
                      type="button"
                      variant={existingPreset ? "secondary" : "outline"}
                      size="sm"
                      className="mc-btn-press"
                      disabled={
                        isCleaning ||
                        pendingAutoCleanKey !== null ||
                        runningRuleId !== null ||
                        removingRuleId !== null ||
                        Boolean(existingPreset)
                      }
                      onClick={() =>
                        void handleCreateAutoCleanRule({
                          type: presetItem.type,
                          pattern: presetItem.pattern,
                          label: presetLabel,
                        })
                      }
                    >
                      {isPresetPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : existingPreset ? (
                        <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Sparkles className="size-3.5" />
                      )}
                      {presetLabel}
                    </Button>
                  );
                })}
              </div>

              <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3.5">
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold">
                    {t.autoClean.builderTitle}
                  </span>
                  {builderCompiled ? (
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {builderCompiled.query}
                    </code>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      {t.autoClean.builderEmptyHint}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-muted-foreground">
                      {t.autoClean.builderCategoryLabel}
                    </span>
                    <select
                      value={builderPreset}
                      onChange={(event) => {
                        setBuilderPreset(event.target.value as GmailPresetFilter);
                        setBuilderPreviewResult(null);
                        setBuilderPreviewError(null);
                      }}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {PRESET_VALUES.map((presetValue) => (
                        <option key={presetValue} value={presetValue}>
                          {t.filters.presets[presetValue]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-muted-foreground">
                      {t.autoClean.builderAgeLabel}
                    </span>
                    <select
                      value={builderOlderThan}
                      onChange={(event) => {
                        setBuilderOlderThan(event.target.value as GmailAgeFilter);
                        setBuilderPreviewResult(null);
                        setBuilderPreviewError(null);
                      }}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {AGE_VALUES.map((ageValue) => (
                        <option key={ageValue} value={ageValue}>
                          {t.filters.ageOptions[ageValue]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-muted-foreground">
                      {t.autoClean.builderActionLabel}
                    </span>
                    <select
                      value={builderAction}
                      onChange={(event) =>
                        setBuilderAction(
                          event.target.value as AutoCleanRuleAction,
                        )
                      }
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {AUTO_CLEAN_RULE_ACTIONS.map((actionValue) => (
                        <option key={actionValue} value={actionValue}>
                          {t.autoClean.actions[actionValue]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-muted-foreground">
                      {t.autoClean.builderScheduleLabel}
                    </span>
                    <select
                      value={builderSchedule}
                      onChange={(event) =>
                        setBuilderSchedule(
                          event.target.value as AutoCleanRuleSchedule,
                        )
                      }
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {AUTO_CLEAN_RULE_SCHEDULES.map((scheduleValue) => (
                        <option key={scheduleValue} value={scheduleValue}>
                          {t.autoClean.schedules[scheduleValue]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <label className="inline-flex cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={builderUnreadOnly}
                        onChange={(event) => {
                          setBuilderUnreadOnly(event.target.checked);
                          setBuilderPreviewResult(null);
                          setBuilderPreviewError(null);
                        }}
                        className="size-3.5 rounded border-input"
                      />
                      <span>{t.filters.unreadOnly}</span>
                    </label>

                    <label className="inline-flex cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={builderHasAttachment}
                        onChange={(event) => {
                          setBuilderHasAttachment(event.target.checked);
                          setBuilderPreviewResult(null);
                          setBuilderPreviewError(null);
                        }}
                        className="size-3.5 rounded border-input"
                      />
                      <span>{t.filters.withAttachments}</span>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mc-btn-press"
                      disabled={!builderCompiled || isPreviewingBuilder}
                      onClick={() => void handlePreviewBuilderImpact()}
                    >
                      {isPreviewingBuilder ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                      {isPreviewingBuilder
                        ? t.autoClean.builderPreviewLoading
                        : t.autoClean.builderPreviewImpact}
                    </Button>

                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="mc-btn-press"
                      disabled={
                        !builderCompiled ||
                        isCleaning ||
                        pendingAutoCleanKey !== null ||
                        runningRuleId !== null ||
                        removingRuleId !== null ||
                        updatingRuleId !== null
                      }
                      onClick={() => {
                        if (!builderCompiled) return;
                        void handleCreateAutoCleanRule({
                          type: "CLEAN_QUERY",
                          pattern: builderCompiled.query,
                          label: builderCompiled.label,
                          action: builderAction,
                          schedule: builderSchedule,
                        });
                      }}
                    >
                      {builderCompiled &&
                      pendingAutoCleanKey ===
                        getAutoCleanRuleKey(
                          "CLEAN_QUERY",
                          builderCompiled.query,
                        ) ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <BookmarkPlus className="size-3.5" />
                      )}
                      {t.autoClean.builderSaveRule}
                    </Button>
                  </div>
                </div>

                {builderPreviewError ? (
                  <p className="mt-2.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 text-xs text-rose-700 dark:text-rose-300">
                    {builderPreviewError}
                  </p>
                ) : null}

                {builderPreviewResult ? (
                  <div className="mt-2.5 rounded-md border border-border bg-background/80 p-2.5 text-xs">
                    <p className="font-medium text-foreground">
                      {t.autoClean.previewSummary(
                        builderPreviewResult.resultSizeEstimate,
                        builderPreviewResult.cleanableCount,
                        builderPreviewResult.protectedCount,
                      )}
                    </p>

                    {builderPreviewResult.inspectedCount === 0 ? (
                      <p className="mt-1 text-muted-foreground">
                        {t.autoClean.previewNoMatches}
                      </p>
                    ) : builderPreviewResult.sampleSenders.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {t.autoClean.previewSampleSendersTitle}
                        </p>
                        <ul className="space-y-1">
                          {builderPreviewResult.sampleSenders.map((sender) => (
                            <li
                              key={sender.email}
                              className="flex flex-wrap items-center justify-between gap-2 text-[11px]"
                            >
                              <span className="truncate font-mono text-muted-foreground">
                                {sender.name && sender.name !== sender.email
                                  ? `${sender.name} <${sender.email}>`
                                  : sender.email}
                              </span>
                              <span className="flex items-center gap-1.5 tabular-nums">
                                {sender.isProtected ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                                    <ShieldCheck className="size-2.5" />
                                    {t.autoClean.previewProtectedBadge}
                                  </span>
                                ) : null}
                                <span className="text-muted-foreground">
                                  {t.autoClean.previewSenderCount(sender.count)}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {autoCleanRules.length === 0 ? (
                <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
                  {t.autoClean.emptyState}
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                  {autoCleanRules.map((rule) => {
                    const isRuleRunning = runningRuleId === rule.id;
                    const isRuleRemoving = removingRuleId === rule.id;
                    const isRuleUpdating = updatingRuleId === rule.id;
                    const isRuleEnabled = rule.isEnabled ?? true;
                    const ruleAction: AutoCleanRuleAction =
                      rule.action ?? "trash";
                    const ruleSchedule: AutoCleanRuleSchedule =
                      rule.schedule ?? "manual";
                    const ruleStatus: AutoCleanRuleStatus =
                      rule.lastRunStatus ?? "idle";
                    const statusBadgeClass =
                      ruleStatus === "ok" || ruleStatus === "success"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : ruleStatus === "rate_limited"
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          : ruleStatus === "error" || ruleStatus === "auth_error"
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                            : "border-border bg-muted/50 text-muted-foreground";
                    const isRuleActionDisabled =
                      isCleaning ||
                      pendingAutoCleanKey !== null ||
                      runningRuleId !== null ||
                      removingRuleId !== null ||
                      updatingRuleId !== null;

                    return (
                      <li
                        key={rule.id}
                        className="flex flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-muted-foreground">
                              {t.autoClean.ruleTypeLabel(rule.type)}
                            </span>
                            <span className="truncate text-sm font-medium">
                              {rule.label}
                            </span>
                            {rule.type === "CLEAN_QUERY" ? (
                              <>
                                <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                  {t.autoClean.actions[ruleAction]}
                                </span>
                                <span
                                  title={rule.lastRunError ?? undefined}
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass}`}
                                >
                                  {t.autoClean.statuses[ruleStatus]}
                                </span>
                                {!isRuleEnabled ? (
                                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                    {t.autoClean.rulePaused}
                                  </span>
                                ) : null}
                                <span
                                  title={
                                    rule.lastRunAt
                                      ? t.autoClean.lastRunAtTitle(
                                          formatDateTime(
                                            rule.lastRunAt,
                                            intlLocale,
                                            t.tree.unknownDate,
                                          ),
                                        )
                                      : t.autoClean.notExecutedYet
                                  }
                                  className="inline-flex items-center rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 tabular-nums dark:text-sky-300"
                                >
                                  {t.autoClean.lastRunCount(
                                    rule.lastRunAt ? rule.lastRunCount : 0,
                                  )}
                                </span>
                              </>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-300">
                                <Ban className="size-3" />
                                {rule.gmailFilterId
                                  ? t.autoClean.gmailFilterActive
                                  : t.autoClean.blockRuleSaved}
                              </span>
                            )}
                          </div>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {rule.type === "BLOCK_DOMAIN"
                              ? `from:@${rule.pattern}`
                              : rule.type === "BLOCK_SENDER"
                                ? `from:${rule.pattern}`
                                : rule.pattern}
                          </p>
                          {rule.type === "CLEAN_QUERY" ? (
                            <p className="text-[11px] text-muted-foreground">
                              {rule.nextRunAt && isRuleEnabled
                                ? t.autoClean.nextRunLabel(
                                    formatDateTime(
                                      rule.nextRunAt,
                                      intlLocale,
                                      t.tree.unknownDate,
                                    ),
                                  )
                                : ruleSchedule === "manual"
                                  ? t.autoClean.manualScheduleHint
                                  : t.autoClean.rulePaused}
                              {rule.lastRunError ? ` · ${rule.lastRunError}` : ""}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {rule.type === "CLEAN_QUERY" ? (
                            <>
                              <select
                                aria-label={t.autoClean.builderScheduleLabel}
                                value={ruleSchedule}
                                disabled={isRuleActionDisabled}
                                onChange={(event) =>
                                  void handleUpdateAutoCleanRule(rule.id, {
                                    schedule: event.target
                                      .value as AutoCleanRuleSchedule,
                                  })
                                }
                                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                              >
                                {AUTO_CLEAN_RULE_SCHEDULES.map((scheduleValue) => (
                                  <option key={scheduleValue} value={scheduleValue}>
                                    {t.autoClean.schedules[scheduleValue]}
                                  </option>
                                ))}
                              </select>

                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mc-btn-press"
                                disabled={isRuleActionDisabled}
                                onClick={() =>
                                  void handleUpdateAutoCleanRule(rule.id, {
                                    isEnabled: !isRuleEnabled,
                                  })
                                }
                              >
                                {isRuleUpdating ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : isRuleEnabled ? (
                                  <Pause className="size-3.5" />
                                ) : (
                                  <Play className="size-3.5" />
                                )}
                                {isRuleEnabled
                                  ? t.autoClean.pauseRule
                                  : t.autoClean.resumeRule}
                              </Button>

                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mc-btn-press"
                                disabled={isRuleActionDisabled}
                                onClick={() => void handleRunAutoCleanRule(rule)}
                              >
                                {isRuleRunning ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Play className="size-3.5" />
                                )}
                                {t.autoClean.runNow}
                              </Button>
                            </>
                          ) : null}

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mc-btn-press"
                            disabled={isRuleActionDisabled}
                            onClick={() => void handleDeleteAutoCleanRule(rule)}
                          >
                            {isRuleRemoving ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                            {t.autoClean.remove}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section
          aria-label={t.keepSafeStrip.ariaLabel}
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-xs"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="size-4" />
                {t.keepSafeStrip.titleWithCount(protectedRules.length)}
              </span>
              <span className="text-xs text-muted-foreground">
                {t.keepSafeStrip.description}
              </span>
            </div>

            {protectedRules.length === 0 ? (
              <p className="rounded-lg border border-dashed border-emerald-500/30 bg-background/60 px-3 py-2.5 text-xs text-muted-foreground">
                {t.keepSafeStrip.emptyState}
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {protectedRules.map((rule) => {
                  const ruleKey = getKeepSafeRuleKey(rule.scope, rule.pattern);
                  const isRulePending = pendingRuleKey === ruleKey;
                  return (
                    <span
                      key={ruleKey}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-background px-3 py-1 text-xs text-foreground"
                    >
                      <span className="font-mono text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                        {t.keepSafeStrip.scopeLabel(rule.scope)}
                      </span>
                      <span className="max-w-[240px] truncate font-medium">
                        {rule.pattern}
                      </span>
                      <button
                        type="button"
                        disabled={isCleaning || pendingRuleKey !== null}
                        onClick={() =>
                          void handleToggleKeepSafe(
                            rule.scope,
                            rule.pattern,
                            rule.pattern,
                          )
                        }
                        aria-label={t.keepSafeStrip.removeAriaLabel(
                          rule.pattern,
                        )}
                        className="ml-0.5 inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        {isRulePending ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <X className="size-3" />
                        )}
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </section>
          </>
        ) : null}

        {activeTab === "history" ? (
        <section className="rounded-xl border border-border bg-card px-4 py-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <History className="size-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">{t.cleanHistory.title}</h2>
                <p className="text-xs text-muted-foreground">
                  {t.cleanHistory.subtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isLoadingHistory ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  {t.cleanHistory.loading}
                </span>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={isCleanHistoryExpanded}
                aria-controls="clean-history-panel"
                onClick={() => setIsCleanHistoryExpanded((prev) => !prev)}
                className="mc-btn-press tabular-nums"
              >
                <span>
                  {t.cleanHistory.toggleLabel(
                    isCleanHistoryExpanded,
                    cleanHistory.length,
                  )}
                </span>
                <ChevronDown
                  className={`size-4 transition-transform duration-200 ${
                    isCleanHistoryExpanded ? "rotate-180" : ""
                  }`}
                />
              </Button>
            </div>
          </div>

          <div
            id="clean-history-panel"
            className="mc-accordion"
            data-open={isCleanHistoryExpanded ? "true" : "false"}
          >
            <div className="mc-accordion-inner">
              {cleanHistory.length === 0 ? (
                <p className="mt-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                  {t.cleanHistory.emptyState}
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto border-t border-border/70 pt-3">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border/60 text-muted-foreground">
                        <th className="pb-2 pr-3 font-medium">
                          {t.cleanHistory.columns.date}
                        </th>
                        <th className="pb-2 pr-3 font-medium">
                          {t.cleanHistory.columns.action}
                        </th>
                        <th className="pb-2 pr-3 font-medium">
                          {t.cleanHistory.columns.messages}
                        </th>
                        <th className="pb-2 text-right font-medium">
                          {t.cleanHistory.columns.spaceFreed}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {cleanHistory.map((entry) => {
                        const formattedDate = new Date(
                          entry.createdAt,
                        ).toLocaleString(intlLocale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        });
                        const actionLabel =
                          t.cleanHistory.actions[entry.action];
                        const formattedCount =
                          entry.messageCount.toLocaleString(intlLocale);
                        return (
                          <tr key={entry.id} className="hover:bg-muted/30">
                            <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground tabular-nums">
                              {formattedDate}
                            </td>
                            <td className="py-2 pr-3 font-medium">
                              {actionLabel}
                            </td>
                            <td className="py-2 pr-3 tabular-nums">
                              {t.cleanHistory.messageCountLabel(
                                entry.messageCount,
                                formattedCount,
                              )}
                            </td>
                            <td className="py-2 text-right font-medium tabular-nums">
                              {entry.bytesFreed > 0
                                ? formatBytes(entry.bytesFreed)
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
        ) : null}

        {activeTab === "clean" ? (
        <section className="rounded-xl border border-border bg-card shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium select-none">
                <TriStateCheckbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={toggleSelectAll}
                  disabled={isBusy || cleanableSenders.length === 0}
                  ariaLabel={t.results.selectAllAriaLabel}
                  className="size-4 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span>
                  {t.results.selectAllLabel(
                    cleanableSenders.length,
                    protectedSenders.length,
                  )}
                </span>
              </label>

              <div
                role="group"
                aria-label={t.results.viewGroupAriaLabel}
                className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5"
              >
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === "tree" ? "default" : "ghost"}
                  aria-pressed={viewMode === "tree"}
                  onClick={() => setViewMode("tree")}
                  className={`mc-btn-press h-7 px-2.5 text-xs ${
                    viewMode === "tree"
                      ? "bg-brand text-white hover:bg-brand/90"
                      : ""
                  }`}
                >
                  <FolderTree className="size-3.5" />
                  {t.results.brandTree}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === "flat" ? "default" : "ghost"}
                  aria-pressed={viewMode === "flat"}
                  onClick={() => setViewMode("flat")}
                  className={`mc-btn-press h-7 px-2.5 text-xs ${
                    viewMode === "flat"
                      ? "bg-brand text-white hover:bg-brand/90"
                      : ""
                  }`}
                >
                  <List className="size-3.5" />
                  {t.results.flatSenders}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === "cards" ? "default" : "ghost"}
                  aria-pressed={viewMode === "cards"}
                  onClick={() => setViewMode("cards")}
                  className={`mc-btn-press h-7 px-2.5 text-xs ${
                    viewMode === "cards"
                      ? "bg-brand text-white hover:bg-brand/90"
                      : ""
                  }`}
                >
                  <LayoutGrid className="size-3.5" />
                  {t.results.cardsView}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="results-sort-by"
                  className="text-xs font-medium text-muted-foreground"
                >
                  {t.results.sortByLabel}
                </label>
                <select
                  id="results-sort-by"
                  value={sortBy}
                  onChange={(event) =>
                    setSortBy(event.target.value as SenderSortBy)
                  }
                  disabled={isCleaning}
                  className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
                >
                  {SORT_VALUES.map((sortValue) => (
                    <option
                      key={sortValue}
                      value={sortValue}
                      className="bg-popover text-popover-foreground"
                    >
                      {t.results.sortOptions[sortValue]}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                type="button"
                size="sm"
                variant={onlyUnsubscribable ? "default" : "outline"}
                aria-pressed={onlyUnsubscribable}
                disabled={isCleaning || isBulkUnsubscribing}
                onClick={() => setOnlyUnsubscribable((prev) => !prev)}
                className={`mc-btn-press h-8 px-2.5 text-xs ${
                  onlyUnsubscribable ? "bg-brand text-white hover:bg-brand/90" : ""
                }`.trim()}
              >
                <MailX className="size-3.5" />
                {t.results.unsubscribableOnly}
              </Button>

              <div className="relative min-w-[200px] flex-1 sm:max-w-xs sm:flex-initial">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setVisibleCount(INITIAL_VISIBLE_ITEMS);
                  }}
                  placeholder={t.results.searchPlaceholder}
                  aria-label={t.results.searchPlaceholder}
                  className="h-8 w-full rounded-lg border border-input bg-background pr-7 pl-8 text-xs text-foreground placeholder:text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                {searchQuery.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setVisibleCount(INITIAL_VISIBLE_ITEMS);
                    }}
                    aria-label={t.results.clearSearchAriaLabel}
                    className="absolute top-1/2 right-1.5 inline-flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>

              {viewMode === "tree" && brandTree.length > 0 ? (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={expandAllTree}
                    className="mc-btn-press h-7 px-2 text-xs text-muted-foreground"
                  >
                    {t.results.expandAll}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={collapseAllTree}
                    className="mc-btn-press h-7 px-2 text-xs text-muted-foreground"
                  >
                    {t.results.collapseAll}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("rules")}
                className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-500/15 dark:text-emerald-300"
              >
                <ShieldCheck className="size-3.5" />
                <span>{t.keepSafeStrip.compactLink(protectedRules.length)}</span>
              </button>

              {cleaningActionLabel ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  {cleaningActionLabel}
                </span>
              ) : null}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mc-btn-press"
                disabled={isBusy || selectedSenders.length === 0}
                onClick={() =>
                  void executeCleanAction(selectedSenders, "trash", false)
                }
              >
                <Trash2 className="size-3.5" />
                {t.results.moveToTrashWithCount(selectedMessageIds.length)}
              </Button>

              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="mc-btn-press"
                disabled={isBusy || selectedSenders.length === 0}
                onClick={() => openPermanentDeleteModal(selectedSenders)}
              >
                <ShieldAlert className="size-3.5" />
                {t.results.deletePermanentlyWithCount(
                  selectedMessageIds.length,
                )}
              </Button>
            </div>
          </div>

          {isScanning ? (
            <div className="border-b border-border bg-muted/30 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-xs sm:text-sm">
                  <span className="relative flex size-2.5 shrink-0" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                  </span>
                  <Loader2 className="size-4 shrink-0 animate-spin text-brand" />
                  <span className="font-medium tabular-nums">
                    {estimatedTotal !== null
                      ? t.results.scanProgressWithEstimate(
                          scannedMessages.toLocaleString(intlLocale),
                          displayProgressTotal.toLocaleString(intlLocale),
                          progressPercent,
                        )
                      : t.results.scanProgressGeneric}
                  </span>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mc-btn-press"
                  onClick={handleStopScan}
                >
                  <Square className="size-3.5" />
                  {t.results.stopScan}
                </Button>
              </div>

              <div
                role="progressbar"
                aria-label={t.results.scanProgressAriaLabel}
                aria-valuenow={progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="relative mt-2.5 h-2 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full w-full origin-left rounded-full bg-brand transition-transform duration-150 ease-linear will-change-transform"
                  style={{
                    transform: `scaleX(${Math.max(0, Math.min(100, progressPercent)) / 100})`,
                  }}
                />
                <div
                  aria-hidden="true"
                  className="mc-shimmer pointer-events-none absolute inset-0"
                />
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                {t.results.scanProgressHint}
              </p>
            </div>
          ) : null}

          {visibleSenders.length === 0 && isScanning ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <Loader2 className="size-7 animate-spin text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t.results.scanningTitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.results.scanningSubtitle}
                </p>
              </div>
            </div>
          ) : visibleSenders.length === 0 || activeFilteredCount === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <Inbox className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium">{t.results.emptyTitle}</p>
              <p className="max-w-md text-xs text-muted-foreground">
                {t.results.emptySubtitle}
              </p>
              {isSearchActive && visibleSenders.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setVisibleCount(INITIAL_VISIBLE_ITEMS);
                  }}
                  className="mc-btn-press mt-2"
                >
                  <X className="size-3.5" />
                  {t.results.clearSearchAriaLabel}
                </Button>
              ) : hasActiveScanFilters ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isCleaning}
                  onClick={handleResetFilters}
                  className="mc-btn-press mt-2"
                >
                  <RefreshCw className="size-3.5" />
                  {t.results.resetFilters}
                </Button>
              ) : null}
            </div>
          ) : viewMode === "tree" || viewMode === "cards" ? (
            <>
              {viewMode === "cards" ? (
                <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {treeViewPartition.primaryVisible.map(renderBrandGridCard)}
                </ul>
              ) : (
                <ul className="space-y-3 p-3 sm:p-4">
                  {treeViewPartition.primaryVisible.map(renderBrandTreeRow)}
                </ul>
              )}
              {treeViewPartition.primaryRemainingCount > 0 ? (
                <div className="flex justify-center border-t border-border bg-muted/15 px-4 py-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setVisibleCount((prev) => prev + VISIBLE_ITEMS_STEP)
                    }
                    className="mc-btn-press"
                  >
                    {t.results.showMoreItems(
                      Math.min(
                        VISIBLE_ITEMS_STEP,
                        treeViewPartition.primaryRemainingCount,
                      ),
                    )}
                  </Button>
                </div>
              ) : null}
              {treeViewPartition.shouldCollapseLongTail ? (
                <div className="border-t border-border">
                  <button
                    type="button"
                    aria-expanded={showLongTail}
                    onClick={() => setShowLongTail((prev) => !prev)}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 bg-muted/20 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/35 hover:text-foreground"
                  >
                    <span className="flex items-center gap-2">
                      {showLongTail ? (
                        <ChevronDown className="size-3.5 shrink-0" />
                      ) : (
                        <ChevronRight className="size-3.5 shrink-0" />
                      )}
                      <span>
                        {t.results.smallSendersSummary(
                          treeViewPartition.longTailItems.length,
                        )}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-brand">
                      {showLongTail
                        ? t.results.hideSmallSenders
                        : t.results.showSmallSenders}
                    </span>
                  </button>
                  {showLongTail ? (
                    viewMode === "cards" ? (
                      <ul className="grid grid-cols-1 gap-3 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-3">
                        {treeViewPartition.longTailItems.map(
                          renderBrandGridCard,
                        )}
                      </ul>
                    ) : (
                      <ul className="space-y-3 border-t border-border p-3 sm:p-4">
                        {treeViewPartition.longTailItems.map(
                          renderBrandTreeRow,
                        )}
                      </ul>
                    )
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {flatViewPartition.primaryVisible.map(renderSenderRow)}
              </ul>
              {flatViewPartition.primaryRemainingCount > 0 ? (
                <div className="flex justify-center border-t border-border bg-muted/15 px-4 py-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setVisibleCount((prev) => prev + VISIBLE_ITEMS_STEP)
                    }
                    className="mc-btn-press"
                  >
                    {t.results.showMoreItems(
                      Math.min(
                        VISIBLE_ITEMS_STEP,
                        flatViewPartition.primaryRemainingCount,
                      ),
                    )}
                  </Button>
                </div>
              ) : null}
              {flatViewPartition.shouldCollapseLongTail ? (
                <div className="border-t border-border">
                  <button
                    type="button"
                    aria-expanded={showLongTail}
                    onClick={() => setShowLongTail((prev) => !prev)}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 bg-muted/20 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/35 hover:text-foreground"
                  >
                    <span className="flex items-center gap-2">
                      {showLongTail ? (
                        <ChevronDown className="size-3.5 shrink-0" />
                      ) : (
                        <ChevronRight className="size-3.5 shrink-0" />
                      )}
                      <span>
                        {t.results.smallSendersSummary(
                          flatViewPartition.longTailItems.length,
                        )}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-brand">
                      {showLongTail
                        ? t.results.hideSmallSenders
                        : t.results.showSmallSenders}
                    </span>
                  </button>
                  {showLongTail ? (
                    <ul className="divide-y divide-border border-t border-border">
                      {flatViewPartition.longTailItems.map(renderSenderRow)}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </>
          )}

          {!isScanning && nextPageToken !== null ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-4 py-3">
              <p className="text-xs text-muted-foreground tabular-nums">
                {t.results.loadedMoreSummary(
                  scannedMessages.toLocaleString(intlLocale),
                  estimatedTotal !== null && estimatedTotal > scannedMessages
                    ? estimatedTotal.toLocaleString(intlLocale)
                    : null,
                  scannedMessages,
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mc-btn-press"
                disabled={isCleaning}
                onClick={handleLoadMore}
              >
                <RefreshCw className="size-3.5" />
                {t.results.loadMore}
              </Button>
            </div>
          ) : null}
        </section>
        ) : null}

        <PrivacyTrustBadgeStrip
          compact
          onOpenPrivacyModal={() => setIsPrivacyModalOpen(true)}
        />
      </main>

      {activeTab === "clean" && selectedSenders.length > 0 ? (
        <div
          role="region"
          aria-label={t.results.selectionDockAriaLabel}
          className="pointer-events-none fixed inset-x-0 bottom-4 z-40 px-4"
        >
          <div className="mc-dock-enter pointer-events-auto mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 text-card-foreground shadow-2xl shadow-black/25 backdrop-blur-md dark:shadow-black/60">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                {bulkUnsubscribeProgress ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
              </span>
              <p className="truncate text-xs font-semibold tabular-nums sm:text-sm">
                {bulkUnsubscribeProgress
                  ? t.results.bulkUnsubscribeProgress(
                      bulkUnsubscribeProgress.current,
                      bulkUnsubscribeProgress.total,
                      bulkUnsubscribeProgress.currentSender,
                    )
                  : t.results.selectionDockSummary(
                      selectedSenders.length,
                      selectedSenders.length.toLocaleString(intlLocale),
                      selectedMessageIds.length,
                      selectedMessageIds.length.toLocaleString(intlLocale),
                      formatBytes(selectedSizeBytes),
                    )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {bulkUnsubscribeProgress ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mc-btn-press"
                  onClick={handleStopBulkUnsubscribe}
                >
                  <Square className="size-3.5" />
                  {t.results.stopBulkUnsubscribe}
                </Button>
              ) : null}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mc-btn-press"
                disabled={isBusy}
                onClick={() => setSelectedEmails(new Set())}
              >
                <X className="size-3.5" />
                {t.results.clearSelection}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mc-btn-press"
                disabled={isBusy || eligibleUnsubscribeSenders.length === 0}
                title={
                  eligibleUnsubscribeSenders.length === 0
                    ? t.results.unsubscribeSelectedNoneTitle
                    : undefined
                }
                onClick={() => void handleBulkUnsubscribe()}
              >
                <MailX className="size-3.5" />
                {t.results.unsubscribeSelectedWithCount(
                  eligibleUnsubscribeSenders.length,
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mc-btn-press"
                disabled={isBusy}
                onClick={() =>
                  void executeCleanAction(selectedSenders, "archive", false)
                }
              >
                <Archive className="size-3.5" />
                {t.results.archiveWithCount(selectedMessageIds.length)}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mc-btn-press"
                disabled={isBusy}
                onClick={() =>
                  void executeCleanAction(selectedSenders, "mark_read", false)
                }
              >
                <MailOpen className="size-3.5" />
                {t.results.markAsReadWithCount(selectedMessageIds.length)}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mc-btn-press"
                disabled={isBusy}
                onClick={() =>
                  void executeCleanAction(selectedSenders, "trash", false)
                }
              >
                <Trash2 className="size-3.5" />
                {t.results.moveToTrashWithCount(selectedMessageIds.length)}
              </Button>

              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="mc-btn-press"
                disabled={isBusy}
                onClick={() => openPermanentDeleteModal(selectedSenders)}
              >
                <ShieldAlert className="size-3.5" />
                {t.results.deletePermanentlyWithCount(
                  selectedMessageIds.length,
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {previewTarget ? (
        <EmailPreviewModal
          target={previewTarget}
          protectedRules={protectedRules}
          isBusy={isBusy}
          isPermanentDeleteOpen={Boolean(pendingDelete)}
          t={t}
          intlLocale={intlLocale}
          onClose={() => setPreviewTarget(null)}
          onMoveToTrash={(targetSenders) =>
            void executeCleanAction(targetSenders, "trash", false)
          }
          onDeletePermanently={(targetSenders) => {
            openPermanentDeleteModal(targetSenders);
          }}
        />
      ) : null}

      <AccessibleDialog
        open={Boolean(pendingDelete)}
        onClose={() => {
          if (!isCleaning) {
            setPendingDelete(null);
            setConfirmDeleteChecked(false);
          }
        }}
        ariaLabelledBy="permanent-delete-title"
        closeOnEscape={!isCleaning}
        closeOnBackdropClick={!isCleaning}
        zIndexClassName="z-50"
        overlayClassName="p-4"
        contentClassName="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-2xl shadow-black/60"
      >
        {pendingDelete ? (
          <>
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                <ShieldAlert className="size-5" />
              </div>
              <div className="space-y-1">
                <h2
                  id="permanent-delete-title"
                  className="text-base font-semibold"
                >
                  {t.permanentDeleteModal.title}
                </h2>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t.permanentDeleteModal.descriptionBeforeCount}
                  <strong className="text-foreground">
                    {t.permanentDeleteModal.messageCountPhrase(
                      pendingDelete.messageIds.length,
                      pendingDelete.messageIds.length.toLocaleString(
                        intlLocale,
                      ),
                    )}
                  </strong>{" "}
                  ({formatBytes(pendingDelete.totalSizeBytes)})
                  {t.permanentDeleteModal.descriptionBetweenSizeAndSenders}
                  <strong className="text-foreground">
                    {t.permanentDeleteModal.senderCountPhrase(
                      pendingDelete.senders.length,
                    )}
                  </strong>
                  {t.permanentDeleteModal.descriptionAfterSenders}
                </p>
              </div>
            </div>

            {pendingDelete.skippedProtectedCount > 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="size-4 shrink-0" />
                <span>
                  {t.permanentDeleteModal.keepingProtectedBefore}
                  <strong>
                    {pendingDelete.skippedProtectedCount.toLocaleString(
                      intlLocale,
                    )}
                  </strong>
                  {t.permanentDeleteModal.keepingProtectedAfter(
                    pendingDelete.skippedProtectedCount,
                  )}
                </span>
              </div>
            ) : null}

            <div className="max-h-32 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">
              <ul className="space-y-1">
                {pendingDelete.senders.map((sender) => (
                  <li
                    key={sender.senderEmail}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate font-medium">
                      {sender.senderEmail}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {t.tree.emailCount(
                        sender.messageCount,
                        sender.messageCount.toLocaleString(intlLocale),
                      )}{" "}
                      ({formatBytes(sender.totalSizeBytes)})
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs select-none">
              <input
                type="checkbox"
                checked={confirmDeleteChecked}
                onChange={(event) =>
                  setConfirmDeleteChecked(event.target.checked)
                }
                disabled={isCleaning}
                className="mt-0.5 size-4 shrink-0 rounded border-input accent-destructive"
              />
              <span>{t.permanentDeleteModal.confirmCheckboxLabel}</span>
            </label>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isCleaning}
                onClick={() => {
                  setPendingDelete(null);
                  setConfirmDeleteChecked(false);
                }}
              >
                {t.permanentDeleteModal.cancel}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!confirmDeleteChecked || isCleaning}
                onClick={() =>
                  void executeCleanAction(pendingDelete.senders, "delete", true)
                }
              >
                {isCleaning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldAlert className="size-4" />
                )}
                {t.permanentDeleteModal.deletePermanently}
              </Button>
            </div>
          </>
        ) : null}
      </AccessibleDialog>

      <AccessibleDialog
        open={isEmptyTrashModalOpen}
        onClose={() => {
          if (!isCleaning) {
            setIsEmptyTrashModalOpen(false);
          }
        }}
        ariaLabelledBy="empty-trash-dialog-title"
        closeOnEscape={!isCleaning}
        closeOnBackdropClick={!isCleaning}
        contentClassName="w-full max-w-md space-y-4 rounded-xl border border-destructive/40 bg-card p-6 text-card-foreground shadow-2xl shadow-black/60"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-destructive/40 bg-destructive/15 text-destructive">
            <Trash2 className="size-5" />
          </div>
          <div>
            <h2
              id="empty-trash-dialog-title"
              className="text-base font-semibold"
            >
              {t.emptyTrashModal.title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.emptyTrashModal.description}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isCleaning}
            onClick={() => setIsEmptyTrashModalOpen(false)}
          >
            {t.emptyTrashModal.cancel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isCleaning}
            onClick={() => void handleEmptyTrash()}
          >
            {isCleaning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            {t.emptyTrashModal.confirm}
          </Button>
        </div>
      </AccessibleDialog>

      {isPrivacyModalOpen ? (
        <PrivacySettingsModal
          userEmail={user.email}
          onClose={() => setIsPrivacyModalOpen(false)}
          onDisconnectComplete={onSignOut}
        />
      ) : null}
    </div>
  );
}
