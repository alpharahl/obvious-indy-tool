"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { addPlanItem, removePlanItem } from "../actions/build-plans";
import NumberInput from "./NumberInput";
import StationPicker, { type FacilityValue, type StationType, type RigTier } from "./StationPicker";

export interface BpEntry {
  outputQty: number;
  time: number; // seconds per run
  activity: "MANUFACTURING" | "REACTION";
  materials: { typeId: number; name: string; quantity: number }[];
}

export type BpMap = Record<number, BpEntry>;
export type Decisions = Record<number, "build" | "buy">;
export type BpSettings = Record<number, { me: number; te: number; systemName: string; stationType: StationType; structureType: string; meRigTier: RigTier; teRigTier: RigTier; facilityMe: number; facilityTe: number }>;

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

function adjustedMatQty(baseQty: number, bpMe: number, facilityMe: number): number {
  return Math.max(1, Math.ceil(baseQty * (1 - bpMe / 100) * (1 - facilityMe / 100)));
}

interface MaterialRowProps {
  typeId: number;
  name: string;
  quantity: number;
  bpMap: BpMap;
  depth: number;
  expandedIds: Set<number>;
  onToggle: (typeId: number) => void;
  bpSettings: BpSettings;
  onBpSettingsChange: (typeId: number, me: number, te: number) => void;
  onFacilityChange: (typeId: number, value: FacilityValue) => void;
}

export function MaterialRow({ typeId, name, quantity, bpMap, depth, expandedIds, onToggle, bpSettings, onBpSettingsChange, onFacilityChange }: MaterialRowProps) {
  const bp = bpMap[typeId];
  const expanded = expandedIds.has(typeId);
  const { me = 0, te = 0, systemName = "", stationType = "", structureType = "", meRigTier = "", teRigTier = "", facilityMe = 0, facilityTe = 0 } = bpSettings[typeId] ?? {};
  const runs = bp ? Math.ceil(quantity / bp.outputQty) : 0;
  const adjustedTime = bp ? Math.round(bp.time * (1 - te / 100) * (1 - facilityTe / 100)) : 0;

  return (
    <div>
      {/* Row */}
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
          {expanded && bp && (
            <div className="flex items-center gap-3 ml-2 shrink-0">
              <label className="flex items-center gap-1.5">
                <span className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>ME</span>
                <NumberInput
                  value={me}
                  onChange={(v) => onBpSettingsChange(typeId, v, te)}
                  min={0}
                  max={10}
                  className="w-10 text-xs px-1.5 py-0.5 rounded border bg-transparent outline-none tabular-nums text-center"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>TE</span>
                <NumberInput
                  value={te}
                  onChange={(v) => onBpSettingsChange(typeId, me, v)}
                  min={0}
                  max={20}
                  step={2}
                  className="w-10 text-xs px-1.5 py-0.5 rounded border bg-transparent outline-none tabular-nums text-center"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                />
              </label>
              <StationPicker
                value={{ systemName, stationType, structureType, meRigTier, teRigTier, facilityMe, facilityTe }}
                onChange={(v) => onFacilityChange(typeId, v)}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {bp && (
            <span className="text-xs tabular-nums" style={{ color: "var(--muted-fg)" }}>
              {formatDuration(adjustedTime * runs)}
            </span>
          )}
          <span className="text-xs tabular-nums text-right" style={{ color: "var(--foreground)", minWidth: "14ch" }}>
            {quantity.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Children */}
      {expanded && bp && bp.materials.map((mat) => (
        <MaterialRow
          key={mat.typeId}
          typeId={mat.typeId}
          name={mat.name}
          quantity={adjustedMatQty(mat.quantity, me, facilityMe) * runs}
          bpMap={bpMap}
          depth={depth + 1}
          expandedIds={expandedIds}
          onToggle={onToggle}
          bpSettings={bpSettings}
          onBpSettingsChange={onBpSettingsChange}
          onFacilityChange={onFacilityChange}
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
  isShip: boolean;
  initialRuns: number;
  bp: BpEntry | null;
  bpMap: BpMap;
  expandedIds: Set<number>;
  onToggle: (typeId: number) => void;
  bpSettings: BpSettings;
  onBpSettingsChange: (typeId: number, me: number, te: number) => void;
  onFacilityChange: (typeId: number, value: FacilityValue) => void;
}

export default function PlanItemCard({ itemId, planId, typeId, typeName, isShip, initialRuns, bp, bpMap, expandedIds, onToggle, bpSettings, onBpSettingsChange, onFacilityChange }: Props) {
  const [runs, setRuns] = useState(initialRuns);
  const [, startTransition] = useTransition();
  const { me = 0, te = 0, facilityMe = 0, facilityTe = 0 } = bpSettings[typeId] ?? {};
  const adjustedTime = bp ? Math.round(bp.time * (1 - te / 100) * (1 - facilityTe / 100)) : 0;

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
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Image
            src={`https://images.evetech.net/types/${typeId}/${isShip ? "render" : "icon"}`}
            alt={typeName}
            width={64}
            height={64}
            className="rounded shrink-0"
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm" style={{ color: "var(--foreground)" }}>{typeName}</span>
            {bp && (
              <div className="flex items-center gap-3">
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
                  <span className="text-xs tabular-nums" style={{ color: "var(--muted-fg)" }}>
                    {formatDuration(adjustedTime * runs)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5">
                    <span className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>ME</span>
                    <NumberInput
                      value={me}
                      onChange={(v) => onBpSettingsChange(typeId, v, te)}
                      min={0}
                      max={10}
                      className="w-10 text-xs px-1.5 py-0.5 rounded border bg-transparent outline-none tabular-nums text-center"
                      style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                    />
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>TE</span>
                    <NumberInput
                      value={te}
                      onChange={(v) => onBpSettingsChange(typeId, me, v)}
                      min={0}
                      max={20}
                      className="w-10 text-xs px-1.5 py-0.5 rounded border bg-transparent outline-none tabular-nums text-center"
                      style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
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

      {/* Materials */}
      {bp && bp.materials.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          {bp.materials.map((mat) => (
            <MaterialRow
              key={mat.typeId}
              typeId={mat.typeId}
              name={mat.name}
              quantity={adjustedMatQty(mat.quantity, me, facilityMe) * runs}
              bpMap={bpMap}
              depth={0}
              expandedIds={expandedIds}
              onToggle={onToggle}
              bpSettings={bpSettings}
              onBpSettingsChange={onBpSettingsChange}
              onFacilityChange={onFacilityChange}
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
