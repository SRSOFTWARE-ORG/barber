import { supabase } from '@/integrations/supabase/client';

// Centraliza TODAS as chamadas de controle de sessão da Evolution API.
// As credenciais/headers (apikey) vivem APENAS no servidor (edge function);
// o cliente nunca recria nem persiste tokens — isso evita reinicializações
// redundantes a cada render/rota que acordavam a sincronização do WhatsApp.

export type InstanceAction =
  | 'status'
  | 'create'
  | 'qr'
  | 'disconnect'
  | 'restart'
  | 'ceo-list';

export type InstanceResp = {
  instance?: string;
  state?: string;
  paired?: boolean;
  number?: string | null;
  qr?: string | null;
  warnings?: string[];
  items?: unknown[];
  [k: string]: unknown;
};

/**
 * Chamada única e centralizada para a edge function `evolution-instance`.
 * Lança erro em falha de rede ou erro reportado pela função (para o backoff agir).
 */
export async function callEvolutionInstance(
  action: InstanceAction,
  barbeiroId?: string,
): Promise<InstanceResp> {
  const { data, error } = await supabase.functions.invoke('evolution-instance', {
    body: { action, barbeiro_id: barbeiroId ?? undefined },
  });
  if (error) throw new Error(error.message || 'Falha na comunicação com o servidor.');
  if ((data as InstanceResp)?.error) throw new Error(String((data as InstanceResp).error));
  return (data ?? {}) as InstanceResp;
}

/** Próximo intervalo de backoff exponencial (dobra a cada falha, com teto). */
export function nextBackoff(current: number, base: number, max: number): number {
  return Math.min(max, Math.max(base, current * 2));
}
