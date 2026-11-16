"use client";

import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { MarcasSectionHeader } from "../section-header";
import { useMarcasWorkspace } from "../use-marcas-workspace";
import { AllContentBoard } from "./all-content-board";

/** /marcas/contenido — section header plus the all-brands content board. */
export function MarcasContentPage() {
  const t = useTranslations("Marcas");
  const { brands, error } = useMarcasWorkspace(true);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <MarcasSectionHeader />
      {error ? (
        <p className="text-sm text-destructive">{t("loadError", { message: error })}</p>
      ) : !brands ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <AllContentBoard brands={brands} />
      )}
    </div>
  );
}
