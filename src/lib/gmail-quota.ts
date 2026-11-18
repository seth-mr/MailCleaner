const MIN_RETRY_AFTER_SECONDS = 5;
const MAX_RETRY_AFTER_SECONDS = 120;
const DEFAULT_RETRY_AFTER_SECONDS = 20;
const DEFAULT_MAX_UNITS_PER_WINDOW = 10_500;
const DEFAULT_WINDOW_MS = 60_000;
const MIN_PACER_WAIT_MS = 50;

export interface GmailQuotaPacerOptions {
  maxUnitsPerWindow?: number;
  windowMs?: number;
}

interface QuotaUsageEntry {
  timestampMs: number;
  units: number;
}

/**
 * Sliding-window per-user quota pacer that keeps Gmail API consumption below
 * a configurable unit budget per rolling window to prevent 403/429 bursts.
 */
export class GmailQuotaPacer {
  readonly maxUnitsPerWindow: number;
  readonly windowMs: number;
  private readonly usageByUser = new Map<string, QuotaUsageEntry[]>();

  constructor(options: GmailQuotaPacerOptions = {}) {
    const rawMax = options.maxUnitsPerWindow ?? DEFAULT_MAX_UNITS_PER_WINDOW;
    const rawWindow = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.maxUnitsPerWindow =
      Number.isFinite(rawMax) && rawMax > 0
        ? Math.trunc(rawMax)
        : DEFAULT_MAX_UNITS_PER_WINDOW;
    this.windowMs =
      Number.isFinite(rawWindow) && rawWindow > 0
        ? Math.trunc(rawWindow)
        : DEFAULT_WINDOW_MS;
  }

  private pruneExpired(userId: string, nowMs: number): QuotaUsageEntry[] {
    const entries = this.usageByUser.get(userId);
    if (!entries || entries.length === 0) {
      return [];
    }

    const cutoffMs = nowMs - this.windowMs;
    const active = entries.filter((entry) => entry.timestampMs > cutoffMs);
    if (active.length === 0) {
      this.usageByUser.delete(userId);
      return [];
    }

    if (active.length !== entries.length) {
      this.usageByUser.set(userId, active);
    }
    return active;
  }

  /**
   * Returns how many milliseconds the caller should wait before consuming
   * `units` for `userId`, or `0` when budget is immediately available.
   */
  getWaitMs(userId: string, units: number, nowMs = Date.now()): number {
    if (!Number.isFinite(units) || units <= 0) {
      this.pruneExpired(userId, nowMs);
      return 0;
    }

    const active = this.pruneExpired(userId, nowMs);
    if (active.length === 0) {
      return 0;
    }

    const sorted = [...active].sort((a, b) => a.timestampMs - b.timestampMs);
    const usedUnits = sorted.reduce((sum, entry) => sum + entry.units, 0);

    if (usedUnits + units <= this.maxUnitsPerWindow) {
      return 0;
    }

    const excess = usedUnits + units - this.maxUnitsPerWindow;
    let freedUnits = 0;
    let releaseAtMs = sorted[sorted.length - 1].timestampMs + this.windowMs;

    for (const entry of sorted) {
      freedUnits += entry.units;
      if (freedUnits >= excess) {
        releaseAtMs = entry.timestampMs + this.windowMs;
        break;
      }
    }

    return Math.max(MIN_PACER_WAIT_MS, Math.ceil(releaseAtMs - nowMs));
  }

  /**
   * Records `units` of Gmail API quota consumed by `userId` at `nowMs`.
   */
  recordUsage(userId: string, units: number, nowMs = Date.now()): void {
    const active = this.pruneExpired(userId, nowMs);
    if (!Number.isFinite(units) || units <= 0) {
      return;
    }

    active.push({ timestampMs: nowMs, units });
    this.usageByUser.set(userId, active);
  }

  /**
   * Waits until enough quota capacity is available in the sliding window for
   * `userId` and records the reserved `units`.
   */
  async reserve(userId: string, units: number): Promise<void> {
    if (!Number.isFinite(units) || units <= 0) {
      return;
    }

    while (true) {
      const nowMs = Date.now();
      const waitMs = this.getWaitMs(userId, units, nowMs);
      if (waitMs <= 0) {
        this.recordUsage(userId, units, nowMs);
        return;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, waitMs);
      });
    }
  }
}

const GMAIL_QUOTA_ERROR_INDICATORS = [
  "quota exceeded",
  "total query cost",
  "units per minute",
  "ratelimitexceeded",
  "userratelimitexceeded",
  "too many concurrent requests",
] as const;

/**
 * Determines whether a Gmail API HTTP status and error message represent a
 * transient quota or rate-limit condition rather than a permanent permission failure.
 */
export function isGmailQuotaOrRateLimitError(
  status: number,
  message: string,
): boolean {
  if (status === 429) {
    return true;
  }

  if (status !== 403) {
    return false;
  }

  const normalized = message.toLowerCase();
  return GMAIL_QUOTA_ERROR_INDICATORS.some((indicator) =>
    normalized.includes(indicator),
  );
}

/**
 * Parses a numeric Retry-After header value clamped to [5, 120] seconds,
 * falling back to defaultSeconds when absent or invalid.
 */
export function parseRetryAfterSeconds(
  retryAfterHeader: string | null,
  defaultSeconds = DEFAULT_RETRY_AFTER_SECONDS,
): number {
  if (retryAfterHeader === null) {
    return defaultSeconds;
  }

  const trimmed = retryAfterHeader.trim();
  if (trimmed.length === 0) {
    return defaultSeconds;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultSeconds;
  }

  return Math.min(
    MAX_RETRY_AFTER_SECONDS,
    Math.max(MIN_RETRY_AFTER_SECONDS, Math.ceil(parsed)),
  );
}
