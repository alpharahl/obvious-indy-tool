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

// ── Tree types (used by the inventory page) ──────────────────────────────────

export interface InventoryBpOption {
  id: string;
  me: number;
  te: number;
  runs: number;
  isBpo: boolean;
  characterName: string;
}

export interface InventoryTreeNode {
  typeId: number;
  typeName: string;
  quantity: number;         // total needed before stockpile
  effectiveQty: number;     // still needed after stockpile
  stockpileCovered: number; // covered by stockpile
  runsNeeded: number;       // manufacturing runs required (0 if not a build node)
  decision: "buy" | "build" | "gather";
  canBuild: boolean;
  subMaterials: InventoryTreeNode[];
  blueprintOptions: InventoryBpOption[];
  selectedBlueprints: Array<{ blueprintId: string; runs: number }>;
}

export interface InventoryPlanItemTree {
  itemId: string;
  typeId: number;
  typeName: string;
  quantity: number;
  completedQuantity: number;
  runsNeeded: number;
  materials: InventoryTreeNode[];
  blueprintOptions: InventoryBpOption[];
  selectedBlueprints: Array<{ blueprintId: string; runs: number }>;
}

/**
 * Returns the full material tree (with stockpile coverage + blueprint data) per plan item.
 * Used by the inventory page to render an expandable, blueprint-selectable tree.
 */
export async function computePlanItemTrees(
  planId: string,
  userId: string,
  stockpileByTypeId: Map<number, number>,
): Promise<InventoryPlanItemTree[]> {
  const plan = await prisma.buildPlan.findUnique({
    where: { id: planId },
    include: {
      items: { include: { type: { select: { name: true } } }, orderBy: { type: { name: "asc" } } },
      decisions: true,
      blueprintSelections: { include: { ownedBlueprint: true } },
    },
  });
  if (!plan || !plan.items.length) return [];

  const facilityMe = plan.facilityMe;
  const typeNameMap = new Map<number, string>();
  for (const item of plan.items) typeNameMap.set(item.typeId, item.type.name);

  const bpDataByTypeId = new Map<number, BpData>();
  const productTypeIds = plan.items.map((i) => i.typeId);

  // Level 0→1
  const mfgActivities = await prisma.blueprintActivity.findMany({
    where: { activity: { in: ["MANUFACTURING", "REACTION"] }, products: { some: { typeId: { in: productTypeIds } } } },
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
        materials: act.materials.map((m) => { typeNameMap.set(m.typeId, m.type.name); return { typeId: m.typeId, typeName: m.type.name, quantity: m.quantity }; }),
      });
    }
  }

  // Levels 2→MAX
  const fetchedTypeIds = new Set<number>(bpDataByTypeId.keys());
  let frontier = [...new Set(plan.items.flatMap((item) => bpDataByTypeId.get(item.typeId)?.materials.map((m) => m.typeId) ?? []))];
  for (let depth = 2; depth <= MAX_MATERIAL_DEPTH; depth++) {
    const toFetch = frontier.filter((tid) => !fetchedTypeIds.has(tid));
    if (!toFetch.length) break;
    toFetch.forEach((tid) => fetchedTypeIds.add(tid));
    const subActs = await prisma.blueprintActivity.findMany({
      where: { activity: { in: ["MANUFACTURING", "REACTION"] }, products: { some: { typeId: { in: toFetch } } } },
      include: { products: { where: { typeId: { in: toFetch } } }, materials: { include: { type: { select: { name: true } } } } },
    });
    const nextFrontier: number[] = [];
    for (const act of subActs) {
      for (const prod of act.products) {
        bpDataByTypeId.set(prod.typeId, {
          blueprintTypeId: act.blueprintId,
          outputQty: prod.quantity,
          materials: act.materials.map((m) => { typeNameMap.set(m.typeId, m.type.name); return { typeId: m.typeId, typeName: m.type.name, quantity: m.quantity }; }),
        });
        nextFrontier.push(...act.materials.map((m) => m.typeId));
      }
    }
    frontier = [...new Set(nextFrontier)];
  }

  // Owned blueprints for available options
  const allBpTypeIds = [...new Set([...bpDataByTypeId.values()].map((v) => v.blueprintTypeId))];
  const ownedBpRows = allBpTypeIds.length
    ? await prisma.ownedBlueprint.findMany({
        where: { typeId: { in: allBpTypeIds }, character: { userId } },
        include: { character: { select: { characterName: true } } },
        orderBy: [{ materialEfficiency: "desc" }, { timeEfficiency: "desc" }],
      })
    : [];
  const ownedBpByBpTypeId = new Map<number, InventoryBpOption[]>();
  for (const bp of ownedBpRows) {
    const list = ownedBpByBpTypeId.get(bp.typeId) ?? [];
    list.push({ id: bp.id, me: bp.materialEfficiency, te: bp.timeEfficiency, runs: bp.runs, isBpo: bp.runs === -1, characterName: bp.character.characterName });
    ownedBpByBpTypeId.set(bp.typeId, list);
  }

  // Plan blueprint selections (multiple per typeId)
  const planBpByProductTypeId = new Map<number, Array<{ ownedBlueprintId: string; me: number; runs: number }>>();
  for (const s of plan.blueprintSelections) {
    const list = planBpByProductTypeId.get(s.typeId) ?? [];
    list.push({ ownedBlueprintId: s.ownedBlueprintId, me: s.ownedBlueprint.materialEfficiency, runs: s.runs });
    planBpByProductTypeId.set(s.typeId, list);
  }

  const decisionMap = new Map(plan.decisions.map((d) => [d.typeId, d.decision]));
  const stockpileRemaining = new Map(stockpileByTypeId);

  function buildNode(typeId: number, totalQty: number, depth: number): InventoryTreeNode {
    const decision = (decisionMap.get(typeId) ?? "buy") as "buy" | "build" | "gather";
    const bpData = bpDataByTypeId.get(typeId);
    const canBuild = !!bpData;
    const typeName = typeNameMap.get(typeId) ?? String(typeId);

    const avail = stockpileRemaining.get(typeId) ?? 0;
    const stockpileCovered = Math.min(avail, totalQty);
    if (stockpileCovered > 0) stockpileRemaining.set(typeId, avail - stockpileCovered);
    const effectiveQty = totalQty - stockpileCovered;

    const blueprintOptions = bpData ? (ownedBpByBpTypeId.get(bpData.blueprintTypeId) ?? []) : [];
    const bpSelections = planBpByProductTypeId.get(typeId) ?? [];
    const selectedBlueprints = bpSelections.map((s) => ({ blueprintId: s.ownedBlueprintId, runs: s.runs }));
    const runsNeeded = bpData && effectiveQty > 0 ? Math.ceil(effectiveQty / bpData.outputQty) : 0;

    let subMaterials: InventoryTreeNode[] = [];
    if (decision === "build" && bpData && depth < MAX_MATERIAL_DEPTH && effectiveQty > 0) {
      const allocations = computeAllocations(bpSelections, runsNeeded);
      subMaterials = bpData.materials.map((mat) => {
        const adjTotal = allocations.reduce((sum, { me, runs }) => {
          const modifier = (1 - me / 100) * (1 - facilityMe / 100);
          const perRun = modifier < 1 ? Math.max(1, Math.ceil(mat.quantity * modifier)) : mat.quantity;
          return sum + perRun * runs;
        }, 0);
        return buildNode(mat.typeId, adjTotal, depth + 1);
      });
    }

    return { typeId, typeName, quantity: totalQty, effectiveQty, stockpileCovered, runsNeeded, decision, canBuild, subMaterials, blueprintOptions, selectedBlueprints };
  }

  return plan.items.map((item) => {
    const bpInfo = bpInfoByProductTypeId.get(item.typeId);
    const remaining = Math.max(0, item.quantity - item.completedQuantity);
    const runsNeeded = bpInfo && remaining > 0 ? Math.ceil(remaining / bpInfo.outputQty) : 0;
    const rawMaterials = bpInfo ? (bpDataByTypeId.get(item.typeId)?.materials ?? []) : [];

    const bpSelections = planBpByProductTypeId.get(item.typeId) ?? [];
    const allocations = computeAllocations(bpSelections, runsNeeded);
    const materials = rawMaterials.map((mat) => {
      const adjTotal = allocations.reduce((sum, { me, runs }) => {
        const modifier = (1 - me / 100) * (1 - facilityMe / 100);
        const perRun = modifier < 1 ? Math.max(1, Math.ceil(mat.quantity * modifier)) : mat.quantity;
        return sum + perRun * runs;
      }, 0);
      return buildNode(mat.typeId, adjTotal, 1);
    });

    const blueprintOptions = bpInfo ? (ownedBpByBpTypeId.get(bpInfo.blueprintTypeId) ?? []) : [];

    return {
      itemId: item.id,
      typeId: item.typeId,
      typeName: item.type.name,
      quantity: item.quantity,
      completedQuantity: item.completedQuantity,
      runsNeeded,
      materials,
      blueprintOptions,
      selectedBlueprints: bpSelections.map((s) => ({ blueprintId: s.ownedBlueprintId, runs: s.runs })),
    };
  });
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
