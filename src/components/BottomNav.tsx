import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Home, User, Bell, MoreHorizontal, MessageCircle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeDock, getDockHidden } from '@/lib/dock-visibility';
import { useT } from '@/contexts/LanguageContext';

const navItems = [
  { icon: Home, key: 'nav.home', path: '/' },
  { icon: MessageCircle, key: 'nav.chat', path: '/chat' },
  { icon: Bell, key: 'nav.notifications', path: '/notifications' },
  { icon: User, key: 'nav.profile', path: '/profile' },
  { icon: MoreHorizontal, key: 'nav.more', path: '/more' },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const t = useT();

  // Visibilidade controlada por telas (modal de serviço, convite, etc.)
  const dockHidden = useSyncExternalStore(subscribeDock, getDockHidden, getDockHidden);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notificacoes-unread', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase
        .from('notificacoes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('lida', false)
        .neq('tipo', 'whatsapp');
      return count || 0;
    },
    enabled: !!user,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const { data: unreadMessages = 0 } = useQuery({
    queryKey: ['mensagens-unread', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase
        .from('mensagens')
        .select('*', { count: 'exact', head: true })
        .eq('destinatario_id', user.id)
        .eq('lida', false)
        .eq('apagada_destinatario', false);
      return count || 0;
    },
    enabled: !!user,
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const go = (path: string) => {
    navigate(path);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
  };

  // Esconde em telas de pagamento (agendamento e faturas).
  const hideOnPayment =
    location.pathname.startsWith('/pagamento') || location.pathname.startsWith('/fatura');
  if (hideOnPayment) return null;

  // Esconde durante o fluxo de convite (usuário deslogado com convite pendente).
  if (!user) {
    let hasPendingInvite = false;
    try {
      hasPendingInvite =
        !!localStorage.getItem('pendingBarberRef') ||
        !!localStorage.getItem('pendingInviteCode');
    } catch {}
    if (hasPendingInvite) return null;
  }

  // Esconde quando uma tela pediu (ex.: detalhe de serviço, convite).
  if (dockHidden) return null;

  return createPortal(
    <div
      className="flex justify-center pointer-events-none pb-[max(0.6rem,env(safe-area-inset-bottom))]"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
      }}
    >
      <nav
        className="dock-nav pointer-events-auto flex items-stretch gap-0.5 px-1.5 py-1.5 rounded-[26px]"
        style={{
          backgroundColor: 'rgba(20, 20, 22, 0.55)',
          backdropFilter: 'blur(26px) saturate(180%)',
          WebkitBackdropFilter: 'blur(26px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.10)',
          boxShadow:
            '0 8px 32px -6px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.10) inset, 0 -1px 0 rgba(0,0,0,0.4) inset',
        }}
      >
        {navItems.map(({ icon: Icon, key, path }) => {
          const label = t(key);
          const active = location.pathname === path;
          const badgeCount =
            path === '/notifications' ? unreadCount : path === '/chat' ? unreadMessages : 0;
          return (
            <button
              key={path}
              onClick={() => go(path)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={`group relative flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-[20px] transition-colors duration-200 ${
                active
                  ? 'text-foreground'
                  : 'text-foreground/55 hover:text-foreground/80'
              }`}
              style={
                active
                  ? {
                      backgroundColor: 'rgba(255,255,255,0.13)',
                      boxShadow: '0 1px 0 rgba(255,255,255,0.12) inset, 0 1px 6px rgba(0,0,0,0.25)',
                    }
                  : undefined
              }
            >
              <div className="relative flex items-center justify-center">
                <Icon size={23} strokeWidth={active ? 2.1 : 1.7} />
                {badgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 h-[15px] min-w-[15px] px-[3px] rounded-full bg-green-500 text-[8px] leading-none flex items-center justify-center text-white font-bold shadow-[0_1px_3px_rgba(0,0,0,0.5)] ring-2 ring-[rgba(20,20,22,0.9)]">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-medium tracking-wide leading-none">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>,
    document.body
  );
}
