ALTER TABLE public.messages
  ADD COLUMN media_kind text CHECK (media_kind IN ('photo', 'video')),
  ADD COLUMN media_meta jsonb;