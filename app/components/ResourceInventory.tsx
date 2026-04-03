"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const hangarData = [
  { name: "Used", value: 62 },
  { name: "Free", value: 38 },
];

const oreData = [
  { name: "Used", value: 41 },
  { name: "Free", value: 59 },
];

const COLORS = {
  used: "#00e5c0",
  free: "#1e2433",
};

function DonutStat({
  data,
  label,
  value,
}: {
  data: { name: string; value: number }[];
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={28}
              outerRadius={42}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              strokeWidth={0}
            >
              <Cell fill={COLORS.used} />
              <Cell fill={COLORS.free} />
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                fontSize: 11,
                color: "var(--foreground)",
              }}
              formatter={(v) => `${v}%`}
            />
          </PieChart>
        </ResponsiveContainer>
        <div
          className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums"
          style={{ color: "var(--accent)" }}
        >
          {data[0].value}%
        </div>
      </div>
      <span className="text-xs uppercase tracking-widest text-center" style={{ color: "var(--muted-fg)" }}>
        {label}
      </span>
      <span className="text-xs tabular-nums" style={{ color: "var(--foreground)" }}>
        {value}
      </span>
    </div>
  );
}

export default function ResourceInventory() {
  return (
    <div
      className="rounded border p-4 flex flex-col gap-4"
      style={{ background: "var(--panel)", borderColor: "var(--border)" }}
    >
      <span className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>
        Resource Inventory
      </span>
      <div className="flex justify-around">
        <DonutStat
          data={hangarData}
          label="Hangar Capacity"
          value="62,400 m³"
        />
        <DonutStat
          data={oreData}
          label="Ore Reserve"
          value="41,200 units"
        />
      </div>
    </div>
  );
}
