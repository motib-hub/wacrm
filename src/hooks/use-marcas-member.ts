"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchOwnMembership } from "@/lib/marcas/api";
import type { MarcasMember } from "@/lib/marcas/types";

/**
 * The signed-in user's Marcas membership (fork-only module).
 *
 * The sidebar and the dashboard shell both need it on every page, so the
 * lookup is cached per user id for the life of the tab: one tiny query,
 * not one per component. `loading` stays true until the first answer so
 * the shell can hold its redirect decision instead of flashing the CRM.
 */

const cache = new Map<string, Promise<MarcasMember | null>>();

export function useMarcasMember(): { member: MarcasMember | null; loading: boolean } {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<{ userId: string | null; member: MarcasMember | null }>({
    userId: null,
    member: null,
  });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let pending = cache.get(userId);
    if (!pending) {
      pending = fetchOwnMembership(createClient(), userId);
      cache.set(userId, pending);
    }
    pending.then((member) => {
      if (!cancelled) setState({ userId, member });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const resolved = userId !== null && state.userId === userId;
  return { member: resolved ? state.member : null, loading: Boolean(userId) && !resolved };
}
