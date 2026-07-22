import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Clock, CheckCircle2, Upload, Ban, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface LogEntry {
  id: string;
  status: string;
  mensagem: string | null;
  criado_por: string | null;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; icon: any; color: string }> = {
  aguardando_sinal: { label: 'Aguardando Sinal', icon: Clock, color: 'hsl(40, 80%, 50%)' },
  comprovante_enviado: { label: 'Comprovante Enviado', icon: Upload, color: 'hsl(210, 80%, 55%)' },
  sinal_pago: { label: 'Sinal Pago', icon: CheckCircle2, color: 'hsl(120, 50%, 45%)' },
  confirmed: { label: 'Confirmado', icon: CheckCircle2, color: 'hsl(120, 50%, 45%)' },
  finalizado: { label: 'Concluído', icon: Sparkles, color: 'hsl(140, 60%, 40%)' },
  cancelado: { label: 'Cancelado', icon: Ban, color: 'hsl(0, 60%, 50%)' },
  pending: { label: 'Pendente', icon: Clock, color: 'hsl(40, 60%, 50%)' },
};

export function StatusTimeline({ agendamentoId, compact = false }: { agendamentoId: string; compact?: boolean }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from('agendamento_status_log' as any)
        .select('*')
        .eq('agendamento_id', agendamentoId)
        .order('created_at', { ascending: true });
      if (active && data) setLogs(data as any);
    };
    load();
    const ch = supabase
      .channel(`statuslog-${agendamentoId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agendamento_status_log', filter: `agendamento_id=eq.${agendamentoId}` }, (payload) => {
        setLogs(prev => [...prev, payload.new as any]);
      })
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [agendamentoId]);

  if (logs.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Sem histórico ainda.</p>;
  }

  return (
    <ol className={`relative ${compact ? 'space-y-1.5' : 'space-y-3'} border-l-2 border-border pl-4 ml-1`}>
      {logs.map(log => {
        const meta = STATUS_META[log.status] || { label: log.status, icon: Clock, color: 'hsl(var(--muted-foreground))' };
        const Icon = meta.icon;
        return (
          <li key={log.id} className="relative">
            <span
              className="absolute -left-[1.4rem] top-0.5 w-4 h-4 rounded-full flex items-center justify-center"
              style={{ background: meta.color }}
            >
              <Icon size={10} className="text-white" />
            </span>
            <div>
              <p className="text-xs font-medium text-foreground" style={{ color: meta.color }}>{meta.label}</p>
              {!compact && log.mensagem && <p className="text-[11px] text-muted-foreground">{log.mensagem}</p>}
              <p className="text-[10px] text-muted-foreground/70">
                {format(new Date(log.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                {log.criado_por && ` • ${log.criado_por}`}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
