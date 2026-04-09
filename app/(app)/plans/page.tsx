export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { prisma } from "../../../lib/prisma";
import { getOrCreateDefaultPlan } from "../../actions/build-plans";
import AddItemButton from "../../components/AddItemButton";
import PlanBody from "../../components/PlanBody";
import { type BpMap, type Decisions, type BpSettings } from "../../components/PlanItemCard";
import { type StationType, type RigTier } from "../../components/StationPicker";

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
  const initialBpSettings: BpSettings = {};
  for (const d of decisionRows) {
    decisions[d.typeId] = d.decision as "build" | "buy";
    if (d.me > 0 || d.te > 0 || d.systemName || d.facilityMe > 0 || d.facilityTe > 0) {
      initialBpSettings[d.typeId] = { me: d.me, te: d.te, systemName: d.systemName ?? "", stationType: (d.stationType ?? "") as StationType, structureType: d.structureType ?? "", meRigTier: (d.meRigTier ?? "") as RigTier, teRigTier: (d.teRigTier ?? "") as RigTier, facilityMe: d.facilityMe, facilityTe: d.facilityTe };
    }
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
          time: act.time,
          activity: act.activity as "MANUFACTURING" | "REACTION",
          materials: act.materials.map((m) => ({ typeId: m.typeId, name: m.type.name, quantity: m.quantity })),
        };
        nextFrontier.push(...act.materials.map((m) => m.typeId));
      }
    }

    frontier = [...new Set(nextFrontier)];
  }

  // Aggregate stockpile quantities across all stockpiles
  const stockpileItems = await prisma.stockpileItem.findMany({
    where: { stockpile: { userId: session.user.id } },
    select: { typeId: true, quantity: true },
  });
  const stockpileByTypeId: Record<number, number> = {};
  for (const item of stockpileItems) {
    stockpileByTypeId[item.typeId] = (stockpileByTypeId[item.typeId] ?? 0) + item.quantity;
  }

  // Fetch category data for all craftable typeIds (bpMap keys)
  const bpTypeIds = Object.keys(bpMap).map(Number);
  const typeCategories = bpTypeIds.length
    ? await prisma.sdeType.findMany({
        where: { id: { in: bpTypeIds } },
        select: { id: true, group: { select: { category: { select: { id: true, name: true } } } } },
      })
    : [];
  const categoryMap: Record<number, { categoryId: number; categoryName: string }> = {};
  for (const t of typeCategories) {
    categoryMap[t.id] = { categoryId: t.group.category.id, categoryName: t.group.category.name };
  }

  return (
    <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 min-w-0">
      <h1 className="text-base uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
        Build Plan
      </h1>

      <AddItemButton planId={plan.id} />

      {plan.items.length === 0 ? (
        <p className="text-xs py-8 text-center" style={{ color: "var(--muted-fg)" }}>
          No items yet — add one above
        </p>
      ) : (
        <PlanBody
          planId={plan.id}
          items={plan.items}
          bpMap={bpMap}
          initialDecisions={decisions}
          initialBpSettings={initialBpSettings}
          categoryMap={categoryMap}
          stockpileByTypeId={stockpileByTypeId}
        />
      )}
    </main>
  );
}
