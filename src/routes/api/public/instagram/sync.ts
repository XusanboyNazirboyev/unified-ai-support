import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Scheduled job: fetches new Instagram posts for every connected workspace. It only lists posts (fast);
// the AI watches them when the owner opens the Channels page or when a customer asks about them.
export const Route = createFileRoute("/api/public/instagram/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { syncInstagramPosts } = await import("@/lib/instagram.server");
        const { data: accounts } = await supabaseAdmin.from("instagram_accounts").select("owner_id");
        let synced = 0;
        let failed = 0;
        for (const account of accounts ?? []) {
          try {
            await syncInstagramPosts(account.owner_id);
            synced++;
          } catch (e) {
            failed++;
            console.error("[instagram] scheduled sync failed", account.owner_id, e instanceof Error ? e.message : e);
          }
        }
        return Response.json({ ok: true, synced, failed });
      },
    },
  },
});
