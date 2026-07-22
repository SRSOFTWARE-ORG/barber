import { useCallback, useEffect, useState } from 'react';
import {
  Server, Cpu, Smartphone, Wifi, WifiOff, RefreshCw, CheckCircle2, XCircle,
  MessageSquare, CreditCard, Sparkles, Download, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface SystemStats {
  ai: { configured: boolean; provider: string };
  evolution: { total: number; connected: number; disconnected: number };
  mercadopago: { accounts: number };
  whatsappQueue: { total: number; pending: number; sent: number; failed: number };
  webhooks24h: number;
  generatedAt: string;
}

function StatusRow({
  icon: Icon, label, value, ok, detail,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  ok: boolean | null;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/20 last:border-0">
      <div className="h-9 w-9 rounded-lg bg-input/40 flex items-center justify-center shrink-0">
        <Icon size={16} className="text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground font-heading">{label}</p>
        {detail && <p className="text-[11px] text-muted-foreground truncate">{detail}</p>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs text-foreground">{value}</span>
        {ok === true && <CheckCircle2 size={15} className="text-emerald-400" />}
        {ok === false && <XCircle size={15} className="text-destructive" />}
        {ok === null && <AlertTriangle size={15} className="text-amber-400" />}
      </div>
    </div>
  );
}

export default function CeoSystemPanel() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [swActive, setSwActive] = useState(false);
  const [installed, setInstalled] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-admin', { body: { action: 'system' } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setStats(data as SystemStats);
    } catch {
      /* silencioso */
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);

    // Standalone / instalado
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setInstalled(standalone);

    // Service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => setSwActive(!!reg?.active));
    }

    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return (
    <section className="px-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base text-primary flex items-center gap-2">
          <Server size={16} /> Sistema & Integrações
        </h2>
        <button onClick={load} disabled={loading} className="text-primary flex items-center gap-1 text-xs disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {/* PWA / Publicação */}
      <div className="wood-card px-4 py-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-heading mb-1">Aplicativo (PWA)</p>
        <StatusRow
          icon={Smartphone}
          label="Modo de exibição"
          value={installed ? 'Instalado' : 'Navegador'}
          ok={installed ? true : null}
          detail={installed ? 'Rodando como app na tela inicial' : 'Ainda não adicionado à tela inicial'}
        />
        <StatusRow
          icon={Download}
          label="Service Worker"
          value={swActive ? 'Ativo' : 'Inativo'}
          ok={swActive}
          detail="Cache e funcionamento offline"
        />
        <StatusRow
          icon={online ? Wifi : WifiOff}
          label="Conexão"
          value={online ? 'Online' : 'Offline'}
          ok={online}
        />
        <StatusRow
          icon={ShieldCheck}
          label="Plataforma"
          value="PWA"
          ok={true}
          detail="Web App instalável (iOS / Android)"
        />
      </div>

      {/* Integrações */}
      <div className="wood-card px-4 py-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-heading mb-1">APIs & Integrações</p>
        {loading && !stats ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-9 rounded-lg bg-input/30 animate-pulse" />)}
          </div>
        ) : stats ? (
          <>
            <StatusRow
              icon={Sparkles}
              label="Inteligência Artificial"
              value={stats.ai.configured ? 'Conectada' : 'Off'}
              ok={stats.ai.configured}
              detail={stats.ai.provider}
            />
            <StatusRow
              icon={MessageSquare}
              label="WhatsApp (Evolution)"
              value={`${stats.evolution.connected}/${stats.evolution.total}`}
              ok={stats.evolution.total === 0 ? null : stats.evolution.connected > 0}
              detail={`${stats.evolution.connected} conectadas · ${stats.evolution.disconnected} offline`}
            />
            <StatusRow
              icon={CreditCard}
              label="Pagamentos (Mercado Pago)"
              value={stats.mercadopago.accounts > 0 ? 'Conectado' : 'Off'}
              ok={stats.mercadopago.accounts > 0 ? true : null}
              detail={`${stats.mercadopago.accounts} conta(s) vinculada(s)`}
            />
            <StatusRow
              icon={Cpu}
              label="Fila de mensagens"
              value={String(stats.whatsappQueue.pending)}
              ok={stats.whatsappQueue.failed === 0 ? true : false}
              detail={`${stats.whatsappQueue.sent} enviadas · ${stats.whatsappQueue.failed} com erro · ${stats.webhooks24h} eventos 24h`}
            />
          </>
        ) : (
          <p className="text-center text-muted-foreground py-4 text-sm">Não foi possível carregar o status.</p>
        )}
      </div>

      {stats && (
        <p className="text-center text-[10px] text-muted-foreground/70">
          Atualizado às {new Date(stats.generatedAt).toLocaleTimeString('pt-BR')}
        </p>
      )}
    </section>
  );
}
