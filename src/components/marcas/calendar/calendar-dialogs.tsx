"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MarcasBrand, NewMarcasTask } from "@/lib/marcas/types";
import { dayLabel } from "../content/content-style";
import { DayChip, dayItemKey, type DayItem } from "./day-items";

const FIELD = "w-full rounded-md border border-border bg-muted px-2.5 py-2 text-sm text-foreground";

/** New task on a given day — the calendar's "+" on each cell. */
export function QuickAddDialog({
  date,
  brands,
  defaultBrandId,
  onClose,
  onAdd,
}: {
  date: string;
  brands: MarcasBrand[];
  defaultBrandId: string;
  onClose: () => void;
  onAdd: (task: NewMarcasTask) => Promise<boolean>;
}) {
  const t = useTranslations("Marcas");
  const tCal = useTranslations("Marcas.calendar");
  const locale = useLocale();
  const [title, setTitle] = useState("");
  const [brandId, setBrandId] = useState(defaultBrandId);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !brandId || saving) return;
    setSaving(true);
    const ok = await onAdd({ brand_id: brandId, title, due_date: date });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tCal("addOn", { day: dayLabel(date, locale) })}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quick-add-title">{t("edit.task")}</Label>
            <Input
              id="quick-add-title"
              autoFocus
              value={title}
              maxLength={300}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-muted text-foreground"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quick-add-brand">{t("edit.brand")}</Label>
            <select id="quick-add-brand" value={brandId} onChange={(e) => setBrandId(e.target.value)} className={FIELD}>
              <option value="" disabled>
                {t("pickBrand")}
              </option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("edit.cancel")}
            </Button>
            <Button type="submit" disabled={!title.trim() || !brandId || saving}>
              <Plus className="size-4" />
              {t("add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Everything on one day, when the cell has more than fits. */
export function DayDialog({
  date,
  items,
  brandsById,
  onClose,
  onOpenItem,
  onAddHere,
}: {
  date: string;
  items: DayItem[];
  brandsById: Map<string, MarcasBrand>;
  onClose: () => void;
  onOpenItem: (item: DayItem) => void;
  onAddHere: () => void;
}) {
  const tCal = useTranslations("Marcas.calendar");
  const locale = useLocale();
  const brandOf = (item: DayItem) => brandsById.get(item.kind === "task" ? item.task.brand_id : item.brandId);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="capitalize">{dayLabel(date, locale)}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          {items.length === 0 ? <p className="text-sm text-muted-foreground">{tCal("emptyDay")}</p> : null}
          {items.map((item) => (
            <DayChip key={dayItemKey(item)} item={item} brand={brandOf(item)} size="md" onOpen={() => onOpenItem(item)} />
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onAddHere}>
            <Plus className="size-4" />
            {tCal("addTask")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
