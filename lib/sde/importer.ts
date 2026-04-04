import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const unbzip2 = require("unbzip2-stream") as () => NodeJS.ReadWriteStream;
import { prisma } from "../prisma";

export type ProgressEvent =
  | { type: "step"; message: string }
  | { type: "progress"; table: string; count: number }
  | { type: "done" }
  | { type: "error"; message: string };

const ACTIVITY_MAP: Record<number, string> = {
  1: "MANUFACTURING",
  3: "RESEARCH_TIME",
  4: "RESEARCH_MATERIAL",
  5: "COPYING",
  8: "INVENTION",
  11: "REACTION",
};

const BATCH = 500;
const TMP_DB = path.join(os.tmpdir(), "eve-sde.db");
const CACHE_FILE = path.join(os.tmpdir(), "eve-sde-cache.json");

// ── Helpers ──────────────────────────────────────────────────────────────────

async function batchUpsert<T>(items: T[], fn: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += BATCH) {
    await fn(items.slice(i, i + BATCH));
  }
}

/** Returns all table names in the SQLite db. */
function allTables(db: Database.Database): string[] {
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

/** Returns the set of column names for a table in the SQLite db. */
function cols(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

/**
 * Pick the first table name from candidates that actually exists in the db.
 * Throws with the full list of available tables if none match.
 */
function pickTable(available: Set<string>, ...candidates: string[]): string {
  for (const t of candidates) if (available.has(t)) return t;
  throw new Error(
    `None of the expected tables [${candidates.join(", ")}] found. Available industry tables: ${[...available].filter(t => t.toLowerCase().includes("industry")).join(", ")}`
  );
}

/**
 * Pick the first column name from candidates that exists in the column set.
 * table is only used for the error message.
 */
function pick(available: Set<string>, table: string, first: string, ...rest: string[]): string {
  for (const c of [first, ...rest]) if (available.has(c)) return c;
  throw new Error(
    `Table "${table}": none of [${[first, ...rest].join(", ")}] found. Columns: ${[...available].join(", ") || "(empty — table may not exist)"}`
  );
}

/** Like pick but returns undefined instead of throwing if nothing matches. */
function pickOptional(available: Set<string>, ...candidates: string[]): string | undefined {
  for (const c of candidates) if (available.has(c)) return c;
  return undefined;
}

// ── Download with caching ────────────────────────────────────────────────────

interface CacheMeta {
  url: string;
  etag?: string;
  lastModified?: string;
}

async function ensureDownloaded(
  sdeUrl: string,
  emit: (e: ProgressEvent) => void
): Promise<boolean> {
  // Read cached metadata if it exists
  let cached: CacheMeta | null = null;
  try {
    cached = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as CacheMeta;
  } catch {
    // no cache yet
  }

  const dbExists = fs.existsSync(TMP_DB) && fs.statSync(TMP_DB).size > 0;

  if (cached?.url === sdeUrl && dbExists && (cached.etag || cached.lastModified)) {
    // Check if remote has changed via HEAD request
    emit({ type: "step", message: "Checking if SDE has been updated…" });
    try {
      const head = await fetch(sdeUrl, { method: "HEAD" });
      const remoteEtag = head.headers.get("etag") ?? undefined;
      const remoteLastMod = head.headers.get("last-modified") ?? undefined;

      const etagMatch = remoteEtag && cached.etag && remoteEtag === cached.etag;
      const lastModMatch =
        remoteLastMod && cached.lastModified && remoteLastMod === cached.lastModified;

      if (etagMatch || lastModMatch) {
        const { size } = fs.statSync(TMP_DB);
        emit({
          type: "step",
          message: `SDE is current — using cached file (${(size / 1024 / 1024).toFixed(1)} MB). Skipping download.`,
        });
        return false; // did not re-download
      }
    } catch {
      emit({ type: "step", message: "Could not reach server to check for updates — using cached file." });
      return false;
    }
  }

  // Download
  emit({ type: "step", message: `Downloading SDE from ${sdeUrl}` });
  const res = await fetch(sdeUrl);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  if (!res.body) throw new Error("No response body");

  const newMeta: CacheMeta = {
    url: sdeUrl,
    etag: res.headers.get("etag") ?? undefined,
    lastModified: res.headers.get("last-modified") ?? undefined,
  };

  const nodeStream = Readable.fromWeb(
    res.body as import("node:stream/web").ReadableStream<Uint8Array>
  );
  const dest = fs.createWriteStream(TMP_DB);

  if (sdeUrl.endsWith(".bz2")) {
    await pipeline(nodeStream, unbzip2(), dest);
  } else {
    await pipeline(nodeStream, dest);
  }

  const { size } = fs.statSync(TMP_DB);
  fs.writeFileSync(CACHE_FILE, JSON.stringify(newMeta));
  emit({
    type: "step",
    message: `Download complete (${(size / 1024 / 1024).toFixed(1)} MB).`,
  });
  return true; // did download
}

// ── Main import ──────────────────────────────────────────────────────────────

export async function runSdeImport(emit: (event: ProgressEvent) => void): Promise<void> {
  const sdeUrl = process.env.SDE_SQLITE_URL;
  if (!sdeUrl) throw new Error("SDE_SQLITE_URL is not set in .env");

  await ensureDownloaded(sdeUrl, emit);

  emit({ type: "step", message: "Opening database…" });
  const db = new Database(TMP_DB, { readonly: true });

  try {
    // Discover and log all tables so schema mismatches are easy to diagnose
    const tableSet = new Set(allTables(db));
    const industryTables = [...tableSet].filter((t) => t.toLowerCase().includes("industry"));
    emit({ type: "step", message: `Industry tables found: ${industryTables.join(", ") || "(none)"}` });

    // Resolve actual table names — SDE versions differ on industryActivity* vs industryType*
    const tActivities     = pickTable(tableSet, "industryActivity", "industryTypeActivities", "industryActivities");
    const tMaterials      = pickTable(tableSet, "industryActivityMaterials", "industryTypeMaterials");
    const tProducts       = pickTable(tableSet, "industryActivityProducts",  "industryTypeProducts");
    const tSkills         = pickTable(tableSet, "industryActivitySkills",    "industryTypeSkills");
    const tProbabilities  = tableSet.has("industryActivityProbabilities") ? "industryActivityProbabilities" : null;
    emit({ type: "step", message: `Using: ${tActivities}, ${tMaterials}, ${tProducts}, ${tSkills}${tProbabilities ? `, ${tProbabilities}` : ""}` });

    // ── Categories ──────────────────────────────────────────────────────────
    emit({ type: "step", message: "Importing categories…" });
    const catCols = cols(db, "invCategories");
    const catId   = pick(catCols, "invCategories", "categoryID");
    const catName = pick(catCols, "invCategories", "categoryName");
    const categories = db
      .prepare(`SELECT ${catId}, ${catName} FROM invCategories`)
      .all() as Record<string, unknown>[];
    await batchUpsert(categories, (batch) =>
      prisma.sdeCategory.createMany({
        data: batch.map((r) => ({ id: r[catId] as number, name: (r[catName] as string) ?? "" })),
        skipDuplicates: true,
      })
    );
    emit({ type: "progress", table: "SdeCategory", count: categories.length });

    // ── Groups ───────────────────────────────────────────────────────────────
    emit({ type: "step", message: "Importing groups…" });
    const grpCols  = cols(db, "invGroups");
    const grpId    = pick(grpCols, "invGroups", "groupID");
    const grpCatId = pick(grpCols, "invGroups", "categoryID");
    const grpName  = pick(grpCols, "invGroups", "groupName");
    const groups = db
      .prepare(`SELECT ${grpId}, ${grpCatId}, ${grpName} FROM invGroups`)
      .all() as Record<string, unknown>[];
    await batchUpsert(groups, (batch) =>
      prisma.sdeGroup.createMany({
        data: batch.map((r) => ({
          id: r[grpId] as number,
          name: (r[grpName] as string) ?? "",
          categoryId: r[grpCatId] as number,
        })),
        skipDuplicates: true,
      })
    );
    emit({ type: "progress", table: "SdeGroup", count: groups.length });

    // ── Types ────────────────────────────────────────────────────────────────
    emit({ type: "step", message: "Importing types…" });
    const typeCols  = cols(db, "invTypes");
    const typeId    = pick(typeCols, "invTypes", "typeID");
    const typeGrpId = pick(typeCols, "invTypes", "groupID");
    const typeName  = pick(typeCols, "invTypes", "typeName");
    const typeDesc  = pick(typeCols, "invTypes", "description");
    const typeVol   = pick(typeCols, "invTypes", "volume");
    const typeMass  = pick(typeCols, "invTypes", "mass");
    const typePub   = pick(typeCols, "invTypes", "published");

    // Build a metaGroupId lookup from invMetaTypes (typeID → metaGroupID).
    const metaGroupById = new Map<number, number>();
    const availTables = new Set(allTables(db));
    if (availTables.has("invMetaTypes")) {
      const metaCols    = cols(db, "invMetaTypes");
      const metaTypeId  = pick(metaCols, "invMetaTypes", "typeID");
      const metaGroupId = pick(metaCols, "invMetaTypes", "metaGroupID");
      const metaRows    = db
        .prepare(`SELECT ${metaTypeId}, ${metaGroupId} FROM invMetaTypes`)
        .all() as Record<string, unknown>[];
      for (const r of metaRows) {
        metaGroupById.set(r[metaTypeId] as number, r[metaGroupId] as number);
      }
    }

    const types = db
      .prepare(`SELECT ${typeId}, ${typeGrpId}, ${typeName}, ${typeDesc}, ${typeVol}, ${typeMass}, ${typePub} FROM invTypes`)
      .all() as Record<string, unknown>[];
    const typeIdSet = new Set(types.map((r) => r[typeId] as number));
    await batchUpsert(types, (batch) =>
      prisma.sdeType.createMany({
        data: batch.map((r) => ({
          id: r[typeId] as number,
          name: (r[typeName] as string) ?? "",
          description: (r[typeDesc] as string | null) ?? null,
          groupId: r[typeGrpId] as number,
          volume: (r[typeVol] as number | null) ?? null,
          mass: (r[typeMass] as number | null) ?? null,
          published: r[typePub] === 1,
          metaGroupId: metaGroupById.get(r[typeId] as number) ?? null,
        })),
        skipDuplicates: true,
      })
    );
    emit({ type: "progress", table: "SdeType", count: types.length });

    // ── Regions ──────────────────────────────────────────────────────────────
    emit({ type: "step", message: "Importing regions…" });
    const regCols = cols(db, "mapRegions");
    const regId   = pick(regCols, "mapRegions", "regionID");
    const regName = pick(regCols, "mapRegions", "regionName");
    const regions = db
      .prepare(`SELECT ${regId}, ${regName} FROM mapRegions WHERE ${regId} < 11000000`)
      .all() as Record<string, unknown>[];
    const regionIdSet = new Set(regions.map((r) => r[regId] as number));
    await batchUpsert(regions, (batch) =>
      prisma.sdeRegion.createMany({
        data: batch.map((r) => ({ id: r[regId] as number, name: (r[regName] as string) ?? "" })),
        skipDuplicates: true,
      })
    );
    emit({ type: "progress", table: "SdeRegion", count: regions.length });

    // ── Solar systems ─────────────────────────────────────────────────────────
    emit({ type: "step", message: "Importing solar systems…" });
    const sysCols  = cols(db, "mapSolarSystems");
    const sysId    = pick(sysCols, "mapSolarSystems", "solarSystemID");
    const sysRegId = pick(sysCols, "mapSolarSystems", "regionID");
    const sysName  = pick(sysCols, "mapSolarSystems", "solarSystemName");
    const sysSec   = pick(sysCols, "mapSolarSystems", "security");
    const allSystems = db
      .prepare(`SELECT ${sysId}, ${sysRegId}, ${sysName}, ${sysSec} FROM mapSolarSystems`)
      .all() as Record<string, unknown>[];
    const systems = allSystems.filter((r) => regionIdSet.has(r[sysRegId] as number));
    const systemIdSet = new Set(systems.map((r) => r[sysId] as number));
    await batchUpsert(systems, (batch) =>
      prisma.sdeSolarSystem.createMany({
        data: batch.map((r) => ({
          id: r[sysId] as number,
          name: (r[sysName] as string) ?? "",
          regionId: r[sysRegId] as number,
          security: (r[sysSec] as number) ?? 0,
        })),
        skipDuplicates: true,
      })
    );
    emit({ type: "progress", table: "SdeSolarSystem", count: systems.length });

    // ── Stations ─────────────────────────────────────────────────────────────
    emit({ type: "step", message: "Importing stations…" });
    const staCols  = cols(db, "staStations");
    const staId    = pick(staCols, "staStations", "stationID");
    const staSysId = pick(staCols, "staStations", "solarSystemID");
    const staName  = pick(staCols, "staStations", "stationName");
    const allStations = db
      .prepare(`SELECT ${staId}, ${staSysId}, ${staName} FROM staStations`)
      .all() as Record<string, unknown>[];
    const stations = allStations.filter((r) => systemIdSet.has(r[staSysId] as number));
    await batchUpsert(stations, (batch) =>
      prisma.sdeStation.createMany({
        data: batch.map((r) => ({
          id: r[staId] as number,
          name: (r[staName] as string) ?? "",
          solarSystemId: r[staSysId] as number,
        })),
        skipDuplicates: true,
      })
    );
    emit({ type: "progress", table: "SdeStation", count: stations.length });

    // ── Blueprints ────────────────────────────────────────────────────────────
    emit({ type: "step", message: "Importing blueprints…" });
    const bpCols = cols(db, "industryBlueprints");
    const bpTypeId = pick(bpCols, "industryBlueprints", "blueprintTypeID", "typeID");
    const bpMax    = pick(bpCols, "industryBlueprints", "maxProductionLimit");
    const blueprints = db
      .prepare(`SELECT ${bpTypeId}, ${bpMax} FROM industryBlueprints`)
      .all() as Record<string, unknown>[];
    const blueprintIdSet = new Set(blueprints.map((r) => r[bpTypeId] as number));
    await batchUpsert(blueprints, (batch) =>
      prisma.blueprint.createMany({
        data: batch.map((r) => ({
          typeId: r[bpTypeId] as number,
          maxProductionLimit: (r[bpMax] as number) ?? 0,
        })),
        skipDuplicates: true,
      })
    );
    emit({ type: "progress", table: "Blueprint", count: blueprints.length });

    // ── Blueprint activities ──────────────────────────────────────────────────
    emit({ type: "step", message: "Importing blueprint activities…" });
    const actCols  = cols(db, tActivities);
    const actBpId  = pick(actCols, tActivities, "blueprintTypeID", "typeID");
    const actActId = pick(actCols, tActivities, "activityID");
    const actTime  = pick(actCols, tActivities, "time");
    const allActivities = db
      .prepare(`SELECT ${actBpId}, ${actActId}, ${actTime} FROM ${tActivities}`)
      .all() as Record<string, unknown>[];
    const activities = allActivities.filter(
      (r) =>
        ACTIVITY_MAP[r[actActId] as number] &&
        blueprintIdSet.has(r[actBpId] as number)
    );
    await batchUpsert(activities, (batch) =>
      prisma.blueprintActivity.createMany({
        data: batch.map((r) => ({
          blueprintId: r[actBpId] as number,
          activity: ACTIVITY_MAP[r[actActId] as number] as never,
          time: (r[actTime] as number) ?? 0,
        })),
        skipDuplicates: true,
      })
    );
    emit({ type: "progress", table: "BlueprintActivity", count: activities.length });

    // Build lookup: "blueprintId:ACTIVITY_ENUM" -> DB row id
    const activityRows = await prisma.blueprintActivity.findMany({
      select: { id: true, blueprintId: true, activity: true },
    });
    const activityLookup = new Map(
      activityRows.map((r) => [`${r.blueprintId}:${r.activity}`, r.id])
    );
    const actKey = (bp: number, act: number) => `${bp}:${ACTIVITY_MAP[act]}`;

    // ── Blueprint materials ───────────────────────────────────────────────────
    emit({ type: "step", message: "Importing blueprint materials…" });
    const matCols   = cols(db, tMaterials);
    const matBpId   = pick(matCols, tMaterials, "blueprintTypeID", "typeID");
    const matActId  = pick(matCols, tMaterials, "activityID");
    const matTypeId = pick(matCols, tMaterials, "materialTypeID");
    const matQty    = pick(matCols, tMaterials, "quantity");
    const allMaterials = db
      .prepare(`SELECT ${matBpId}, ${matActId}, ${matTypeId}, ${matQty} FROM ${tMaterials}`)
      .all() as Record<string, unknown>[];
    const materials = allMaterials.filter(
      (r) =>
        activityLookup.has(actKey(r[matBpId] as number, r[matActId] as number)) &&
        typeIdSet.has(r[matTypeId] as number)
    );
    await batchUpsert(materials, (batch) =>
      prisma.blueprintMaterial.createMany({
        data: batch.map((r) => ({
          blueprintActivityId: activityLookup.get(actKey(r[matBpId] as number, r[matActId] as number))!,
          typeId: r[matTypeId] as number,
          quantity: r[matQty] as number,
        })),
        skipDuplicates: true,
      })
    );
    emit({ type: "progress", table: "BlueprintMaterial", count: materials.length });

    // ── Blueprint products ────────────────────────────────────────────────────
    emit({ type: "step", message: "Importing blueprint products…" });
    const prodCols   = cols(db, tProducts);
    const prodBpId   = pick(prodCols, tProducts, "blueprintTypeID", "typeID");
    const prodActId  = pick(prodCols, tProducts, "activityID");
    const prodTypeId = pick(prodCols, tProducts, "productTypeID");
    const prodQty    = pick(prodCols, tProducts, "quantity");
    // probability may be a column on this table OR in a separate probabilities table
    const prodProbCol = pickOptional(prodCols, "probability");
    const prodSelect  = [prodBpId, prodActId, prodTypeId, prodQty, prodProbCol].filter(Boolean).join(", ");
    const allProducts = db
      .prepare(`SELECT ${prodSelect} FROM ${tProducts}`)
      .all() as Record<string, unknown>[];

    // Build probability lookup from separate table if present
    type ProbKey = string; // "blueprintId:activityId:productTypeId"
    const probLookup = new Map<ProbKey, number>();
    if (tProbabilities) {
      const probCols    = cols(db, tProbabilities);
      const probBpId    = pick(probCols, tProbabilities, "blueprintTypeID", "typeID");
      const probActId   = pick(probCols, tProbabilities, "activityID");
      const probTypeId  = pick(probCols, tProbabilities, "productTypeID");
      const probVal     = pick(probCols, tProbabilities, "probability");
      const probRows = db
        .prepare(`SELECT ${probBpId}, ${probActId}, ${probTypeId}, ${probVal} FROM ${tProbabilities}`)
        .all() as Record<string, unknown>[];
      for (const r of probRows) {
        probLookup.set(
          `${r[probBpId]}:${r[probActId]}:${r[probTypeId]}`,
          r[probVal] as number
        );
      }
    }

    const products = allProducts.filter(
      (r) =>
        activityLookup.has(actKey(r[prodBpId] as number, r[prodActId] as number)) &&
        typeIdSet.has(r[prodTypeId] as number)
    );
    await batchUpsert(products, (batch) =>
      prisma.blueprintProduct.createMany({
        data: batch.map((r) => {
          const bp  = r[prodBpId] as number;
          const act = r[prodActId] as number;
          const pt  = r[prodTypeId] as number;
          const probability =
            prodProbCol
              ? ((r[prodProbCol] as number | null) ?? null)
              : (probLookup.get(`${bp}:${act}:${pt}`) ?? null);
          return {
            blueprintActivityId: activityLookup.get(actKey(bp, act))!,
            typeId: pt,
            quantity: r[prodQty] as number,
            probability,
          };
        }),
        skipDuplicates: true,
      })
    );
    emit({ type: "progress", table: "BlueprintProduct", count: products.length });

    // ── Blueprint skills ──────────────────────────────────────────────────────
    emit({ type: "step", message: "Importing blueprint skills…" });
    const sklCols    = cols(db, tSkills);
    const sklBpId    = pick(sklCols, tSkills, "blueprintTypeID", "typeID");
    const sklActId   = pick(sklCols, tSkills, "activityID");
    const sklSkillId = pick(sklCols, tSkills, "skillID");
    const sklLevel   = pick(sklCols, tSkills, "level");
    const allSkills = db
      .prepare(`SELECT ${sklBpId}, ${sklActId}, ${sklSkillId}, ${sklLevel} FROM ${tSkills}`)
      .all() as Record<string, unknown>[];
    const skills = allSkills.filter((r) =>
      activityLookup.has(actKey(r[sklBpId] as number, r[sklActId] as number))
    );
    await batchUpsert(skills, (batch) =>
      prisma.blueprintSkill.createMany({
        data: batch.map((r) => ({
          blueprintActivityId: activityLookup.get(actKey(r[sklBpId] as number, r[sklActId] as number))!,
          skillTypeId: r[sklSkillId] as number,
          level: r[sklLevel] as number,
        })),
        skipDuplicates: true,
      })
    );
    emit({ type: "progress", table: "BlueprintSkill", count: skills.length });

    emit({ type: "done" });
  } finally {
    db.close();
  }
}
