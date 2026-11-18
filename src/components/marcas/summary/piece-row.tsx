"use client";

import { useTranslations } from "next-intl";
import { Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { isStoryPiece } from "@/lib/marcas/content/buckets";
import { PIECE_STATUS_STYLE } from "../content/content-style";
import type { BrandPiece } from "../content/use-all-brands-content";

/** One content piece as a compact, tappable line (summary lists). */
export function PieceRow({ bp, brandName, day, onOpen }: { bp: BrandPiece; brandName: string; day?: string; onOpen: () => void }) {
  const t = useTranslations("Marcas.content");
  const { piece } = bp;
  const manual = piece.media.filter((m) => m.manual).length;
  const label = isStoryPiece(piece)
    ? t("storiesCount", { count: Math.max(1, piece.media.length) })
    : piece.title || piece.copy.slice(0, 60) || piece.formats.map((f) => t(`format.${f}`)).join(" · ");

  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-2 py-2 text-left text-sm hover:bg-muted/40">
        {day ? <span className="w-16 shrink-0 text-xs text-muted-foreground">{day}</span> : null}
        <span className="w-24 shrink-0 truncate text-xs font-medium text-muted-foreground">{brandName}</span>
        <span className="min-w-0 flex-1 truncate text-foreground">{label}</span>
        {manual > 0 ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
            title={t("manualHint")}
          >
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
