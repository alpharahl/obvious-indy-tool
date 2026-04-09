export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { prisma } from "../../../lib/prisma";
import { getOrCreateDefaultPlan, removePlanItem } from "../../actions/build-plans";
import AddItemButton from "../../components/AddItemButton";
import PlanItemCard, { type BpMap, type Decisions } from "../../components/PlanItemCard";

const MAX_DEPTH = 4;

async function fetchBpActivities(typeIds: number[]) {
  if (!typeIds.length) return [];
  return prisma.blueprintActivity.findMany({
    where: {
      activity: { in: ["MANUFACTURING", "REACTION"] },
      products: { some: { typeId: { in: typeIds } } },
    },
    include: {
      products: { where: { typeId: { in: typeIds } } },
      materials: {
        include: { type: { select: { name: true } } },
        orderBy: { type: { name: "asc" } },
      },
    },
  });
}

export default async function PlansPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const plan = await getOrCreateDefaultPlan();
  const typeIds = plan.items.map((i) => i.typeId);

  // Load saved decisions
  const decisionRows = await prisma.buildPlanDecision.findMany({ where: { planId: plan.id } });
  const decisions: Decisions = {};
  for (const d of decisionRows) {
    decisions[d.typeId] = d.decision as "build" | "buy";
  }

  // Build full bpMap iteratively up to MAX_DEPTH
  const bpMap: BpMap = {};
  const fetched = new Set<number>();
  let frontier = typeIds;

  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth++) {
    const toFetch = frontier.filter((id) => !fetched.has(id));
    if (!toFetch.length) break;
    toFetch.forEach((id) => fetched.add(id));

    const activities = await fetchBpActivities(toFetch);
    const nextFrontier: number[] = [];

    for (const act of activities) {
      for (const prod of act.products) {
        bpMap[prod.typeId] = {
          outputQty: prod.quantity,
          materials: act.materials.map((m) => ({ typeId: m.typeId, name: m.type.name, quantity: m.quantity })),
        };
        nextFrontier.push(...act.materials.map((m) => m.typeId));
      }
    }

    frontier = [...new Set(nextFrontier)];
  }

  return (
    <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 min-w-0">
      <div className="flex items-center justify-between">
        <h1 className="text-base uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
          Build Plan
        </h1>
        <AddItemButton planId={plan.id} />
      </div>

      {plan.items.length === 0 ? (
        <p className="text-xs py-8 text-center" style={{ color: "var(--muted-fg)" }}>
          No items yet — add one above
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {plan.items.map((item) => (
            <PlanItemCard
              key={item.id}
              itemId={item.id}
              planId={plan.id}
              typeName={item.type.name}
              quantity={item.quantity}
              bp={bpMap[item.typeId] ?? null}
              bpMap={bpMap}
              decisions={decisions}
              onRemove={removePlanItem}
            />
          ))}
        </div>
      )}
    </main>
  );
}
