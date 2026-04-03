"use server";

import { cookies } from "next/headers";
import { auth, signIn } from "../../auth";
import { signLinkCookie } from "../../lib/link-cookie";

export async function addCharacter() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const userId = session.user.id;
  const cookieStore = await cookies();
  cookieStore.set("link_to_user", `${userId}.${signLinkCookie(userId)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 300, // 5 min — enough for the OAuth round-trip
    sameSite: "lax",
    path: "/",
  });

  await signIn("eve", { callbackUrl: "/" });
}
