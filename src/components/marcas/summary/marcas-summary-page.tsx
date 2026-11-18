"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { contentBucket } from "@/lib/marcas/content/buckets";
import type { ContentPiece } from "@/lib/marcas/content/types";
import { argentinaDate, isStoryPiece, shiftDate, tallyDays, type DayTally, type DayVerdict } from "@/lib/marcas/instagram/tally";
import { dueSoon, taskTotals } from "@/lib/marcas/summary";
import type { MarcasBrand } from "@/lib/marcas/types";
import { MarcasSectionHeader } from "../section-header";
import { useMarcasTasks } from "../use-marcas-tasks";
import { useMarcasWorkspace } from "../use-marcas-workspace";
import { ContentDialog } from "../content/content-dialog";
import { PIECE_STATUS_STYLE, dayLabel } from "../content/content-style";
import { useAllBrandsContent, type BrandPiece } from "../content/use-all-brands-content";
import { useInstagramPublished } from "./use-instagram-published";

const PAST_DAYS = 6;
const NEXT_DAYS = 7;

const VERDICT_STYLE: Record<DayVerdict, string> = {
  done: "bg-primary/15 text-primary",
  partial: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  none: "bg-destructive/15 text-destructive",
  pending: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  unknown: "bg-muted text-muted-foreground",
  unplanned: "text-muted-foreground",
};

const hasManual = (p: ContentPiece) => p.media.some((m) => m.manual);

/** /marcas/resumen — the Marcas dashboard. */
export function MarcasSummaryPage() {
  const t = useTranslations("Marcas");
  const { brands, error } = useMarcasWorkspace(true);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <MarcasSectionHeader />
      {error ? (
        <p className="text-sm text-destructive">{t("loadError", { message: error })}</p>
      ) : !brands ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <SummaryBody brands={brands} />
      )}
    </div>
  );
}

function SummaryBody({ brands }: { brands: MarcasBrand[] }) {
  const t = useTranslations("Marcas.summary");
  const tContent = useTranslations("Marcas.content");
  const locale = useLocale();

  // Argentina's calendar (the brands' market), whatever the viewer's timezone.
  const [today] = useState(() => argentinaDate(new Date()));
  const past = useMemo(() => ({ from: shiftDate(today, -PAST_DAYS), to: today }), [today]);
  const span = useMemo(() => ({ from: past.from, to: shiftDate(today, NEXT_DAYS) }), [past, today]);
  const days = useMemo(() => Array.from({ length: PAST_DAYS + 1 }, (_, i) => shiftDate(past.from, i)), [past]);

  const content = useAllBrandsContent(brands, span);
  const instagram = useInstagramPublished(past);
  const { tasks } = useMarcasTasks();
  const [open, setOpen] = useState<BrandPiece | null>(null);

  const brandsById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const planned = useMemo(() => brands.filter((b) => b.sheet_url || b.drive_url), [brands]);

  const piecesByBrand = useMemo(() => {
    const map = new Map<string, ContentPiece[]>();
    for (const { brandId, piece } of content.pieces ?? []) map.set(brandId, [...(map.get(brandId) ?? []), piece]);
    return map;
  }, [content.pieces]);

  const rows = useMemo(() => {
    const ig = instagram.data;
    return planned.map((brand) => {
      const state = ig?.brands[brand.id];
      const linked = state?.outcome === "ok";
      const items = (ig?.items ?? []).filter((i) => i.brand_id === brand.id);
      const tallies = tallyDays(days, piecesByBrand.get(brand.id) ?? [], linked ? items : [], {
        today,
        firstSyncAt: linked ? state?.firstSyncAt ?? null : null,
      });
      return { brand, linked, outcome: state?.outcome, tallies };
    });
  }, [planned, instagram.data, piecesByBrand, days, today]);

  const yesterday = shiftDate(today, -1);
  const yesterdayTotals = useMemo(() => {
    let met = 0;
    let total = 0;
    for (const row of rows) {
      if (!row.linked) continue;
      const d = row.tallies.find((x) => x.date === yesterday);
      if (!d) continue;
      const storiesKnown = !d.storiesUnknown;
      met += Math.min(d.published.feed, d.planned.feed) + (storiesKnown ? Math.min(d.published.stories, d.planned.stories) : 0);
      total += d.planned.feed + (storiesKnown ? d.planned.stories : 0);
    }
    return { met, total };
  }, [rows, yesterday]);

  const todayPieces = useMemo(
    () => (content.pieces ?? []).filter((bp) => bp.piece.date === today),
    [content.pieces, today],
  );
  const manualToday = todayPieces.filter((bp) => hasManual(bp.piece)).length;
  const missing = useMemo(
    () =>
      (content.pieces ?? []).filter(
        (bp) => bp.piece.date !== null && bp.piece.date > today && contentBucket(bp.piece.status) === "missing",
      ),
    [content.pieces, today],
  );
  const totals = useMemo(() => (tasks ? taskTotals(tasks) : null), [tasks]);
  const soon = useMemo(() => (tasks ? dueSoon(tasks).slice(0, 8) : []), [tasks]);

  const loading = !content.pieces || !instagram.data;
  const reload = () => {
    content.reload();
    instagram.reload();
  };
  const brandName = (id: string) => brandsById.get(id)?.name ?? id;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{t("timezone")}</span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={reload} disabled={content.loading}>
          <RefreshCw className={cn("size-3.5", content.loading && "animate-spin")} />
          {tContent("refresh")}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label={t("tileYesterday")}
          value={loading ? "…" : yesterdayTotals.total > 0 ? `${yesterdayTotals.met}/${yesterdayTotals.total}` : "—"}
          hint={t("tileYesterdayHint")}
        />
        <Tile
          label={t("tileToday")}
          value={content.pieces ? String(todayPieces.length) : "…"}
          hint={manualToday > 0 ? t("tileTodayManual", { count: manualToday }) : t("tileTodayHint")}
        />
        <Tile
          label={t("tileMissing")}
          value={content.pieces ? String(missing.length) : "…"}
          hint={t("tileMissingHint")}
          tone={missing.length > 0 ? "warn" : undefined}
        />
        <Tile
          label={t("tileOverdue")}
          value={totals ? String(totals.overdue) : "…"}
          hint={totals ? t("tileOverdueHint", { open: totals.open, waiting: totals.waitingClient }) : ""}
          tone={totals && totals.overdue > 0 ? "bad" : undefined}
        />
      </div>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold text-foreground">{t("igTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("igHint")}</p>
        </div>
        {instagram.failed && !instagram.data ? (
          <p className="text-xs text-destructive">{t("igFailed")}</p>
        ) : instagram.data && !instagram.data.configured ? (
          <p className="text-xs text-muted-foreground">{t("igNotConfigured")}</p>
        ) : null}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[640px] border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className="w-40 text-left font-medium text-muted-foreground" />
                  {days.map((d) => (
                    <th key={d} className={cn("font-medium text-muted-foreground", d === today && "text-foreground")}>
                      {d === today ? t("today") : dayLabel(d, locale)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.brand.id}>
                    <td className="pr-2 align-middle">
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.brand.color }} />
                        <span className="truncate font-medium text-foreground">{row.brand.name}</span>
                      </div>
                      {!row.linked ? (
                        <span className="text-[10px] text-muted-foreground">
                          {row.outcome === "error" ? t("igError") : t("igNotLinked")}
                        </span>
                      ) : null}
                    </td>
                    {row.tallies.map((d) => (
                      <DayCell key={d.date} day={d} linked={row.linked} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">{t("igLegend")}</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">{t("todayTitle", { day: dayLabel(today, locale) })}</h2>
          {!content.pieces ? (
            <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
          ) : todayPieces.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("todayEmpty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {todayPieces.map((bp) => (
                <PieceRow key={`${bp.brandId}:${bp.piece.key}`} bp={bp} brandName={brandName(bp.brandId)} onOpen={() => setOpen(bp)} />
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">{t("missingTitle")}</h2>
          {!content.pieces ? (
            <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
          ) : missing.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("missingEmpty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {missing.map((bp) => (
                <PieceRow
                  key={`${bp.brandId}:${bp.piece.key}`}
                  bp={bp}
                  brandName={brandName(bp.brandId)}
                  day={dayLabel(bp.piece.date!, locale)}
                  onOpen={() => setOpen(bp)}
                />
              ))}
            </ul>
          )}
          {Object.keys(content.errors).length > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {t("someFailed", { brands: Object.keys(content.errors).map(brandName).join(", ") })}
            </p>
          ) : null}
        </section>
      </div>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("tasksTitle")}</h2>
          <Link href="/marcas/tareas" className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline">
            {t("tasksOpen")}
            <ArrowRight className="size-3" />
          </Link>
        </div>
        {!tasks ? (
          <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
        ) : soon.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("tasksEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {soon.map((task) => {
              const late = task.due_date! < today;
              return (
                <li key={task.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: brandsById.get(task.brand_id)?.color }} />
                  <span className="min-w-0 flex-1 truncate text-foreground">{task.title}</span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">{brandName(task.brand_id)}</span>
                  <span className={cn("shrink-0 text-xs", late ? "font-medium text-destructive" : "text-muted-foreground")}>
                    {late ? t("overdue") : dayLabel(task.due_date!, locale)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {open ? (
        <ContentDialog key={`${open.brandId}:${open.piece.key}`} brandId={open.brandId} piece={open.piece} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "warn" | "bad" }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums text-foreground",
          tone === "warn" && "text-amber-600 dark:text-amber-300",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </span>
      <span className="text-[11px] leading-tight text-muted-foreground">{hint}</span>
    </div>
  );
}

function DayCell({ day, linked }: { day: DayTally; linked: boolean }) {
  const t = useTranslations("Marcas.summary");
  const { planned, published } = day;
  const plannedTotal = planned.feed + planned.stories;
  const detail = t("cellDetail", {
    feedOut: published.feed,
    feedPlan: planned.feed,
    storiesOut: day.storiesUnknown ? "?" : published.stories,
    storiesPlan: planned.stories,
  });

  if (!linked) {
    return (
      <td className="rounded-md bg-muted/40 px-1 py-2 text-center tabular-nums text-muted-foreground" title={t("cellPlanOnly", { count: plannedTotal })}>
        {plannedTotal > 0 ? plannedTotal : "—"}
      </td>
    );
  }

  let main: string;
  if (day.verdict === "unplanned") {
    const extra = published.feed + (day.storiesUnknown ? 0 : published.stories);
    main = extra > 0 ? `+${extra}` : "—";
  } else if (day.storiesUnknown) {
    main = planned.feed > 0 ? `${Math.min(published.feed, planned.feed)}/${planned.feed}` : "?";
  } else {
    main = `${Math.min(published.feed, planned.feed) + Math.min(published.stories, planned.stories)}/${plannedTotal}`;
  }

  return (
    <td className={cn("rounded-md px-1 py-1.5 text-center", VERDICT_STYLE[day.verdict])} title={detail}>
      <span className="block text-sm font-semibold tabular-nums">{main}</span>
      {day.verdict !== "unplanned" ? (
        <span className="block text-[10px] leading-tight opacity-80">
          {planned.feed > 0 ? t("cellFeed", { out: published.feed, plan: planned.feed }) : null}
          {planned.feed > 0 && planned.stories > 0 ? " · " : null}
          {planned.stories > 0
            ? t("cellStories", { out: day.storiesUnknown ? "?" : published.stories, plan: planned.stories })
            : null}
        </span>
      ) : null}
    </td>
  );
}

function PieceRow({ bp, brandName, day, onOpen }: { bp: BrandPiece; brandName: string; day?: string; onOpen: () => void }) {
  const t = useTranslations("Marcas.content");
  const { piece } = bp;
  const story = isStoryPiece(piece);
  const manual = piece.media.filter((m) => m.manual).length;
  const label = story
    ? t("storiesCount", { count: Math.max(1, piece.media.length) })
    : piece.title || piece.copy.slice(0, 60) || piece.formats.map((f) => t(`format.${f}`)).join(" · ");

  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-2 py-2 text-left text-sm hover:bg-muted/40">
        {day ? <span className="w-16 shrink-0 text-xs text-muted-foreground">{day}</span> : null}
        <span className="w-24 shrink-0 truncate text-xs font-medium text-muted-foreground">{brandName}</span>
        <span className="min-w-0 flex-1 truncate text-foreground">{label}</span>
        {manual > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300" title={t("manualHint")}>
            <Smartphone className="size-3" />
            {t("manualBadge", { count: manual })}
          </span>
        ) : null}
        <span className={cn("shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", PIECE_STATUS_STYLE[piece.status])}>
          {t(`status.${piece.status}`)}
        </span>
      </button>
    </li>
  );
}
