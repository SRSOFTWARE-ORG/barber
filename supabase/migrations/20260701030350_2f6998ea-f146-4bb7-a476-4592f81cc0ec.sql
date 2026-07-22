ALTER TABLE public.app_events
  ADD COLUMN IF NOT EXISTS pais text,
  ADD COLUMN IF NOT EXISTS recorrente_anual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mes_inicio smallint,
  ADD COLUMN IF NOT EXISTS dia_inicio smallint,
  ADD COLUMN IF NOT EXISTS mes_fim smallint,
  ADD COLUMN IF NOT EXISTS dia_fim smallint,
  ADD COLUMN IF NOT EXISTS video_url_vertical text,
  ADD COLUMN IF NOT EXISTS video_url_horizontal text,
  ADD COLUMN IF NOT EXISTS video_url_vertical_webm text,
  ADD COLUMN IF NOT EXISTS video_url_horizontal_webm text;

COMMENT ON COLUMN public.app_events.pais IS 'Código ISO do país (ex: BR, US). NULL = evento global, aparece em todos os países.';
COMMENT ON COLUMN public.app_events.recorrente_anual IS 'Se verdadeiro, o evento repete todo ano nas datas mes/dia definidas.';