"use client";

import { useTranslations } from "next-intl";
import { ImageOff, Layers, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentPiece } from "@/lib/marcas/content/types";
import { PIECE_STATUS_STYLE } from "./content-style";

/**
 * One planned piece: the cover is the first file of its Drive folder,
 * shown as Google's own thumbnail (loaded straight from Google — the CRM
 * stores and proxies nothing).
 */
export function ContentCard({ piece, onOpen }: { piece: ContentPiece; onOpen: () => void }) {
  const t = useTranslations("Marcas.content");
  const cover = piece.media.find((m) => m.thumbnail) ?? null;
  const isVideo = cover?.kind === "video";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-left shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="relative block aspect-[4/5] w-full bg-muted">
        {cover?.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed Google URL, not a static asset
          <img src={cover.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-3 text-center text-[11px] text-muted-foreground">
            <ImageOff className="size-5" aria-hidden />
            {piece.media.length > 0 ? t("processing") : t(`status.${piece.status}`)}
          </span>
        )}
        {isVideo ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-black/55 text-white">
              <Play className="size-5 translate-x-px" aria-hidden />
            </span>
          </span>
        ) : null}
        {piece.media.length > 1 ? (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
            <Layers className="size-3" aria-hidden />
            {piece.media.length}
          </span>
        ) : null}
      </span>
      <span className="flex flex-col gap-1.5 p-2.5">
        <span className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {piece.title || piece.copy.slice(0, 60)}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className={cn("rounded-full border px-1.5 py-0.5 font-medium", PIECE_STATUS_STYLE[piece.status])}>
            {t(`status.${piece.status}`)}
          </span>
          {piece.formats.map((f) => (
            <span key={f} className="rounded-full border border-border px-1.5 py-0.5 text-muted-foreground">
              {t(`format.${f}`)}
            </span>
          ))}
          {piece.time ? <span className="ml-auto text-muted-foreground">{piece.time}</span> : null}
        </span>
      </span>
    </button>
  );
}
