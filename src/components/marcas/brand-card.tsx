"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarcasBrand, TaskStatus } from "@/lib/marcas/types";
import { STATUS_STYLE } from "./status-style";

type OpenCounts = Record<Exclude<TaskStatus, "hecho">, number>;

interface BrandCardProps {
  brand: MarcasBrand;
  counts?: OpenCounts;
  /** Admins see which brands the team can't; the team never sees this flag. */
  showVisibility: boolean;
}

const OPEN: Exclude<TaskStatus, "hecho">[] = ["hacer", "curso", "cliente"];

export function BrandCard({ brand, counts, showVisibility }: BrandCardProps) {
  const t = useTranslations("Marcas");
  const total = counts ? counts.hacer + counts.curso + counts.cliente : 0;

  return (
    <Link
      href={`/marcas/${brand.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="h-1.5 w-full" style={{ background: brand.color }} aria-hidden />
      <span className="flex flex-1 flex-col gap-2 p-4">
        <span className="flex items-start gap-2">
          <span className="flex-1 text-base font-semibold text-foreground">{brand.name}</span>
          {showVisibility && !brand.team_visible ? (
            <span
              title={t("adminOnly")}
              className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              <EyeOff className="size-3" aria-hidden />
              {t("adminOnly")}
            </span>
          ) : null}
        </span>
        {brand.tagline ? (
          <span className="line-clamp-2 text-sm text-muted-foreground">{brand.tagline}</span>
        ) : null}
        <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
          {total === 0 ? (
            <span className="text-muted-foreground">{t("openCount", { count: 0 })}</span>
          ) : (
            OPEN.filter((s) => counts![s] > 0).map((s) => (
              <span
                key={s}
                className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5", STATUS_STYLE[s].chip)}
              >
                <span className="tabular-nums font-semibold">{counts![s]}</span>
                {t(`status.${s}`)}
              </span>
            ))
          )}
        </span>
      </span>
    </Link>
  );
}
