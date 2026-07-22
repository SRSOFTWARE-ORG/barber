// Detecção de país por FUSO HORÁRIO do dispositivo (sem GPS, sem permissões).
// Usado para: (1) torcida da Copa do Mundo pelo país do barbeiro/admin e
// (2) idioma das celebrações (pt-BR, pt-PT, es, en).
//
// Cobre toda a América Latina + EUA + Portugal + Espanha. Se o fuso não for
// reconhecido, cai no Brasil (pt-BR) como padrão do app.

export type AppLocale = 'pt-BR' | 'pt-PT' | 'es' | 'en';

export interface CountryProfile {
  code: string;            // ISO-2
  name: string;            // nome exibido (no idioma local)
  flagEmoji: string;       // bandeira
  /** Cores da bandeira em HSL "h s% l%" (usadas no degradê/torcida). */
  flagColors: string[];
  locale: AppLocale;
  /** Grito de "GOL" no idioma/torcida do país. */
  golChant: string;        // ex.: "GOOOL!"
  /** Subtítulo de torcida (ex.: "VAMOS, BRASIL! 🇧🇷"). */
  cheer: string;
}

// ===== Perfis por país =====
export const COUNTRIES: Record<string, CountryProfile> = {
  BR: { code: 'BR', name: 'Brasil', flagEmoji: '🇧🇷', flagColors: ['142 70% 35%', '50 92% 50%', '215 65% 35%'], locale: 'pt-BR', golChant: 'GOOOL!', cheer: 'VAMOS, BRASIL! 🇧🇷' },
  AR: { code: 'AR', name: 'Argentina', flagEmoji: '🇦🇷', flagColors: ['205 70% 60%', '0 0% 100%', '45 90% 55%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, ARGENTINA! 🇦🇷' },
  UY: { code: 'UY', name: 'Uruguay', flagEmoji: '🇺🇾', flagColors: ['210 80% 45%', '0 0% 100%', '45 95% 55%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, URUGUAY! 🇺🇾' },
  CL: { code: 'CL', name: 'Chile', flagEmoji: '🇨🇱', flagColors: ['0 75% 45%', '0 0% 100%', '220 75% 40%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, CHILE! 🇨🇱' },
  PY: { code: 'PY', name: 'Paraguay', flagEmoji: '🇵🇾', flagColors: ['0 75% 45%', '0 0% 100%', '220 75% 40%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, PARAGUAY! 🇵🇾' },
  BO: { code: 'BO', name: 'Bolivia', flagEmoji: '🇧🇴', flagColors: ['0 75% 45%', '50 92% 50%', '142 70% 35%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, BOLIVIA! 🇧🇴' },
  PE: { code: 'PE', name: 'Perú', flagEmoji: '🇵🇪', flagColors: ['0 78% 45%', '0 0% 100%', '0 78% 45%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, PERÚ! 🇵🇪' },
  EC: { code: 'EC', name: 'Ecuador', flagEmoji: '🇪🇨', flagColors: ['50 92% 50%', '220 75% 40%', '0 75% 45%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, ECUADOR! 🇪🇨' },
  CO: { code: 'CO', name: 'Colombia', flagEmoji: '🇨🇴', flagColors: ['50 95% 52%', '220 75% 38%', '0 78% 45%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, COLOMBIA! 🇨🇴' },
  VE: { code: 'VE', name: 'Venezuela', flagEmoji: '🇻🇪', flagColors: ['50 92% 50%', '220 75% 40%', '0 75% 45%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, VENEZUELA! 🇻🇪' },
  MX: { code: 'MX', name: 'México', flagEmoji: '🇲🇽', flagColors: ['142 70% 32%', '0 0% 100%', '0 78% 45%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, MÉXICO! 🇲🇽' },
  CR: { code: 'CR', name: 'Costa Rica', flagEmoji: '🇨🇷', flagColors: ['220 75% 40%', '0 0% 100%', '0 78% 45%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, COSTA RICA! 🇨🇷' },
  PA: { code: 'PA', name: 'Panamá', flagEmoji: '🇵🇦', flagColors: ['0 78% 45%', '0 0% 100%', '220 75% 40%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, PANAMÁ! 🇵🇦' },
  GT: { code: 'GT', name: 'Guatemala', flagEmoji: '🇬🇹', flagColors: ['205 70% 55%', '0 0% 100%', '205 70% 55%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, GUATEMALA! 🇬🇹' },
  HN: { code: 'HN', name: 'Honduras', flagEmoji: '🇭🇳', flagColors: ['205 75% 55%', '0 0% 100%', '205 75% 55%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, HONDURAS! 🇭🇳' },
  SV: { code: 'SV', name: 'El Salvador', flagEmoji: '🇸🇻', flagColors: ['215 75% 45%', '0 0% 100%', '215 75% 45%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, EL SALVADOR! 🇸🇻' },
  NI: { code: 'NI', name: 'Nicaragua', flagEmoji: '🇳🇮', flagColors: ['205 75% 50%', '0 0% 100%', '205 75% 50%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, NICARAGUA! 🇳🇮' },
  DO: { code: 'DO', name: 'República Dominicana', flagEmoji: '🇩🇴', flagColors: ['220 75% 40%', '0 0% 100%', '0 78% 45%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, RD! 🇩🇴' },
  CU: { code: 'CU', name: 'Cuba', flagEmoji: '🇨🇺', flagColors: ['220 75% 40%', '0 0% 100%', '0 78% 45%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, CUBA! 🇨🇺' },
  PR: { code: 'PR', name: 'Puerto Rico', flagEmoji: '🇵🇷', flagColors: ['0 78% 45%', '0 0% 100%', '215 75% 45%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, PUERTO RICO! 🇵🇷' },
  PT: { code: 'PT', name: 'Portugal', flagEmoji: '🇵🇹', flagColors: ['142 65% 32%', '0 78% 45%', '50 92% 50%'], locale: 'pt-PT', golChant: 'GOLO!', cheer: 'FORÇA, PORTUGAL! 🇵🇹' },
  ES: { code: 'ES', name: 'España', flagEmoji: '🇪🇸', flagColors: ['0 78% 45%', '50 95% 52%', '0 78% 45%'], locale: 'es', golChant: '¡GOOOL!', cheer: '¡VAMOS, ESPAÑA! 🇪🇸' },
  US: { code: 'US', name: 'USA', flagEmoji: '🇺🇸', flagColors: ['220 75% 38%', '0 0% 100%', '0 78% 45%'], locale: 'en', golChant: 'GOOOAL!', cheer: "LET'S GO, USA! 🇺🇸" },
};

// ===== Mapa IANA timezone -> país =====
const TZ_TO_COUNTRY: Record<string, string> = {
  // Brasil
  'America/Sao_Paulo': 'BR', 'America/Bahia': 'BR', 'America/Fortaleza': 'BR',
  'America/Recife': 'BR', 'America/Belem': 'BR', 'America/Manaus': 'BR',
  'America/Cuiaba': 'BR', 'America/Campo_Grande': 'BR', 'America/Porto_Velho': 'BR',
  'America/Boa_Vista': 'BR', 'America/Rio_Branco': 'BR', 'America/Maceio': 'BR',
  'America/Araguaina': 'BR', 'America/Santarem': 'BR', 'America/Noronha': 'BR',
  // Argentina
  'America/Argentina/Buenos_Aires': 'AR', 'America/Argentina/Cordoba': 'AR',
  'America/Argentina/Mendoza': 'AR', 'America/Argentina/Salta': 'AR',
  'America/Argentina/Tucuman': 'AR', 'America/Argentina/Ushuaia': 'AR',
  'America/Buenos_Aires': 'AR',
  // Uruguai / Paraguai / Bolívia / Chile
  'America/Montevideo': 'UY',
  'America/Asuncion': 'PY',
  'America/La_Paz': 'BO',
  'America/Santiago': 'CL', 'Pacific/Easter': 'CL', 'America/Punta_Arenas': 'CL',
  // Peru / Equador / Colômbia / Venezuela
  'America/Lima': 'PE',
  'America/Guayaquil': 'EC', 'Pacific/Galapagos': 'EC',
  'America/Bogota': 'CO',
  'America/Caracas': 'VE',
  // México
  'America/Mexico_City': 'MX', 'America/Monterrey': 'MX', 'America/Merida': 'MX',
  'America/Cancun': 'MX', 'America/Tijuana': 'MX', 'America/Chihuahua': 'MX',
  'America/Hermosillo': 'MX', 'America/Mazatlan': 'MX', 'America/Matamoros': 'MX',
  // América Central / Caribe
  'America/Costa_Rica': 'CR',
  'America/Panama': 'PA',
  'America/Guatemala': 'GT',
  'America/Tegucigalpa': 'HN',
  'America/El_Salvador': 'SV',
  'America/Managua': 'NI',
  'America/Santo_Domingo': 'DO',
  'America/Havana': 'CU',
  'America/Puerto_Rico': 'PR',
  // Europa
  'Europe/Lisbon': 'PT', 'Atlantic/Azores': 'PT', 'Atlantic/Madeira': 'PT',
  'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Africa/Ceuta': 'ES',
  // EUA
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
  'America/Detroit': 'US', 'America/Indiana/Indianapolis': 'US',
  'America/Boise': 'US', 'Pacific/Honolulu': 'US', 'America/Kentucky/Louisville': 'US',
};

/** Fuso horário IANA atual do dispositivo. */
export function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  } catch {
    return 'America/Sao_Paulo';
  }
}

/** Detecta o país (perfil) a partir do fuso horário do dispositivo. */
export function detectCountry(tz = getDeviceTimeZone()): CountryProfile {
  const code = TZ_TO_COUNTRY[tz];
  if (code && COUNTRIES[code]) return COUNTRIES[code];
  // Fallback por prefixo de região para fusos não mapeados.
  if (tz.startsWith('Europe/Lisbon') || tz.startsWith('Atlantic/Madeira') || tz.startsWith('Atlantic/Azores')) return COUNTRIES.PT;
  if (tz.startsWith('Europe/Madrid') || tz.startsWith('Atlantic/Canary')) return COUNTRIES.ES;
  return COUNTRIES.BR; // padrão do app
}

/** Locale atual com base no fuso horário. */
export function detectLocale(tz = getDeviceTimeZone()): AppLocale {
  return detectCountry(tz).locale;
}

// ===== Traduções curtas para as celebrações =====
type Dict = Record<AppLocale, string>;
const STRINGS: Record<string, Dict> = {
  worldCupSub: {
    'pt-BR': 'RUMO AO HEXA! ⚽', 'pt-PT': 'É A NOSSA HORA! ⚽',
    es: '¡VAMOS POR LA COPA! ⚽', en: 'ROAD TO GLORY! ⚽',
  },
  skip: { 'pt-BR': 'Pular', 'pt-PT': 'Saltar', es: 'Saltar', en: 'Skip' },
};

/** Tradução de uma chave de celebração para o locale informado. */
export function ct(key: keyof typeof STRINGS, locale: AppLocale): string {
  return STRINGS[key]?.[locale] ?? STRINGS[key]?.['pt-BR'] ?? '';
}
