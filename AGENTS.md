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
