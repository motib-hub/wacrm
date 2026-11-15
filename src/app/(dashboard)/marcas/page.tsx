"use client";

import { MarcasGate } from "@/components/marcas/marcas-gate";
import { MarcasOverview } from "@/components/marcas/marcas-overview";

// Fork-only module (Motib). Everything lives in src/components/marcas
// and src/lib/marcas; this file only mounts it.
export default function MarcasPage() {
  return <MarcasGate>{(member) => <MarcasOverview member={member} />}</MarcasGate>;
}
