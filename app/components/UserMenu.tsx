import { auth } from "../../auth";
import { prisma } from "../../lib/prisma";
import UserMenuClient from "./UserMenuClient";

export default async function UserMenu() {
  const session = await auth();
  if (!session?.user?.id) return <UserMenuClient name={null} />;

  const main = await prisma.character.findFirst({
    where: { userId: session.user.id, isMain: true },
    select: { characterName: true },
  });

  return <UserMenuClient name={main?.characterName ?? null} />;
}
