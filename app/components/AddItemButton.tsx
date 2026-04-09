"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { searchBuildableTypes, addPlanItem } from "../actions/build-plans";
import NumberInput from "./NumberInput";

interface Result {
  id: number;
  name: string;
}

export default function AddItemButton({ planId }: { planId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState<Result | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [searching, startSearch] = useTransition();
  const [adding, startAdd] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) return;
    if (query.trim().length < 2) { setResults([]); return; }
    startSearch(async () => setResults(await searchBuildableTypes(query)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function pick(r: Result) {
    setSelected(r);
    setQuery(r.name);
    setResults([]);
  }

  function clear() {
    setSelected(null);
    setQuery("");
    setResults([]);
    setQuantity(1);
    inputRef.current?.focus();
  }

  function handleAdd() {
    if (!selected) return;
    startAdd(async () => {
      await addPlanItem(planId, selected.id, quantity);
      clear();
    });
  }

  return (
    <div
      className="flex flex-col gap-2 px-4 py-3 rounded border shrink-0"
      style={{ background: "var(--panel)", borderColor: "var(--border)" }}
    >
      <span className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>
        Add Item
      </span>
      <div className="flex gap-2 items-center">
        {/* Item search */}
        <div ref={containerRef} className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
            placeholder="Search ships, modules…"
            className="w-full text-xs px-3 py-1.5 rounded border bg-transparent outline-none"
            style={{ borderColor: selected ? "var(--accent)" : "var(--border)", color: "var(--foreground)" }}
            onKeyDown={(e) => { if (e.key === "Escape") clear(); if (e.key === "Enter" && selected) handleAdd(); }}
          />
          {searching && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--muted-fg)" }}>…</span>
          )}
          {results.length > 0 && (
            <div
              className="absolute z-10 mt-1 w-full rounded border overflow-hidden max-h-52 overflow-y-auto"
              style={{ background: "var(--panel)", borderColor: "var(--border)" }}
            >
              {results.map((r) => (
                <button
                  key={r.id}
                  onMouseDown={() => pick(r)}
                  className="w-full text-left px-3 py-1.5 text-xs transition-opacity hover:opacity-70 cursor-pointer"
                  style={{ color: "var(--foreground)" }}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quantity */}
        <NumberInput
          value={quantity}
          onChange={setQuantity}
          min={1}
          className="w-20 text-xs px-3 py-1.5 rounded border bg-transparent outline-none tabular-nums"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        />

        {/* Add button */}
        <button
          onClick={handleAdd}
          disabled={!selected || adding}
          className="text-xs uppercase tracking-widest px-4 py-1.5 rounded border cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
        >
          {adding ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}
