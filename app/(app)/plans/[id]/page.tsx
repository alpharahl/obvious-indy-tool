export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "../../../../auth";
import { prisma } from "../../../../lib/prisma";

export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const plan = await prisma.buildPlan.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!plan) notFound();

  return (
    <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 min-w-0">
      <div className="flex items-center gap-2">
        <Link
          href="/plans"
          className="text-xs uppercase tracking-widest transition-opacity hover:opacity-70"
          style={{ color: "var(--muted-fg)" }}
        >
          Plans
        </Link>
        <span className="text-xs" style={{ color: "var(--muted-fg)" }}>/</span>
        <h1 className="text-base uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
          {plan.name}
        </h1>
      </div>
    </main>
  );
}
