import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface BarberShowcaseItem {
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  nome_barbearia: string | null;
  avatar_url: string | null;
  rating_avg: number;
  rating_count: number;
}

interface Props {
  onSelect?: (barberId: string) => void;
  title?: string;
}

export default function BarbersShowcase({ onSelect, title = 'Nossos Barbeiros' }: Props) {
  const [barbers, setBarbers] = useState<BarberShowcaseItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('list_barbers_showcase');
      if (cancelled) return;
      if (!error && Array.isArray(data)) setBarbers(data as BarberShowcaseItem[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Remove palavras genéricas ("Barbearia", "Barbeiro", "Barber", "Corte") e
  // conectores soltos ("do", "da", "de"...), deixando apenas o nome próprio.
  const cleanName = (raw: string) => {
    const cleaned = (raw || '')
      .replace(/\b(barbearia|barbeiro|barber(?:shop)?|corte)\b/gi, '')
      .replace(/\b(do|da|de|dos|das|e)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return cleaned || raw || 'Barbeiro';
  };

  const SectionTitle = (
    <div className="flex flex-col items-center text-center mb-4">
      <h3 className="font-heading text-xl tracking-wide bg-gradient-to-r from-primary via-amber-300 to-primary bg-clip-text text-transparent drop-shadow-[0_1px_8px_hsl(var(--primary)/0.35)]">
        {title}
      </h3>
      <span className="mt-1.5 h-[2px] w-16 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" />
    </div>
  );

  if (loading) {
    return (
      <div className="px-4 mb-6">
        {SectionTitle}
        <div className="flex gap-3 overflow-x-auto pb-2 justify-center">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex-shrink-0 w-24 h-32 wood-card animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (barbers.length === 0) return null;

  const initials = (b: BarberShowcaseItem) => {
    const name = cleanName(b.full_name || b.display_name || 'B');
    return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');
  };

  return (
    <div className="px-4 mb-6">
      {SectionTitle}
      <div className="flex gap-4 overflow-x-auto pt-3 pb-2 -mx-1 px-1 snap-x snap-mandatory justify-center">
        {barbers.map((b, i) => {
          const name = cleanName(b.full_name || b.display_name || 'Barbeiro');
          const hasRating = b.rating_count > 0;
          return (
            <button
              key={b.user_id}
              onClick={() => onSelect?.(b.user_id)}
              style={{ animationDelay: `${i * 80}ms` }}
              className="flex-shrink-0 w-24 flex flex-col items-center gap-1.5 snap-start active:scale-95 transition-transform animate-fade-in"
              type="button"
            >
              <div className="relative group">
                <span className="absolute -inset-1 rounded-full bg-gradient-to-tr from-primary/50 via-amber-300/40 to-primary/50 blur-[6px] opacity-70 group-active:opacity-100 transition-opacity" />
                {b.avatar_url ? (
                  <img
                    src={b.avatar_url}
                    alt={name}
                    loading="lazy"
                    className="relative w-20 h-20 rounded-full object-cover border-2 border-primary/70 shadow-lg"
                  />
                ) : (
                  <div className="relative w-20 h-20 rounded-full bg-muted border-2 border-primary/50 flex items-center justify-center text-primary font-heading text-xl shadow-lg">
                    {initials(b)}
                  </div>
                )}
              </div>
              <p className="text-xs text-foreground font-semibold text-center leading-tight line-clamp-2 px-0.5">
                {name}
              </p>
              <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Star size={10} className="fill-primary text-primary" />
                <span className="text-foreground font-medium">
                  {hasRating ? b.rating_avg.toFixed(1) : '—'}
                </span>
                <span>({b.rating_count})</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
