import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Conversation = Tables<"conversations">;
export type Message = Tables<"messages">;
export type Customer = Tables<"crm_customers">;
export type Order = Tables<"crm_orders">;
export type KbArticle = Tables<"kb_articles">;
export type AgentSettings = Tables<"agent_settings">;

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Avval tizimga kiring");
  return id;
}

export const settingsQuery = queryOptions({
  queryKey: ["agent_settings"],
  queryFn: async (): Promise<AgentSettings | null> => {
    const ownerId = await currentUserId();
    const { data, error } = await supabase.from("agent_settings").select("*").eq("owner_id", ownerId).maybeSingle();
    if (error) throw error;
    return data;
  },
});

export const conversationsQuery = queryOptions({
  queryKey: ["conversations"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data;
  },
});

export const messagesQuery = (conversationId: string) =>
  queryOptions({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

export const kbQuery = queryOptions({
  queryKey: ["kb_articles"],
  queryFn: async () => {
    const { data, error } = await supabase.from("kb_articles").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  },
});

export const customersQuery = queryOptions({
  queryKey: ["crm_customers"],
  queryFn: async () => {
    const { data, error } = await supabase.from("crm_customers").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  },
});

export const ordersQuery = queryOptions({
  queryKey: ["crm_orders"],
  queryFn: async () => {
    const { data, error } = await supabase.from("crm_orders").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export const channelsQuery = queryOptions({
  queryKey: ["channel_connections"],
  queryFn: async () => {
    const { data, error } = await supabase.from("channel_connections").select("*");
    if (error) throw error;
    return data;
  },
});

export const analyticsQuery = queryOptions({
  queryKey: ["analytics"],
  queryFn: async () => {
    const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const [convs, msgs] = await Promise.all([
      supabase.from("conversations").select("id, channel, mode, status, created_at").gte("created_at", since).limit(1000),
      supabase
        .from("messages")
        .select("conversation_id, role, response_ms, sources, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(1000),
    ]);
    if (convs.error) throw convs.error;
    if (msgs.error) throw msgs.error;
    return { conversations: convs.data, messages: msgs.data };
  },
});

export type InstagramPost = Tables<"instagram_posts">;

export const instagramPostsQuery = queryOptions({
  queryKey: ["instagram_posts"],
  queryFn: async (): Promise<InstagramPost[]> => {
    const { data, error } = await supabase
      .from("instagram_posts")
      .select("*")
      .order("posted_at", { ascending: false })
      .limit(60);
    if (error) throw error;
    return data;
  },
});
