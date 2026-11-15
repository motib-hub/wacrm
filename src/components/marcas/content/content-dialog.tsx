"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ContentPiece } from "@/lib/marcas/content/types";
import { PIECE_STATUS_STYLE, dayLabel } from "./content-style";

/**
 * A piece up close: every file of its folder (videos play in Drive's own
 * player, which respects the file's sharing), the copy as the sheet has
 * it, and links back to where the team edits it.
 */
export function ContentDialog({ piece, onClose }: { piece: ContentPiece; onClose: () => void }) {
  const t = useTranslations("Marcas.content");
  const locale = useLocale();
  const [index, setIndex] = useState(0);
  const current = piece.media[index];

  const external =
    piece.link?.kind === "instagram"
      ? { href: piece.link.url, label: t("openPost") }
      : piece.link?.kind === "drive-folder"
        ? { href: piece.link.url, label: t("openFolder") }
        : piece.link
          ? { href: piece.link.url, label: t("openFile") }
          : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-border bg-popover sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6">{piece.title || t("noCopy")}</DialogTitle>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {piece.date ? <span>{dayLabel(piece.date, locale)}</span> : <span>{t("undated")}</span>}
            {piece.time ? <span>· {piece.time}</span> : null}
            <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-medium", PIECE_STATUS_STYLE[piece.status])}>
              {t(`status.${piece.status}`)}
            </span>
            {piece.formats.map((f) => (
              <span key={f} className="rounded-full border border-border px-1.5 py-0.5 text-[10px]">
                {t(`format.${f}`)}
              </span>
            ))}
          </p>
        </DialogHeader>

        {current ? (
          <div className="flex flex-col gap-2">
            <div className="overflow-hidden rounded-lg bg-muted">
              {current.kind === "video" ? (
                <iframe
                  key={current.id}
                  src={`https://drive.google.com/file/d/${current.id}/preview`}
                  title={current.name}
                  allow="autoplay"
                  className="aspect-[9/16] max-h-[60vh] w-full"
                />
              ) : current.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed Google URL
                <img src={current.thumbnail.replace(/=s\d+$/, "=s1400")} alt={current.name} className="mx-auto max-h-[60vh] w-auto object-contain" referrerPolicy="no-referrer" />
              ) : (
                <p className="p-8 text-center text-sm text-muted-foreground">{t("processing")}</p>
              )}
            </div>
            {piece.media.length > 1 ? (
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {piece.media.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={m.name}
                    aria-pressed={i === index}
                    className={cn("size-14 shrink-0 overflow-hidden rounded-md border-2 bg-muted", i === index ? "border-primary" : "border-transparent")}
                  >
                    {m.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed Google URL
                      <img src={m.thumbnail} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <Section label={t("copy")} text={piece.copy || t("noCopy")} muted={!piece.copy} />
        {piece.story ? <Section label={t("story")} text={piece.story} /> : null}
        {piece.notes ? <Section label={t("notes")} text={piece.notes} /> : null}

        {external ? (
          <a
            href={external.href}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            {external.label}
            <ExternalLink className="size-3.5 text-muted-foreground" />
          </a>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Section({ label, text, muted = false }: { label: string; text: string; muted?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <p className={cn("whitespace-pre-line text-sm", muted ? "text-muted-foreground" : "text-foreground")}>{text}</p>
    </div>
  );
}
