"use client";

import { useCallback, useEffect, useState } from "react";
import type { InstagramResponse } from "@/app/api/marcas/instagram/route";

const AUTO_REFRESH_MS = 300_000;

/** What the brands published on Instagram between two Argentine dates (GET /api/marcas/instagram). */
export function useInstagramPublished(span: { from: string; to: string }) {
  const { from, to } = span;
  const [data, setData] = useState<InstagramResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/marcas/instagram?from=${from}&to=${to}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as InstagramResponse);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [from, to]);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return { data, failed, reload: load };
}
