"use client";

import { useState } from "react";

export interface AssetRow {
  itemId: string;       // BigInt serialised to string
  characterId: string;
  characterName: string;
  typeName: string;
  quantity: number;
  locationName: string;
  solarSystemName: string;
  regionName: string;
  containerId: string | null;    // itemId of top-level container/ship at station (if nested)
  containerName: string | null;  // typeName of that container/ship
  isContainer: boolean;          // this asset itself contains other assets
}

interface CharacterOption {
  id: string;
  characterName: string;
}

interface Props {
  characters: CharacterOption[];
  assets: AssetRow[];
}

export default function AssetList({ characters, assets }: Props) {
  const [filter, setFilter] = useState<string>("all");
  const [openRegions, setOpenRegions] = useState<Set<string>>(new Set());
  const [openStations, setOpenStations] = useState<Set<string>>(new Set());
  const [openContainers, setOpenContainers] = useState<Set<string>>(new Set());

  const visible =
    filter === "all" ? assets : assets.filter((a) => a.characterId === filter);

  // Group: region → station → items
  const grouped = new Map<string, Map<string, AssetRow[]>>();
  for (const a of visible) {
    if (!grouped.has(a.regionName)) grouped.set(a.regionName, new Map());
    const regionMap = grouped.get(a.regionName)!;
    if (!regionMap.has(a.locationName)) regionMap.set(a.locationName, []);
    regionMap.get(a.locationName)!.push(a);
  }
  const regions = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));

  function toggleRegion(region: string) {
    setOpenRegions((prev) => {
      const next = new Set(prev);
      if (next.has(region)) next.delete(region); else next.add(region);
      return next;
    });
  }

  function toggleStation(key: string) {
    setOpenStations((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleContainer(key: string) {
    setOpenContainers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Character filter tabs */}
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => setFilter("all")}
          className="text-xs uppercase tracking-widest px-3 py-1 rounded border transition-colors cursor-pointer"
          style={{
            borderColor: filter === "all" ? "var(--accent)" : "var(--border)",
            color: filter === "all" ? "var(--accent)" : "var(--muted-fg)",
          }}
        >
          All
        </button>
        {characters.map((c) => (
          <button
            key={c.id}
            onClick={() => setFilter(c.id)}
            className="text-xs uppercase tracking-widest px-3 py-1 rounded border transition-colors cursor-pointer"
            style={{
              borderColor: filter === c.id ? "var(--accent)" : "var(--border)",
              color: filter === c.id ? "var(--accent)" : "var(--muted-fg)",
            }}
          >
            {c.characterName}
          </button>
        ))}
      </div>

      {/* Accordion */}
      <div
        className="flex-1 overflow-y-auto flex flex-col gap-1 min-h-0"
        style={{ maxHeight: "calc(100vh - 240px)" }}
      >
        {visible.length === 0 ? (
          <p className="text-xs py-4 text-center" style={{ color: "var(--muted-fg)" }}>
            No assets — use Sync Assets to download
          </p>
        ) : (
          regions.map(([regionName, stationMap]) => {
            const regionOpen = openRegions.has(regionName);
            const regionTotal = [...stationMap.values()].reduce(
              (sum, items) => sum + items.reduce((s, a) => s + a.quantity, 0),
              0,
            );
            const stationCount = stationMap.size;
            return (
              <div key={regionName} className="flex flex-col">
                {/* Region header */}
                <button
                  onClick={() => toggleRegion(regionName)}
                  className="flex items-center justify-between px-3 py-2 rounded border w-full text-left cursor-pointer transition-opacity hover:opacity-70"
                  style={{ background: "var(--panel)", borderColor: "var(--border)" }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs"
                      style={{ color: "var(--accent)", fontFamily: "monospace" }}
                    >
                      {regionOpen ? "▼" : "▶"}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
                      {regionName}
                    </span>
                    <span className="text-xs" style={{ color: "var(--muted-fg)" }}>
                      {stationCount} {stationCount === 1 ? "location" : "locations"}
                    </span>
                  </div>
                  <span className="text-xs tabular-nums" style={{ color: "var(--muted-fg)" }}>
                    {regionTotal.toLocaleString()} total
                  </span>
                </button>

                {/* Stations */}
                {regionOpen && (
                  <div className="ml-4 mt-1 flex flex-col gap-1">
                    {[...stationMap.entries()]
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([locationName, items]) => {
                        const stationKey = `${regionName}||${locationName}`;
                        const stationOpen = openStations.has(stationKey);
                        const stationTotal = items.reduce((s, a) => s + a.quantity, 0);
                        const solarSystemName = items[0].solarSystemName;
                        return (
                          <div key={locationName} className="flex flex-col">
                            {/* Station header */}
                            <button
                              onClick={() => toggleStation(stationKey)}
                              className="flex items-center justify-between px-3 py-1.5 rounded border w-full text-left cursor-pointer transition-opacity hover:opacity-70"
                              style={{ background: "var(--panel)", borderColor: "var(--border)" }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="text-xs shrink-0"
                                  style={{ color: "var(--accent)", fontFamily: "monospace" }}
                                >
                                  {stationOpen ? "▼" : "▶"}
                                </span>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs truncate" style={{ color: "var(--foreground)" }}>
                                    {locationName}
                                  </span>
                                  <span className="text-xs" style={{ color: "var(--muted-fg)" }}>
                                    {solarSystemName} · {items.length} {items.length === 1 ? "type" : "types"}
                                  </span>
                                </div>
                              </div>
                              <span className="text-xs tabular-nums ml-4 shrink-0" style={{ color: "var(--muted-fg)" }}>
                                {stationTotal.toLocaleString()} total
                              </span>
                            </button>

                            {/* Items + Containers */}
                            {stationOpen && (() => {
                              const directItems = items.filter(a => !a.containerId && !a.isContainer);
                              const topContainers = items.filter(a => !a.containerId && a.isContainer);
                              const childrenByContainer = new Map<string, AssetRow[]>();
                              for (const a of items) {
                                if (a.containerId) {
                                  if (!childrenByContainer.has(a.containerId)) childrenByContainer.set(a.containerId, []);
                                  childrenByContainer.get(a.containerId)!.push(a);
                                }
                              }

                              const renderItem = (a: AssetRow) => (
                                <div
                                  key={a.itemId}
                                  className="flex items-center justify-between px-3 py-1.5 rounded border"
                                  style={{ background: "var(--panel)", borderColor: "var(--border)" }}
                                >
                                  <div className="flex flex-col">
                                    <span className="text-xs" style={{ color: "var(--foreground)" }}>
                                      {a.typeName}
                                    </span>
                                    {filter === "all" && (
                                      <span className="text-xs" style={{ color: "var(--muted-fg)" }}>
                                        {a.characterName}
                                      </span>
                                    )}
                                  </div>
                                  <span
                                    className="text-xs tabular-nums ml-4 shrink-0"
                                    style={{ color: "var(--accent)" }}
                                  >
                                    {a.quantity.toLocaleString()}
                                  </span>
                                </div>
                              );

                              return (
                                <div className="ml-4 mt-1 flex flex-col gap-0.5">
                                  {/* Top-level containers (ships/containers directly at station) */}
                                  {topContainers
                                    .sort((a, b) => a.typeName.localeCompare(b.typeName))
                                    .map((container) => {
                                      const containerKey = `${stationKey}||${container.itemId}`;
                                      const containerOpen = openContainers.has(containerKey);
                                      const children = childrenByContainer.get(container.itemId) ?? [];
                                      const childTotal = children.reduce((s, a) => s + a.quantity, 0);
                                      return (
                                        <div key={container.itemId} className="flex flex-col">
                                          <button
                                            onClick={() => toggleContainer(containerKey)}
                                            className="flex items-center justify-between px-3 py-1.5 rounded border w-full text-left cursor-pointer transition-opacity hover:opacity-70"
                                            style={{ background: "var(--panel)", borderColor: "var(--border)" }}
                                          >
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span
                                                className="text-xs shrink-0"
                                                style={{ color: "var(--accent)", fontFamily: "monospace" }}
                                              >
                                                {containerOpen ? "▼" : "▶"}
                                              </span>
                                              <div className="flex flex-col min-w-0">
                                                <span className="text-xs truncate" style={{ color: "var(--foreground)" }}>
                                                  {container.typeName}
                                                </span>
                                                {filter === "all" && (
                                                  <span className="text-xs" style={{ color: "var(--muted-fg)" }}>
                                                    {container.characterName}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                            <span className="text-xs tabular-nums ml-4 shrink-0" style={{ color: "var(--muted-fg)" }}>
                                              {children.length} {children.length === 1 ? "type" : "types"} · {childTotal.toLocaleString()}
                                            </span>
                                          </button>
                                          {containerOpen && children.length > 0 && (
                                            <div className="ml-4 mt-0.5 flex flex-col gap-0.5">
                                              {children
                                                .sort((a, b) => a.typeName.localeCompare(b.typeName))
                                                .map(renderItem)}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  {/* Items directly at station */}
                                  {directItems
                                    .sort((a, b) => a.typeName.localeCompare(b.typeName))
                                    .map(renderItem)}
                                </div>
                              );
                            })()}
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
