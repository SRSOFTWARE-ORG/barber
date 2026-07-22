import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

const JEFFAO_BARBER_ID = '3b1fd66a-e562-4389-8c4d-e53e5cef9db9';

// Tema "monocromático Jeffão" — usado como padrão se ele ainda não tiver tema customizado salvo.
export const JEFFAO_DEFAULT_THEME: Record<string, string> = {
  background: '0 0% 8%',
  foreground: '0 0% 92%',
  card: '0 0% 14%',
  'card-foreground': '0 0% 92%',
  primary: '0 0% 88%',
  'primary-foreground': '0 0% 10%',
  secondary: '0 0% 20%',
  accent: '0 0% 70%',
  'accent-foreground': '0 0% 10%',
  border: '0 0% 26%',
  input: '0 0% 18%',
};

export const DEFAULT_THEME: Record<string, string> = {
  background: '25 30% 12%',
  foreground: '38 45% 85%',
  card: '25 35% 18%',
  'card-foreground': '38 45% 85%',
  primary: '38 55% 55%',
  'primary-foreground': '25 40% 10%',
  secondary: '25 30% 25%',
  accent: '30 70% 45%',
  'accent-foreground': '38 45% 90%',
  border: '30 25% 28%',
  input: '25 25% 22%',
};

export interface BarberTheme {
  tema_cores: Record<string, string> | null;
  hero_image_url: string | null;
  hero_object_fit: 'cover' | 'contain';
  hero_object_position: string;
  plano_enabled: boolean;
  plano_modo: 'whatsapp' | 'link';
  link_planos: string | null;
  comodidades: string[];
  app_bg_url: string | null;
  app_bg_opacity: number;
  app_logo_url: string | null;
}

const DEFAULT: BarberTheme = {
  tema_cores: null,
  hero_image_url: null,
  hero_object_fit: 'cover',
  hero_object_position: 'center',
  plano_enabled: true,
  plano_modo: 'whatsapp',
  link_planos: null,
  comodidades: [],
  app_bg_url: null,
  app_bg_opacity: 0.15,
  app_logo_url: null,
};

interface Ctx {
  theme: BarberTheme;
  reloadTheme: () => Promise<void>;
}

const ThemeContext = createContext<Ctx>({ theme: DEFAULT, reloadTheme: async () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { barberId } = useAuth();
  const [theme, setTheme] = useState<BarberTheme>(DEFAULT);

  const loadTheme = useCallback(async (bid: string | null) => {
    if (!bid) {
      setTheme(DEFAULT);
      return;
    }
    // 1) Cache local primeiro (instantâneo, mesmo offline)
    try {
      const cached = localStorage.getItem(`barber_theme_${bid}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        setTheme({
          tema_cores: parsed.tema_cores || null,
          hero_image_url: parsed.hero_image_url || null,
          hero_object_fit: parsed.hero_object_fit || 'cover',
          hero_object_position: parsed.hero_object_position || 'center',
          plano_enabled: parsed.plano_enabled !== false,
          plano_modo: parsed.plano_modo || 'whatsapp',
          link_planos: parsed.link_planos || null,
          comodidades: Array.isArray(parsed.comodidades) ? parsed.comodidades : [],
          app_bg_url: parsed.app_bg_url || null,
          app_bg_opacity: typeof parsed.app_bg_opacity === 'number' ? parsed.app_bg_opacity : 0.15,
          app_logo_url: parsed.app_logo_url || null,
        });
      }
    } catch { /* */ }
    // 2) Atualiza da rede
    const { data } = await supabase.rpc('get_barber_theme', { _barber_id: bid });
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      const next: BarberTheme = {
        tema_cores: (row.tema_cores as any) || null,
        hero_image_url: row.hero_image_url || null,
        hero_object_fit: (row.hero_object_fit as any) || 'cover',
        hero_object_position: row.hero_object_position || 'center',
        plano_enabled: row.plano_enabled !== false,
        plano_modo: (row.plano_modo as any) || 'whatsapp',
        link_planos: row.link_planos || null,
        comodidades: Array.isArray((row as any).comodidades) ? (row as any).comodidades : [],
        app_bg_url: (row as any).app_bg_url || null,
        app_bg_opacity: typeof (row as any).app_bg_opacity === 'number' ? (row as any).app_bg_opacity : Number((row as any).app_bg_opacity ?? 0.15),
        app_logo_url: (row as any).app_logo_url || null,
      };
      setTheme(next);
      try { localStorage.setItem(`barber_theme_${bid}`, JSON.stringify(next)); } catch { /* */ }
    }
  }, []);

  useEffect(() => {
    loadTheme(barberId);
  }, [barberId, loadTheme]);

  // Aplica variáveis CSS no :root sempre que o tema mudar
  useEffect(() => {
    const root = document.documentElement;
    // limpa overrides anteriores
    const ALL_KEYS = Object.keys({ ...DEFAULT_THEME, ...JEFFAO_DEFAULT_THEME });
    ALL_KEYS.forEach(k => root.style.removeProperty(`--${k}`));
    root.classList.remove('theme-jeffao');

    const colors = theme.tema_cores;
    if (colors && Object.keys(colors).length > 0) {
      Object.entries(colors).forEach(([k, v]) => {
        if (v) root.style.setProperty(`--${k}`, v);
      });
    } else if (barberId === JEFFAO_BARBER_ID) {
      // Mantém o tema monocromático padrão do Jeffão enquanto ele não criar um custom
      root.classList.add('theme-jeffao');
    }
  }, [theme, barberId]);

  return (
    <ThemeContext.Provider value={{ theme, reloadTheme: () => loadTheme(barberId) }}>
      {theme.app_bg_url && (
        <div
          aria-hidden
          className="fixed inset-0 -z-10 pointer-events-none bg-center bg-cover bg-no-repeat"
          style={{
            backgroundImage: `url(${theme.app_bg_url})`,
            opacity: Math.max(0, Math.min(1, theme.app_bg_opacity ?? 0.15)),
          }}
        />
      )}
      {children}
    </ThemeContext.Provider>
  );
}

export const useBarberTheme = () => useContext(ThemeContext);
