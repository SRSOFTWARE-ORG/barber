import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  RefreshCw, Loader2, Wifi, WifiOff, QrCode, RotateCw, Trash2, Activity, CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import WhatsAppAuditLog from './WhatsAppAuditLog';


interface HealthItem {
  user_id: string;
  shop_name: string;
  display_name: string | null;
  instance: string;
  state: string;
  number: string | null;
  paired: boolean;
}

const STATE_META: Record<string, { label: string; cls: string; dot: string; Icon: any }> = {
  open: { label: 'Conectado', cls: 'text-green-400 bg-green-900/30', dot: 'bg-green-500', Icon: Wifi },
  connecting: { label: 'Aguardando QR', cls: 'text-yellow-400 bg-yellow-900/30', dot: 'bg-yellow-500', Icon: QrCode },
  close: { label: 'Desconectado', cls: 'text-destructive bg-destructive/20', dot: 'bg-destructive', Icon: WifiOff },
  not_created: { label: 'Sem instância', cls: 'text-muted-foreground bg-muted', dot: 'bg-muted-foreground', Icon: WifiOff },
  error: { label: 'Erro', cls: 'text-destructive bg-destructive/20', dot: 'bg-destructive', Icon: XCircle },
};
const metaFor = (s: string) => STATE_META[s] || STATE_META[s === 'unknown' ? 'error' : s] || STATE_META.error;

export default function WhatsAppHealthPanel() {
  const [items, setItems] = useState<HealthItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('evolution-instance', { body: { action: 'ceo-list' } });
    setLoading(false);
    if (error || data?.error) { toast.error(error?.message || data?.error || 'Falha ao carregar'); return; }
    setItems((data?.items || []) as HealthItem[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const action = useCallback(async (item: HealthItem, act: 'restart' | 'disconnect') => {
    setBusy(item.user_id + act);
    const { data, error } = await supabase.functions.invoke('evolution-instance', {
      body: { action: act, barbeiro_id: item.user_id },
    });
    setBusy(null);
    if (error || data?.error) { toast.error(error?.message || data?.error || 'Falha'); return; }
    toast.success(act === 'restart' ? 'Reinicialização enviada' : 'Instância apagada');
    load();
  }, [load]);

  const counts = {
    connected: items.filter(i => i.state === 'open').length,
    waiting: items.filter(i => i.state === 'connecting').length,
    off: items.filter(i => !['open', 'connecting'].includes(i.state)).length,
  };

  return (
    <section className="px-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base text-primary flex items-center gap-2">
          <Activity size={18} /> Saúde das Integrações
        </h2>
        <button onClick={load} disabled={loading} className="vintage-btn px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 disabled:opacity-50">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Conectados', value: counts.connected, cls: 'text-green-400' },
          { label: 'Aguardando', value: counts.waiting, cls: 'text-yellow-400' },
          { label: 'Offline', value: counts.off, cls: 'text-destructive' },
        ].map(k => (
          <div key={k.label} className="wood-card px-2 py-2 text-center">
            <p className={`text-xl font-heading ${k.cls}`}>{k.value}</p>
            <p className="text-[9px] text-muted-foreground uppercase">{k.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <Loader2 className="animate-spin text-primary" size={26} />
          <p className="text-xs text-muted-foreground">Consultando servidor WhatsApp...</p>
        </div>
      ) : items.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-sm">Nenhuma barbearia cadastrada.</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const m = metaFor(item.state);
            const exists = item.state !== 'not_created';
            return (
              <div key={item.user_id} className="wood-card px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`relative inline-flex w-2.5 h-2.5 rounded-full ${m.dot}`}>
                      {item.state === 'open' && <span className={`absolute inset-0 rounded-full ${m.dot} animate-ping opacity-60`} />}
                    </span>
                    <div className="min-w-0">
                      <p className="font-heading text-sm text-foreground truncate">{item.shop_name}</p>
                      <code className="text-[10px] text-muted-foreground truncate block">{item.instance}</code>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap flex items-center gap-1 ${m.cls}`}>
                    <m.Icon size={11} /> {m.label}
                  </span>
                </div>

                {item.number && (
                  <p className="text-[11px] text-muted-foreground">Número: +{item.number}</p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => action(item, 'restart')}
                    disabled={!exists || busy === item.user_id + 'restart'}
                    className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg wood-card hover:bg-secondary/60 disabled:opacity-40"
                  >
                    {busy === item.user_id + 'restart' ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />} Reiniciar
                  </button>
                  <button
                    onClick={() => action(item, 'disconnect')}
                    disabled={!exists || busy === item.user_id + 'disconnect'}
                    className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg bg-destructive/15 text-destructive hover:bg-destructive/25 disabled:opacity-40"
                  >
                    {busy === item.user_id + 'disconnect' ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <WhatsAppAuditLog ceo />
    </section>
  );
}

