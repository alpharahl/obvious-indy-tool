"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const data = [
  { day: "Mon", tritanium: 4200, mexallon: 2800, isogen: 1400 },
  { day: "Tue", tritanium: 3800, mexallon: 3200, isogen: 1600 },
  { day: "Wed", tritanium: 5100, mexallon: 2900, isogen: 2100 },
  { day: "Thu", tritanium: 4700, mexallon: 3800, isogen: 1800 },
  { day: "Fri", tritanium: 6200, mexallon: 4100, isogen: 2400 },
  { day: "Sat", tritanium: 5800, mexallon: 3600, isogen: 2200 },
  { day: "Sun", tritanium: 7100, mexallon: 4800, isogen: 2900 },
];

const series = [
  { key: "tritanium", color: "#00e5c0" },
  { key: "mexallon", color: "#f59e0b" },
  { key: "isogen", color: "#818cf8" },
];

export default function MarketVolatility() {
  return (
    <div
      className="rounded border p-4 flex flex-col gap-4"
      style={{ background: "var(--panel)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>
          Market Volatility
        </span>
        <span className="text-xs" style={{ color: "var(--muted-fg)" }}>
          7d / ISK
        </span>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={s.color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: "var(--muted-fg)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted-fg)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                fontSize: 11,
                color: "var(--foreground)",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, color: "var(--muted-fg)", paddingTop: 8 }}
            />
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={1.5}
                fill={`url(#grad-${s.key})`}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
