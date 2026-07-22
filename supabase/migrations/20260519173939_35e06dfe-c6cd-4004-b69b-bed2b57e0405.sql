
ALTER TABLE public.mensagens
  ADD COLUMN IF NOT EXISTS entregue boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entregue_em timestamptz,
  ADD COLUMN IF NOT EXISTS lida_em timestamptz;

ALTER TABLE public.whatsapp_queue
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE INDEX IF NOT EXISTS whatsapp_queue_external_id_idx ON public.whatsapp_queue(external_id);
