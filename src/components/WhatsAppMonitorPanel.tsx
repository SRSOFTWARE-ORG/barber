import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RefreshCw, RotateCw, Trash2, MessageSquare, AlertTriangle, Webhook, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface QueueItem {
  id: string; destinatario: string; mensagem: string; tipo: string | null; status: string;
  tentativas: number; max_tentativas: number; erro: string | null; created_at: string;
  sent_at: string | null; delivered_at?: string | null; read_at?: string | null;
  next_attempt_at?: string; barbeiro_id?: string | null;
}
interface WebhookLog {
  id: string; created_at: string; event: string; instance: string | null;
  status: string | null; remote_jid: string | null; external_id: string | null;
  queue_id: string | null; matched: boolean; payload: any;
}

const STATUS_COLOR: Record<string,string> = {
  read: 'bg-sky-900/40 text-sky-400',
  delivered: 'bg-emerald-900/40 text-emerald-400',
  sent: 'bg-green-900/40 text-green-400',
  failed: 'bg-destructive/20 text-destructive',
  pending: 'bg-yellow-900/40 text-yellow-400',
};

export default function WhatsAppMonitorPanel() {
  const [tab, setTab] = useState<'queue' | 'webhook'>('queue');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'failed' | 'sent'>('all');
  const [processing, setProcessing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    const [{ data: q }, { data: w }] = await Promise.all([
      // destinatario (client phone) is masked server-side via the secure RPC.
      supabase.rpc('list_whatsapp_queue', { _limit: 100 }),
      supabase.from('evolution_webhook_logs').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    setQueue((q as any) || []); setLogs(w || []);
  };

  useEffect(() => {
    load();
    const ch1 = supabase.channel('mon-queue').on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_queue' }, load).subscribe();
    const ch2 = supabase.channel('mon-hooks').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'evolution_webhook_logs' }, load).subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, []);

  const filteredQueue = queue.filter(q => filter === 'all' ? true : filter === 'sent' ? ['sent','delivered','read'].includes(q.status) : q.status === filter);

  const counts = {
    total: queue.length,
    pending: queue.filter(q => q.status === 'pending').length,
    failed: queue.filter(q => q.status === 'failed').length,
    sent: queue.filter(q => ['sent','delivered','read'].includes(q.status)).length,
    retries: queue.reduce((s,q) => s + (q.tentativas || 0), 0),
  };

  const processQueue = async () => {
    setProcessing(true);
    const { data, error } = await supabase.functions.invoke('evolution-queue', {});
    setProcessing(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Processados: ${data.processed} (✓${data.sent} ✗${data.failed})`);
  };

  const retry = async (item: QueueItem) => {
    await supabase.from('whatsapp_queue').update({ status: 'pending', tentativas: 0, next_attempt_at: new Date().toISOString(), erro: null }).eq('id', item.id);
    toast.success('Reagendado para envio imediato');
  };
  const remove = async (id: string) => { await supabase.from('whatsapp_queue').delete().eq('id', id); };

  return (
    <section className="px-4 space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Total', value: counts.total, cls: 'text-foreground' },
          { label: 'Pendentes', value: counts.pending, cls: 'text-yellow-400' },
          { label: 'Falhas', value: counts.failed, cls: 'text-destructive' },
          { label: 'Reenvios', value: counts.retries, cls: 'text-primary' },
        ].map(k => (
          <div key={k.label} className="wood-card px-2 py-2 text-center">
            <p className={`text-lg font-heading ${k.cls}`}>{k.value}</p>
            <p className="text-[9px] text-muted-foreground uppercase">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([['queue','Fila & Retries'],['webhook','Webhook Logs']] as const).map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 px-3 py-1.5 rounded-full text-xs ${tab===k?'bg-primary text-primary-foreground':'wood-card text-muted-foreground'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'queue' && (
        <>
          <div className="flex gap-2 items-center">
            <select value={filter} onChange={e => setFilter(e.target.value as any)} className="vintage-input px-2 py-1.5 rounded-lg text-xs flex-1">
              <option value="all">Todos</option>
              <option value="pending">Pendentes</option>
              <option value="failed">Falhas</option>
              <option value="sent">Enviadas</option>
            </select>
            <button onClick={processQueue} disabled={processing} className="vintage-btn px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 disabled:opacity-40">
              <RotateCw size={12} className={processing?'animate-spin':''}/> Reprocessar
            </button>
            <button onClick={load} className="vintage-btn px-2 py-1.5 rounded-lg"><RefreshCw size={12}/></button>
          </div>

          {filteredQueue.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">Sem mensagens.</p>
          ) : filteredQueue.map(m => (
            <div key={m.id} className="wood-card px-3 py-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare size={12} className="text-primary shrink-0"/>
                  <code className="text-xs text-foreground truncate">{m.destinatario}</code>
                  {m.tipo && <span className="text-[9px] text-muted-foreground">[{m.tipo}]</span>}
                </div>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${STATUS_COLOR[m.status] || 'bg-muted text-muted-foreground'}`}>
                  {m.status === 'read' ? '✓✓ lida' : m.status === 'delivered' ? '✓✓ entregue' : m.status === 'sent' ? '✓ enviada' : m.status}
                </span>
              </div>
              <p className="text-[11px] text-foreground/80 line-clamp-2">{m.mensagem}</p>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Clock size={10}/>{format(new Date(m.created_at), 'dd/MM HH:mm', { locale: ptBR })}
                  <span className="text-foreground/70">tent: {m.tentativas}/{m.max_tentativas}</span>
                  {m.delivered_at && ` • entr ${format(new Date(m.delivered_at), 'HH:mm')}`}
                  {m.read_at && ` • lida ${format(new Date(m.read_at), 'HH:mm')}`}
                </span>
                <div className="flex gap-2">
                  {!['sent','delivered','read'].includes(m.status) && <button onClick={() => retry(m)} className="text-primary">Reenviar</button>}
                  <button onClick={() => remove(m.id)} className="text-destructive"><Trash2 size={11}/></button>
                </div>
              </div>
              {m.erro && (
                <div className="text-[10px] text-destructive flex items-start gap-1 bg-destructive/10 p-1.5 rounded mt-1">
                  <AlertTriangle size={10} className="mt-0.5 shrink-0"/>
                  <span className="line-clamp-3 break-all">{m.erro}</span>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {tab === 'webhook' && (
        <>
          <p className="text-[11px] text-muted-foreground">Últimos 50 eventos recebidos da Evolution (MESSAGES_UPSERT / UPDATE / SEND_MESSAGE / CONNECTION_UPDATE).</p>
          {logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">Nenhum evento ainda.</p>
          ) : logs.map(l => (
            <div key={l.id} className="wood-card px-3 py-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Webhook size={12} className="text-primary shrink-0"/>
                  <code className="text-xs text-foreground truncate">{l.event}</code>
                  {l.instance && <span className="text-[9px] text-muted-foreground truncate">{l.instance}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {l.matched ? <CheckCircle2 size={12} className="text-green-400"/> : <XCircle size={12} className="text-muted-foreground"/>}
                  {l.status && <span className="text-[9px] text-foreground/70 px-1.5 py-0.5 rounded bg-muted">{l.status}</span>}
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><Clock size={10}/>{format(new Date(l.created_at), 'dd/MM HH:mm:ss', { locale: ptBR })}</span>
                <button onClick={() => setExpanded(expanded === l.id ? null : l.id)} className="text-primary">
                  {expanded === l.id ? 'Ocultar' : 'Payload'}
                </button>
              </div>
              {l.remote_jid && <p className="text-[10px] text-foreground/70 truncate">para: {l.remote_jid}</p>}
              {expanded === l.id && (
                <pre className="text-[9px] bg-background/50 p-2 rounded max-h-64 overflow-auto text-foreground/80">
                  {JSON.stringify(l.payload, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
