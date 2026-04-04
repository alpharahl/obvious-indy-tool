export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "../../../../auth";
import { prisma } from "../../../../lib/prisma";
import PlanItemSearch from "../../../components/PlanItemSearch";
import PlanDetailBody, {
  type Material,
  type PlanItemWithMaterials,
  type ShoppingEntry,
} from "../../../components/PlanDetailBody";

export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const plan = await prisma.buildPlan.findFirst({
    where: { id, userId: session.user.id },
    include: {
      items: {
        include: { type: { select: { name: true } } },
        orderBy: { type: { name: "asc" } },
      },
    },
  });
  if (!plan) notFound();

  // ── Level-1: blueprint activities that manufacture each plan item ──────────
  const productTypeIds = plan.items.map((i) => i.typeId);

  const mfgActivities = productTypeIds.length
    ? await prisma.blueprintActivity.findMany({
        where: {
          activity: "MANUFACTURING",
          products: { some: { typeId: { in: productTypeIds } } },
        },
        include: {
          products: { where: { typeId: { in: productTypeIds } } },
          materials: { include: { type: { select: { name: true } } } },
        },
      })
    : [];

  // productTypeId → { blueprintTypeId, baseTime, outputQty, activityId }
  const bpInfoByProductTypeId = new Map<
    number,
    { blueprintTypeId: number; baseTime: number; outputQty: number; activityId: number }
  >();
  const materialsByActivityId = new Map<
    number,
    Array<{ typeId: number; typeName: string; quantity: number }>
  >();

  for (const act of mfgActivities) {
    materialsByActivityId.set(
      act.id,
      act.materials.map((m) => ({ typeId: m.typeId, typeName: m.type.name, quantity: m.quantity })),
    );
    for (const prod of act.products) {
      bpInfoByProductTypeId.set(prod.typeId, {
        blueprintTypeId: act.blueprintId,
        baseTime: act.time,
        outputQty: prod.quantity,
        activityId: act.id,
      });
    }
  }

  // ── Decisions ─────────────────────────────────────────────────────────────
  const decisions = await prisma.buildPlanDecision.findMany({ where: { planId: plan.id } });
  const decisionMap = new Map(decisions.map((d) => [d.typeId, d.decision as "buy" | "build"]));

  // ── Level-2: sub-blueprints for materials marked "build" ──────────────────
  const allLevel1MatTypeIds = [
    ...new Set([...materialsByActivityId.values()].flatMap((mats) => mats.map((m) => m.typeId))),
  ];
  const buildDecisionTypeIds = allLevel1MatTypeIds.filter(
    (tid) => decisionMap.get(tid) === "build",
  );

  const subMaterialsByTypeId = new Map<
    number,
    Array<{ typeId: number; typeName: string; quantity: number }>
  >();
  const subBpOutputQtyByTypeId = new Map<number, number>();

  if (buildDecisionTypeIds.length) {
    const subActivities = await prisma.blueprintActivity.findMany({
      where: {
        activity: "MANUFACTURING",
        products: { some: { typeId: { in: buildDecisionTypeIds } } },
      },
      include: {
        products: { where: { typeId: { in: buildDecisionTypeIds } } },
        materials: { include: { type: { select: { name: true } } } },
      },
    });

    for (const act of subActivities) {
      for (const prod of act.products) {
        subBpOutputQtyByTypeId.set(prod.typeId, prod.quantity);
        subMaterialsByTypeId.set(
          prod.typeId,
          act.materials.map((m) => ({ typeId: m.typeId, typeName: m.type.name, quantity: m.quantity })),
        );
      }
    }
  }

  // ── Build PlanItemWithMaterials[] ─────────────────────────────────────────
  const itemMaterials: PlanItemWithMaterials[] = plan.items.map((item) => {
    const bpInfo = bpInfoByProductTypeId.get(item.typeId);
    const remaining = Math.max(0, item.quantity - item.completedQuantity);
    const runsNeeded = bpInfo && remaining > 0 ? Math.ceil(remaining / bpInfo.outputQty) : 0;
    const rawMaterials = bpInfo ? (materialsByActivityId.get(bpInfo.activityId) ?? []) : [];

    const materials: Material[] = rawMaterials.map((mat) => {
      const decision = decisionMap.get(mat.typeId) ?? "buy";
      const totalQty = mat.quantity * runsNeeded;
      const subRawMats = subMaterialsByTypeId.get(mat.typeId) ?? [];
      const subOutputQty = subBpOutputQtyByTypeId.get(mat.typeId) ?? 1;
      const subRunsNeeded =
        subRawMats.length > 0 && totalQty > 0 ? Math.ceil(totalQty / subOutputQty) : 0;

      return {
        typeId: mat.typeId,
        typeName: mat.typeName,
        quantity: totalQty,
        decision,
        canBuild: subRawMats.length > 0,
        subMaterials: subRawMats.map((sub) => ({
          typeId: sub.typeId,
          typeName: sub.typeName,
          quantity: sub.quantity * subRunsNeeded,
        })),
      };
    });

    return {
      itemId: item.id,
      typeName: item.type.name,
      quantity: item.quantity,
      completedQuantity: item.completedQuantity,
      runsNeeded,
      materials,
    };
  });

  // ── Shopping list ─────────────────────────────────────────────────────────
  // "buy" top-level materials + all sub-materials of "build" materials
  const shoppingMap = new Map<number, { typeName: string; quantity: number }>();

  for (const item of itemMaterials) {
    for (const mat of item.materials) {
      if (mat.decision === "buy") {
        const prev = shoppingMap.get(mat.typeId);
        shoppingMap.set(mat.typeId, {
          typeName: mat.typeName,
          quantity: (prev?.quantity ?? 0) + mat.quantity,
        });
      } else {
        for (const sub of mat.subMaterials) {
          const prev = shoppingMap.get(sub.typeId);
          shoppingMap.set(sub.typeId, {
            typeName: sub.typeName,
            quantity: (prev?.quantity ?? 0) + sub.quantity,
          });
        }
      }
    }
  }

  const shoppingList: ShoppingEntry[] = [...shoppingMap.entries()]
    .map(([typeId, { typeName, quantity }]) => ({ typeId, typeName, quantity }))
    .sort((a, b) => a.typeName.localeCompare(b.typeName));

  // ── Page ──────────────────────────────────────────────────────────────────
  return (
    <main className="flex-1 overflow-hidden p-4 flex flex-col gap-4 min-w-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 shrink-0">
        <div>
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
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-fg)" }}>
            {plan.items.length} {plan.items.length === 1 ? "item" : "items"}
          </p>
        </div>
      </div>

      {/* Add item */}
      <div
        className="flex flex-col gap-2 px-4 py-3 rounded border shrink-0"
        style={{ background: "var(--panel)", borderColor: "var(--border)" }}
      >
        <span className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>
          Add Item
        </span>
        <PlanItemSearch planId={plan.id} />
      </div>

      {/* Body: materials + shopping list */}
      {plan.items.length === 0 ? (
        <p className="text-xs py-4 text-center" style={{ color: "var(--muted-fg)" }}>
          No items — add one above
        </p>
      ) : (
        <PlanDetailBody planId={plan.id} items={itemMaterials} shopping={shoppingList} />
      )}
    </main>
  );
}
