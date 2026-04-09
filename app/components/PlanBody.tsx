"use client";

import { useState, useTransition } from "react";
import { setPlanDecision, setBulkDecisions, setBpEfficiency, setItemFacility, setBulkItemFacility } from "../actions/build-plans";
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

    // Check for same-category peers
    const cat = categoryMap[typeId];
    if (cat) {
      const peers = Object.keys(bpMap)
        .map(Number)
        .filter((id) => id !== typeId && categoryMap[id]?.categoryId === cat.categoryId);
      if (peers.length > 0) {
        setPendingApply({ facility, categoryName: cat.categoryName, typeIds: peers });
      }
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
    startTransition(async () => {
      await setBulkItemFacility(planId, typeIds, facility);
    });
    setPendingApply(null);
  }

  function toggleAll(activity: "MANUFACTURING" | "REACTION") {
    const ids = Object.entries(bpMap)
      .filter(([, v]) => v.activity === activity)
      .map(([k]) => Number(k));
    const allExpanded = ids.every((id) => expandedIds.has(id));
    if (allExpanded) {
      setExpandedIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
      startTransition(async () => { await setBulkDecisions(planId, ids, "buy"); });
    } else {
      setExpandedIds((prev) => new Set([...prev, ...ids]));
      startTransition(async () => { await setBulkDecisions(planId, ids, "build"); });
    }
  }

  const allBpsExpanded = Object.entries(bpMap).filter(([, v]) => v.activity === "MANUFACTURING").every(([k]) => expandedIds.has(Number(k)));
  const allReactionsExpanded = Object.entries(bpMap).filter(([, v]) => v.activity === "REACTION").every(([k]) => expandedIds.has(Number(k)));
  const hasBps = Object.values(bpMap).some((v) => v.activity === "MANUFACTURING");
  const hasReactions = Object.values(bpMap).some((v) => v.activity === "REACTION");

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
            <button
              onClick={applyToAll}
              className="px-3 py-1 rounded border cursor-pointer transition-opacity hover:opacity-70"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
            >
              Apply
            </button>
            <button
              onClick={() => setPendingApply(null)}
              className="px-3 py-1 rounded border cursor-pointer transition-opacity hover:opacity-70"
              style={{ borderColor: "var(--border)", color: "var(--muted-fg)" }}
            >
              Dismiss
            </button>
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
    </div>
  );
}
