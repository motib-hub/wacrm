import type { PieceStatus } from "@/lib/marcas/content/types";

/**
 * Status chip colours. The two "something is missing" states are the
 * loud ones on purpose: the board's job is to show what is planned but
 * not produced yet.
 */
export const PIECE_STATUS_STYLE: Record<PieceStatus, string> = {
  publicada: "border-primary/40 bg-primary/10 text-primary",
  programada: "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300",
  lista: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  "sin-material": "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  "sin-pieza": "border-destructive/40 bg-destructive/10 text-destructive",
  "sin-acceso": "border-border bg-muted text-muted-foreground",
};

/** "2026-11-04" → "mié 4/11" in the board's locale, read as a calendar day. */
export function dayLabel(iso: string, locale: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString(locale, { weekday: "short" }).replace(".", "");
  return `${weekday} ${d}/${m}`;
}
