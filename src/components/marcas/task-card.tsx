"use client";

import { useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { isOverdue } from "@/lib/marcas/board";
import type { MarcasBrand, MarcasMember, MarcasTask } from "@/lib/marcas/types";

interface TaskCardProps {
  task: MarcasTask;
  brand?: MarcasBrand;
  assignee?: MarcasMember;
  /** Shown on the all-brands board, hidden inside a brand's own page. */
  showBrand: boolean;
  onOpen: () => void;
}

/** "2026-11-24" → "24/11", read as a calendar day, not shifted by time zone. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function TaskCard({ task, brand, assignee, showBrand, onOpen }: TaskCardProps) {
  const t = useTranslations("Marcas");
  const overdue = isOverdue(task);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-border bg-card p-3 text-left shadow-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {showBrand && brand ? (
        <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <span className="size-2 shrink-0 rounded-full" style={{ background: brand.color }} />
          {brand.name}
        </span>
      ) : null}
      <span
        className={cn(
          "block text-sm leading-snug text-foreground",
          task.status === "hecho" && "text-muted-foreground line-through decoration-muted-foreground/40",
        )}
      >
        {task.title}
      </span>
      {task.due_date || assignee ? (
        <span className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          {task.due_date ? (
            <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-destructive")}>
              <CalendarDays className="size-3" aria-hidden />
              {shortDate(task.due_date)}
              {overdue ? <span className="sr-only">{t("overdue")}</span> : null}
            </span>
          ) : null}
          {assignee ? (
            <span
              title={assignee.display_name}
              className="ml-auto flex size-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary"
            >
              {initials(assignee.display_name)}
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}
