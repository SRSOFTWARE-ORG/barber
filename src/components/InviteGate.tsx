import { useEffect, useState, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ClientAuthForm from './ClientAuthForm';
import { setDockHidden } from '@/lib/dock-visibility';
import logoImg from '@/assets/barber-logo.png';

/**
 * Captures invite info (?ref=, ?i=, /r/:code) from URL into localStorage and,
 * while a pending invite exists AND the user is not logged in, BLOCKS the
 * entire app UI showing ONLY the login/signup form. After successful auth,
 * the link client→barber is created and the gate releases.
 */
export default function InviteGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [pendingRef, setPendingRef] = useState<string | null>(null);
  const [barberName, setBarberName] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [resolvingCode, setResolvingCode] = useState(false);

  // Resolve the inviting barber's name so the gate can be personalized.
  useEffect(() => {
    if (!pendingRef) { setBarberName(null); return; }
    let active = true;
    supabase.rpc('get_barber_name', { _barber_id: pendingRef }).then(({ data }) => {
      if (active && data) setBarberName(String(data));
    });
    return () => { active = false; };
  }, [pendingRef]);

  // 1) Capture invite from URL on every navigation
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const refParam = params.get('ref');
    let codeParam = params.get('i');

    // /r/:code shortcut
    const rMatch = location.pathname.match(/^\/r\/([^/]+)$/);
    if (rMatch && !codeParam) codeParam = rMatch[1];

    if (refParam) {
      try { localStorage.setItem('pendingBarberRef', refParam); } catch {}
    }
    if (codeParam) {
      try { localStorage.setItem('pendingInviteCode', codeParam); } catch {}
    }

    // Sync state
    try {
      const stored = localStorage.getItem('pendingBarberRef');
      setPendingRef(stored);
    } catch {}
  }, [location.pathname, location.search]);

  // 2) Resolve invite code → barber id if needed
  useEffect(() => {
    let code: string | null = null;
    try { code = localStorage.getItem('pendingInviteCode'); } catch {}
    if (!code || pendingRef || resolvingCode) return;
    setResolvingCode(true);
    (async () => {
      const { data, error } = await supabase.rpc('resolve_invite_code', { _code: code });
      if (error || !data) {
        try { localStorage.removeItem('pendingInviteCode'); } catch {}
        toast.error('Convite inválido ou expirado.');
      } else {
        try {
          localStorage.setItem('pendingBarberRef', String(data));
          localStorage.removeItem('pendingInviteCode');
        } catch {}
        setPendingRef(String(data));
      }
      setResolvingCode(false);
    })();
  }, [pendingRef, resolvingCode, location.pathname]);

  // 3) Once user is logged in AND there's a pending ref, create the link
  useEffect(() => {
    if (!user || !pendingRef || linking) return;
    setLinking(true);
    (async () => {
      try {
        // Only link if the user has no barber yet. The RPC validates that the
        // target is a real barber and routes the write through the sanctioned
        // flow (direct writes to adm_responsavel_id are blocked by a trigger).
        const { data: cur } = await supabase
          .from('profiles')
          .select('adm_responsavel_id')
          .eq('id', user.id)
          .maybeSingle();
        if (cur && !(cur as any).adm_responsavel_id) {
          const { error } = await supabase.rpc('link_self_to_barber' as any, { _barber_id: pendingRef } as any);
          if (!error) {
            toast.success('Vinculado ao barbeiro!');
          }
        }
      } finally {
        try {
          localStorage.removeItem('pendingBarberRef');
          localStorage.removeItem('pendingInviteCode');
        } catch {}
        setPendingRef(null);
        setLinking(false);
        // Clean URL
        if (location.search.includes('ref=') || location.search.includes('i=') || location.pathname.startsWith('/r/')) {
          window.history.replaceState({}, '', '/');
        }
      }
    })();
  }, [user, pendingRef, linking, location.pathname, location.search]);

  const hasPendingInvite = !!pendingRef || (() => {
    try { return !!localStorage.getItem('pendingInviteCode'); } catch { return false; }
  })();

  // Esconde a dock durante o fluxo de convite (usuário deslogado).
  useEffect(() => {
    const blocking = !loading && !user && hasPendingInvite;
    setDockHidden(blocking);
    return () => setDockHidden(false);
  }, [loading, user, hasPendingInvite]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-primary font-heading text-lg animate-pulse">Carregando...</div>
      </div>
    );
  }


  // BLOQUEIA todo o app se houver convite pendente e usuário deslogado
  if (!user && hasPendingInvite) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 gap-4">
        <img src={logoImg} alt="Logo" className="w-20 h-20 opacity-90" />
        <div className="text-center max-w-sm">
          <h1 className="font-display text-2xl text-primary tracking-wider">
            {barberName ? `Convite de ${barberName}` : 'Convite do Barbeiro'}
          </h1>
          <p className="text-muted-foreground text-sm mt-2">
            {barberName
              ? `${barberName} convidou você! Entre ou crie sua conta para se vincular. O vínculo é feito de forma segura após o login.`
              : 'Para se vincular ao seu barbeiro, entre ou crie sua conta. O vínculo é feito de forma segura após o login.'}
          </p>
        </div>
        <ClientAuthForm title="Entrar para continuar" />
      </div>
    );
  }

  return <>{children}</>;
}
