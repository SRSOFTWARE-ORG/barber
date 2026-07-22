import { describe, it, expect } from 'vitest';
import { RAW_DICTS, TRANSLATIONS, translate, normalizeLang, FALLBACK_LANG, type Lang } from './translations';

const BASE: Lang = 'pt-BR';
const baseKeys = Object.keys(RAW_DICTS[BASE]).sort();
const langs = Object.keys(RAW_DICTS) as Lang[];

const placeholderVars = (s: string): string[] =>
  (s.match(/\{(\w+)\}/g) ?? []).map((m) => m.slice(1, -1)).sort();

describe('i18n key parity', () => {
  it.each(langs.filter((l) => l !== BASE))('"%s" tem exatamente as chaves do pt-BR', (lang) => {
    const keys = Object.keys(RAW_DICTS[lang]).sort();
    const missing = baseKeys.filter((k) => !keys.includes(k));
    const extra = keys.filter((k) => !baseKeys.includes(k));
    expect({ lang, missing, extra }).toEqual({ lang, missing: [], extra: [] });
  });

  it.each(langs)('"%s" não tem valores vazios', (lang) => {
    const empty = Object.entries(RAW_DICTS[lang])
      .filter(([, v]) => !v || !v.trim())
      .map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it.each(langs.filter((l) => l !== BASE))(
    '"%s" preserva as variáveis de interpolação do pt-BR',
    (lang) => {
      const mismatches: string[] = [];
      for (const k of baseKeys) {
        const v = RAW_DICTS[lang][k];
        if (!v) continue;
        if (placeholderVars(RAW_DICTS[BASE][k]).join(',') !== placeholderVars(v).join(',')) {
          mismatches.push(k);
        }
      }
      expect(mismatches).toEqual([]);
    },
  );
});

describe('translate()', () => {
  it('interpola variáveis', () => {
    expect(translate('pt-BR', 'fatura.payPix', { valor: '10,00' })).toContain('10,00');
  });

  it('faz fallback para pt-BR quando a chave existe só no merge', () => {
    // TRANSLATIONS faz merge, então toda chave resolve em todos os idiomas.
    for (const lang of langs) {
      expect(TRANSLATIONS[lang]['nav.home']).toBeTruthy();
    }
  });

  it('retorna a própria chave quando não existe', () => {
    expect(translate('en', 'chave.inexistente.xyz')).toBe('chave.inexistente.xyz');
  });

  it('usa fallback seguro quando o idioma é inválido/não suportado', () => {
    // Idioma "fr" não existe: deve resolver via fallback en, nunca a chave crua.
    const val = translate('fr' as unknown as Lang, 'nav.home');
    expect(val).toBe(RAW_DICTS[FALLBACK_LANG]['nav.home']);
  });
});

describe('normalizeLang()', () => {
  it('mantém idiomas suportados exatos', () => {
    for (const l of ['pt-BR', 'pt-PT', 'es', 'en'] as Lang[]) {
      expect(normalizeLang(l)).toBe(l);
    }
  });

  it('resolve variações por prefixo/separador', () => {
    expect(normalizeLang('pt')).toBe('pt-BR');
    expect(normalizeLang('pt_BR')).toBe('pt-BR');
    expect(normalizeLang('pt-pt')).toBe('pt-PT');
    expect(normalizeLang('es-ES')).toBe('es');
    expect(normalizeLang('en-US')).toBe('en');
    expect(normalizeLang('EN')).toBe('en');
  });

  it('cai no fallback en para valores desconhecidos ou vazios', () => {
    expect(normalizeLang('fr')).toBe(FALLBACK_LANG);
    expect(normalizeLang('de-DE')).toBe(FALLBACK_LANG);
    expect(normalizeLang('')).toBe(FALLBACK_LANG);
    expect(normalizeLang('   ')).toBe(FALLBACK_LANG);
    expect(normalizeLang(null)).toBe(FALLBACK_LANG);
    expect(normalizeLang(undefined)).toBe(FALLBACK_LANG);
    expect(normalizeLang(42)).toBe(FALLBACK_LANG);
  });
});

