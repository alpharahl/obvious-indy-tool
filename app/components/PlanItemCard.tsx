"use client";

import { useState, useTransition } from "react";
import { setPlanDecision } from "../actions/build-plans";

export interface BpEntry {
  outputQty: number;
  materials: { typeId: number; name: string; quantity: number }[];
}

export type BpMap = Record<number, BpEntry>;
export type Decisions = Record<number, "build" | "buy">;

interface MaterialRowProps {
  typeId: number;
  name: string;
  quantity: number;
  bpMap: BpMap;
  depth: number;
  planId: string;
  decisions: Decisions;
}

function MaterialRow({ typeId, name, quantity, bpMap, depth, planId, decisions }: MaterialRowProps) {
  const bp = bpMap[typeId];
  const [expanded, setExpanded] = useState(() => decisions[typeId] === "build");
  const [, startTransition] = useTransition();
  const runs = bp ? Math.ceil(quantity / bp.outputQty) : 0;

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    startTransition(async () => {
      await setPlanDecision(planId, typeId, next ? "build" : "buy");
    });
  }

  return (
    <div>
      <div
        className="flex items-center justify-between py-1.5 pr-4"
        style={{ paddingLeft: `${1 + depth * 1.25}rem`, borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {bp ? (
            <button
              onClick={toggle}
              className="flex items-center justify-center w-4 h-4 rounded text-xs shrink-0 cursor-pointer transition-opacity hover:opacity-70"
              style={{ border: "1px solid var(--border)", color: "var(--muted-fg)" }}
            >
              {expanded ? "−" : "+"}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <span className="text-xs truncate" style={{ color: "var(--muted-fg)" }}>
            {name}
          </span>
        </div>
        <span className="text-xs tabular-nums shrink-0 ml-4" style={{ color: "var(--foreground)" }}>
          {quantity.toLocaleString()}
        </span>
      </div>

      {expanded && bp && bp.materials.map((mat) => (
        <MaterialRow
          key={mat.typeId}
          typeId={mat.typeId}
          name={mat.name}
          quantity={mat.quantity * runs}
          bpMap={bpMap}
          depth={depth + 1}
          planId={planId}
          decisions={decisions}
        />
      ))}
    </div>
  );
}

interface Props {
  itemId: string;
  planId: string;
  typeName: string;
  quantity: number;
  bp: BpEntry | null;
  bpMap: BpMap;
  decisions: Decisions;
  onRemove: (planId: string, itemId: string) => Promise<void>;
}

export default function PlanItemCard({ itemId, planId, typeName, quantity, bp, bpMap, decisions, onRemove }: Props) {
  const runs = bp ? Math.ceil(quantity / bp.outputQty) : 0;

  return (
    <div
      className="flex flex-col rounded border overflow-hidden"
      style={{ background: "var(--panel)", borderColor: "var(--border)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: "var(--foreground)" }}>{typeName}</span>
          <span className="text-xs tabular-nums" style={{ color: "var(--muted-fg)" }}>×{quantity}</span>
          {bp && (
            <span className="text-xs" style={{ color: "var(--muted-fg)" }}>
              {runs} {runs === 1 ? "run" : "runs"}
            </span>
          )}
        </div>
        <form action={onRemove.bind(null, planId, itemId)}>
          <button
            type="submit"
            className="text-xs uppercase tracking-widest px-3 py-1 rounded border cursor-pointer transition-opacity hover:opacity-70"
            style={{ borderColor: "var(--border)", color: "var(--muted-fg)" }}
          >
            Remove
          </button>
        </form>
      </div>

      {/* L1 materials */}
      {bp && bp.materials.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          {bp.materials.map((mat) => (
            <MaterialRow
              key={mat.typeId}
              typeId={mat.typeId}
              name={mat.name}
              quantity={mat.quantity * runs}
              bpMap={bpMap}
              depth={0}
              planId={planId}
              decisions={decisions}
            />
          ))}
        </div>
      )}

      {!bp && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <p className="px-4 py-2 text-xs" style={{ color: "var(--muted-fg)" }}>No blueprint found</p>
        </div>
      )}
    </div>
  );
}
