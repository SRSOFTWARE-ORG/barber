import { describe, it, expect } from 'vitest';
import { nationalEventsFor, countryCalendar } from './country-events';
import { COUNTRIES } from './country-locale';
import { EVENT_PRESETS } from './event-presets';

// Nomes que são exclusivamente nacionais (não globais).
const BR_ONLY = 'Tiradentes';
const US_ONLY = 'Independence Day';
const GLOBAL = 'Natal'; // existe em EVENT_PRESETS (global)

describe('eventos nacionais por país (regra: nunca vazam entre países)', () => {
  it('eventos nacionais do Brasil aparecem só no Brasil', () => {
    const br = nationalEventsFor(COUNTRIES.BR).map((e) => e.nome);
    const us = nationalEventsFor(COUNTRIES.US).map((e) => e.nome);
    expect(br).toContain(BR_ONLY);
    expect(us).not.toContain(BR_ONLY);
  });

  it('eventos nacionais dos EUA aparecem só nos EUA', () => {
    const us = nationalEventsFor(COUNTRIES.US).map((e) => e.nome);
    const br = nationalEventsFor(COUNTRIES.BR).map((e) => e.nome);
    expect(us).toContain(US_ONLY);
    expect(br).not.toContain(US_ONLY);
  });

  it('eventos globais (Natal) valem para todos os países', () => {
    expect(EVENT_PRESETS.map((p) => p.nome)).toContain(GLOBAL);
    const brCal = countryCalendar(new Date(), COUNTRIES.BR).map((c) => c.preset.nome);
    const esCal = countryCalendar(new Date(), COUNTRIES.ES).map((c) => c.preset.nome);
    expect(brCal).toContain(GLOBAL);
    expect(esCal).toContain(GLOBAL);
  });

  it('o calendário do país inclui os nacionais dele e não os de outro país', () => {
    const brCal = countryCalendar(new Date(), COUNTRIES.BR).map((c) => c.preset.nome);
    expect(brCal).toContain(BR_ONLY);
    expect(brCal).not.toContain(US_ONLY);
  });

  it('todo país suportado tem pelo menos um evento nacional cadastrado', () => {
    const semEventos = Object.values(COUNTRIES)
      .filter((c) => nationalEventsFor(c).length === 0)
      .map((c) => c.code);
    expect(semEventos).toEqual([]);
  });
});
