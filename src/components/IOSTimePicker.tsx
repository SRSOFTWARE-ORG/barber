import { useEffect, useRef, useCallback } from 'react';

interface Slot {
  time: string;
  available: boolean;
}

interface Props {
  slots: Slot[];
  value: string | null;
  onChange: (time: string) => void;
}

/**
 * Seletor estilo iOS (wheel picker) — 100% centralizado e responsivo.
 * - Snap-scroll vertical, item central destacado
 * - Pula automaticamente horários indisponíveis
 * - Toque/clique direto também seleciona
 */
const ITEM_H = 44;
const VISIBLE = 5; // ímpar para ter centro

export default function IOSTimePicker({ slots, value, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const isProgrammatic = useRef(false);

  const PAD = Math.floor(VISIBLE / 2) * ITEM_H;
  const containerH = ITEM_H * VISIBLE;

  const scrollToIndex = useCallback((idx: number, smooth = true) => {
    if (!ref.current) return;
    isProgrammatic.current = true;
    ref.current.scrollTo({ top: idx * ITEM_H, behavior: smooth ? 'smooth' : 'auto' });
    window.setTimeout(() => { isProgrammatic.current = false; }, smooth ? 350 : 50);
  }, []);

  // Scroll para o valor selecionado quando muda externamente
  useEffect(() => {
    if (!ref.current || slots.length === 0) return;
    const targetIdx = value ? slots.findIndex(s => s.time === value) : slots.findIndex(s => s.available);
    if (targetIdx >= 0) scrollToIndex(targetIdx, false);
  }, [slots.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ref.current || !value) return;
    const idx = slots.findIndex(s => s.time === value);
    if (idx >= 0 && Math.round(ref.current.scrollTop / ITEM_H) !== idx) {
      scrollToIndex(idx);
    }
  }, [value, slots, scrollToIndex]);

  const handleScroll = () => {
    if (!ref.current || isProgrammatic.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!ref.current) return;
      const raw = Math.round(ref.current.scrollTop / ITEM_H);
      let idx = Math.max(0, Math.min(slots.length - 1, raw));
      // Se cair em horário indisponível, procura próximo disponível
      if (slots[idx] && !slots[idx].available) {
        let up = idx, down = idx;
        while (up >= 0 || down < slots.length) {
          if (down < slots.length && slots[down]?.available) { idx = down; break; }
          if (up >= 0 && slots[up]?.available) { idx = up; break; }
          up--; down++;
        }
      }
      const slot = slots[idx];
      if (!slot) return;
      scrollToIndex(idx);
      if (slot.available && slot.time !== value) {
        onChange(slot.time);
        try { (navigator as any).vibrate?.(8); } catch { /* noop */ }
      }
    }, 120);
  };

  return (
    <div
      className="relative mx-auto select-none touch-pan-y"
      style={{ width: 220, height: containerH }}
    >
      {/* Faixa central destacada */}
      <div
        className="pointer-events-none absolute left-2 right-2 top-1/2 -translate-y-1/2 rounded-xl border-y border-primary/40 bg-primary/10"
        style={{ height: ITEM_H }}
      />
      {/* Fades topo/base */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-12 z-10 bg-gradient-to-b from-background to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 z-10 bg-gradient-to-t from-background to-transparent" />

      <div
        ref={ref}
        onScroll={handleScroll}
        className="h-full overflow-y-scroll scrollbar-hide"
        style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
      >
        <div style={{ height: PAD }} aria-hidden />
        {slots.map((s, i) => {
          const isSelected = value === s.time;
          return (
            <div
              key={s.time}
              onClick={() => {
                if (!s.available) return;
                scrollToIndex(i);
                if (s.time !== value) onChange(s.time);
              }}
              className={`flex items-center justify-center font-heading text-2xl transition-colors ${
                !s.available
                  ? 'text-muted-foreground/30 line-through'
                  : isSelected
                    ? 'text-primary font-bold'
                    : 'text-foreground/70'
              } ${s.available ? 'cursor-pointer' : 'cursor-not-allowed'}`}
              style={{ height: ITEM_H, scrollSnapAlign: 'center' }}
            >
              {s.time}
            </div>
          );
        })}
        <div style={{ height: PAD }} aria-hidden />
      </div>
    </div>
  );
}
