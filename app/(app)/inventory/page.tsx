export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { prisma } from "../../../lib/prisma";
import StockpileManager from "../../components/StockpileManager";

export default async function InventoryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // Fetch stockpiles with items
  const stockpiles = await prisma.stockpile.findMany({
    where: { userId },
    include: { items: true },
    orderBy: { updatedAt: "desc" },
  });

  // Shape stockpiles for the client component
  const existingStockpiles = stockpiles.map((sp) => ({
    id: sp.id,
    name: sp.name,
    itemCount: sp.items.length,
    updatedAt: sp.updatedAt.toISOString(),
  }));

  return (
    <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 min-w-0">
      <div>
        <h1 className="text-base uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
          Inventory
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted-fg)" }}>
          Track stockpiles and assign materials to build plans
        </p>
      </div>

      <StockpileManager existingStockpiles={existingStockpiles} />
    </main>
  );
}
