export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "../../../auth";

export default async function PlansPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 min-w-0">
      <h1 className="text-base uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
        Build Plan
      </h1>
    </main>
  );
}
