import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

import { toast } from 'sonner';
import {
  QrCode, RefreshCw, CheckCircle2, Loader2, Smartphone, Trash2, ShieldCheck, Wifi, WifiOff, AlertTriangle,
} from 'lucide-react';
import WhatsAppAuditLog from './WhatsAppAuditLog';

type StatusResp = {
  instance: string; state: string; paired: boolean;
  number?: string | null; qr?: string | null; warnings?: string[];
};

const asQrSrc = (qr?: string | null) =>
  !qr ? null : qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`;

// Tempo de validade aproximado de um QR Code da Evolution (segundos).
const QR_TTL = 45;

export default function WhatsAppIntegrationCard({ barbeiroId }: { barbeiroId?: string }) {


  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [qrExpired, setQrExpired] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(QR_TTL);
  const [state, setState] = useState<string>('idle');
  const [instance, setInstance] = useState<string>('');
  const [number, setNumber] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const ttlRef = useRef<number | null>(null);

  const connected = state === 'open';

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);
  const stopTtl = useCallback(() => {
    if (ttlRef.current) { clearInterval(ttlRef.current); ttlRef.current = null; }
  }, []);

  const callFn = useCallback(async (action: string): Promise<StatusResp | null> => {
    const { data, error } = await supabase.functions.invoke('evolution-instance', {
      body: { action, barbeiro_id: barbeiroId ?? undefined },
    });
    if (error) {
      const msg = error.message || 'Falha na comunicação com o servidor.';
      setErrorMsg(msg); toast.error(msg); return null;
    }
    if (data?.error) {
      setErrorMsg(data.error); toast.error(data.error); return null;
    }
    setErrorMsg(null);
    return data as StatusResp;
  }, [barbeiroId]);

  const refreshStatus = useCallback(async () => {
    const d = await callFn('status');
    if (!d) return;
    setInstance(d.instance);
    setState(d.state);
    setNumber(d.number ?? null);
    if (d.state === 'open') { setQr(null); stopPoll(); stopTtl(); }
  }, [callFn, stopPoll, stopTtl]);

  useEffect(() => {
    (async () => { setLoading(true); await refreshStatus(); setLoading(false); })();
    return () => { stopPoll(); stopTtl(); };
  }, [refreshStatus, stopPoll, stopTtl]);

  // Cronômetro de expiração do QR.
  const startTtl = useCallback(() => {
    stopTtl();
    setSecondsLeft(QR_TTL);
    setQrExpired(false);
    ttlRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { stopTtl(); setQrExpired(true); return 0; }
        return s - 1;
      });
    }, 1000);
  }, [stopTtl]);

  const startPolling = useCallback(() => {
    stopPoll();
    let delay = 5000;
    const maxDelay = 30000;
    const tick = async () => {
      // Pausa em segundo plano: não acorda a sincronização do dispositivo.
      if (typeof document !== 'undefined' && document.hidden) {
        pollRef.current = window.setTimeout(tick, delay);
        return;
      }
      const { data, error } = await supabase.functions.invoke('evolution-instance', {
        body: { action: 'status', barbeiro_id: barbeiroId ?? undefined },
      });
      const d = data as StatusResp | undefined;
      if (error || !d || (d as any)?.error) {
        // Erro/timeout: backoff exponencial em vez de retry instantâneo.
        delay = Math.min(maxDelay, delay * 2);
        pollRef.current = window.setTimeout(tick, delay);
        return;
      }
      delay = 5000; // sucesso → intervalo base
      setState(d.state);
      setNumber(d.number ?? null);
      if (d.state === 'open') {
        setQr(null);
        stopPoll(); stopTtl();
        toast.success('WhatsApp Conectado com Sucesso!');
        return;
      }
      pollRef.current = window.setTimeout(tick, delay);
    };
    pollRef.current = window.setTimeout(tick, delay);
  }, [barbeiroId, stopPoll, stopTtl]);

  // Cria a instância (primeira vez).
  const generate = useCallback(async () => {
    setGenerating(true);
    const d = await callFn('create');
    setGenerating(false);
    if (!d) return;
    setInstance(d.instance);
    setState(d.state);
    setQr(asQrSrc(d.qr));
    if (d.warnings?.includes('webhook')) {
      toast.warning('Conexão criada, mas o webhook não pôde ser configurado. As atualizações automáticas podem atrasar.');
    }
    if (d.state === 'open') { toast.success('WhatsApp já está conectado!'); return; }
    if (d.qr) { startTtl(); startPolling(); }
  }, [callFn, startPolling, startTtl]);

  // Regenera apenas o QR (reaproveita a instância existente).
  const regenerateQr = useCallback(async () => {
    setGenerating(true);
    const d = await callFn('qr');
    setGenerating(false);
    if (!d) return;
    setInstance(d.instance);
    setState(d.state);
    if (d.state === 'open') { setQr(null); stopPoll(); stopTtl(); toast.success('WhatsApp já está conectado!'); return; }
    setQr(asQrSrc(d.qr));
    if (d.qr) { startTtl(); startPolling(); }
  }, [callFn, startPolling, startTtl, stopPoll, stopTtl]);

  const disconnect = useCallback(async () => {
    setDisconnecting(true);
    const d = await callFn('disconnect');
    setDisconnecting(false);
    if (!d) return;
    setState('deleted'); setQr(null); setNumber(null);
    stopPoll(); stopTtl();
    toast.success('Instância desconectada e apagada.');
  }, [callFn, stopPoll, stopTtl]);

  if (loading) {
    return (
      <div className="wood-card px-4 py-10 flex flex-col items-center justify-center gap-3">
        <Loader2 className="animate-spin text-primary" size={28} />
        <p className="text-xs text-muted-foreground">Verificando conexão...</p>
      </div>
    );
  }

  return (
    <section className="px-4 space-y-4">
      {/* Banner de erro */}
      {errorMsg && (
        <div className="wood-card px-4 py-3 flex items-start gap-2 border border-destructive/40">
          <AlertTriangle size={16} className="text-destructive shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-heading text-destructive">Ocorreu um problema</p>
            <p className="text-[11px] text-muted-foreground break-words">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Cabeçalho de status */}
      <div className={`wood-card px-4 py-3 flex items-center justify-between gap-3 border ${connected ? 'border-green-500/40' : 'border-border/40'}`}>
        <div className="flex items-center gap-2 min-w-0">
          {connected
            ? <Wifi size={18} className="text-green-500 shrink-0" />
            : <WifiOff size={18} className="text-muted-foreground shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-heading text-foreground">
              {connected ? 'WhatsApp Ativo' : state === 'connecting' || qr ? 'Aguardando leitura do QR' : 'WhatsApp Desconectado'}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {instance ? `Instância: ${instance}` : 'Sem instância'}
            </p>
          </div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${
          connected ? 'bg-green-900/40 text-green-400'
          : qr ? 'bg-yellow-900/40 text-yellow-400'
          : 'bg-muted text-muted-foreground'
        }`}>
          {connected ? 'CONECTADO' : qr ? 'AGUARDANDO QR' : 'OFFLINE'}
        </span>
      </div>

      {/* Estado conectado */}
      {connected ? (
        <div className="wood-card px-4 py-6 flex flex-col items-center text-center gap-3">
          <div className="relative">
            <CheckCircle2 size={56} className="text-green-500" />
            <span className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
          </div>
          <h3 className="font-heading text-lg text-foreground">WhatsApp Conectado!</h3>
          {number && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Smartphone size={14} className="text-primary" /> +{number}
            </p>
          )}
          <button
            onClick={disconnect}
            disabled={disconnecting}
            className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-heading disabled:opacity-50 hover:opacity-90 transition"
          >
            {disconnecting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Desconectar / Apagar Instância
          </button>
        </div>
      ) : (
        /* Estado de pareamento */
        <div className="wood-card px-4 py-6 flex flex-col items-center text-center gap-4">
          {qr ? (
            <>
              <div className="relative rounded-xl bg-white p-3 shadow-lg">
                <img src={qr} alt="QR Code de conexão" className={`w-56 h-56 object-contain transition ${qrExpired ? 'opacity-30 blur-[2px]' : ''}`} />
                {/* Linha de scanner animada */}
                {!qrExpired && (
                  <div className="pointer-events-none absolute inset-3 overflow-hidden rounded-lg">
                    <div className="qr-scanline" />
                  </div>
                )}
                {qrExpired && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl bg-black/50">
                    <AlertTriangle size={22} className="text-yellow-400" />
                    <span className="text-[11px] font-bold text-white">QR expirado</span>
                  </div>
                )}
              </div>

              {!qrExpired ? (
                <>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Abra o WhatsApp &gt; <b>Aparelhos conectados</b> &gt; <b>Conectar aparelho</b> e aponte para o código.
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-yellow-400">
                    <Loader2 size={12} className="animate-spin" /> Aguardando conexão... (expira em {secondsLeft}s)
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground max-w-xs">
                  O código expirou antes da leitura. Gere um novo QR Code para continuar.
                </p>
              )}

              <button
                onClick={regenerateQr}
                disabled={generating}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-heading disabled:opacity-50 ${
                  qrExpired ? 'vintage-btn' : 'text-primary underline text-xs'
                }`}
              >
                <RefreshCw size={qrExpired ? 16 : 12} className={generating ? 'animate-spin' : ''} />
                {qrExpired ? 'Gerar novo QR Code' : 'Gerar novo QR'}
              </button>
            </>
          ) : (
            <>
              <QrCode size={48} className="text-primary" />
              <p className="text-sm text-muted-foreground max-w-xs">
                Conecte o WhatsApp da sua barbearia para enviar confirmações e lembretes automáticos aos clientes.
              </p>
              <button
                onClick={generate}
                disabled={generating}
                className="vintage-btn flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-heading disabled:opacity-50"
              >
                {generating ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
                Gerar QR Code de Conexão
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex items-start gap-2 text-[11px] text-muted-foreground px-1">
        <ShieldCheck size={14} className="text-primary shrink-0 mt-0.5" />
        <span>Conexão segura via servidor próprio. As mensagens usam proteção anti-bloqueio automática.</span>
      </div>

      {/* Histórico de ações */}
      <WhatsAppAuditLog />
    </section>
  );
}
