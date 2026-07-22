import { useCallback } from 'react';
import { ArrowLeft, Bell, Check, CheckCheck, Trash2 } from 'lucide-react';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import Seo from '@/components/Seo';
import { ptBR } from 'date-fns/locale';

interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  lida: boolean;
  created_at: string;
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notificacoes = [], isLoading } = useQuery({
    queryKey: ['notificacoes', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('notificacoes')
        .select('*')
        .eq('user_id', user.id)
        // Oculta notificações de log do sistema (ex.: status de conexão do WhatsApp)
        .neq('tipo', 'whatsapp')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Notificacao[];
    },
    enabled: !!user,
  });

  const decUnread = (n: number) => {
    if (!user || n <= 0) return;
    queryClient.setQueryData(['notificacoes-unread', user.id], (old: number = 0) =>
      Math.max(0, (old || 0) - n)
    );
  };

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('notificacoes').update({ lida: true }).eq('id', id);
    },
    onMutate: async (id: string) => {
      const wasUnread = notificacoes.find(n => n.id === id && !n.lida);
      if (wasUnread) decUnread(1);
      queryClient.setQueryData(['notificacoes', user?.id], (old: Notificacao[] = []) =>
        old.map(n => n.id === id ? { ...n, lida: true } : n)
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notificacoes'] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user) return;
      await supabase.from('notificacoes').update({ lida: true }).eq('user_id', user.id).eq('lida', false);
    },
    onMutate: async () => {
      if (!user) return;
      queryClient.setQueryData(['notificacoes-unread', user.id], 0);
      queryClient.setQueryData(['notificacoes', user.id], (old: Notificacao[] = []) =>
        old.map(n => ({ ...n, lida: true }))
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notificacoes'] }),
  });

  const deleteNotification = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('notificacoes').delete().eq('id', id);
    },
    onMutate: async (id: string) => {
      const wasUnread = notificacoes.find(n => n.id === id && !n.lida);
      if (wasUnread) decUnread(1);
      queryClient.setQueryData(['notificacoes', user?.id], (old: Notificacao[] = []) =>
        old.filter(n => n.id !== id)
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notificacoes'] }),
  });

  const deleteAll = useMutation({
    mutationFn: async () => {
      if (!user) return;
      await supabase.from('notificacoes').delete().eq('user_id', user.id);
    },
    onMutate: async () => {
      if (!user) return;
      queryClient.setQueryData(['notificacoes-unread', user.id], 0);
      queryClient.setQueryData(['notificacoes', user.id], []);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notificacoes'] }),
  });

  const unreadCount = notificacoes.filter(n => !n.lida).length;

  const { pullRefreshProps, PullIndicator } = usePullRefresh({
    onRefresh: useCallback(async () => {
      await queryClient.invalidateQueries({ queryKey: ['notificacoes'] });
    }, [queryClient]),
  });

  return (
    <div className="page-shell min-h-screen overflow-y-auto" {...pullRefreshProps}>
      <Seo path="/notifications" title="Notificações — Barbearia" description="Acompanhe lembretes de agendamento, confirmações e novidades da sua barbearia em um só lugar." />
      <PullIndicator />
      <div className="page-header flex items-center justify-between px-4 gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-primary" aria-label="Voltar para início"><ArrowLeft size={24} /></button>
          <h1 className="font-heading text-xl text-foreground">Notificações</h1>
        </div>
        <div className="flex flex-col items-end gap-1">
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              className="text-xs text-primary flex items-center gap-1"
            >
              <CheckCheck size={14} /> Marcar todas como lidas
            </button>
          )}
          {notificacoes.length > 0 && (
            <button
              onClick={() => deleteAll.mutate()}
              className="text-xs text-destructive flex items-center gap-1"
            >
              <Trash2 size={14} /> Limpar todas
            </button>
          )}
        </div>
      </div>

      <div className="px-4 space-y-2">
        {!user && (
          <p className="text-center text-muted-foreground py-8">Faça login para ver suas notificações.</p>
        )}

        {user && isLoading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {user && !isLoading && notificacoes.length === 0 && (
          <p className="text-center text-muted-foreground py-8">Nenhuma notificação ainda.</p>
        )}

        {notificacoes.map(n => (
          <div
            key={n.id}
            className={`wood-card px-4 py-3 flex items-start gap-3 transition-opacity ${n.lida ? 'opacity-60' : ''}`}
          >
            <Bell size={18} className="text-primary mt-1 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-foreground text-sm font-semibold">{n.titulo}</p>
              <p className="text-foreground/80 text-sm">{n.mensagem}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(n.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
            {!n.lida && (
              <button
                onClick={() => markRead.mutate(n.id)}
                className="text-primary p-1 flex-shrink-0"
                title="Marcar como lida"
                aria-label="Marcar como lida"
              >
                <Check size={16} />
              </button>
            )}
            <button
              onClick={() => deleteNotification.mutate(n.id)}
              className="text-destructive p-1 flex-shrink-0"
              title="Excluir"
              aria-label="Excluir notificação"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
