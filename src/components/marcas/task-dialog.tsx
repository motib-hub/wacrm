"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TASK_STATUSES, type MarcasBrand, type MarcasMember, type MarcasTask, type MarcasTaskPatch } from "@/lib/marcas/types";
import { STATUS_STYLE } from "./status-style";

interface TaskDialogProps {
  task: MarcasTask;
  brands: MarcasBrand[];
  members: MarcasMember[];
  onClose: () => void;
  onSave: (patch: MarcasTaskPatch) => void;
  onDelete: () => void;
}

const FIELD = "w-full rounded-md border border-border bg-muted px-2.5 py-2 text-sm text-foreground";

/**
 * Everything about one task in a single sheet. Status is a row of four
 * buttons rather than a dropdown: moving a card is the most frequent
 * edit by far, so it takes one tap, not two.
 */
export function TaskDialog({ task, brands, members, onClose, onSave, onDelete }: TaskDialogProps) {
  const t = useTranslations("Marcas");
  const [title, setTitle] = useState(task.title);
  const [status, setStatus] = useState(task.status);
  const [assigneeId, setAssigneeId] = useState(task.assignee_id ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [brandId, setBrandId] = useState(task.brand_id);
  const [confirming, setConfirming] = useState(false);

  const save = () => {
    const patch: MarcasTaskPatch = {};
    if (title.trim() && title.trim() !== task.title) patch.title = title;
    if (status !== task.status) patch.status = status;
    if ((assigneeId || null) !== task.assignee_id) patch.assignee_id = assigneeId || null;
    if ((dueDate || null) !== task.due_date) patch.due_date = dueDate || null;
    if (brandId !== task.brand_id) patch.brand_id = brandId;
    if (Object.keys(patch).length > 0) onSave(patch);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("edit.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="marcas-task-title">{t("edit.task")}</Label>
            <Input
              id="marcas-task-title"
              value={title}
              maxLength={300}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-muted text-foreground"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("edit.status")}</span>
            <div className="grid grid-cols-2 gap-2">
              {TASK_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  aria-pressed={status === s}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors",
                    status === s ? STATUS_STYLE[s].chip : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  <span className={cn("size-2 shrink-0 rounded-full", STATUS_STYLE[s].dot)} />
                  {t(`status.${s}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="marcas-task-assignee">{t("edit.assignee")}</Label>
              <select
                id="marcas-task-assignee"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className={FIELD}
              >
                <option value="">{t("edit.unassigned")}</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="marcas-task-due">{t("edit.due")}</Label>
              <input
                id="marcas-task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={FIELD}
              />
            </div>
          </div>

          {brands.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="marcas-task-brand">{t("edit.brand")}</Label>
              <select
                id="marcas-task-brand"
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className={FIELD}
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          {confirming ? (
            <Button
              variant="destructive"
              onClick={() => {
                onDelete();
                onClose();
              }}
            >
              {t("edit.confirmDelete")}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)} aria-label={t("edit.delete")}>
              <Trash2 className="size-4" />
              {t("edit.delete")}
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t("edit.cancel")}
            </Button>
            <Button onClick={save}>{t("edit.save")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
