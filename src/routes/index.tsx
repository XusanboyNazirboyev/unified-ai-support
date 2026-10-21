import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Bot, Database, Headset, Inbox, LineChart } from "lucide-react";

import logo from "@/assets/javobchi-logo.png";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Javobchi — Telegram, Instagram, WhatsApp uchun AI agent" },
      {
        name: "description",
        content: "Mijozlarga bilimlar bazasi va CRM asosida tezkor, aniq javob beradigan AI agent. Yagona inbox va operatorga uzatish.",
      },
      { property: "og:title", content: "Javobchi — mijozlarga aniq javob beruvchi AI agent" },
      { property: "og:description", content: "Telegram, Instagram va WhatsApp suhbatlari bitta joyda, CRM bilan integratsiya." },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Inbox, title: "Yagona inbox", text: "Telegram, Instagram va WhatsApp suhbatlari bitta oynada." },
  { icon: Headset, title: "Operatorga uzatish", text: "Javob topilmasa yoki mijoz so'rasa — suhbat darhol odamga o'tadi." },
  { icon: Bot, title: "Xavfsiz sinov chati", text: "Jonli efirdan oldin agentni sinang va javob manbalarini ko'ring." },
  { icon: BookOpen, title: "Bilimlar bazasi", text: "FAQ, narxlar, qoidalar — agent faqat shulardan javob beradi." },
  { icon: Database, title: "CRM integratsiyasi", text: "Buyurtma statusi va mijoz ma'lumotini tasdiqlab, aniq aytadi." },
  { icon: LineChart, title: "Tahlillar", text: "Javob tezligi, AI hal qilgan suhbatlar ulushi, kanallar." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="Javobchi" width={36} height={36} className="size-9" />
          <span className="font-display text-xl font-bold">Javobchi</span>
        </div>
        <Button asChild variant="outline">
          <Link to="/inbox" search={{ c: undefined }}>Panelga kirish</Link>
        </Button>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-2">
        <div>
          <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
            Telegram · Instagram · WhatsApp
          </span>
          <h1 className="mt-5 text-5xl font-extrabold leading-[1.05] md:text-6xl">
            Mijozlarga 2 soniyada <span className="text-primary">aniq</span> javob.
          </h1>
          <p className="mt-5 max-w-lg text-lg text-muted-foreground">
            Javobchi umumiy savollarga bilimlar bazangizdan, buyurtma va shaxsiy savollarga esa CRM'ingizdan javob
            beradi. Bilmagan joyida — operatorga uzatadi.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth" search={{ redirect: undefined }}>Bepul boshlash</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link to="/agent">Sinov chatini ochish</Link>
            </Button>
          </div>
        </div>

        <div className="rounded-3xl bg-ink p-5 text-ink-foreground shadow-2xl">
          <div className="mb-4 flex items-center gap-2 text-xs text-ink-foreground/60">
            <span className="size-2 rounded-full bg-telegram" /> Telegram · Dilshod Karimov
          </div>
          <div className="space-y-3 text-sm">
            <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-ink-foreground/10 px-4 py-2.5">
              Assalomu alaykum! TM-1042 buyurtmam qachon keladi?
            </div>
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-accent-foreground">
              Va alaykum assalom, Dilshod! TM-1042 (Samsung Galaxy A56) hozir yo'lda — ertaga yetkaziladi.
            </div>
            <div className="flex justify-end gap-1.5 text-[11px] text-ink-foreground/60">
              <span className="rounded bg-ink-foreground/10 px-1.5 py-0.5">CRM · Buyurtma TM-1042</span>
              <span className="rounded bg-ink-foreground/10 px-1.5 py-0.5">Baza · Yetkazib berish</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-2xl border bg-card p-6">
            <f.icon className="size-6 text-primary" />
            <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
