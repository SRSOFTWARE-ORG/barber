import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, RotateCcw, X } from 'lucide-react';
import { parseDate, todayInputValue, toDateInputValue } from '@/lib/date';

const ITEM_H = 40;
const VISIBLE = 7;

function Wheel({ items, value, onChange }: { items: string[]; value: string; onChange: (v: string) => void }) {
  const pad = Math.floor(VISIBLE / 2) * ITEM_H;
  const height = ITEM_H * VISIBLE;
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<number>();
  const idx = Math.max(0, items.indexOf(value));

  // Mantém o scroll alinhado ao valor selecionado (abre já mostrando a data atual).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = idx * ITEM_H;
    if (Math.abs(el.scrollTop - target) > 2) el.scrollTop = target;
  }, [idx, items.length]);

  // Seleciona ao arrastar/rolar: ao parar, escolhe o item centralizado.
  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H)));
      if (items[i] !== undefined && items[i] !== value) onChange(items[i]);
    }, 80);
  };

  return (
    <div className="relative select-none" style={{ width: 92, height }}>
      <div
        className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-md bg-primary/15 border-y border-primary/40"
        style={{ height: ITEM_H }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 z-10 bg-gradient-to-b from-card to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 z-10 bg-gradient-to-t from-card to-transparent" />
      <div ref={ref} onScroll={handleScroll} className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-hide">
        <div style={{ height: pad }} />
        {items.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            className={`w-full flex items-center justify-center font-heading text-base transition-colors snap-center ${
              value === item ? 'text-primary font-bold' : 'text-foreground/65'
            }`}
            style={{ height: ITEM_H }}
          >
            {item}
          </button>
        ))}
        <div style={{ height: pad }} />
      </div>
    </div>
  );
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function IOSDateInput({
  value,
  onChange,
  placeholder = 'Selecionar data',
  className = '',
  disabled = false,
  min,
  max,
  minNow = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  /** Impede seleção anterior a hoje (data local). */
  minNow?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveMin = minNow ? (min && min > todayInputValue() ? min : todayInputValue()) : min;

  const initialDate = useMemo(
    () => parseDate(value) || parseDate(todayInputValue()) || new Date(),
    [value],
  );
  const [tmpYear, setTmpYear] = useState(String(initialDate.getUTCFullYear()));
  const [tmpMonth, setTmpMonth] = useState(String(initialDate.getUTCMonth() + 1).padStart(2, '0'));
  const [tmpDay, setTmpDay] = useState(String(initialDate.getUTCDate()).padStart(2, '0'));

  useEffect(() => {
    if (!open) return;
    setError(null);
    // Sempre abre já posicionado na data atual (ou no valor já selecionado, se houver).
    const parsed = parseDate(value) || parseDate(todayInputValue()) || new Date();
    setTmpYear(String(parsed.getUTCFullYear()));
    setTmpMonth(String(parsed.getUTCMonth() + 1).padStart(2, '0'));
    setTmpDay(String(parsed.getUTCDate()).padStart(2, '0'));
  }, [open, value]);

  const yearNow = new Date().getFullYear() + 2;
  const years = useMemo(
    () => Array.from({ length: 141 }, (_, i) => String(1900 + i)).filter((y) => y <= String(yearNow)),
    [yearNow],
  );
  const months = useMemo(() => MONTHS.map((label, index) => `${String(index + 1).padStart(2, '0')} · ${label}`), []);
  const daysInMonth = new Date(Number(tmpYear), Number(tmpMonth), 0).getDate();
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0')), [daysInMonth]);

  useEffect(() => {
    if (Number(tmpDay) > daysInMonth) setTmpDay(String(daysInMonth).padStart(2, '0'));
  }, [daysInMonth, tmpDay]);

  const label = value
    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(parseDate(value) || new Date())
    : placeholder;

  const confirm = () => {
    const nextValue = `${tmpYear}-${tmpMonth}-${tmpDay}`;
    if (effectiveMin && nextValue < effectiveMin) {
      setError(
        minNow
          ? 'Não é possível escolher uma data anterior a hoje.'
          : `Data mínima permitida: ${effectiveMin.split('-').reverse().join('/')}.`,
      );
      return;
    }
    if (max && nextValue > max) {
      setError(`Data máxima permitida: ${max.split('-').reverse().join('/')}.`);
      return;
    }
    onChange(nextValue);
    setOpen(false);
  };

  const resetToToday = () => {
    const today = parseDate(todayInputValue()) || new Date();
    setTmpYear(String(today.getUTCFullYear()));
    setTmpMonth(String(today.getUTCMonth() + 1).padStart(2, '0'));
    setTmpDay(String(today.getUTCDate()).padStart(2, '0'));
    setError(null);
  };

  const clearSelection = () => {
    // Limpa e reposiciona wheels na data atual.
    onChange('');
    resetToToday();
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
        <span className={value ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
        <CalendarDays size={14} className="text-muted-foreground" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[110] bg-background/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="wood-card rounded-2xl p-4 w-full max-w-sm space-y-3 shadow-2xl border border-border">
            <div className="text-center text-xs text-muted-foreground">Selecione a data</div>
            <div className="flex items-center justify-center gap-2 overflow-hidden">
              <Wheel items={days} value={tmpDay} onChange={setTmpDay} />
              <Wheel items={months} value={months[Number(tmpMonth) - 1]} onChange={(v) => setTmpMonth(v.slice(0, 2))} />
              <Wheel items={years} value={tmpYear} onChange={setTmpYear} />
            </div>
            {error && (
              <div className="text-center text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md py-1.5 px-2">
                {error}
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={clearSelection} className="flex-1 wood-card py-2 rounded-lg text-xs flex items-center justify-center gap-1" title="Limpar seleção">
                <X size={12} /> Limpar
              </button>
              <button type="button" onClick={resetToToday} className="flex-1 wood-card py-2 rounded-lg text-xs flex items-center justify-center gap-1">
                <RotateCcw size={12} /> Agora
              </button>
              <button type="button" onClick={confirm} className="flex-1 vintage-btn py-2 rounded-lg text-sm flex items-center justify-center gap-1">
                <Check size={14} /> Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}