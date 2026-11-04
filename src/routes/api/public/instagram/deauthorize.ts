import { createFileRoute } from "@tanstack/react-router";

import { splitSignedRequest } from "@/lib/instagram-rules";

// Meta calls this when a business removes Javobchi from its Instagram settings: forget that account.
export const Route = createFileRoute("/api/public/instagram/deauthorize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { instagramAppConfig, verifySignedRequest, removeInstagramAccount } = await import("@/lib/instagram.server");
        const app = instagramAppConfig();
        if (!app) return new Response("Not configured", { status: 503 });
        const form = await request.formData().catch(() => null);
        const signed = splitSignedRequest(String(form?.get("signed_request") ?? ""));
        if (!signed || !(await verifySignedRequest(signed.signature, signed.payload, app.appSecret))) {
          return new Response("Invalid signature", { status: 401 });
        }
        if (signed.data.user_id) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin.from("instagram_accounts").select("owner_id").eq("ig_user_id", signed.data.user_id).maybeSingle();
          if (data) await removeInstagramAccount(data.owner_id);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
