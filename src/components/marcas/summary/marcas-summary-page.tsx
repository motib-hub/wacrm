"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MarcasBrand } from "@/lib/marcas/types";
import { MarcasSectionHeader } from "../section-header";
import { useMarcasWorkspace } from "../use-marcas-workspace";
import { dayLabel } from "../content/content-style";
import { InstagramGrid } from "./instagram-grid";
import { useMarcasSummary } from "./use-marcas-summary";

/**
 * /marcas/resumen — the Marcas dashboard: did the plan go out on
 * Instagram and which tasks are due. Today's pieces and missing material
 * live in the content board, not here. Data and rules live in
 * useMarcasSummary and src/lib/marcas/instagram/tally.ts; this file only
 * lays it out.
 */
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
  const s = useMarcasSummary(brands);

  const brandsById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const brandName = (id: string) => brandsById.get(id)?.name ?? id;
  const pieces = s.content.pieces;
  const ig = s.instagram.data;
  const failedBrands = Object.keys(s.content.errors);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{t("timezone")}</span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={s.reload} disabled={s.content.loading}>
          <RefreshCw className={cn("size-3.5", s.content.loading && "animate-spin")} />
          {tContent("refresh")}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Tile
          label={t("tileYesterday")}
          value={!pieces || !ig ? "…" : s.yesterday.total > 0 ? `${s.yesterday.met}/${s.yesterday.total}` : "—"}
          hint={t("tileYesterdayHint")}
        />
        <Tile
          label={t("tileOverdue")}
          value={s.taskTotals ? String(s.taskTotals.overdue) : "…"}
          hint={s.taskTotals ? t("tileOverdueHint", { open: s.taskTotals.open, waiting: s.taskTotals.waitingClient }) : ""}
          tone={s.taskTotals && s.taskTotals.overdue > 0 ? "bad" : undefined}
        />
      </div>

      <InstagramGrid
        rows={s.igRows}
        days={s.days}
        today={s.today}
        loading={!pieces || !ig}
        failed={s.instagram.failed && !ig}
        configured={ig?.configured}
        truncated={ig?.truncated ?? false}
        footer={failedBrands.length > 0 ? t("someFailed", { brands: failedBrands.map(brandName).join(", ") }) : null}
      />

      <Panel
        title={t("tasksTitle")}
        action={
          <Link href="/marcas/tareas" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            {t("tasksOpen")}
            <ArrowRight className="size-3" />
          </Link>
        }
        loading={!s.tasks}
        empty={s.dueSoon.length === 0 ? t("tasksEmpty") : null}
      >
        {s.dueSoon.map((task) => {
          const late = task.due_date! < s.today;
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
      </Panel>

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

/** A titled card with a list; shows a spinner while loading and a line when empty. */
function Panel({
  title,
  action,
  loading,
  empty,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  loading: boolean;
  empty: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {loading ? (
        <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
      ) : empty ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">{children}</ul>
      )}
    </section>
  );
}
