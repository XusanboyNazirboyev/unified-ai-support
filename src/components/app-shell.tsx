import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, BookOpen, Bot, Database, Inbox, LogOut, Plug } from "lucide-react";
import type { ReactNode } from "react";

import logo from "@/assets/javobchi-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/context";
import { conversationsQuery, settingsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/inbox", label: "nav.inbox", icon: Inbox },
  { to: "/agent", label: "nav.agent", icon: Bot },
  { to: "/knowledge", label: "nav.knowledge", icon: BookOpen },
  { to: "/crm", label: "nav.crm", icon: Database },
  { to: "/channels", label: "nav.channels", icon: Plug },
  { to: "/analytics", label: "nav.analytics", icon: BarChart3 },
] as const;

export function AppShell({ email, children }: { email: string; children: ReactNode }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { data: conversations } = useQuery(conversationsQuery);
  const { data: settings } = useQuery(settingsQuery);
  const pending = (conversations ?? []).filter((c) => c.status === "pending").length;

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { redirect: undefined } });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <aside className="flex shrink-0 flex-col bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-60">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <img src={logo} alt="Javobchi" width={36} height={36} className="size-9 rounded-lg bg-ink-foreground p-1" />
          <div className="mr-auto leading-tight">
            <div className="font-display text-lg font-bold text-sidebar-accent-foreground">Javobchi</div>
            <div className="text-[11px] text-sidebar-foreground/60">{t("shell.tagline")}</div>
          </div>
          <LanguageSwitcher className="border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground" />
        </div>

        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-1 md:flex-col md:overflow-visible md:pb-0">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
            >
              <item.icon className="size-4" />
              <span>{t(item.label)}</span>
              {item.to === "/inbox" && pending > 0 && (
                <span className="ml-auto rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[10px] font-bold text-sidebar-primary-foreground">
                  {pending}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="hidden border-t border-sidebar-border p-3 md:block">
          <Link
            to="/agent"
            className="mb-3 flex items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-2 text-xs"
          >
            <span
              className={cn(
                "size-2 rounded-full",
                settings?.is_live ? "bg-sidebar-primary animate-pulse" : "bg-sidebar-foreground/40",
              )}
            />
            <span className="font-medium text-sidebar-accent-foreground">
              {settings?.agent_name ?? "Agent"} {settings?.is_live ? t("shell.live") : t("shell.off")}
            </span>
          </Link>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-sidebar-foreground/60">{email}</span>
            <button
              onClick={signOut}
              className="rounded-md p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              aria-label={t("shell.signOut")}
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b bg-card px-6 py-5">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
