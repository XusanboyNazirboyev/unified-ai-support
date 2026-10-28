import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectBitrix, disconnectBitrix, getBitrixIntegration } from "@/lib/integrations.functions";
import { useI18n } from "@/lib/i18n/context";

const ERRORS = {
  bad_url: "crm.bitrix.err.bad_url",
  unreachable: "crm.bitrix.err.unreachable",
  unauthorized: "crm.bitrix.err.unauthorized",
  no_crm_access: "crm.bitrix.err.no_crm_access",
  bad_response: "crm.bitrix.err.bad_response",
} as const;

export function BitrixConnect() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fetchIntegration = useServerFn(getBitrixIntegration);
  const connect = useServerFn(connectBitrix);
  const disconnect = useServerFn(disconnectBitrix);
  const { data: integration, isLoading } = useQuery({ queryKey: ["bitrix24"], queryFn: () => fetchIntegration() });
  const [webhookUrl, setWebhookUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function onConnect() {
    setBusy(true);
    try {
      const res = await connect({ data: { webhookUrl } });
      if (res.ok) {
        toast.success(t("crm.bitrix.ok", { contacts: res.contacts, deals: res.deals }));
        setWebhookUrl("");
      } else {
        toast.error(t(ERRORS[res.error]));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("channels.failed"));
    } finally {
      setBusy(false);
      await queryClient.invalidateQueries({ queryKey: ["bitrix24"] });
    }
  }

  async function onDisconnect() {
    if (!window.confirm(t("crm.bitrix.disconnectConfirm"))) return;
    setBusy(true);
    try {
      await disconnect();
      toast.success(t("crm.bitrix.disconnected"));
    } finally {
      setBusy(false);
      await queryClient.invalidateQueries({ queryKey: ["bitrix24"] });
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Building2 className="size-5 text-primary" />
        <span className="font-display text-lg font-semibold">{t("crm.bitrix.title")}</span>
        {integration && <Badge className="bg-success text-primary-foreground">{t("channels.connected")}</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("crm.bitrix.text")}</p>
      {isLoading ? null : integration ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="break-all">{t("crm.bitrix.connected", { url: integration.portal })}</span>
          <Button size="sm" variant="outline" onClick={() => void onDisconnect()} disabled={busy}>
            {t("crm.bitrix.disconnect")}
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted-foreground">{t("crm.bitrix.help")}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="bx-url">{t("crm.bitrix.url")}</Label>
              <Input
                id="bx-url"
                type="password"
                autoComplete="off"
                placeholder="https://kompaniya.bitrix24.kz/rest/1/xxxxxxxxxx/"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
            </div>
            <Button onClick={() => void onConnect()} disabled={busy || webhookUrl.trim().length < 20}>
              {busy ? t("crm.bitrix.connecting") : t("crm.bitrix.connect")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
