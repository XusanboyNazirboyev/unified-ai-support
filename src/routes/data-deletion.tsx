import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, LegalSection } from "@/components/legal-page";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/data-deletion")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search["code"] === "string" ? (search["code"] as string).slice(0, 40) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Ma'lumotlarni o'chirish — Javobchi" },
      { name: "description", content: "Javobchi'dagi Instagram va boshqa ma'lumotlaringizni qanday o'chirish mumkin." },
      { property: "og:title", content: "Ma'lumotlarni o'chirish — Javobchi" },
      { property: "og:description", content: "Instagram ulanishi, postlar va suhbatlarni o'chirish yo'riqnomasi." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DataDeletionPage,
});

function DataDeletionPage() {
  const { t } = useI18n();
  const { code } = Route.useSearch();
  return (
    <LegalPage title={t("deletion.title")}>
      {code && <p className="rounded-lg border bg-card p-3 text-foreground">{t("deletion.done", { code })}</p>}
      <p>{t("deletion.intro")}</p>
      <LegalSection title={t("deletion.s1.title")} text={t("deletion.s1.text")} />
      <LegalSection title={t("deletion.s2.title")} text={t("deletion.s2.text")} />
      <LegalSection title={t("deletion.s3.title")} text={t("deletion.s3.text")} />
    </LegalPage>
  );
}
