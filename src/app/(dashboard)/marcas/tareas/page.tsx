"use client";

import { MarcasGate } from "@/components/marcas/marcas-gate";
import { MarcasOverview } from "@/components/marcas/marcas-overview";

// Motib HUB → Marcas → Tareas: every brand's tasks on one board. A static
// segment, so it wins over the /marcas/[id] brand pages.
export default function MarcasTasksPage() {
  return <MarcasGate>{(member) => <MarcasOverview member={member} view="tasks" />}</MarcasGate>;
}
