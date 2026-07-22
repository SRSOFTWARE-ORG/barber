import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { activeSupabaseConfig, supabase } from '@/integrations/supabase/client';
import { auditRealtimeAccess } from '@/lib/realtime-audit';
import type { User, Session } from '@supabase/supabase-js';

type UserRole = 'ceo' | 'admin' | null;

const SHOP_NAME_KEY = 'shopDisplayName';
const DEFAULT_SHOP_NAME = 'Barbearia Classic';
const AUTH_LOAD_TIMEOUT_MS = 8000;

const withTimeout = async <T,>(promise: PromiseLike<T>, fallback: T, ms = AUTH_LOAD_TIMEOUT_MS): Promise<T> => {
  let timer: number | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((resolve) => {
        timer = window.setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: UserRole;
  loading: boolean;
  shopDisplayName: string;
  barberId: string | null;
  shopBlocked: boolean;
  refreshShopBlocked: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}


const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [shopDisplayName, setShopDisplayName] = useState<string>(
    () => localStorage.getItem(SHOP_NAME_KEY) || DEFAULT_SHOP_NAME
  );
  const [barberId, setBarberId] = useState<string | null>(null);
  const [shopBlocked, setShopBlocked] = useState(false);

  const refreshShopBlocked = async () => {
    if (!user) { setShopBlocked(false); return; }
    const { data } = await supabase.rpc('am_i_blocked');
    setShopBlocked(Boolean(data));
  };

  // Tema (cores + hero + plano) é gerenciado pelo ThemeProvider que escuta `barberId`.

  // Carrega flag de bloqueio quando user muda + escuta realtime em platform_subscriptions
  useEffect(() => {
    if (!user) { setShopBlocked(false); return; }
    supabase.rpc('am_i_blocked').then(({ data }) => setShopBlocked(Boolean(data)));
    auditRealtimeAccess(`platform-subs-${user.id}`);
    const channel = supabase
      .channel(`platform-subs-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_subscriptions' }, () => {
        supabase.rpc('am_i_blocked').then(({ data }) => setShopBlocked(Boolean(data)));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);



  // Step 1: Listen for auth changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (!session?.user) {
          setRole(null);
          setLoading(false);
        }
        setAuthReady(true);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) {
        setLoading(false);
      }
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Step 2: Fetch role + shop name when user changes
  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setRole(null);
      setBarberId(null);
      setShopDisplayName(DEFAULT_SHOP_NAME);
      localStorage.removeItem(SHOP_NAME_KEY);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadUserData = async () => {
      try {
        // Consulta em paralelo: platform_admins (fonte da verdade para CEO/suporte),
        // user_roles legado (compatibilidade) e profile.
        const [platformRes, rolesRes, profileRes] = await withTimeout(
          Promise.all([
            (supabase as any).from('platform_admins').select('role').eq('user_id', user.id).maybeSingle(),
            supabase.from('user_roles').select('role').eq('user_id', user.id),
            supabase.from('profiles').select('adm_responsavel_id').eq('id', user.id).maybeSingle(),
          ]),
          [{ data: null }, { data: [] }, { data: null }] as any,
        );


        if (cancelled) return;

        const platformRole = (platformRes as any)?.data?.role as string | undefined;
        const rolesData = rolesRes?.data || [];
        const profile = profileRes?.data || null;

        // Super-admin agora vem da tabela platform_admins (configurável via SQL/RPC).
        let userRole: UserRole = null;
        if (platformRole === 'ceo' || rolesData.some((r: any) => r.role === 'ceo')) {
          userRole = 'ceo';
        } else if (platformRole === 'suporte') {
          userRole = 'admin';
        } else if (rolesData.some((r: any) => r.role === 'admin')) {
          userRole = 'admin';
        }
        setRole(userRole);



        // Resolve which barber's brand to display:
        // 1. Admin → own name (they ARE the barber)
        // 2. Anyone (including CEO/client) with a linked barber → linked barber
        // 3. Otherwise → default
        const linkedBarberId = (profile as any)?.adm_responsavel_id || null;
        let targetBarberId: string | null = null;
        if (userRole === 'admin') {
          targetBarberId = user.id;
        } else if (linkedBarberId) {
          targetBarberId = linkedBarberId;
        }

        if (targetBarberId) {
          setBarberId(targetBarberId);
          const { data: nameData } = await withTimeout(
            supabase.rpc('get_barber_name', { _barber_id: targetBarberId }),
            { data: null } as any,
          );
          if (!cancelled) {
            if (nameData) {
              const raw = String(nameData).trim();
              // Se o barbeiro já incluiu "Barbearia" no nome customizado, respeita.
              // Caso contrário, prefixa "Barbearia ".
              const name = /^barbearia\b/i.test(raw) ? raw : `Barbearia ${raw}`;
              setShopDisplayName(name);
              localStorage.setItem(SHOP_NAME_KEY, name);
            } else {
              setShopDisplayName(DEFAULT_SHOP_NAME);
              localStorage.removeItem(SHOP_NAME_KEY);
            }
          }
        } else {
          setBarberId(null);
          setShopDisplayName(DEFAULT_SHOP_NAME);
          localStorage.removeItem(SHOP_NAME_KEY);
        }
      } catch (err) {
        console.error('[Auth] Failed to load user data:', err);
        if (!cancelled) {
          setRole(null);
          setBarberId(null);
          setShopDisplayName(DEFAULT_SHOP_NAME);
          localStorage.removeItem(SHOP_NAME_KEY);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadUserData();
    return () => { cancelled = true; };
  }, [user?.id, authReady]);

  const signIn = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    setLoading(true);
    console.log('[Auth] signInWithPassword request:', {
      email: normalizedEmail,
      passwordLength: password.length,
      supabaseProjectRef: activeSupabaseConfig.projectRef,
      supabaseSource: activeSupabaseConfig.source,
    });
    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    console.log('[Auth] signInWithPassword response:', {
      userId: data.user?.id ?? null,
      session: Boolean(data.session),
      error: error ? { message: error.message, status: error.status, code: error.code } : null,
    });
    if (error) {
      setLoading(false);
      return { error: error.message };
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole(null);
    setUser(null);
    setSession(null);
    setBarberId(null);
    setShopDisplayName(DEFAULT_SHOP_NAME);
    localStorage.removeItem(SHOP_NAME_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, session, role, loading, shopDisplayName, barberId, shopBlocked, refreshShopBlocked, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}