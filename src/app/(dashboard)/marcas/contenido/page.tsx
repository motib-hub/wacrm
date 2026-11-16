"use client";

import { MarcasGate } from "@/components/marcas/marcas-gate";
import { MarcasContentPage } from "@/components/marcas/content/marcas-content-page";

// Motib HUB → Marcas → Contenido: every brand's content plan together.
export default function MarcasContentRoute() {
  return <MarcasGate>{() => <MarcasContentPage />}</MarcasGate>;
}
