import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock, X, CalendarDays, Crown, Search, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBarbershop } from '@/contexts/BarbershopContext';
import { useAuth } from '@/contexts/AuthContext';
import { useBarberTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
import LinkBarberPrompt from '@/components/LinkBarberPrompt';
import { setDockHidden } from '@/lib/dock-visibility';
import { getServicePhoto } from '@/lib/service-photos';
import { SERVICE_CATEGORIES, filterServices, resolveServiceCategory, type ServiceCategory } from '@/lib/service-categories';
import Seo from '@/components/Seo';
import { useT } from '@/contexts/LanguageContext';

type Service = ReturnType<typeof useBarbershop>['services'][number];

export default function ServicesPage() {
  const navigate = useNavigate();
  const t = useT();
  const { services } = useBarbershop();
  const { role, barberId, user } = useAuth();
  const { theme } = useBarberTheme();
  const isStaff = role === 'admin' || role === 'ceo';
  const canSee = isStaff || !!barberId;
  const [taxaApp, setTaxaApp] = useState<number>(3);
  const [selected, setSelected] = useState<Service | null>(null);
  const [barberPhone, setBarberPhone] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ServiceCategory>('Todos');

  const filteredServices = useMemo(
    () => filterServices(services, category, search),
    [services, category, search],
  );

  useEffect(() => {
    if (!barberId) return;
    supabase.rpc('get_barber_payment_config', { _barber_id: barberId }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      if (row) setTaxaApp(Math.max(0, Math.min(3, Number(row.taxa_app_valor ?? 3))));
    });
    supabase.rpc('get_barber_pix', { _barber_id: barberId }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : (data as any);
      setBarberPhone(row?.telefone || null);
    });
  }, [barberId]);

  // Mesma lógica do botão de planos da tela inicial: mostra sempre que ela mostraria,
  // seja por link direto ou por WhatsApp do barbeiro.
  const planMode = theme.plano_modo;
  const customLink = theme.link_planos?.trim() || '';
  const planHref = (() => {
    if (planMode === 'link') return customLink || '#';
    if (!barberPhone) return '#';
    const phone = barberPhone.replace(/\D/g, '').replace(/^0+/, '');
    const normalized = phone.startsWith('55') ? phone : (phone.length >= 10 ? '55' + phone : phone);
    const msg = t('services.planMsg');
    return `https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`;
  })();
  const showPlanBanner = theme.plano_enabled && (planMode === 'link' ? !!customLink : !!barberPhone);

  // Ao abrir o detalhe de um serviço, esconde a dock; ao fechar/sair, ela volta.
  useEffect(() => {
    setDockHidden(!!selected);
    return () => setDockHidden(false);
  }, [selected]);

  return (
    <div className="page-shell min-h-screen">
      <Seo path="/services" title="Serviços de Barbearia — Cortes e Barba" description="Confira os serviços de corte de cabelo masculino, barba e cuidados da nossa barbearia, com preços e detalhes para agendar seu horário." jsonLd={services.length > 0 ? services.slice(0, 30).map((svc) => ({
        "@context": "https://schema.org",
        "@type": "Service",
        name: svc.name,
        serviceType: svc.name,
        provider: { "@type": "HairSalon", name: "Barbearia Classic" },
        areaServed: "BR",
        offers: {
          "@type": "Offer",
          price: Number(svc.price || 0).toFixed(2),
          priceCurrency: "BRL",
        },
      })) : undefined} />
      <div className="page-header flex items-center gap-3 px-4">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="text-primary" aria-label={t('common.back')}><ArrowLeft size={24} /></button>
        <h1 className="font-heading text-xl text-foreground">{t('services.title')}</h1>
      </div>
      {!canSee ? (
        <LinkBarberPrompt feature={t('services.lockedFeature')} />
      ) : (
        <div className="px-4 space-y-4 pt-3">
          <p className="text-xs text-muted-foreground px-1">{taxaApp <= 0 ? t('services.noFee') : t('services.feeNote', { valor: taxaApp.toFixed(2) })}</p>

          {/* Busca */}
          <div className="relative">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-primary/70" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('services.searchPlaceholder')}
              className="vintage-input w-full rounded-full pl-11 pr-4 py-3 text-sm"
              aria-label={t('services.searchAria')}
            />
          </div>

          {/* Categorias */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
            {SERVICE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-heading transition-all active:scale-95 ${
                  category === cat
                    ? 'bg-primary text-primary-foreground shadow-[0_0_14px_hsl(var(--primary)/0.35)]'
                    : 'wood-card text-muted-foreground'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {showPlanBanner && (
            <a
              href={planHref}
              target="_blank"
              rel="noopener noreferrer"
              className="wood-card w-full flex items-center gap-3 p-3 border border-primary/30 active:scale-[0.99] transition-transform"
            >
              <Crown size={20} className="text-primary shrink-0" />
              <span className="text-sm text-foreground flex-1">{t('services.checkPlans')}</span>
            </a>
          )}

          <p className="text-[11px] text-muted-foreground px-1">{t('services.illustrative')}</p>

          {filteredServices.length === 0 ? (
            <div className="wood-card flex flex-col items-center gap-2 py-10 text-center">
              <Search size={28} className="text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">{t('services.empty')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredServices.map((svc, i) => (
                <button
                  key={svc.id}
                  onClick={() => setSelected(svc)}
                  style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}
                  className="wood-card group w-full flex items-center gap-3 p-3 text-left animate-fade-in rounded-2xl border border-primary/10 transition-all duration-200 active:scale-[0.98] hover:border-primary/30 hover:shadow-[0_4px_20px_hsl(var(--primary)/0.12)]"
                >
                  <div className="relative w-[88px] h-[88px] rounded-xl overflow-hidden bg-secondary shrink-0">
                    <img
                      src={getServicePhoto(svc.name, svc.fotoUrl)}
                      alt={`Resultado do serviço ${svc.name}`}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold uppercase tracking-wide text-primary/90 bg-primary/10 px-2 py-0.5 rounded-full">
                        {resolveServiceCategory(svc)}
                      </span>
                    </div>
                    <p className="font-heading text-base text-foreground truncate">{svc.name}</p>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock size={12} /> {svc.duration} {t('services.minutes')}</span>
                    </div>
                    <span className="font-heading text-lg text-primary">R$ {svc.price}</span>
                  </div>
                  <span className="self-stretch flex items-center">
                    <span className="vintage-btn text-xs px-3 py-2 rounded-xl flex items-center gap-1 whitespace-nowrap">
                      <Sparkles size={12} /> {t('common.view')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detalhe do serviço — esconde a dock enquanto aberto */}
      {selected && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="wood-card rounded-2xl p-5 w-full max-w-sm space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start gap-3">
              <h3 className="font-heading text-lg text-foreground">{selected.name}</h3>
              <button onClick={() => setSelected(null)} className="text-muted-foreground" aria-label={t('common.close')}><X size={20} /></button>
            </div>

            <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-secondary">
              <img
                src={getServicePhoto(selected.name, selected.fotoUrl)}
                alt={`Resultado do serviço ${selected.name}`}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </div>
            <p className="text-[11px] text-muted-foreground text-center -mt-1">{t('services.illustrativeSingle')}</p>



            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5"><Clock size={15} /> {t('services.duration')}</span>
              <span className="text-foreground font-medium">{selected.duration} {t('services.minutes')}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('services.value')}</span>
              <span className="font-heading text-primary text-lg">R$ {selected.price}</span>
            </div>

            <button
              onClick={() => {
                if (!user) { navigate('/profile'); return; }
                navigate('/booking');
              }}
              className="vintage-btn w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm"
            >
              <CalendarDays size={16} /> {t('services.bookThis')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
