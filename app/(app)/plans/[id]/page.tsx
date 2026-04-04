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

// How many material levels deep to support (plan item → L1 → L2 → … → L_MAX_DEPTH)
const MAX_MATERIAL_DEPTH = 4;

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

  const productTypeIds = plan.items.map((i) => i.typeId);

  // ── Blueprint data map ────────────────────────────────────────────────────
  // Maps a product typeId → { outputQty, materials[] }
  // Populated iteratively for up to MAX_MATERIAL_DEPTH levels.
  const bpDataByTypeId = new Map<
    number,
    { outputQty: number; materials: Array<{ typeId: number; typeName: string; quantity: number }> }
  >();

  // We also need baseTime / blueprintTypeId for plan items (for est. time display, not used here
  // but kept in bpInfoByProductTypeId for potential future use).
  const bpInfoByProductTypeId = new Map<
    number,
    { blueprintTypeId: number; baseTime: number; outputQty: number }
  >();

  // Type name lookup accumulated across all fetches
  const typeNameMap = new Map<number, string>();
  for (const item of plan.items) {
    typeNameMap.set(item.typeId, item.type.name);
  }

  // ── Level 0 → 1: fetch blueprints/schematics that produce each plan item ──
  const mfgActivities = productTypeIds.length
    ? await prisma.blueprintActivity.findMany({
        where: {
          activity: { in: ["MANUFACTURING", "REACTION"] },
          products: { some: { typeId: { in: productTypeIds } } },
        },
        include: {
          products: { where: { typeId: { in: productTypeIds } } },
          materials: { include: { type: { select: { name: true } } } },
        },
      })
    : [];

  for (const act of mfgActivities) {
    for (const prod of act.products) {
      bpInfoByProductTypeId.set(prod.typeId, {
        blueprintTypeId: act.blueprintId,
        baseTime: act.time,
        outputQty: prod.quantity,
      });
      const mats = act.materials.map((m) => {
        typeNameMap.set(m.typeId, m.type.name);
        return { typeId: m.typeId, typeName: m.type.name, quantity: m.quantity };
      });
      bpDataByTypeId.set(prod.typeId, { outputQty: prod.quantity, materials: mats });
    }
  }

  // ── Decisions ─────────────────────────────────────────────────────────────
  const [decisions, allocations] = await Promise.all([
    prisma.buildPlanDecision.findMany({ where: { planId: plan.id } }),
    prisma.buildPlanAllocation.findMany({ where: { planId: plan.id } }),
  ]);
  const decisionMap = new Map(decisions.map((d) => [d.typeId, d.decision as "buy" | "build" | "gather"]));
  const allocationMap = new Map(allocations.map((a) => [a.typeId, a.quantity]));

  // ── Levels 2 → MAX_MATERIAL_DEPTH: iterative fetch ───────────────────────
  // We fetch blueprint data for ALL materials at each level so we know canBuild,
  // not just the ones currently marked "build".  fetchedTypeIds prevents re-querying.
  const fetchedTypeIds = new Set<number>(bpDataByTypeId.keys());

  // Initial frontier = all L1 material typeIds
  let frontier = [
    ...new Set(
      plan.items.flatMap((item) => bpDataByTypeId.get(item.typeId)?.materials.map((m) => m.typeId) ?? []),
    ),
  ];

  for (let depth = 2; depth <= MAX_MATERIAL_DEPTH; depth++) {
    const toFetch = frontier.filter((tid) => !fetchedTypeIds.has(tid));
    if (!toFetch.length) break;

    toFetch.forEach((tid) => fetchedTypeIds.add(tid));

    const subActs = await prisma.blueprintActivity.findMany({
      where: {
        activity: { in: ["MANUFACTURING", "REACTION"] },
        products: { some: { typeId: { in: toFetch } } },
      },
      include: {
        products: { where: { typeId: { in: toFetch } } },
        materials: { include: { type: { select: { name: true } } } },
      },
    });

    const nextFrontier: number[] = [];
    for (const act of subActs) {
      for (const prod of act.products) {
        const mats = act.materials.map((m) => {
          typeNameMap.set(m.typeId, m.type.name);
          return { typeId: m.typeId, typeName: m.type.name, quantity: m.quantity };
        });
        bpDataByTypeId.set(prod.typeId, { outputQty: prod.quantity, materials: mats });
        nextFrontier.push(...act.materials.map((m) => m.typeId));
      }
    }
    frontier = [...new Set(nextFrontier)];
  }

  // ── Recursive material tree builder ──────────────────────────────────────
  function buildMaterials(typeId: number, totalQty: number, depth: number): Material {
    const decision = (decisionMap.get(typeId) ?? "buy") as "buy" | "build" | "gather";
    const bpData = bpDataByTypeId.get(typeId);
    const canBuild = !!bpData;
    const typeName = typeNameMap.get(typeId) ?? String(typeId);

    let subMaterials: Material[] = [];
    if (decision === "build" && bpData && depth < MAX_MATERIAL_DEPTH) {
      const runsNeeded = totalQty > 0 ? Math.ceil(totalQty / bpData.outputQty) : 0;
      subMaterials = bpData.materials.map((mat) =>
        buildMaterials(mat.typeId, mat.quantity * runsNeeded, depth + 1),
      );
    }

    return { typeId, typeName, quantity: totalQty, decision, canBuild, subMaterials };
  }

  // ── Recursive item collector ─────────────────────────────────────────────
  // Recurses into sub-materials when decision="build" AND sub-materials exist.
  // Falls through to the appropriate map otherwise:
  //   "gather"  → gatherMap  (base resources: mine, do PI, etc.)
  //   anything else ("buy", no blueprint, depth limit) → buyMap
  function collectItems(
    materials: Material[],
    buyMap: Map<number, { typeName: string; quantity: number }>,
    gatherMap: Map<number, { typeName: string; quantity: number }>,
  ) {
    for (const mat of materials) {
      if (mat.decision === "build" && mat.subMaterials.length > 0) {
        collectItems(mat.subMaterials, buyMap, gatherMap);
      } else if (mat.decision === "gather") {
        const prev = gatherMap.get(mat.typeId);
        gatherMap.set(mat.typeId, { typeName: mat.typeName, quantity: (prev?.quantity ?? 0) + mat.quantity });
      } else {
        const prev = buyMap.get(mat.typeId);
        buyMap.set(mat.typeId, { typeName: mat.typeName, quantity: (prev?.quantity ?? 0) + mat.quantity });
      }
    }
  }

  // ── Build PlanItemWithMaterials[] ─────────────────────────────────────────
  const itemMaterials: PlanItemWithMaterials[] = plan.items.map((item) => {
    const bpInfo = bpInfoByProductTypeId.get(item.typeId);
    const remaining = Math.max(0, item.quantity - item.completedQuantity);
    const runsNeeded = bpInfo && remaining > 0 ? Math.ceil(remaining / bpInfo.outputQty) : 0;
    const rawMaterials = bpInfo ? (bpDataByTypeId.get(item.typeId)?.materials ?? []) : [];

    const materials = rawMaterials.map((mat) =>
      buildMaterials(mat.typeId, mat.quantity * runsNeeded, 1),
    );

    return {
      itemId: item.id,
      typeName: item.type.name,
      quantity: item.quantity,
      completedQuantity: item.completedQuantity,
      runsNeeded,
      materials,
    };
  });

  // ── Buy / gather lists ────────────────────────────────────────────────────
  const buyMap = new Map<number, { typeName: string; quantity: number }>();
  const gatherMap = new Map<number, { typeName: string; quantity: number }>();
  for (const item of itemMaterials) {
    collectItems(item.materials, buyMap, gatherMap);
  }
  const toEntries = (map: Map<number, { typeName: string; quantity: number }>): ShoppingEntry[] =>
    [...map.entries()]
      .map(([typeId, { typeName, quantity }]) => ({
        typeId,
        typeName,
        quantity,
        allocated: allocationMap.get(typeId) ?? 0,
      }))
      .sort((a, b) => a.typeName.localeCompare(b.typeName));

  const shoppingList = toEntries(buyMap);
  const gatherList = toEntries(gatherMap);

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
        <PlanDetailBody planId={plan.id} items={itemMaterials} shopping={shoppingList} gather={gatherList} />
      )}
    </main>
  );
}
