import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { registerPush } from '@/lib/push';
import { playNotifSound, primeAudioOnFirstGesture } from '@/lib/notif-sound';

/**
 * Listener global e robusto para notificações e mensagens em tempo real.
 * - Funciona em segundo plano (background tab)
 * - Reconecta automaticamente após perda de conexão / volta da aba
 * - Mostra toasts mesmo quando o usuário não está na página de origem
 * - Invalida caches do React Query para atualizar badges instantaneamente
 */
export default function GlobalNotifier() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const channelsRef = useRef<any[]>([]);

  useEffect(() => {
    if (!user) return;

    const setup = () => {
      // limpa canais antigos
      channelsRef.current.forEach((c) => supabase.removeChannel(c));
      channelsRef.current = [];

      const isAppVisible = () => document.visibilityState === 'visible' && document.hasFocus();

      const notifChannel = supabase
        .channel(`global-notif-${user.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `user_id=eq.${user.id}` },
          (payload) => {
            const n = payload.new as any;
            qc.invalidateQueries({ queryKey: ['notificacoes-unread', user.id] });
            qc.invalidateQueries({ queryKey: ['notificacoes', user.id] });

            // Quando o app está visível, mostramos UI (toast) e suprimimos a notificação
            // do sistema, pois o Web Push em background já entrega quando app está fechado.
            if (isAppVisible()) {
              playNotifSound();
              toast(n.titulo || 'Nova notificação', {
                description: n.mensagem,
                duration: 6000,
                action: { label: 'Ver', onClick: () => navigate('/notifications') },
              });
            }
          }
        )
        .subscribe();

      const msgChannel = supabase
        .channel(`global-msg-${user.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `destinatario_id=eq.${user.id}` },
          (payload) => {
            const m = payload.new as any;
            qc.invalidateQueries({ queryKey: ['mensagens-unread', user.id] });
            qc.invalidateQueries({ queryKey: ['mensagens'] });

            // Marca como ENTREGUE assim que o destinatário recebe via realtime
            if (!m.entregue) {
              supabase.from('mensagens')
                .update({ entregue: true, entregue_em: new Date().toISOString() } as any)
                .eq('id', m.id);
            }

            // App visível e fora do chat: toast (sem notificação do sistema, sem duplicar)
            if (isAppVisible() && !window.location.pathname.startsWith('/chat')) {
              playNotifSound();
              toast('Nova mensagem', {
                description: m.conteudo?.slice(0, 80),
                duration: 5000,
                action: { label: 'Abrir', onClick: () => navigate('/chat') },
              });
            }
          }
        )
        .subscribe();

      channelsRef.current = [notifChannel, msgChannel];
    };

    setup();
    primeAudioOnFirstGesture();

    // pede permissão para notificação nativa + registra Web Push (background)
    // Permissão é pedida pelo PushPermissionModal. Se já está concedida, apenas re-registra.
    if ('Notification' in window && Notification.permission === 'granted') {
      registerPush(user.id);
    }

    // reconectar quando a aba volta ao foco
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        qc.invalidateQueries({ queryKey: ['notificacoes-unread', user.id] });
        qc.invalidateQueries({ queryKey: ['mensagens-unread', user.id] });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', setup);

    // SW avisa quando um push chega com app aberto — tocar som e mostrar toast leve
    const onSwMessage = (ev: MessageEvent) => {
      if (ev.data?.type === 'PUSH_RECEIVED') {
        playNotifSound();
        const p = ev.data.payload || {};
        if (p.title) {
          toast(p.title, { description: p.body, duration: 5000 });
        }
      }
    };
    navigator.serviceWorker?.addEventListener?.('message', onSwMessage);

    // refresh periódico como fallback (caso o socket caia)
    const interval = setInterval(() => {
      qc.invalidateQueries({ queryKey: ['notificacoes-unread', user.id] });
      qc.invalidateQueries({ queryKey: ['mensagens-unread', user.id] });
    }, 30000);

    return () => {
      channelsRef.current.forEach((c) => supabase.removeChannel(c));
      channelsRef.current = [];
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', setup);
      navigator.serviceWorker?.removeEventListener?.('message', onSwMessage);
      clearInterval(interval);
    };
  }, [user, navigate, qc]);

  return null;
}
