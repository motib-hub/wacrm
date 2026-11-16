"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { isHubLinkActive } from "@/lib/hub/nav";
import { MARCAS_SECTIONS, MARCAS_SECTION_HREFS } from "@/lib/marcas/sections";

/**
 * Title + section tabs on top of every Marcas page. The tabs repeat the
 * sidebar on purpose: on a phone the sidebar lives behind the menu
 * button, and switching between Tareas and Calendario should take one
 * tap, not three. They scroll sideways when they don't fit.
 */
export function MarcasSectionHeader({ children }: { children?: React.ReactNode }) {
  const t = useTranslations("Marcas");
  const tHub = useTranslations("Hub");
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <nav
          aria-label={t("title")}
          className="-mx-4 max-w-[100vw] overflow-x-auto px-4 sm:mx-0 sm:px-0"
        >
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
            {MARCAS_SECTIONS.map((s) => {
              const active = isHubLinkActive(s.href, pathname, MARCAS_SECTION_HREFS);
              return (
                <Link
                  key={s.key}
                  href={s.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tHub(`marcas.${s.key}`)}
                </Link>
              );
            })}
          </div>
        </nav>
        {children}
      </div>
    </div>
  );
}
