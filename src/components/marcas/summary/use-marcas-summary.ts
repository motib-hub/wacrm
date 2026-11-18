"use client";

import { useEffect, useMemo, useState } from "react";
import type { ContentPiece } from "@/lib/marcas/content/types";
import { argentinaDate, dayScore, shiftDate, tallyDays, type DayTally } from "@/lib/marcas/instagram/tally";
import { dueSoon, taskTotals } from "@/lib/marcas/summary";
import type { MarcasBrand } from "@/lib/marcas/types";
import { useAllBrandsContent } from "../content/use-all-brands-content";
import { useMarcasTasks } from "../use-marcas-tasks";
import { useInstagramPublished } from "./use-instagram-published";

const PAST_DAYS = 6;
const DUE_SOON_SHOWN = 8;

/** A read older than this means the schedule stopped: say so on the row. */
const STALE_MS = 26 * 3_600_000;

export interface BrandIgRow {
  brand: MarcasBrand;
  /** Has an Instagram account set (and Meta is configured). */
  linked: boolean;
  /** Linked, but no read in the window or none for over a day. */
  stale: boolean;
  lastSyncAt: string | null;
  tallies: DayTally[];
}

/**
 * Everything the summary shows, from three sources the other Marcas pages
 * already use: the content plans (sheet + Drive) of the last days, what Instagram shows
 * (GET /api/marcas/instagram) and the tasks. Days follow Argentina's
 * calendar, whatever the viewer's timezone.
 */
export function useMarcasSummary(brands: MarcasBrand[]) {
  // Re-evaluated on every refresh, so a tab left open past midnight moves on.
  const [today, setToday] = useState(() => argentinaDate(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setToday(argentinaDate(new Date())), 60_000);
    return () => clearInterval(timer);
  }, []);
  const past = useMemo(() => ({ from: shiftDate(today, -PAST_DAYS), to: today }), [today]);
  const days = useMemo(() => Array.from({ length: PAST_DAYS + 1 }, (_, i) => shiftDate(past.from, i)), [past]);

  const content = useAllBrandsContent(brands, past);
  const instagram = useInstagramPublished(past);
  const { tasks } = useMarcasTasks();

  const igRows = useMemo<BrandIgRow[]>(() => {
    const ig = instagram.data;
    const byBrand = new Map<string, ContentPiece[]>();
    for (const { brandId, piece } of content.pieces ?? []) byBrand.set(brandId, [...(byBrand.get(brandId) ?? []), piece]);
    return brands
      .filter((b) => b.sheet_url || b.drive_url)
      .map((brand) => {
        const state = ig?.brands[brand.id];
        // Stored rows count even when the latest read failed: they are still true.
        const linked = Boolean(ig?.configured && state?.username);
        const items = linked ? (ig?.items ?? []).filter((i) => i.brand_id === brand.id) : [];
        const tallies = tallyDays(days, byBrand.get(brand.id) ?? [], items, { today, syncs: linked ? (state?.syncs ?? []) : [] });
        const lastSyncAt = state?.lastSyncAt ?? null;
        // eslint-disable-next-line react-hooks/purity -- staleness is relative to "now" by design
        const stale = linked && (!lastSyncAt || Date.now() - Date.parse(lastSyncAt) > STALE_MS);
        return { brand, linked, stale, lastSyncAt, tallies };
      });
  }, [brands, instagram.data, content.pieces, days, today]);

  const yesterday = useMemo(() => {
    const date = shiftDate(today, -1);
    let met = 0;
    let total = 0;
    for (const row of igRows) {
      const day = row.linked ? row.tallies.find((x) => x.date === date) : undefined;
      if (!day) continue;
      const score = dayScore(day);
      met += score.met;
      total += score.total;
    }
    return { met, total };
  }, [igRows, today]);

  return {
    today,
    days,
    content,
    instagram,
    igRows,
    yesterday,
    tasks,
    taskTotals: tasks ? taskTotals(tasks) : null,
    dueSoon: tasks ? dueSoon(tasks).slice(0, DUE_SOON_SHOWN) : [],
    reload: () => {
      setToday(argentinaDate(new Date()));
      content.reload();
      instagram.reload();
    },
  };
}
