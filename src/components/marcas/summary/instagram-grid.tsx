"use client";

import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { dayScore, type DayTally, type DayVerdict } from "@/lib/marcas/instagram/tally";
import { dayLabel } from "../content/content-style";
import type { BrandIgRow } from "./use-marcas-summary";

const VERDICT_STYLE: Record<DayVerdict, string> = {
  done: "bg-primary/15 text-primary",
  partial: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  none: "bg-destructive/15 text-destructive",
  pending: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  unknown: "bg-muted text-muted-foreground",
  unplanned: "text-muted-foreground",
};

/** Brands × last days: how much of the plan went out on Instagram. */
export function InstagramGrid({
  rows,
  days,
  today,
  loading,
  failed,
  configured,
  truncated,
}: {
  rows: BrandIgRow[];
  days: string[];
  today: string;
  loading: boolean;
  failed: boolean;
  configured: boolean | undefined;
  truncated: boolean;
}) {
  const t = useTranslations("Marcas.summary");
  const locale = useLocale();

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold text-foreground">{t("igTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("igHint")}</p>
      </div>
      {failed ? <p className="text-xs text-destructive">{t("igFailed")}</p> : null}
      {configured === false ? <p className="text-xs text-muted-foreground">{t("igNotConfigured")}</p> : null}
      {truncated ? <p className="text-xs text-amber-700 dark:text-amber-300">{t("igTruncated")}</p> : null}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[640px] border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th className="w-40" />
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
                      <span className="text-[10px] text-muted-foreground">{t("igNotLinked")}</span>
                    ) : row.stale ? (
                      <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
                        {row.lastSyncAt
                          ? t("igStale", { when: new Date(row.lastSyncAt).toLocaleString(locale, { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) })
                          : t("igNeverRead")}
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
  );
}

function DayCell({ day, linked }: { day: DayTally; linked: boolean }) {
  const t = useTranslations("Marcas.summary");
  const { planned, published, storiesUnknown } = day;
  const plannedTotal = planned.feed + planned.stories;
  const storiesOut = storiesUnknown ? "?" : published.stories;

  if (!linked) {
    return (
      <td
        className="rounded-md bg-muted/40 px-1 py-2 text-center tabular-nums text-muted-foreground"
        title={t("cellPlanOnly", { count: plannedTotal })}
      >
        {plannedTotal > 0 ? plannedTotal : "—"}
      </td>
    );
  }

  const score = dayScore(day);
  let main: string;
  if (day.verdict === "unplanned") {
    const extra = published.feed + (storiesUnknown ? 0 : published.stories);
    main = extra > 0 ? `+${extra}` : "—";
  } else {
    main = score.total > 0 ? `${score.met}/${score.total}` : "?";
  }

  return (
    <td
      className={cn("rounded-md px-1 py-1.5 text-center", VERDICT_STYLE[day.verdict])}
      title={t("cellDetail", { feedOut: published.feed, feedPlan: planned.feed, storiesOut, storiesPlan: planned.stories })}
    >
      <span className="block text-sm font-semibold tabular-nums">{main}</span>
      {day.verdict !== "unplanned" ? (
        <span className="block text-[10px] leading-tight opacity-80">
          {[
            planned.feed > 0 ? t("cellFeed", { out: published.feed, plan: planned.feed }) : null,
            planned.stories > 0 ? t("cellStories", { out: storiesOut, plan: planned.stories }) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      ) : null}
    </td>
  );
}
