
-- ============================================================================
-- 1. Drop plaintext password column (CRITICAL)
-- ============================================================================
ALTER TABLE public.profiles DROP COLUMN IF EXISTS plain_password;

-- ============================================================================
-- 2. Restrict agendamentos SELECT to participants/staff only
-- ============================================================================
DROP POLICY IF EXISTS "Agendamentos visíveis para todos" ON public.agendamentos;

CREATE POLICY "Cliente ve seus agendamentos"
  ON public.agendamentos FOR SELECT
  TO authenticated
  USING (auth.uid() = cliente_id);

CREATE POLICY "Barbeiro ve seus agendamentos"
  ON public.agendamentos FOR SELECT
  TO authenticated
  USING (auth.uid() = barbeiro_id);

CREATE POLICY "Staff ve todos agendamentos"
  ON public.agendamentos FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'ceo'::app_role));

-- ============================================================================
-- 3. SECURITY DEFINER RPC for slot conflict checking (no PII exposed)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_busy_slots(_data_inicio date DEFAULT CURRENT_DATE, _dias int DEFAULT 30)
RETURNS TABLE(id uuid, data date, hora time, barbeiro_id uuid, servico_ids uuid[], status text, arquivado boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.id, a.data, a.hora, a.barbeiro_id, a.servico_ids, a.status, a.arquivado
  FROM public.agendamentos a
  WHERE a.data >= _data_inicio
    AND a.data <= _data_inicio + (_dias || ' days')::interval
    AND a.status NOT IN ('cancelled')
    AND a.arquivado = false;
$$;

REVOKE EXECUTE ON FUNCTION public.get_busy_slots(date, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_busy_slots(date, int) TO anon, authenticated;

-- ============================================================================
-- 4. SECURITY DEFINER RPC for phone-based barbeiro lookup (privacy-safe)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.find_barbeiro_by_phone(_phone text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.barbeiro_id
  FROM public.agendamentos a
  WHERE regexp_replace(a.cliente_telefone, '[^0-9]', '', 'g') = regexp_replace(_phone, '[^0-9]', '', 'g')
    AND a.barbeiro_id IS NOT NULL
    AND a.status <> 'cancelled'
  ORDER BY a.created_at DESC
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.find_barbeiro_by_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_barbeiro_by_phone(text) TO anon, authenticated;
