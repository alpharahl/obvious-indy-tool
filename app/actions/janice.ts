"use server";

export interface JaniceItem {
  name: string;
  quantity: number;
  unitBuyPrice: number;
  unitSellPrice: number;
  totalBuyPrice: number;
  totalSellPrice: number;
}

export interface JaniceResult {
  items: JaniceItem[];
  totalBuyPrice: number;
  totalSellPrice: number;
}

export async function fetchJanicePrices(
  items: { name: string; quantity: number }[],
): Promise<JaniceResult> {
  const apiKey = process.env.JANICE_API_KEY;
  if (!apiKey) throw new Error("JANICE_API_KEY is not configured");

  // Format as EVE paste text: "Name\tQuantity" per line
  const body = items.map((i) => `${i.name}\t${i.quantity}`).join("\n");

  const res = await fetch(
    "https://janice.e-351.com/api/rest/appraisal/v2?market=2&persist=false&compactize=true&pricePercentage=1",
    {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "X-ApiKey": apiKey,
      },
      body,
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Janice API error ${res.status}: ${text || res.statusText}`);
  }

  const data = await res.json();

  // Map response — Janice v2 returns { items: [...], totalBuyPrice, totalSellPrice }
  const mapped: JaniceItem[] = (data.items ?? []).map((it: Record<string, unknown>) => {
    const itemType = it.itemType as Record<string, unknown> | undefined;
    return {
      name: (itemType?.name as string) ?? String(itemType?.eid ?? "Unknown"),
      quantity: Number(it.amount ?? 0),
      unitBuyPrice: Number(it.unitBuyPrice ?? 0),
      unitSellPrice: Number(it.unitSellPrice ?? 0),
      totalBuyPrice: Number(it.totalBuyPrice ?? 0),
      totalSellPrice: Number(it.totalSellPrice ?? 0),
    };
  });

  return {
    items: mapped.sort((a, b) => a.name.localeCompare(b.name)),
    totalBuyPrice: Number(data.totalBuyPrice ?? 0),
    totalSellPrice: Number(data.totalSellPrice ?? 0),
  };
}
