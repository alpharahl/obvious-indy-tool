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

  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
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

  if (res.status === 401) {
    // Expired mid-flight; refresh and retry once.
    accessToken = await refreshAccessToken(characterId, token.refreshToken);
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
