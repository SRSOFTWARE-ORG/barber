import { useEffect, useRef, useState } from 'react';
import type { AppEvent } from '@/contexts/AppEventContext';

/**
 * Player de vídeo de evento com carregamento sob demanda (lazy) e cache inteligente.
 *
 * - Escolhe a orientação (vertical/horizontal) conforme o formato do container/tela.
 * - Prefere WebM (mais leve) e cai para MP4 quando indisponível.
 * - Só começa a baixar quando entra na viewport (IntersectionObserver).
 * - Mantém um cache em memória das URLs já "aquecidas" para evitar refetch.
 */

// Cache simples em memória: URLs de vídeo já solicitadas nesta sessão.
const warmed = new Set<string>();

export interface EventVideoProps {
  event: Pick<
    AppEvent,
    | 'video_url_vertical'
    | 'video_url_horizontal'
    | 'video_url_vertical_webm'
    | 'video_url_horizontal_webm'
    | 'nome'
  >;
  /** Força a orientação; por padrão detecta pelo tamanho da tela. */
  orientation?: 'vertical' | 'horizontal' | 'auto';
  className?: string;
  poster?: string;
  loop?: boolean;
  muted?: boolean;
  autoPlay?: boolean;
  onEnded?: () => void;
}

function pickOrientation(force: EventVideoProps['orientation']): 'vertical' | 'horizontal' {
  if (force === 'vertical' || force === 'horizontal') return force;
  if (typeof window === 'undefined') return 'vertical';
  return window.innerHeight >= window.innerWidth ? 'vertical' : 'horizontal';
}

export default function EventVideo({
  event,
  orientation = 'auto',
  className = '',
  poster,
  loop = false,
  muted = true,
  autoPlay = true,
  onEnded,
}: EventVideoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const dir = pickOrientation(orientation);

  const mp4 = dir === 'vertical' ? event.video_url_vertical : event.video_url_horizontal;
  const webm = dir === 'vertical' ? event.video_url_vertical_webm : event.video_url_horizontal_webm;
  // Fallback para a outra orientação se a preferida não existir.
  const mp4Fallback = dir === 'vertical' ? event.video_url_horizontal : event.video_url_vertical;
  const webmFallback = dir === 'vertical' ? event.video_url_horizontal_webm : event.video_url_vertical_webm;

  const srcMp4 = mp4 || mp4Fallback || null;
  const srcWebm = webm || webmFallback || null;

  // Lazy: só carrega quando entra na viewport.
  useEffect(() => {
    if (!containerRef.current || visible) return;
    if (srcMp4 && warmed.has(srcMp4)) { setVisible(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          if (srcMp4) warmed.add(srcMp4);
          if (srcWebm) warmed.add(srcWebm);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(containerRef.current);
    return () => io.disconnect();
  }, [srcMp4, srcWebm, visible]);

  if (!srcMp4 && !srcWebm) return null;

  return (
    <div ref={containerRef} className={className}>
      {visible && (
        <video
          className="h-full w-full object-cover"
          poster={poster}
          loop={loop}
          muted={muted}
          autoPlay={autoPlay}
          playsInline
          preload="metadata"
          onEnded={onEnded}
          aria-label={`Vídeo do evento ${event.nome}`}
        >
          {srcWebm && <source src={srcWebm} type="video/webm" />}
          {srcMp4 && <source src={srcMp4} type="video/mp4" />}
        </video>
      )}
    </div>
  );
}

/** Verdadeiro se o evento tem ao menos um vídeo (qualquer orientação/formato). */
export function hasEventVideo(e: Pick<AppEvent, 'video_url_vertical' | 'video_url_horizontal' | 'video_url_vertical_webm' | 'video_url_horizontal_webm'>) {
  return !!(e.video_url_vertical || e.video_url_horizontal || e.video_url_vertical_webm || e.video_url_horizontal_webm);
}
