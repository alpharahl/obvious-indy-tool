"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { setPlanFacility } from "../actions/build-plans";
import { searchLocations } from "../actions/stockpile";

interface LocationResult {
  name: string;
  kind: "station" | "system" | "region" | "structure";
}

export default function FacilityPicker({
  planId,
  initialName,
  initialMe,
}: {
  planId: string;
  initialName: string;
  initialMe: number;
}) {
  const [name, setName] = useState(initialName);
  const [me, setMe] = useState(String(initialMe === 0 ? "" : initialMe));
  const [results, setResults] = useState<LocationResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function onQueryChange(value: string) {
    setName(value);
    if (value.trim().length < 2) { setResults([]); setOpen(false); return; }
    startSearch(async () => {
      const res = await searchLocations(value);
      // Only show stations and structures — systems/regions aren't manufacturing locations
      const filtered = res.filter((r) => r.kind === "station" || r.kind === "structure");
      setResults(filtered);
      setOpen(filtered.length > 0);
    });
  }

  function pickLocation(r: LocationResult) {
    setName(r.name);
    setOpen(false);
    save(r.name, parseFloat(me) || 0);
  }

  function save(facilityName = name, facilityMe = parseFloat(me) || 0) {
    startSave(() => setPlanFacility(planId, facilityName, facilityMe));
  }

  const meValue = parseFloat(me) || 0;
  const hasBonus = meValue > 0;

  return (
    <div
      className="flex flex-col gap-2 px-4 py-3 rounded border shrink-0"
      style={{ background: "var(--panel)", borderColor: "var(--border)" }}
    >
      <span className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>
        Facility
      </span>
      <div className="flex gap-2 items-start">
        {/* Station search */}
        <div ref={containerRef} className="relative flex-1">
          <input
            type="text"
            value={name}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search station or structure…"
            className="w-full text-xs px-3 py-1.5 rounded border bg-transparent outline-none"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          />
          {searching && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--muted-fg)" }}>
              …
            </span>
          )}
          {open && (
            <div
              className="absolute z-10 mt-1 w-full rounded border overflow-hidden"
              style={{ background: "var(--panel)", borderColor: "var(--border)" }}
            >
              {results.map((r) => (
                <button
                  key={r.name}
                  onMouseDown={() => pickLocation(r)}
                  className="w-full text-left px-3 py-1.5 text-xs transition-opacity hover:opacity-70 cursor-pointer flex items-center justify-between gap-2"
                  style={{ color: "var(--foreground)" }}
                >
                  <span className="truncate">{r.name}</span>
                  <span className="text-xs shrink-0 uppercase" style={{ color: "var(--muted-fg)", letterSpacing: "0.05em" }}>
                    {r.kind}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ME bonus % */}
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="number"
            min={0}
            max={25}
            step={0.1}
            value={me}
            onChange={(e) => setMe(e.target.value)}
            onBlur={() => save()}
            onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
            placeholder="0"
            className="w-20 text-xs px-3 py-1.5 rounded border bg-transparent outline-none tabular-nums"
            style={{
              borderColor: hasBonus ? "var(--accent)" : "var(--border)",
              color: hasBonus ? "var(--accent)" : "var(--foreground)",
            }}
          />
          <span className="text-xs shrink-0" style={{ color: hasBonus ? "var(--accent)" : "var(--muted-fg)" }}>
            % ME
          </span>
        </div>

        {saving && (
          <span className="text-xs self-center shrink-0" style={{ color: "var(--muted-fg)" }}>saving…</span>
        )}
      </div>
    </div>
  );
}
