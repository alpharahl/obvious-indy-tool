"use client";

import { useTransition, useRef } from "react";
import { updateItemCompletion } from "../actions/build-plans";

interface Props {
  planId: string;
  itemId: string;
  completedQuantity: number;
  maxQuantity: number;
}

export default function PlanItemProgress({ planId, itemId, completedQuantity, maxQuantity }: Props) {
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  function commit() {
    const val = Math.min(maxQuantity, Math.max(0, parseInt(ref.current?.value ?? "0") || 0));
    if (val !== completedQuantity) {
      startTransition(() => updateItemCompletion(planId, itemId, val));
    }
  }

  return (
    <input
      ref={ref}
      type="number"
      min={0}
      max={maxQuantity}
      defaultValue={completedQuantity}
      disabled={pending}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
      className="w-full tabular-nums text-xs px-2 py-0.5 rounded border bg-transparent outline-none disabled:opacity-40"
      style={{ color: "var(--foreground)" }}
    />
  );
}
