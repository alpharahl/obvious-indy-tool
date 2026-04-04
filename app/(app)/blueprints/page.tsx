export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { prisma } from "../../../lib/prisma";
import SyncBlueprintsButton from "../../components/SyncBlueprintsButton";
import BlueprintList, { type BlueprintRow } from "../../components/BlueprintList";

export default async function BlueprintsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const characters = await prisma.character.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isMain: "desc" }, { characterName: "asc" }],
  });

  const rawBlueprints = await prisma.ownedBlueprint.findMany({
    where: { character: { userId: session.user.id } },
    include: {
      type: { select: { name: true } },
      character: { select: { id: true, characterName: true } },
    },
    orderBy: { type: { name: "asc" } },
  });

  // Resolve tech tier (1/2/3) for each blueprint via its manufactured product's metaGroupId.
  // metaGroupId: 1=T1, 2=T2, 14=T3
  const blueprintTypeIds = [...new Set(rawBlueprints.map((b) => b.typeId))];
  const mfgProducts = await prisma.blueprintActivity.findMany({
    where: {
      blueprintId: { in: blueprintTypeIds },
      activity: "MANUFACTURING",
    },
    include: {
      products: {
        take: 1,
        include: { type: { select: { metaGroupId: true } } },
      },
    },
  });
  const tierByBlueprintTypeId = new Map<number, 1 | 2 | 3 | null>();
  for (const act of mfgProducts) {
    if (act.products.length === 0) continue; // no manufactured product — skip (reactions etc.)
    const metaGroupId = act.products[0].type.metaGroupId;
    // T1 items are absent from invMetaTypes (null), T2=2, T3=14
    const tier: 1 | 2 | 3 = metaGroupId === 2 ? 2 : metaGroupId === 14 ? 3 : 1;
    tierByBlueprintTypeId.set(act.blueprintId, tier);
  }

  // Resolve locationIds → station/solar-system/region names.
  const locationIds = [...new Set(rawBlueprints.map((b) => b.locationId))];
  const npcStationIds = locationIds
    .filter((id) => id >= 60_000_000n && id <= 64_000_000n)
    .map((id) => Number(id));
  const solarSystemIds = locationIds
    .filter((id) => id >= 30_000_000n && id <= 33_000_000n)
    .map((id) => Number(id));
  const playerStructureIds = locationIds.filter((id) => id > 1_000_000_000_000n);

  const [stations, solarSystems, structures] = await Promise.all([
    npcStationIds.length
      ? prisma.sdeStation.findMany({
          where: { id: { in: npcStationIds } },
          include: { solarSystem: { include: { region: true } } },
        })
      : Promise.resolve([]),
    solarSystemIds.length
      ? prisma.sdeSolarSystem.findMany({
          where: { id: { in: solarSystemIds } },
          include: { region: true },
        })
      : Promise.resolve([]),
    playerStructureIds.length
      ? prisma.structure.findMany({
          where: { id: { in: playerStructureIds } },
          include: { solarSystem: { include: { region: true } } },
        })
      : Promise.resolve([]),
  ]);

  const stationMap = new Map(stations.map((s) => [BigInt(s.id), s]));
  const solarSystemMap = new Map(solarSystems.map((s) => [BigInt(s.id), s]));
  const structureMap = new Map(structures.map((s) => [s.id, s]));

  const blueprints: BlueprintRow[] = rawBlueprints.map((b) => {
    let locationName = "Unknown Location";
    let solarSystemName = "Unknown";
    let regionName = "Unknown";

    const station = stationMap.get(b.locationId);
    if (station) {
      locationName = station.name;
      solarSystemName = station.solarSystem.name;
      regionName = station.solarSystem.region.name;
    } else {
      const structure = structureMap.get(b.locationId);
      if (structure) {
        locationName = structure.name;
        solarSystemName = structure.solarSystem.name;
        regionName = structure.solarSystem.region.name;
      } else {
        const sys = solarSystemMap.get(b.locationId);
        if (sys) {
          locationName = sys.name;
          solarSystemName = sys.name;
          regionName = sys.region.name;
        }
      }
    }

    return {
      id: b.id,
      characterId: b.character.id,
      characterName: b.character.characterName,
      typeName: b.type.name,
      isBpo: b.runs === -1,
      runs: b.runs,
      me: b.materialEfficiency,
      te: b.timeEfficiency,
      locationName,
      solarSystemName,
      regionName,
      tier: tierByBlueprintTypeId.get(b.typeId) ?? null,
    };
  });

  return (
    <main className="flex-1 overflow-hidden p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
            Blueprints
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-fg)" }}>
            {blueprints.length.toLocaleString()} blueprints across {characters.length}{" "}
            {characters.length === 1 ? "character" : "characters"}
          </p>
        </div>
        <SyncBlueprintsButton />
      </div>

      <BlueprintList characters={characters} blueprints={blueprints} />
    </main>
  );
}
