// Calendário de eventos NACIONAIS por país, sincronizado com o fuso horário
// detectado do dispositivo (sem GPS). Junta os eventos globais (Natal, Ano Novo,
// Copa, etc.) com os feriados/datas nacionais do país detectado.
import { EVENT_PRESETS, presetDates, type EventPreset } from '@/lib/event-presets';
import { detectCountry, COUNTRIES, type CountryProfile } from '@/lib/country-locale';

// Eventos que valem para todos os países (já existem em EVENT_PRESETS).
// Datas nacionais específicas por país (independência e principais feriados cívicos).
const NATIONAL: Record<string, Array<Omit<EventPreset, 'animacao'> & { animacao?: EventPreset['animacao'] }>> = {
  BR: [
    { categoria: 'dia-nacional', nome: 'Tiradentes', descricao: '21 de Abril', emoji: '🇧🇷', cor_primaria: '142 70% 35%', cor_secundaria: '50 92% 50%', banner_texto: '🇧🇷 Feriado Nacional — Tiradentes', start: { m: 4, d: 20 }, end: { m: 4, d: 21 }, animacao: 'flags' },
    { categoria: 'dia-nacional', nome: 'Proclamação da República', descricao: '15 de Novembro', emoji: '🇧🇷', cor_primaria: '142 70% 35%', cor_secundaria: '50 92% 50%', banner_texto: '🇧🇷 Proclamação da República', start: { m: 11, d: 14 }, end: { m: 11, d: 15 }, animacao: 'flags' },
  ],
  AR: [{ categoria: 'independencia', nome: 'Día de la Independencia', descricao: '9 de Julio', emoji: '🇦🇷', cor_primaria: '205 70% 60%', cor_secundaria: '45 90% 55%', banner_texto: '🇦🇷 ¡Feliz Día de la Independencia!', start: { m: 7, d: 8 }, end: { m: 7, d: 9 }, animacao: 'flags' }],
  UY: [{ categoria: 'independencia', nome: 'Independencia del Uruguay', descricao: '25 de Agosto', emoji: '🇺🇾', cor_primaria: '210 80% 45%', cor_secundaria: '45 95% 55%', banner_texto: '🇺🇾 ¡Viva Uruguay!', start: { m: 8, d: 24 }, end: { m: 8, d: 25 }, animacao: 'flags' }],
  CL: [{ categoria: 'independencia', nome: 'Fiestas Patrias', descricao: '18 de Septiembre', emoji: '🇨🇱', cor_primaria: '0 75% 45%', cor_secundaria: '220 75% 40%', banner_texto: '🇨🇱 ¡Felices Fiestas Patrias!', start: { m: 9, d: 17 }, end: { m: 9, d: 19 }, animacao: 'flags' }],
  PY: [{ categoria: 'independencia', nome: 'Día de la Independencia', descricao: '14-15 de Mayo', emoji: '🇵🇾', cor_primaria: '0 75% 45%', cor_secundaria: '220 75% 40%', banner_texto: '🇵🇾 ¡Viva Paraguay!', start: { m: 5, d: 14 }, end: { m: 5, d: 15 }, animacao: 'flags' }],
  BO: [{ categoria: 'independencia', nome: 'Día de la Independencia', descricao: '6 de Agosto', emoji: '🇧🇴', cor_primaria: '0 75% 45%', cor_secundaria: '142 70% 35%', banner_texto: '🇧🇴 ¡Viva Bolivia!', start: { m: 8, d: 5 }, end: { m: 8, d: 6 }, animacao: 'flags' }],
  PE: [{ categoria: 'independencia', nome: 'Fiestas Patrias', descricao: '28 de Julio', emoji: '🇵🇪', cor_primaria: '0 78% 45%', cor_secundaria: '0 0% 100%', banner_texto: '🇵🇪 ¡Felices Fiestas Patrias!', start: { m: 7, d: 27 }, end: { m: 7, d: 29 }, animacao: 'flags' }],
  EC: [{ categoria: 'independencia', nome: 'Primer Grito de Independencia', descricao: '10 de Agosto', emoji: '🇪🇨', cor_primaria: '50 92% 50%', cor_secundaria: '220 75% 40%', banner_texto: '🇪🇨 ¡Viva Ecuador!', start: { m: 8, d: 9 }, end: { m: 8, d: 10 }, animacao: 'flags' }],
  CO: [{ categoria: 'independencia', nome: 'Día de la Independencia', descricao: '20 de Julio', emoji: '🇨🇴', cor_primaria: '50 95% 52%', cor_secundaria: '220 75% 38%', banner_texto: '🇨🇴 ¡Viva Colombia!', start: { m: 7, d: 19 }, end: { m: 7, d: 20 }, animacao: 'flags' }],
  VE: [{ categoria: 'independencia', nome: 'Día de la Independencia', descricao: '5 de Julio', emoji: '🇻🇪', cor_primaria: '50 92% 50%', cor_secundaria: '220 75% 40%', banner_texto: '🇻🇪 ¡Viva Venezuela!', start: { m: 7, d: 4 }, end: { m: 7, d: 5 }, animacao: 'flags' }],
  MX: [
    { categoria: 'independencia', nome: 'Día de la Independencia', descricao: '16 de Septiembre', emoji: '🇲🇽', cor_primaria: '142 70% 32%', cor_secundaria: '0 78% 45%', banner_texto: '🇲🇽 ¡Viva México!', start: { m: 9, d: 15 }, end: { m: 9, d: 16 }, animacao: 'flags' },
    { categoria: 'dia-nacional', nome: 'Día de Muertos', descricao: '1-2 de Noviembre', emoji: '💀', cor_primaria: '280 55% 35%', cor_secundaria: '30 90% 50%', banner_texto: '💀 Día de Muertos', start: { m: 11, d: 1 }, end: { m: 11, d: 2 }, animacao: 'leaves' },
  ],
  CR: [{ categoria: 'independencia', nome: 'Día de la Independencia', descricao: '15 de Septiembre', emoji: '🇨🇷', cor_primaria: '220 75% 40%', cor_secundaria: '0 78% 45%', banner_texto: '🇨🇷 ¡Viva Costa Rica!', start: { m: 9, d: 14 }, end: { m: 9, d: 15 }, animacao: 'flags' }],
  PA: [{ categoria: 'independencia', nome: 'Día de la Independencia', descricao: '3 de Noviembre', emoji: '🇵🇦', cor_primaria: '0 78% 45%', cor_secundaria: '220 75% 40%', banner_texto: '🇵🇦 ¡Viva Panamá!', start: { m: 11, d: 2 }, end: { m: 11, d: 3 }, animacao: 'flags' }],
  GT: [{ categoria: 'independencia', nome: 'Día de la Independencia', descricao: '15 de Septiembre', emoji: '🇬🇹', cor_primaria: '205 70% 55%', cor_secundaria: '0 0% 100%', banner_texto: '🇬🇹 ¡Viva Guatemala!', start: { m: 9, d: 14 }, end: { m: 9, d: 15 }, animacao: 'flags' }],
  HN: [{ categoria: 'independencia', nome: 'Día de la Independencia', descricao: '15 de Septiembre', emoji: '🇭🇳', cor_primaria: '205 75% 55%', cor_secundaria: '0 0% 100%', banner_texto: '🇭🇳 ¡Viva Honduras!', start: { m: 9, d: 14 }, end: { m: 9, d: 15 }, animacao: 'flags' }],
  SV: [{ categoria: 'independencia', nome: 'Día de la Independencia', descricao: '15 de Septiembre', emoji: '🇸🇻', cor_primaria: '215 75% 45%', cor_secundaria: '0 0% 100%', banner_texto: '🇸🇻 ¡Viva El Salvador!', start: { m: 9, d: 14 }, end: { m: 9, d: 15 }, animacao: 'flags' }],
  NI: [{ categoria: 'independencia', nome: 'Día de la Independencia', descricao: '15 de Septiembre', emoji: '🇳🇮', cor_primaria: '205 75% 50%', cor_secundaria: '0 0% 100%', banner_texto: '🇳🇮 ¡Viva Nicaragua!', start: { m: 9, d: 14 }, end: { m: 9, d: 15 }, animacao: 'flags' }],
  DO: [{ categoria: 'independencia', nome: 'Día de la Independencia', descricao: '27 de Febrero', emoji: '🇩🇴', cor_primaria: '220 75% 40%', cor_secundaria: '0 78% 45%', banner_texto: '🇩🇴 ¡Viva República Dominicana!', start: { m: 2, d: 26 }, end: { m: 2, d: 27 }, animacao: 'flags' }],
  CU: [{ categoria: 'independencia', nome: 'Día de la Independencia', descricao: '20 de Mayo', emoji: '🇨🇺', cor_primaria: '220 75% 40%', cor_secundaria: '0 78% 45%', banner_texto: '🇨🇺 ¡Viva Cuba!', start: { m: 5, d: 19 }, end: { m: 5, d: 20 }, animacao: 'flags' }],
  PR: [{ categoria: 'dia-nacional', nome: 'Día de la Constitución', descricao: '25 de Julio', emoji: '🇵🇷', cor_primaria: '0 78% 45%', cor_secundaria: '215 75% 45%', banner_texto: '🇵🇷 ¡Viva Puerto Rico!', start: { m: 7, d: 24 }, end: { m: 7, d: 25 }, animacao: 'flags' }],
  PT: [
    { categoria: 'dia-nacional', nome: 'Dia de Portugal', descricao: '10 de Junho', emoji: '🇵🇹', cor_primaria: '142 65% 32%', cor_secundaria: '0 78% 45%', banner_texto: '🇵🇹 Viva Portugal!', start: { m: 6, d: 9 }, end: { m: 6, d: 10 }, animacao: 'flags' },
    { categoria: 'dia-nacional', nome: 'Implantação da República', descricao: '5 de Outubro', emoji: '🇵🇹', cor_primaria: '142 65% 32%', cor_secundaria: '0 78% 45%', banner_texto: '🇵🇹 5 de Outubro', start: { m: 10, d: 4 }, end: { m: 10, d: 5 }, animacao: 'flags' },
  ],
  ES: [
    { categoria: 'dia-nacional', nome: 'Fiesta Nacional', descricao: '12 de Octubre', emoji: '🇪🇸', cor_primaria: '0 78% 45%', cor_secundaria: '50 95% 52%', banner_texto: '🇪🇸 ¡Viva España!', start: { m: 10, d: 11 }, end: { m: 10, d: 12 }, animacao: 'flags' },
    { categoria: 'dia-nacional', nome: 'Día de la Constitución', descricao: '6 de Diciembre', emoji: '🇪🇸', cor_primaria: '0 78% 45%', cor_secundaria: '50 95% 52%', banner_texto: '🇪🇸 Día de la Constitución', start: { m: 12, d: 5 }, end: { m: 12, d: 6 }, animacao: 'flags' },
  ],
  US: [
    { categoria: 'independencia', nome: 'Independence Day', descricao: 'July 4th', emoji: '🇺🇸', cor_primaria: '220 75% 38%', cor_secundaria: '0 78% 45%', banner_texto: '🇺🇸 Happy Independence Day!', start: { m: 7, d: 3 }, end: { m: 7, d: 4 }, animacao: 'fireworks' },
    { categoria: 'dia-nacional', nome: 'Memorial Day', descricao: 'Late May', emoji: '🇺🇸', cor_primaria: '220 75% 38%', cor_secundaria: '0 78% 45%', banner_texto: '🇺🇸 Memorial Day', start: { m: 5, d: 25 }, end: { m: 5, d: 26 }, animacao: 'flags' },
  ],
};

function asPreset(p: Omit<EventPreset, 'animacao'> & { animacao?: EventPreset['animacao'] }): EventPreset {
  return { animacao: 'flags', ...p } as EventPreset;
}

/** Eventos nacionais (presets) do país detectado pelo fuso horário. */
export function nationalEventsFor(country: CountryProfile = detectCountry()): EventPreset[] {
  return (NATIONAL[country.code] || []).map(asPreset);
}

/**
 * Calendário completo para o país detectado: eventos globais + nacionais,
 * ordenados pela proximidade da data de início (próximos primeiro).
 */
export function countryCalendar(now = new Date(), country: CountryProfile = detectCountry()) {
  const all: EventPreset[] = [...EVENT_PRESETS, ...nationalEventsFor(country)];
  return all
    .map((p) => {
      let { start, end } = presetDates(p);
      if (end < now) {
        const next = presetDates(p, now.getFullYear() + 1);
        start = next.start; end = next.end;
      }
      const active = now >= start && now <= end;
      const daysUntil = Math.ceil((start.getTime() - now.getTime()) / 86400000);
      return { preset: p, start, end, active, daysUntil, country: country.code };
    })
    .sort((a, b) => {
      if (a.active && !b.active) return -1;
      if (!a.active && b.active) return 1;
      return a.daysUntil - b.daysUntil;
    });
}

export { COUNTRIES };
