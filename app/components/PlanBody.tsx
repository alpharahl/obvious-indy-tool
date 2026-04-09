"use client";

import { useState, useTransition } from "react";
import { setPlanDecision, setBulkDecisions, setBpEfficiency, setItemFacility, setBulkItemFacility } from "../actions/build-plans";
import { fetchJanicePrices, type JaniceResult } from "../actions/janice";
import { type FacilityValue } from "./StationPicker";
import PlanItemCard, { type BpMap, type Decisions, type BpSettings } from "./PlanItemCard";

interface PlanItem {
  id: string;
  typeId: number;
  quantity: number;
  type: { name: string; group: { categoryId: number } };
}

interface CategoryInfo {
  categoryId: number;
  categoryName: string;
}

interface PendingApply {
  facility: FacilityValue;
  categoryName: string;
  typeIds: number[];
}

interface Props {
  planId: string;
  items: PlanItem[];
  bpMap: BpMap;
  initialDecisions: Decisions;
  initialBpSettings: BpSettings;
  categoryMap: Record<number, CategoryInfo>;
  stockpileByTypeId: Record<number, number>;
}

function adjQty(base: number, me: number, facilityMe: number): number {
  return Math.max(1, Math.ceil(base * (1 - me / 100) * (1 - facilityMe / 100)));
}

function buildShoppingList(
  items: PlanItem[],
  bpMap: BpMap,
  expandedIds: Set<number>,
  bpSettings: BpSettings,
  stockpileByTypeId: Record<number, number>,
): { typeId: number; name: string; needed: number }[] {
  const totals = new Map<number, { name: string; qty: number }>();

  function walk(typeId: number, name: string, quantity: number) {
    const bp = bpMap[typeId];
    if (bp && expandedIds.has(typeId)) {
      const { me = 0, facilityMe = 0 } = bpSettings[typeId] ?? {};
      const runs = Math.ceil(quantity / bp.outputQty);
      for (const mat of bp.materials) {
        walk(mat.typeId, mat.name, adjQty(mat.quantity, me, facilityMe) * runs);
      }
    } else {
      const prev = totals.get(typeId);
      totals.set(typeId, { name, qty: (prev?.qty ?? 0) + quantity });
    }
  }

  for (const item of items) {
    const bp = bpMap[item.typeId];
    if (!bp) continue;
    const { me = 0, facilityMe = 0 } = bpSettings[item.typeId] ?? {};
    const runs = Math.ceil(item.quantity / bp.outputQty);
    for (const mat of bp.materials) {
      walk(mat.typeId, mat.name, adjQty(mat.quantity, me, facilityMe) * runs);
    }
  }

  return [...totals.entries()]
    .map(([typeId, { name, qty }]) => {
      const have = stockpileByTypeId[typeId] ?? 0;
      return { typeId, name, needed: Math.max(0, qty - have) };
    })
    .filter((r) => r.needed > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function PlanBody({ planId, items, bpMap, initialDecisions, initialBpSettings, categoryMap, stockpileByTypeId }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(
    () => new Set(
      Object.entries(initialDecisions)
        .filter(([, v]) => v === "build")
        .map(([k]) => Number(k))
    )
  );
  const [bpSettings, setBpSettings] = useState<BpSettings>(initialBpSettings);
  const [pendingApply, setPendingApply] = useState<PendingApply | null>(null);
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [copied, setCopied] = useState(false);
  const [prices, setPrices] = useState<JaniceResult | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [loadingPrices, startPriceTransition] = useTransition();
  const [, startTransition] = useTransition();

  function toggle(typeId: number) {
    const expanding = !expandedIds.has(typeId);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (expanding) next.add(typeId);
      else next.delete(typeId);
      return next;
    });
    startTransition(async () => {
      await setPlanDecision(planId, typeId, expanding ? "build" : "buy");
    });
  }

  function handleBpSettingsChange(typeId: number, me: number, te: number) {
    setBpSettings((prev) => {
      const cur = prev[typeId];
      return { ...prev, [typeId]: cur ? { ...cur, me, te } : { me, te, systemName: "", stationType: "", structureType: "", meRigTier: "", teRigTier: "", facilityMe: 0, facilityTe: 0 } };
    });
    startTransition(async () => {
      await setBpEfficiency(planId, typeId, me, te);
    });
  }

  function handleFacilityChange(typeId: number, facility: FacilityValue) {
    setBpSettings((prev) => {
      const cur = prev[typeId];
      return { ...prev, [typeId]: { me: cur?.me ?? 0, te: cur?.te ?? 0, systemName: facility.systemName, stationType: facility.stationType, structureType: facility.structureType, meRigTier: facility.meRigTier, teRigTier: facility.teRigTier, facilityMe: facility.facilityMe, facilityTe: facility.facilityTe } };
    });
    startTransition(async () => {
      await setItemFacility(planId, typeId, facility);
    });

    const cat = categoryMap[typeId];
    if (cat) {
      const peers = Object.keys(bpMap).map(Number).filter((id) => id !== typeId && categoryMap[id]?.categoryId === cat.categoryId);
      if (peers.length > 0) setPendingApply({ facility, categoryName: cat.categoryName, typeIds: peers });
    }
  }

  function applyToAll() {
    if (!pendingApply) return;
    const { facility, typeIds } = pendingApply;
    setBpSettings((prev) => {
      const next = { ...prev };
      for (const id of typeIds) {
        const cur = next[id];
        next[id] = { me: cur?.me ?? 0, te: cur?.te ?? 0, systemName: facility.systemName, stationType: facility.stationType, structureType: facility.structureType, meRigTier: facility.meRigTier, teRigTier: facility.teRigTier, facilityMe: facility.facilityMe, facilityTe: facility.facilityTe };
      }
      return next;
    });
    startTransition(async () => { await setBulkItemFacility(planId, typeIds, facility); });
    setPendingApply(null);
  }

  function toggleAll(activity: "MANUFACTURING" | "REACTION") {
    const ids = Object.entries(bpMap).filter(([, v]) => v.activity === activity).map(([k]) => Number(k));
    const allExpanded = ids.every((id) => expandedIds.has(id));
    if (allExpanded) {
      setExpandedIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
      startTransition(async () => { await setBulkDecisions(planId, ids, "buy"); });
    } else {
      setExpandedIds((prev) => new Set([...prev, ...ids]));
      startTransition(async () => { await setBulkDecisions(planId, ids, "build"); });
    }
  }

  function handleCopy(list: { name: string; needed: number }[]) {
    const text = list.map((r) => `${r.name}\t${r.needed.toLocaleString()}`).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleGetPrices(list: { name: string; needed: number }[]) {
    setPrices(null);
    setPriceError(null);
    startPriceTransition(async () => {
      try {
        const result = await fetchJanicePrices(list.map((r) => ({ name: r.name, quantity: r.needed })));
        setPrices(result);
      } catch (e) {
        setPriceError(e instanceof Error ? e.message : "Failed to fetch prices");
      }
    });
  }

  function formatIsk(v: number): string {
    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}b`;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}m`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
    return v.toLocaleString();
  }

  const allBpsExpanded = Object.entries(bpMap).filter(([, v]) => v.activity === "MANUFACTURING").every(([k]) => expandedIds.has(Number(k)));
  const allReactionsExpanded = Object.entries(bpMap).filter(([, v]) => v.activity === "REACTION").every(([k]) => expandedIds.has(Number(k)));
  const hasBps = Object.values(bpMap).some((v) => v.activity === "MANUFACTURING");
  const hasReactions = Object.values(bpMap).some((v) => v.activity === "REACTION");

  const shoppingList = showShoppingList
    ? buildShoppingList(items, bpMap, expandedIds, bpSettings, stockpileByTypeId)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {hasBps && (
          <button
            onClick={() => toggleAll("MANUFACTURING")}
            className="text-xs uppercase tracking-widest px-3 py-1.5 rounded border cursor-pointer transition-opacity hover:opacity-70"
            style={{ borderColor: "var(--border)", color: "var(--muted-fg)" }}
          >
            {allBpsExpanded ? "Minimize All BPs" : "Expand All BPs"}
          </button>
        )}
        {hasReactions && (
          <button
            onClick={() => toggleAll("REACTION")}
            className="text-xs uppercase tracking-widest px-3 py-1.5 rounded border cursor-pointer transition-opacity hover:opacity-70"
            style={{ borderColor: "var(--border)", color: "var(--muted-fg)" }}
          >
            {allReactionsExpanded ? "Minimize All Reactions" : "Expand All Reactions"}
          </button>
        )}
        <button
          onClick={() => { setShowShoppingList(true); setCopied(false); }}
          className="text-xs uppercase tracking-widest px-3 py-1.5 rounded border cursor-pointer transition-opacity hover:opacity-70 ml-auto"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
        >
          Shopping List
        </button>
      </div>

      {pendingApply && (
        <div
          className="flex items-center justify-between gap-3 px-3 py-2 rounded border text-xs"
          style={{ background: "rgba(0,229,192,0.06)", borderColor: "var(--accent)", color: "var(--foreground)" }}
        >
          <span>
            Apply this station to all{" "}
            <span style={{ color: "var(--accent)" }}>{pendingApply.categoryName}</span>
            {" "}in the plan?{" "}
            <span style={{ color: "var(--muted-fg)" }}>({pendingApply.typeIds.length} other {pendingApply.typeIds.length === 1 ? "item" : "items"})</span>
          </span>
          <div className="flex gap-2 shrink-0">
            <button onClick={applyToAll} className="px-3 py-1 rounded border cursor-pointer transition-opacity hover:opacity-70" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>Apply</button>
            <button onClick={() => setPendingApply(null)} className="px-3 py-1 rounded border cursor-pointer transition-opacity hover:opacity-70" style={{ borderColor: "var(--border)", color: "var(--muted-fg)" }}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const bp = bpMap[item.typeId] ?? null;
          const initialRuns = bp ? Math.ceil(item.quantity / bp.outputQty) : 1;
          const isShip = item.type.group.categoryId === 6;
          return (
            <PlanItemCard
              key={item.id}
              itemId={item.id}
              planId={planId}
              typeId={item.typeId}
              typeName={item.type.name}
              isShip={isShip}
              initialRuns={initialRuns}
              bp={bp}
              bpMap={bpMap}
              expandedIds={expandedIds}
              onToggle={toggle}
              bpSettings={bpSettings}
              onBpSettingsChange={handleBpSettingsChange}
              onFacilityChange={handleFacilityChange}
              stockpileByTypeId={stockpileByTypeId}
            />
          );
        })}
      </div>

      {/* Shopping list modal */}
      {showShoppingList && shoppingList && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowShoppingList(false); setPrices(null); setPriceError(null); } }}
        >
          <div
            className="flex flex-col w-full max-w-lg rounded border overflow-hidden"
            style={{ background: "var(--panel)", borderColor: "var(--border)", maxHeight: "80vh" }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <span className="text-xs uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
                Shopping List
              </span>
              <div className="flex items-center gap-2">
                {shoppingList.length > 0 && (
                  <button
                    onClick={() => handleGetPrices(shoppingList)}
                    disabled={loadingPrices}
                    className="text-xs uppercase tracking-widest px-3 py-1 rounded border cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-40"
                    style={{ borderColor: prices ? "var(--accent)" : "var(--border)", color: prices ? "var(--accent)" : "var(--muted-fg)" }}
                  >
                    {loadingPrices ? "Loading…" : "Prices"}
                  </button>
                )}
                <button
                  onClick={() => handleCopy(shoppingList)}
                  className="text-xs uppercase tracking-widest px-3 py-1 rounded border cursor-pointer transition-opacity hover:opacity-70"
                  style={{ borderColor: copied ? "var(--accent)" : "var(--border)", color: copied ? "var(--accent)" : "var(--muted-fg)" }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={() => { setShowShoppingList(false); setPrices(null); setPriceError(null); }}
                  className="text-xs transition-opacity hover:opacity-70 cursor-pointer px-1"
                  style={{ color: "var(--muted-fg)" }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Price error */}
            {priceError && (
              <div className="px-4 py-2 text-xs shrink-0" style={{ color: "#ef4444", borderBottom: "1px solid var(--border)" }}>
                {priceError}
              </div>
            )}

            {/* List */}
            <div className="overflow-y-auto flex-1">
              {shoppingList.length === 0 ? (
                <p className="px-4 py-8 text-xs text-center" style={{ color: "var(--muted-fg)" }}>
                  Nothing to buy — stockpile covers everything
                </p>
              ) : (
                <>
                  {/* Column headers when prices are loaded */}
                  {prices && (
                    <div
                      className="flex items-center px-4 py-1.5 text-xs"
                      style={{ borderBottom: "1px solid var(--border)", color: "var(--muted-fg)" }}
                    >
                      <span className="flex-1">Item</span>
                      <span className="w-20 text-right tabular-nums">Qty</span>
                      <span className="w-24 text-right tabular-nums">Buy</span>
                      <span className="w-24 text-right tabular-nums">Sell</span>
                    </div>
                  )}
                  {shoppingList.map((row, i) => {
                    const priceRow = prices?.items.find((p) => p.name === row.name);
                    return (
                      <div
                        key={row.typeId}
                        className="flex items-center px-4 py-1.5 text-xs"
                        style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}
                      >
                        <span className="flex-1 truncate" style={{ color: "var(--foreground)" }}>{row.name}</span>
                        <span className="w-20 text-right tabular-nums shrink-0" style={{ color: "var(--muted-fg)" }}>
                          {row.needed.toLocaleString()}
                        </span>
                        {prices && (
                          <>
                            <span className="w-24 text-right tabular-nums shrink-0" style={{ color: "var(--foreground)" }}>
                              {priceRow ? formatIsk(priceRow.totalBuyPrice) : "—"}
                            </span>
                            <span className="w-24 text-right tabular-nums shrink-0" style={{ color: "var(--accent)" }}>
                              {priceRow ? formatIsk(priceRow.totalSellPrice) : "—"}
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* Totals footer */}
            {prices && (
              <div
                className="flex items-center justify-end gap-6 px-4 py-2 text-xs shrink-0"
                style={{ borderTop: "1px solid var(--border)", color: "var(--muted-fg)" }}
              >
                <span>Total buy <span className="tabular-nums" style={{ color: "var(--foreground)" }}>{formatIsk(prices.totalBuyPrice)} ISK</span></span>
                <span>Total sell <span className="tabular-nums" style={{ color: "var(--accent)" }}>{formatIsk(prices.totalSellPrice)} ISK</span></span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
