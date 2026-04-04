export const dynamic = "force-dynamic";

import { unstable_cache } from "next/cache";
import { auth } from "../../auth";
import { prisma } from "../../lib/prisma";
import { esiGet } from "../../lib/esi";
import StatCard from "../components/StatCard";
import ActiveProductionTable from "../components/ActiveProductionTable";
import ResourceInventory from "../components/ResourceInventory";
import MarketVolatility from "../components/MarketVolatility";

// ── ESI response shapes ────────────────────────────────────────────────────

interface EsiJob {
  job_id: number;
  activity_id: number;
  // active | paused | ready | delivered | cancelled | reverted
  status: string;
}

interface EsiSkills {
  skills: {
    skill_id: number;
    active_skill_level: number;
    trained_skill_level: number;
  }[];
}

// ── Slot calculation ────────────────────────────────────────────────────────
// Max slots = 1 (base) + skill_a_level + skill_b_level
// Active slots = jobs in the given activity bucket with status active/paused

const SLOT_CONFIG = {
  mfg:       { activityIds: [1],          skillIds: [3387, 24625] as const },
  research:  { activityIds: [3, 4, 5, 8], skillIds: [3406, 24624] as const },
  reactions: { activityIds: [11],         skillIds: [45748, 45749] as const },
} as const;

function calcSlots(
  jobs: EsiJob[],
  skills: EsiSkills["skills"],
  activityIds: readonly number[],
  skillIds: readonly number[],
) {
  const active = jobs.filter(
    (j) => activityIds.includes(j.activity_id) && (j.status === "active" || j.status === "paused"),
  ).length;
  const max =
    1 +
    skillIds.reduce((sum, sid) => {
      const skill = skills.find((s) => s.skill_id === sid);
      return sum + (skill?.active_skill_level ?? 0);
    }, 0);
  return { active, max };
}

// ── Data fetching ───────────────────────────────────────────────────────────

// Cached per userId — revalidates every 5 minutes.
// auth() / cookies() must NOT be called inside unstable_cache, so userId is
// read outside and passed as an argument (which becomes part of the cache key).
const getSlotsForUser = unstable_cache(
  async (userId: string) => {
    const characters = await prisma.character.findMany({
      where: { userId },
    });
    if (!characters.length) return null;

    const perChar = await Promise.all(
      characters.map(async (char) => {
        try {
          const [jobs, skillsRes] = await Promise.all([
            esiGet<EsiJob[]>(`/characters/${char.characterId}/industry/jobs/?include_completed=false`, char.id),
            esiGet<EsiSkills>(`/characters/${char.characterId}/skills/`, char.id),
          ]);
          return { jobs, skills: skillsRes.skills };
        } catch {
          return null;
        }
      }),
    );

    const zero = { active: 0, max: 0 };
    const totals = { mfg: { ...zero }, research: { ...zero }, reactions: { ...zero } };

    for (const result of perChar) {
      if (!result) continue;
      const { jobs, skills } = result;
      for (const [key, cfg] of Object.entries(SLOT_CONFIG) as [keyof typeof SLOT_CONFIG, typeof SLOT_CONFIG[keyof typeof SLOT_CONFIG]][]) {
        const s = calcSlots(jobs, skills, cfg.activityIds, cfg.skillIds);
        totals[key].active += s.active;
        totals[key].max    += s.max;
      }
    }

    return totals;
  },
  ["slots"],
  { revalidate: 300 },
);

async function fetchSlots() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getSlotsForUser(session.user.id);
}

// ── Page ────────────────────────────────────────────────────────────────────

async function fetchPlans(userId: string) {
  const plans = await prisma.buildPlan.findMany({
    where: { userId },
    include: { items: { include: { type: { select: { name: true } } }, orderBy: { type: { name: "asc" } } } },
    orderBy: { updatedAt: "desc" },
  });

  const allProductTypeIds = [...new Set(plans.flatMap((p) => p.items.map((i) => i.typeId)))];

  // productTypeId → { blueprintTypeId, baseTime, outputQty }
  const bpInfoByProductTypeId = new Map<number, { blueprintTypeId: number; baseTime: number; outputQty: number }>();
  if (allProductTypeIds.length) {
    const mfgActivities = await prisma.blueprintActivity.findMany({
      where: { activity: "MANUFACTURING", products: { some: { typeId: { in: allProductTypeIds } } } },
      include: { products: { where: { typeId: { in: allProductTypeIds } } } },
    });
    for (const act of mfgActivities) {
      for (const prod of act.products) {
        bpInfoByProductTypeId.set(prod.typeId, { blueprintTypeId: act.blueprintId, baseTime: act.time, outputQty: prod.quantity });
      }
    }
  }

  const neededBpTypeIds = [...new Set([...bpInfoByProductTypeId.values()].map((v) => v.blueprintTypeId))];
  const ownedBpsReal = neededBpTypeIds.length
    ? await prisma.ownedBlueprint.findMany({
        where: { typeId: { in: neededBpTypeIds }, character: { userId } },
        select: { typeId: true, timeEfficiency: true },
      })
    : [];

  // blueprintTypeId → best TE
  const bestTeByBpTypeId = new Map<number, number>();
  for (const ob of ownedBpsReal) {
    const cur = bestTeByBpTypeId.get(ob.typeId) ?? -1;
    if (ob.timeEfficiency > cur) bestTeByBpTypeId.set(ob.typeId, ob.timeEfficiency);
  }

  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    items: p.items.map((i) => {
      const remaining = Math.max(0, i.quantity - i.completedQuantity);
      const info = bpInfoByProductTypeId.get(i.typeId);
      let estSeconds: number | null = null;
      if (info && remaining > 0) {
        const te = bestTeByBpTypeId.get(info.blueprintTypeId) ?? 0;
        const effectiveTime = Math.round(info.baseTime * (1 - te / 100));
        estSeconds = effectiveTime * Math.ceil(remaining / info.outputQty);
      }
      return { typeName: i.type.name, quantity: i.quantity, completedQuantity: i.completedQuantity, estSeconds };
    }),
  }));
}

export default async function Home() {
  const session = await auth();
  const [slots, plans] = await Promise.all([
    fetchSlots().catch(() => null),
    session?.user?.id ? fetchPlans(session.user.id).catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
      {/* Page heading */}
      <div>
        <h1 className="text-base uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
          Dashboard_Overview
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted-fg)" }}>
          Status: All systems nominal — Production online
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Active Production" value="2.48B" sub="ISK in jobs" />
        <StatCard label="Total Market Value" value="126.8B" sub="ISK estimated" />
      </div>

      {/* Slot cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Crafting Slots"
          value={slots ? `${slots.mfg.active} / ${slots.mfg.max}` : "—"}
          sub="active / max"
        />
        <StatCard
          label="Invention Slots"
          value={slots ? `${slots.research.active} / ${slots.research.max}` : "—"}
          sub="active / max"
        />
        <StatCard
          label="Reaction Slots"
          value={slots ? `${slots.reactions.active} / ${slots.reactions.max}` : "—"}
          sub="active / max"
        />
      </div>

      {/* Middle row: production table + resource inventory */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <ActiveProductionTable plans={plans} />
        </div>
        <div>
          <ResourceInventory />
        </div>
      </div>

      {/* Bottom row: market volatility + initialize button */}
      <div className="grid grid-cols-3 gap-4 items-end">
        <div className="col-span-2">
          <MarketVolatility />
        </div>
        <div className="flex flex-col gap-3">
          <button
            className="w-full py-3 rounded text-xs uppercase tracking-widest font-bold transition-colors cursor-pointer"
            style={{ background: "var(--accent)", color: "#000" }}
          >
            Initialize Dashboard
          </button>
        </div>
      </div>
    </main>
  );
}
