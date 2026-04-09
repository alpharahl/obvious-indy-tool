"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { searchSystems } from "../actions/build-plans";
import NumberInput from "./NumberInput";

export type StationType = "npc" | "citadel" | "engineering" | "refinery" | "";
export type RigTier = "t1" | "t2" | "";

export interface FacilityValue {
  systemName: string;
  stationType: StationType;
  structureType: string;
  meRigTier: RigTier;
  teRigTier: RigTier;
  facilityMe: number;
  facilityTe: number;
}

const STATION_TYPES: { value: StationType; label: string }[] = [
  { value: "npc",         label: "NPC Station" },
  { value: "citadel",     label: "Citadel" },
  { value: "engineering", label: "Engineering Complex" },
  { value: "refinery",    label: "Refinery" },
];

const SUB_TYPES: Partial<Record<StationType, { value: string; label: string }[]>> = {
  citadel:     [{ value: "astrahus", label: "Astrahus" }, { value: "fortizar", label: "Fortizar" }, { value: "keepstar", label: "Keepstar" }],
  engineering: [{ value: "raitaru",  label: "Raitaru"  }, { value: "azbel",    label: "Azbel"    }, { value: "sotiyo",   label: "Sotiyo"   }],
  refinery:    [{ value: "athanor",  label: "Athanor"  }, { value: "tatara",   label: "Tatara"   }],
};

// Rig bonuses per structure type: { me: { t1, t2 }, te: { t1, t2 } } in %
const RIG_BONUSES: Record<string, { me: Record<"t1"|"t2", number>; te: Record<"t1"|"t2", number> }> = {
  raitaru: { me: { t1: 2.0, t2: 2.4 }, te: { t1: 20, t2: 24 } },
  azbel:   { me: { t1: 2.5, t2: 3.0 }, te: { t1: 25, t2: 30 } },
  sotiyo:  { me: { t1: 2.5, t2: 3.0 }, te: { t1: 25, t2: 30 } },
  athanor: { me: { t1: 2.0, t2: 2.4 }, te: { t1: 20, t2: 24 } },
  tatara:  { me: { t1: 2.5, t2: 3.0 }, te: { t1: 25, t2: 30 } },
};

function secColor(sec: number): string {
  if (sec >= 0.5) return "var(--accent)";
  if (sec > 0) return "#f59e0b";
  return "#ef4444";
}

function triggerLabel(v: FacilityValue): string {
  if (!v.systemName && !v.stationType) return "Station…";
  const sub = v.structureType
    ? Object.values(SUB_TYPES).flat().find((s) => s.value === v.structureType)?.label
    : STATION_TYPES.find((t) => t.value === v.stationType)?.label;
  if (v.systemName && sub) return `${v.systemName} · ${sub}`;
  return v.systemName || sub || "Station…";
}

interface Props {
  value: FacilityValue;
  onChange: (value: FacilityValue) => void;
}

type SecClass = "hs" | "ls" | "ns" | "wh" | "";

const SEC_CLASSES: { value: SecClass; label: string }[] = [
  { value: "hs", label: "Hi-Sec" },
  { value: "ls", label: "Lo-Sec" },
  { value: "ns", label: "Null-Sec" },
  { value: "wh", label: "WH" },
];

export default function StationPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value.systemName);
  const [secClass, setSecClass] = useState<SecClass>("");
  const [results, setResults] = useState<{ id: number; name: string; security: number }[]>([]);
  const [, startSearch] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setQuery(value.systemName); }, [value.systemName]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleQuery(q: string) {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    startSearch(async () => setResults(await searchSystems(q, secClass || undefined)));
  }

  function handleSecClass(cls: SecClass) {
    const next = secClass === cls ? "" : cls;
    setSecClass(next);
    if (query.trim().length >= 2) {
      startSearch(async () => setResults(await searchSystems(query, next || undefined)));
    }
  }

  function pickSystem(name: string) {
    setQuery(name);
    setResults([]);
    onChange({ ...value, systemName: name });
  }

  function pickType(type: StationType) {
    onChange({ ...value, stationType: type, structureType: "", meRigTier: "", teRigTier: "", facilityMe: 0, facilityTe: 0 });
  }

  function pickStructure(structureType: string) {
    onChange({ ...value, structureType, meRigTier: "", teRigTier: "", facilityMe: 0, facilityTe: 0 });
  }

  function pickMeRig(tier: RigTier) {
    const next = value.meRigTier === tier ? "" : tier;
    const bonuses = RIG_BONUSES[value.structureType];
    const facilityMe = next && bonuses ? bonuses.me[next as "t1" | "t2"] : value.facilityMe;
    onChange({ ...value, meRigTier: next, facilityMe });
  }

  function pickTeRig(tier: RigTier) {
    const next = value.teRigTier === tier ? "" : tier;
    const bonuses = RIG_BONUSES[value.structureType];
    const facilityTe = next && bonuses ? bonuses.te[next as "t1" | "t2"] : value.facilityTe;
    onChange({ ...value, teRigTier: next, facilityTe });
  }

  const subTypes = value.stationType ? SUB_TYPES[value.stationType] : undefined;
  const rigBonuses = value.structureType ? RIG_BONUSES[value.structureType] : undefined;

  return (
    <div ref={containerRef} className="relative flex items-center gap-1.5">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs px-2 py-0.5 rounded border cursor-pointer transition-opacity hover:opacity-70 text-left truncate"
        style={{
          borderColor: value.systemName || value.stationType ? "var(--accent)" : "var(--border)",
          color: value.systemName || value.stationType ? "var(--accent)" : "var(--muted-fg)",
          maxWidth: "16rem",
        }}
      >
        {triggerLabel(value)}
      </button>

      {/* Popover */}
      {open && (
        <div
          className="absolute z-30 top-full mt-1 left-0 rounded border flex flex-col gap-3 p-3"
          style={{ background: "var(--panel)", borderColor: "var(--border)", minWidth: "22rem" }}
        >
          {/* Sec class filter */}
          <div className="flex gap-1.5">
            {SEC_CLASSES.map((s) => (
              <button key={s.value} onClick={() => handleSecClass(s.value)}
                className="flex-1 text-xs py-0.5 rounded border cursor-pointer transition-opacity hover:opacity-70"
                style={{ borderColor: secClass === s.value ? "var(--accent)" : "var(--border)", color: secClass === s.value ? "var(--accent)" : "var(--muted-fg)", background: secClass === s.value ? "rgba(0,229,192,0.06)" : "transparent" }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* System search */}
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleQuery(e.target.value)}
              placeholder="Search system…"
              className="w-full text-xs px-2 py-1.5 rounded border bg-transparent outline-none"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
            />
            {results.length > 0 && (
              <div
                className="absolute z-10 top-full mt-1 left-0 w-full rounded border overflow-hidden max-h-40 overflow-y-auto"
                style={{ background: "var(--panel)", borderColor: "var(--border)" }}
              >
                {results.map((r) => (
                  <button
                    key={r.id}
                    onMouseDown={() => pickSystem(r.name)}
                    className="w-full text-left px-3 py-1.5 text-xs transition-opacity hover:opacity-70 cursor-pointer flex items-center justify-between gap-2"
                    style={{ color: "var(--foreground)" }}
                  >
                    <span className="truncate">{r.name}</span>
                    <span className="tabular-nums shrink-0" style={{ color: secColor(r.security) }}>
                      {r.security.toFixed(1)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Station type */}
          <div>
            <p className="text-xs uppercase tracking-widest mb-1.5" style={{ color: "var(--muted-fg)" }}>Type</p>
            <div className="grid grid-cols-2 gap-1.5">
              {STATION_TYPES.map((t) => (
                <button key={t.value} onClick={() => pickType(t.value)}
                  className="text-xs px-3 py-1.5 rounded border cursor-pointer transition-opacity hover:opacity-70 text-left"
                  style={{ borderColor: value.stationType === t.value ? "var(--accent)" : "var(--border)", color: value.stationType === t.value ? "var(--accent)" : "var(--muted-fg)", background: value.stationType === t.value ? "rgba(0,229,192,0.06)" : "transparent" }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Structure sub-type */}
          {subTypes && (
            <div>
              <p className="text-xs uppercase tracking-widest mb-1.5" style={{ color: "var(--muted-fg)" }}>Structure</p>
              <div className="flex gap-1.5">
                {subTypes.map((s) => (
                  <button key={s.value} onClick={() => pickStructure(s.value)}
                    className="text-xs px-3 py-1.5 rounded border cursor-pointer transition-opacity hover:opacity-70"
                    style={{ borderColor: value.structureType === s.value ? "var(--accent)" : "var(--border)", color: value.structureType === s.value ? "var(--accent)" : "var(--muted-fg)", background: value.structureType === s.value ? "rgba(0,229,192,0.06)" : "transparent" }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Rig tiers — only for structures with known bonuses */}
          {rigBonuses && (
            <div className="flex flex-col gap-2" style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
              <p className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>Rigs</p>

              {/* ME rig */}
              <div className="flex items-center gap-2">
                <span className="text-xs w-6" style={{ color: "var(--muted-fg)" }}>ME</span>
                <div className="flex gap-1.5">
                  {(["t1", "t2"] as ("t1" | "t2")[]).map((tier) => (
                    <button key={tier} onClick={() => pickMeRig(tier)}
                      className="text-xs px-2.5 py-0.5 rounded border cursor-pointer transition-opacity hover:opacity-70"
                      style={{ borderColor: value.meRigTier === tier ? "var(--accent)" : "var(--border)", color: value.meRigTier === tier ? "var(--accent)" : "var(--muted-fg)", background: value.meRigTier === tier ? "rgba(0,229,192,0.06)" : "transparent" }}
                    >
                      {tier.toUpperCase()} <span className="opacity-60">({rigBonuses.me[tier]}%)</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 ml-auto">
                  <NumberInput
                    value={value.facilityMe}
                    onChange={(v) => onChange({ ...value, facilityMe: v, meRigTier: "" })}
                    min={0} max={25}
                    className="w-12 text-xs px-1.5 py-0.5 rounded border bg-transparent outline-none tabular-nums text-center"
                    style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                  />
                  <span className="text-xs" style={{ color: "var(--muted-fg)" }}>%</span>
                </div>
              </div>

              {/* TE rig */}
              <div className="flex items-center gap-2">
                <span className="text-xs w-6" style={{ color: "var(--muted-fg)" }}>TE</span>
                <div className="flex gap-1.5">
                  {(["t1", "t2"] as ("t1" | "t2")[]).map((tier) => (
                    <button key={tier} onClick={() => pickTeRig(tier)}
                      className="text-xs px-2.5 py-0.5 rounded border cursor-pointer transition-opacity hover:opacity-70"
                      style={{ borderColor: value.teRigTier === tier ? "var(--accent)" : "var(--border)", color: value.teRigTier === tier ? "var(--accent)" : "var(--muted-fg)", background: value.teRigTier === tier ? "rgba(0,229,192,0.06)" : "transparent" }}
                    >
                      {tier.toUpperCase()} <span className="opacity-60">({rigBonuses.te[tier]}%)</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 ml-auto">
                  <NumberInput
                    value={value.facilityTe}
                    onChange={(v) => onChange({ ...value, facilityTe: v, teRigTier: "" })}
                    min={0} max={100}
                    className="w-12 text-xs px-1.5 py-0.5 rounded border bg-transparent outline-none tabular-nums text-center"
                    style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                  />
                  <span className="text-xs" style={{ color: "var(--muted-fg)" }}>%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
