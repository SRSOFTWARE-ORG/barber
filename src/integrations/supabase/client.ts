import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const STORAGE_KEY = 'supabase_custom_config';

function loadCustomConfig(): { url: string; anonKey: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.url === 'string' &&
      typeof parsed.anonKey === 'string' &&
      parsed.url &&
      parsed.anonKey
    ) {
      return { url: parsed.url.replace(/\/$/, ''), anonKey: parsed.anonKey };
    }
    return null;
  } catch {
    return null;
  }
}

const custom = loadCustomConfig();

const ENV_SUPABASE_URL = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').replace(/\/$/, '');
const ENV_SUPABASE_PUBLISHABLE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? '';

/**
 * O .env é a fonte oficial do app publicado. A configuração salva em localStorage
 * existe só como fallback para ambientes sem .env. Antes ela tinha prioridade e
 * podia deixar o navegador apontando para um projeto Supabase antigo, causando
 * "Invalid login credentials" mesmo com o usuário criado no projeto correto.
 */
const SUPABASE_URL = ENV_SUPABASE_URL || custom?.url || '';
const SUPABASE_PUBLISHABLE_KEY = ENV_SUPABASE_PUBLISHABLE_KEY || custom?.anonKey || '';

if (typeof window !== 'undefined' && ENV_SUPABASE_URL && custom?.url && custom.url !== ENV_SUPABASE_URL) {
  window.localStorage.removeItem(STORAGE_KEY);
  console.warn('[supabase] Configuração local antiga removida; usando o projeto do .env:', ENV_SUPABASE_URL);
}

const getProjectRef = (url: string) => {
  try {
    return new URL(url).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
};

export const activeSupabaseConfig = {
  url: SUPABASE_URL,
  projectRef: getProjectRef(SUPABASE_URL),
  source: ENV_SUPABASE_URL ? 'env' : custom ? 'localStorage' : 'missing',
  ignoredLocalUrl: ENV_SUPABASE_URL && custom?.url && custom.url !== ENV_SUPABASE_URL ? custom.url : null,
};

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] Nenhuma configuração encontrada. Acesse /supabase-config para informar a URL e a Anon Key do seu projeto.',
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_PUBLISHABLE_KEY || 'placeholder',
  {
    auth: {
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);

export const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
