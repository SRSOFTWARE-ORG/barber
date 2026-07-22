import { useAppEvent } from '@/contexts/AppEventContext';

// Banner do evento ativo, exibido na Home. Usa as cores do evento e ganha um
// efeito estático sutil por categoria. A celebração em tela cheia NÃO é
// disparada aqui — ela aparece apenas na tela de entrada do app.
export default function EventBanner() {
  const { activeEvent } = useAppEvent();
  if (!activeEvent) return null;

  const cat = activeEvent.categoria;
  const primary = activeEvent.cor_primaria || '38 55% 55%';
  const secondary = activeEvent.cor_secundaria || primary;
  const texto = activeEvent.banner_texto || activeEvent.nome;

  // Gradiente base por categoria (alinhado às cenas de celebração).
  const gradient =
    cat === 'copa' ? 'linear-gradient(135deg, hsl(142 70% 34%) 0%, hsl(50 92% 50%) 100%)'
    : cat === 'festa-junina' ? 'linear-gradient(135deg, hsl(24 60% 22%) 0%, hsl(30 80% 38%) 100%)'
    : cat === 'olimpiadas' ? 'linear-gradient(135deg, hsl(220 70% 22%) 0%, hsl(210 70% 42%) 100%)'
    : cat === 'dia-pais' ? 'linear-gradient(135deg, hsl(210 60% 32%) 0%, hsl(45 85% 58%) 100%)'
    : `linear-gradient(135deg, hsl(${primary}) 0%, hsl(${secondary}) 100%)`;

  return (
    <div className="px-4 mb-5">
      <div
        className="relative w-full text-left overflow-hidden rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg animate-fade-in border border-white/10"
        style={{ background: gradient }}
      >

        {/* Brilho contínuo (shimmer) para Copa / genéricos com cor viva */}
        {(cat === 'copa' || !['festa-junina', 'olimpiadas', 'dia-pais'].includes(cat)) && (
          <span aria-hidden className="absolute inset-0 celeb-shimmer pointer-events-none" />
        )}

        {/* Festa Junina: lanternas balançando + brilho de fogueira */}
        {cat === 'festa-junina' && (
          <>
            <span
              aria-hidden
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
              style={{
                width: '120%', height: '160%',
                background: 'radial-gradient(ellipse at bottom, hsl(35 95% 55% / 0.55), transparent 60%)',
                animation: 'celeb-glow 1.8s ease-in-out infinite',
              }}
            />
            <span aria-hidden className="absolute top-1 right-10 text-lg pointer-events-none" style={{ transformOrigin: 'top center', animation: 'celeb-swing 2.6s ease-in-out infinite' }}>🏮</span>
          </>
        )}

        {/* Olimpíadas: anéis em marca d'água */}
        {cat === 'olimpiadas' && (
          <span aria-hidden className="absolute right-2 top-1/2 -translate-y-1/2 text-3xl opacity-25 pointer-events-none" style={{ animation: 'celeb-ring 3s ease-in-out infinite' }}>🪙</span>
        )}

        {activeEvent.banner_url ? (
          <img src={activeEvent.banner_url} alt={activeEvent.nome} className="relative h-10 w-10 rounded-lg object-cover shrink-0" />
        ) : (
          <span className="relative text-3xl shrink-0 drop-shadow">{activeEvent.emoji || '🎉'}</span>
        )}
        <div className="relative min-w-0 flex-1">
          <p className="font-heading text-sm text-white drop-shadow-sm leading-tight">{texto}</p>
          {activeEvent.descricao && (
            <p className="text-[11px] text-white/85 truncate">{activeEvent.descricao}</p>
          )}
        </div>
      </div>
    </div>

  );
}
