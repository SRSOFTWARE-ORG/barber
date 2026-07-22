
-- 1. Internal secrets table (apenas service role lê)
CREATE TABLE IF NOT EXISTS public.internal_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.internal_secrets ENABLE ROW LEVEL SECURITY;
-- Sem nenhuma policy -> nem anon nem authenticated podem ler.
REVOKE ALL ON public.internal_secrets FROM anon, authenticated;

INSERT INTO public.internal_secrets(name, value)
VALUES ('webhook_push', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

-- 2. Trigger guard em agendamentos: cliente só pode alterar comprovante_url ou cancelar
CREATE OR REPLACE FUNCTION public.guard_agendamento_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- chamadas via service role (edge functions) passam
  END IF;
  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'ceo'::app_role)
     OR auth.uid() = OLD.barbeiro_id THEN
    RETURN NEW;
  END IF;
  IF auth.uid() = OLD.cliente_id THEN
    IF NEW.sinal_pago IS DISTINCT FROM OLD.sinal_pago
       OR NEW.valor_pago IS DISTINCT FROM OLD.valor_pago
       OR NEW.taxa_app IS DISTINCT FROM OLD.taxa_app
       OR NEW.valor_sinal IS DISTINCT FROM OLD.valor_sinal
       OR NEW.barbeiro_id IS DISTINCT FROM OLD.barbeiro_id
       OR NEW.barbeiro_nome IS DISTINCT FROM OLD.barbeiro_nome
       OR NEW.arquivado IS DISTINCT FROM OLD.arquivado
       OR NEW.data IS DISTINCT FROM OLD.data
       OR NEW.hora IS DISTINCT FROM OLD.hora
       OR NEW.servico_ids IS DISTINCT FROM OLD.servico_ids
       OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled') THEN
      RAISE EXCEPTION 'Cliente não pode alterar esses campos do agendamento';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Sem permissão para alterar este agendamento';
END $$;

DROP TRIGGER IF EXISTS trg_guard_agendamento_update ON public.agendamentos;
CREATE TRIGGER trg_guard_agendamento_update
BEFORE UPDATE ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.guard_agendamento_update();

-- 3. agendamento_status_log: restringe SELECT/INSERT
DROP POLICY IF EXISTS "Log visivel para todos" ON public.agendamento_status_log;
DROP POLICY IF EXISTS "Insert log via agendamento" ON public.agendamento_status_log;

CREATE POLICY "Log visivel a participantes e staff"
ON public.agendamento_status_log FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.id = agendamento_status_log.agendamento_id
      AND (a.cliente_id = auth.uid() OR a.barbeiro_id = auth.uid())
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'ceo'::app_role)
);

CREATE POLICY "Apenas staff insere log"
ON public.agendamento_status_log FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'ceo'::app_role)
);
