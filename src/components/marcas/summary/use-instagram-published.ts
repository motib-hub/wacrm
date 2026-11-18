"use client";

import { useCallback, useEffect, useState } from "react";
import type { InstagramResponse } from "@/lib/marcas/instagram/types";

const AUTO_REFRESH_MS = 300_000;
/** After a background read starts, ask once more when it has likely finished. */
const AFTER_REFRESH_MS = 15_000;

/** What the brands published on Instagram between two Argentine dates (GET /api/marcas/instagram). */
export function useInstagramPublished(span: { from: string; to: string }) {
  const { from, to } = span;
  const [data, setData] = useState<InstagramResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [followUp, setFollowUp] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/marcas/instagram?from=${from}&to=${to}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as InstagramResponse;
      setData(body);
      setFailed(false);
      // The next answer comes back refreshing:false (the read is logged), so this doesn't loop.
      if (body.refreshing) setTimeout(() => setFollowUp((n) => n + 1), AFTER_REFRESH_MS);
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

  useEffect(() => {
    if (followUp > 0) load();
  }, [followUp, load]);

  return { data, failed, reload: load };
}
