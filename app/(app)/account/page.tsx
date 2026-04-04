export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { prisma } from "../../../lib/prisma";
import { esiGet } from "../../../lib/esi";
import AddCharacterButton from "../../components/AddCharacterButton";
import SyncAssetsButton from "../../components/SyncAssetsButton";
import AssetList, { type AssetRow } from "../../components/AssetList";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const characters = await prisma.character.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isMain: "desc" }, { characterName: "asc" }],
  });

  const rawAssets = await prisma.asset.findMany({
    where: { character: { userId: session.user.id } },
    include: {
      type: { select: { name: true } },
      character: { select: { id: true, characterName: true } },
    },
    orderBy: { type: { name: "asc" } },
  });

  // Resolve locationIds → station/solar-system/region names from SDE.
  const locationIds = [...new Set(rawAssets.map((a) => a.locationId))];
  const npcStationIds = locationIds
    .filter((id) => id >= 60_000_000n && id <= 64_000_000n)
    .map((id) => Number(id));
  const solarSystemIds = locationIds
    .filter((id) => id >= 30_000_000n && id <= 33_000_000n)
    .map((id) => Number(id));
  const playerStructureIds = locationIds.filter(
    (id) => id > 1_000_000_000_000n
  );

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

  // Resolve any player structures not yet in the cache via ESI.
  const unresolvedIds = playerStructureIds.filter((id) => !structureMap.has(id));
  if (unresolvedIds.length > 0) {
    // Use the first character with a token to query ESI.
    const charWithToken = await prisma.character.findFirst({
      where: { userId: session.user.id, token: { isNot: null } },
      select: { id: true },
    });

    if (charWithToken) {
      interface EsiStructure {
        name: string;
        owner_id: number;
        solar_system_id: number;
        type_id?: number;
      }

      const resolved = await Promise.all(
        unresolvedIds.map(async (structureId) => {
          try {
            const info = await esiGet<EsiStructure>(
              `/universe/structures/${structureId}/`,
              charWithToken.id,
            );
            const saved = await prisma.structure.upsert({
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
              include: { solarSystem: { include: { region: true } } },
            });
            return saved;
          } catch {
            return null; // No docking access or ESI error — skip
          }
        }),
      );

      for (const s of resolved) {
        if (s) structureMap.set(s.id, s);
      }
    }
  }

  // Build lookup for nested asset resolution.
  const assetByItemId = new Map(rawAssets.map((a) => [a.itemId, a]));

  // Which itemIds are referenced as locationId by other assets (ships/containers).
  const containerItemIds = new Set<bigint>();
  for (const a of rawAssets) {
    if (assetByItemId.has(a.locationId)) containerItemIds.add(a.locationId);
  }

  // Walk up the locationId chain to the root station/structure.
  function getRootLocationId(startLocationId: bigint): bigint {
    let locId = startLocationId;
    const seen = new Set<bigint>();
    while (assetByItemId.has(locId)) {
      if (seen.has(locId)) break; // cycle guard
      seen.add(locId);
      locId = assetByItemId.get(locId)!.locationId;
    }
    return locId;
  }

  // Find the top-level container (directly at station) that this asset is inside, if any.
  function getTopLevelContainerId(locationId: bigint): bigint | null {
    if (!assetByItemId.has(locationId)) return null; // directly at station
    // Walk up until we reach the container whose own location is a station.
    let current = assetByItemId.get(locationId)!;
    const seen = new Set<bigint>();
    while (assetByItemId.has(current.locationId)) {
      if (seen.has(current.itemId)) break;
      seen.add(current.itemId);
      current = assetByItemId.get(current.locationId)!;
    }
    return current.itemId;
  }

  // BigInt can't cross the server→client boundary directly — serialise to string.
  const assets: AssetRow[] = rawAssets.map((a) => {
    const rootLocId = getRootLocationId(a.locationId);

    let locationName = "Unknown Structure";
    let solarSystemName = "Unknown";
    let regionName = "Unknown";

    const station = stationMap.get(rootLocId);
    if (station) {
      locationName = station.name;
      solarSystemName = station.solarSystem.name;
      regionName = station.solarSystem.region.name;
    } else {
      const structure = structureMap.get(rootLocId);
      if (structure) {
        locationName = structure.name;
        solarSystemName = structure.solarSystem.name;
        regionName = structure.solarSystem.region.name;
      } else {
        const sys = solarSystemMap.get(rootLocId);
        if (sys) {
          locationName = sys.name;
          solarSystemName = sys.name;
          regionName = sys.region.name;
        }
      }
    }

    const topContainerId = getTopLevelContainerId(a.locationId);

    return {
      itemId: a.itemId.toString(),
      characterId: a.character.id,
      characterName: a.character.characterName,
      typeName: a.type.name,
      quantity: a.quantity,
      locationName,
      solarSystemName,
      regionName,
      containerId: topContainerId?.toString() ?? null,
      containerName: topContainerId ? (assetByItemId.get(topContainerId)?.type.name ?? null) : null,
      isContainer: containerItemIds.has(a.itemId),
    };
  });

  return (
    <main className="flex-1 overflow-hidden p-4 flex gap-6">

      {/* ── Left: characters ────────────────────────────────────── */}
      <div className="flex flex-col gap-4 w-80 shrink-0">
        <div>
          <h1 className="text-base uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
            Account
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-fg)" }}>
            Linked EVE characters
          </p>
        </div>

        <AddCharacterButton />

        <div className="flex flex-col gap-2">
          {characters.map((char) => (
            <div
              key={char.id}
              className="flex items-center justify-between px-4 py-3 rounded border"
              style={{ background: "var(--panel)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://images.evetech.net/characters/${char.characterId}/portrait?size=32`}
                  alt=""
                  width={32}
                  height={32}
                  className="rounded"
                />
                <div className="flex flex-col">
                  <span className="text-sm" style={{ color: "var(--foreground)" }}>
                    {char.characterName}
                  </span>
                  <span className="text-xs" style={{ color: "var(--muted-fg)" }}>
                    #{char.characterId}
                  </span>
                </div>
              </div>
              {char.isMain && (
                <span
                  className="text-xs uppercase tracking-widest px-2 py-0.5 rounded border"
                  style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                >
                  Main
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Right: assets ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
              Assets
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted-fg)" }}>
              {assets.length.toLocaleString()} items stored
            </p>
          </div>
          <SyncAssetsButton />
        </div>

        <AssetList characters={characters} assets={assets} />
      </div>

    </main>
  );
}
