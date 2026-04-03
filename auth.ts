import NextAuth from "next-auth";
import { prisma } from "./lib/prisma";

interface EveProfile {
  CharacterID: number;
  CharacterName: string;
  CharacterOwnerHash: string;
  Scopes: string;
  ExpiresOn: string;
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
            "esi-assets.read_assets.v1",
            "esi-markets.read_character_orders.v1",
            "esi-wallet.read_character_wallet.v1",
          ].join(" "),
        },
      },
      token: "https://login.eveonline.com/v2/oauth/token",
      checks: ["pkce", "state"],
      userinfo: "https://esi.evetech.net/verify/",
      profile(profile: EveProfile) {
        return {
          id: String(profile.CharacterID),
          name: profile.CharacterName,
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

      const eveProfile = profile as unknown as EveProfile;
      const characterId = eveProfile.CharacterID;
      const characterName = eveProfile.CharacterName;

      const accessToken = account.access_token!;
      const refreshToken = account.refresh_token!;
      const expiresAt = new Date(
        Date.now() + ((account.expires_in as number | undefined) ?? 1200) * 1000
      );
      const scopes = eveProfile.Scopes ? eveProfile.Scopes.split(" ") : [];

      const existing = await prisma.character.findUnique({
        where: { characterId },
      });

      if (existing) {
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
        // Pass our internal userId back through the user object
        user.id = existing.userId;
      } else {
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
