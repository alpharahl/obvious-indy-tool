"use client";

import { useState } from "react";

export interface BlueprintRow {
  id: string;
  characterId: string;
  characterName: string;
  typeName: string;
  isBpo: boolean;
  runs: number;       // -1 = BPO, else BPC runs remaining
  me: number;
  te: number;
  locationName: string;
  solarSystemName: string;
  regionName: string;
  tier: 1 | 2 | 3 | null;
}

interface CharacterOption {
  id: string;
  characterName: string;
}

interface Props {
  characters: CharacterOption[];
  blueprints: BlueprintRow[];
}

export default function BlueprintList({ characters, blueprints }: Props) {
  const [charFilter, setCharFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<1 | 2 | 3 | null>(null);
  const [search, setSearch] = useState<string>("");
  const [openRegions, setOpenRegions] = useState<Set<string>>(new Set());
  const [openLocations, setOpenLocations] = useState<Set<string>>(new Set());

  const searchLower = search.trim().toLowerCase();
  const visible = blueprints.filter((b) => {
    if (charFilter !== "all" && b.characterId !== charFilter) return false;
    if (tierFilter !== null && b.tier !== tierFilter) return false;
    if (searchLower && !b.typeName.toLowerCase().includes(searchLower)) return false;
    return true;
  });

  // Group: region → location → blueprints
  const grouped = new Map<string, Map<string, BlueprintRow[]>>();
  for (const b of visible) {
    if (!grouped.has(b.regionName)) grouped.set(b.regionName, new Map());
    const regionMap = grouped.get(b.regionName)!;
    if (!regionMap.has(b.locationName)) regionMap.set(b.locationName, []);
    regionMap.get(b.locationName)!.push(b);
  }
  const regions = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  const isSearching = searchLower.length > 0;

  function toggleRegion(key: string) {
    setOpenRegions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleLocation(key: string) {
    setOpenLocations((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search blueprints…"
        className="w-full text-xs px-3 py-1.5 rounded border bg-transparent outline-none"
        style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
      />

      {/* Filters */}
      <div className="flex flex-col gap-1.5">
        {/* Character filter */}
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setCharFilter("all")}
            className="text-xs uppercase tracking-widest px-3 py-1 rounded border transition-colors cursor-pointer"
            style={{
              borderColor: charFilter === "all" ? "var(--accent)" : "var(--border)",
              color: charFilter === "all" ? "var(--accent)" : "var(--muted-fg)",
            }}
          >
            All
          </button>
          {characters.map((c) => (
            <button
              key={c.id}
              onClick={() => setCharFilter(c.id)}
              className="text-xs uppercase tracking-widest px-3 py-1 rounded border transition-colors cursor-pointer"
              style={{
                borderColor: charFilter === c.id ? "var(--accent)" : "var(--border)",
                color: charFilter === c.id ? "var(--accent)" : "var(--muted-fg)",
              }}
            >
              {c.characterName}
            </button>
          ))}
        </div>
        {/* Tier filter */}
        <div className="flex gap-1">
          {([null, 1, 2, 3] as const).map((t) => (
            <button
              key={t ?? "all"}
              onClick={() => setTierFilter(t)}
              className="text-xs uppercase tracking-widest px-3 py-1 rounded border transition-colors cursor-pointer"
              style={{
                borderColor: tierFilter === t ? "var(--accent)" : "var(--border)",
                color: tierFilter === t ? "var(--accent)" : "var(--muted-fg)",
              }}
            >
              {t === null ? "All Tiers" : `T${t}`}
            </button>
          ))}
        </div>
      </div>

      {/* Accordion */}
      <div
        className="flex-1 overflow-y-auto flex flex-col gap-1 min-h-0"
        style={{ maxHeight: "calc(100vh - 240px)" }}
      >
        {visible.length === 0 ? (
          <p className="text-xs py-4 text-center" style={{ color: "var(--muted-fg)" }}>
            No blueprints — use Sync Blueprints to download
          </p>
        ) : (
          regions.map(([regionName, locationMap]) => {
            const regionOpen = isSearching || openRegions.has(regionName);
            const locationCount = locationMap.size;
            const bpCount = [...locationMap.values()].reduce((s, bps) => s + bps.length, 0);
            return (
              <div key={regionName} className="flex flex-col">
                <button
                  onClick={() => toggleRegion(regionName)}
                  className="flex items-center justify-between px-3 py-2 rounded border w-full text-left cursor-pointer transition-opacity hover:opacity-70"
                  style={{ background: "var(--panel)", borderColor: "var(--border)" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--accent)", fontFamily: "monospace" }}>
                      {regionOpen ? "▼" : "▶"}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
                      {regionName}
                    </span>
                    <span className="text-xs" style={{ color: "var(--muted-fg)" }}>
                      {locationCount} {locationCount === 1 ? "location" : "locations"}
                    </span>
                  </div>
                  <span className="text-xs tabular-nums" style={{ color: "var(--muted-fg)" }}>
                    {bpCount.toLocaleString()} {bpCount === 1 ? "blueprint" : "blueprints"}
                  </span>
                </button>

                {regionOpen && (
                  <div className="ml-4 mt-1 flex flex-col gap-1">
                    {[...locationMap.entries()]
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([locationName, bps]) => {
                        const locKey = `${regionName}||${locationName}`;
                        const locOpen = isSearching || openLocations.has(locKey);
                        const solarSystemName = bps[0].solarSystemName;
                        return (
                          <div key={locationName} className="flex flex-col">
                            <button
                              onClick={() => toggleLocation(locKey)}
                              className="flex items-center justify-between px-3 py-1.5 rounded border w-full text-left cursor-pointer transition-opacity hover:opacity-70"
                              style={{ background: "var(--panel)", borderColor: "var(--border)" }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs shrink-0" style={{ color: "var(--accent)", fontFamily: "monospace" }}>
                                  {locOpen ? "▼" : "▶"}
                                </span>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs truncate" style={{ color: "var(--foreground)" }}>
                                    {locationName}
                                  </span>
                                  <span className="text-xs" style={{ color: "var(--muted-fg)" }}>
                                    {solarSystemName} · {bps.length} {bps.length === 1 ? "blueprint" : "blueprints"}
                                  </span>
                                </div>
                              </div>
                            </button>

                            {locOpen && (
                              <div className="ml-4 mt-1 flex flex-col gap-0.5">
                                {/* Header row */}
                                <div
                                  className="grid px-3 py-1"
                                  style={{
                                    gridTemplateColumns: "1fr auto auto auto auto",
                                    gap: "0 1rem",
                                  }}
                                >
                                  {["Name", "Type", "ME", "TE", charFilter === "all" ? "Character" : ""].map((h, i) => (
                                    <span key={i} className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>
                                      {h}
                                    </span>
                                  ))}
                                </div>
                                {bps
                                  .sort((a, b) => a.typeName.localeCompare(b.typeName))
                                  .map((bp) => (
                                    <div
                                      key={bp.id}
                                      className="grid items-center px-3 py-1.5 rounded border"
                                      style={{
                                        background: "var(--panel)",
                                        borderColor: "var(--border)",
                                        gridTemplateColumns: "1fr auto auto auto auto",
                                        gap: "0 1rem",
                                      }}
                                    >
                                      <span className="text-xs truncate" style={{ color: "var(--foreground)" }}>
                                        {bp.typeName}
                                      </span>
                                      <span
                                        className="text-xs px-1.5 py-0.5 rounded border tabular-nums"
                                        style={{
                                          borderColor: bp.isBpo ? "var(--accent)" : "var(--border)",
                                          color: bp.isBpo ? "var(--accent)" : "var(--muted-fg)",
                                        }}
                                      >
                                        {bp.isBpo ? "BPO" : `BPC ×${bp.runs}`}
                                      </span>
                                      <span className="text-xs tabular-nums" style={{ color: "var(--foreground)" }}>
                                        ME {bp.me}
                                      </span>
                                      <span className="text-xs tabular-nums" style={{ color: "var(--foreground)" }}>
                                        TE {bp.te}
                                      </span>
                                      {charFilter === "all" ? (
                                        <span className="text-xs" style={{ color: "var(--muted-fg)" }}>
                                          {bp.characterName}
                                        </span>
                                      ) : (
                                        <span />
                                      )}
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
