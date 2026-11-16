"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ContentPiece, ContentResponse } from "@/lib/marcas/content/types";
import type { MarcasBrand } from "@/lib/marcas/types";

/** A piece tagged with the brand it belongs to (all-brands views). */
export interface BrandPiece {
  brandId: string;
  piece: ContentPiece;
}

export type BrandContentError = "no_access" | "unavailable";

/** The all-brands views re-read less often than one brand's board: N sheets per tick. */
const AUTO_REFRESH_MS = 180_000;
/** Sheets read at once; Google and the Vercel function both prefer a few at a time. */
const CONCURRENCY = 3;

/**
 * Live content for every brand that has a planning sheet or Instagram
 * folder, over one date window. Reuses GET /api/marcas/content per brand,
 * so access rides on the same RLS check as the brand page and a brand
 * that fails (sheet not shared with the robot) doesn't sink the rest.
 */
export function useAllBrandsContent(brands: MarcasBrand[] | null, span: { from: string; to: string } | null) {
  const targets = useMemo(
    () => (brands ?? []).filter((b) => b.sheet_url || b.drive_url).map((b) => b.id),
    [brands],
  );
  const targetsKey = targets.join(",");
  const from = span?.from ?? null;
  const to = span?.to ?? null;

  const [pieces, setPieces] = useState<BrandPiece[] | null>(null);
  const [errors, setErrors] = useState<Record<string, BrandContentError>>({});
  const [loading, setLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!from || !to) return;
    const ids = targetsKey ? targetsKey.split(",") : [];
    setLoading(true);
    const collected: BrandPiece[] = [];
    const failed: Record<string, BrandContentError> = {};
    let next = 0;
    const worker = async () => {
      while (next < ids.length) {
        const brandId = ids[next++];
        try {
          const res = await fetch(
            `/api/marcas/content?brand=${encodeURIComponent(brandId)}&from=${from}&to=${to}`,
            { cache: "no-store" },
          );
          const body = await res.json();
          if (!res.ok) {
            // no_sheet can't happen (filtered above); anything else is "try later".
            failed[brandId] = body?.error === "no_access" ? "no_access" : "unavailable";
            continue;
          }
          for (const piece of (body as ContentResponse).pieces) collected.push({ brandId, piece });
        } catch {
          failed[brandId] = "unavailable";
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
    collected.sort((a, b) => (a.piece.date ?? "9999").localeCompare(b.piece.date ?? "9999"));
    setPieces(collected);
    setErrors(failed);
    setGeneratedAt(new Date().toISOString());
    setLoading(false);
  }, [targetsKey, from, to]);

  useEffect(() => {
    if (!brands || !from || !to) return;
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [brands, from, to, load]);

  return { pieces, errors, loading, generatedAt, reload: load, brandCount: targets.length };
}
