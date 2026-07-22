import { useMemo } from 'react';
import type { AnimationType } from '@/lib/event-presets';

const EMOJI: Record<Exclude<AnimationType, 'none'>, string[]> = {
  snow: ['❄️', '❅', '❆'],
  fireworks: ['🎆', '🎇', '✨'],
  confetti: ['🎊', '🎉', '🟥', '🟦', '🟨', '🟩'],
  stars: ['⭐', '🌟', '✨'],
  lights: ['✨', '💡', '🔆'],
  balloons: ['🎈'],
  flags: ['🚩', '🏳️', '🎌'],
  easter: ['🥚', '🐰', '🌷'],
  leaves: ['🍂', '🍁', '🌿'],
  coins: ['🪙', '💰', '💵'],
};

const RISE: AnimationType[] = ['balloons'];
const TWINKLE: AnimationType[] = ['stars', 'lights', 'fireworks'];

interface Particle {
  left: number; size: number; delay: number; duration: number; drift: number; emoji: string;
}

export default function EventAnimation({ type, count = 24 }: { type: AnimationType; count?: number }) {
  const particles = useMemo<Particle[]>(() => {
    if (type === 'none') return [];
    const set = EMOJI[type] || ['✨'];
    return Array.from({ length: count }).map(() => ({
      left: Math.random() * 100,
      size: 14 + Math.random() * 22,
      delay: Math.random() * 6,
      duration: 5 + Math.random() * 7,
      drift: (Math.random() - 0.5) * 120,
      emoji: set[Math.floor(Math.random() * set.length)],
    }));
  }, [type, count]);

  if (type === 'none' || particles.length === 0) return null;

  const isTwinkle = TWINKLE.includes(type);
  const isRise = RISE.includes(type);
  const animName = isTwinkle ? 'event-twinkle' : isRise ? 'event-rise' : 'event-fall';

  return (
    <div aria-hidden className="fixed inset-0 z-[60] pointer-events-none overflow-hidden">
      {particles.map((p, i) => (
        <span
          key={i}
          className="event-particle"
          style={{
            left: `${p.left}%`,
            top: isTwinkle ? `${Math.random() * 90}%` : undefined,
            fontSize: `${p.size}px`,
            // @ts-expect-error custom prop usada no keyframe
            '--drift': `${p.drift}px`,
            animation: `${animName} ${p.duration}s linear ${p.delay}s infinite`,
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}
