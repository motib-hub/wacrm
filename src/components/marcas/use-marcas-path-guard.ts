"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMarcasMember } from "@/hooks/use-marcas-member";
import { isPathAllowedForRole } from "@/lib/marcas/board";

/**
 * Keeps `equipo` members inside Marcas. Their CRM account is a personal,
 * empty one (the CRM gives every user one); none of its WhatsApp screens
 * are part of their job, so any other route sends them to /marcas.
 *
 * This is navigation, not security: RLS is what keeps them out of every
 * other account's data. Returns true while a redirect is pending so the
 * shell can skip rendering the page being left.
 */
export function useMarcasPathGuard(): boolean {
  const { member, loading } = useMarcasMember();
  const pathname = usePathname();
  const router = useRouter();
  const blocked = !loading && !isPathAllowedForRole(pathname, member?.role ?? null);

  useEffect(() => {
    if (blocked) router.replace("/marcas");
  }, [blocked, router]);

  return blocked;
}
