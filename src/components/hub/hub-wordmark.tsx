"use client";

import { BRAND } from "@/lib/branding";
import { useMarcasMember } from "@/hooks/use-marcas-member";

/**
 * The sidebar's product name (fork-only). The agency team (Marcas
 * members) sees "MOTIB HUB" with the second word in the accent color;
 * client accounts keep seeing BRAND.name ("MOTIB CRM"). Until membership
 * resolves it holds the space without flashing either name.
 */
export function HubWordmark() {
  const { member, loading } = useMarcasMember();

  if (loading) return <span className="invisible">{BRAND.name}</span>;
  if (!member) return <>{BRAND.name}</>;

  return (
    <>
      {BRAND.hub.lead}{" "}
      <span style={{ color: BRAND.hub.accentColor }}>{BRAND.hub.accent}</span>
    </>
  );
}
