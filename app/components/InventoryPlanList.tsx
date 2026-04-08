"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { setPlanBlueprint } from "../actions/build-plans";
import type { InventoryPlanItemTree, InventoryTreeNode, InventoryBpOption } from "../../lib/plan-materials";

export type { InventoryPlanItemTree };

// ── Coverage helper ───────────────────────────────────────────────────────────

function sumLeaves(mats: InventoryTreeNode[]): { covered: number; total: number } {
  let covered = 0, total = 0;
  for (const m of mats) {
    if (m.decision === "build" && m.subMaterials.length > 0) {
      const s = sumLeaves(m.subMaterials);
      covered += s.covered;
      total += s.total;
    } else {
      covered += m.stockpileCovered;
      total += m.quantity;
    }
  }
  return { covered, total };
}

// ── Blueprint picker ──────────────────────────────────────────────────────────

function BlueprintPicker({
  planId, typeId, options, selected,
}: {
  planId: string;
  typeId: number;
  options: InventoryBpOption[];
  selected: Array<{ blueprintId: string; runs: number }>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedIds = new Set(selected.map((s) => s.blueprintId));
  const unselected = options.filter((o) => !selectedIds.has(o.id));

  function addBp(bpId: string) {
    setOpen(false);
    startTransition(() => setPlanBlueprint(planId, typeId, bpId, 1));
  }

  function removeBp(bpId: string) {
    startTransition(() => setPlanBlueprint(planId, typeId, bpId, 0));
  }

  function updateRuns(bpId: string, val: string) {
    const runs = parseInt(val, 10);
    if (!runs || runs <= 0) return;
    startTransition(() => setPlanBlueprint(planId, typeId, bpId, runs));
  }

  if (options.length === 0) return null;

  return (
    <div ref={containerRef} className="flex flex-wrap gap-1 items-center mt-1">
      {selected.map((s) => {
        const opt = options.find((o) => o.id === s.blueprintId);
        if (!opt) return null;
        return (
          <div
            key={`${s.blueprintId}-${s.runs}`}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs"
            style={{ background: "var(--border)", color: "var(--foreground)" }}
          >
            <span style={{ color: "var(--muted-fg)" }}>ME{opt.me}</span>
            <input
              type="number"
              min={1}
              defaultValue={s.runs}
              className="w-10 bg-transparent text-xs tabular-nums outline-none text-right"
              style={{ color: "var(--accent)" }}
              onBlur={(e) => updateRuns(s.blueprintId, e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            />
            <span style={{ color: "var(--muted-fg)" }}>runs</span>
            <button
              onClick={() => removeBp(s.blueprintId)}
              disabled={pending}
              className="cursor-pointer hover:opacity-70 disabled:opacity-40 leading-none"
              style={{ color: "var(--muted-fg)" }}
            >
              ×
            </button>
          </div>
        );
      })}
      {unselected.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            disabled={pending}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs border cursor-pointer hover:opacity-70 disabled:opacity-40"
            style={{ borderColor: "var(--border)", color: "var(--muted-fg)" }}
          >
            + BP
          </button>
          {open && (
            <div
              className="absolute z-20 mt-1 left-0 rounded border overflow-hidden text-xs"
              style={{ background: "var(--panel)", borderColor: "var(--border)", minWidth: "18rem" }}
            >
              {unselected.map((opt) => (
                <button
                  key={opt.id}
                  onMouseDown={() => addBp(opt.id)}
                  className="w-full text-left px-3 py-1.5 hover:opacity-70 cursor-pointer flex items-center justify-between gap-3"
                  style={{ color: "var(--foreground)" }}
                >
                  <span className="truncate">{opt.characterName}</span>
                  <span className="shrink-0 tabular-nums" style={{ color: "var(--muted-fg)" }}>
                    ME{opt.me} TE{opt.te} {opt.isBpo ? "BPO" : `${opt.runs}r`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tree node ─────────────────────────────────────────────────────────────────

function TreeNodeRow({
  node, planId, depth,
}: {
  node: InventoryTreeNode;
  planId: string;
  depth: number;
}) {
  const canExpand = node.decision === "build" && node.subMaterials.length > 0;
  const [expanded, setExpanded] = useState(canExpand && node.effectiveQty > 0);

  const indent = depth * 20;
  const dimmed = node.effectiveQty === 0;

  return (
    <>
      <div
        className="flex items-start gap-2 py-1.5 border-b text-xs"
        style={{ paddingLeft: 16 + indent, paddingRight: 16, borderColor: "var(--border)" }}
      >
        {/* Expand toggle */}
        <span
          onClick={() => canExpand && setExpanded((v) => !v)}
          className="shrink-0 w-3 mt-0.5 text-center select-none"
          style={{
            color: "var(--accent)",
            fontFamily: "monospace",
            cursor: canExpand ? "pointer" : "default",
            opacity: canExpand ? 1 : 0,
          }}
        >
          {expanded ? "▼" : "▶"}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate flex-1" style={{ color: dimmed ? "var(--muted-fg)" : "var(--foreground)", opacity: dimmed ? 0.5 : 1 }}>
              {node.typeName}
            </span>
            {node.stockpileCovered > 0 && (
              <span className="shrink-0 tabular-nums text-xs" style={{ color: "var(--accent)" }}>
                −{node.stockpileCovered.toLocaleString()} stocked
              </span>
            )}
            <span
              className="shrink-0 tabular-nums font-medium"
              style={{ color: dimmed ? "var(--accent)" : "var(--foreground)" }}
            >
              {dimmed ? "✓" : node.effectiveQty.toLocaleString()}
            </span>
            <span
              className="shrink-0 w-10 text-right uppercase text-xs"
              style={{ color: "var(--muted-fg)", letterSpacing: "0.05em" }}
            >
              {node.decision}
            </span>
          </div>
          {node.decision === "build" && (
            <BlueprintPicker
              planId={planId}
              typeId={node.typeId}
              options={node.blueprintOptions}
              selected={node.selectedBlueprints}
            />
          )}
        </div>
      </div>

      {canExpand && expanded && node.subMaterials.map((sub) => (
        <TreeNodeRow key={sub.typeId} node={sub} planId={planId} depth={depth + 1} />
      ))}
    </>
  );
}

// ── Plan item section ─────────────────────────────────────────────────────────

function PlanItemSection({ item, planId }: { item: InventoryPlanItemTree; planId: string }) {
  return (
    <div>
      {/* Item header */}
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs border-b"
        style={{
          background: "color-mix(in srgb, var(--panel) 50%, var(--border))",
          borderColor: "var(--border)",
        }}
      >
        <span className="font-medium" style={{ color: "var(--foreground)" }}>
          {item.typeName}
        </span>
        <span className="tabular-nums" style={{ color: "var(--muted-fg)" }}>
          ×{item.quantity.toLocaleString()}
        </span>
        {item.runsNeeded > 0 && (
          <span className="tabular-nums" style={{ color: "var(--muted-fg)" }}>
            {item.runsNeeded} run{item.runsNeeded !== 1 ? "s" : ""}
          </span>
        )}
        {item.blueprintOptions.length > 0 && (
          <div className="ml-auto">
            <BlueprintPicker
              planId={planId}
              typeId={item.typeId}
              options={item.blueprintOptions}
              selected={item.selectedBlueprints}
            />
          </div>
        )}
      </div>

      {item.materials.length === 0 ? (
        <p className="px-8 py-3 text-xs" style={{ color: "var(--muted-fg)" }}>
          No blueprint found — set a build decision on the plan page
        </p>
      ) : (
        item.materials.map((mat) => (
          <TreeNodeRow key={mat.typeId} node={mat} planId={planId} depth={0} />
        ))
      )}
    </div>
  );
}

// ── Plan accordion ────────────────────────────────────────────────────────────

interface PlanEntry {
  planId: string;
  planName: string;
  items: InventoryPlanItemTree[];
}

function PlanAccordion({ plan }: { plan: PlanEntry }) {
  const [open, setOpen] = useState(false);

  const allMaterials = plan.items.flatMap((i) => i.materials);
  const { covered, total } = sumLeaves(allMaterials);
  const coverage = total > 0 ? covered / total : 0;

  return (
    <div
      className="rounded border overflow-hidden shrink-0"
      style={{ background: "var(--panel)", borderColor: "var(--border)" }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer transition-opacity hover:opacity-70 text-left"
        style={{ borderBottom: open ? "1px solid var(--border)" : undefined }}
      >
        <span className="text-xs shrink-0" style={{ color: "var(--accent)", fontFamily: "monospace" }}>
          {open ? "▼" : "▶"}
        </span>
        <span className="text-xs font-medium flex-1 truncate" style={{ color: "var(--foreground)" }}>
          {plan.planName}
        </span>
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
          {plan.items.length} item{plan.items.length !== 1 ? "s" : ""}
        </span>
      </button>

      {open && (
        plan.items.length === 0 ? (
          <p className="px-4 py-6 text-xs text-center" style={{ color: "var(--muted-fg)" }}>
            No items — open the plan to add items first
          </p>
        ) : (
          <div>
            {plan.items.map((item) => (
              <PlanItemSection key={item.itemId} item={item} planId={plan.planId} />
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export default function InventoryPlanList({ plans }: { plans: PlanEntry[] }) {
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
