"use client";

import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { useMarcasMember } from "@/hooks/use-marcas-member";
import type { MarcasMember } from "@/lib/marcas/types";

/**
 * Renders its children only for Marcas members. RLS already returns no
 * rows to outsiders; this just replaces an empty, confusing page with a
 * sentence that says what to ask for.
 */
export function MarcasGate({ children }: { children: (member: MarcasMember) => React.ReactNode }) {
  const t = useTranslations("Marcas");
  const { member, loading } = useMarcasMember();

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!member) {
    return <p className="mx-auto max-w-md py-16 text-center text-sm text-muted-foreground">{t("notMember")}</p>;
  }
  return <>{children(member)}</>;
}
