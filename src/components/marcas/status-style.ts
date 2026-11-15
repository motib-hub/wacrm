import type { TaskStatus } from "@/lib/marcas/types";

/**
 * One accent per board column, shared by the column header, the status
 * picker and the brand-card counters so a colour always means the same
 * state. Theme-token based where the meaning is neutral ("hacer"), fixed
 * hues where the state itself is the signal.
 */
export const STATUS_STYLE: Record<TaskStatus, { dot: string; chip: string }> = {
  hacer: {
    dot: "bg-muted-foreground",
    chip: "border-border bg-muted text-foreground",
  },
  curso: {
    dot: "bg-amber-500",
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  },
  cliente: {
    dot: "bg-sky-500",
    chip: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  },
  hecho: {
    dot: "bg-primary",
    chip: "border-primary/40 bg-primary/10 text-primary",
  },
};
