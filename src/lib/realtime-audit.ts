import { supabase } from '@/integrations/supabase/client';

/**
 * Registra (best-effort) uma tentativa de assinatura de canal em tempo real.
 * O servidor decide se o tópico está no escopo do próprio usuário; tentativas
 * fora do escopo ficam marcadas como suspeitas no registro de auditoria.
 *
 * Falhas são silenciosas: auditoria nunca deve quebrar a UX.
 */
export function auditRealtimeAccess(topic: string): void {
  try {
    // Não bloqueia o fluxo; dispara e esquece.
    void supabase.rpc('audit_realtime_access' as any, { _topic: topic } as any);
  } catch {
    /* noop */
  }
}
