"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { contentBucket, isStoryPiece } from "@/lib/marcas/content/buckets";
import type { ContentPiece } from "@/lib/marcas/content/types";
import type { MarcasBrand } from "@/lib/marcas/types";
import { ContentCard } from "./content-card";
import { ContentDialog } from "./content-dialog";
import { dayLabel } from "./content-style";
import { rangeWindow, type ContentRange } from "./use-brand-content";
import { useAllBrandsContent, type BrandPiece } from "./use-all-brands-content";

const RANGES: ContentRange[] = ["next7", "next14", "next30", "past14"];
const FILTERS = ["all", "feed", "stories", "missing"] as const;
type Filter = (typeof FILTERS)[number];

const SEGMENT =
  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors";
const segmentClass = (active: boolean) =>
  cn(SEGMENT, active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground");

/**
 * /marcas/contenido — every brand's content plan on one timeline, read
 * live from each brand's sheet and Drive. Answers "what goes out this
 * week, and what is still missing" without opening brand by brand.
 */
export function AllContentBoard({ brands }: { brands: MarcasBrand[] }) {
  const t = useTranslations("Marcas.content");
  const tAll = useTranslations("Marcas.allContent");
  const locale = useLocale();
  const [range, setRange] = useState<ContentRange>("next7");
  const [filter, setFilter] = useState<Filter>("all");
  const [brandFilter, setBrandFilter] = useState("");
  const [open, setOpen] = useState<{ brandId: string; piece: ContentPiece } | null>(null);

  const span = useMemo(() => rangeWindow(range), [range]);
  const { pieces, errors, loading, generatedAt, reload, brandCount } = useAllBrandsContent(brands, span);
  const brandsById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);

  const days = useMemo(() => {
    const visible = (pieces ?? []).filter(({ brandId, piece }) => {
      if (brandFilter && brandId !== brandFilter) return false;
      if (filter === "feed") return !isStoryPiece(piece);
      if (filter === "stories") return isStoryPiece(piece);
      if (filter === "missing") return contentBucket(piece.status) === "missing";
      return true;
    });
    const groups = new Map<string | null, BrandPiece[]>();
    for (const bp of visible) groups.set(bp.piece.date, [...(groups.get(bp.piece.date) ?? []), bp]);
    return [...groups.entries()].sort(([a], [b]) => (a ?? "9999").localeCompare(b ?? "9999"));
  }, [pieces, filter, brandFilter]);

  const failed = Object.entries(errors);
  const updated = generatedAt
    ? new Date(generatedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
    : null;
  const brandTag = (id: string) => {
    const b = brandsById.get(id);
    return b ? { name: b.name, color: b.color } : undefined;
  };

  if (brandCount === 0) {
    return <p className="py-10 text-sm text-muted-foreground">{tAll("noBrands")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label={tAll("rangeLabel")} className="inline-flex flex-wrap rounded-lg border border-border bg-muted/40 p-0.5">
          {RANGES.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={range === r} onClick={() => setRange(r)} className={segmentClass(range === r)}>
              {t(`range.${r}`)}
            </button>
          ))}
        </div>
        <div role="tablist" aria-label={tAll("filterLabel")} className="inline-flex flex-wrap rounded-lg border border-border bg-muted/40 p-0.5">
          {FILTERS.map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={segmentClass(filter === f)}>
              {f === "missing" ? tAll("missing") : t(`filter.${f}`)}
            </button>
          ))}
        </div>
        <select
          aria-label={tAll("brandLabel")}
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs text-foreground"
        >
          <option value="">{tAll("allBrands")}</option>
          {brands
            .filter((b) => b.sheet_url || b.drive_url)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </select>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {updated ? <span>{t("updatedAt", { time: updated })}</span> : null}
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            {t("refresh")}
          </Button>
        </div>
      </div>

      {failed.length > 0 ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {tAll("someFailed", {
            brands: failed.map(([id]) => brandsById.get(id)?.name ?? id).join(", "),
          })}
        </p>
      ) : null}

      {!pieces ? (
        <div className="flex flex-col items-center gap-2 py-16 text-xs text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          {tAll("loading", { count: brandCount })}
        </div>
      ) : days.length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">{filter === "missing" ? tAll("nothingMissing") : t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {days.map(([date, items]) => {
            const feed = items.filter((x) => !isStoryPiece(x.piece));
            const stories = items.filter((x) => isStoryPiece(x.piece));
            return (
              <section key={date ?? "undated"} className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {date ? dayLabel(date, locale) : t("undated")}
                  <span className="ml-2 font-normal normal-case tracking-normal">
                    {tAll("dayCount", { count: items.length })}
                  </span>
                </h3>
                {feed.length > 0 ? (
                  <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {feed.map(({ brandId, piece }) => (
                      <ContentCard key={`${brandId}:${piece.key}`} piece={piece} brand={brandTag(brandId)} onOpen={() => setOpen({ brandId, piece })} />
                    ))}
                  </div>
                ) : null}
                {stories.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">{t("storiesTitle")}</span>
                    <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
                      {stories.map(({ brandId, piece }) => (
                        <div key={`${brandId}:${piece.key}`} className="w-28 shrink-0 snap-start sm:w-32">
                          <ContentCard piece={piece} variant="story" brand={brandTag(brandId)} onOpen={() => setOpen({ brandId, piece })} />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {open ? <ContentDialog key={`${open.brandId}:${open.piece.key}`} brandId={open.brandId} piece={open.piece} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
