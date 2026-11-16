"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import { useTranslations } from "next-intl";
import {
  Briefcase,
  ChevronDown,
  Images,
  LayoutGrid,
  ListTodo,
  MessagesSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MARCAS_SECTIONS, type MarcasSectionKey } from "@/lib/marcas/sections";
import { useMarcasMember } from "@/hooks/use-marcas-member";
import {
  HUB_COLLAPSED_STORAGE_KEY,
  hubGroups,
  isHubLinkActive,
  parseCollapsed,
  type HubGroupKey,
} from "@/lib/hub/nav";

/** Structural twin of the sidebar's own NavItem, so upstream's list fits as-is. */
interface HubNavItem {
  href: string;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  beta?: boolean;
}

interface HubNavProps {
  /** Upstream's CRM nav, handed in by the sidebar (never copied here). */
  crmItems: HubNavItem[];
  pathname: string;
  totalUnread: number;
  unreadNotifications: number;
}

const SECTION_ICON: Record<MarcasSectionKey, ComponentType<{ className?: string }>> = {
  clients: LayoutGrid,
  tasks: ListTodo,
  content: Images,
};

const MARCAS_ITEMS: HubNavItem[] = MARCAS_SECTIONS.map((s) => ({
  href: s.href,
  labelKey: s.key,
  icon: SECTION_ICON[s.key],
}));

const GROUP_ICON: Record<HubGroupKey, ComponentType<{ className?: string }>> = {
  marcas: Briefcase,
  crm: MessagesSquare,
};

/**
 * Motib HUB sidebar nav (fork-only): modules that fold open. Rendered by
 * the sidebar at its single fork seam; renders nothing for client
 * accounts, which keep upstream's flat nav.
 */
export function HubNav({ crmItems, pathname, totalUnread, unreadNotifications }: HubNavProps) {
  const tHub = useTranslations("Hub");
  const tSidebar = useTranslations("Sidebar");
  const { member } = useMarcasMember();
  const [collapsed, setCollapsed] = useState<Set<HubGroupKey>>(new Set());

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(parseCollapsed(window.localStorage.getItem(HUB_COLLAPSED_STORAGE_KEY)));
    } catch {
      // Storage blocked (private mode): every module simply starts open.
    }
  }, []);

  const groups = hubGroups(member?.role ?? null, MARCAS_ITEMS, crmItems);
  if (groups.length === 0) return null;

  const toggle = (key: HubGroupKey) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(HUB_COLLAPSED_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Not persisted; the toggle still works for this visit.
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => {
        const hrefs = group.items.map((i) => i.href);
        const hasActive = hrefs.some((h) => isHubLinkActive(h, pathname, hrefs));
        // A folded module still opens when you are inside it.
        const open = !collapsed.has(group.key) || hasActive;
        const GroupIcon = GROUP_ICON[group.key];
        const listId = `hub-group-${group.key}`;

        return (
          <div key={group.key}>
            <button
              type="button"
              onClick={() => toggle(group.key)}
              aria-expanded={open}
              aria-controls={listId}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              <GroupIcon className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">{tHub(`group.${group.key}`)}</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} />
            </button>

            {open ? (
              <ul id={listId} className="mt-0.5 flex flex-col gap-1">
                {group.items.map((item) => {
                  const isActive = isHubLinkActive(item.href, pathname, hrefs);
                  const label =
                    group.key === "marcas"
                      ? tHub(`marcas.${item.labelKey}`)
                      : item.href === "/dashboard"
                        ? tHub("crm.summary")
                        : tSidebar(item.labelKey);
                  const showUnreadDot = item.href === "/inbox" && totalUnread > 0 && !isActive;
                  const showNotificationBadge = item.href === "/notifications" && unreadNotifications > 0;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors lg:py-2",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{label}</span>
                        {item.beta ? (
                          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300">
                            {tSidebar("beta")}
                          </span>
                        ) : null}
                        {showUnreadDot ? (
                          <span
                            aria-label={tSidebar("unreadConversations", { count: totalUnread })}
                            className="relative flex h-2 w-2"
                          >
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                          </span>
                        ) : null}
                        {showNotificationBadge ? (
                          <span
                            aria-label={tSidebar("unreadNotifications", { count: unreadNotifications })}
                            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
                          >
                            {unreadNotifications > 9 ? "9+" : unreadNotifications}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
