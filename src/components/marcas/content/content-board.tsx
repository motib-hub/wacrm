"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isStoryPiece } from "@/lib/marcas/content/buckets";
import type { ContentPiece } from "@/lib/marcas/content/types";
import { ContentCard } from "./content-card";
import { ContentDialog } from "./content-dialog";
import { dayLabel } from "./content-style";
import { useBrandContent, type ContentRange } from "./use-brand-content";

const RANGES: ContentRange[] = ["next7", "next14", "next30", "past14"];
const FILTERS = ["all", "feed", "stories"] as const;
type Filter = (typeof FILTERS)[number];

/** Stories-only pieces (a sheet row ticked HISTORIA, or a day of Drive stories). */

/** The read-only Google robot sheets must be shared with (Viewer). */
const ROBOT_EMAIL = "crm-lector@motib-crm.iam.gserviceaccount.com";

/** Pieces grouped by day, in date order; undated rows last. */
function groupByDay(pieces: ContentPiece[]): [string | null, ContentPiece[]][] {
  const groups = new Map<string | null, ContentPiece[]>();
  for (const p of pieces) groups.set(p.date, [...(groups.get(p.date) ?? []), p]);
  return [...groups.entries()].sort(([a], [b]) => (a ?? "9999").localeCompare(b ?? "9999"));
}

/** A brand's content plan, read live from its sheet and Drive. */
export function ContentBoard({ brandId }: { brandId: string }) {
  const t = useTranslations("Marcas.content");
  const locale = useLocale();
  const [range, setRange] = useState<ContentRange>("next14");
  const [open, setOpen] = useState<ContentPiece | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const { data, error, loading, reload } = useBrandContent(brandId, range);

  const groups = useMemo(() => {
    const pieces = (data?.pieces ?? []).filter((p) =>
      filter === "all" ? true : filter === "stories" ? isStoryPiece(p) : !isStoryPiece(p),
    );
    return groupByDay(pieces);
  }, [data, filter]);
  const updated = data
    ? new Date(data.generatedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="inline-flex flex-wrap rounded-lg border border-border bg-muted/40 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                range === r ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`range.${r}`)}
            </button>
          ))}
        </div>
        <div role="tablist" className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`filter.${f}`)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {updated ? <span>{t("updatedAt", { time: updated })}</span> : null}
          <Button variant="outline" size="sm" onClick={reload} disabled={loading} aria-label={t("refresh")}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            {t("refresh")}
          </Button>
          {data?.sheetUrl ? (
            <a
              href={data.sheetUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted hover:text-foreground"
            >
              {t("openSheet")}
              <ExternalLink className="size-3" />
            </a>
          ) : null}
        </div>
      </div>

      {error === "no_sheet" ? (
        <p className="py-10 text-sm text-muted-foreground">{t("noSheet")}</p>
      ) : error === "no_access" ? (
        <p className="py-10 text-sm text-muted-foreground">
          {t("noAccess")} <span className="select-all font-mono text-foreground">{ROBOT_EMAIL}</span>
        </p>
      ) : error && !data ? (
        <p className="py-10 text-sm text-destructive">{t("unavailable")}</p>
      ) : !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : groups.length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([date, pieces]) => (
            <section key={date ?? "undated"} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {date ? dayLabel(date, locale) : t("undated")}
              </h3>
              {pieces.some((p) => !isStoryPiece(p)) ? (
                <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {pieces.filter((p) => !isStoryPiece(p)).map((p) => (
                    <ContentCard key={p.key} piece={p} onOpen={() => setOpen(p)} />
                  ))}
                </div>
              ) : null}
              {pieces.some(isStoryPiece) ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">{t("storiesTitle")}</span>
                  {/* Stories scroll sideways like on the phone: narrow 9:16 tiles. */}
                  <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
                    {pieces.filter(isStoryPiece).map((p) => (
                      <div key={p.key} className="w-28 shrink-0 snap-start sm:w-32">
                        <ContentCard piece={p} variant="story" onOpen={() => setOpen(p)} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ))}
        </div>
      )}

      {open ? <ContentDialog key={open.key} brandId={brandId} piece={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
