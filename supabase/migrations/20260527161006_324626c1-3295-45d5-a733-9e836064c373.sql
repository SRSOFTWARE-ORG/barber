
ALTER TABLE public.evolution_config
  ADD COLUMN IF NOT EXISTS antiban_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS min_gap_seconds integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS max_per_hour integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS max_per_day integer NOT NULL DEFAULT 150,
  ADD COLUMN IF NOT EXISTS business_hours_start integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS business_hours_end integer NOT NULL DEFAULT 21,
  ADD COLUMN IF NOT EXISTS presence_simulation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS warmup_mode boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS whatsapp_queue_sent_at_idx
  ON public.whatsapp_queue (barbeiro_id, sent_at)
  WHERE status = 'sent';
