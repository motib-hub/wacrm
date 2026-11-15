"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { createTask, deleteTask, fetchTasks, updateTask } from "@/lib/marcas/api";
import type { MarcasTask, MarcasTaskPatch, NewMarcasTask } from "@/lib/marcas/types";

/**
 * Task list state for one board (all brands, or one brand).
 *
 * Edits are optimistic — moving a card has to feel instant on a phone —
 * and roll back with a toast when the database (RLS included) refuses.
 */
export function useMarcasTasks(brandId?: string) {
  const t = useTranslations("Marcas");
  const [tasks, setTasks] = useState<MarcasTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setTasks(await fetchTasks(createClient(), brandId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [brandId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  const fail = useCallback(
    (err: unknown) => toast.error(t("saveError", { message: err instanceof Error ? err.message : String(err) })),
    [t],
  );

  const add = useCallback(
    async (task: NewMarcasTask) => {
      try {
        const created = await createTask(createClient(), task);
        setTasks((prev) => [created, ...(prev ?? [])]);
        return true;
      } catch (err) {
        fail(err);
        return false;
      }
    },
    [fail],
  );

  const update = useCallback(
    async (id: string, patch: MarcasTaskPatch) => {
      const before = tasks;
      setTasks((prev) => prev?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? prev);
      try {
        const saved = await updateTask(createClient(), id, patch);
        setTasks((prev) => prev?.map((x) => (x.id === id ? saved : x)) ?? prev);
      } catch (err) {
        setTasks(before);
        fail(err);
      }
    },
    [tasks, fail],
  );

  const remove = useCallback(
    async (id: string) => {
      const before = tasks;
      setTasks((prev) => prev?.filter((x) => x.id !== id) ?? prev);
      try {
        await deleteTask(createClient(), id);
      } catch (err) {
        setTasks(before);
        fail(err);
      }
    },
    [tasks, fail],
  );

  return { tasks, error, add, update, remove, reload };
}
