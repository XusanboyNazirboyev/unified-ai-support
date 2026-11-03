import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Image as ImageIcon, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  analyzeNextInstagramPost,
  connectInstagram,
  disconnectInstagram,
  getInstagramAccount,
  retryInstagramPost,
  syncInstagramNow,
} from "@/lib/instagram.functions";
import { instagramPostsQuery, type InstagramPost } from "@/lib/queries";
import { parseMediaMeta } from "@/lib/media";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

const ERRORS = {
  invalid_token: "ig.err.invalid_token",
  in_use: "ig.err.in_use",
  failed: "ig.err.failed",
} as const satisfies Record<string, MessageKey>;

const STATUS: Record<string, MessageKey> = {
  pending: "ig.status.pending",
  analyzing: "ig.status.analyzing",
  analyzed: "ig.status.analyzed",
  failed: "ig.status.failed",
};

const TYPES: Record<string, MessageKey> = {
  IMAGE: "ig.type.IMAGE",
  VIDEO: "ig.type.VIDEO",
  CAROUSEL_ALBUM: "ig.type.CAROUSEL_ALBUM",
};

export function InstagramConnect() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fetchAccount = useServerFn(getInstagramAccount);
  const connect = useServerFn(connectInstagram);
  const disconnect = useServerFn(disconnectInstagram);
  const sync = useServerFn(syncInstagramNow);
  const analyzeNext = useServerFn(analyzeNextInstagramPost);
  const { data: account, isLoading } = useQuery({ queryKey: ["instagram_account"], queryFn: () => fetchAccount() });
  const { data: posts } = useQuery({ ...instagramPostsQuery, enabled: !!account });
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const running = useRef(false);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["instagram_account"] }),
      queryClient.invalidateQueries({ queryKey: ["instagram_posts"] }),
    ]);
  }

  /** Lets the AI watch waiting posts one by one while this page is open. */
  async function runQueue() {
    if (running.current) return;
    running.current = true;
    try {
      for (let i = 0; i < 40; i++) {
        const res = await analyzeNext();
        await queryClient.invalidateQueries({ queryKey: ["instagram_posts"] });
        setLeft(res.remaining);
        if (res.remaining === 0 || (res.done === 0 && i > 0 && res.remaining > 0 && i > 3)) break;
      }
    } catch (e) {
      console.error("[instagram] queue", e);
    } finally {
      running.current = false;
      setLeft(null);
    }
  }

  const hasWaiting = (posts ?? []).some((p) => p.status === "pending");
  useEffect(() => {
    if (account && hasWaiting) void runQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, hasWaiting]);

  async function onConnect() {
    if (!token.trim()) return;
    setBusy(true);
    try {
      const res = await connect({ data: { token: token.trim() } });
      if (res.ok) {
        toast.success(t("ig.connectedOk", { name: res.username, n: res.total }));
        setToken("");
      } else {
        toast.error(t(ERRORS[res.error]));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("ig.err.failed"));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function onSync() {
    setBusy(true);
    try {
      const res = await sync();
      if (res.ok) toast.success(t("ig.syncedOk", { n: res.total }));
      else toast.error(t(ERRORS[res.error]));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("ig.err.failed"));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function onDisconnect() {
    if (!window.confirm(t("ig.disconnectConfirm"))) return;
    setBusy(true);
    try {
      await disconnect();
      toast.success(t("ig.disconnectedOk"));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  if (isLoading) return null;

  if (!account) {
    return (
      <div className="mt-4 space-y-3 rounded-xl border bg-muted/40 p-4">
        <div className="flex items-center gap-2 font-medium">
          <Sparkles className="size-4 text-primary" /> {t("ig.title")}
        </div>
        <p className="text-sm text-muted-foreground">{t("ig.intro")}</p>
        <ol className="space-y-1 text-sm text-muted-foreground">
          <li>{t("ig.step1")}</li>
          <li>{t("ig.step2")}</li>
          <li>{t("ig.step3")}</li>
        </ol>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="ig-token">{t("ig.tokenLabel")}</Label>
            <Input
              id="ig-token"
              type="password"
              autoComplete="off"
              placeholder="IGAA..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <Button onClick={() => void onConnect()} disabled={busy || token.trim().length < 20}>
            {busy ? t("ig.connecting") : t("ig.connect")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge className="bg-success text-primary-foreground">{t("ig.connectedAs", { name: account.username })}</Badge>
        <span className="text-muted-foreground">
          {t("ig.lastSync", {
            time: account.last_synced_at ? new Date(account.last_synced_at).toLocaleString() : t("ig.never"),
          })}
        </span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void onSync()} disabled={busy}>
            <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
            {busy ? t("ig.syncing") : t("ig.sync")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void onDisconnect()} disabled={busy}>
            {t("ig.disconnect")}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("ig.autoNote")}</p>
      {account.last_error && <p className="text-xs text-destructive">{t("ig.err.failed")}</p>}
      {left !== null && left > 0 && (
        <p className="rounded-lg bg-accent px-3 py-2 text-xs text-accent-foreground">{t("ig.analyzingLeft", { n: left })}</p>
      )}
      {posts && posts.length === 0 && <p className="text-sm text-muted-foreground">{t("ig.empty")}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {(posts ?? []).map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}

function PostCard({ post }: { post: InstagramPost }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const retry = useServerFn(retryInstagramPost);
  const meta = parseMediaMeta(post.analysis);
  const [note, setNote] = useState(post.admin_note ?? "");
  const [saving, setSaving] = useState(false);
  const [imgOk, setImgOk] = useState(true);

  async function saveNote() {
    setSaving(true);
    const { error } = await supabase.from("instagram_posts").update({ admin_note: note.trim() || null }).eq("id", post.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(t("ig.noteSaved"));
      await queryClient.invalidateQueries({ queryKey: ["instagram_posts"] });
    }
  }

  async function onRetry() {
    setSaving(true);
    try {
      await retry({ data: { id: post.id } });
    } finally {
      setSaving(false);
      await queryClient.invalidateQueries({ queryKey: ["instagram_posts"] });
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-background p-3 text-sm">
      <div className="flex gap-3">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
          {post.thumbnail_url && imgOk ? (
            <img
              src={post.thumbnail_url}
              alt={post.caption?.slice(0, 60) ?? "Instagram post"}
              className="size-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgOk(false)}
            />
          ) : (
            <ImageIcon className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{t(TYPES[post.media_type] ?? "ig.type.IMAGE")}</Badge>
            <Badge
              variant={post.status === "analyzed" ? "default" : post.status === "failed" ? "destructive" : "outline"}
              className={cn(post.status === "analyzed" && "bg-success text-primary-foreground")}
            >
              {t(STATUS[post.status] ?? "ig.status.pending")}
            </Badge>
            {post.posted_at && <span className="text-xs text-muted-foreground">{post.posted_at.slice(0, 10)}</span>}
            {post.permalink && (
              <a
                href={post.permalink}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {t("ig.open")} <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          {post.caption && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{post.caption}</p>}
        </div>
      </div>
      {meta && (
        <div className="space-y-1 rounded-lg bg-muted/60 p-2 text-xs">
          <div className="font-medium">{meta.product ? t("media.product", { name: meta.product }) : t("media.noProduct")}</div>
          <p>{meta.description}</p>
          {meta.visible_text.length > 0 && <p className="text-muted-foreground">{meta.visible_text.join(" · ")}</p>}
          {meta.speech && <p className="text-muted-foreground">{t("media.speech", { text: meta.speech })}</p>}
          {post.analyzed_from === "cover" && <p className="text-muted-foreground">{t("ig.fromCover")}</p>}
        </div>
      )}
      {post.status === "failed" && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <span className="flex-1">{post.analysis_error}</span>
          <Button size="sm" variant="outline" onClick={() => void onRetry()} disabled={saving}>
            {t("ig.retry")}
          </Button>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor={`ig-note-${post.id}`} className="text-xs">
          {t("ig.noteLabel")}
        </Label>
        <div className="flex gap-2">
          <Textarea
            id={`ig-note-${post.id}`}
            rows={1}
            className="min-h-9 text-xs"
            placeholder={t("ig.notePlaceholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {note !== (post.admin_note ?? "") && (
            <Button size="sm" onClick={() => void saveNote()} disabled={saving}>
              {t("common.save")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
