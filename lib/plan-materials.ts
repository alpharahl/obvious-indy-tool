/**
 * Shared utility: compute the buy/gather lists for a build plan.
 * Used by both the plan detail page and the inventory page.
 */
import { prisma } from "./prisma";

const MAX_MATERIAL_DEPTH = 4;

export interface PlanMaterialEntry {
  typeId: number;
  typeName: string;
  needed: number;   // total quantity needed (after decisions)
  kind: "buy" | "gather";
}

interface BpData {
  blueprintTypeId: number;
  outputQty: number;
  materials: Array<{ typeId: number; typeName: string; quantity: number }>;
}

type BpSelection = { me: number; runs: number };

function computeAllocations(selections: BpSelection[], totalRuns: number): BpSelection[] {
  let remaining = totalRuns;
  const allocs: BpSelection[] = [];
  for (const sel of selections) {
    const used = Math.min(sel.runs, remaining);
    if (used > 0) allocs.push({ me: sel.me, runs: used });
    remaining -= used;
    if (remaining <= 0) break;
  }
  if (remaining > 0) allocs.push({ me: 0, runs: remaining });
  return allocs;
}

interface RawMaterial {
  typeId: number;
  typeName: string;
  quantity: number;
  decision: "buy" | "build" | "gather";
  canBuild: boolean;
  subMaterials: RawMaterial[];
}

function buildTree(
  typeId: number,
  totalQty: number,
  depth: number,
  typeNameMap: Map<number, string>,
  bpDataByTypeId: Map<number, BpData>,
  decisionMap: Map<number, string>,
  planBlueprintMap: Map<number, BpSelection[]>,
  facilityMe: number,
): RawMaterial {
  const decision = (decisionMap.get(typeId) ?? "buy") as "buy" | "build" | "gather";
  const bpData = bpDataByTypeId.get(typeId);
  const canBuild = !!bpData;
  const typeName = typeNameMap.get(typeId) ?? String(typeId);

  let subMaterials: RawMaterial[] = [];
  if (decision === "build" && bpData && depth < MAX_MATERIAL_DEPTH && totalQty > 0) {
    const totalRuns = Math.ceil(totalQty / bpData.outputQty);
    const allocations = computeAllocations(planBlueprintMap.get(typeId) ?? [], totalRuns);
    subMaterials = bpData.materials.map((mat) => {
      const adjTotal = allocations.reduce((sum, { me, runs }) => {
        const modifier = (1 - me / 100) * (1 - facilityMe / 100);
        const perRun = modifier < 1 ? Math.max(1, Math.ceil(mat.quantity * modifier)) : mat.quantity;
        return sum + perRun * runs;
      }, 0);
      return buildTree(mat.typeId, adjTotal, depth + 1, typeNameMap, bpDataByTypeId, decisionMap, planBlueprintMap, facilityMe);
    });
  }

  return { typeId, typeName, quantity: totalQty, decision, canBuild, subMaterials };
}

function collectLeaves(
  materials: RawMaterial[],
  buyMap: Map<number, { typeName: string; quantity: number }>,
  gatherMap: Map<number, { typeName: string; quantity: number }>,
) {
  for (const mat of materials) {
    if (mat.decision === "build" && mat.subMaterials.length > 0) {
      collectLeaves(mat.subMaterials, buyMap, gatherMap);
    } else if (mat.decision === "gather") {
      const prev = gatherMap.get(mat.typeId);
      gatherMap.set(mat.typeId, { typeName: mat.typeName, quantity: (prev?.quantity ?? 0) + mat.quantity });
    } else {
      const prev = buyMap.get(mat.typeId);
      buyMap.set(mat.typeId, { typeName: mat.typeName, quantity: (prev?.quantity ?? 0) + mat.quantity });
    }
  }
}

export async function computePlanMaterials(planId: string): Promise<PlanMaterialEntry[]> {
  const plan = await prisma.buildPlan.findUnique({
    where: { id: planId },
    include: {
      items: { include: { type: { select: { name: true } } } },
      decisions: true,
      blueprintSelections: { include: { ownedBlueprint: true } },
    },
  });
  if (!plan) return [];

  const productTypeIds = plan.items.map((i) => i.typeId);
  if (!productTypeIds.length) return [];

  const typeNameMap = new Map<number, string>();
  for (const item of plan.items) typeNameMap.set(item.typeId, item.type.name);

  const bpDataByTypeId = new Map<number, BpData>();

  // Level 0→1
  const mfgActivities = await prisma.blueprintActivity.findMany({
    where: {
      activity: { in: ["MANUFACTURING", "REACTION"] },
      products: { some: { typeId: { in: productTypeIds } } },
    },
    include: {
      products: { where: { typeId: { in: productTypeIds } } },
      materials: { include: { type: { select: { name: true } } } },
    },
  });

  const bpInfoByProductTypeId = new Map<number, { blueprintTypeId: number; outputQty: number }>();
  for (const act of mfgActivities) {
    for (const prod of act.products) {
      bpInfoByProductTypeId.set(prod.typeId, { blueprintTypeId: act.blueprintId, outputQty: prod.quantity });
      bpDataByTypeId.set(prod.typeId, {
        blueprintTypeId: act.blueprintId,
        outputQty: prod.quantity,
        materials: act.materials.map((m) => {
          typeNameMap.set(m.typeId, m.type.name);
          return { typeId: m.typeId, typeName: m.type.name, quantity: m.quantity };
        }),
      });
    }
  }

  const decisionMap = new Map(plan.decisions.map((d) => [d.typeId, d.decision]));

  // Blueprint ME/TE selections: productTypeId → ordered list of { me, runs }
  const planBlueprintMap = new Map<number, BpSelection[]>();
  for (const s of plan.blueprintSelections) {
    const list = planBlueprintMap.get(s.typeId) ?? [];
    list.push({ me: s.ownedBlueprint.materialEfficiency, runs: s.runs });
    planBlueprintMap.set(s.typeId, list);
  }

  // Iterative depth fetch
  const fetchedTypeIds = new Set<number>(bpDataByTypeId.keys());
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
        bpDataByTypeId.set(prod.typeId, {
          blueprintTypeId: act.blueprintId,
          outputQty: prod.quantity,
          materials: act.materials.map((m) => {
            typeNameMap.set(m.typeId, m.type.name);
            return { typeId: m.typeId, typeName: m.type.name, quantity: m.quantity };
          }),
        });
        nextFrontier.push(...act.materials.map((m) => m.typeId));
      }
    }
    frontier = [...new Set(nextFrontier)];
  }

  // Build material trees and collect leaves
  const buyMap = new Map<number, { typeName: string; quantity: number }>();
  const gatherMap = new Map<number, { typeName: string; quantity: number }>();

  for (const item of plan.items) {
    const bpInfo = bpInfoByProductTypeId.get(item.typeId);
    const remaining = Math.max(0, item.quantity - item.completedQuantity);
    const runsNeeded = bpInfo && remaining > 0 ? Math.ceil(remaining / bpInfo.outputQty) : 0;
    const rawMaterials = bpInfo ? (bpDataByTypeId.get(item.typeId)?.materials ?? []) : [];

    // Apply ME from selected blueprints and facility bonus for this plan item
    const facilityMe = plan.facilityMe;
    const allocations = computeAllocations(planBlueprintMap.get(item.typeId) ?? [], runsNeeded);
    const trees = rawMaterials.map((mat) => {
      const adjTotal = allocations.reduce((sum, { me, runs }) => {
        const modifier = (1 - me / 100) * (1 - facilityMe / 100);
        const perRun = modifier < 1 ? Math.max(1, Math.ceil(mat.quantity * modifier)) : mat.quantity;
        return sum + perRun * runs;
      }, 0);
      return buildTree(mat.typeId, adjTotal, 1, typeNameMap, bpDataByTypeId, decisionMap, planBlueprintMap, facilityMe);
    });
    collectLeaves(trees, buyMap, gatherMap);
  }

  const entries: PlanMaterialEntry[] = [
    ...[...buyMap.entries()].map(([typeId, { typeName, quantity }]) => ({
      typeId, typeName, needed: quantity, kind: "buy" as const,
    })),
    ...[...gatherMap.entries()].map(([typeId, { typeName, quantity }]) => ({
      typeId, typeName, needed: quantity, kind: "gather" as const,
    })),
  ];

  return entries.sort((a, b) => a.typeName.localeCompare(b.typeName));
}
