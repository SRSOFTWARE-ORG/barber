import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppEvent } from '@/contexts/AppEventContext';
import { detectCountry, ct } from '@/lib/country-locale';

/**
 * Overlay de CELEBRAÇÃO em tela cheia, de alta qualidade ("vídeo"). É exibido na
 * TELA DE ENTRADA do app (substituindo a splash) sempre que existe um evento
 * sazonal ativo. Cada categoria tem uma cena dedicada e temática; categorias sem
 * cena própria caem em uma cena temática rica configurada por evento.
 *
 * Quando o evento é retirado/encerrado, nada disso aparece e a splash padrão
 * volta ao normal.
 */

const GOLD = '45 95% 58%';

interface SceneCopy {
  title: string;
  subtitle: string;
}

/* ============================ Qualidade / desempenho ============================ */

/**
 * Ajusta a densidade das partículas e libera efeitos extras conforme o
 * dispositivo, para manter FPS alto e evitar travamentos em telas menores ou
 * aparelhos modestos. Em telas pequenas / pouca CPU reduzimos a contagem; com
 * "prefers-reduced-motion" desligamos as partículas em movimento.
 */
function getQuality() {
  if (typeof window === 'undefined') return { factor: 1, heavy: true, reduced: false };
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // Modo alta qualidade (?hq=1) força todos os efeitos — usado para gravar
  // vídeos de pré-visualização/compartilhamento. Respeita reduced-motion.
  const hq = /[?&]hq=1\b/.test(window.location.search);
  if (hq && !reduced) return { factor: 1, heavy: true, reduced: false };
  const w = window.innerWidth;
  const cores = navigator.hardwareConcurrency || 4;
  // deviceMemory não existe em todos os browsers
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 4;
  const lowPower = cores <= 4 || mem <= 4;
  let factor = 1;
  if (w < 480) factor = 0.4;
  else if (w < 768) factor = 0.6;
  if (lowPower) factor *= 0.75;
  if (reduced) factor = 0;
  const heavy = !reduced && w >= 768 && !lowPower;
  return { factor, heavy, reduced };
}


function useQuality() {
  return useMemo(getQuality, []);
}

/** Escala uma contagem base pela qualidade do dispositivo (mín. 0). */
function scaleCount(base: number, factor: number) {
  return Math.max(0, Math.round(base * factor));
}

/* ============================ Blocos reutilizáveis ============================ */

interface ConfettiPiece {
  left: number; delay: number; duration: number; drift: number; size: number; color: string; round: boolean;
}


function Confetti({ colors, count = 90 }: { colors: string[]; count?: number }) {
  const { factor } = useQuality();
  const n = scaleCount(count, factor);
  const pieces = useMemo<ConfettiPiece[]>(() => (
    Array.from({ length: n }).map(() => ({
      left: Math.random() * 100,
      delay: Math.random() * 3,
      duration: 3.5 + Math.random() * 3.5,
      drift: (Math.random() - 0.5) * 240,
      size: 6 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      round: Math.random() > 0.7,
    }))
  ), [colors, n]);


  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="celeb-confetti-piece"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size * (p.round ? 1 : 1.6)}px`,
            borderRadius: p.round ? '50%' : '1px',
            background: `hsl(${p.color})`,
            // @ts-expect-error custom prop usada no keyframe
            '--drift': `${p.drift}px`,
            animation: `celeb-confetti ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

type EmojiMode = 'rain' | 'rise' | 'float';

interface EmojiPiece { left: number; top: number; delay: number; duration: number; drift: number; size: number; emoji: string; }

function EmojiField({ emojis, count = 24, mode = 'rain' }: { emojis: string[]; count?: number; mode?: EmojiMode }) {
  const { factor } = useQuality();
  const n = scaleCount(count, factor);
  const pieces = useMemo<EmojiPiece[]>(() => (
    Array.from({ length: n }).map(() => ({
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 4,
      duration: 4 + Math.random() * 4,
      drift: (Math.random() - 0.5) * 160,
      size: 20 + Math.random() * 28,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
    }))
  ), [emojis, n, mode]);


  const anim = (p: EmojiPiece) =>
    mode === 'rise'
      ? `celeb-rise ${p.duration}s linear ${p.delay}s infinite`
      : mode === 'float'
        ? `celeb-float ${3 + p.delay}s ease-in-out ${p.delay}s infinite`
        : `celeb-confetti ${p.duration}s linear ${p.delay}s infinite`;

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute celeb-confetti-piece"
          style={{
            left: `${p.left}%`,
            top: mode === 'float' ? `${p.top}%` : 0,
            fontSize: `${p.size}px`,
            // @ts-expect-error custom prop usada no keyframe
            '--drift': `${p.drift}px`,
            filter: 'drop-shadow(0 4px 6px hsl(0 0% 0% / 0.4))',
            animation: anim(p),
          }}
        >{p.emoji}</span>
      ))}
    </div>
  );
}

/** Estrelas/luzes piscando espalhadas pelo fundo. */
function Twinkles({ color = '0 0% 100%', count = 26 }: { color?: string; count?: number }) {
  const { factor } = useQuality();
  const n = scaleCount(count, factor);
  const stars = useMemo(() => (
    Array.from({ length: n }).map(() => ({
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 3 + Math.random() * 5,
      delay: Math.random() * 3,
      duration: 1.6 + Math.random() * 2,
    }))
  ), [n]);

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${s.left}%`, top: `${s.top}%`,
            width: `${s.size}px`, height: `${s.size}px`,
            background: `hsl(${color})`,
            boxShadow: `0 0 ${s.size * 2}px hsl(${color})`,
            animation: `celeb-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/** Explosões de fogos coloridas. */
function Fireworks({ colors, count = 7 }: { colors: string[]; count?: number }) {
  const { factor } = useQuality();
  const n = scaleCount(count, factor);
  const bursts = useMemo(() => (
    Array.from({ length: n }).map(() => ({
      left: 10 + Math.random() * 80,
      top: 10 + Math.random() * 50,
      size: 80 + Math.random() * 140,
      delay: Math.random() * 4,
      duration: 1.4 + Math.random() * 1.4,
      color: colors[Math.floor(Math.random() * colors.length)],
    }))
  ), [colors, n]);
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      {bursts.map((b, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${b.left}%`, top: `${b.top}%`,
            width: `${b.size}px`, height: `${b.size}px`,
            marginLeft: `-${b.size / 2}px`, marginTop: `-${b.size / 2}px`,
            background: `radial-gradient(circle, hsl(${b.color} / 0.9) 0%, hsl(${b.color} / 0.4) 35%, transparent 68%)`,
            animation: `celeb-firework ${b.duration}s ease-out ${b.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/** Feixe de luz varrendo a cena (holofote / promo). */
function Beam() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute -top-1/4 left-1/2 h-[150%] w-1/3"
        style={{
          background: 'linear-gradient(90deg, transparent, hsl(0 0% 100% / 0.25), transparent)',
          animation: 'celeb-beam 3.2s ease-in-out infinite',
        }}
      />
    </div>
  );
}

/** Halo/onda expandindo atrás do herói. */
function HeroBurst({ color }: { color: string }) {
  return (
    <>
      {[0, 0.6, 1.2].map((d) => (
        <span
          key={d}
          aria-hidden
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: '120px', height: '120px',
            marginLeft: '-60px', marginTop: '-60px',
            border: `3px solid hsl(${color} / 0.8)`,
            animation: `celeb-burst 2.2s ease-out ${d}s infinite`,
          }}
        />
      ))}
    </>
  );
}

function Headline({ title, subtitle, color = '0 0% 100%' }: { title: string; subtitle: string; color?: string }) {
  return (
    <div className="relative z-10 text-center px-6 select-none">
      <h2
        className="font-heading font-black tracking-tight leading-none"
        style={{
          fontSize: 'clamp(2.4rem, 12vw, 5.2rem)',
          color: `hsl(${GOLD})`,
          textShadow: '0 2px 0 hsl(35 90% 35%), 0 6px 24px hsl(0 0% 0% / 0.6)',
          animation: 'celeb-headline 0.8s cubic-bezier(0.22,1,0.36,1) both',
        }}
      >
        {title}
      </h2>
      <p
        className="mt-2 font-heading font-bold"
        style={{
          fontSize: 'clamp(1rem, 5vw, 1.6rem)',
          color: `hsl(${color})`,
          textShadow: '0 2px 12px hsl(0 0% 0% / 0.7)',
          animation: 'celeb-sub 1.2s ease-out both',
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}

/* ====================== Cenas específicas (alta fidelidade) ====================== */

function CopaScene() {
  // Torcida pelo país do barbeiro/admin, detectado pelo FUSO HORÁRIO do dispositivo.
  const country = useMemo(() => detectCountry(), []);
  const [c1, c2, c3] = country.flagColors;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <div
        className="absolute inset-0 celeb-shimmer"
        style={{ background: `linear-gradient(135deg, hsl(${c1}) 0%, hsl(${c2}) 60%, hsl(${c3 || c1}) 100%)`, opacity: 0.92 }}
      />
      <div className="absolute inset-0 celeb-shimmer" />
      <Confetti colors={[GOLD, c1, c2, c3 || '0 0% 100%']} count={110} />

      {/* Bandeira do país flutuando como marca d'água da torcida */}
      <span
        aria-hidden
        className="absolute"
        style={{
          top: '12%', fontSize: 'clamp(56px, 22vw, 150px)', opacity: 0.9,
          filter: 'drop-shadow(0 8px 16px hsl(0 0% 0% / 0.55))',
          animation: 'celeb-bounce-hero 1.2s ease-out both',
        }}
      >{country.flagEmoji}</span>

      <div className="relative" style={{ width: 'min(78vw, 360px)', height: 'min(46vw, 220px)' }}>
        <div style={{ animation: 'celeb-net-shake 1.4s ease-out 0.4s' }} className="absolute inset-0">
          <svg viewBox="0 0 360 220" className="w-full h-full" aria-hidden>
            <defs>
              <pattern id="net" width="18" height="18" patternUnits="userSpaceOnUse">
                <path d="M0 0 L18 18 M18 0 L0 18" stroke="hsl(0 0% 100% / 0.55)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect x="20" y="20" width="320" height="180" rx="6" fill="url(#net)" />
            <rect x="14" y="14" width="332" height="192" rx="8" fill="none" stroke="hsl(0 0% 100% / 0.9)" strokeWidth="6" />
          </svg>
        </div>
        <span
          className="absolute"
          style={{
            left: '46%', top: '42%', fontSize: 'clamp(40px, 14vw, 72px)',
            filter: 'drop-shadow(0 6px 10px hsl(0 0% 0% / 0.5))',
            animation: 'celeb-ball 1.4s cubic-bezier(0.4,0,0.2,1) both',
          }}
        >⚽</span>
      </div>

      <div className="mt-4">
        <Headline title={country.golChant} subtitle={country.cheer} />
      </div>
    </div>
  );
}

function FestaJuninaScene() {
  const lanterns = ['🏮', '🎏', '🌽', '🎈', '🏮'];
  const flags = ['🔴', '🟡', '🟢', '🔵', '🟠', '🟣'];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, hsl(20 60% 14%) 0%, hsl(28 55% 22%) 60%, hsl(30 80% 30%) 100%)' }} />
      <div
        className="absolute left-1/2 -translate-x-1/2 bottom-0 rounded-full"
        style={{
          width: '90vw', height: '40vh',
          background: 'radial-gradient(ellipse at bottom, hsl(35 95% 55% / 0.85), hsl(20 90% 45% / 0.3) 45%, transparent 70%)',
          animation: 'celeb-glow 1.6s ease-in-out infinite',
        }}
      />

      <div className="absolute top-6 left-0 right-0 flex justify-around px-2" aria-hidden>
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} style={{ fontSize: 'clamp(14px, 4vw, 22px)', animation: `celeb-swing 2.4s ease-in-out ${(i % 5) * 0.15}s infinite` }}>
            {flags[i % flags.length]}
          </span>
        ))}
      </div>

      <div className="absolute inset-0" aria-hidden>
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="absolute"
            style={{
              left: `${(i * 8.3 + 4) % 100}%`,
              top: `${10 + (i % 4) * 18}%`,
              fontSize: 'clamp(26px, 8vw, 46px)',
              transformOrigin: 'top center',
              filter: 'drop-shadow(0 4px 10px hsl(0 0% 0% / 0.45))',
              animation: `celeb-drop 0.9s ease-out ${i * 0.08}s both, celeb-swing 2.6s ease-in-out ${i * 0.1}s infinite`,
            }}
          >{lanterns[i % lanterns.length]}</span>
        ))}
      </div>

      <div className="relative z-10 mt-10">
        <Headline title="FESTA JUNINA NO AR!" subtitle="Animação e Promoções Imperdíveis! 🎉" color="45 95% 70%" />
      </div>
    </div>
  );
}

function OlympicRings() {
  const rings = [
    { cx: 30, cy: 28, c: '210 80% 50%' },
    { cx: 70, cy: 28, c: '0 0% 12%' },
    { cx: 110, cy: 28, c: '0 75% 50%' },
    { cx: 50, cy: 48, c: '45 95% 55%' },
    { cx: 90, cy: 48, c: '142 60% 40%' },
  ];
  return (
    <svg viewBox="0 0 140 76" className="w-40 h-24" aria-hidden>
      {rings.map((r, i) => (
        <circle key={i} cx={r.cx} cy={r.cy} r="16" fill="none" stroke={`hsl(${r.c})`} strokeWidth="4" />
      ))}
    </svg>
  );
}

function OlimpiadasScene() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, hsl(220 70% 18%) 0%, hsl(215 75% 30%) 55%, hsl(210 70% 42%) 100%)' }} />
      <div className="absolute inset-0 flex items-center justify-center" style={{ animation: 'celeb-ring 3s ease-in-out infinite' }} aria-hidden>
        <div className="scale-[2.6] opacity-30"><OlympicRings /></div>
      </div>
      <Confetti colors={[GOLD, '0 0% 100%', '210 80% 60%']} count={70} />

      <span
        className="relative z-10"
        style={{ fontSize: 'clamp(56px, 20vw, 110px)', filter: 'drop-shadow(0 8px 16px hsl(0 0% 0% / 0.5))', animation: 'celeb-spin 1.6s ease-out both' }}
      >🥇</span>

      <div className="relative z-10 w-full overflow-hidden mt-2" style={{ height: 'clamp(40px, 12vw, 70px)' }} aria-hidden>
        <div className="absolute top-1/2 left-0 right-0 border-t-2 border-dashed border-white/50" />
        <div className="whitespace-nowrap" style={{ fontSize: 'clamp(28px, 9vw, 54px)', animation: 'celeb-run 1.8s cubic-bezier(0.3,0,0.2,1) both' }}>
          🏃‍♂️🏃‍♀️🏃
        </div>
      </div>

      <div className="relative z-10 mt-2">
        <Headline title="OLIMPÍADAS EM FOCO" subtitle="Assista aos Destaques! 🥇" color="45 95% 70%" />
      </div>
    </div>
  );
}

function DiaPaisScene() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, hsl(210 60% 30%) 0%, hsl(205 55% 45%) 55%, hsl(45 85% 60%) 100%)' }} />
      <Confetti colors={['210 75% 55%', '45 90% 60%', '0 0% 100%']} count={50} />

      <span className="absolute left-[12%] top-[24%]" style={{ fontSize: 'clamp(26px,7vw,42px)', animation: 'celeb-float 3s ease-in-out infinite' }} aria-hidden>🧰</span>
      <span className="absolute right-[12%] top-[28%]" style={{ fontSize: 'clamp(26px,7vw,42px)', animation: 'celeb-float 3.4s ease-in-out 0.4s infinite' }} aria-hidden>⌚</span>

      <div className="relative z-10" style={{ width: 'clamp(90px, 28vw, 150px)', height: 'clamp(90px, 28vw, 150px)' }}>
        <span className="absolute inset-0 flex items-center justify-center" style={{ fontSize: 'clamp(60px, 22vw, 120px)', animation: 'celeb-morph-out 2.6s ease-in-out infinite' }}>👔</span>
        <span className="absolute inset-0 flex items-center justify-center" style={{ fontSize: 'clamp(60px, 22vw, 120px)', animation: 'celeb-morph-in 2.6s ease-in-out infinite' }}>💙</span>
      </div>

      <div className="relative z-10 mt-4">
        <Headline title="DIA DOS PAIS" subtitle="Homenagem Especial 💙" color="0 0% 100%" />
      </div>
    </div>
  );
}

/* =============== Cena temática rica (config por categoria) =============== */

type HeroAnim = 'spin' | 'pulse' | 'bounce';

interface ThemedConfig {
  gradient: string;
  emojis: string[];
  emojiMode?: EmojiMode;
  hero: string;
  heroAnim?: HeroAnim;
  copy: SceneCopy;
  heroColor?: string;
  /** Brilho radial inferior (fogueira/holofote) */
  glow?: string;
  /** Cor do halo que estoura atrás do herói */
  burst?: string;
  /** Estrelas/luzes piscando no fundo */
  twinkle?: string;
  /** Explosões de fogos */
  fireworks?: string[];
  /** Feixe de luz varrendo */
  beam?: boolean;
  /** Confete (cores). Se ausente, sem confete. */
  confetti?: string[];
  /** Aplica brilho shimmer por cima do gradiente */
  shimmer?: boolean;
}

function ThemedScene({ config }: { config: ThemedConfig }) {
  const { heavy } = useQuality();
  const heroAnim =
    config.heroAnim === 'pulse'
      ? 'celeb-pulse-hero 2.2s ease-in-out infinite'
      : config.heroAnim === 'bounce'
        ? 'celeb-bounce-hero 2.4s ease-in-out infinite'
        : 'celeb-spin 1.6s ease-out both';

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0" style={{ background: config.gradient }} />
      {config.shimmer && <div className="absolute inset-0 celeb-shimmer" />}
      {/* Efeitos pesados (twinkle/fogos/feixe) só em telas maiores e aparelhos capazes */}
      {config.twinkle && heavy && <Twinkles color={config.twinkle} />}
      {config.fireworks && <Fireworks colors={config.fireworks} />}
      {config.beam && heavy && <Beam />}

      {config.glow && (
        <div
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 bottom-0 rounded-full"
          style={{
            width: '95vw', height: '42vh',
            background: `radial-gradient(ellipse at bottom, hsl(${config.glow} / 0.7), transparent 65%)`,
            animation: 'celeb-glow 1.8s ease-in-out infinite',
          }}
        />
      )}
      <EmojiField emojis={config.emojis} mode={config.emojiMode || 'rain'} />
      {config.confetti && <Confetti colors={config.confetti} count={70} />}

      <div className="relative z-10 flex items-center justify-center" style={{ width: 'clamp(120px, 40vw, 220px)', height: 'clamp(120px, 40vw, 220px)' }}>
        {config.burst && <HeroBurst color={config.burst} />}
        <span
          className="relative"
          style={{
            fontSize: 'clamp(60px, 24vw, 130px)',
            filter: 'drop-shadow(0 8px 16px hsl(0 0% 0% / 0.5))',
            animation: heroAnim,
          }}
        >
          {config.hero}
        </span>
      </div>

      <div className="relative z-10 mt-2">
        <Headline {...config.copy} color={config.heroColor} />
      </div>
    </div>
  );
}

const THEMED_CONFIGS: Record<string, ThemedConfig> = {
  natal: {
    gradient: 'linear-gradient(160deg, hsl(220 55% 12%) 0%, hsl(0 60% 26%) 55%, hsl(142 50% 22%) 100%)',
    emojis: ['❄️', '🎁', '⭐', '🎅', '🦌', '🔔'],
    emojiMode: 'rain',
    hero: '🎄',
    heroAnim: 'bounce',
    copy: { title: 'FELIZ NATAL!', subtitle: 'Boas festas e ótimos cortes! 🎁' },
    glow: '0 0% 100%',
    twinkle: '45 95% 70%',
    burst: '142 60% 55%',
  },
  'ano-novo': {
    gradient: 'linear-gradient(160deg, hsl(240 60% 10%) 0%, hsl(265 55% 22%) 55%, hsl(45 90% 28%) 100%)',
    emojis: ['🎆', '✨', '🥂', '🎇', '⭐', '🍾'],
    hero: '🎆',
    heroAnim: 'pulse',
    copy: { title: 'FELIZ ANO NOVO!', subtitle: 'Comece o ano com estilo! 🥂' },
    fireworks: [GOLD, '210 80% 60%', '320 80% 60%', '0 0% 100%'],
    twinkle: '0 0% 100%',
    confetti: [GOLD, '210 80% 60%', '0 0% 100%'],
  },
  carnaval: {
    gradient: 'linear-gradient(135deg, hsl(320 80% 45%) 0%, hsl(265 70% 50%) 50%, hsl(50 95% 50%) 100%)',
    emojis: ['🎭', '🎊', '🎉', '🪅', '🎶', '🥁'],
    hero: '🎭',
    heroAnim: 'pulse',
    copy: { title: 'É CARNAVAL!', subtitle: 'Cai na folia no capricho! 🎉' },
    shimmer: true,
    confetti: ['320 80% 60%', '50 95% 55%', '142 70% 50%', '210 80% 60%'],
    burst: '50 95% 60%',
  },
  pascoa: {
    gradient: 'linear-gradient(160deg, hsl(275 45% 45%) 0%, hsl(330 50% 60%) 55%, hsl(150 45% 55%) 100%)',
    emojis: ['🥚', '🐰', '🍫', '🌷', '🐣', '🧺'],
    emojiMode: 'float',
    hero: '🐰',
    heroAnim: 'bounce',
    copy: { title: 'FELIZ PÁSCOA!', subtitle: 'Doçura e renovação 🍫' },
    confetti: ['330 60% 70%', '150 50% 60%', '45 90% 65%'],
    burst: '330 60% 70%',
  },
  'dia-maes': {
    gradient: 'linear-gradient(160deg, hsl(340 60% 42%) 0%, hsl(320 55% 60%) 100%)',
    emojis: ['💐', '🌹', '💖', '🎀', '💕', '🌸'],
    emojiMode: 'rise',
    hero: '💐',
    heroAnim: 'pulse',
    copy: { title: 'FELIZ DIA DAS MÃES!', subtitle: 'Para as mães mais especiais 💖' },
    burst: '0 0% 100%',
    twinkle: '0 0% 100%',
  },
  namorados: {
    gradient: 'linear-gradient(160deg, hsl(350 70% 32%) 0%, hsl(0 70% 50%) 100%)',
    emojis: ['❤️', '💕', '💘', '🌹', '💋', '💞'],
    emojiMode: 'rise',
    hero: '❤️',
    heroAnim: 'pulse',
    copy: { title: 'DIA DOS NAMORADOS', subtitle: 'Fique no ponto pro date 💘' },
    burst: '0 0% 100%',
  },
  'dia-trabalhador': {
    gradient: 'linear-gradient(160deg, hsl(210 55% 28%) 0%, hsl(30 70% 42%) 100%)',
    emojis: ['🛠️', '⚙️', '💪', '🔧', '👷', '🦺'],
    hero: '🛠️',
    heroAnim: 'bounce',
    copy: { title: 'DIA DO TRABALHADOR', subtitle: 'Respeito a quem faz acontecer 💪' },
    confetti: ['30 80% 55%', '210 60% 55%', '0 0% 100%'],
    burst: '30 80% 55%',
  },
  independencia: {
    gradient: 'linear-gradient(160deg, hsl(142 70% 22%) 0%, hsl(142 60% 32%) 55%, hsl(50 92% 40%) 100%)',
    emojis: ['🇧🇷', '🟢', '🟡', '🔵', '⭐', '🎉'],
    hero: '🇧🇷',
    heroAnim: 'pulse',
    copy: { title: 'INDEPENDÊNCIA DO BRASIL', subtitle: 'Viva o Brasil! 🇧🇷' },
    confetti: ['142 70% 45%', '50 92% 55%', '210 80% 55%', '0 0% 100%'],
    glow: '50 92% 55%',
    burst: '50 92% 60%',
  },
  criancas: {
    gradient: 'linear-gradient(160deg, hsl(195 80% 45%) 0%, hsl(330 70% 60%) 55%, hsl(45 90% 55%) 100%)',
    emojis: ['🎈', '🧸', '🍭', '🎠', '🪁', '🎉'],
    emojiMode: 'rise',
    hero: '🎈',
    heroAnim: 'bounce',
    copy: { title: 'DIA DAS CRIANÇAS', subtitle: 'Diversão garantida! 🧸' },
    confetti: ['195 80% 60%', '330 70% 65%', '45 90% 60%'],
    burst: '45 90% 60%',
  },
  'outubro-rosa': {
    gradient: 'linear-gradient(160deg, hsl(330 65% 35%) 0%, hsl(330 60% 55%) 55%, hsl(320 55% 70%) 100%)',
    emojis: ['🎀', '💗', '🌸', '🩷', '💝', '🤍'],
    emojiMode: 'rise',
    hero: '🎀',
    heroAnim: 'pulse',
    copy: { title: 'OUTUBRO ROSA', subtitle: 'Cuide da sua saúde 💗' },
    heroColor: '0 0% 100%',
    burst: '0 0% 100%',
    twinkle: '0 0% 100%',
  },
  'novembro-azul': {
    gradient: 'linear-gradient(160deg, hsl(210 70% 22%) 0%, hsl(200 60% 45%) 100%)',
    emojis: ['💙', '🩺', '🎗️', '💪', '🔵'],
    emojiMode: 'rise',
    hero: '💙',
    heroAnim: 'pulse',
    copy: { title: 'NOVEMBRO AZUL', subtitle: 'Cuide da sua saúde 💙' },
    heroColor: '0 0% 100%',
    burst: '0 0% 100%',
    twinkle: '0 0% 100%',
  },
  'consciencia-negra': {
    gradient: 'linear-gradient(160deg, hsl(20 60% 22%) 0%, hsl(30 65% 32%) 55%, hsl(45 80% 45%) 100%)',
    emojis: ['✊🏿', '🌍', '⭐', '🟤', '🟡'],
    hero: '✊🏿',
    heroAnim: 'pulse',
    copy: { title: 'CONSCIÊNCIA NEGRA', subtitle: 'Resistência e representatividade ✊🏿' },
    glow: '45 80% 50%',
    burst: '45 80% 55%',
  },
  'black-friday': {
    gradient: 'linear-gradient(160deg, hsl(0 0% 8%) 0%, hsl(0 0% 14%) 55%, hsl(45 90% 25%) 100%)',
    emojis: ['🛍️', '💰', '🏷️', '💸', '🔥', '🤑'],
    hero: '🛍️',
    heroAnim: 'bounce',
    copy: { title: 'BLACK FRIDAY', subtitle: 'Ofertas imperdíveis! 🔥' },
    glow: '45 95% 55%',
    beam: true,
    confetti: [GOLD, '0 0% 100%'],
    burst: '45 95% 55%',
  },
  halloween: {
    gradient: 'linear-gradient(160deg, hsl(25 90% 32%) 0%, hsl(280 55% 22%) 55%, hsl(0 0% 8%) 100%)',
    emojis: ['🎃', '👻', '🦇', '🕷️', '💀', '🍬'],
    emojiMode: 'float',
    hero: '🎃',
    heroAnim: 'pulse',
    copy: { title: 'HALLOWEEN', subtitle: 'Um corte assustadoramente bom! 👻' },
    glow: '25 90% 50%',
    burst: '25 90% 55%',
    twinkle: '280 60% 70%',
  },
  thanksgiving: {
    gradient: 'linear-gradient(160deg, hsl(28 70% 28%) 0%, hsl(35 75% 42%) 55%, hsl(45 80% 52%) 100%)',
    emojis: ['🦃', '🍂', '🍁', '🌽', '🥧', '🍗'],
    hero: '🦃',
    heroAnim: 'bounce',
    copy: { title: 'AÇÃO DE GRAÇAS', subtitle: 'Gratidão e bons momentos 🍂' },
    confetti: ['28 75% 50%', '40 80% 55%', '15 70% 45%'],
    burst: '40 80% 55%',
  },
};

// Cena de Dia Nacional / Independência adaptada ao PAÍS detectado pelo fuso.
// O barbeiro em Portugal vê as cores e o nome de Portugal; na Espanha, da Espanha; etc.
function NationalScene({ event }: { event: AppEvent }) {
  const country = useMemo(() => detectCountry(), []);
  const [c1, c2, c3] = country.flagColors;
  const titleByLocale: Record<string, string> = {
    'pt-BR': `VIVA ${country.name.toUpperCase()}!`,
    'pt-PT': `VIVA ${country.name.toUpperCase()}!`,
    es: `¡VIVA ${country.name.toUpperCase()}!`,
    en: `${country.name.toUpperCase()} PRIDE!`,
  };
  const config: ThemedConfig = {
    gradient: `linear-gradient(160deg, hsl(${c1}) 0%, hsl(${c2}) 55%, hsl(${c3 || c1}) 100%)`,
    emojis: [country.flagEmoji, '⭐', '🎉', '🎊', '✨', country.flagEmoji],
    hero: country.flagEmoji,
    heroAnim: 'pulse',
    copy: {
      title: titleByLocale[country.locale] || titleByLocale['pt-BR'],
      subtitle: country.cheer,
    },
    confetti: [c1, c2, c3 || c1, '0 0% 100%'],
    glow: c2,
    burst: c3 || c2,
    twinkle: '0 0% 100%',
  };
  return <ThemedScene config={config} />;
}

function GenericScene({ event }: { event: AppEvent }) {
  const primary = event.cor_primaria || '38 55% 55%';
  const secondary = event.cor_secundaria || primary;
  const title = (event.banner_texto || event.nome || 'EM FESTA!').toUpperCase();
  const config: ThemedConfig = {
    gradient: `linear-gradient(135deg, hsl(${primary}) 0%, hsl(${secondary}) 100%)`,
    emojis: [event.emoji || '🎉', '✨', '🎊', '⭐', '🎉'],
    hero: event.emoji || '🎉',
    heroAnim: 'pulse',
    copy: { title, subtitle: event.descricao || 'Celebre com a gente!' },
    shimmer: true,
    confetti: [GOLD, primary, secondary, '0 0% 100%'],
    burst: secondary,
    twinkle: '0 0% 100%',
  };
  return <ThemedScene config={config} />;
}

function Scene({ event }: { event: AppEvent }) {
  switch (event.categoria) {
    case 'copa': return <CopaScene />;
    case 'festa-junina': return <FestaJuninaScene />;
    case 'olimpiadas': return <OlimpiadasScene />;
    case 'dia-pais': return <DiaPaisScene />;
    case 'independencia':
    case 'national':
    case 'dia-nacional': return <NationalScene event={event} />;
    default: {
      const cfg = THEMED_CONFIGS[event.categoria];
      if (cfg) {
        // Usa o emoji do evento quando definido, caso contrário o herói da config.
        const merged: ThemedConfig = { ...cfg, hero: event.emoji || cfg.hero };
        return <ThemedScene config={merged} />;
      }
      return <GenericScene event={event} />;
    }
  }
}

export default function EventCelebration({
  event,
  onClose,
  duration = 7000,
}: {
  event: AppEvent;
  onClose: () => void;
  duration?: number;
}) {
  const [leaving, setLeaving] = useState(false);
  const closedRef = useRef(false);
  const locale = useMemo(() => detectCountry().locale, []);

  const finish = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    setLeaving(true);
    window.setTimeout(onClose, 500);
  };

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(finish, reduce ? 2200 : duration);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  return (
    <div
      role="dialog"
      aria-label={`Celebração ${event.nome}`}
      onClick={finish}
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        background: 'hsl(0 0% 0%)',
        animation: 'celeb-backdrop-in 0.4s ease-out both',
        opacity: leaving ? 0 : 1,
        transition: 'opacity 0.5s ease-out',
      }}
    >
      <div
        className="relative w-full h-full overflow-hidden"
        style={{ contain: 'strict', transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
      >
        <Scene event={event} />
      </div>


      <button
        onClick={(e) => { e.stopPropagation(); finish(); }}
        className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-20 rounded-full bg-black/40 text-white/90 backdrop-blur px-3 py-1.5 text-xs font-semibold border border-white/20"
      >
        {ct('skip', locale)} ✕
      </button>
    </div>
  );
}
