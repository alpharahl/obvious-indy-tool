"use client";

import { useState, useTransition } from "react";
import { setPlanDecision, removePlanItem } from "../actions/build-plans";
import PlanItemProgress from "./PlanItemProgress";

export interface SubMaterial {
  typeId: number;
  typeName: string;
  quantity: number;
}

export interface Material {
  typeId: number;
  typeName: string;
  quantity: number;       // total needed (already × runs)
  decision: "buy" | "build";
  subMaterials: SubMaterial[]; // populated when canBuild
  canBuild: boolean;
}

export interface PlanItemWithMaterials {
  itemId: string;
  typeName: string;
  quantity: number;
  completedQuantity: number;
  runsNeeded: number;
  materials: Material[];
}

export interface ShoppingEntry {
  typeId: number;
  typeName: string;
  quantity: number;
}

interface Props {
  planId: string;
  items: PlanItemWithMaterials[];
  shopping: ShoppingEntry[];
}

function DecisionToggle({
  planId,
  typeId,
  decision,
}: {
  planId: string;
  typeId: number;
  decision: "buy" | "build";
}) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = decision === "buy" ? "build" : "buy";
    startTransition(() => setPlanDecision(planId, typeId, next));
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className="text-xs uppercase tracking-widest px-2 py-0.5 rounded border cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-40 shrink-0"
      style={{
        borderColor: decision === "build" ? "var(--accent)" : "var(--border)",
        color: decision === "build" ? "var(--accent)" : "var(--muted-fg)",
      }}
    >
      {decision === "build" ? "Build" : "Buy"}
    </button>
  );
}

export default function PlanDetailBody({ planId, items, shopping }: Props) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  function toggleItem(itemId: string) {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }

  return (
    <div className="flex gap-4 min-h-0 flex-1">
      {/* ── Left: items + materials ─────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-2 overflow-y-auto">
        {items.map((item) => {
          const isOpen = openItems.has(item.itemId);
          const remaining = Math.max(0, item.quantity - item.completedQuantity);

          return (
            <div
              key={item.itemId}
              className="rounded border overflow-hidden"
              style={{ background: "var(--panel)", borderColor: "var(--border)" }}
            >
              {/* Item header */}
              <div className="flex items-center gap-2 px-4 py-2.5">
                {/* Toggle arrow + name + qty */}
                <button
                  onClick={() => toggleItem(item.itemId)}
                  className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer transition-opacity hover:opacity-70 text-left"
                >
                  <span className="text-xs shrink-0" style={{ color: "var(--accent)", fontFamily: "monospace" }}>
                    {isOpen ? "▼" : "▶"}
                  </span>
                  <span className="text-xs font-medium truncate" style={{ color: "var(--foreground)" }}>
                    {item.typeName}
                  </span>
                  <span className="text-xs shrink-0" style={{ color: "var(--muted-fg)" }}>
                    ×{item.quantity}
                    {remaining < item.quantity && ` (${remaining} rem)`}
                  </span>
                  {item.materials.length > 0 && (
                    <span className="text-xs shrink-0" style={{ color: "var(--muted-fg)" }}>
                      {item.runsNeeded} run{item.runsNeeded !== 1 ? "s" : ""}
                    </span>
                  )}
                </button>

                {/* Done input */}
                <div className="w-16 shrink-0">
                  <PlanItemProgress
                    planId={planId}
                    itemId={item.itemId}
                    completedQuantity={item.completedQuantity}
                    maxQuantity={item.quantity}
                  />
                </div>

                {/* Remove */}
                <form action={removePlanItem.bind(null, planId, item.itemId)}>
                  <button
                    type="submit"
                    className="text-xs uppercase tracking-widest px-2 py-0.5 rounded border cursor-pointer transition-opacity hover:opacity-70 shrink-0"
                    style={{ borderColor: "var(--border)", color: "var(--muted-fg)" }}
                  >
                    ×
                  </button>
                </form>
              </div>

              {/* Materials */}
              {isOpen && (
                <div className="border-t" style={{ borderColor: "var(--border)" }}>
                  {item.materials.length === 0 ? (
                    <p className="px-4 py-3 text-xs" style={{ color: "var(--muted-fg)" }}>
                      No material data
                    </p>
                  ) : (
                    item.materials.map((mat) => (
                      <div key={mat.typeId}>
                        {/* Material row */}
                        <div
                          className="flex items-center gap-3 px-4 py-2 border-b"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <DecisionToggle planId={planId} typeId={mat.typeId} decision={mat.decision} />
                          <span className="text-xs flex-1 min-w-0 truncate" style={{ color: "var(--foreground)" }}>
                            {mat.typeName}
                          </span>
                          <span className="text-xs tabular-nums shrink-0" style={{ color: "var(--muted-fg)" }}>
                            {mat.quantity.toLocaleString()}
                          </span>
                        </div>

                        {/* Sub-materials (when decision = build) */}
                        {mat.decision === "build" && mat.subMaterials.map((sub) => (
                          <div
                            key={sub.typeId}
                            className="flex items-center gap-3 pl-10 pr-4 py-1.5 border-b"
                            style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.2)" }}
                          >
                            <DecisionToggle planId={planId} typeId={sub.typeId} decision="buy" />
                            <span className="text-xs flex-1 min-w-0 truncate" style={{ color: "var(--muted-fg)" }}>
                              {sub.typeName}
                            </span>
                            <span className="text-xs tabular-nums shrink-0" style={{ color: "var(--muted-fg)" }}>
                              {sub.quantity.toLocaleString()}
                            </span>
                          </div>
                        ))}
                        {mat.decision === "build" && !mat.canBuild && (
                          <div
                            className="pl-10 pr-4 py-1.5 text-xs border-b"
                            style={{ borderColor: "var(--border)", color: "var(--muted-fg)", background: "rgba(0,0,0,0.2)" }}
                          >
                            No blueprint data for sub-materials
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Right: shopping list ─────────────────────────────────── */}
      <div className="w-64 shrink-0 flex flex-col gap-2">
        <div
          className="rounded border overflow-hidden sticky top-0"
          style={{ background: "var(--panel)", borderColor: "var(--border)" }}
        >
          <div
            className="px-4 py-2.5 border-b flex items-center justify-between"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>
              Shopping List
            </span>
            <span className="text-xs" style={{ color: "var(--accent)" }}>
              {shopping.length} types
            </span>
          </div>

          {shopping.length === 0 ? (
            <p className="px-4 py-6 text-xs text-center" style={{ color: "var(--muted-fg)" }}>
              Mark materials as Buy to populate
            </p>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {shopping.map((entry) => (
                <div key={entry.typeId} className="flex items-center justify-between px-4 py-2 gap-2">
                  <span className="text-xs truncate min-w-0" style={{ color: "var(--foreground)" }}>
                    {entry.typeName}
                  </span>
                  <span className="text-xs tabular-nums shrink-0" style={{ color: "var(--accent)" }}>
                    {entry.quantity.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
