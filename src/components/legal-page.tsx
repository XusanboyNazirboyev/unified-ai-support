import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import logo from "@/assets/javobchi-logo.png";
import { LanguageSwitcher } from "@/components/language-switcher";

/** Shared frame for the public privacy and data deletion pages Meta links to. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={logo} alt="Javobchi" width={32} height={32} className="size-8" />
          <span className="font-display text-lg font-bold">Javobchi</span>
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="mx-auto max-w-3xl px-6 pb-16">
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <div className="mt-6 space-y-6 text-sm leading-relaxed text-muted-foreground">{children}</div>
      </main>
    </div>
  );
}

export function LegalSection({ title, text }: { title: string; text: string }) {
  return (
    <section>
      <h2 className="mb-1.5 font-display text-lg font-semibold text-foreground">{title}</h2>
      <p className="whitespace-pre-line">{text}</p>
    </section>
  );
}
