"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ContentPiece } from "@/lib/marcas/content/types";
import { ContentCard } from "./content-card";
import { ContentDialog } from "./content-dialog";
import { dayLabel } from "./content-style";
import { useBrandContent, type ContentRange } from "./use-brand-content";

const RANGES: ContentRange[] = ["next7", "next14", "next30", "past14"];

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
  const { data, error, loading, reload } = useBrandContent(brandId, range);

  const groups = useMemo(() => groupByDay(data?.pieces ?? []), [data]);
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {pieces.map((p) => (
                  <ContentCard key={p.key} piece={p} onOpen={() => setOpen(p)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {open ? <ContentDialog key={open.key} piece={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
