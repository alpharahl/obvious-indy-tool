"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDuration } from "../../lib/format-duration";

export interface PlanSummary {
  id: string;
  name: string;
  items: { typeName: string; quantity: number; completedQuantity: number; estSeconds: number | null }[];
}

function ProgressBar({ fraction }: { fraction: number }) {
  const pct = Math.min(1, Math.max(0, fraction));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct * 100}%`, background: "var(--accent)", opacity: 0.85 }}
        />
      </div>
      <span className="text-xs tabular-nums w-8 text-right" style={{ color: "var(--muted-fg)" }}>
        {Math.round(pct * 100)}%
      </span>
    </div>
  );
}

export default function ActiveProductionTable({ plans = [] }: { plans?: PlanSummary[] }) {
  const [openPlans, setOpenPlans] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpenPlans((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div
      className="rounded border overflow-hidden"
      style={{ background: "var(--panel)", borderColor: "var(--border)" }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 border-b flex items-center justify-between"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>
          Build Plans
        </span>
        <Link
          href="/plans"
          className="text-xs transition-opacity hover:opacity-70"
          style={{ color: "var(--accent)" }}
        >
          {plans.length} {plans.length === 1 ? "plan" : "plans"}
        </Link>
      </div>

      {plans.length === 0 ? (
        <p className="px-4 py-6 text-xs text-center" style={{ color: "var(--muted-fg)" }}>
          No build plans — <Link href="/plans" className="underline hover:opacity-70" style={{ color: "var(--accent)" }}>create one</Link>
        </p>
      ) : (
        plans.map((plan, pi) => {
          const totalQty = plan.items.reduce((s, i) => s + i.quantity, 0);
          const totalDone = plan.items.reduce((s, i) => s + Math.min(i.completedQuantity, i.quantity), 0);
          const fraction = totalQty > 0 ? totalDone / totalQty : 0;
          const totalEstSeconds = plan.items.reduce((s, i) => s + (i.estSeconds ?? 0), 0);
          const isOpen = openPlans.has(plan.id);

          return (
            <div key={plan.id} style={{ borderTop: pi > 0 ? `1px solid var(--border)` : undefined }}>
              {/* Plan header row — clickable to expand */}
              <button
                onClick={() => toggle(plan.id)}
                className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer transition-opacity hover:opacity-70 text-left"
              >
                <span
                  className="text-xs shrink-0"
                  style={{ color: "var(--accent)", fontFamily: "monospace" }}
                >
                  {isOpen ? "▼" : "▶"}
                </span>
                <span className="text-xs font-medium shrink-0" style={{ color: "var(--foreground)" }}>
                  {plan.name}
                </span>
                <div className="flex-1 min-w-0">
                  <ProgressBar fraction={fraction} />
                </div>
                <span className="text-xs tabular-nums shrink-0" style={{ color: "var(--muted-fg)" }}>
                  {totalDone}/{totalQty}
                </span>
                {totalEstSeconds > 0 && (
                  <span className="text-xs tabular-nums shrink-0" style={{ color: "var(--muted-fg)" }}>
                    {formatDuration(totalEstSeconds)}
                  </span>
                )}
              </button>

              {/* Per-item rows */}
              {isOpen && plan.items.map((item, ii) => {
                const itemFraction = item.quantity > 0 ? Math.min(item.completedQuantity, item.quantity) / item.quantity : 0;
                return (
                  <div
                    key={ii}
                    className="flex items-center gap-3 pl-10 pr-4 py-2"
                    style={{ borderTop: `1px solid var(--border)` }}
                  >
                    <span className="text-xs shrink-0 w-32 truncate" style={{ color: "var(--foreground)" }}>
                      {item.typeName}
                    </span>
                    <div className="flex-1 min-w-0">
                      <ProgressBar fraction={itemFraction} />
                    </div>
                    <span className="text-xs tabular-nums shrink-0" style={{ color: "var(--muted-fg)" }}>
                      {Math.min(item.completedQuantity, item.quantity)}/{item.quantity}
                    </span>
                    {item.estSeconds !== null && (
                      <span className="text-xs tabular-nums shrink-0" style={{ color: "var(--muted-fg)" }}>
                        {formatDuration(item.estSeconds)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}
