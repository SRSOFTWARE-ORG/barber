import { useEffect, useRef, useState, useCallback } from 'react';
import { Clock, Check, RotateCcw, X } from 'lucide-react';
import { nowTimeValue } from '@/lib/date';

/**
 * Campo de hora estilo iOS — popover com duas rodas (hora / minuto).
 * 100% controlado, sem usar input type="time" nativo (que bugava).
 */
const ITEM_H = 40;
const VISIBLE = 7;

interface Props {
  value: string; // "HH:mm" ou ""
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  minuteStep?: number;
  disabled?: boolean;
  /** Se true e a data acompanhada for hoje, impede horários antes de agora. */
  minNow?: boolean;
  /** Data selecionada no par (YYYY-MM-DD) — usada com minNow para saber se é hoje. */
  dateContext?: string;
}

function Wheel({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const programmatic = useRef(false);
  const PAD = Math.floor(VISIBLE / 2) * ITEM_H;
  const H = ITEM_H * VISIBLE;

  const scrollTo = useCallback((idx: number, smooth = true) => {
    if (!ref.current) return;
    programmatic.current = true;
    ref.current.scrollTo({ top: idx * ITEM_H, behavior: smooth ? 'smooth' : 'auto' });
    window.setTimeout(() => { programmatic.current = false; }, smooth ? 250 : 30);
  }, []);

  useEffect(() => {
    const idx = items.indexOf(value);
    if (idx >= 0) scrollTo(idx, false);
  }, [items, value, scrollTo]);

  const handleScroll = () => {
    if (!ref.current || programmatic.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!ref.current) return;
      const idx = Math.max(0, Math.min(items.length - 1, Math.round(ref.current.scrollTop / ITEM_H)));
      scrollTo(idx);
      const v = items[idx];
      if (v && v !== value) {
        onChange(v);
        try { (navigator as any).vibrate?.(6); } catch { /* */ }
      }
    }, 100);
  };

  return (
    <div className="relative select-none" style={{ width: 90, height: H }}>
      <div
        className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-md bg-primary/15 border-y border-primary/40"
        style={{ height: ITEM_H }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 z-10 bg-gradient-to-b from-card to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 z-10 bg-gradient-to-t from-card to-transparent" />
      <div
        ref={ref}
        onScroll={handleScroll}
        className="h-full overflow-y-scroll scrollbar-hide"
        style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
      >
        <div style={{ height: PAD }} />
        {items.map((it, i) => (
          <div
            key={it}
            onClick={() => { scrollTo(i); if (it !== value) onChange(it); }}
            className={`flex items-center justify-center font-heading text-xl cursor-pointer transition-colors ${
              value === it ? 'text-primary font-bold' : 'text-foreground/60'
            }`}
            style={{ height: ITEM_H, scrollSnapAlign: 'center' }}
          >
            {it}
          </div>
        ))}
        <div style={{ height: PAD }} />
      </div>
    </div>
  );
}

export default function IOSTimeInput({
  value,
  onChange,
  placeholder = '--:--',
  className = '',
  minuteStep = 1,
  disabled = false,
  minNow = false,
  dateContext,
}: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initial = value || nowTimeValue();
  const [h, m] = (initial.match(/^(\d{1,2}):(\d{1,2})$/) ? initial.split(':') : ['12', '00']);
  const [tmpH, setTmpH] = useState(h.padStart(2, '0'));
  const [tmpM, setTmpM] = useState(m.padStart(2, '0'));

  useEffect(() => {
    if (open) {
      setError(null);
      // Sempre abre na hora atual quando não há valor.
      const v = value || nowTimeValue();
      const [hh, mm] = v.split(':');
      setTmpH((hh || '12').padStart(2, '0'));
      setTmpM((mm || '00').padStart(2, '0'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = Array.from({ length: Math.floor(60 / minuteStep) }, (_, i) =>
    String(i * minuteStep).padStart(2, '0'),
  );

  const isToday = (() => {
    if (!dateContext) return true; // sem contexto assumimos "hoje" (segurança)
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return dateContext === today;
  })();

  const confirm = () => {
    const next = `${tmpH}:${tmpM}`;
    if (minNow && isToday && next < nowTimeValue()) {
      setError('Não é possível escolher um horário anterior ao atual.');
      return;
    }
    onChange(next);
    setOpen(false);
  };

  const resetToNow = () => {
    const now = nowTimeValue();
    setTmpH(now.slice(0, 2));
    setTmpM(now.slice(3, 5));
    setError(null);
  };

  const clearSelection = () => {
    onChange('');
    resetToNow();
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`vintage-input flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left disabled:opacity-50 ${className}`}
      >
        <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
          {value || placeholder}
        </span>
        <Clock size={14} className="text-muted-foreground" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] bg-background/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="wood-card rounded-2xl p-4 w-full max-w-xs space-y-3 shadow-2xl border border-border"
          >
            <div className="text-center text-xs text-muted-foreground">Selecione o horário</div>
            <div className="flex items-center justify-center gap-2">
              <Wheel items={hours} value={tmpH} onChange={setTmpH} />
              <div className="font-heading text-2xl text-primary">:</div>
              <Wheel items={minutes} value={tmpM} onChange={setTmpM} />
            </div>
            {error && (
              <div className="text-center text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md py-1.5 px-2">
                {error}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearSelection}
                className="flex-1 wood-card py-2 rounded-lg text-xs flex items-center justify-center gap-1"
                title="Limpar seleção"
              >
                <X size={12} /> Limpar
              </button>
              <button
                type="button"
                onClick={resetToNow}
                className="flex-1 wood-card py-2 rounded-lg text-xs flex items-center justify-center gap-1"
              >
                <RotateCcw size={12} /> Agora
              </button>
              <button
                type="button"
                onClick={confirm}
                className="flex-1 vintage-btn py-2 rounded-lg text-sm flex items-center justify-center gap-1"
              >
                <Check size={14} /> Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
