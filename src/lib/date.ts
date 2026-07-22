import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;

  const dmy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    let yearNum = parseInt(y, 10);
    if (yearNum < 100) yearNum += 2000;

    const dayNum = parseInt(d, 10);
    const monthNum = parseInt(m, 10);
    if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;

    const result = new Date(Date.UTC(yearNum, monthNum - 1, dayNum, 12));
    if (result.getUTCDate() !== dayNum || result.getUTCMonth() !== monthNum - 1) return null;
    return result;
  }

  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const result = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3], 12));
    if (result.getUTCDate() !== +iso[3] || result.getUTCMonth() !== +iso[2] - 1) return null;
    return result;
  }

  const native = new Date(dateStr);
  return Number.isNaN(native.getTime()) ? null : native;
}

export function toDateInputValue(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

// Fuso local: "hoje" precisa refletir o dia do usuário, não UTC.
export function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Hora local "HH:mm" — usada como default no IOSTimeInput.
export function nowTimeValue() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDateLabel(dateStr: string | null | undefined, fallback = '—') {
  const parsed = parseDate(dateStr);
  if (!parsed) return fallback;
  return format(parsed, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
}

export function formatDateShort(dateStr: string | null | undefined, fallback = '—') {
  const parsed = parseDate(dateStr);
  if (!parsed) return fallback;
  return format(parsed, 'dd/MM/yyyy', { locale: ptBR });
}

export function formatDateWithWeekday(dateStr: string | null | undefined, fallback = '—') {
  const parsed = parseDate(dateStr);
  if (!parsed) return fallback;
  return format(parsed, "dd/MM/yyyy (EEEE)", { locale: ptBR });
}

export function formatDayChip(dateStr: string) {
  const parsed = parseDate(dateStr);
  if (!parsed) return { dayName: '--', dayNum: '--', monthName: '--' };
  return {
    dayName: format(parsed, 'EEE', { locale: ptBR }),
    dayNum: format(parsed, 'dd', { locale: ptBR }),
    monthName: format(parsed, 'MMM', { locale: ptBR }),
  };
}