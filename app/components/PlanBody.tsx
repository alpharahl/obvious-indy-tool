"use client";

import { useState, useTransition } from "react";
import { setPlanDecision, setBulkDecisions, removePlanItem } from "../actions/build-plans";
import PlanItemCard, { type BpMap, type Decisions } from "./PlanItemCard";

interface PlanItem {
  id: string;
  typeId: number;
  quantity: number;
  type: { name: string };
}

interface Props {
  planId: string;
  items: PlanItem[];
  bpMap: BpMap;
  initialDecisions: Decisions;
}

export default function PlanBody({ planId, items, bpMap, initialDecisions }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(
    () => new Set(
      Object.entries(initialDecisions)
        .filter(([, v]) => v === "build")
        .map(([k]) => Number(k))
    )
  );
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
        {items.map((item) => (
          <PlanItemCard
            key={item.id}
            itemId={item.id}
            planId={planId}
            typeName={item.type.name}
            quantity={item.quantity}
            bp={bpMap[item.typeId] ?? null}
            bpMap={bpMap}
            expandedIds={expandedIds}
            onToggle={toggle}
            onRemove={removePlanItem}
          />
        ))}
      </div>
    </div>
  );
}
