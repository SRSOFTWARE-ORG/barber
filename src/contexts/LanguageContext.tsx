import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { detectLocale } from '@/lib/country-locale';
import { translate, normalizeLang, SUPPORTED_LANGS, type Lang } from '@/lib/i18n/translations';

const LS_KEY = 'app_lang_override_v1';

interface Ctx {
  lang: Lang;
  /** true quando o idioma está sendo escolhido automaticamente pelo fuso. */
  isAuto: boolean;
  /** Define o idioma. Passe null para voltar ao automático (fuso horário). */
  setLang: (lang: Lang | null) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<Ctx | null>(null);

function readOverride(): Lang | null {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (!v || v === 'auto') return null;
    // Idioma inválido/não suportado cai em fallback seguro (en) em vez de quebrar.
    return normalizeLang(v);
  } catch {
    return null;
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<Lang | null>(() => readOverride());
  const [autoLang] = useState<Lang>(() => detectLocale());

  const lang: Lang = override ?? autoLang;

  // Reflete no <html lang> para acessibilidade/SEO.
  useEffect(() => {
    try { document.documentElement.lang = lang; } catch { /* noop */ }
  }, [lang]);

  // Ao logar, lê o idioma salvo no perfil (sincronização entre dispositivos).
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase.from('profiles').select('idioma').eq('id', user.id).maybeSingle();
      const rawSaved = (data as { idioma?: string } | null)?.idioma;
      if (cancelled) return;
      if (rawSaved) {
        // Perfil pode ter idioma legado/não suportado — normaliza p/ evitar tela sem tradução.
        const safe = normalizeLang(rawSaved);
        try { localStorage.setItem(LS_KEY, safe); } catch { /* noop */ }
        setOverride(safe);
        // Corrige silenciosamente o perfil se estava com valor inválido.
        if (safe !== rawSaved && SUPPORTED_LANGS.includes(rawSaved as Lang) === false) {
          supabase.from('profiles').update({ idioma: safe } as never).eq('id', user.id).then(() => {});
        }
      }
    };
    sync();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') sync();
    });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  const setLang = useCallback((next: Lang | null) => {
    setOverride(next);
    try { localStorage.setItem(LS_KEY, next ?? 'auto'); } catch { /* noop */ }
    // Persiste no perfil para acompanhar o usuário em outros dispositivos.
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) supabase.from('profiles').update({ idioma: next } as never).eq('id', user.id).then(() => {});
    });
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );

  return (
    <LanguageContext.Provider value={{ lang, isAuto: override === null, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be inside LanguageProvider');
  return ctx;
}

/** Hook curto para tradução. */
export function useT() {
  return useLanguage().t;
}
