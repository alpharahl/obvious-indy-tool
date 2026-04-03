"use client";

import { useTransition } from "react";
import { syncAssets } from "../actions/sync-assets";

export default function SyncAssetsButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => syncAssets())}
      className="w-fit text-xs uppercase tracking-widest px-4 py-2 rounded border cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
    >
      {pending ? "Syncing…" : "Sync Assets"}
    </button>
  );
}
