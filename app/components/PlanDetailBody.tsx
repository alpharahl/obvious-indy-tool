"use client";

import { useState, useTransition } from "react";
import { setPlanDecision, removePlanItem } from "../actions/build-plans";
import PlanItemProgress from "./PlanItemProgress";

export interface Material {
  typeId: number;
  typeName: string;
  quantity: number;       // total needed (already × runs)
  decision: "buy" | "build" | "gather";
  canBuild: boolean;      // true if a manufacturing or reaction blueprint exists in the SDE
  subMaterials: Material[];
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
  allocated: number;  // assigned from inventory
}

interface Props {
  planId: string;
  items: PlanItemWithMaterials[];
  shopping: ShoppingEntry[];   // items marked "buy"
  gather: ShoppingEntry[];     // items marked "gather"
}

// ── Decision toggle ───────────────────────────────────────────────────────────
// canBuild=true  → cycles Buy ↔ Build
// canBuild=false → cycles Buy ↔ Gather  (base resources: minerals, PI, etc.)

function DecisionToggle({
  planId,
  typeId,
  decision,
  canBuild,
}: {
  planId: string;
  typeId: number;
  decision: "buy" | "build" | "gather";
  canBuild: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    let next: "buy" | "build" | "gather";
    if (canBuild) {
      next = decision === "build" ? "buy" : "build";
    } else {
      next = decision === "gather" ? "buy" : "gather";
    }
    startTransition(() => setPlanDecision(planId, typeId, next));
  }

  const label =
    decision === "build" ? "Build" :
    decision === "gather" ? "Gather" :
    "Buy";

  const active = decision === "build" || decision === "gather";

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className="text-xs uppercase tracking-widest px-2 py-0.5 rounded border cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-40 shrink-0"
      style={{
        borderColor: active ? "var(--accent)" : "var(--border)",
        color: active ? "var(--accent)" : "var(--muted-fg)",
      }}
    >
      {label}
    </button>
  );
}

// ── Recursive material rows ───────────────────────────────────────────────────

function MaterialRows({
  planId,
  materials,
  depth,
}: {
  planId: string;
  materials: Material[];
  depth: number;
}) {
  const paddingLeft = 16 + depth * 24;
  const bgAlpha = Math.min(depth * 0.08, 0.32);

  return (
    <>
      {materials.map((mat) => (
        <div key={mat.typeId}>
          <div
            className="flex items-center gap-3 pr-4 py-2 border-b"
            style={{
              paddingLeft: `${paddingLeft}px`,
              borderColor: "var(--border)",
              background: depth > 0 ? `rgba(0,0,0,${bgAlpha})` : undefined,
            }}
          >
            <DecisionToggle
              planId={planId}
              typeId={mat.typeId}
              decision={mat.decision}
              canBuild={mat.canBuild}
            />
            <span
              className="text-xs flex-1 min-w-0 truncate"
              style={{ color: depth === 0 ? "var(--foreground)" : "var(--muted-fg)" }}
            >
              {mat.typeName}
            </span>
            <span className="text-xs tabular-nums shrink-0" style={{ color: "var(--muted-fg)" }}>
              {mat.quantity.toLocaleString()}
            </span>
          </div>

          {mat.decision === "build" && mat.subMaterials.length > 0 && (
            <MaterialRows planId={planId} materials={mat.subMaterials} depth={depth + 1} />
          )}
          {mat.decision === "build" && mat.subMaterials.length === 0 && !mat.canBuild && (
            <div
              className="py-1.5 text-xs border-b"
              style={{
                paddingLeft: `${paddingLeft + 24}px`,
                paddingRight: "1rem",
                borderColor: "var(--border)",
                color: "var(--muted-fg)",
                background: `rgba(0,0,0,${Math.min((depth + 1) * 0.08, 0.32)})`,
              }}
            >
              No blueprint data
            </div>
          )}
        </div>
      ))}
    </>
  );
}

// ── Sidebar panel ─────────────────────────────────────────────────────────────

function SidePanel({
  label,
  entries,
  emptyHint,
}: {
  label: string;
  entries: ShoppingEntry[];
  emptyHint: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div
      className="rounded border overflow-hidden shrink-0"
      style={{ background: "var(--panel)", borderColor: "var(--border)" }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2.5 flex items-center justify-between cursor-pointer transition-opacity hover:opacity-70"
        style={{ borderBottom: open ? `1px solid var(--border)` : undefined }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs shrink-0" style={{ color: "var(--accent)", fontFamily: "monospace" }}>
            {open ? "▼" : "▶"}
          </span>
          <span className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>
            {label}
          </span>
        </div>
        <span className="text-xs" style={{ color: "var(--accent)" }}>
          {entries.length} types
        </span>
      </button>

      {open && (
        entries.length === 0 ? (
          <p className="px-4 py-4 text-xs text-center" style={{ color: "var(--muted-fg)" }}>
            {emptyHint}
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {entries.map((entry) => {
              const stillNeeded = Math.max(0, entry.quantity - entry.allocated);
              const covered = entry.allocated >= entry.quantity;
              return (
                <div key={entry.typeId} className="px-4 py-2 flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs truncate min-w-0" style={{ color: "var(--foreground)" }}>
                      {entry.typeName}
                    </span>
                    <span
                      className="text-xs tabular-nums shrink-0 font-medium"
                      style={{ color: covered ? "var(--accent)" : "var(--foreground)" }}
                    >
                      {covered ? "✓" : stillNeeded.toLocaleString()}
                    </span>
                  </div>
                  {entry.allocated > 0 && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs" style={{ color: "var(--muted-fg)" }}>
                        {entry.quantity.toLocaleString()} needed
                      </span>
                      <span className="text-xs tabular-nums" style={{ color: "var(--accent)", opacity: 0.6 }}>
                        −{Math.min(entry.allocated, entry.quantity).toLocaleString()} allocated
                      </span>
                    </div>
                  )}
                  {!entry.allocated && (
                    <span className="text-xs tabular-nums" style={{ color: "var(--muted-fg)" }}>
                      {entry.quantity.toLocaleString()} needed
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PlanDetailBody({ planId, items, shopping, gather }: Props) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  function toggleItem(itemId: string) {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }

  return (
    <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
      {/* ── Left: items + materials ─────────────────────────────── */}
      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto flex flex-col gap-2">
        {items.map((item) => {
          const isOpen = openItems.has(item.itemId);
          const remaining = Math.max(0, item.quantity - item.completedQuantity);

          return (
            <div
              key={item.itemId}
              className="rounded border overflow-hidden shrink-0"
              style={{ background: "var(--panel)", borderColor: "var(--border)" }}
            >
              {/* Item header */}
              <div className="flex items-center gap-2 px-4 py-2.5">
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

                <div className="w-16 shrink-0">
                  <PlanItemProgress
                    planId={planId}
                    itemId={item.itemId}
                    completedQuantity={item.completedQuantity}
                    maxQuantity={item.quantity}
                  />
                </div>

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
                    <MaterialRows planId={planId} materials={item.materials} depth={0} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Right: buy + gather lists ────────────────────────────── */}
      <div className="w-64 shrink-0 min-h-0 overflow-y-auto flex flex-col gap-3">
        <SidePanel
          label="Shopping List"
          entries={shopping}
          emptyHint="Mark materials as Buy to populate"
        />
        <SidePanel
          label="Gather List"
          entries={gather}
          emptyHint="Mark base materials as Gather to populate"
        />
      </div>
    </div>
  );
}
