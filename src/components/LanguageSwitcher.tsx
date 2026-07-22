import { Globe, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { LANGUAGES } from '@/lib/i18n/translations';

/** Seletor de idioma (pt-BR, pt-PT, es, en) + opção Automático (fuso horário). */
export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, isAuto, setLang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const current = LANGUAGES.find((l) => l.code === lang);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('common.language')}
        className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Globe size={16} className="text-primary" />
        <span>{current?.flag} {compact ? current?.code : current?.label}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <button
            type="button"
            onClick={() => { setLang(null); setOpen(false); }}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-foreground hover:bg-muted"
          >
            <span>🌐 {t('common.languageAuto')}</span>
            {isAuto && <Check size={16} className="text-primary" />}
          </button>
          <div className="h-px bg-border" />
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => { setLang(l.code); setOpen(false); }}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-foreground hover:bg-muted"
            >
              <span>{l.flag} {l.label}</span>
              {!isAuto && lang === l.code && <Check size={16} className="text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
