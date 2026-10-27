import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectLearnx, disconnectLearnx, getLearnxIntegration } from "@/lib/integrations.functions";
import { useI18n } from "@/lib/i18n/context";

const ERRORS = {
  bad_url: "crm.learnx.err.bad_url",
  unreachable: "crm.learnx.err.unreachable",
  unauthorized: "crm.learnx.err.unauthorized",
  bad_response: "crm.learnx.err.bad_response",
} as const;

export function LearnxConnect() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fetchIntegration = useServerFn(getLearnxIntegration);
  const connect = useServerFn(connectLearnx);
  const disconnect = useServerFn(disconnectLearnx);
  const { data: integration, isLoading } = useQuery({ queryKey: ["learnx"], queryFn: () => fetchIntegration() });
  const [form, setForm] = useState({ baseUrl: "", apiKey: "" });
  const [busy, setBusy] = useState(false);

  async function onConnect() {
    setBusy(true);
    try {
      const res = await connect({ data: form });
      if (res.ok) {
        toast.success(t("crm.learnx.ok", { n: res.courses }));
        setForm({ baseUrl: "", apiKey: "" });
      } else {
        toast.error(t(ERRORS[res.error]));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("channels.failed"));
    } finally {
      setBusy(false);
      await queryClient.invalidateQueries({ queryKey: ["learnx"] });
    }
  }

  async function onDisconnect() {
    if (!window.confirm(t("crm.learnx.disconnectConfirm"))) return;
    setBusy(true);
    try {
      await disconnect();
      toast.success(t("crm.learnx.disconnected"));
    } finally {
      setBusy(false);
      await queryClient.invalidateQueries({ queryKey: ["learnx"] });
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <GraduationCap className="size-5 text-primary" />
        <span className="font-display text-lg font-semibold">{t("crm.learnx.title")}</span>
        {integration && <Badge className="bg-success text-primary-foreground">{t("channels.connected")}</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("crm.learnx.text")}</p>
      {isLoading ? null : integration ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="break-all">
            {t("crm.learnx.connected", { url: integration.base_url, n: integration.courses_count ?? 0 })}
          </span>
          <Button size="sm" variant="outline" onClick={() => void onDisconnect()} disabled={busy}>
            {t("crm.learnx.disconnect")}
          </Button>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="lx-url">{t("crm.learnx.url")}</Label>
            <Input
              id="lx-url"
              placeholder="https://api.learnx.uz/api"
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lx-key">{t("crm.learnx.key")}</Label>
            <Input
              id="lx-key"
              type="password"
              autoComplete="off"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            />
          </div>
          <Button onClick={() => void onConnect()} disabled={busy || !form.baseUrl.trim() || form.apiKey.trim().length < 16}>
            {busy ? t("crm.learnx.connecting") : t("crm.learnx.connect")}
          </Button>
        </div>
      )}
    </div>
  );
}
