import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';

// Mock do cliente Supabase (sem rede). Simula usuário não autenticado.
vi.mock('@/integrations/supabase/client', () => {
  const sub = { unsubscribe: vi.fn() };
  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: sub } })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) })) })),
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({})) })),
      })),
    },
  };
});

import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';

const LS_KEY = 'app_lang_override_v1';

function Probe() {
  const { lang, isAuto, setLang } = useLanguage();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="auto">{String(isAuto)}</span>
      <button onClick={() => setLang('es')}>es</button>
      <button onClick={() => setLang('en')}>en</button>
      <button onClick={() => setLang(null)}>auto</button>
    </div>
  );
}

const renderApp = () =>
  render(
    <LanguageProvider>
      <Probe />
    </LanguageProvider>,
  );

describe('LanguageContext — persistência por perfil', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('aplica o idioma escolhido e grava no localStorage', async () => {
    renderApp();
    await act(async () => { screen.getByText('es').click(); });
    expect(screen.getByTestId('lang').textContent).toBe('es');
    expect(screen.getByTestId('auto').textContent).toBe('false');
    expect(localStorage.getItem(LS_KEY)).toBe('es');
  });

  it('persiste a escolha após "recarregar" (remontar a árvore)', async () => {
    const first = renderApp();
    await act(async () => { screen.getByText('en').click(); });
    expect(screen.getByTestId('lang').textContent).toBe('en');
    first.unmount();

    // Simula reload: nova montagem deve ler o override salvo.
    renderApp();
    expect(screen.getByTestId('lang').textContent).toBe('en');
    expect(screen.getByTestId('auto').textContent).toBe('false');
  });

  it('volta ao automático quando setLang(null)', async () => {
    renderApp();
    await act(async () => { screen.getByText('es').click(); });
    expect(screen.getByTestId('auto').textContent).toBe('false');
    await act(async () => { screen.getByText('auto').click(); });
    expect(screen.getByTestId('auto').textContent).toBe('true');
    expect(localStorage.getItem(LS_KEY)).toBe('auto');
  });

  it('idioma persistido sobrevive em qualquer caminho (mesma origem localStorage)', async () => {
    localStorage.setItem(LS_KEY, 'es');
    renderApp();
    expect(screen.getByTestId('lang').textContent).toBe('es');
  });
});
