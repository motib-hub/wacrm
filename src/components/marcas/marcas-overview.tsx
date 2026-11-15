"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { openTaskCounts } from "@/lib/marcas/board";
import type { MarcasMember } from "@/lib/marcas/types";
import { BrandCard } from "./brand-card";
import { TaskBoard } from "./task-board";
import { useMarcasTasks } from "./use-marcas-tasks";
import { useMarcasWorkspace } from "./use-marcas-workspace";

export type MarcasView = "brands" | "tasks";

/** Each view has its own URL so the hub sidebar and these tabs always agree. */
const VIEW_HREF: Record<MarcasView, string> = { brands: "/marcas", tasks: "/marcas/tareas" };

/**
 * /marcas (Clientes) — every visible brand; /marcas/tareas (Tareas) — one
 * board across all of them.
 */
export function MarcasOverview({ member, view }: { member: MarcasMember; view: MarcasView }) {
  const t = useTranslations("Marcas");
  const tab = view;
  const [onlyMine, setOnlyMine] = useState(false);
  const { brands, members, error } = useMarcasWorkspace(true);
  const board = useMarcasTasks();

  const counts = useMemo(() => openTaskCounts(board.tasks ?? []), [board.tasks]);
  const visibleTasks = useMemo(
    () => (onlyMine ? (board.tasks ?? []).filter((x) => x.assignee_id === member.user_id) : board.tasks ?? []),
    [board.tasks, onlyMine, member.user_id],
  );

  const loadError = error ?? board.error;
  const loading = !loadError && (!brands || !board.tasks);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
          {(["brands", "tasks"] as const).map((key) => (
            <Link
              key={key}
              href={VIEW_HREF[key]}
              role="tab"
              aria-selected={tab === key}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(key === "brands" ? "tabBrands" : "tabTasks")}
            </Link>
          ))}
        </div>
        {tab === "tasks" ? (
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(e) => setOnlyMine(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            {t("onlyMine")}
          </label>
        ) : null}
      </div>

      {loadError ? (
        <p className="text-sm text-destructive">{t("loadError", { message: loadError })}</p>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : tab === "brands" ? (
        brands!.length === 0 ? (
          <p className="py-10 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {brands!.map((brand) => (
              <BrandCard
                key={brand.id}
                brand={brand}
                counts={counts.get(brand.id)}
                showVisibility={member.role === "admin"}
              />
            ))}
          </div>
        )
      ) : (
        <TaskBoard
          tasks={visibleTasks}
          brands={brands!}
          members={members}
          onAdd={board.add}
          onUpdate={board.update}
          onRemove={board.remove}
        />
      )}
    </div>
  );
}
