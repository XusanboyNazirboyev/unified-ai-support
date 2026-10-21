import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { KB_CATEGORIES } from "@/lib/agent-rules";
import { kbQuery, type KbArticle } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({
    meta: [
      { title: "Bilimlar bazasi — Javobchi" },
      { name: "description", content: "Kompaniya FAQ, narxlar, qoidalar va hujjatlar — AI agent javoblari manbai." },
      { property: "og:title", content: "Bilimlar bazasi — Javobchi" },
      { property: "og:description", content: "AI agent umumiy savollarga shu bazadan javob beradi." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(kbQuery),
  component: KnowledgePage,
});

type Draft = { id?: string; title: string; category: string; content: string };
const EMPTY: Draft = { title: "", category: "faq", content: "" };

function KnowledgePage() {
  const queryClient = useQueryClient();
  const { data: articles } = useSuspenseQuery(kbQuery);
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);

  const filtered = articles.filter(
    (a) =>
      (category === "all" || a.category === category) &&
      (!search || (a.title + " " + a.content).toLowerCase().includes(search.toLowerCase())),
  );

  async function save() {
    if (!draft || !draft.title.trim() || !draft.content.trim()) {
      toast.error("Sarlavha va matnni kiriting");
      return;
    }
    const payload = { title: draft.title.trim(), category: draft.category, content: draft.content.trim() };
    const { error } = draft.id
      ? await supabase
          .from("kb_articles")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", draft.id)
      : await supabase.from("kb_articles").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(draft.id ? "Maqola yangilandi" : "Maqola qo'shildi");
    setDraft(null);
    queryClient.invalidateQueries({ queryKey: ["kb_articles"] });
  }

  async function remove(article: KbArticle) {
    if (!confirm(`"${article.title}" o'chirilsinmi?`)) return;
    const { error } = await supabase.from("kb_articles").delete().eq("id", article.id);
    if (error) { toast.error(error.message); return; }
    toast.success("O'chirildi");
    queryClient.invalidateQueries({ queryKey: ["kb_articles"] });
  }

  const label = (value: string) => KB_CATEGORIES.find((c) => c.value === value)?.label ?? value;

  return (
    <div>
      <PageHeader
        title="Bilimlar bazasi"
        description="AI agent umumiy savollarga faqat shu yerdagi ma'lumotlar asosida javob beradi. Narx yoki qoida o'zgarsa — shu yerda yangilang."
        actions={
          <Button onClick={() => setDraft(EMPTY)}>
            <Plus className="size-4" /> Yangi maqola
          </Button>
        }
      />
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          {[{ value: "all", label: "Barchasi" }, ...KB_CATEGORIES].map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                category === c.value ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
              )}
            >
              {c.label}{" "}
              <span className="opacity-60">
                {c.value === "all" ? articles.length : articles.filter((a) => a.category === c.value).length}
              </span>
            </button>
          ))}
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Qidirish" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((a) => (
            <article key={a.id} className="group flex flex-col rounded-2xl border bg-card p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                    {label(a.category)}
                  </span>
                  <h3 className="mt-1 text-lg font-semibold leading-snug">{a.title}</h3>
                </div>
                <div className="flex gap-1 opacity-60 group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Tahrirlash"
                    onClick={() => setDraft({ id: a.id, title: a.title, category: a.category, content: a.content })}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="O'chirish" onClick={() => remove(a)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <p className="mt-3 line-clamp-6 text-sm text-muted-foreground">{a.content}</p>
            </article>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              Maqolalar topilmadi
            </div>
          )}
        </div>
      </div>

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Maqolani tahrirlash" : "Yangi maqola"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="kb-title">Sarlavha</Label>
                <Input id="kb-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Bo'lim</Label>
                <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KB_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kb-content">Matn</Label>
                <Textarea
                  id="kb-content"
                  rows={9}
                  value={draft.content}
                  onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                  placeholder="Aniq faktlar, narxlar va shartlarni yozing — agent aynan shularni ishlatadi."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Bekor qilish
            </Button>
            <Button onClick={save}>Saqlash</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
