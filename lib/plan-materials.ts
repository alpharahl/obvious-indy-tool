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
  outputQty: number;
  materials: Array<{ typeId: number; typeName: string; quantity: number }>;
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
): RawMaterial {
  const decision = (decisionMap.get(typeId) ?? "buy") as "buy" | "build" | "gather";
  const bpData = bpDataByTypeId.get(typeId);
  const canBuild = !!bpData;
  const typeName = typeNameMap.get(typeId) ?? String(typeId);

  let subMaterials: RawMaterial[] = [];
  if (decision === "build" && bpData && depth < MAX_MATERIAL_DEPTH) {
    const runsNeeded = totalQty > 0 ? Math.ceil(totalQty / bpData.outputQty) : 0;
    subMaterials = bpData.materials.map((mat) =>
      buildTree(mat.typeId, mat.quantity * runsNeeded, depth + 1, typeNameMap, bpDataByTypeId, decisionMap),
    );
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

  const bpInfoByProductTypeId = new Map<number, { outputQty: number }>();
  for (const act of mfgActivities) {
    for (const prod of act.products) {
      bpInfoByProductTypeId.set(prod.typeId, { outputQty: prod.quantity });
      bpDataByTypeId.set(prod.typeId, {
        outputQty: prod.quantity,
        materials: act.materials.map((m) => {
          typeNameMap.set(m.typeId, m.type.name);
          return { typeId: m.typeId, typeName: m.type.name, quantity: m.quantity };
        }),
      });
    }
  }

  const decisionMap = new Map(plan.decisions.map((d) => [d.typeId, d.decision]));

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

    const trees = rawMaterials.map((mat) =>
      buildTree(mat.typeId, mat.quantity * runsNeeded, 1, typeNameMap, bpDataByTypeId, decisionMap),
    );
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
