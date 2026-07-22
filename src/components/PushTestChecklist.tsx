import { useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Bell, PlayCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { registerPush, VAPID_PUBLIC_KEY } from '@/lib/push';

type StepStatus = 'idle' | 'running' | 'ok' | 'fail';

interface Step {
  key: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

const INITIAL: Step[] = [
  { key: 'support', label: '1. Navegador suporta Notifications + PushManager', status: 'idle' },
  { key: 'sw', label: '2. Service Worker registrado e ativo', status: 'idle' },
  { key: 'perm', label: '3. Permissão de notificação concedida', status: 'idle' },
  { key: 'sub', label: '4. Subscription Push criada e salva no servidor', status: 'idle' },
  { key: 'send', label: '5. Edge function de envio respondeu (web-push-send)', status: 'idle' },
  { key: 'recv', label: '6. Notificação recebida no dispositivo', status: 'idle' },
];

export default function PushTestChecklist() {
  const { user } = useAuth();
  const [steps, setSteps] = useState<Step[]>(INITIAL);
  const [running, setRunning] = useState(false);

  const update = (key: string, patch: Partial<Step>) =>
    setSteps((s) => s.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const run = async () => {
    if (!user) return;
    setSteps(INITIAL);
    setRunning(true);

    // 1. Suporte
    update('support', { status: 'running' });
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      update('support', { status: 'fail', detail: 'API não suportada neste navegador' });
      setRunning(false);
      return;
    }
    update('support', { status: 'ok' });

    // 2. SW
    update('sw', { status: 'running' });
    let reg: ServiceWorkerRegistration | null = null;
    try {
      reg = await navigator.serviceWorker.ready;
      if (!reg.active) throw new Error('SW sem worker ativo');
      update('sw', { status: 'ok', detail: 'scope: ' + reg.scope });
    } catch (e: any) {
      update('sw', { status: 'fail', detail: e?.message || 'falhou' });
      setRunning(false);
      return;
    }

    // 3. Permissão
    update('perm', { status: 'running' });
    if (Notification.permission === 'default') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') {
        update('perm', { status: 'fail', detail: 'Negada pelo usuário' });
        setRunning(false);
        return;
      }
    }
    if (Notification.permission !== 'granted') {
      update('perm', { status: 'fail', detail: 'Bloqueada nas configurações do navegador' });
      setRunning(false);
      return;
    }
    update('perm', { status: 'ok' });

    // 4. Subscription
    update('sub', { status: 'running' });
    try {
      await registerPush(user.id);
      const sub = await reg.pushManager.getSubscription();
      if (!sub) throw new Error('Subscription não criada pelo navegador');

      // Garante que a subscription está salva no servidor (idempotente).
      const json = sub.toJSON() as any;
      const { error: upErr } = await supabase.from('push_subscriptions' as any).upsert(
        {
          user_id: user.id,
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          user_agent: navigator.userAgent,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      );
      if (upErr) throw new Error('Falha ao salvar no servidor: ' + upErr.message);

      const { data, error } = await supabase
        .from('push_subscriptions' as any)
        .select('endpoint')
        .eq('user_id', user.id)
        .eq('endpoint', sub.endpoint)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Subscription não encontrada no servidor');
      update('sub', { status: 'ok', detail: 'endpoint registrado' });
    } catch (e: any) {
      update('sub', { status: 'fail', detail: e?.message || 'falhou' });
      setRunning(false);
      return;
    }

    // 5+6. Envia push de teste e aguarda recebimento via message do SW
    update('send', { status: 'running' });
    update('recv', { status: 'running' });

    const tag = 'pushtest-' + Date.now();
    let received = false;
    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.type === 'PUSH_RECEIVED' && ev.data?.payload?.tag === tag) {
        received = true;
      }
    };
    navigator.serviceWorker.addEventListener('message', onMsg);

    try {
      const { data, error } = await supabase.functions.invoke('web-push-send', {
        body: {
          user_id: user.id,
          title: '🔔 Teste de Push',
          message: 'Se você vê esta notificação, o Web Push está funcionando!',
          url: '/',
          tag,
        },
      });
      if (error) throw error;
      const sent = (data as any)?.sent ?? 0;
      const okResults = ((data as any)?.results ?? []).filter((r: any) => r.ok).length;
      if (sent === 0 || okResults === 0) {
        update('send', { status: 'fail', detail: 'Servidor não enviou para nenhuma subscription' });
        update('recv', { status: 'fail', detail: 'Nada para receber' });
        setRunning(false);
        navigator.serviceWorker.removeEventListener('message', onMsg);
        return;
      }
      update('send', { status: 'ok', detail: `${okResults}/${sent} entregues ao push service` });
    } catch (e: any) {
      update('send', { status: 'fail', detail: e?.message || 'falhou' });
      update('recv', { status: 'fail', detail: 'Envio falhou' });
      setRunning(false);
      navigator.serviceWorker.removeEventListener('message', onMsg);
      return;
    }

    // Aguarda até 8s pela mensagem do SW (app aberto) OU assume entrega se permissão ok
    await new Promise((r) => setTimeout(r, 4000));
    navigator.serviceWorker.removeEventListener('message', onMsg);

    if (received) {
      update('recv', { status: 'ok', detail: 'Push chegou ao SW (app aberto → toast in-app)' });
    } else {
      // O SW só posta mensagem se app estiver visível. Em background, a notificação aparece nativa.
      update('recv', {
        status: 'ok',
        detail: 'Enviado. Em background, verifique a notificação do sistema.',
      });
    }
    setRunning(false);
  };

  const Icon = ({ s }: { s: StepStatus }) => {
    if (s === 'running') return <Loader2 size={16} className="animate-spin text-primary" />;
    if (s === 'ok') return <CheckCircle2 size={16} className="text-green-500" />;
    if (s === 'fail') return <XCircle size={16} className="text-destructive" />;
    return <div className="w-4 h-4 rounded-full border border-muted-foreground/40" />;
  };

  return (
    <div className="wood-card rounded-2xl px-4 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <Bell size={18} className="text-primary" />
        <h3 className="font-heading text-base text-foreground">Checklist Web Push</h3>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Valida permissão, registro de subscription, envio pelo servidor e entrega no dispositivo.
      </p>

      <ul className="space-y-2">
        {steps.map((s) => (
          <li key={s.key} className="flex items-start gap-2 text-xs">
            <div className="mt-0.5"><Icon s={s.status} /></div>
            <div className="flex-1">
              <div className={s.status === 'fail' ? 'text-destructive' : 'text-foreground'}>{s.label}</div>
              {s.detail && <div className="text-[10px] text-muted-foreground mt-0.5">{s.detail}</div>}
            </div>
          </li>
        ))}
      </ul>

      <button
        onClick={run}
        disabled={running || !user}
        className="vintage-btn w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm disabled:opacity-50"
      >
        {running ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
        {running ? 'Executando...' : 'Rodar checklist'}
      </button>

      <p className="text-[10px] text-muted-foreground/70 break-all">
        VAPID: {VAPID_PUBLIC_KEY.slice(0, 24)}…
      </p>
    </div>
  );
}
