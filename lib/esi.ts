import { prisma } from "./prisma";

const ESI_BASE = "https://esi.evetech.net/latest";

async function refreshAccessToken(characterId: string, refreshToken: string): Promise<string> {
  const creds = Buffer.from(
    `${process.env.EVE_CLIENT_ID}:${process.env.EVE_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch("https://login.eveonline.com/v2/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${creds}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const reason = (body as { error?: string }).error ?? res.status.toString();
    if (res.status === 400 && reason === "invalid_grant") {
      // Refresh token revoked or expired — remove it so the user knows to re-link.
      await prisma.characterToken.delete({ where: { characterId } }).catch(() => {});
      throw new Error(`EVE token revoked for character ${characterId} — please re-link`);
    }
    throw new Error(`Token refresh failed: ${res.status} ${reason}`);
  }
  const data = await res.json();

  const newToken: string = data.access_token;
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 1200) * 1000);

  await prisma.characterToken.update({
    where: { characterId },
    data: {
      accessToken: newToken,
      refreshToken: data.refresh_token,
      expiresAt,
    },
  });

  return newToken;
}

function esiDelay(res: Response): Promise<void> {
  const resetIn = parseInt(res.headers.get("x-esi-error-limit-reset") ?? "1", 10);
  return new Promise((resolve) => setTimeout(resolve, (resetIn + 1) * 1000));
}

// characterId is Character.id (internal cuid), not the EVE character ID.
export async function esiGet<T>(path: string, characterId: string): Promise<T> {
  const token = await prisma.characterToken.findUnique({ where: { characterId } });
  if (!token) throw new Error(`No token for character ${characterId}`);

  let accessToken = token.accessToken;
  if (token.expiresAt < new Date(Date.now() + 60_000)) {
    accessToken = await refreshAccessToken(characterId, token.refreshToken);
  }

  const res = await fetch(`${ESI_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 60 },
  });

  if (res.status === 420) {
    // Error limited — wait for the reset window then retry once.
    await esiDelay(res);
    const retry = await fetch(`${ESI_BASE}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      next: { revalidate: 60 },
    });
    if (!retry.ok) throw new Error(`ESI ${path} → ${retry.status} (after 420 retry)`);
    return retry.json() as T;
  }

  if (res.status === 401) {
    // Expired mid-flight; re-read the token from DB (it may have been rotated above) then retry.
    const freshToken = await prisma.characterToken.findUnique({ where: { characterId } });
    if (!freshToken) throw new Error(`No token for character ${characterId}`);
    accessToken = await refreshAccessToken(characterId, freshToken.refreshToken);
    const retry = await fetch(`${ESI_BASE}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      next: { revalidate: 60 },
    });
    if (!retry.ok) throw new Error(`ESI ${path} → ${retry.status}`);
    return retry.json() as T;
  }

  if (!res.ok) throw new Error(`ESI ${path} → ${res.status}`);
  return res.json() as T;
}
