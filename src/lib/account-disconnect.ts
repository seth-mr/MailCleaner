export const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_REVOKE_TIMEOUT_MS = 5_000;

export interface RevocableAccountTokens {
  refresh_token?: string | null;
  access_token?: string | null;
}

export interface RevokeGoogleTokenOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Selects the best OAuth token to revoke with Google.
 * Prioritizes `refresh_token` because revoking it invalidates both the refresh
 * token and its associated access tokens; falls back to `access_token`.
 */
export function pickRevocationToken(
  account: RevocableAccountTokens,
): string | null {
  const refreshToken = account.refresh_token?.trim();
  if (refreshToken) {
    return refreshToken;
  }

  const accessToken = account.access_token?.trim();
  if (accessToken) {
    return accessToken;
  }

  return null;
}

/**
 * Best-effort revocation of a Google OAuth token via Google's revocation endpoint.
 * Never throws: expired/already-revoked tokens or transient network errors return `false`.
 */
export async function revokeGoogleToken(
  token: string,
  options: RevokeGoogleTokenOptions = {},
): Promise<boolean> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return false;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? GOOGLE_REVOKE_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(GOOGLE_REVOKE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token: normalizedToken }).toString(),
      signal: controller.signal,
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}
