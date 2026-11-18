import { prisma } from "@/lib/prisma";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const TOKEN_REFRESH_MARGIN_SECONDS = 60;

interface GoogleTokenRefreshResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

/**
 * Returns a valid Google OAuth access token for the given user,
 * refreshing it via Google's token endpoint if expired or within 60 seconds of expiry.
 */
export async function getValidGoogleAccessToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "google",
    },
    select: {
      id: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  });

  if (!account) {
    throw new Error("No Google account linked for this user.");
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  const isTokenValid =
    Boolean(account.access_token) &&
    account.expires_at !== null &&
    account.expires_at > nowInSeconds + TOKEN_REFRESH_MARGIN_SECONDS;

  if (isTokenValid && account.access_token) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new Error("Google refresh token is missing. Please sign in again.");
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth client credentials are not configured.");
  }

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as GoogleTokenRefreshResponse;

  if (!response.ok || !payload.access_token || !payload.expires_in) {
    const details =
      payload.error_description ?? payload.error ?? `HTTP ${response.status}`;
    throw new Error(`Failed to refresh Google access token: ${details}`);
  }

  const updatedExpiresAt = Math.floor(Date.now() / 1000) + payload.expires_in;

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: payload.access_token,
      expires_at: updatedExpiresAt,
      ...(payload.refresh_token ? { refresh_token: payload.refresh_token } : {}),
      ...(payload.scope ? { scope: payload.scope } : {}),
      ...(payload.token_type ? { token_type: payload.token_type } : {}),
    },
  });

  return payload.access_token;
}
