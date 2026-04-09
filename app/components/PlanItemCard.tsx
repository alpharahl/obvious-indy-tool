"use client";

import { useState, useTransition } from "react";
import { addPlanItem, removePlanItem } from "../actions/build-plans";
import NumberInput from "./NumberInput";

export interface BpEntry {
  outputQty: number;
  activity: "MANUFACTURING" | "REACTION";
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
  expandedIds: Set<number>;
  onToggle: (typeId: number) => void;
}

export function MaterialRow({ typeId, name, quantity, bpMap, depth, expandedIds, onToggle }: MaterialRowProps) {
  const bp = bpMap[typeId];
  const expanded = expandedIds.has(typeId);
  const runs = bp ? Math.ceil(quantity / bp.outputQty) : 0;

  return (
    <div>
      <div
        className="flex items-center justify-between py-1.5 pr-4"
        style={{ paddingLeft: `${1 + depth * 1.25}rem`, borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {bp ? (
            <button
              onClick={() => onToggle(typeId)}
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
          expandedIds={expandedIds}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

interface Props {
  itemId: string;
  planId: string;
  typeId: number;
  typeName: string;
  initialRuns: number;
  bp: BpEntry | null;
  bpMap: BpMap;
  expandedIds: Set<number>;
  onToggle: (typeId: number) => void;
}

export default function PlanItemCard({ itemId, planId, typeId, typeName, initialRuns, bp, bpMap, expandedIds, onToggle }: Props) {
  const [runs, setRuns] = useState(initialRuns);
  const [, startTransition] = useTransition();

  function handleRunsChange(newRuns: number) {
    setRuns(newRuns);
    if (bp) {
      startTransition(async () => {
        await addPlanItem(planId, typeId, newRuns * bp.outputQty);
      });
    }
  }

  return (
    <div
      className="flex flex-col rounded border overflow-hidden"
      style={{ background: "var(--panel)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: "var(--foreground)" }}>{typeName}</span>
          {bp ? (
            <div className="flex items-center gap-1.5">
              <NumberInput
                value={runs}
                onChange={handleRunsChange}
                min={1}
                className="w-16 text-xs px-2 py-0.5 rounded border bg-transparent outline-none tabular-nums text-center"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
              />
              <span className="text-xs" style={{ color: "var(--muted-fg)" }}>
                {runs === 1 ? "run" : "runs"}
              </span>
            </div>
          ) : (
            <span className="text-xs" style={{ color: "var(--muted-fg)" }}>no blueprint</span>
          )}
        </div>
        <form action={removePlanItem.bind(null, planId, itemId)}>
          <button
            type="submit"
            className="text-xs uppercase tracking-widest px-3 py-1 rounded border cursor-pointer transition-opacity hover:opacity-70"
            style={{ borderColor: "var(--border)", color: "var(--muted-fg)" }}
          >
            Remove
          </button>
        </form>
      </div>

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
              expandedIds={expandedIds}
              onToggle={onToggle}
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
