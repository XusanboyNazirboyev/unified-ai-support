import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import "@lovable.dev/cloud-auth-js/styles.css";

import logo from "@/assets/javobchi-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/context";

function safeRedirect(value: unknown): string {
  if (typeof value !== "string") return "/inbox";
  try {
    const url = new URL(value, "http://local");
    const path = url.pathname + url.search;
    return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/auth") ? path : "/inbox";
  } catch {
    return "/inbox";
  }
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search["redirect"] === "string" ? (search["redirect"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Kirish — Javobchi" },
      { name: "description", content: "Javobchi AI qo'llab-quvvatlash paneliga kiring yoki bepul ro'yxatdan o'ting." },
      { property: "og:title", content: "Kirish — Javobchi" },
      { property: "og:description", content: "Javobchi AI qo'llab-quvvatlash paneliga kiring." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const { t } = useI18n();
  const target = safeRedirect(redirect);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (redirect) sessionStorage.setItem("javobchi_redirect", target);
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) {
        const stored = sessionStorage.getItem("javobchi_redirect");
        sessionStorage.removeItem("javobchi_redirect");
        navigate({ href: safeRedirect(stored ?? target) });
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        const stored = sessionStorage.getItem("javobchi_redirect");
        sessionStorage.removeItem("javobchi_redirect");
        navigate({ href: safeRedirect(stored ?? target) });
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate, redirect, target]);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error(error.message === "Invalid login credentials" ? t("auth.badCredentials") : error.message);
  }

  async function signUp(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error(t("auth.passwordShort"));
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) toast.success(t("auth.checkEmail"));
  }

  async function oauth(provider: "google" | "lovable") {
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: `${window.location.origin}/auth` });
    if (result.error) toast.error(t("auth.oauthError"));
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-ink-foreground lg:flex">
        <div className="bg-grid absolute inset-0 opacity-40" />
        <Link to="/" className="relative flex items-center gap-2.5">
          <img src={logo} alt="" width={40} height={40} className="size-10 rounded-xl bg-ink-foreground p-1" />
          <span className="font-display text-xl font-bold">Javobchi</span>
        </Link>
        <div className="relative max-w-md">
          <p className="font-display text-3xl font-bold leading-tight">{t("auth.quote")}</p>
          <p className="mt-4 text-sm text-ink-foreground/70">{t("auth.lead")}</p>
        </div>
        <div className="relative text-xs text-ink-foreground/50">© 2026 Javobchi</div>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between">
            <img src={logo} alt="Javobchi" width={44} height={44} className="size-11 lg:invisible" />
            <LanguageSwitcher />
          </div>
          <h1 className="text-2xl font-bold">{t("auth.welcome")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.demoNote")}</p>

          <div className="mt-6 space-y-2">
            <button type="button" className="lovable-auth-button w-full" onClick={() => oauth("lovable")}>
              {t("auth.lovable")}
            </button>
            <Button type="button" variant="outline" className="w-full" onClick={() => oauth("google")}>
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                <path fill="currentColor" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.68 3.7 14.55 2.75 12 2.75 6.9 2.75 2.75 6.9 2.75 12s4.15 9.25 9.25 9.25c5.34 0 8.88-3.75 8.88-9.04 0-.6-.07-1.06-.15-1.51z" />
              </svg>
              {t("auth.google")}
            </Button>
          </div>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> {t("auth.orEmail")} <div className="h-px flex-1 bg-border" />
          </div>

          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">{t("auth.signIn")}</TabsTrigger>
              <TabsTrigger value="signup">{t("auth.signUp")}</TabsTrigger>
            </TabsList>
            {(["signin", "signup"] as const).map((mode) => (
              <TabsContent key={mode} value={mode}>
                <form onSubmit={mode === "signin" ? signIn : signUp} className="mt-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${mode}-email`}>{t("auth.email")}</Label>
                    <Input
                      id={`${mode}-email`}
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${mode}-password`}>{t("auth.password")}</Label>
                    <Input
                      id={`${mode}-password`}
                      type="password"
                      required
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {mode === "signin" ? t("auth.signIn") : t("auth.createAccount")}
                  </Button>
                </form>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
