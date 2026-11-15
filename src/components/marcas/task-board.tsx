"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DONE_VISIBLE_DAYS, groupTasksByStatus } from "@/lib/marcas/board";
import {
  TASK_STATUSES,
  type MarcasBrand,
  type MarcasMember,
  type MarcasTask,
  type MarcasTaskPatch,
  type NewMarcasTask,
} from "@/lib/marcas/types";
import { STATUS_STYLE } from "./status-style";
import { TaskCard } from "./task-card";
import { TaskDialog } from "./task-dialog";

interface TaskBoardProps {
  tasks: MarcasTask[];
  brands: MarcasBrand[];
  members: MarcasMember[];
  /** Set on a brand's own page: new tasks go there and cards hide the brand chip. */
  brandId?: string;
  onAdd: (task: NewMarcasTask) => Promise<boolean>;
  onUpdate: (id: string, patch: MarcasTaskPatch) => void;
  onRemove: (id: string) => void;
}

/**
 * The four-column board. On a phone the columns scroll sideways one at
 * a time (snap) instead of squeezing four unreadable strips into the
 * width; from `lg` they sit side by side.
 */
export function TaskBoard({ tasks, brands, members, brandId, onAdd, onUpdate, onRemove }: TaskBoardProps) {
  const t = useTranslations("Marcas");
  const [title, setTitle] = useState("");
  const [newBrandId, setNewBrandId] = useState(brandId ?? "");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const groups = useMemo(() => groupTasksByStatus(tasks), [tasks]);
  const brandsById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const membersById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const openTask = openId ? tasks.find((x) => x.id === openId) : undefined;
  const targetBrand = brandId ?? newBrandId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !targetBrand || adding) return;
    setAdding(true);
    if (await onAdd({ brand_id: targetBrand, title })) setTitle("");
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        {!brandId ? (
          <select
            aria-label={t("edit.brand")}
            value={newBrandId}
            onChange={(e) => setNewBrandId(e.target.value)}
            className="rounded-md border border-border bg-muted px-2.5 py-2 text-sm text-foreground"
          >
            <option value="" disabled>
              {t("pickBrand")}
            </option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        ) : null}
        <Input
          value={title}
          maxLength={300}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("addPlaceholder")}
          aria-label={t("addPlaceholder")}
          className="min-w-0 flex-1 bg-muted text-foreground"
        />
        <Button type="submit" disabled={!title.trim() || !targetBrand || adding}>
          <Plus className="size-4" />
          {t("add")}
        </Button>
      </form>

      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
        {TASK_STATUSES.map((status) => (
          <section
            key={status}
            aria-label={t(`status.${status}`)}
            className="flex w-[82vw] max-w-sm shrink-0 snap-start flex-col gap-2 rounded-xl bg-muted/40 p-2.5 sm:w-72 lg:w-auto lg:max-w-none"
          >
            <header className="flex items-center gap-2 px-1 pt-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span className={cn("size-2 rounded-full", STATUS_STYLE[status].dot)} />
              {t(`status.${status}`)}
              <span className="ml-auto tabular-nums">{groups[status].length}</span>
            </header>
            {status === "hecho" ? (
              <p className="px-1 text-[11px] text-muted-foreground">
                {t("doneHint", { days: DONE_VISIBLE_DAYS })}
              </p>
            ) : null}
            {groups[status].length === 0 ? (
              <p className="px-1 py-3 text-xs text-muted-foreground/70">{t("emptyColumn")}</p>
            ) : (
              groups[status].map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  brand={brandsById.get(task.brand_id)}
                  assignee={task.assignee_id ? membersById.get(task.assignee_id) : undefined}
                  showBrand={!brandId}
                  onOpen={() => setOpenId(task.id)}
                />
              ))
            )}
          </section>
        ))}
      </div>

      {openTask ? (
        <TaskDialog
          key={openTask.id}
          task={openTask}
          brands={brands}
          members={members}
          onClose={() => setOpenId(null)}
          onSave={(patch) => onUpdate(openTask.id, patch)}
          onDelete={() => onRemove(openTask.id)}
        />
      ) : null}
    </div>
  );
}
