-- Anon must only see public scheduling fields, never the internal 'motivo' note.
-- RLS cannot restrict columns, so enforce via column-level privileges.
REVOKE SELECT ON public.horarios_bloqueados FROM anon;
GRANT SELECT (id, data, hora, created_at, shop_owner_id) ON public.horarios_bloqueados TO anon;