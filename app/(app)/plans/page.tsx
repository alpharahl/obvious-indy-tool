export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { prisma } from "../../../lib/prisma";
import { createPlan, deletePlan } from "../../actions/build-plans";

export default async function PlansPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const plans = await prisma.buildPlan.findMany({
    where: { userId: session.user.id },
    include: { items: { include: { type: { select: { name: true } } } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 min-w-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-base uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
            Build Plans
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-fg)" }}>
            {plans.length} {plans.length === 1 ? "plan" : "plans"}
          </p>
        </div>

        {/* New plan form */}
        <form action={createPlan} className="flex gap-2">
          <input
            name="name"
            required
            placeholder="Plan name…"
            className="text-xs px-3 py-1.5 rounded border bg-transparent outline-none"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          />
          <button
            type="submit"
            className="text-xs uppercase tracking-widest px-4 py-1.5 rounded border cursor-pointer transition-opacity hover:opacity-70 shrink-0"
            style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
          >
            New Plan
          </button>
        </form>
      </div>

      {plans.length === 0 ? (
        <p className="text-xs py-8 text-center" style={{ color: "var(--muted-fg)" }}>
          No plans yet — create one above
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="flex items-center justify-between px-4 py-3 rounded border"
              style={{ background: "var(--panel)", borderColor: "var(--border)" }}
            >
              <div className="flex flex-col gap-1 min-w-0">
                <Link
                  href={`/plans/${plan.id}`}
                  className="text-sm font-medium hover:opacity-70 transition-opacity"
                  style={{ color: "var(--foreground)" }}
                >
                  {plan.name}
                </Link>
                <span className="text-xs" style={{ color: "var(--muted-fg)" }}>
                  {plan.items.length === 0
                    ? "No items"
                    : plan.items.map((i) => `${i.quantity}× ${i.type.name}`).join(", ")}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <Link
                  href={`/plans/${plan.id}`}
                  className="text-xs uppercase tracking-widest px-3 py-1 rounded border transition-opacity hover:opacity-70"
                  style={{ borderColor: "var(--border)", color: "var(--muted-fg)" }}
                >
                  Open
                </Link>
                <form action={deletePlan.bind(null, plan.id)}>
                  <button
                    type="submit"
                    className="text-xs uppercase tracking-widest px-3 py-1 rounded border cursor-pointer transition-opacity hover:opacity-70"
                    style={{ borderColor: "var(--border)", color: "var(--muted-fg)" }}
                  >
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
