"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchBrands, fetchMembers } from "@/lib/marcas/api";
import type { MarcasBrand, MarcasMember } from "@/lib/marcas/types";

/** Brands the caller can see (RLS decides) and the team roster. */
export function useMarcasWorkspace(enabled: boolean) {
  const [brands, setBrands] = useState<MarcasBrand[] | null>(null);
  const [members, setMembers] = useState<MarcasMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const db = createClient();
    Promise.all([fetchBrands(db), fetchMembers(db)])
      .then(([b, m]) => {
        if (cancelled) return;
        setBrands(b);
        setMembers(m);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { brands, members, error };
}
