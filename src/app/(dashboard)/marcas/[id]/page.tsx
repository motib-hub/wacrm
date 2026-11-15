"use client";

import { useParams } from "next/navigation";
import { MarcasGate } from "@/components/marcas/marcas-gate";
import { BrandWorkspace } from "@/components/marcas/brand-workspace";

export default function MarcasBrandPage() {
  const { id } = useParams<{ id: string }>();
  return <MarcasGate>{() => <BrandWorkspace brandId={id} />}</MarcasGate>;
}
