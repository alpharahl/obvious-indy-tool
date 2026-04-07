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
  // Maps a product typeId → { blueprintTypeId, outputQty, materials[] }
  // Populated iteratively for up to MAX_MATERIAL_DEPTH levels.
  const bpDataByTypeId = new Map<
    number,
    { blueprintTypeId: number; outputQty: number; materials: Array<{ typeId: number; typeName: string; quantity: number }> }
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
      bpDataByTypeId.set(prod.typeId, { blueprintTypeId: act.blueprintId, outputQty: prod.quantity, materials: mats });
    }
  }

  // ── Decisions + stockpile ─────────────────────────────────────────────────
  const [decisions, stockpiles] = await Promise.all([
    prisma.buildPlanDecision.findMany({ where: { planId: plan.id } }),
    prisma.stockpile.findMany({
      where: { userId: session.user.id },
      include: { items: true },
    }),
  ]);
  const decisionMap = new Map(decisions.map((d) => [d.typeId, d.decision as "buy" | "build" | "gather"]));

  // Aggregate all stockpile quantities by typeId
  const stockpileByTypeId = new Map<number, number>();
  for (const sp of stockpiles) {
    for (const item of sp.items) {
      stockpileByTypeId.set(item.typeId, (stockpileByTypeId.get(item.typeId) ?? 0) + item.quantity);
    }
  }
  // Mutable copy consumed during tree traversal — stockpile "spent" as materials are matched
  const stockpileRemaining = new Map(stockpileByTypeId);

  // ── Blueprint selections + owned blueprints ───────────────────────────────
  // Loaded after bpDataByTypeId is fully populated so we know all relevant blueprint typeIds.
  // (These fetches happen after the iterative depth loop below; deferred intentionally.)

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
        bpDataByTypeId.set(prod.typeId, { blueprintTypeId: act.blueprintId, outputQty: prod.quantity, materials: mats });
        nextFrontier.push(...act.materials.map((m) => m.typeId));
      }
    }
    frontier = [...new Set(nextFrontier)];
  }

  // ── Owned blueprints + plan blueprint selections ──────────────────────────
  // Collect all blueprint typeIds (not product typeIds) for which we have data.
  const allBlueprintTypeIds = [...new Set([...bpDataByTypeId.values()].map((v) => v.blueprintTypeId))];

  const [planBpSelections, ownedBpRows] = await Promise.all([
    prisma.buildPlanBlueprint.findMany({
      where: { planId: plan.id },
      include: { ownedBlueprint: true },
    }),
    allBlueprintTypeIds.length
      ? prisma.ownedBlueprint.findMany({
          where: { typeId: { in: allBlueprintTypeIds }, character: { userId: session.user.id } },
          include: { character: { select: { characterName: true } } },
          orderBy: [{ materialEfficiency: "desc" }, { timeEfficiency: "desc" }],
        })
      : Promise.resolve([]),
  ]);

  // planBlueprintByProductTypeId: productTypeId → { ownedBlueprintId, me, te }
  const planBlueprintByProductTypeId = new Map(
    planBpSelections.map((s) => [
      s.typeId,
      { ownedBlueprintId: s.ownedBlueprintId, me: s.ownedBlueprint.materialEfficiency, te: s.ownedBlueprint.timeEfficiency },
    ]),
  );

  // ownedBlueprintsByBpTypeId: blueprintTypeId → BlueprintOption[]
  // BlueprintOption is defined in PlanDetailBody; build a compatible shape here.
  const ownedBlueprintsByBpTypeId = new Map<
    number,
    Array<{ id: string; me: number; te: number; runs: number; isBpo: boolean; characterName: string }>
  >();
  for (const bp of ownedBpRows) {
    const list = ownedBlueprintsByBpTypeId.get(bp.typeId) ?? [];
    list.push({
      id: bp.id,
      me: bp.materialEfficiency,
      te: bp.timeEfficiency,
      runs: bp.runs,
      isBpo: bp.runs === -1,
      characterName: bp.character.characterName,
    });
    ownedBlueprintsByBpTypeId.set(bp.typeId, list);
  }

  // ── Recursive material tree builder ──────────────────────────────────────
  // Consumes from stockpileRemaining at each node so stockpile isn't double-counted.
  function buildMaterials(typeId: number, totalQty: number, depth: number): Material {
    const decision = (decisionMap.get(typeId) ?? "buy") as "buy" | "build" | "gather";
    const bpData = bpDataByTypeId.get(typeId);
    const canBuild = !!bpData;
    const typeName = typeNameMap.get(typeId) ?? String(typeId);

    // Consume from stockpile
    const available = stockpileRemaining.get(typeId) ?? 0;
    const stockpileCovered = Math.min(available, totalQty);
    if (stockpileCovered > 0) stockpileRemaining.set(typeId, available - stockpileCovered);
    const effectiveQty = totalQty - stockpileCovered;

    // Blueprint options and selected blueprint for this node
    const blueprintTypeId = bpData?.blueprintTypeId;
    const blueprintOptions = blueprintTypeId ? (ownedBlueprintsByBpTypeId.get(blueprintTypeId) ?? []) : [];
    const selectedBp = planBlueprintByProductTypeId.get(typeId);
    const selectedBlueprintId = selectedBp?.ownedBlueprintId ?? null;
    const meLevel = selectedBp?.me ?? 0;

    // Only recurse for the quantity not covered by stockpile; apply ME to sub-material quantities
    let subMaterials: Material[] = [];
    if (decision === "build" && bpData && depth < MAX_MATERIAL_DEPTH && effectiveQty > 0) {
      const runsNeeded = Math.ceil(effectiveQty / bpData.outputQty);
      subMaterials = bpData.materials.map((mat) => {
        const adjQtyPerRun = meLevel > 0 ? Math.max(1, Math.ceil(mat.quantity * (1 - meLevel / 100))) : mat.quantity;
        return buildMaterials(mat.typeId, adjQtyPerRun * runsNeeded, depth + 1);
      });
    }

    return { typeId, typeName, quantity: totalQty, effectiveQty, stockpileCovered, decision, canBuild, subMaterials, blueprintOptions, selectedBlueprintId };
  }

  // ── Recursive item collector ─────────────────────────────────────────────
  // Recurses into sub-materials when decision="build" AND sub-materials exist.
  // Falls through to the appropriate map otherwise:
  //   "gather"  → gatherMap  (base resources: mine, do PI, etc.)
  //   anything else ("buy", no blueprint, depth limit) → buyMap
  // "build" nodes fully covered by stockpile (effectiveQty=0, subMaterials=[]) are skipped.
  type LeafValue = { typeName: string; quantity: number; stockpileCovered: number };
  function collectItems(
    materials: Material[],
    buyMap: Map<number, LeafValue>,
    gatherMap: Map<number, LeafValue>,
  ) {
    for (const mat of materials) {
      if (mat.decision === "build" && mat.subMaterials.length > 0) {
        // Build node expanded: recurse (sub-materials are already scaled by effectiveQty)
        collectItems(mat.subMaterials, buyMap, gatherMap);
      } else if (mat.decision === "build" && mat.effectiveQty === 0) {
        // Build node fully covered by stockpile — nothing left to source
        continue;
      } else if (mat.decision === "gather") {
        const prev = gatherMap.get(mat.typeId);
        gatherMap.set(mat.typeId, {
          typeName: mat.typeName,
          quantity: (prev?.quantity ?? 0) + mat.quantity,
          stockpileCovered: (prev?.stockpileCovered ?? 0) + mat.stockpileCovered,
        });
      } else {
        // "buy" or "build" with no blueprint
        const prev = buyMap.get(mat.typeId);
        buyMap.set(mat.typeId, {
          typeName: mat.typeName,
          quantity: (prev?.quantity ?? 0) + mat.quantity,
          stockpileCovered: (prev?.stockpileCovered ?? 0) + mat.stockpileCovered,
        });
      }
    }
  }

  // ── Build PlanItemWithMaterials[] ─────────────────────────────────────────
  const itemMaterials: PlanItemWithMaterials[] = plan.items.map((item) => {
    const bpInfo = bpInfoByProductTypeId.get(item.typeId);
    const remaining = Math.max(0, item.quantity - item.completedQuantity);
    const runsNeeded = bpInfo && remaining > 0 ? Math.ceil(remaining / bpInfo.outputQty) : 0;
    const rawMaterials = bpInfo ? (bpDataByTypeId.get(item.typeId)?.materials ?? []) : [];

    // Blueprint selection for this plan item (ME reduces the item's direct materials)
    const selectedBp = planBlueprintByProductTypeId.get(item.typeId);
    const meLevel = selectedBp?.me ?? 0;
    const blueprintTypeId = bpInfo?.blueprintTypeId;
    const blueprintOptions = blueprintTypeId ? (ownedBlueprintsByBpTypeId.get(blueprintTypeId) ?? []) : [];

    const materials = rawMaterials.map((mat) => {
      const adjQtyPerRun = meLevel > 0 ? Math.max(1, Math.ceil(mat.quantity * (1 - meLevel / 100))) : mat.quantity;
      return buildMaterials(mat.typeId, adjQtyPerRun * runsNeeded, 1);
    });

    return {
      itemId: item.id,
      typeId: item.typeId,
      typeName: item.type.name,
      quantity: item.quantity,
      completedQuantity: item.completedQuantity,
      runsNeeded,
      materials,
      blueprintOptions,
      selectedBlueprintId: selectedBp?.ownedBlueprintId ?? null,
    };
  });

  // ── Buy / gather lists ────────────────────────────────────────────────────
  const buyMap = new Map<number, { typeName: string; quantity: number; stockpileCovered: number }>();
  const gatherMap = new Map<number, { typeName: string; quantity: number; stockpileCovered: number }>();
  for (const item of itemMaterials) {
    collectItems(item.materials, buyMap, gatherMap);
  }
  const toEntries = (map: Map<number, { typeName: string; quantity: number; stockpileCovered: number }>): ShoppingEntry[] =>
    [...map.entries()]
      .map(([typeId, { typeName, quantity, stockpileCovered }]) => ({
        typeId,
        typeName,
        quantity,
        stockpileCovered,
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
