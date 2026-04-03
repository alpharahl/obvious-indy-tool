"use server";

import { revalidatePath } from "next/cache";
import { auth } from "../../auth";
import { prisma } from "../../lib/prisma";
import { esiGet } from "../../lib/esi";

interface EsiAsset {
  item_id: number;
  type_id: number;
  location_id: number;
  quantity: number;
  location_flag: string;
  is_singleton: boolean;
}

interface EsiStructure {
  name: string;
  owner_id: number;
  solar_system_id: number;
  type_id?: number;
}

export async function syncAssets() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const characters = await prisma.character.findMany({
    where: { userId: session.user.id },
  });

  await Promise.all(
    characters.map(async (char) => {
      // Fetch all pages from ESI (page size is 1000).
      const allAssets: EsiAsset[] = [];
      let page = 1;
      while (true) {
        const batch = await esiGet<EsiAsset[]>(
          `/characters/${char.characterId}/assets/?page=${page}`,
          char.id,
        );
        allAssets.push(...batch);
        if (batch.length < 1000) break;
        page++;
      }

      // Only insert assets whose typeId exists in the SDE.
      const typeIds = [...new Set(allAssets.map((a) => a.type_id))];
      const knownTypes = await prisma.sdeType.findMany({
        where: { id: { in: typeIds } },
        select: { id: true },
      });
      const knownTypeIds = new Set(knownTypes.map((t) => t.id));
      const validAssets = allAssets.filter((a) => knownTypeIds.has(a.type_id));

      // Replace this character's assets atomically.
      await prisma.$transaction([
        prisma.asset.deleteMany({ where: { characterId: char.id } }),
        prisma.asset.createMany({
          data: validAssets.map((a) => ({
            itemId: BigInt(a.item_id),
            characterId: char.id,
            typeId: a.type_id,
            locationId: BigInt(a.location_id),
            quantity: a.quantity,
            isSingleton: a.is_singleton,
          })),
          skipDuplicates: true,
        }),
      ]);

      // Resolve player-owned structure names for any locationIds > 1 trillion.
      const structureIds = [
        ...new Set(
          validAssets
            .map((a) => BigInt(a.location_id))
            .filter((id) => id > 1_000_000_000_000n)
        ),
      ];

      // Only resolve structures we haven't cached yet.
      const cached = await prisma.structure.findMany({
        where: { id: { in: structureIds } },
        select: { id: true },
      });
      const cachedIds = new Set(cached.map((s) => s.id));
      const newStructureIds = structureIds.filter((id) => !cachedIds.has(id));

      for (const structureId of newStructureIds) {
        try {
          const info = await esiGet<EsiStructure>(
            `/universe/structures/${structureId}/`,
            char.id,
          );
          await prisma.structure.upsert({
            where: { id: structureId },
            update: {
              name: info.name,
              solarSystemId: info.solar_system_id,
              ownerId: info.owner_id,
              typeId: info.type_id ?? null,
            },
            create: {
              id: structureId,
              name: info.name,
              solarSystemId: info.solar_system_id,
              ownerId: info.owner_id,
              typeId: info.type_id ?? null,
            },
          });
        } catch {
          // Character may lack docking access — skip silently.
        }
      }
    }),
  );

  revalidatePath("/account");
}
