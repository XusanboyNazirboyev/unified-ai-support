import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, LegalSection } from "@/components/legal-page";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/locales";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Maxfiylik siyosati — Javobchi" },
      { name: "description", content: "Javobchi mijoz xabarlari, Instagram va Telegram ma'lumotlarini qanday ishlatishi va saqlashi." },
      { property: "og:title", content: "Maxfiylik siyosati — Javobchi" },
      { property: "og:description", content: "Javobchi qaysi ma'lumotlarni yig'adi, nima uchun ishlatadi va qanday o'chiriladi." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

const SECTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

function PrivacyPage() {
  const { t } = useI18n();
  return (
    <LegalPage title={t("privacy.title")}>
      <p>{t("privacy.intro")}</p>
      {SECTIONS.map((n) => (
        <LegalSection key={n} title={t(`privacy.s${n}.title` as MessageKey)} text={t(`privacy.s${n}.text` as MessageKey)} />
      ))}
    </LegalPage>
  );
}
