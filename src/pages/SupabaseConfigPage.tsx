import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { toast } from 'sonner';
import Seo from '@/components/Seo';

const STORAGE_KEY = 'supabase_custom_config';

const schema = z.object({
  url: z
    .string()
    .trim()
    .url({ message: 'URL inválida' })
    .max(255)
    .refine((v) => /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(v), {
      message: 'Use o formato https://<projeto>.supabase.co',
    }),
  anonKey: z
    .string()
    .trim()
    .min(20, { message: 'Chave muito curta' })
    .max(500, { message: 'Chave muito longa' }),
});

type Status = 'idle' | 'testing' | 'ok' | 'error';

function loadStored(): { url: string; anonKey: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { url: '', anonKey: '' };
    const parsed = JSON.parse(raw);
    return {
      url: typeof parsed.url === 'string' ? parsed.url : '',
      anonKey: typeof parsed.anonKey === 'string' ? parsed.anonKey : '',
    };
  } catch {
    return { url: '', anonKey: '' };
  }
}

export default function SupabaseConfigPage() {
  const initial = loadStored();
  const [url, setUrl] = useState(initial.url);
  const [anonKey, setAnonKey] = useState(initial.anonKey);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string>('');
  const [errors, setErrors] = useState<{ url?: string; anonKey?: string }>({});

  const validate = () => {
    const result = schema.safeParse({ url, anonKey });
    if (!result.success) {
      const fe = result.error.flatten().fieldErrors;
      setErrors({ url: fe.url?.[0], anonKey: fe.anonKey?.[0] });
      return null;
    }
    setErrors({});
    return result.data;
  };

  const handleTest = async () => {
    const data = validate();
    if (!data) return;
    setStatus('testing');
    setMessage('');
    try {
      const client = createClient(data.url, data.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      // Chama o endpoint de sessão — não requer tabelas nem policies.
      const { error } = await client.auth.getSession();
      if (error) throw error;
      // Ping REST para validar URL + apikey no PostgREST.
      const res = await fetch(`${data.url.replace(/\/$/, '')}/rest/v1/`, {
        headers: { apikey: data.anonKey, Authorization: `Bearer ${data.anonKey}` },
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(`HTTP ${res.status}`);
      }
      setStatus('ok');
      setMessage('Conexão bem-sucedida.');
      toast.success('Conexão OK');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus('error');
      setMessage(msg);
      toast.error('Falha na conexão', { description: msg });
    }
  };

  const handleSave = () => {
    const data = validate();
    if (!data) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      toast.success('Configuração salva');
    } catch {
      toast.error('Não foi possível salvar');
    }
  };

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUrl('');
    setAnonKey('');
    setStatus('idle');
    setMessage('');
    toast('Configuração removida');
  };

  return (
    <div className="min-h-screen px-4 py-8 max-w-xl mx-auto">
      <Seo path="/supabase-config" title="Configuração Supabase" description="Informe URL e API key do Supabase e teste a conexão." />
      <h1 className="font-display text-2xl text-primary mb-1">Configuração Supabase</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Informe a URL do projeto e a anon key pública para testar a conexão.
      </p>

      <div className="space-y-4">
        <div>
          <label htmlFor="sb-url" className="block text-sm font-medium mb-1">
            URL do projeto
          </label>
          <input
            id="sb-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://xxxx.supabase.co"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            maxLength={255}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {errors.url && <p className="text-xs text-destructive mt-1">{errors.url}</p>}
        </div>

        <div>
          <label htmlFor="sb-key" className="block text-sm font-medium mb-1">
            Anon / Publishable key
          </label>
          <div className="flex gap-2">
            <input
              id="sb-key"
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              placeholder="eyJhbGciOi..."
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              maxLength={500}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="px-3 rounded-md border border-input text-xs"
            >
              {showKey ? 'Ocultar' : 'Ver'}
            </button>
          </div>
          {errors.anonKey && <p className="text-xs text-destructive mt-1">{errors.anonKey}</p>}
          <p className="text-[11px] text-muted-foreground mt-1">
            Use apenas a chave pública (anon). Nunca cole a service_role aqui.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={status === 'testing'}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
          >
            {status === 'testing' ? 'Testando…' : 'Testar conexão'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-md border border-input text-sm"
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="px-4 py-2 rounded-md border border-input text-sm text-muted-foreground"
          >
            Limpar
          </button>
        </div>

        {status !== 'idle' && status !== 'testing' && (
          <div
            role="status"
            className={`rounded-md border px-3 py-2 text-sm ${
              status === 'ok'
                ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400'
                : 'border-destructive/40 bg-destructive/10 text-destructive'
            }`}
          >
            {status === 'ok' ? '✓ ' : '✗ '}
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
