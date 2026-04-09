"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { prisma } from "../../lib/prisma";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } });
  if (!user) redirect("/login");
  return session.user.id;
}

export async function createPlan(formData: FormData) {
  const userId = await requireUserId();
  const name = (formData.get("name") as string | null)?.trim();
  if (!name) throw new Error("Plan name is required");

  const plan = await prisma.buildPlan.create({
    data: { userId, name },
  });

  redirect(`/plans/${plan.id}`);
}

export async function deletePlan(planId: string) {
  const userId = await requireUserId();
  await prisma.buildPlan.deleteMany({ where: { id: planId, userId } });
  revalidatePath("/plans");
  redirect("/plans");
}

export async function getOrCreateDefaultPlan() {
  const userId = await requireUserId();
  let plan = await prisma.buildPlan.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      items: {
        include: { type: { select: { name: true, group: { select: { categoryId: true } } } } },
        orderBy: { type: { name: "asc" } },
      },
    },
  });
  if (!plan) {
    plan = await prisma.buildPlan.create({
      data: { userId, name: "My Plan" },
      include: { items: { include: { type: { select: { name: true, group: { select: { categoryId: true } } } } } } },
    });
  }
  return plan;
}

export async function addPlanItem(planId: string, typeId: number, quantity: number) {
  const userId = await requireUserId();
  // Verify plan belongs to user
  const plan = await prisma.buildPlan.findFirst({ where: { id: planId, userId } });
  if (!plan) throw new Error("Plan not found");

  await prisma.buildPlanItem.upsert({
    where: { planId_typeId: { planId, typeId } },
    update: { quantity },
    create: { planId, typeId, quantity },
  });
  revalidatePath("/plans");
}

export async function updateItemCompletion(planId: string, itemId: string, completedQuantity: number) {
  const userId = await requireUserId();
  const plan = await prisma.buildPlan.findFirst({ where: { id: planId, userId } });
  if (!plan) throw new Error("Plan not found");

  await prisma.buildPlanItem.update({
    where: { id: itemId },
    data: { completedQuantity: Math.max(0, completedQuantity) },
  });
  revalidatePath(`/plans/${planId}`);
  revalidatePath("/");
}

export async function removePlanItem(planId: string, itemId: string) {
  const userId = await requireUserId();
  const plan = await prisma.buildPlan.findFirst({ where: { id: planId, userId } });
  if (!plan) throw new Error("Plan not found");

  await prisma.buildPlanItem.delete({ where: { id: itemId } });
  revalidatePath("/plans");
}

export async function setPlanDecision(planId: string, typeId: number, decision: "buy" | "build" | "gather") {
  const userId = await requireUserId();
  const plan = await prisma.buildPlan.findFirst({ where: { id: planId, userId } });
  if (!plan) throw new Error("Plan not found");

  if (decision === "buy") {
    await prisma.buildPlanDecision.deleteMany({ where: { planId, typeId } });
  } else {
    await prisma.buildPlanDecision.upsert({
      where: { planId_typeId: { planId, typeId } },
      update: { decision },
      create: { planId, typeId, decision },
    });
  }
  revalidatePath("/plans");
}

export async function setBpEfficiency(planId: string, typeId: number, me: number, te: number) {
  const userId = await requireUserId();
  const plan = await prisma.buildPlan.findFirst({ where: { id: planId, userId } });
  if (!plan) throw new Error("Plan not found");

  await prisma.buildPlanDecision.upsert({
    where: { planId_typeId: { planId, typeId } },
    update: { me, te },
    create: { planId, typeId, decision: "build", me, te },
  });
  revalidatePath("/plans");
}

export async function setItemFacility(
  planId: string,
  typeId: number,
  f: {
    systemName: string;
    stationType: string;
    structureType: string;
    meRigTier: string;
    teRigTier: string;
    facilityMe: number;
    facilityTe: number;
  },
) {
  const userId = await requireUserId();
  const plan = await prisma.buildPlan.findFirst({ where: { id: planId, userId } });
  if (!plan) throw new Error("Plan not found");

  const data = {
    systemName: f.systemName || null,
    stationType: f.stationType || null,
    structureType: f.structureType || null,
    meRigTier: f.meRigTier || null,
    teRigTier: f.teRigTier || null,
    facilityMe: f.facilityMe,
    facilityTe: f.facilityTe,
  };

  await prisma.buildPlanDecision.upsert({
    where: { planId_typeId: { planId, typeId } },
    update: data,
    create: { planId, typeId, decision: "build", ...data },
  });
  revalidatePath("/plans");
}

export async function searchSystems(query: string, secClass?: "hs" | "ls" | "ns" | "wh") {
  if (query.trim().length < 2) return [];
  const secFilter =
    secClass === "hs" ? { security: { gte: 0.45 } } :
    secClass === "ls" ? { security: { gt: 0.0, lt: 0.45 } } :
    secClass === "ns" ? { security: { lte: 0.0 }, NOT: { name: { startsWith: "J" } } } :
    secClass === "wh" ? { name: { startsWith: "J" }, security: { lt: 0.0 } } :
    {};
  return prisma.sdeSolarSystem.findMany({
    where: { name: { contains: query.trim(), mode: "insensitive" }, ...secFilter },
    select: { id: true, name: true, security: true },
    orderBy: { name: "asc" },
    take: 20,
  });
}

export async function setBulkDecisions(planId: string, typeIds: number[], decision: "buy" | "build") {
  const userId = await requireUserId();
  const plan = await prisma.buildPlan.findFirst({ where: { id: planId, userId } });
  if (!plan) throw new Error("Plan not found");

  if (decision === "buy") {
    await prisma.buildPlanDecision.deleteMany({ where: { planId, typeId: { in: typeIds } } });
  } else {
    await prisma.$transaction(
      typeIds.map((typeId) =>
        prisma.buildPlanDecision.upsert({
          where: { planId_typeId: { planId, typeId } },
          update: { decision },
          create: { planId, typeId, decision },
        }),
      ),
    );
  }
  revalidatePath("/plans");
}

export async function setPlanAllocation(planId: string, typeId: number, quantity: number) {
  const userId = await requireUserId();
  const plan = await prisma.buildPlan.findFirst({ where: { id: planId, userId } });
  if (!plan) throw new Error("Plan not found");

  if (quantity <= 0) {
    await prisma.buildPlanAllocation.deleteMany({ where: { planId, typeId } });
  } else {
    await prisma.buildPlanAllocation.upsert({
      where: { planId_typeId: { planId, typeId } },
      update: { quantity },
      create: { planId, typeId, quantity },
    });
  }
  revalidatePath("/inventory");
  revalidatePath(`/plans/${planId}`);
}

export async function setPlanFacility(planId: string, facilityName: string, facilityMe: number) {
  const userId = await requireUserId();
  await prisma.buildPlan.updateMany({
    where: { id: planId, userId },
    data: {
      facilityName: facilityName || null,
      facilityMe: Math.max(0, facilityMe),
    },
  });
  revalidatePath("/plans");
}

export async function setPlanBlueprint(planId: string, productTypeId: number, ownedBlueprintId: string, runs: number) {
  const userId = await requireUserId();
  const plan = await prisma.buildPlan.findFirst({ where: { id: planId, userId } });
  if (!plan) throw new Error("Plan not found");

  if (runs <= 0) {
    await prisma.buildPlanBlueprint.deleteMany({ where: { planId, typeId: productTypeId, ownedBlueprintId } });
  } else {
    const bp = await prisma.ownedBlueprint.findFirst({
      where: { id: ownedBlueprintId, character: { userId } },
    });
    if (!bp) throw new Error("Blueprint not found");
    await prisma.buildPlanBlueprint.upsert({
      where: { planId_typeId_ownedBlueprintId: { planId, typeId: productTypeId, ownedBlueprintId } },
      update: { runs },
      create: { planId, typeId: productTypeId, ownedBlueprintId, runs },
    });
  }
  revalidatePath(`/plans/${planId}`);
}

export async function setBulkItemFacility(
  planId: string,
  typeIds: number[],
  f: {
    systemName: string;
    stationType: string;
    structureType: string;
    meRigTier: string;
    teRigTier: string;
    facilityMe: number;
    facilityTe: number;
  },
) {
  const userId = await requireUserId();
  const plan = await prisma.buildPlan.findFirst({ where: { id: planId, userId } });
  if (!plan) throw new Error("Plan not found");

  const data = {
    systemName: f.systemName || null,
    stationType: f.stationType || null,
    structureType: f.structureType || null,
    meRigTier: f.meRigTier || null,
    teRigTier: f.teRigTier || null,
    facilityMe: f.facilityMe,
    facilityTe: f.facilityTe,
  };

  await prisma.$transaction(
    typeIds.map((typeId) =>
      prisma.buildPlanDecision.upsert({
        where: { planId_typeId: { planId, typeId } },
        update: data,
        create: { planId, typeId, decision: "build", ...data },
      }),
    ),
  );
  revalidatePath("/plans");
}

export async function searchBuildableTypes(query: string) {
  if (query.trim().length < 2) return [];
  return prisma.sdeType.findMany({
    where: {
      name: { contains: query.trim(), mode: "insensitive" },
      published: true,
      blueprintProducts: {
        some: {
          blueprintActivity: { activity: "MANUFACTURING" },
        },
      },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 20,
  });
}
