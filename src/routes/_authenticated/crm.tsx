import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatSum, normalizeOrderNumber, ORDER_STATUSES } from "@/lib/agent-rules";
import { customersQuery, ordersQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/crm")({
  head: () => ({
    meta: [
      { title: "CRM integratsiyasi — Javobchi" },
      { name: "description", content: "Mijozlar va buyurtmalar — AI agent buyurtma holati va shaxsiy savollarga shu yerdan javob beradi." },
      { property: "og:title", content: "CRM — Javobchi" },
      { property: "og:description", content: "Mijoz buyurtmalari va statusini AI agent CRM'dan tekshiradi." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(customersQuery),
      context.queryClient.ensureQueryData(ordersQuery),
    ]),
  component: CrmPage,
});

const PROVIDERS = [
  { name: "Ichki CRM", note: "Faol · Javobchi ichida", active: true },
  { name: "amoCRM", note: "Keyingi bosqichda", active: false },
  { name: "Bitrix24", note: "Keyingi bosqichda", active: false },
  { name: "HubSpot", note: "Keyingi bosqichda", active: false },
];

function statusVariant(status: string) {
  if (status === "yetkazildi") return "bg-success/15 text-success";
  if (status === "bekor qilindi") return "bg-destructive/12 text-destructive";
  if (status === "yo'lda") return "bg-telegram/15 text-telegram";
  return "bg-warning/25 text-warning-foreground";
}

function CrmPage() {
  const queryClient = useQueryClient();
  const { data: customers } = useSuspenseQuery(customersQuery);
  const { data: orders } = useSuspenseQuery(ordersQuery);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [cForm, setCForm] = useState({ full_name: "", phone: "", telegram_username: "", instagram_handle: "", city: "" });
  const [oForm, setOForm] = useState({ customer_id: "", order_number: "", items: "", total: "", expected_delivery: "" });

  const nameOf = (id: string) => customers.find((c) => c.id === id)?.full_name ?? "—";

  async function addCustomer() {
    if (!cForm.full_name.trim() || !cForm.phone.trim()) { toast.error("Ism va telefonni kiriting"); return; }
    const { error } = await supabase.from("crm_customers").insert({
      full_name: cForm.full_name.trim(),
      phone: cForm.phone.trim(),
      whatsapp_phone: cForm.phone.trim(),
      telegram_username: cForm.telegram_username.replace(/^@/, "").trim() || null,
      instagram_handle: cForm.instagram_handle.replace(/^@/, "").trim() || null,
      city: cForm.city.trim() || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Mijoz qo'shildi");
    setCustomerOpen(false);
    setCForm({ full_name: "", phone: "", telegram_username: "", instagram_handle: "", city: "" });
    queryClient.invalidateQueries({ queryKey: ["crm_customers"] });
  }

  async function addOrder() {
    if (!oForm.customer_id || !oForm.order_number.trim()) { toast.error("Mijoz va buyurtma raqamini kiriting"); return; }
    const { error } = await supabase.from("crm_orders").insert({
      customer_id: oForm.customer_id,
      order_number: normalizeOrderNumber(oForm.order_number),
      items: oForm.items.trim(),
      total: Number(oForm.total.replace(/\s/g, "")) || 0,
      expected_delivery: oForm.expected_delivery || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Buyurtma qo'shildi");
    setOrderOpen(false);
    setOForm({ customer_id: "", order_number: "", items: "", total: "", expected_delivery: "" });
    queryClient.invalidateQueries({ queryKey: ["crm_orders"] });
  }

  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("crm_orders").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Status yangilandi — AI agent endi yangi statusni aytadi");
    queryClient.invalidateQueries({ queryKey: ["crm_orders"] });
  }

  return (
    <div>
      <PageHeader
        title="CRM integratsiyasi"
        description="Buyurtma holati, yetkazish sanasi va shaxsiy ma'lumotlar haqidagi savollarga AI agent aynan shu ma'lumotlardan javob beradi."
      />
      <div className="space-y-6 p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PROVIDERS.map((p) => (
            <div key={p.name} className={`rounded-2xl border p-4 ${p.active ? "border-primary bg-secondary" : "bg-card"}`}>
              <div className="flex items-center justify-between">
                <span className="font-display font-semibold">{p.name}</span>
                {p.active ? (
                  <CheckCircle2 className="size-5 text-primary" />
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    Tez orada
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{p.note}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="orders">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="orders">Buyurtmalar ({orders.length})</TabsTrigger>
              <TabsTrigger value="customers">Mijozlar ({customers.length})</TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCustomerOpen(true)}>
                <Plus className="size-4" /> Mijoz
              </Button>
              <Button onClick={() => setOrderOpen(true)}>
                <Plus className="size-4" /> Buyurtma
              </Button>
            </div>
          </div>

          <TabsContent value="orders" className="mt-4 overflow-hidden rounded-2xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Raqam</TableHead>
                  <TableHead>Mijoz</TableHead>
                  <TableHead>Mahsulot</TableHead>
                  <TableHead>Summa</TableHead>
                  <TableHead>Yetkazish</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-semibold">{o.order_number}</TableCell>
                    <TableCell>{nameOf(o.customer_id)}</TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">{o.items}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatSum(o.total, o.currency)}</TableCell>
                    <TableCell className="whitespace-nowrap">{o.expected_delivery ?? "—"}</TableCell>
                    <TableCell>
                      <Select value={o.status} onValueChange={(v) => setStatus(o.id, v)}>
                        <SelectTrigger className={`h-7 w-40 border-0 text-xs font-medium ${statusVariant(o.status)}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ORDER_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="customers" className="mt-4 overflow-hidden rounded-2xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ism</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Telegram</TableHead>
                  <TableHead>Instagram</TableHead>
                  <TableHead>Shahar</TableHead>
                  <TableHead>Segment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-semibold">{c.full_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{c.phone}</TableCell>
                    <TableCell>{c.telegram_username ? `@${c.telegram_username}` : "—"}</TableCell>
                    <TableCell>{c.instagram_handle ? `@${c.instagram_handle}` : "—"}</TableCell>
                    <TableCell>{c.city ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.segment}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={customerOpen} onOpenChange={setCustomerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yangi mijoz</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["full_name", "To'liq ism"],
                ["phone", "Telefon (+998...)"],
                ["telegram_username", "Telegram username"],
                ["instagram_handle", "Instagram"],
                ["city", "Shahar"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`c-${key}`}>{label}</Label>
                <Input id={`c-${key}`} value={cForm[key]} onChange={(e) => setCForm({ ...cForm, [key]: e.target.value })} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={addCustomer}>Qo'shish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yangi buyurtma</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Mijoz</Label>
              <Select value={oForm.customer_id} onValueChange={(v) => setOForm({ ...oForm, customer_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Tanlang" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="o-num">Buyurtma raqami</Label>
                <Input id="o-num" placeholder="TM-1060" value={oForm.order_number} onChange={(e) => setOForm({ ...oForm, order_number: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-total">Summa (so'm)</Label>
                <Input id="o-total" inputMode="numeric" value={oForm.total} onChange={(e) => setOForm({ ...oForm, total: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-items">Mahsulotlar</Label>
              <Input id="o-items" value={oForm.items} onChange={(e) => setOForm({ ...oForm, items: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-date">Kutilayotgan yetkazish sanasi</Label>
              <Input id="o-date" type="date" value={oForm.expected_delivery} onChange={(e) => setOForm({ ...oForm, expected_delivery: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={addOrder}>Qo'shish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
