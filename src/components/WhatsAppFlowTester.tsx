import { useState, useEffect } from 'react';
import { Send, RefreshCw, CheckCircle2, AlertCircle, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Agendamento { id: string; cliente_nome: string; cliente_sobrenome: string; cliente_telefone: string; data: string; hora: string; barbeiro_id: string | null }

export default function WhatsAppFlowTester() {
  const { user } = useAuth();
  const [ags, setAgs] = useState<Agendamento[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [tipos, setTipos] = useState<{ lembrete: boolean; sinal_pago: boolean }>({ lembrete: true, sinal_pago: true });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    (async () => {
      if (!user?.id) return;
      const { data } = await supabase.from('agendamentos')
        .select('id,cliente_nome,cliente_sobrenome,cliente_telefone,data,hora,barbeiro_id')
        .eq('barbeiro_id', user.id)
        .order('data', { ascending: false })
        .limit(20);
      setAgs(data || []);
      if (data?.[0]) setSelected(data[0].id);
    })();
  }, [user?.id]);

  const fire = async () => {
    if (!selected) { toast.error('Selecione um agendamento'); return; }
    const tiposArr = Object.entries(tipos).filter(([,v]) => v).map(([k]) => k);
    if (!tiposArr.length) { toast.error('Escolha pelo menos um tipo'); return; }
    setSending(true); setResult(null);
    const { data, error } = await supabase.functions.invoke('evolution-test-flow', {
      body: { agendamento_id: selected, tipos: tiposArr },
    });
    setSending(false);
    if (error) { toast.error(error.message); setResult({ ok: false, error: error.message }); return; }
    setResult(data);
    if (data?.ok) toast.success('Fluxo disparado — confira o monitor');
    else toast.error(data?.error || 'Falha');
  };

  return (
    <div className="wood-card px-4 py-4 space-y-3">
      <h3 className="font-heading text-sm text-primary flex items-center gap-2">
        <Calendar size={14}/> Teste de fluxo (Lembrete + Comprovante)
      </h3>
      <p className="text-[11px] text-muted-foreground">Dispara as mensagens reais via WhatsApp para um agendamento existente e registra a entrega na fila.</p>

      <label className="block text-xs">
        <span className="text-muted-foreground">Agendamento</span>
        <select value={selected} onChange={e => setSelected(e.target.value)} className="vintage-input w-full px-3 py-2 rounded-lg mt-1 text-xs">
          {ags.length === 0 && <option value="">Nenhum agendamento</option>}
          {ags.map(a => (
            <option key={a.id} value={a.id}>
              {a.cliente_nome} {a.cliente_sobrenome} • {format(new Date(a.data+'T'+a.hora), 'dd/MM HH:mm', { locale: ptBR })} • {a.cliente_telefone}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        {(['lembrete','sinal_pago'] as const).map(t => (
          <label key={t} className="flex items-center gap-2 text-xs text-foreground/80 wood-card px-3 py-1.5 rounded-lg flex-1 cursor-pointer">
            <input type="checkbox" checked={tipos[t]} onChange={e => setTipos(s => ({ ...s, [t]: e.target.checked }))}/>
            {t === 'lembrete' ? 'Lembrete' : 'Comprovante (sinal pago)'}
          </label>
        ))}
      </div>

      {result && (
        <div className={`text-[11px] px-3 py-2 rounded-lg ${result?.ok ? 'bg-green-900/30 text-green-400' : 'bg-destructive/20 text-destructive'}`}>
          {result?.ok ? <CheckCircle2 size={12} className="inline mr-1"/> : <AlertCircle size={12} className="inline mr-1"/>}
          {result?.ok ? `Instância: ${result.instance}` : (result.error || 'Falha')}
          {result?.results && (
            <ul className="mt-1 space-y-0.5">
              {result.results.map((r: any, i: number) => (
                <li key={i} className="text-foreground/80">• {r.tipo}: {r.skipped ? `⊘ ${r.skipped}` : (r.ok ? '✓ enviado' : `✗ falha (${r.status})`)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button onClick={fire} disabled={sending || !selected} className="vintage-btn w-full py-2 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-40">
        {sending ? <RefreshCw size={14} className="animate-spin"/> : <Send size={14}/>}
        {sending ? 'Disparando...' : 'Disparar fluxo de teste'}
      </button>
    </div>
  );
}
