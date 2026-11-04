import { createFileRoute } from "@tanstack/react-router";

import { decodeStateBody, INSTAGRAM_OAUTH_CALLBACK_PATH } from "@/lib/instagram-rules";
import { publicWebhookBase } from "@/lib/telegram-rules";

type Status = "ok" | "denied" | "in_use" | "expired" | "failed";

const TEXT: Record<Status, string> = {
  ok: "Instagram ulandi. Bu oynani yopishingiz mumkin.",
  denied: "Instagram'ga ruxsat berilmadi.",
  in_use: "Bu Instagram akkaunt boshqa ish joyiga ulangan.",
  expired: "Ulash havolasining muddati o'tgan. Qaytadan urinib ko'ring.",
  failed: "Instagram'ni ulab bo'lmadi. Qaytadan urinib ko'ring.",
};

/** Small page shown in the login popup: tells the opener the result, closes itself, else links back. */
function page(status: Status, origin: string | null, extra: Record<string, string | number | boolean> = {}) {
  const target = origin ?? "";
  const payload = JSON.stringify({ type: "javobchi-instagram", status, ...extra });
  const back = target ? `${target}/channels` : "/channels";
  const html = `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Javobchi — Instagram</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f7f7f2;color:#0d2b22}main{max-width:360px;text-align:center;padding:24px}a{color:#0b6b4f}</style></head>
<body><main><p>${TEXT[status]}</p><p><a href="${back}">Javobchi'ga qaytish</a></p></main>
<script>try{if(window.opener){window.opener.postMessage(${payload},${JSON.stringify(target || "*")});setTimeout(function(){window.close()},800)}}catch(e){}</script></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export const Route = createFileRoute("/api/public/instagram/oauth-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const { instagramAppConfig, verifyState, exchangeCodeForToken, saveConnectedAccount } = await import("@/lib/instagram.server");
        const app = instagramAppConfig();
        if (!app) return page("failed", null);

        const stateParam = url.searchParams.get("state") ?? "";
        const body = await verifyState(stateParam, app.appSecret);
        const state = body ? decodeStateBody(body) : null;
        if (!state) return page("expired", null);
        if (url.searchParams.get("error")) return page("denied", state.origin);

        const code = (url.searchParams.get("code") ?? "").replace(/#_$/, "");
        if (!code || code.length > 2000) return page("failed", state.origin);
        const base = publicWebhookBase(state.origin);
        if (!base) return page("failed", state.origin);

        try {
          const { token, scopes } = await exchangeCodeForToken(code, `${base}${INSTAGRAM_OAUTH_CALLBACK_PATH}`);
          const saved = await saveConnectedAccount(state.userId, token, scopes);
          if (!saved.ok) return page("in_use", state.origin);
          return page("ok", state.origin, { username: saved.username, total: saved.total, messaging: saved.messaging });
        } catch (e) {
          console.error("[instagram] oauth callback failed", e instanceof Error ? e.message : e);
          return page("failed", state.origin);
        }
      },
    },
  },
});
