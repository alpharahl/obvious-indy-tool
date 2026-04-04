export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { prisma } from "../../../lib/prisma";
import { computePlanMaterials } from "../../../lib/plan-materials";
import InventoryPlanList, { type InventoryPlanEntry } from "../../components/InventoryPlanList";

export default async function InventoryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // All plans for this user
  const plans = await prisma.buildPlan.findMany({
    where: { userId },
    include: { allocations: true },
    orderBy: { updatedAt: "desc" },
  });

  // Aggregate assets by typeId across all characters
  const rawAssets = await prisma.asset.groupBy({
    by: ["typeId"],
    where: { character: { userId } },
    _sum: { quantity: true },
  });
  const assetQtyByTypeId = new Map(rawAssets.map((a) => [a.typeId, a._sum.quantity ?? 0]));

  // Compute material lists for each plan in parallel
  const planEntries: InventoryPlanEntry[] = await Promise.all(
    plans.map(async (plan) => {
      const materials = await computePlanMaterials(plan.id);
      const allocationMap = new Map(plan.allocations.map((a) => [a.typeId, a.quantity]));

      return {
        planId: plan.id,
        planName: plan.name,
        materials: materials.map((mat) => ({
          typeId: mat.typeId,
          typeName: mat.typeName,
          needed: mat.needed,
          kind: mat.kind,
          available: assetQtyByTypeId.get(mat.typeId) ?? 0,
          allocated: allocationMap.get(mat.typeId) ?? 0,
        })),
      };
    }),
  );

  return (
    <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 min-w-0">
      <div>
        <h1 className="text-base uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
          Inventory
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted-fg)" }}>
          Assign on-hand materials to build plans
        </p>
      </div>

      <InventoryPlanList plans={planEntries} />
    </main>
  );
}
