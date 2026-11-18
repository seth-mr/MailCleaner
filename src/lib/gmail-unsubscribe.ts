const UNSUBSCRIBE_KEYWORDS_PRIMARY = [
  "unsubscribe",
  "opt-out",
  "optout",
  "cancelar suscrip",
  "dar de baja",
  "darse de baja",
] as const;

const UNSUBSCRIBE_KEYWORDS_SECONDARY = ["manage preferences"] as const;

const BASIC_EMAIL_REGEX = /^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+\.[^\s@<>(),;:"\\]+$/;

export interface MailtoUnsubscribeTarget {
  email: string;
  subject: string;
  body: string;
}

export interface ParsedListUnsubscribe {
  httpUrls: string[];
  mailtoTargets: MailtoUnsubscribeTarget[];
}

export interface RawRfc2822EmailInput {
  to: string;
  subject: string;
  body: string;
}

function sanitizeHeaderValue(value: string): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/[\r\n\0]+/g, " ").trim();
}

function isBasicEmailAddress(value: string): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 320 || /[\r\n\0]/.test(trimmed)) {
    return false;
  }
  return BASIC_EMAIL_REGEX.test(trimmed);
}

function parseHttpOrHttpsUrl(rawUrl: string): URL | null {
  if (typeof rawUrl !== "string") {
    return null;
  }
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0 || /[\s\r\n\0]/.test(trimmed)) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function splitListUnsubscribeEntries(rawHeader: string): string[] {
  const entries: string[] = [];
  let current = "";
  let inAngleBrackets = false;

  for (let i = 0; i < rawHeader.length; i += 1) {
    const char = rawHeader[i];
    if (char === "<") {
      if (!inAngleBrackets && current.trim().length > 0) {
        entries.push(current.trim());
        current = "";
      }
      inAngleBrackets = true;
      current += char;
      continue;
    }

    if (char === ">") {
      current += char;
      if (inAngleBrackets) {
        inAngleBrackets = false;
        entries.push(current.trim());
        current = "";
      }
      continue;
    }

    if (char === "," && !inAngleBrackets) {
      if (current.trim().length > 0) {
        entries.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    entries.push(current.trim());
  }

  return entries
    .map((entry) => {
      if (entry.startsWith("<") && entry.endsWith(">")) {
        return entry.slice(1, -1).trim();
      }
      return entry.trim();
    })
    .filter((entry) => entry.length > 0);
}

function parseMailtoUri(rawEntry: string): MailtoUnsubscribeTarget | null {
  if (!rawEntry.toLowerCase().startsWith("mailto:")) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawEntry);
  } catch {
    return null;
  }

  if (parsed.protocol !== "mailto:") {
    return null;
  }

  let decodedEmail = "";
  try {
    decodedEmail = decodeURIComponent(parsed.pathname).trim();
  } catch {
    decodedEmail = parsed.pathname.trim();
  }

  if (!isBasicEmailAddress(decodedEmail)) {
    return null;
  }

  return {
    email: decodedEmail,
    subject: parsed.searchParams.get("subject") ?? "",
    body: parsed.searchParams.get("body") ?? "",
  };
}

/**
 * Parses an RFC 2369 `List-Unsubscribe` header into validated `http:`/`https:` URLs
 * and `mailto:` targets. Rejects unsafe protocols such as `javascript:` or `data:`.
 */
export function parseListUnsubscribeHeader(
  rawHeader: string,
): ParsedListUnsubscribe {
  if (typeof rawHeader !== "string" || rawHeader.trim().length === 0) {
    return { httpUrls: [], mailtoTargets: [] };
  }

  const normalizedHeader = rawHeader.replace(/[\r\n]+/g, " ");
  const entries = splitListUnsubscribeEntries(normalizedHeader);

  const httpUrls: string[] = [];
  const seenHttpUrls = new Set<string>();
  const mailtoTargets: MailtoUnsubscribeTarget[] = [];
  const seenMailtoKeys = new Set<string>();

  for (const entry of entries) {
    const httpParsed = parseHttpOrHttpsUrl(entry);
    if (httpParsed) {
      if (!seenHttpUrls.has(entry)) {
        seenHttpUrls.add(entry);
        httpUrls.push(entry);
      }
      continue;
    }

    const mailto = parseMailtoUri(entry);
    if (mailto) {
      const key = `${mailto.email.toLowerCase()}|${mailto.subject}|${mailto.body}`;
      if (!seenMailtoKeys.has(key)) {
        seenMailtoKeys.add(key);
        mailtoTargets.push(mailto);
      }
    }
  }

  return { httpUrls, mailtoTargets };
}

/**
 * Checks whether a `List-Unsubscribe-Post` header enables RFC 8058 One-Click POST.
 */
export function hasOneClickUnsubscribePost(rawPostHeader: string): boolean {
  if (typeof rawPostHeader !== "string" || rawPostHeader.trim().length === 0) {
    return false;
  }
  return /(?:^|[\s,;])list-unsubscribe\s*=\s*one-click(?=$|[\s,;])/i.test(
    rawPostHeader,
  );
}

function parseIpv4Octets(host: string): [number, number, number, number] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) {
    return null;
  }

  const octets = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
  ];

  for (const octet of octets) {
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return null;
    }
  }

  return [octets[0], octets[1], octets[2], octets[3]];
}

function isBlockedIpv4(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;

  // 0.0.0.0/8 ("this" network)
  if (a === 0) {
    return true;
  }
  // 10.0.0.0/8 (private)
  if (a === 10) {
    return true;
  }
  // 100.64.0.0/10 (carrier-grade NAT / shared address space)
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  // 127.0.0.0/8 (loopback)
  if (a === 127) {
    return true;
  }
  // 169.254.0.0/16 (link-local & cloud metadata)
  if (a === 169 && b === 254) {
    return true;
  }
  // 172.16.0.0/12 (private)
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  // 192.0.0.0/24 (IETF protocol assignments)
  if (a === 192 && b === 0 && octets[2] === 0) {
    return true;
  }
  // 192.168.0.0/16 (private)
  if (a === 192 && b === 168) {
    return true;
  }
  // 224.0.0.0/4 & 240.0.0.0/4 (multicast & reserved)
  if (a >= 224) {
    return true;
  }

  return false;
}

function parseIpv6Groups(rawAddress: string): number[] | null {
  const zoneIndex = rawAddress.indexOf("%");
  const address = zoneIndex === -1 ? rawAddress : rawAddress.slice(0, zoneIndex);

  if (!address.includes(":")) {
    return null;
  }

  const doubleColonParts = address.split("::");
  if (doubleColonParts.length > 2) {
    return null;
  }

  const parseSegmentList = (segmentStr: string): number[] | null => {
    if (segmentStr.length === 0) {
      return [];
    }
    const parts = segmentStr.split(":");
    const groups: number[] = [];

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (part.includes(".")) {
        // Dotted-quad IPv4 suffix is only valid as the final segment.
        if (i !== parts.length - 1) {
          return null;
        }
        const octets = parseIpv4Octets(part);
        if (!octets) {
          return null;
        }
        groups.push((octets[0] << 8) | octets[1]);
        groups.push((octets[2] << 8) | octets[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/i.test(part)) {
          return null;
        }
        groups.push(Number.parseInt(part, 16));
      }
    }

    return groups;
  };

  const head = parseSegmentList(doubleColonParts[0]);
  if (!head) {
    return null;
  }

  if (doubleColonParts.length === 1) {
    return head.length === 8 ? head : null;
  }

  const tail = parseSegmentList(doubleColonParts[1]);
  if (!tail) {
    return null;
  }

  const missing = 8 - (head.length + tail.length);
  if (missing < 1) {
    return null;
  }

  return [...head, ...new Array<number>(missing).fill(0), ...tail];
}

function isBlockedIpv6(groups: number[]): boolean {
  const allZeroPrefix6 =
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0;

  // :: (unspecified) and ::1 (loopback)
  if (allZeroPrefix6 && groups[6] === 0 && (groups[7] === 0 || groups[7] === 1)) {
    return true;
  }

  // IPv4-mapped IPv6 ::ffff:0:0/96 or IPv4-compatible ::/96
  const isIpv4Mapped =
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff;
  if (isIpv4Mapped || allZeroPrefix6) {
    const octets: [number, number, number, number] = [
      (groups[6] >> 8) & 0xff,
      groups[6] & 0xff,
      (groups[7] >> 8) & 0xff,
      groups[7] & 0xff,
    ];
    return isBlockedIpv4(octets);
  }

  // fc00::/7 (unique local IPv6: fc00:: - fdff::)
  if ((groups[0] & 0xfe00) === 0xfc00) {
    return true;
  }

  // fe80::/10 (link-local IPv6)
  if ((groups[0] & 0xffc0) === 0xfe80) {
    return true;
  }

  // ff00::/8 (multicast)
  if ((groups[0] & 0xff00) === 0xff00) {
    return true;
  }

  return false;
}

/**
 * Validates that a URL uses `http:` or `https:` and resolves to a public host,
 * blocking loopback, private networks, link-local ranges, `.local`, and `.internal`
 * to mitigate SSRF on server-side One-Click POST requests.
 */
export function isSafePublicHttpUrl(rawUrl: string): boolean {
  const parsed = parseHttpOrHttpsUrl(rawUrl);
  if (!parsed) {
    return false;
  }

  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return false;
  }

  const rawHost = parsed.hostname.toLowerCase().replace(/\.+$/, "");
  if (rawHost.length === 0) {
    return false;
  }

  const host =
    rawHost.startsWith("[") && rawHost.endsWith("]")
      ? rawHost.slice(1, -1)
      : rawHost;

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "local" ||
    host.endsWith(".local") ||
    host === "internal" ||
    host.endsWith(".internal")
  ) {
    return false;
  }

  const ipv4Octets = parseIpv4Octets(host);
  if (ipv4Octets) {
    return !isBlockedIpv4(ipv4Octets);
  }

  if (host.includes(":")) {
    const ipv6Groups = parseIpv6Groups(host);
    if (!ipv6Groups) {
      return false;
    }
    return !isBlockedIpv6(ipv6Groups);
  }

  return true;
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/g, "&")
    .replace(/&#x26;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

function extractHrefFromAttributes(attributes: string): string | null {
  const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(
    attributes,
  );
  if (!match) {
    return null;
  }
  const rawHref = match[1] ?? match[2] ?? match[3] ?? "";
  const decoded = decodeBasicHtmlEntities(rawHref).trim();
  return decoded.length > 0 ? decoded : null;
}

/**
 * Scans an email's HTML body for `<a ... href="...">` unsubscribe links based on
 * link text or URL keywords, decodes HTML entities such as `&amp;`, and ensures
 * the returned URL uses `http:` or `https:`.
 */
export function extractUnsubscribeLinkFromHtml(html: string): string | null {
  if (typeof html !== "string" || html.trim().length === 0) {
    return null;
  }

  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let secondaryFallback: string | null = null;

  for (const match of html.matchAll(anchorRegex)) {
    const attributes = match[1] ?? "";
    const innerHtml = match[2] ?? "";
    const href = extractHrefFromAttributes(attributes);
    if (!href) {
      continue;
    }

    const parsedUrl = parseHttpOrHttpsUrl(href);
    if (!parsedUrl) {
      continue;
    }

    const plainText = decodeBasicHtmlEntities(
      innerHtml.replace(/<[^>]+>/g, " "),
    )
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const normalizedHref = href.toLowerCase();

    const matchesPrimary = UNSUBSCRIBE_KEYWORDS_PRIMARY.some(
      (keyword) =>
        plainText.includes(keyword) || normalizedHref.includes(keyword),
    );
    if (matchesPrimary) {
      return href;
    }

    if (secondaryFallback === null) {
      const matchesSecondary = UNSUBSCRIBE_KEYWORDS_SECONDARY.some(
        (keyword) =>
          plainText.includes(keyword) || normalizedHref.includes(keyword),
      );
      if (matchesSecondary) {
        secondaryFallback = href;
      }
    }
  }

  return secondaryFallback;
}

/**
 * Builds a Base64URL-encoded RFC 2822 email payload for Gmail `messages.send`,
 * stripping CR/LF characters from header fields to prevent header injection.
 */
export function buildRawRfc2822Email({
  to,
  subject,
  body,
}: RawRfc2822EmailInput): string {
  const safeTo = sanitizeHeaderValue(to);
  const safeSubject = sanitizeHeaderValue(subject);
  const bodyText = typeof body === "string" ? body : "";

  const rawMessage = [
    `To: ${safeTo}`,
    `Subject: ${safeSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    bodyText,
  ].join("\r\n");

  return Buffer.from(rawMessage, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export type BulkUnsubscribeOutcomeStatus =
  | "unsubscribed"
  | "action_required"
  | "not_found"
  | "failed";

export interface BulkUnsubscribeItemOutcome {
  senderEmail: string;
  status: BulkUnsubscribeOutcomeStatus;
}

export interface BulkUnsubscribeSummary {
  totalAttempted: number;
  unsubscribed: number;
  manualRequired: number;
  notFound: number;
  failed: number;
  cancelled: boolean;
}

/**
 * Summarizes sequential bulk-unsubscribe outcomes into per-status counts.
 */
export function summarizeBulkUnsubscribeResults(
  outcomes: readonly BulkUnsubscribeItemOutcome[],
  options: { cancelled?: boolean } = {},
): BulkUnsubscribeSummary {
  let unsubscribed = 0;
  let manualRequired = 0;
  let notFound = 0;
  let failed = 0;

  for (const outcome of outcomes) {
    if (outcome.status === "unsubscribed") {
      unsubscribed += 1;
    } else if (outcome.status === "action_required") {
      manualRequired += 1;
    } else if (outcome.status === "not_found") {
      notFound += 1;
    } else {
      failed += 1;
    }
  }

  return {
    totalAttempted: outcomes.length,
    unsubscribed,
    manualRequired,
    notFound,
    failed,
    cancelled: options.cancelled === true,
  };
}
