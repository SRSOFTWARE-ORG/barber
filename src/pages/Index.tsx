import { useState, useEffect, useCallback } from 'react';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Scissors, Camera, Tag, X, MapPin, Navigation } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBarberTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
import ShopStatusIndicator from '@/components/ShopStatusIndicator';
import BarbersShowcase from '@/components/BarbersShowcase';
import heroDefault from '@/assets/barbershop-hero.jpg';
import heroJeffao from '@/assets/barbershop-hero-jeffao.jpg';
import logoImg from '@/assets/barber-logo.png';
import Seo from '@/components/Seo';
import EventBanner from '@/components/EventBanner';
import { useT } from '@/contexts/LanguageContext';

import { AMENITIES_MAP } from '@/lib/amenities';

const JEFFAO_BARBER_ID = '3b1fd66a-e562-4389-8c4d-e53e5cef9db9';

const menuItems = [
  { icon: CalendarDays, key: 'home.book' as const, path: '/booking' },
  { icon: Scissors, key: 'home.services' as const, path: '/services' },
  { icon: Camera, key: 'home.gallery' as const, path: '/gallery' },
  { icon: Tag, key: 'home.promos' as const, path: '/promos' },
];

interface BarberPhoto {
  id: string;
  url_foto: string;
  descricao: string | null;
}

export default function Index() {
  const navigate = useNavigate();
  const t = useT();
  const { user, shopDisplayName, barberId: linkedBarberId } = useAuth();
  const { theme } = useBarberTheme();
  const [barberPhotos, setBarberPhotos] = useState<BarberPhoto[]>([]);
  const [barberName, setBarberName] = useState('');
  const [hasBarber, setHasBarber] = useState<boolean | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<BarberPhoto | null>(null);
  const [openAmenity, setOpenAmenity] = useState<string | null>(null);
  const [shopEndereco, setShopEndereco] = useState<string | null>(null);
  const [shopMapsLink, setShopMapsLink] = useState<string | null>(null);
  const [mapActive, setMapActive] = useState(false);
  const [barberPhone, setBarberPhone] = useState<string | null>(null);
  const [planMessage, setPlanMessage] = useState<string>('');
  const [planLoading, setPlanLoading] = useState(false);

  // Invite link handling is centralized in <InviteGate> — see src/components/InviteGate.tsx.
  // The gate blocks the UI when an invite is pending and the user is not logged in,
  // and performs the secure client→barber link only AFTER successful authentication.

  // Fecha o rótulo (tooltip) da comodidade ao tocar/clicar em qualquer outro lugar.
  useEffect(() => {
    if (!openAmenity) return;
    const close = () => setOpenAmenity(null);
    // Adia o registro para não fechar imediatamente no mesmo clique que abriu.
    const id = window.setTimeout(() => {
      document.addEventListener('click', close);
      document.addEventListener('touchstart', close);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('click', close);
      document.removeEventListener('touchstart', close);
    };
  }, [openAmenity]);


  // Fetch shop location + barber phone (for plans WhatsApp button)
  useEffect(() => {
    if (!user || !linkedBarberId) {
      setShopEndereco(null);
      setShopMapsLink(null);
      setBarberPhone(null);
      return;
    }
    supabase
      .rpc('get_barber_location', { _barber_id: linkedBarberId })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setShopEndereco(data[0].endereco_completo);
          setShopMapsLink(data[0].link_google_maps);
        }
      });
    supabase
      .rpc('get_barber_pix', { _barber_id: linkedBarberId })
      .then(({ data }) => {
        const row = Array.isArray(data) ? data[0] : (data as any);
        setBarberPhone(row?.telefone || null);
      });
  }, [user, linkedBarberId]);

  // Pré-gera a mensagem do WhatsApp assim que o telefone do barbeiro estiver disponível.
  // Isso garante que o clique seja 100% síncrono — crucial para iOS Safari, que bloqueia
  // window.open / location.href fora do contexto de gesto do usuário.
  useEffect(() => {
    if (!barberPhone) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: nameData } = await supabase.auth.getUser();
        const clientName = nameData?.user?.user_metadata?.full_name || '';
        const cleanShop = shopDisplayName.replace(/^Barbearia\s+/i, '');
        const { data } = await supabase.functions.invoke('generate-plan-message', {
          body: { shopName: shopDisplayName, barberName: cleanShop, clientName },
        });
        if (cancelled) return;
        const msg = (data as any)?.message
          || `Olá! Sou cliente da ${shopDisplayName} e gostaria de saber mais sobre os planos. 💈`;
        setPlanMessage(msg);
      } catch {
        if (!cancelled) {
          setPlanMessage(`Olá! Sou cliente da ${shopDisplayName} e gostaria de saber mais sobre os planos. 💈`);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [barberPhone, shopDisplayName]);

  const planMode = theme.plano_modo;
  const planEnabled = theme.plano_enabled;
  const customLink = theme.link_planos?.trim() || '';

  const handlePlanClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (planMode === 'link') {
      if (!customLink) {
        e.preventDefault();
        toast.error('Barbeiro ainda não configurou o link de planos.');
      }
      return;
    }
    if (!barberPhone) {
      e.preventDefault();
      toast.error('Barbeiro ainda não cadastrou telefone.');
    }
  };

  // Monta o href do botão: link direto OU WhatsApp do barbeiro com mensagem gerada por IA.
  const planHref = (() => {
    if (planMode === 'link') return customLink || '#';
    if (!barberPhone) return '#';
    const phone = barberPhone.replace(/\D/g, '').replace(/^0+/, '');
    const normalized = phone.startsWith('55') ? phone : (phone.length >= 10 ? '55' + phone : phone);
    const msg = planMessage || `Olá! Sou cliente da ${shopDisplayName} e gostaria de saber mais sobre os planos. 💈`;
    return `https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`;
  })();

  // Decide se mostra o botão. Em modo whatsapp precisa do telefone; em modo link precisa do customLink.
  const showPlanButton = planEnabled && (planMode === 'link' ? !!customLink : !!barberPhone);

  useEffect(() => {
    if (!user) { setHasBarber(null); return; }

    if (!linkedBarberId) {
      setHasBarber(false);
      return;
    }

    setHasBarber(true);

    const loadBarberGallery = async () => {
      // Get barber name
      const { data: nameData } = await supabase.rpc('get_barber_name', { _barber_id: linkedBarberId });
      if (nameData) setBarberName(nameData);

      // Get barber photos
      const { data: photos } = await supabase
        .from('galeria_fotos')
        .select('id, url_foto, descricao')
        .eq('adm_id', linkedBarberId)
        .order('created_at', { ascending: false })
        .limit(6);

      if (photos) setBarberPhotos(photos);
    };

    loadBarberGallery();

    // Realtime listener for new notifications
    const channel = supabase
      .channel('home-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as any;
          if (n.tipo === 'concluido') {
            toast.success(n.titulo, { description: n.mensagem, duration: 6000 });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, linkedBarberId]);

  const { pullRefreshProps, PullIndicator } = usePullRefresh({
    onRefresh: useCallback(async () => {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.update()));
          const waiting = regs.find(r => r.waiting)?.waiting;
          if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
      } catch {}
      const url = new URL(window.location.href);
      url.searchParams.set('_r', Date.now().toString());
      window.location.replace(url.toString());
    }, []),
  });

  return (
    <div className="page-shell min-h-screen flex flex-col overflow-y-auto" {...pullRefreshProps}>
      <Seo path="/" title="Barbearia Classic — Agendamento e Cortes" description="Agende online seu corte de cabelo masculino e barba. Veja serviços, galeria de cortes e promoções da nossa barbearia com tradição e estilo." />
      <PullIndicator />
      {/* Header */}
      <div className="page-header relative text-center px-4">
        <img
          src={theme.app_logo_url || logoImg}
          alt={`Logo da ${shopDisplayName}`}
          draggable={false}
          className="block w-[6.25rem] h-[6.25rem] mx-auto mb-1 opacity-95 object-contain select-none pointer-events-none"
          style={{ background: 'transparent' }}
        />
        <h1 className="font-display text-2xl text-primary tracking-wider">
          {shopDisplayName}
          <span className="sr-only"> — Barbearia e Agendamento Online</span>
        </h1>
        <p className="text-muted-foreground text-xs tracking-[0.3em] uppercase mt-1">
          • Tradição e Estilo •
        </p>
        <ShopStatusIndicator />
        {showPlanButton && (
          <div className="mt-3 flex justify-center">
            <a
              href={planHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handlePlanClick}
              className="planos-3d-btn group relative inline-block px-6 py-3 rounded-xl font-display tracking-[0.15em] text-sm uppercase text-primary-foreground no-underline select-none"
              style={{
                background: 'linear-gradient(180deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.85) 50%, hsl(var(--primary) / 0.7) 100%)',
                boxShadow:
                  '0 6px 0 hsl(var(--primary) / 0.45), 0 10px 22px -4px rgba(0,0,0,0.55), inset 0 1px 0 hsl(0 0% 100% / 0.35), inset 0 -2px 0 rgba(0,0,0,0.25)',
                textShadow: '0 1px 2px rgba(0,0,0,0.45)',
                transform: 'translateY(0)',
                transition: 'transform 120ms ease, box-shadow 120ms ease',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
              }}
              onMouseDown={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(4px)';
              }}
              onMouseUp={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.transform = '';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.transform = '';
              }}
            >
              <span className="relative z-10">✦ Confira nossos planos ✦</span>
            </a>
          </div>
        )}
      </div>

      {/* Banner do evento sazonal ativo (gerenciado pelo Painel CEO) */}
      <EventBanner />


      {/* Hero image — usa imagem personalizada do barbeiro vinculado, ou fallback */}
      {(() => {
        const customHero = theme.hero_image_url;
        const fallback = linkedBarberId === JEFFAO_BARBER_ID ? heroJeffao : heroDefault;
        const src = customHero || fallback;
        const fit = theme.hero_object_fit || 'cover';
        const pos = theme.hero_object_position || 'center';
        return (
          <div className="mx-4 rounded-lg overflow-hidden shadow-lg mb-6 bg-card">
            <img
              src={src}
              alt={`Ambiente da ${shopDisplayName}`}
              className="w-full h-64"
              width={1024}
              height={256}
              style={{ objectFit: fit, objectPosition: pos, display: 'block' }}
              loading="eager"
              fetchPriority="high"
            />
          </div>
        );
      })()}

      {/* Comodidades do espaço */}
      {theme.comodidades && theme.comodidades.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="font-heading text-base text-foreground mb-3 text-center">O que você encontra aqui</h2>
          <div className="flex flex-wrap gap-3 justify-center">
            {theme.comodidades.map((id) => {
              const a = AMENITIES_MAP[id];
              if (!a) return null;
              const Icon = a.icon;
              const isOpen = openAmenity === id;
              return (
                <div key={id} className="relative">
                  {isOpen && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 whitespace-nowrap rounded-lg bg-card border border-primary/30 px-2.5 py-1 text-[11px] text-foreground shadow-lg">
                      {a.label}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setOpenAmenity(isOpen ? null : id); }}
                    aria-label={a.label}
                    className="wood-card w-12 h-12 rounded-2xl flex items-center justify-center"
                  >
                    <Icon size={20} className="text-primary shrink-0" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}




      {/* Welcome */}
      <div className="px-5 mb-4">
        <h2 className="font-heading text-xl text-foreground">{t('home.welcome')}!</h2>
        <p className="text-muted-foreground text-sm">{t('home.bookPrompt')}</p>
      </div>

      {/* Menu Grid */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-6">
        {menuItems.map(({ icon: Icon, key, path }) => (
          <button
            key={path}
            onClick={() => {
              // Para agendar é preciso ter conta — leva ao perfil/criação de conta
              if (path === '/booking' && !user) {
                toast('Crie sua conta para agendar', { description: 'É rápido: só nome e senha.' });
                navigate('/profile');
                return;
              }
              navigate(path);
            }}
            className="wood-card flex flex-col items-center justify-center py-8 gap-3 active:scale-[0.97] transition-transform min-w-0"
          >
            <Icon size={36} strokeWidth={1.2} className="text-primary" />
            <span className="font-heading text-lg text-foreground truncate">{t(key)}</span>
          </button>
        ))}
      </div>

      {/* Vitrine de Barbeiros */}
      <BarbersShowcase
        onSelect={(barberId) => {
          if (!user) {
            toast('Crie sua conta para agendar', { description: 'É rápido: só nome e senha.' });
            navigate('/profile');
            return;
          }
          navigate(`/booking?barbeiro=${barberId}`);
        }}
      />

      {/* Barber Gallery Section */}
      {user && hasBarber === true && barberPhotos.length > 0 && (
        <div className="px-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading text-base text-foreground flex items-center gap-2">
              <Camera size={16} className="text-primary" />
              Galeria de {barberName || 'Meu Barbeiro'}
            </h3>
            <button onClick={() => navigate('/gallery')} className="text-xs text-primary">
              Ver todas →
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {barberPhotos.map(photo => (
              <button
                key={photo.id}
                onClick={() => setSelectedPhoto(photo)}
                className="wood-card overflow-hidden rounded-lg aspect-square"
              >
                <img src={photo.url_foto} alt={photo.descricao || 'Corte masculino realizado na barbearia'} className="w-full h-full object-cover" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        </div>
      )}

      {user && hasBarber === false && (
        <div className="mx-4 mb-6 wood-card px-4 py-4 text-center">
          <Camera size={24} className="mx-auto mb-2 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">Atribua um barbeiro para ver fotos exclusivas</p>
        </div>
      )}

      {/* Location Section */}
      {shopEndereco && (
        <div className="mx-4 mb-6 wood-card px-4 py-4">
          <h3 className="font-heading text-base text-foreground flex items-center gap-2 mb-2">
            <MapPin size={16} className="text-primary" />
            Onde estamos
          </h3>
          <p className="text-sm text-muted-foreground mb-3">{shopEndereco}</p>
          {mapActive ? (
            <div className="rounded-lg overflow-hidden mb-3">
              <iframe
                title="Localização da barbearia"
                width="100%"
                height="200"
                style={{ border: 0 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${encodeURIComponent(shopEndereco)}`}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMapActive(true)}
              aria-label="Carregar mapa interativo da barbearia"
              className="relative w-full h-[200px] rounded-lg overflow-hidden mb-3 bg-card border border-border flex flex-col items-center justify-center gap-2 group"
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_50%_40%,hsl(var(--primary))_0,transparent_55%)]"
              />
              <MapPin size={28} className="text-primary relative z-10" />
              <span className="relative z-10 text-sm font-medium text-foreground">Toque para carregar o mapa</span>
              <span className="relative z-10 text-xs text-muted-foreground px-6 text-center">{shopEndereco}</span>
            </button>
          )}
          <div className="flex gap-2">
            {shopMapsLink && (
              <button
                onClick={() => window.open(shopMapsLink, '_blank')}
                className="vintage-btn flex-1 flex items-center justify-center gap-2 py-2 text-sm"
              >
                <Navigation size={14} />
                Como Chegar
              </button>
            )}
            <button
              onClick={() => {
                if (!navigator.geolocation) {
                  toast.error('Seu navegador não suporta geolocalização');
                  return;
                }
                toast.loading('Obtendo sua localização...', { id: 'geo' });
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    toast.dismiss('geo');
                    const { latitude, longitude } = pos.coords;
                    const dest = shopEndereco ? encodeURIComponent(shopEndereco) : '';
                    const url = `https://www.google.com/maps/dir/${latitude},${longitude}/${dest}`;
                    window.open(url, '_blank');
                  },
                  (err) => {
                    toast.dismiss('geo');
                    if (err.code === 1) toast.error('Permissão de localização negada. Ative nas configurações do navegador.');
                    else toast.error('Não foi possível obter sua localização');
                  },
                  { enableHighAccuracy: true, timeout: 10000 }
                );
              }}
              className="vintage-btn flex-1 flex items-center justify-center gap-2 py-2 text-sm"
            >
              <MapPin size={14} />
              Usar minha localização
            </button>
          </div>
        </div>
      )}

      {/* Offers banner */}
      <div className="mx-4 py-3 text-center">
        <p className="font-heading text-sm text-primary tracking-widest">
          — OFERTAS ESPECIAIS PARA VOCÊ! —
        </p>
      </div>

      {/* Rodapé público — links institucionais (consentimento Google / legal) */}
      <footer className="mt-auto px-4 py-6 border-t border-border/40 text-center space-y-2">
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <button onClick={() => navigate('/about')} className="hover:text-primary transition-colors">Sobre</button>
          <span className="opacity-30">•</span>
          <button onClick={() => navigate('/privacy-policy')} className="hover:text-primary transition-colors">Política de Privacidade</button>
          <span className="opacity-30">•</span>
          <button onClick={() => navigate('/terms-of-service')} className="hover:text-primary transition-colors">Termos de Serviço</button>
          <span className="opacity-30">•</span>
          <button onClick={() => navigate('/confianca')} className="hover:text-primary transition-colors">Confiança & Segurança</button>
        </nav>
        <p className="text-[11px] text-muted-foreground">{shopDisplayName} © 2026</p>
      </footer>


      {/* Photo Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <button className="absolute top-4 right-4 text-white/80 z-10" onClick={() => setSelectedPhoto(null)} aria-label="Fechar">
            <X size={28} />
          </button>
          <img
            src={selectedPhoto.url_foto}
            alt={selectedPhoto.descricao || 'Foto'}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
          {selectedPhoto.descricao && (
            <p className="absolute bottom-6 text-center text-white/80 text-sm">{selectedPhoto.descricao}</p>
          )}
        </div>
      )}
    </div>
  );
}
