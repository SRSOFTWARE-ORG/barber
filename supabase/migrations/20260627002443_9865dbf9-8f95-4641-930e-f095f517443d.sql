-- Remove broad table-level SELECT so the recipient phone can be excluded per-column
REVOKE SELECT ON public.whatsapp_queue FROM authenticated, anon;

-- Re-grant SELECT on all operational columns EXCEPT destinatario (recipient phone)
GRANT SELECT (
  id, mensagem, tipo, agendamento_id, status, tentativas, max_tentativas,
  erro, resposta, created_at, sent_at, next_attempt_at, delivered_at,
  read_at, external_id, barbeiro_id
) ON public.whatsapp_queue TO authenticated;