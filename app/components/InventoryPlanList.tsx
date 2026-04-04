"use client";

import { useState, useTransition } from "react";
import { setPlanAllocation } from "../actions/build-plans";

export interface InventoryPlanEntry {
  planId: string;
  planName: string;
  materials: {
    typeId: number;
    typeName: string;
    needed: number;
    kind: "buy" | "gather";
    available: number;   // sum of this typeId across all characters' assets
    allocated: number;   // current saved allocation for this plan
  }[];
}

function AllocationCheck({
  planId,
  typeId,
  allocated,
  available,
  needed,
}: {
  planId: string;
  typeId: number;
  allocated: number;
  available: number;
  needed: number;
}) {
  const [pending, startTransition] = useTransition();
  const max = Math.min(available, needed);
  const checked = allocated > 0;

  function toggle() {
    const next = checked ? 0 : max;
    startTransition(() => setPlanAllocation(planId, typeId, next));
  }

  // Nothing to allocate
  if (available === 0) {
    return <span className="text-xs" style={{ color: "var(--muted-fg)" }}>—</span>;
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className="flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-40"
      title={checked ? `Unallocate ${allocated.toLocaleString()}` : `Allocate ${max.toLocaleString()}`}
    >
      <span
        className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
        style={{
          borderColor: checked ? "var(--accent)" : "var(--border)",
          background: checked ? "var(--accent)" : "transparent",
        }}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 3" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="text-xs tabular-nums" style={{ color: checked ? "var(--accent)" : "var(--muted-fg)" }}>
        {max.toLocaleString()}
      </span>
    </button>
  );
}

function PlanAccordion({ plan }: { plan: InventoryPlanEntry }) {
  const [open, setOpen] = useState(false);

  const totalNeeded = plan.materials.reduce((s, m) => s + m.needed, 0);
  const totalAllocated = plan.materials.reduce((s, m) => s + Math.min(m.allocated, m.needed), 0);
  const coverage = totalNeeded > 0 ? totalAllocated / totalNeeded : 0;

  return (
    <div
      className="rounded border overflow-hidden shrink-0"
      style={{ background: "var(--panel)", borderColor: "var(--border)" }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer transition-opacity hover:opacity-70 text-left"
        style={{ borderBottom: open ? `1px solid var(--border)` : undefined }}
      >
        <span className="text-xs shrink-0" style={{ color: "var(--accent)", fontFamily: "monospace" }}>
          {open ? "▼" : "▶"}
        </span>
        <span className="text-xs font-medium flex-1 truncate" style={{ color: "var(--foreground)" }}>
          {plan.planName}
        </span>
        {/* Coverage bar */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(1, coverage) * 100}%`, background: "var(--accent)", opacity: 0.8 }}
            />
          </div>
          <span className="text-xs tabular-nums w-8 text-right" style={{ color: "var(--muted-fg)" }}>
            {Math.round(coverage * 100)}%
          </span>
        </div>
        <span className="text-xs shrink-0" style={{ color: "var(--muted-fg)" }}>
          {plan.materials.length} materials
        </span>
      </button>

      {/* Material rows */}
      {open && (
        plan.materials.length === 0 ? (
          <p className="px-4 py-6 text-xs text-center" style={{ color: "var(--muted-fg)" }}>
            No materials — open the plan to set buy/gather decisions first
          </p>
        ) : (
          <div>
            {/* Column headers */}
            <div
              className="grid px-4 py-1.5 text-xs uppercase tracking-widest border-b"
              style={{
                gridTemplateColumns: "1fr 6rem 6rem 6rem 6rem 5rem",
                gap: "0 0.5rem",
                borderColor: "var(--border)",
                color: "var(--muted-fg)",
              }}
            >
              <span>Material</span>
              <span className="text-right">Needed</span>
              <span className="text-right">On Hand</span>
              <span className="text-right">Use</span>
              <span className="text-right">Still Need</span>
              <span className="text-right">Type</span>
            </div>

            {plan.materials.map((mat) => {
              const stillNeeded = Math.max(0, mat.needed - Math.min(mat.allocated, mat.needed));
              const covered = mat.allocated >= mat.needed;
              return (
                <div
                  key={mat.typeId}
                  className="grid items-center px-4 py-2 text-xs border-b"
                  style={{
                    gridTemplateColumns: "1fr 6rem 6rem 6rem 6rem 5rem",
                    gap: "0 0.5rem",
                    borderColor: "var(--border)",
                  }}
                >
                  <span className="truncate" style={{ color: "var(--foreground)" }}>
                    {mat.typeName}
                  </span>
                  <span className="tabular-nums text-right" style={{ color: "var(--muted-fg)" }}>
                    {mat.needed.toLocaleString()}
                  </span>
                  <span
                    className="tabular-nums text-right"
                    style={{ color: mat.available > 0 ? "var(--foreground)" : "var(--muted-fg)" }}
                  >
                    {mat.available.toLocaleString()}
                  </span>
                  <div className="flex justify-end">
                    <AllocationCheck
                      planId={plan.planId}
                      typeId={mat.typeId}
                      allocated={mat.allocated}
                      available={mat.available}
                      needed={mat.needed}
                    />
                  </div>
                  <span
                    className="tabular-nums text-right font-medium"
                    style={{ color: covered ? "var(--accent)" : "var(--foreground)" }}
                  >
                    {covered ? "✓" : stillNeeded.toLocaleString()}
                  </span>
                  <span
                    className="text-right uppercase"
                    style={{
                      color: mat.kind === "gather" ? "var(--muted-fg)" : "var(--muted-fg)",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {mat.kind}
                  </span>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

export default function InventoryPlanList({ plans }: { plans: InventoryPlanEntry[] }) {
  if (plans.length === 0) {
    return (
      <p className="text-xs py-8 text-center" style={{ color: "var(--muted-fg)" }}>
        No build plans — create one on the Plans page
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {plans.map((plan) => (
        <PlanAccordion key={plan.planId} plan={plan} />
      ))}
    </div>
  );
}
