"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, ExternalLink, FolderOpen, Loader2, Sheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContentBoard } from "./content/content-board";
import { TaskBoard } from "./task-board";
import { useMarcasTasks } from "./use-marcas-tasks";
import { useMarcasWorkspace } from "./use-marcas-workspace";

/** /marcas/[id] — one brand: who they are, where their files live, their board. */
export function BrandWorkspace({ brandId }: { brandId: string }) {
  const t = useTranslations("Marcas");
  const { brands, members, error } = useMarcasWorkspace(true);
  const board = useMarcasTasks(brandId);
  const [tab, setTab] = useState<"tasks" | "content">("tasks");

  const loadError = error ?? board.error;
  if (loadError) return <p className="text-sm text-destructive">{t("loadError", { message: loadError })}</p>;
  if (!brands || !board.tasks) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const brand = brands.find((b) => b.id === brandId);
  if (!brand) {
    return (
      <div className="flex flex-col items-start gap-3 py-10">
        <p className="text-sm text-muted-foreground">{t("brandNotFound")}</p>
        <BackLink label={t("back")} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <BackLink label={t("back")} />
      <header className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-start">
        <span className="size-10 shrink-0 rounded-lg" style={{ background: brand.color }} aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">{brand.name}</h1>
          {brand.tagline ? <p className="text-sm text-muted-foreground">{brand.tagline}</p> : null}
          {brand.contact_name ? (
            <p className="text-xs text-muted-foreground">{t("contact", { name: brand.contact_name })}</p>
          ) : null}
          {brand.notes ? <p className="mt-1 whitespace-pre-line text-sm text-foreground">{brand.notes}</p> : null}
        </div>
        {brand.sheet_url || brand.drive_url ? (
          <nav className="flex flex-wrap gap-2 sm:flex-col">
            {brand.sheet_url ? <ExternalButton href={brand.sheet_url} icon={Sheet} label={t("sheet")} /> : null}
            {brand.drive_url ? <ExternalButton href={brand.drive_url} icon={FolderOpen} label={t("drive")} /> : null}
          </nav>
        ) : null}
      </header>

      {brand.sheet_url || brand.drive_url ? (
        <div role="tablist" className="inline-flex w-fit rounded-lg border border-border bg-muted/40 p-0.5">
          {(["tasks", "content"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(key === "tasks" ? "content.tabTasks" : "content.tabContent")}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "content" && (brand.sheet_url || brand.drive_url) ? (
        <ContentBoard brandId={brand.id} />
      ) : (
        <TaskBoard
          tasks={board.tasks}
          brands={brands}
          members={members}
          brandId={brand.id}
          onAdd={board.add}
          onUpdate={board.update}
          onRemove={board.remove}
        />
      )}
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      href="/marcas"
      className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {label}
    </Link>
  );
}

function ExternalButton({ href, icon: Icon, label }: { href: string; icon: typeof Sheet; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
    >
      <Icon className="size-4 text-muted-foreground" />
      {label}
      <ExternalLink className="size-3 text-muted-foreground" />
    </a>
  );
}
