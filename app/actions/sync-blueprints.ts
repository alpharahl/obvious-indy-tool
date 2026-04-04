"use server";

import { revalidatePath } from "next/cache";
import { auth } from "../../auth";
import { prisma } from "../../lib/prisma";
import { esiGet } from "../../lib/esi";

interface EsiBlueprintItem {
  item_id: number;
  type_id: number;
  location_id: number;
  location_flag: string;
  quantity: number;   // -1 = BPO, -2 = being copied
  runs: number;       // -1 = BPO
  material_efficiency: number;
  time_efficiency: number;
}

export async function syncBlueprints() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const characters = await prisma.character.findMany({
    where: { userId: session.user.id },
  });

  await Promise.all(
    characters.map(async (char) => {
      const allBlueprints: EsiBlueprintItem[] = [];
      let page = 1;
      while (true) {
        const batch = await esiGet<EsiBlueprintItem[]>(
          `/characters/${char.characterId}/blueprints/?page=${page}`,
          char.id,
        );
        allBlueprints.push(...batch);
        if (batch.length < 1000) break;
        page++;
      }

      // Only insert blueprints whose typeId exists in the SDE.
      const typeIds = [...new Set(allBlueprints.map((b) => b.type_id))];
      const knownTypes = await prisma.sdeType.findMany({
        where: { id: { in: typeIds } },
        select: { id: true },
      });
      const knownTypeIds = new Set(knownTypes.map((t) => t.id));
      const valid = allBlueprints.filter((b) => knownTypeIds.has(b.type_id));

      await prisma.$transaction([
        prisma.ownedBlueprint.deleteMany({ where: { characterId: char.id } }),
        prisma.ownedBlueprint.createMany({
          data: valid.map((b) => ({
            characterId: char.id,
            itemId: BigInt(b.item_id),
            typeId: b.type_id,
            locationId: BigInt(b.location_id),
            runs: b.runs,
            materialEfficiency: b.material_efficiency,
            timeEfficiency: b.time_efficiency,
          })),
          skipDuplicates: true,
        }),
      ]);
    }),
  );

  revalidatePath("/blueprints");
}
