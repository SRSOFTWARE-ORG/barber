import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSmartPoll } from '@/hooks/use-smart-poll';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Save, Send, RefreshCw, QrCode, CheckCircle2, AlertCircle, Power, Trash2, RotateCw, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface EvolutionCfg { id?: string; instance: string; paired?: boolean; last_status?: string; barbeiro_id?: string | null; retorno_enabled?: boolean; retorno_dias?: number }
interface Template { id: string; tipo: string; titulo: string; conteudo: string; ativo: boolean }
interface QueueItem { id: string; destinatario: string; mensagem: string; tipo: string | null; status: string; tentativas: number; erro: string | null; created_at: string; sent_at: string | null; delivered_at?: string | null; read_at?: string | null }

const TIPOS: Record<string, string> = {
  agendamento: 'Novo agendamento',
  sinal_pago: 'Sinal confirmado',
  concluido: 'Serviço concluído',
  lembrete: 'Lembrete',
  avaliacao: 'Pedido de avaliação',
  retorno: 'Lembrete de retorno',
};

export default function EvolutionPanel({ barbeiroId: barbeiroIdProp }: { barbeiroId?: string }) {
  const { user, role } = useAuth();
  // Cada barbeiro tem sua própria instância — para o CEO, mostramos a primeira (legado).
  const barbeiroId = barbeiroIdProp ?? (role === 'admin' ? user?.id : undefined);
  const [subTab, setSubTab] = useState<'config' | 'qr' | 'templates' | 'log'>('config');
  const [cfg, setCfg] = useState<EvolutionCfg>({ instance: '', barbeiro_id: barbeiroId ?? null });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; state?: string; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [qr, setQr] = useState<string | null>(null);
  const [qrState, setQrState] = useState<string>('');
  const [loadingQr, setLoadingQr] = useState(false);
  const qrPollRef = useRef<number | null>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [processing, setProcessing] = useState(false);

  const [health, setHealth] = useState<{ ok: boolean; state: string; checkedAt: Date } | null>(null);

  useEffect(() => {
    (async () => {
      let q = supabase.from('evolution_config').select('id, instance, paired, last_status, barbeiro_id, retorno_enabled, retorno_dias');
      q = barbeiroId ? q.eq('barbeiro_id', barbeiroId) : q.limit(1);
      const { data } = await q.maybeSingle();
      if (data) setCfg(data);
      else setCfg(c => ({ ...c, barbeiro_id: barbeiroId ?? null }));
      const { data: tpls } = await supabase.from('whatsapp_templates').select('*').order('tipo');
      setTemplates(tpls || []);
      fetchQueue();
    })();
    const ch = supabase.channel('queue-watch').on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_queue' }, fetchQueue).subscribe();
    const cfgCh = supabase.channel('cfg-watch').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'evolution_config' }, (p) => setCfg(c => ({ ...c, ...(p.new as any) }))).subscribe();
    return () => { supabase.removeChannel(ch); supabase.removeChannel(cfgCh); if (qrPollRef.current) clearInterval(qrPollRef.current); };
  }, [barbeiroId]);

  // Health check com backoff e pausa em segundo plano.
  // Quando já está pareado/conectado, espaçamos bastante (5 min) para reduzir
  // ao mínimo as requisições de controle de sessão; senão, checamos a cada 60s.
  const healthEnabled = !!cfg.instance;
  useSmartPoll(async () => {
    const { data, error } = await supabase.functions.invoke('evolution-instance', { body: { action: 'status', barbeiro_id: barbeiroId ?? cfg.barbeiro_id ?? undefined } });
    if (error || !data) { setHealth({ ok: false, state: 'offline', checkedAt: new Date() }); throw (error || new Error('sem resposta')); }
    setHealth({ ok: data.state === 'open' || data.paired === true, state: data.state || 'unknown', checkedAt: new Date() });
  }, { enabled: healthEnabled, interval: cfg.paired ? 300_000 : 60_000, maxInterval: 10 * 60_000 });


  const fetchQueue = async () => {
    // destinatario (client phone) is masked server-side; staff only see their own rows.
    const { data } = await supabase.rpc('list_whatsapp_queue', { _barbeiro_id: barbeiroId ?? null, _limit: 50 });
    setQueue((data as any) || []);
  };

  const testConn = async () => {
    if (!cfg.instance) { toast.error('Crie ou gere a instância primeiro.'); return; }
    setTesting(true); setTestResult(null);
    const { data, error } = await supabase.functions.invoke('evolution-instance', { body: { action: 'status', barbeiro_id: barbeiroId ?? cfg.barbeiro_id ?? undefined } });
    setTesting(false);
    if (error) { setTestResult({ ok: false, error: error.message }); toast.error('Falha no teste'); return; }
    setTestResult({ ok: data.state === 'open' || data.paired === true, state: data.state, error: data.error });
    if (data.state === 'open' || data.paired === true) toast.success(`Conectado (${data.state})`);
    else toast.warning(`Resposta: ${data.state || 'sem conexão'}`);
  };

  const save = async () => {
    setSaving(true);
    const payload: any = { instance: cfg.instance, last_status: testResult?.state || null, barbeiro_id: barbeiroId ?? null };
    const { error } = cfg.id
      ? await supabase.from('evolution_config').update(payload).eq('id', cfg.id)
      : await supabase.from('evolution_config').insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Configuração salva');
    let q = supabase.from('evolution_config').select('id, instance, paired, last_status, barbeiro_id, retorno_enabled, retorno_dias');
    q = barbeiroId ? q.eq('barbeiro_id', barbeiroId) : q.limit(1);
    const { data } = await q.maybeSingle();
    if (data) setCfg(data);
  };

  const fetchQr = async () => {
    setLoadingQr(true);
    const { data, error } = await supabase.functions.invoke('evolution-qr', { body: { barbeiro_id: barbeiroId ?? cfg.barbeiro_id ?? null, force: true } });
    setLoadingQr(false);
    if (error) { toast.error(error.message); return; }
    setQr(data.qr ? (data.qr.startsWith('data:') ? data.qr : `data:image/png;base64,${data.qr}`) : null);
    setQrState(data.state);
    if (data.paired) {
      toast.success('WhatsApp pareado! ✅');
      if (qrPollRef.current) { clearInterval(qrPollRef.current); qrPollRef.current = null; }
      setCfg(c => ({ ...c, paired: true }));
    }
  };

  const startQrPolling = () => {
    fetchQr();
    if (qrPollRef.current) clearInterval(qrPollRef.current);
    qrPollRef.current = window.setInterval(async () => {
      if (typeof document !== 'undefined' && document.hidden) return; // pausa em segundo plano
      const { data, error } = await supabase.functions.invoke('evolution-qr', { body: { barbeiro_id: barbeiroId ?? cfg.barbeiro_id ?? null } });
      if (error) return;
      setQrState(data.state);
      if (data.paired) {
        toast.success('WhatsApp pareado! ✅');
        if (qrPollRef.current) { clearInterval(qrPollRef.current); qrPollRef.current = null; }
        setQr(null);
        setCfg(c => ({ ...c, paired: true }));
      }
    }, 8000);
  };

  const toggleTemplate = async (t: Template) => {
    const { error } = await supabase.from('whatsapp_templates').update({ ativo: !t.ativo }).eq('id', t.id);
    if (error) { toast.error(error.message); return; }
    setTemplates(ts => ts.map(x => x.id === t.id ? { ...x, ativo: !t.ativo } : x));
  };

  const saveTemplate = async (t: Template) => {
    const { error } = await supabase.from('whatsapp_templates').update({ titulo: t.titulo, conteudo: t.conteudo }).eq('id', t.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Template salvo');
  };

  const saveRetornoCfg = async () => {
    if (!cfg.id) { toast.error('Configure e salve a conexão primeiro.'); return; }
    const { error } = await supabase.from('evolution_config')
      .update({ retorno_enabled: !!cfg.retorno_enabled, retorno_dias: Math.max(1, Number(cfg.retorno_dias || 30)) })
      .eq('id', cfg.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Lembrete de retorno salvo');
  };



  const processQueue = async () => {
    setProcessing(true);
    const { data, error } = await supabase.functions.invoke('evolution-queue', {});
    setProcessing(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Processados: ${data.processed} (✓${data.sent} ✗${data.failed})`);
  };

  const retryItem = async (item: QueueItem) => {
    await supabase.from('whatsapp_queue').update({ status: 'pending', tentativas: 0, next_attempt_at: new Date().toISOString() }).eq('id', item.id);
    toast.success('Reagendado');
  };
  const removeItem = async (id: string) => {
    await supabase.from('whatsapp_queue').delete().eq('id', id);
  };

  return (
    <section className="px-4 space-y-3">
      {/* Saúde da API — sempre visível */}
      {(cfg.instance || health) && (
        <div className={`wood-card px-4 py-3 flex items-center justify-between gap-3 border ${health?.ok ? 'border-green-500/40' : 'border-destructive/40'}`}>
          <div className="flex items-center gap-2 min-w-0">
            <span className={`relative inline-flex w-3 h-3 rounded-full ${health?.ok ? 'bg-green-500' : 'bg-destructive'}`}>
              {health?.ok && <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-60"/>}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-heading text-foreground">Saúde da API: {health?.ok ? 'Conectada' : 'Sem conexão'}</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {cfg.instance ? `${cfg.instance} • ${health?.state || cfg.last_status || '—'}` : 'Configure abaixo'}
                {health && ` • ${format(health.checkedAt, 'HH:mm:ss')}`}
              </p>
            </div>
          </div>
          {cfg.paired && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 font-bold">PAREADO</span>}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['config','qr','templates','log'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${subTab===t?'bg-primary text-primary-foreground':'wood-card text-muted-foreground'}`}>
            {t==='config'?'Conexão':t==='qr'?'QR Pareamento':t==='templates'?'Mensagens':'Fila & Log'}
          </button>
        ))}
      </div>


      {subTab === 'config' && (
        <div className="wood-card px-4 py-4 space-y-3">
          <h3 className="font-heading text-sm text-primary flex items-center gap-2"><Power size={14}/> Evolution API</h3>
          <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-[11px] text-muted-foreground">
            A URL e a chave da API são gerenciadas com segurança no backend e não ficam expostas no navegador.
          </div>
          <label className="block text-xs">
            <span className="text-muted-foreground">Nome da instância</span>
            <input value={cfg.instance} onChange={e => setCfg({ ...cfg, instance: e.target.value })} placeholder="ex: barbearia-jeffao" className="vintage-input w-full px-3 py-2 rounded-lg mt-1"/>
          </label>

          {testResult && (
            <div className={`text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${testResult.ok ? 'bg-green-900/30 text-green-400' : 'bg-destructive/20 text-destructive'}`}>
              {testResult.ok ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>}
              {testResult.ok ? `Conectado (${testResult.state})` : `Falha: ${testResult.error || testResult.state || 'sem conexão'}`}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={testConn} disabled={testing} className="vintage-btn flex-1 py-2 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-40">
              <RefreshCw size={14} className={testing ? 'animate-spin' : ''}/> {testing ? 'Testando...' : 'Testar conexão'}
            </button>
            <button onClick={save} disabled={saving || !testResult?.ok} className="vintage-btn flex-1 py-2 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-40">
              <Save size={14}/> {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">Use o pareamento por QR. Credenciais sensíveis não são exibidas no app.</p>

          <div className="mt-2 pt-3 border-t border-border/30 space-y-1">
            <p className="text-[11px] font-heading text-primary">Webhook (para receber status de entrega/leitura)</p>
            <p className="text-[10px] text-muted-foreground">Configure este URL na Evolution (eventos: <code>MESSAGES_UPDATE</code>, <code>CONNECTION_UPDATE</code>):</p>
            <code className="block text-[10px] bg-background/50 px-2 py-1.5 rounded break-all text-foreground/90">
              {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-webhook`}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-webhook`); toast.success('Copiado'); }}
              className="text-[10px] text-primary underline"
            >Copiar URL</button>
          </div>
        </div>
      )}



      {subTab === 'qr' && (
        <div className="wood-card px-4 py-4 space-y-3 text-center">
          <h3 className="font-heading text-sm text-primary flex items-center justify-center gap-2"><QrCode size={14}/> Pareamento WhatsApp</h3>
          {cfg.paired && <p className="text-xs text-green-400 flex items-center justify-center gap-1"><CheckCircle2 size={12}/> Instância pareada</p>}
          {qr ? <img src={qr} alt="QR Code" className="mx-auto rounded-lg bg-white p-2 max-w-[260px]"/> : <p className="text-xs text-muted-foreground py-6">Clique abaixo para gerar o QR code.</p>}
          {qrState && <p className="text-[11px] text-muted-foreground">Status: {qrState}</p>}
          <div className="flex gap-2 justify-center">
            <button onClick={startQrPolling} disabled={loadingQr} className="vintage-btn px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-40">
              <RefreshCw size={14} className={loadingQr ? 'animate-spin' : ''}/> Gerar / Atualizar QR
            </button>
            <button onClick={async () => { await supabase.from('evolution_config').update({ paired: false }).eq('id', cfg.id!); setCfg(c => ({...c, paired:false})); toast.info('Marcado como não pareado'); }} className="text-xs text-muted-foreground px-2">Resetar</button>
          </div>
          <p className="text-[10px] text-muted-foreground">Abra o WhatsApp no celular &gt; Aparelhos conectados &gt; Conectar aparelho. O painel atualiza sozinho a cada 8s.</p>
        </div>
      )}

      {subTab === 'templates' && (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">Variáveis: <code>{'{cliente}'}</code>, <code>{'{data}'}</code>, <code>{'{hora}'}</code>, <code>{'{valor_sinal}'}</code>, <code>{'{barbeiro}'}</code>, <code>{'{dias}'}</code>.</p>
          {templates.map(t => (
            <div key={t.id} className="wood-card px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{TIPOS[t.tipo] || t.tipo}</p>
                  <p className="text-[10px] text-muted-foreground">tipo: {t.tipo}</p>
                </div>
                <button onClick={() => toggleTemplate(t)} className={`text-[10px] px-2 py-1 rounded-full font-bold ${t.ativo ? 'bg-green-900/40 text-green-400' : 'bg-muted text-muted-foreground'}`}>
                  {t.ativo ? 'Ativo' : 'Inativo'}
                </button>
              </div>
              <input value={t.titulo} onChange={e => setTemplates(ts => ts.map(x => x.id===t.id?{...x, titulo:e.target.value}:x))} className="vintage-input w-full px-3 py-2 rounded-lg text-sm"/>
              <textarea value={t.conteudo} onChange={e => setTemplates(ts => ts.map(x => x.id===t.id?{...x, conteudo:e.target.value}:x))} rows={4} className="vintage-input w-full px-3 py-2 rounded-lg text-xs resize-y font-mono"/>
              <button onClick={() => saveTemplate(t)} className="vintage-btn w-full py-1.5 rounded-lg text-xs flex items-center justify-center gap-2">
                <Save size={12}/> Salvar template
              </button>

              {t.tipo === 'retorno' && (
                <div className="mt-2 pt-3 border-t border-border/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-foreground">Envio automático</p>
                    <button
                      onClick={() => setCfg(c => ({ ...c, retorno_enabled: !c.retorno_enabled }))}
                      className={`text-[10px] px-2 py-1 rounded-full font-bold ${cfg.retorno_enabled ? 'bg-green-900/40 text-green-400' : 'bg-muted text-muted-foreground'}`}
                    >
                      {cfg.retorno_enabled ? 'Ligado' : 'Desligado'}
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    Enviar após
                    <input
                      type="number" min={1} max={365}
                      value={cfg.retorno_dias ?? 30}
                      onChange={e => setCfg(c => ({ ...c, retorno_dias: Number(e.target.value) }))}
                      className="vintage-input w-20 px-2 py-1 rounded-lg text-sm text-center"
                    />
                    dias sem atendimento
                  </label>
                  <p className="text-[10px] text-muted-foreground">Os lembretes são enviados 1x ao dia, automaticamente, com proteção anti-ban.</p>
                  <button onClick={saveRetornoCfg} className="vintage-btn w-full py-1.5 rounded-lg text-xs flex items-center justify-center gap-2">
                    <Save size={12}/> Salvar lembrete de retorno
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {subTab === 'log' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button onClick={processQueue} disabled={processing} className="vintage-btn flex-1 py-2 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-40">
              <RotateCw size={14} className={processing?'animate-spin':''}/> {processing ? 'Processando...' : 'Reprocessar pendentes'}
            </button>
            <button onClick={fetchQueue} className="vintage-btn px-3 py-2 rounded-lg text-sm">
              <RefreshCw size={14}/>
            </button>
          </div>

          {queue.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">Sem mensagens.</p>
          ) : queue.map(m => (
            <div key={m.id} className="wood-card px-3 py-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare size={12} className="text-primary shrink-0"/>
                  <code className="text-xs text-foreground truncate">{m.destinatario}</code>
                  {m.tipo && <span className="text-[9px] text-muted-foreground">[{m.tipo}]</span>}
                </div>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                  m.status === 'read' ? 'bg-sky-900/40 text-sky-400' :
                  m.status === 'delivered' ? 'bg-emerald-900/40 text-emerald-400' :
                  m.status === 'sent' ? 'bg-green-900/40 text-green-400' :
                  m.status === 'failed' ? 'bg-destructive/20 text-destructive' :
                  'bg-yellow-900/40 text-yellow-400'
                }`}>
                  {m.status === 'read' ? '✓✓ lida' : m.status === 'delivered' ? '✓✓ entregue' : m.status === 'sent' ? '✓ enviada' : m.status}
                </span>
              </div>
              <p className="text-[11px] text-foreground/80 line-clamp-2">{m.mensagem}</p>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>
                  {format(new Date(m.created_at), 'dd/MM HH:mm', { locale: ptBR })} • tent: {m.tentativas}
                  {m.delivered_at && ` • entr ${format(new Date(m.delivered_at), 'HH:mm')}`}
                  {m.read_at && ` • lida ${format(new Date(m.read_at), 'HH:mm')}`}
                </span>
                <div className="flex gap-2">
                  {!['sent','delivered','read'].includes(m.status) && <button onClick={() => retryItem(m)} className="text-primary">Reenviar</button>}
                  <button onClick={() => removeItem(m.id)} className="text-destructive"><Trash2 size={11}/></button>
                </div>
              </div>
              {m.erro && <p className="text-[10px] text-destructive line-clamp-2">⚠ {m.erro}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
