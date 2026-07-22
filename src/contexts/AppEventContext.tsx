import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AnimationType } from '@/lib/event-presets';
import { detectCountry } from '@/lib/country-locale';

export interface AppEvent {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  cor_primaria: string | null;
  cor_secundaria: string | null;
  emoji: string | null;
  logo_url: string | null;
  banner_url: string | null;
  banner_texto: string | null;
  animacao: AnimationType;
  ativo: boolean;
  auto_ativar: boolean;
  data_inicio: string | null;
  data_fim: string | null;
  /** País (ISO-2) do evento. null = global, aparece em todos os países. */
  pais: string | null;
  /** Repete automaticamente todo ano nas datas mes/dia. */
  recorrente_anual: boolean;
  mes_inicio: number | null;
  dia_inicio: number | null;
  mes_fim: number | null;
  dia_fim: number | null;
  video_url_vertical: string | null;
  video_url_horizontal: string | null;
  video_url_vertical_webm: string | null;
  video_url_horizontal_webm: string | null;
  created_at: string;
  updated_at: string;
}

interface Ctx {
  activeEvent: AppEvent | null;
  allEvents: AppEvent[];
  reload: () => Promise<void>;
  /** Incrementa para disparar a celebração em tela cheia do evento ativo. */
  celebrationToken: number;
  /** Dispara manualmente a celebração (ex.: botão "reviver" no banner). */
  celebrate: () => void;
}

const AppEventContext = createContext<Ctx>({
  activeEvent: null,
  allEvents: [],
  reload: async () => {},
  celebrationToken: 0,
  celebrate: () => {},
});

// Decide qual evento está realmente ativo agora, respeitando o país detectado.
// Eventos com `pais` definido só valem no país correspondente; `pais` null = global.
function computeActive(events: AppEvent[]): AppEvent | null {
  const now = Date.now();
  const myCountry = detectCountry().code;
  const inCountry = (e: AppEvent) => !e.pais || e.pais.toUpperCase() === myCountry;
  // 1) Ativado manualmente tem prioridade (respeitando janela de datas e país)
  const manual = events.find((e) => {
    if (!e.ativo || !inCountry(e)) return false;
    const inStart = !e.data_inicio || new Date(e.data_inicio).getTime() <= now;
    const inEnd = !e.data_fim || new Date(e.data_fim).getTime() >= now;
    return inStart && inEnd;
  });
  if (manual) return manual;
  // 2) Agendados com ativação automática dentro da janela (e no país certo)
  const auto = events
    .filter((e) => e.auto_ativar && inCountry(e) && e.data_inicio && e.data_fim &&
      new Date(e.data_inicio).getTime() <= now && new Date(e.data_fim).getTime() >= now)
    .sort((a, b) => new Date(b.data_inicio!).getTime() - new Date(a.data_inicio!).getTime());
  return auto[0] || null;
}

export function AppEventProvider({ children }: { children: ReactNode }) {
  const [allEvents, setAllEvents] = useState<AppEvent[]>([]);
  const [activeEvent, setActiveEvent] = useState<AppEvent | null>(null);
  const [celebrationToken, setCelebrationToken] = useState(0);

  const celebrate = useCallback(() => setCelebrationToken((t) => t + 1), []);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('app_events')
      .select('*')
      .order('created_at', { ascending: false });
    const events = (data || []) as unknown as AppEvent[];
    setAllEvents(events);
    setActiveEvent(computeActive(events));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Recalcula a ativação automática periodicamente (para virar de evento sem reload)
  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveEvent((prev) => {
        const next = computeActive(allEvents);
        return next?.id === prev?.id ? prev : next;
      });
    }, 60_000);
    return () => window.clearInterval(id);
  }, [allEvents]);

  // Tempo real: qualquer mudança feita pelo CEO reflete na hora em todos os apps
  useEffect(() => {
    const channel = supabase
      .channel('app-events-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_events' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // A celebração em tela cheia agora acontece somente na tela de entrada do app
  // (SplashScreen), uma vez por abertura. Não é mais disparada na navegação.

  return (
    <AppEventContext.Provider value={{ activeEvent, allEvents, reload: load, celebrationToken, celebrate }}>
      {children}
    </AppEventContext.Provider>
  );
}

export const useAppEvent = () => useContext(AppEventContext);
