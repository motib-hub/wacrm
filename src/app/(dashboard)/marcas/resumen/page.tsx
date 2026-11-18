"use client";

import { MarcasGate } from "@/components/marcas/marcas-gate";
import { MarcasSummaryPage } from "@/components/marcas/summary/marcas-summary-page";

// Motib HUB → Marcas → Resumen: Instagram planned vs published, today,
// what's missing this week and the tasks that are due.
export default function MarcasSummaryRoute() {
  return <MarcasGate>{() => <MarcasSummaryPage />}</MarcasGate>;
}
