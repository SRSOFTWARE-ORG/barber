import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { History, Loader2, RefreshCw } from 'lucide-react';

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  barbeiro_id: string | null;
  instance: string | null;
  action: string;
  detail: any;
  created_at: string;
}

const ACTION_META: Record<string, { label: string; cls: string }> = {
  create: { label: 'Instância criada', cls: 'text-green-400' },
  create_failed: { label: 'Falha ao criar', cls: 'text-destructive' },
  qr_refresh: { label: 'QR Code gerado', cls: 'text-yellow-400' },
  disconnect: { label: 'Desconectada / apagada', cls: 'text-destructive' },
  restart: { label: 'Reiniciada', cls: 'text-blue-400' },
  connection_open: { label: 'Conexão estabelecida', cls: 'text-green-400' },
  connection_closed: { label: 'Conexão caiu', cls: 'text-destructive' },
  connection_update: { label: 'Atualização de conexão', cls: 'text-muted-foreground' },
};
const metaFor = (a: string) => ACTION_META[a] || { label: a, cls: 'text-muted-foreground' };

function actorLabel(role: string | null, name?: string) {
  if (name) return name;
  if (role === 'system') return 'Sistema';
  if (role === 'ceo') return 'CEO';
  if (role === 'admin') return 'Barbeiro';
  return 'Desconhecido';
}

export default function WhatsAppAuditLog({ ceo = false }: { ceo?: boolean }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('evolution_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40);
    const list = (data || []) as AuditRow[];
    setRows(list);

    // Resolve nomes (best-effort; RLS controla quem é visível).
    const ids = Array.from(new Set(list.flatMap(r => [r.actor_id, r.barbeiro_id]).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, display_name')
        .in('user_id', ids);
      const map: Record<string, string> = {};
      for (const r of roles || []) if (r.display_name) map[r.user_id] = r.display_name;
      setNames(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="wood-card px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-sm text-foreground flex items-center gap-2">
          <History size={15} className="text-primary" /> Log de auditoria
        </h3>
        <button onClick={load} disabled={loading} className="text-xs text-primary flex items-center gap-1 disabled:opacity-50">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="animate-spin text-primary" size={20} />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma ação registrada ainda.</p>
      ) : (
        <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {rows.map(r => {
            const m = metaFor(r.action);
            return (
              <li key={r.id} className="flex items-start justify-between gap-3 border-b border-border/30 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className={`text-xs font-heading ${m.cls}`}>{m.label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {actorLabel(r.actor_role, r.actor_id ? names[r.actor_id] : undefined)}
                    {ceo && r.barbeiro_id && names[r.barbeiro_id] ? ` • ${names[r.barbeiro_id]}` : ''}
                    {r.instance ? ` • ${r.instance}` : ''}
                  </p>
                </div>
                <time className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                  {new Date(r.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
