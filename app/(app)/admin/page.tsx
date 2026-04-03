export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { prisma } from "../../../lib/prisma";
import AdminPanel from "./AdminPanel";

const ADMIN_CHARACTER_NAME = "Alethoria";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const hasAdmin = await prisma.character.findFirst({
    where: {
      userId: session.user.id,
      characterName: ADMIN_CHARACTER_NAME,
    },
  });

  return <AdminPanel canImport={!!hasAdmin} />;
}
