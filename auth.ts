import NextAuth from "next-auth";
import { cookies } from "next/headers";
import { prisma } from "./lib/prisma";
import { verifyLinkCookie } from "./lib/link-cookie";

// EVE SSO v2 access tokens are JWTs. The character info lives in the payload.
// Sub format: "CHARACTER:EVE:<characterId>"
interface EveTokenClaims {
  sub: string;               // "CHARACTER:EVE:12345"
  name: string;              // character name
  owner: string;             // character owner hash
  exp: number;
  iss: string;
  jti?: string;
  scp?: string | string[];   // granted scopes — array for multiple, string for one
}

function decodeEveToken(accessToken: string): EveTokenClaims {
  const payload = accessToken.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString());
}

function eveCharacterId(sub: string): number {
  return parseInt(sub.split(":")[2], 10);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: "eve",
      name: "EVE Online",
      type: "oauth",
      authorization: {
        url: "https://login.eveonline.com/v2/oauth/authorize",
        params: {
          scope: [
            "esi-industry.read_character_jobs.v1",
            "esi-characters.read_blueprints.v1",
            "esi-skills.read_skills.v1",
            "esi-assets.read_assets.v1",
            "esi-markets.read_character_orders.v1",
            "esi-wallet.read_character_wallet.v1",
            "esi-universe.read_structures.v1",
          ].join(" "),
        },
      },
      token: "https://login.eveonline.com/v2/oauth/token",
      checks: ["pkce", "state"],
      // esi.evetech.net/verify/ now 301-redirects and oauth4webapi doesn't follow
      // it. Decode the access token JWT directly instead — it contains all claims.
      // The url satisfies NextAuth's config validator; request() takes precedence.
      userinfo: {
        url: "https://login.eveonline.com/v2/oauth/verify",
        async request({ tokens }: { tokens: { access_token?: string } }) {
          return decodeEveToken(tokens.access_token!);
        },
      },
      profile(profile: EveTokenClaims) {
        return {
          id: String(eveCharacterId(profile.sub)),
          name: profile.name,
          email: null,
        };
      },
      clientId: process.env.EVE_CLIENT_ID,
      clientSecret: process.env.EVE_CLIENT_SECRET,
    },
  ],

  session: { strategy: "jwt" },

  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider !== "eve" || !profile) return false;

      const eveProfile = profile as unknown as EveTokenClaims;
      const characterId = eveCharacterId(eveProfile.sub);
      const characterName = eveProfile.name;

      const accessToken = account.access_token!;
      const refreshToken = account.refresh_token!;
      const expiresAt = new Date(
        Date.now() + ((account.expires_in as number | undefined) ?? 1200) * 1000
      );
      const scp = eveProfile.scp;
      const scopes = Array.isArray(scp) ? scp : scp ? scp.split(" ") : [];

      // Check for a "link to existing account" cookie set by the add-character flow.
      const cookieStore = await cookies();
      const linkCookie = cookieStore.get("link_to_user")?.value ?? null;
      const linkUserId = linkCookie ? verifyLinkCookie(linkCookie) : null;
      if (linkCookie) cookieStore.delete("link_to_user");

      const existing = await prisma.character.findUnique({
        where: { characterId },
      });

      if (existing) {
        // Character already registered — refresh its token and resume that account.
        await prisma.characterToken.upsert({
          where: { characterId: existing.id },
          update: { accessToken, refreshToken, expiresAt, scopes },
          create: {
            characterId: existing.id,
            accessToken,
            refreshToken,
            expiresAt,
            scopes,
          },
        });
        user.id = existing.userId;
      } else if (linkUserId) {
        // Logged-in user adding a new character to their account.
        const newChar = await prisma.character.create({
          data: {
            characterId,
            characterName,
            isMain: false,
            userId: linkUserId,
          },
        });
        await prisma.characterToken.create({
          data: {
            characterId: newChar.id,
            accessToken,
            refreshToken,
            expiresAt,
            scopes,
          },
        });
        user.id = linkUserId;
      } else {
        // Brand-new user — create an account for them.
        const newUser = await prisma.user.create({ data: {} });
        const newChar = await prisma.character.create({
          data: {
            characterId,
            characterName,
            isMain: true,
            userId: newUser.id,
          },
        });
        await prisma.characterToken.create({
          data: {
            characterId: newChar.id,
            accessToken,
            refreshToken,
            expiresAt,
            scopes,
          },
        });
        user.id = newUser.id;
      }

      return true;
    },

    async jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      return token;
    },

    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string;
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },

  debug: true,
});
