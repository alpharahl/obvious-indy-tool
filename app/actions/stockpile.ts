"use server";

import { revalidatePath } from "next/cache";
import { auth } from "../../auth";
import { prisma } from "../../lib/prisma";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user.id;
}

export async function searchLocations(
  query: string,
): Promise<Array<{ name: string; kind: "station" | "system" | "region" | "structure" }>> {
  if (query.length < 2) return [];

  const [stations, structures, systems, regions] = await Promise.all([
    prisma.sdeStation.findMany({
      where: { name: { contains: query, mode: "insensitive" } },
      take: 4,
      select: { name: true },
    }),
    prisma.structure.findMany({
      where: { name: { contains: query, mode: "insensitive" } },
      take: 4,
      select: { name: true },
    }),
    prisma.sdeSolarSystem.findMany({
      where: { name: { contains: query, mode: "insensitive" } },
      take: 4,
      select: { name: true },
    }),
    prisma.sdeRegion.findMany({
      where: { name: { contains: query, mode: "insensitive" } },
      take: 4,
      select: { name: true },
    }),
  ]);

  const results: Array<{ name: string; kind: "station" | "system" | "region" | "structure" }> = [
    ...stations.map((s) => ({ name: s.name, kind: "station" as const })),
    ...structures.map((s) => ({ name: s.name, kind: "structure" as const })),
    ...systems.map((s) => ({ name: s.name, kind: "system" as const })),
    ...regions.map((s) => ({ name: s.name, kind: "region" as const })),
  ];

  return results.slice(0, 10);
}

export async function saveStockpile(
  name: string,
  rawText: string,
): Promise<{ saved: number; unmatched: string[] }> {
  const userId = await requireUserId();

  // Parse EVE clipboard format — handle both \r\n and \n
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed: Array<{ name: string; quantity: number }> = lines.map((line) => {
    const tabIdx = line.indexOf("\t");
    if (tabIdx === -1) {
      return { name: line, quantity: 1 };
    }
    const itemName = line.slice(0, tabIdx).trim();
    const qtyStr = line.slice(tabIdx + 1).trim().replace(/,/g, "");
    const quantity = parseInt(qtyStr, 10) || 1;
    return { name: itemName, quantity };
  });

  const names = parsed.map((p) => p.name);

  const matchedTypes = await prisma.sdeType.findMany({
    where: { name: { in: names, mode: "insensitive" } },
    select: { id: true, name: true },
  });

  const typeMap = new Map(matchedTypes.map((t) => [t.name.toLowerCase(), t]));

  const matched: Array<{ typeId: number; quantity: number }> = [];
  const unmatched: string[] = [];

  for (const item of parsed) {
    const found = typeMap.get(item.name.toLowerCase());
    if (found) {
      matched.push({ typeId: found.id, quantity: item.quantity });
    } else {
      unmatched.push(item.name);
    }
  }

  // Upsert stockpile: if one exists for this user+name, replace its items
  const existing = await prisma.stockpile.findFirst({
    where: { userId, name },
  });

  if (existing) {
    await prisma.stockpileItem.deleteMany({ where: { stockpileId: existing.id } });
    await prisma.stockpile.update({
      where: { id: existing.id },
      data: {
        updatedAt: new Date(),
        items: {
          createMany: { data: matched },
        },
      },
    });
  } else {
    await prisma.stockpile.create({
      data: {
        userId,
        name,
        items: {
          createMany: { data: matched },
        },
      },
    });
  }

  revalidatePath("/inventory");
  return { saved: matched.length, unmatched };
}

export async function deleteStockpile(id: string): Promise<void> {
  const userId = await requireUserId();
  await prisma.stockpile.deleteMany({ where: { id, userId } });
  revalidatePath("/inventory");
}
