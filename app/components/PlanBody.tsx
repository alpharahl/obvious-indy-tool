"use client";

import { useState, useTransition } from "react";
import { setPlanDecision, setBulkDecisions, setBpEfficiency } from "../actions/build-plans";
import PlanItemCard, { type BpMap, type Decisions, type BpSettings } from "./PlanItemCard";

interface PlanItem {
  id: string;
  typeId: number;
  quantity: number;
  type: { name: string; group: { categoryId: number } };
}

interface Props {
  planId: string;
  items: PlanItem[];
  bpMap: BpMap;
  initialDecisions: Decisions;
  initialBpSettings: BpSettings;
}

export default function PlanBody({ planId, items, bpMap, initialDecisions, initialBpSettings }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(
    () => new Set(
      Object.entries(initialDecisions)
        .filter(([, v]) => v === "build")
        .map(([k]) => Number(k))
    )
  );
  const [bpSettings, setBpSettings] = useState<BpSettings>(initialBpSettings);
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
    setBpSettings((prev) => ({ ...prev, [typeId]: { me, te } }));
    startTransition(async () => {
      await setBpEfficiency(planId, typeId, me, te);
    });
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
            />
          );
        })}
      </div>
    </div>
  );
}
