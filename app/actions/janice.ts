"use server";

export interface PriceItem {
  typeId: number;
  name: string;
  quantity: number;
  unitBuy: number;
  unitSell: number;
  totalBuy: number;
  totalSell: number;
}

export interface PriceResult {
  items: PriceItem[];
  totalBuy: number;
  totalSell: number;
}

export async function fetchPrices(
  items: { typeId: number; name: string; quantity: number }[],
): Promise<PriceResult> {
  if (items.length === 0) return { items: [], totalBuy: 0, totalSell: 0 };

  const typeIds = items.map((i) => i.typeId).join(",");
  const res = await fetch(
    `https://market.fuzzwork.co.uk/aggregates/?region=10000002&types=${typeIds}`,
    { next: { revalidate: 300 } }, // cache for 5 min
  );

  if (!res.ok) throw new Error(`Fuzzwork API error ${res.status}`);

  const data: Record<string, {
    buy: { percentile: string };
    sell: { percentile: string };
  }> = await res.json();

  let totalBuy = 0;
  let totalSell = 0;

  const priceItems: PriceItem[] = items.map((item) => {
    const row = data[String(item.typeId)];
    const unitBuy = row ? parseFloat(row.buy.percentile) : 0;
    const unitSell = row ? parseFloat(row.sell.percentile) : 0;
    const tb = unitBuy * item.quantity;
    const ts = unitSell * item.quantity;
    totalBuy += tb;
    totalSell += ts;
    return { ...item, unitBuy, unitSell, totalBuy: tb, totalSell: ts };
  });

  return {
    items: priceItems.sort((a, b) => a.name.localeCompare(b.name)),
    totalBuy,
    totalSell,
  };
}
