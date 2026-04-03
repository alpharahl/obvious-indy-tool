import { createHmac } from "crypto";

export function signLinkCookie(userId: string) {
  return createHmac("sha256", process.env.NEXTAUTH_SECRET!)
    .update(userId)
    .digest("hex");
}

export function verifyLinkCookie(raw: string): string | null {
  const dot = raw.lastIndexOf(".");
  if (dot === -1) return null;
  const userId = raw.slice(0, dot);
  const hmac = raw.slice(dot + 1);
  if (hmac !== signLinkCookie(userId)) return null;
  return userId;
}
