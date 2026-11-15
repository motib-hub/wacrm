"use client";

import { useCallback, useEffect, useState } from "react";
import { localIsoDate } from "@/lib/marcas/board";
import type { ContentResponse } from "@/lib/marcas/content/types";

export type ContentRange = "next7" | "next14" | "next30" | "past14";

/** While the board is on screen it re-reads the sheet on this cadence. */
const AUTO_REFRESH_MS = 90_000;

export function rangeWindow(range: ContentRange, now: Date = new Date()): { from: string; to: string } {
  const shift = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return localIsoDate(d);
  };
  if (range === "past14") return { from: shift(-14), to: shift(0) };
  const days = range === "next7" ? 7 : range === "next14" ? 14 : 30;
  return { from: shift(0), to: shift(days) };
}

type LoadError = "no_sheet" | "unavailable" | null;

/**
 * Live content for one brand. Re-fetches every AUTO_REFRESH_MS while the
 * tab is visible, and right away when the tab comes back into view — so
 * a piece Ailén uploads shows up without anyone reloading the page.
 */
export function useBrandContent(brandId: string, range: ContentRange) {
  const [data, setData] = useState<ContentResponse | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = rangeWindow(range);
    try {
      const res = await fetch(
        `/api/marcas/content?brand=${encodeURIComponent(brandId)}&from=${from}&to=${to}`,
        { cache: "no-store" },
      );
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error === "no_sheet" ? "no_sheet" : "unavailable");
      } else {
        setData(body as ContentResponse);
        setError(null);
      }
    } catch {
      setError("unavailable");
    } finally {
      setLoading(false);
    }
  }, [brandId, range]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, AUTO_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  return { data, error, loading, reload: load };
}
