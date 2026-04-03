import StatCard from "../components/StatCard";
import ActiveProductionTable from "../components/ActiveProductionTable";
import ResourceInventory from "../components/ResourceInventory";
import MarketVolatility from "../components/MarketVolatility";

export default function Home() {
  return (
    <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
      {/* Page heading */}
      <div>
        <h1 className="text-base uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
          Dashboard_Overview
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted-fg)" }}>
          Status: All systems nominal — Production online
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Active Production" value="2.48B" sub="ISK in jobs" />
        <StatCard label="Total Slots" value="42" sub="active / 60 max" />
        <StatCard label="Total Market Value" value="126.8B" sub="ISK estimated" />
      </div>

      {/* Middle row: production table + resource inventory */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <ActiveProductionTable />
        </div>
        <div>
          <ResourceInventory />
        </div>
      </div>

      {/* Bottom row: market volatility + initialize button */}
      <div className="grid grid-cols-3 gap-4 items-end">
        <div className="col-span-2">
          <MarketVolatility />
        </div>
        <div className="flex flex-col gap-3">
          <button
            className="w-full py-3 rounded text-xs uppercase tracking-widest font-bold transition-colors cursor-pointer"
            style={{ background: "var(--accent)", color: "#000" }}
          >
            Initialize Dashboard
          </button>
        </div>
      </div>
    </main>
  );
}
