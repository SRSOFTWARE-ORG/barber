import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Play } from 'lucide-react';
import EventCelebration from '@/components/EventCelebration';
import type { AppEvent } from '@/contexts/AppEventContext';
import { EVENT_PRESETS, type EventPreset } from '@/lib/event-presets';
import { COUNTRIES, detectCountry, detectLocale, getDeviceTimeZone } from '@/lib/country-locale';
import Seo from '@/components/Seo';

/**
 * Galeria de pré-visualização das celebrações sazonais. Permite assistir a cada
 * animação em tela cheia (para conferir e compartilhar) sem precisar ativar o
 * evento de verdade. Também é usada para gravar os vídeos de cada animação:
 *   /celebration-preview?cat=copa&loop=1   -> roda a cena em loop, sem UI.
 */

function presetToEvent(p: EventPreset): AppEvent {
  const now = new Date().toISOString();
  return {
    id: `preview-${p.categoria}`,
    nome: p.nome,
    descricao: p.descricao,
    categoria: p.categoria,
    cor_primaria: p.cor_primaria,
    cor_secundaria: p.cor_secundaria,
    emoji: p.emoji,
    logo_url: null,
    banner_url: null,
    banner_texto: p.banner_texto,
    animacao: p.animacao,
    ativo: true,
    auto_ativar: false,
    data_inicio: null,
    data_fim: null,
    pais: null,
    recorrente_anual: false,
    mes_inicio: null,
    dia_inicio: null,
    mes_fim: null,
    dia_fim: null,
    video_url_vertical: null,
    video_url_horizontal: null,
    video_url_vertical_webm: null,
    video_url_horizontal_webm: null,
    created_at: now,
    updated_at: now,
  };
}

export default function CelebrationPreviewPage() {
  const [params, setParams] = useSearchParams();
  const [playing, setPlaying] = useState<EventPreset | null>(null);
  const [cycle, setCycle] = useState(0); // força remontar para repetir a cena

  const loop = params.get('loop') === '1';
  const hideUi = params.get('hideui') === '1' || loop;
  const catParam = params.get('cat');

  const presets = useMemo(
    () => [...EVENT_PRESETS].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [],
  );

  // Auto-play quando vier com ?cat=...
  useEffect(() => {
    if (!catParam) return;
    const found = EVENT_PRESETS.find((p) => p.categoria === catParam);
    if (found) setPlaying(found);
  }, [catParam]);

  const stop = () => {
    if (loop) {
      // Em modo loop, reinicia a mesma cena (para gravação contínua)
      setCycle((c) => c + 1);
      return;
    }
    setPlaying(null);
    if (catParam) {
      params.delete('cat');
      setParams(params, { replace: true });
    }
  };

  if (playing) {
    return (
      <EventCelebration
        key={`${playing.categoria}-${cycle}`}
        event={presetToEvent(playing)}
        onClose={stop}
        duration={6500}
      />
    );
  }

  return (
    <div className="min-h-screen px-4 pb-28" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
      <Seo
        title="Pré-visualizar Celebrações | Barbershop"
        description="Assista e compartilhe as animações de celebração sazonais do app."
        path="/celebration-preview"
      />


      {!hideUi && (() => {
        const tz = getDeviceTimeZone();
        const country = detectCountry(tz);
        const locale = detectLocale(tz);
        const all = Object.values(COUNTRIES);
        return (
          <div className="wood-card gold-border rounded-2xl p-4 mb-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{country.flagEmoji}</span>
              <div>
                <p className="font-heading text-foreground text-sm">País detectado: <strong>{country.name}</strong></p>
                <p className="text-xs text-muted-foreground">Fuso: {tz} · Idioma: {locale} · Torcida: {country.golChant}</p>
              </div>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-primary font-heading">Ver os {all.length} países suportados (torcida da Copa)</summary>
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                {all.map((c) => (
                  <div key={c.code} className="flex items-center gap-1.5 text-muted-foreground">
                    <span>{c.flagEmoji}</span>
                    <span className="truncate">{c.name}</span>
                    <span className="opacity-60">· {c.locale}</span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        );
      })()}

      {!hideUi && (
        <header className="flex items-center gap-3 py-4">
          <Link to="/more" className="rounded-full p-2 bg-card border border-border hover:bg-muted transition-colors" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="font-heading text-2xl font-bold">Celebrações</h1>
            <p className="text-sm text-muted-foreground">Toque para pré-visualizar cada animação</p>
          </div>
        </header>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {presets.map((p) => (
          <button
            key={p.categoria}
            onClick={() => setPlaying(p)}
            className="group relative aspect-[4/5] rounded-2xl overflow-hidden border border-border text-left focus:outline-none focus:ring-2 focus:ring-gold"
            style={{ background: `linear-gradient(150deg, hsl(${p.cor_primaria}) 0%, hsl(${p.cor_secundaria}) 100%)` }}
          >
            <span className="absolute inset-0 flex items-center justify-center text-5xl drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)] transition-transform group-hover:scale-110">
              {p.emoji}
            </span>
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5 pt-6">
              <span className="block text-white font-heading font-bold text-sm leading-tight">{p.nome}</span>
            </span>
            <span className="absolute top-2 right-2 rounded-full bg-black/40 p-1.5 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity">
              <Play className="h-4 w-4 text-white" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
