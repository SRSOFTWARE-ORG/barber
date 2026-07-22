/**
 * Build check de i18n: falha o build quando há chaves faltando (ou sobrando)
 * entre pt-BR, pt-PT, es e en. Evita regressões de tradução.
 *
 * Roda no prebuild (ver package.json). pt-BR é a fonte da verdade de chaves.
 */
import { RAW_DICTS, type Lang } from '../src/lib/i18n/translations';

const BASE: Lang = 'pt-BR';
const baseKeys = Object.keys(RAW_DICTS[BASE]).sort();
const baseSet = new Set(baseKeys);

const placeholderVars = (s: string): string[] =>
  (s.match(/\{(\w+)\}/g) ?? []).map((m) => m.slice(1, -1)).sort();

let failures = 0;

for (const lang of Object.keys(RAW_DICTS) as Lang[]) {
  if (lang === BASE) continue;
  const dict = RAW_DICTS[lang];
  const keys = new Set(Object.keys(dict));

  const missing = baseKeys.filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !baseSet.has(k));

  if (missing.length) {
    failures += missing.length;
    console.error(`\n❌ [${lang}] ${missing.length} chave(s) faltando:`);
    missing.forEach((k) => console.error(`   - ${k}`));
  }
  if (extra.length) {
    failures += extra.length;
    console.error(`\n❌ [${lang}] ${extra.length} chave(s) inexistente(s) no base pt-BR:`);
    extra.forEach((k) => console.error(`   - ${k}`));
  }

  // Variáveis de interpolação devem ser idênticas às do pt-BR.
  for (const k of baseKeys) {
    if (!dict[k]) continue;
    const a = placeholderVars(RAW_DICTS[BASE][k]).join(',');
    const b = placeholderVars(dict[k]).join(',');
    if (a !== b) {
      failures += 1;
      console.error(`\n❌ [${lang}] variáveis divergentes em "${k}": esperado {${a}}, obtido {${b}}`);
    }
  }
}

if (failures > 0) {
  console.error(`\n💥 i18n check falhou: ${failures} problema(s). Corrija as traduções antes do build.\n`);
  process.exit(1);
}

console.log(`✅ i18n check ok: ${baseKeys.length} chaves consistentes em ${Object.keys(RAW_DICTS).length} idiomas.`);
