import { useState, useEffect } from 'react';
import { ArrowLeft, Tag, Clock, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import LinkBarberPrompt from '@/components/LinkBarberPrompt';
import Seo from '@/components/Seo';
import { useT } from '@/contexts/LanguageContext';

interface Promo {
  id: string;
  titulo: string;
  descricao: string;
  preco_original: string | null;
  preco_promocional: string | null;
  disponivel_de: string | null;
  disponivel_ate: string | null;
}

function useCountdown(target: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return 'Expirada';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function PromoCard({ p, onClick }: { p: Promo; onClick: () => void }) {
  const t = useT();
  const countdown = useCountdown(p.disponivel_ate);
  const urgent = countdown && countdown !== 'Expirada' && new Date(p.disponivel_ate!).getTime() - Date.now() < 24 * 3600000;

  return (
    <button
      onClick={onClick}
      className="group relative w-full text-left rounded-2xl overflow-hidden active:scale-[0.98] transition-all duration-200"
      style={{
        background: 'linear-gradient(145deg, hsl(var(--card)) 0%, hsl(var(--card) / 0.85) 100%)',
        boxShadow:
          '0 10px 30px -8px rgba(0,0,0,0.55), 0 4px 0 hsl(var(--primary) / 0.35), inset 0 1px 0 hsl(0 0% 100% / 0.08), inset 0 -2px 0 rgba(0,0,0,0.3)',
        transform: 'perspective(800px) rotateX(2deg)',
      }}
    >
      {/* Glow accent */}
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: 'linear-gradient(90deg, transparent, hsl(var(--primary)), transparent)' }}
      />

      {/* Badge IA + Countdown */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-1 z-10">
        <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest bg-primary/20 text-primary px-2 py-0.5 rounded-full border border-primary/30 font-bold">
          <Sparkles size={9} /> {t('promos.aiOffer')}
        </span>
        {countdown && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border ${
            urgent ? 'bg-destructive/20 text-destructive border-destructive/40 animate-pulse' : 'bg-background/60 text-foreground/80 border-border'
          }`}>
            <Clock size={10} /> {countdown === 'Expirada' ? t('promos.expired') : countdown}
          </span>
        )}
      </div>

      <div className="px-5 py-5 flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.6) 100%)',
            boxShadow: 'inset 0 1px 0 hsl(0 0% 100% / 0.35), 0 4px 10px -2px hsl(var(--primary) / 0.5)',
          }}
        >
          <Tag size={22} className="text-primary-foreground" />
        </div>

        <div className="flex-1 min-w-0 pr-16">
          <p className="font-heading text-lg text-foreground leading-tight">{p.titulo}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.descricao}</p>
        </div>
      </div>

      {/* Price highlight */}
      {(p.preco_original || p.preco_promocional) && (
        <div
          className="mx-5 mb-4 px-4 py-3 rounded-xl flex items-end justify-between gap-3"
          style={{
            background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15) 0%, hsl(var(--primary) / 0.05) 100%)',
            border: '1px solid hsl(var(--primary) / 0.25)',
            boxShadow: 'inset 0 1px 0 hsl(0 0% 100% / 0.05)',
          }}
        >
          <div className="flex flex-col">
            {p.preco_original && (
              <span className="text-xs text-muted-foreground line-through leading-tight">
                {t('promos.from', { preco: p.preco_original })}
              </span>
            )}
            {p.preco_promocional && (
              <span
                className="font-display text-2xl text-primary leading-tight"
                style={{ textShadow: '0 2px 8px hsl(var(--primary) / 0.4)' }}
              >
                {p.preco_promocional}
              </span>
            )}
          </div>
          <span className="text-[10px] uppercase tracking-wider bg-background/60 text-foreground/70 px-2 py-1 rounded-full whitespace-nowrap">
            {t('promos.plusFee')}
          </span>
        </div>
      )}

      <div className="px-5 pb-4">
        <span className="inline-block text-[11px] text-primary font-heading tracking-widest">
          {t('promos.tapToBook')}
        </span>
      </div>
    </button>
  );
}

export default function PromosPage() {
  const navigate = useNavigate();
  const t = useT();
  const { user, role, barberId: linkedBarberId } = useAuth();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const isStaff = role === 'admin' || role === 'ceo';
  const canSee = isStaff || (!!user && !!linkedBarberId);

  useEffect(() => {
    const loadPromos = async () => {
      setLoading(true);
      if (!user || !linkedBarberId) { setPromos([]); setLoading(false); return; }
      const { data } = await supabase
        .from('promocoes')
        .select('id, titulo, descricao, preco_original, preco_promocional, disponivel_de, disponivel_ate')
        .eq('ativa', true)
        .eq('adm_id', linkedBarberId)
        .order('created_at', { ascending: false });
      if (data) setPromos(data as any);
      setLoading(false);
    };
    loadPromos();
  }, [user, linkedBarberId]);

  // Filtra por janela de disponibilidade
  const now = Date.now();
  const visiblePromos = promos.filter(p => {
    if (p.disponivel_de && new Date(p.disponivel_de).getTime() > now) return false;
    if (p.disponivel_ate && new Date(p.disponivel_ate).getTime() < now) return false;
    return true;
  });

  return (
    <div className="min-h-screen pb-20">
      <Seo path="/promos" title="Promoções da Barbearia" description="Aproveite as promoções e ofertas especiais da nossa barbearia em cortes de cabelo masculino, barba e combos. Confira e agende." />
      <div className="page-header flex items-center gap-3 px-4">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="text-primary" aria-label={t('common.back')}><ArrowLeft size={24} /></button>
        <h1 className="font-heading text-xl text-foreground">{t('promos.title')}</h1>
      </div>
      {!canSee ? (
        <LinkBarberPrompt feature={t('promos.lockedFeature')} />
      ) : (
        <div className="px-4 space-y-4">
          {loading ? (
            <p className="text-center text-muted-foreground py-8 animate-pulse">{t('common.loading')}</p>
          ) : visiblePromos.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">{t('promos.empty')}</p>
          ) : (
            visiblePromos.map(p => (
              <PromoCard key={p.id} p={p} onClick={() => navigate('/booking', { state: { promo: p } })} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
