"use client";

import { useTranslations } from "next-intl";
import { CircleDashed, Clapperboard, Image as ImageIcon, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { isOverdue } from "@/lib/marcas/board";
import { contentBucket } from "@/lib/marcas/summary";
import type { ContentPiece } from "@/lib/marcas/content/types";
import type { MarcasBrand, MarcasTask } from "@/lib/marcas/types";
import { STATUS_STYLE } from "../status-style";

/** What one calendar day can hold. Stories collapse into one item per brand. */
export type DayItem =
  | { kind: "task"; task: MarcasTask }
  | { kind: "piece"; brandId: string; piece: ContentPiece }
  | { kind: "stories"; brandId: string; pieces: ContentPiece[] };

export const isStoryPiece = (p: ContentPiece) =>
  p.formats.includes("historia") && p.formats.every((f) => f === "historia");

export function dayItemKey(item: DayItem): string {
  if (item.kind === "task") return `t:${item.task.id}`;
  if (item.kind === "piece") return `p:${item.brandId}:${item.piece.key}`;
  return `s:${item.brandId}`;
}

/** Tasks first (open before done), then feed pieces, then story groups. */
export function buildDayItems(tasks: MarcasTask[], pieces: { brandId: string; piece: ContentPiece }[]): DayItem[] {
  const open = tasks.filter((t) => t.status !== "hecho");
  const done = tasks.filter((t) => t.status === "hecho");
  const items: DayItem[] = [...open, ...done].map((task) => ({ kind: "task", task }));
  const stories = new Map<string, ContentPiece[]>();
  for (const { brandId, piece } of pieces) {
    if (isStoryPiece(piece)) stories.set(brandId, [...(stories.get(brandId) ?? []), piece]);
    else items.push({ kind: "piece", brandId, piece });
  }
  for (const [brandId, list] of stories) items.push({ kind: "stories", brandId, pieces: list });
  return items;
}

interface ChipProps {
  item: DayItem;
  brand?: MarcasBrand;
  /** Bigger rows for the phone agenda and the day dialog. */
  size?: "sm" | "md";
  onOpen: () => void;
  /** Tasks only: lets the chip be dragged to another day (desktop). */
  draggable?: boolean;
}

/**
 * One line in a day. A task wears its brand's color as a left bar and a
 * status dot; content wears an icon, and a dashed border when the piece
 * is planned but has no material yet — the gap is the signal.
 */
export function DayChip({ item, brand, size = "sm", onOpen, draggable = false }: ChipProps) {
  const t = useTranslations("Marcas");
  const tc = useTranslations("Marcas.content");
  const text = size === "sm" ? "text-[11px]" : "text-sm";
  const pad = size === "sm" ? "px-1.5 py-1" : "px-2.5 py-2";

  if (item.kind === "task") {
    const { task } = item;
    const overdue = isOverdue(task);
    return (
      <button
        type="button"
        onClick={onOpen}
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", task.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        title={`${brand?.name ?? ""} · ${task.title} · ${t(`status.${task.status}`)}`}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md border-l-[3px] bg-muted/70 text-left transition-colors hover:bg-muted",
          pad,
          text,
          draggable && "cursor-grab active:cursor-grabbing",
        )}
        style={{ borderLeftColor: brand?.color ?? "var(--border)" }}
      >
        <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_STYLE[task.status].dot)} aria-hidden />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-foreground",
            task.status === "hecho" && "text-muted-foreground line-through",
            overdue && "font-medium text-destructive",
          )}
        >
          {task.title}
        </span>
        {overdue ? <span className="sr-only">{t("overdue")}</span> : null}
      </button>
    );
  }

  const pieces = item.kind === "stories" ? item.pieces : [item.piece];
  const missing = pieces.some((p) => contentBucket(p.status) === "missing");
  const Icon =
    item.kind === "stories"
      ? CircleDashed
      : item.piece.formats.includes("reel")
        ? Clapperboard
        : item.piece.formats.includes("carrusel")
          ? Layers
          : ImageIcon;
  const label =
    item.kind === "stories"
      ? tc("storiesCount", { count: item.pieces.length })
      : item.piece.title || item.piece.copy.slice(0, 60) || tc("noCopy");
  const status = item.kind === "piece" ? tc(`status.${item.piece.status}`) : "";

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${brand?.name ?? ""} · ${label}${status ? ` · ${status}` : ""}`}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md border text-left transition-colors hover:bg-muted",
        pad,
        text,
        missing ? "border-dashed border-amber-500/60" : "border-border",
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: brand?.color }} aria-hidden />
      <Icon className={cn("shrink-0 text-muted-foreground", size === "sm" ? "size-3" : "size-4")} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-foreground">{label}</span>
      {size === "md" && status ? <span className="shrink-0 text-xs text-muted-foreground">{status}</span> : null}
    </button>
  );
}
