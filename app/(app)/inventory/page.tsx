export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { prisma } from "../../../lib/prisma";
import { computePlanItemTrees } from "../../../lib/plan-materials";
import InventoryPlanList from "../../components/InventoryPlanList";
import StockpileManager from "../../components/StockpileManager";

export default async function InventoryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // All plans for this user
  const plans = await prisma.buildPlan.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  // Fetch stockpiles with items
  const stockpiles = await prisma.stockpile.findMany({
    where: { userId },
    include: { items: true },
    orderBy: { updatedAt: "desc" },
  });

  // Aggregate stockpile quantities by typeId across all stockpiles
  const stockpileQtyByTypeId = new Map<number, number>();
  for (const sp of stockpiles) {
    for (const item of sp.items) {
      stockpileQtyByTypeId.set(
        item.typeId,
        (stockpileQtyByTypeId.get(item.typeId) ?? 0) + item.quantity,
      );
    }
  }

  // Compute item trees for each plan in parallel
  const planEntries = await Promise.all(
    plans.map(async (plan) => {
      const items = await computePlanItemTrees(plan.id, userId, stockpileQtyByTypeId);
      return { planId: plan.id, planName: plan.name, items };
    }),
  );

  // Shape stockpiles for the client component
  const existingStockpiles = stockpiles.map((sp) => ({
    id: sp.id,
    name: sp.name,
    itemCount: sp.items.length,
    updatedAt: sp.updatedAt.toISOString(),
  }));

  return (
    <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 min-w-0">
      <div>
        <h1 className="text-base uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
          Inventory
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted-fg)" }}>
          Track stockpiles and assign materials to build plans
        </p>
      </div>

      <StockpileManager existingStockpiles={existingStockpiles} />

      <div style={{ borderTop: "1px solid var(--border)" }} />

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-xs uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
            Build Plans
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-fg)" }}>
            Allocate stockpile materials to each plan
          </p>
        </div>
        <InventoryPlanList plans={planEntries} />
      </div>
    </main>
  );
}
