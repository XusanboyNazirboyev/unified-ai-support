<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- The AI agent (prompt + tools) lives only in `src/lib/ai/agent.server.ts`; the test chat route (`/api/agent-chat`) and inbox server functions both reuse it so sandbox and live answers behave identically.
- Every workspace table is scoped by `owner_id = auth.uid()` RLS; new accounts get demo data from the `seed_demo_workspace` signup trigger, never from app code.
- Pure business rules (handover keywords, phone/order matching, KB ranking) live in `src/lib/agent-rules.ts` with tests in `src/test/agent-rules.test.ts`.
- Voice notes are transcribed only in `src/lib/ai/voice.server.ts` (via `/api/voice-transcribe`) by an audio-understanding model that also returns language and certainty; the agent receives them through `formatVoiceForAgent` in `src/lib/voice.ts` so low-certainty transcripts are confirmed with the customer instead of answered from a guess.
- Interface text lives only in `src/lib/i18n/messages/*.ts`: `uz.ts` is the source and other languages are typed against its keys (registered in `src/lib/i18n/locales.ts`), so a missing translation fails the type check and `src/test/i18n.test.ts`; components read text via `useI18n().t`.
- Operator handover is decided by `isHandoverAllowed` in `src/lib/agent-rules.ts` and enforced inside the `handover_to_human` tool, so a prompt change alone can't make the agent transfer just because information is missing.
- Incoming-message handling (`handleIncoming`) lives in `src/lib/inbox.server.ts` and is shared by the Inbox server functions and channel webhooks, so demo and real channels behave the same.
- Each workspace connects its own Telegram bot: tokens live in `telegram_bots` (service_role only, never sent to the browser); the webhook `/api/public/telegram/webhook` identifies the workspace by its per-bot secret header and dedupes retries via `telegram_updates`. Pure Telegram helpers live in `src/lib/telegram-rules.ts` with tests.
- learnX (the owner's education platform) is read live through `get_course_catalog` in the agent; its URL and key live in `crm_integrations` (service_role only). The contract is `GET {base}/integrations/javobchi/catalog` with `X-Api-Key`; parsing/formatting rules live in `src/lib/learnx-rules.ts` with tests.
- Bitrix24 is reached only through each workspace's inbound webhook URL, stored as `api_key` in `crm_integrations` (provider `bitrix24`, service_role only; the browser sees just the portal address). The agent uses it via `bitrix24_find_customer` / `bitrix24_save_lead`; pure helpers live in `src/lib/bitrix-rules.ts` with tests.
- The business's own Instagram posts/reels are synced per workspace (`instagram_accounts` token is service_role only; `instagram_posts` stores captions plus the AI's analysis). The scheduled `/api/public/instagram/sync` only lists posts, because scheduled calls are cut off after a few seconds; the AI watches posts one per request from the Channels page or inline in `search_instagram_posts`. Pure rules live in `src/lib/instagram-rules.ts` with tests.
