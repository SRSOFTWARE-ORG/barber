import { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, Check, Lock, Tag, ShoppingBag, Plus, ShoppingCart, Package, Search, Clock } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBarbershop, Service } from '@/contexts/BarbershopContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import IOSTimePicker from '@/components/IOSTimePicker';
import { getServicePhoto } from '@/lib/service-photos';
import { SERVICE_CATEGORIES, filterServices, resolveServiceCategory, type ServiceCategory } from '@/lib/service-categories';
import Seo from '@/components/Seo';

interface ShopProduct {
  id: string;
  shop_owner_id: string;
  nome: string;
  preco: number;
  estoque: number;
  imagem_url: string | null;
}

interface Barber {
  user_id: string;
  display_name: string;
}

export default function BookingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const promo = (location.state as any)?.promo as { id: string; titulo: string; descricao: string; preco_promocional: string | null; preco_original: string | null } | undefined;
  const promoPrice = useMemo(() => {
    if (!promo?.preco_promocional) return 0;
    const n = parseFloat(promo.preco_promocional.replace(/[^\d,.-]/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }, [promo]);
  const { user, barberId: linkedBarberId } = useAuth();
  const { addItem: addToCart, count: cartCount } = useCart();
  const { services: contextServices, addAppointment, isSlotAvailableForBarber, getTimeSlots, getTimeSlotsForBarber, getBarberSettings, settings, appointments, barberSettingsCache } = useBarbershop();
  // Serviços do escopo do barbeiro selecionado (multi-tenant). Para clientes anônimos
  // o contexto não carrega serviços (RLS), então buscamos via RPC security-definer.
  const [barberServices, setBarberServices] = useState<Service[]>([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [svcSearch, setSvcSearch] = useState('');
  const [svcCategory, setSvcCategory] = useState<ServiceCategory>('Todos');
  // Quando há barbeiro selecionado, usamos os serviços do escopo dele.
  const services = selectedBarber ? barberServices : contextServices;
  const filteredStepServices = useMemo(
    () => filterServices(services, svcCategory, svcSearch),
    [services, svcCategory, svcSearch],
  );
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [barberLocked, setBarberLocked] = useState(false);
  const [loadingBarbers, setLoadingBarbers] = useState(false);
  const [step, setStep] = useState(0); // 0=name, 1=barber, 2=service, 3=date, 4=time, 5=confirm
  const [profileLoaded, setProfileLoaded] = useState(false);

  // --- Persistência do rascunho de agendamento ---
  // Evita perder as escolhas (serviço, data, hora, etc.) ao navegar para o
  // carrinho/loja e voltar. Restaura na montagem e salva a cada alteração.
  const DRAFT_KEY = 'booking_draft_v1';
  const [draftLoaded, setDraftLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.firstName) setFirstName(d.firstName);
        if (d.lastName) setLastName(d.lastName);
        if (d.phone) setPhone(d.phone);
        if (d.selectedDate) setSelectedDate(d.selectedDate);
        if (d.selectedTime) setSelectedTime(d.selectedTime);
        if (Array.isArray(d.selectedServices)) setSelectedServices(d.selectedServices);
        if (d.selectedBarber) setSelectedBarber(d.selectedBarber);
        if (typeof d.step === 'number') setStep(d.step);
      }
    } catch { /* ignore */ }
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        firstName, lastName, phone,
        selectedDate, selectedTime, selectedServices, selectedBarber, step,
      }));
    } catch { /* ignore */ }
  }, [draftLoaded, firstName, lastName, phone, selectedDate, selectedTime, selectedServices, selectedBarber, step]);


  // Auto-fill from profile if logged in
  useEffect(() => {
    if (!user || profileLoaded) return;
    const loadProfileData = async () => {
      const { data } = await supabase.from('profiles').select('full_name, telefone').eq('id', user.id).single();
      if (data) {
        if (data.full_name) {
          const parts = data.full_name.split(' ');
          setFirstName(parts[0] || '');
          setLastName(parts.slice(1).join(' ') || '');
        }
        if (data.telefone) setPhone(data.telefone);
      }
      setProfileLoaded(true);
    };
    loadProfileData();
  }, [user]);

  // Read ?barbeiro= from URL (set by home showcase) to pre-select and lock barber
  const preselectedBarberId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('barbeiro');
  }, [location.search]);

  // Auto-lock barber from URL param or context when barbers are loaded
  useEffect(() => {
    if (barbers.length === 0 || barberLocked) return;
    const targetId = preselectedBarberId || linkedBarberId;
    if (!targetId) return;
    const found = barbers.find(b => b.user_id === targetId);
    if (found) {
      setSelectedBarber(found);
      setBarberLocked(true);
    }
  }, [linkedBarberId, preselectedBarberId, barbers]);

  // Fetch barbers list using security definer function
  useEffect(() => {
    const fetchBarbers = async () => {
      setLoadingBarbers(true);
      const { data } = await supabase.rpc('get_barbers');
      if (data) {
        setBarbers(data.map((b: any) => ({ user_id: b.user_id, display_name: b.display_name || 'Barbeiro' })));
      }
      setLoadingBarbers(false);
    };
    fetchBarbers();
  }, []);

  // Carrega serviços do escopo do barbeiro selecionado (multi-tenant) via RPC.
  useEffect(() => {
    const bid = selectedBarber?.user_id;
    if (!bid) { setBarberServices([]); return; }
    let active = true;
    supabase.rpc('get_services_for_barber', { _barber_id: bid }).then(({ data }) => {
      if (!active || !data) return;
      setBarberServices((data as any[]).map((s) => ({
        id: s.id,
        name: s.nome,
        price: Number(s.preco),
        duration: s.duracao,
        ehFracionado: !!s.eh_fracionado,
        duracaoFase1: s.duracao_fase1 ?? undefined,
        duracaoEspera: s.duracao_espera ?? undefined,
        duracaoFase2: s.duracao_fase2 ?? undefined,
      })));
      // Remove serviços selecionados que não pertencem a este barbeiro
      setSelectedServices((prev) => prev.filter((id) => (data as any[]).some((s) => s.id === id)));
    });
    return () => { active = false; };
  }, [selectedBarber?.user_id]);

  // Returns true if a barber was auto-locked
  const checkClientBarber = async (): Promise<boolean> => {
    if (linkedBarberId) {
      const linked = barbers.find(b => b.user_id === linkedBarberId);
      if (linked) {
        setSelectedBarber(linked);
        setBarberLocked(true);
        return true;
      }
    }
    try {
      const { data: foundBarberId } = await supabase.rpc('find_barbeiro_by_phone', { _phone: phone });
      if (foundBarberId) {
        const existingBarber = barbers.find(b => b.user_id === foundBarberId);
        if (existingBarber) {
          setSelectedBarber(existingBarber);
          setBarberLocked(true);
          return true;
        }
      }
    } catch {}
    setBarberLocked(false);
    return false;
  };


  const next15Days = useMemo(() => {
    return Array.from({ length: 15 }, (_, i) => {
      const d = addDays(new Date(), i);
      return format(d, 'yyyy-MM-dd');
    });
  }, []);

  // Use barber-specific time slots
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [barberSettings, setBarberSettings] = useState<typeof settings>(settings);
  // Precompute slots for all dates when barber is selected
  const [dateSlotsMap, setDateSlotsMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!selectedBarber) {
      // Use global settings
      const map: Record<string, string[]> = {};
      next15Days.forEach(date => { map[date] = getTimeSlots(date); });
      setDateSlotsMap(map);
      setBarberSettings(settings);
      return;
    }
    const loadAll = async () => {
      const bs = await getBarberSettings(selectedBarber.user_id);
      setBarberSettings(bs);
      const map: Record<string, string[]> = {};
      for (const date of next15Days) {
        map[date] = await getTimeSlotsForBarber(date, selectedBarber.user_id);
      }
      setDateSlotsMap(map);
    };
    loadAll();
  }, [selectedBarber?.user_id, next15Days]);

  useEffect(() => {
    if (selectedDate) {
      setTimeSlots(dateSlotsMap[selectedDate] || []);
    } else {
      setTimeSlots([]);
    }
  }, [selectedDate, dateSlotsMap]);

  const handleConfirm = async () => {
    if (!firstName || !lastName || !phone || !selectedDate || !selectedTime || !selectedBarber) return;
    if (!promo && selectedServices.length === 0) return;
    // Detecta serviço fracionado a partir dos serviços do barbeiro (escopo correto p/ anônimos)
    let fracInfo: { fase1: number; espera: number; fase2: number } | null = null;
    if (!promo && selectedServices.length === 1) {
      const svc = services.find(s => s.id === selectedServices[0]);
      if (svc?.ehFracionado && svc.duracaoFase1 && svc.duracaoFase2) {
        fracInfo = { fase1: svc.duracaoFase1, espera: svc.duracaoEspera || 0, fase2: svc.duracaoFase2 };
      }
    }
    let created;
    try {
      created = await addAppointment({
        clientName: firstName,
        clientLastName: lastName,
        clientPhone: phone,
        date: selectedDate,
        time: selectedTime,
        serviceIds: promo ? [] : selectedServices,
        clienteId: user?.id,
        barbeiroNome: selectedBarber.display_name,
        barbeiroId: selectedBarber.user_id,
      }, promo ? { titulo: promo.titulo, preco: promoPrice } : undefined, { taxaApp: TAXA_APP, valorSinal, totalPrice, fracInfo });
    } catch (e: any) {
      if (e?.code === 'SLOT_TAKEN') {
        toast.error('Este horário acabou de ser reservado. Escolha outro horário.');
        // Atualiza os slots e volta para a seleção de horário
        if (selectedBarber) {
          const map = await getTimeSlotsForBarber(selectedDate, selectedBarber.user_id);
          setDateSlotsMap(prev => ({ ...prev, [selectedDate]: map }));
        }
        setSelectedTime(null);
        setStep(4);
        return;
      }
      toast.error('Erro ao criar agendamento.');
      return;
    }
    // Link client to barber (set adm_responsavel_id on profile)
    try {
      await supabase.functions.invoke('link-client-barber', {
        body: { clienteId: user?.id, clientPhone: phone, barberId: selectedBarber.user_id },
      });
    } catch {}
    if (created) {
      try { sessionStorage.removeItem('booking_draft_v1'); } catch { /* ignore */ }
      toast.success('Agendamento criado! Realize o pagamento do sinal.');
      navigate(`/pagamento/${created.id}`);
    } else {
      toast.error('Erro ao criar agendamento.');
    }
  };

  // Cobertura do plano (cliente logado + barbeiro selecionado)
  const [planCoverage, setPlanCoverage] = useState<Record<string, { restante: number; limite: number | null; plano: string }>>({});
  const [planName, setPlanName] = useState<string | null>(null);
  useEffect(() => {
    const bid = selectedBarber?.user_id;
    if (!user || !bid) { setPlanCoverage({}); setPlanName(null); return; }
    let active = true;
    supabase.rpc('get_my_plan_coverage', { _barber_id: bid }).then(({ data }) => {
      if (!active) return;
      const map: Record<string, { restante: number; limite: number | null; plano: string }> = {};
      let pname: string | null = null;
      ((data as any[]) || []).forEach((r) => {
        map[r.servico_id] = { restante: Number(r.restante), limite: r.limite_mensal, plano: r.plano_nome };
        pname = r.plano_nome;
      });
      setPlanCoverage(map);
      setPlanName(pname);
    });
    return () => { active = false; };
  }, [user?.id, selectedBarber?.user_id]);

  // Produtos adicionais ("Aproveite também") — só para clientes logados.
  // Priorizamos os produtos da loja do barbeiro que fará o serviço.
  const [shopProducts, setShopProducts] = useState<ShopProduct[]>([]);
  useEffect(() => {
    const bid = selectedBarber?.user_id;
    if (!user || !bid) { setShopProducts([]); return; }
    let active = true;
    (async () => {
      // Resolve o dono da loja do barbeiro (owner-barber = ele mesmo; equipe = dono).
      let ownerId = bid;
      try {
        const { data: owner } = await supabase.rpc('get_barber_shop_owner', { _barber_id: bid });
        if (owner) ownerId = owner as string;
      } catch {}
      const { data } = await supabase
        .from('marketplace_produtos')
        .select('id, shop_owner_id, nome, preco, estoque, imagem_url')
        .eq('shop_owner_id', ownerId)
        .eq('ativo', true)
        .gt('estoque', 0)
        .order('created_at', { ascending: false });
      if (active) setShopProducts(((data as any[]) || []).map((p) => ({ ...p, preco: Number(p.preco) })));
    })();
    return () => { active = false; };
  }, [user?.id, selectedBarber?.user_id]);

  // Serviços adicionais sugeridos: serviços do barbeiro ainda não selecionados.
  const addonServices = useMemo(
    () => (promo ? [] : services.filter((s) => !selectedServices.includes(s.id))),
    [services, selectedServices, promo],
  );



  const toggleService = (id: string) => {
    const cov = planCoverage[id];
    if (cov && cov.restante <= 0 && !selectedServices.includes(id)) {
      toast.error('Limite do plano atingido para este serviço neste mês.');
      return;
    }
    setSelectedServices(prev => {
      if (prev.includes(id)) return prev.filter(s => s !== id);
      if (prev.length >= 6) { toast.error('Máximo de 6 serviços'); return prev; }
      return [...prev, id];
    });
  };

  const [taxaMax, setTaxaMax] = useState<number>(3);
  const [taxaApp, setTaxaApp] = useState<number>(3);
  const [sinalPercentual, setSinalPercentual] = useState<number>(50);
  const [sinalModo, setSinalModo] = useState<'pix' | 'mp'>('pix');
  useEffect(() => {
    const barberId = selectedBarber?.user_id || linkedBarberId;
    if (!barberId) { setTaxaMax(3); setTaxaApp(3); setSinalPercentual(50); setSinalModo('pix'); return; }
    supabase.rpc('get_barber_payment_config', { _barber_id: barberId }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        const max = Math.max(0, Math.min(3, Number(row.taxa_app_valor ?? 3)));
        setTaxaMax(max);
        setTaxaApp(max);
        setSinalPercentual(Math.max(10, Math.min(100, Number(row.sinal_percentual ?? 50))));
        setSinalModo((row.sinal_modo === 'mp' ? 'mp' : 'pix'));
      }
    });
  }, [selectedBarber, linkedBarberId]);

  const totalPrice = promo ? promoPrice : selectedServices.reduce((sum, id) => {
    const cov = planCoverage[id];
    if (cov && cov.restante > 0) return sum; // gratuito pelo plano
    const svc = services.find(s => s.id === id);
    return sum + (svc?.price || 0);
  }, 0);
  const TAXA_APP = taxaApp; // por agendamento (não por serviço)
  const totalComTaxa = totalPrice + TAXA_APP;
  const valorSinal = Math.round((totalPrice * (sinalPercentual / 100) + TAXA_APP) * 100) / 100;

  const totalDuration = promo ? (barberSettings.slotDuration || 30) : selectedServices.reduce((sum, id) => {
    const svc = services.find(s => s.id === id);
    return sum + (svc?.duration || 0);
  }, 0);

  const slotsNeeded = Math.max(1, Math.ceil(totalDuration / (barberSettings.slotDuration || 30)));

  // Calcula, para a data selecionada, quais horários de início conseguem encaixar
  // TODOS os serviços de forma consecutiva (cálculo "de trás pra frente": um início só
  // é válido se houver `slotsNeeded` slots livres seguidos até o fim do expediente).
  const availableStartTimes = useMemo(() => {
    if (!selectedBarber || !selectedDate || timeSlots.length === 0) return [];
    return timeSlots.filter((_, idx) => {
      if (idx + slotsNeeded > timeSlots.length) return false;
      return Array.from({ length: slotsNeeded }, (_, i) => timeSlots[idx + i])
        .every((t) => isSlotAvailableForBarber(selectedDate, t, selectedBarber.user_id));
    });
  }, [timeSlots, slotsNeeded, selectedBarber, selectedDate, isSlotAvailableForBarber]);

  // Step navigation that skips locked barber selection (only 1 barber linked) and service step (when promo)
  const goNext = (from: number) => {
    let n = from + 1;
    if (n === 1 && barberLocked) n = 2;
    if (n === 2 && promo) n = 3;
    setStep(n);
  };
  const goBack = () => {
    let n = step - 1;
    if (n === 2 && promo) n = 1;
    if (n === 1 && barberLocked) n = 0;
    setStep(Math.max(0, n));
  };

  const totalSteps = 6;

  return (
    <div className="page-shell min-h-screen">
      <Seo path="/booking" title="Agendar Horário na Barbearia" description="Agende online seu horário para corte de cabelo masculino e barba com o barbeiro de sua preferência. Rápido e prático." />
      {/* Header */}
      <div className="page-header flex items-center gap-3 px-4">
        <button onClick={() => step > 0 ? goBack() : navigate('/')} className="text-primary" aria-label="Voltar">
          <ArrowLeft size={24} />
        </button>
        <h1 className="font-heading text-xl text-foreground">Agendar Horário</h1>
      </div>

      {/* Step indicator */}
      <div className="flex gap-1 px-4 mb-6">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-muted'}`} />
        ))}
      </div>

      {promo && (
        <div className="px-4 mb-4">
          <div className="wood-card px-4 py-3 flex items-start gap-3 border border-primary/30">
            <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
              <Tag size={16} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-wider text-primary">Promoção selecionada</p>
              <p className="font-heading text-base text-foreground">{promo.titulo}</p>
              <p className="text-xs text-muted-foreground">{promo.descricao}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {promo.preco_original && <span className="text-xs text-muted-foreground line-through">{promo.preco_original}</span>}
                {promo.preco_promocional && <span className="text-sm text-primary font-semibold">{promo.preco_promocional}</span>}
                <span className="text-[10px] uppercase tracking-wider bg-primary/15 text-primary px-2 py-0.5 rounded-full">+ Taxa app R$ {TAXA_APP.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 animate-fade-in">
        {/* Step 0: Name */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="font-heading text-lg text-foreground">Seus dados</h2>
            <input
              placeholder="Nome"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              className="vintage-input w-full px-4 py-3 rounded-lg text-base"
            />
            <input
              placeholder="Sobrenome"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              className="vintage-input w-full px-4 py-3 rounded-lg text-base"
            />
            <div>
              <input
                placeholder="Telefone com DDD — (11) 99999-9999"
                value={phone}
                onChange={e => {
                  let v = e.target.value.replace(/\D/g, '').slice(0, 11);
                  if (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
                  else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
                  else if (v.length > 0) v = `(${v}`;
                  setPhone(v);
                  const digits = v.replace(/\D/g, '');
                  if (digits.length > 0 && digits.length < 10) setPhoneError('Telefone deve ter DDD + 8 ou 9 dígitos');
                  else setPhoneError('');
                }}
                className="vintage-input w-full px-4 py-3 rounded-lg text-base"
              />
              {phoneError && <p className="text-destructive text-xs mt-1">{phoneError}</p>}
              <p className="text-muted-foreground text-xs mt-2 leading-relaxed">
                🔒 Usamos seu número exclusivamente para enviar lembretes de retorno e confirmações de horário. Não enviamos spam.
              </p>
            </div>
            <button
              disabled={!firstName || !lastName || phone.replace(/\D/g, '').length < 10}
              onClick={async () => {
                const locked = await checkClientBarber();
                let n = 1;
                if (locked) n = 2;
                if (n === 2 && promo) n = 3;
                setStep(n);
              }}
              className="vintage-btn w-full py-3 rounded-lg text-base disabled:opacity-40"
            >
              Continuar
            </button>
          </div>
        )}

        {/* Step 1: Choose Barber */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-heading text-lg text-foreground">Escolha o barbeiro</h2>
            {barberLocked && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
                <Lock size={14} />
                <span>Você já é cliente deste barbeiro</span>
              </div>
            )}
            {loadingBarbers ? (
              <p className="text-muted-foreground text-center py-8">Carregando...</p>
            ) : barbers.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Nenhum barbeiro disponível</p>
            ) : (
              <div className="space-y-2">
                {barbers.map(barber => {
                  const isSelected = selectedBarber?.user_id === barber.user_id;
                  const isDisabled = barberLocked && selectedBarber?.user_id !== barber.user_id;
                  return (
                    <button
                      key={barber.user_id}
                      disabled={isDisabled}
                      onClick={() => !barberLocked && setSelectedBarber(barber)}
                      className={`w-full flex items-center justify-between px-4 py-4 rounded-lg transition-all ${
                        isSelected ? 'slot-selected' : isDisabled ? 'slot-occupied' : 'slot-available'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isSelected ? 'bg-primary border-primary' : 'border-muted-foreground'
                        }`}>
                          {isSelected && <Check size={14} className="text-primary-foreground" />}
                        </div>
                        <p className="font-heading text-base text-foreground">{barber.display_name}</p>
                      </div>
                      {isDisabled && <Lock size={14} className="text-muted-foreground" />}
                    </button>
                  );
                })}
              </div>
            )}
            <button
              disabled={!selectedBarber}
              onClick={() => goNext(1)}
              className="vintage-btn w-full py-3 rounded-lg text-base disabled:opacity-40"
            >
              Continuar
            </button>
          </div>
        )}

        {/* Step 2: Service (1-4) */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-heading text-lg text-foreground">Escolha os serviços</h2>
            <p className="text-xs text-muted-foreground">Selecione de 1 a 6 serviços. Taxa do app de R$ {TAXA_APP.toFixed(2)} cobrada uma vez por agendamento.</p>
            {planName && (
              <div className="wood-card px-3 py-2 border border-primary/30 flex items-center gap-2">
                <Tag size={14} className="text-primary shrink-0" />
                <p className="text-[11px] text-foreground">
                  Você tem o <strong className="text-primary">{planName}</strong>. Serviços do plano ficam gratuitos até o limite mensal.
                </p>
              </div>
            )}
            {/* Busca */}
            <div className="relative">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-primary/70" />
              <input
                value={svcSearch}
                onChange={(e) => setSvcSearch(e.target.value)}
                placeholder="Qual serviço você quer hoje?"
                className="vintage-input w-full rounded-full pl-11 pr-4 py-3 text-sm"
                aria-label="Buscar serviço"
              />
            </div>

            {/* Categorias */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {SERVICE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSvcCategory(cat)}
                  className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-heading transition-all active:scale-95 ${
                    svcCategory === cat
                      ? 'bg-primary text-primary-foreground shadow-[0_0_14px_hsl(var(--primary)/0.35)]'
                      : 'wood-card text-muted-foreground'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {filteredStepServices.length === 0 ? (
              <div className="wood-card flex flex-col items-center gap-2 py-10 text-center">
                <Search size={28} className="text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">Nenhum serviço encontrado.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredStepServices.map((svc, i) => {
                  const isSelected = selectedServices.includes(svc.id);
                  const cov = planCoverage[svc.id];
                  const isFree = !!cov && cov.restante > 0;
                  const isBlocked = !!cov && cov.restante <= 0;
                  return (
                    <button
                      key={svc.id}
                      onClick={() => toggleService(svc.id)}
                      disabled={isBlocked && !isSelected}
                      style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}
                      className={`group w-full flex items-center gap-3 p-3 rounded-2xl text-left animate-fade-in transition-all duration-200 active:scale-[0.98] border ${
                        isSelected
                          ? 'border-primary bg-primary/10 shadow-[0_0_18px_hsl(var(--primary)/0.25)]'
                          : isBlocked
                            ? 'wood-card border-transparent opacity-60'
                            : 'wood-card border-primary/10 hover:border-primary/30'
                      }`}
                    >
                      <div className="relative w-[76px] h-[76px] rounded-xl overflow-hidden bg-secondary shrink-0">
                        <img
                          src={getServicePhoto(svc.name, svc.fotoUrl)}
                          alt={`Serviço ${svc.name}`}
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-primary/30 flex items-center justify-center">
                            <span className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                              <Check size={16} className="text-primary-foreground" />
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <span className="text-[9px] font-bold uppercase tracking-wide text-primary/90 bg-primary/10 px-2 py-0.5 rounded-full">
                          {resolveServiceCategory(svc)}
                        </span>
                        <p className="font-heading text-base text-foreground truncate">{svc.name}</p>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock size={12} /> {svc.duration} min
                          {isFree && cov?.limite != null && ` • ${cov.restante}/${cov.limite} no mês`}
                        </p>
                        {isFree ? (
                          <span className="text-xs font-heading text-primary bg-primary/15 px-2 py-0.5 rounded-full inline-block">Plano · grátis</span>
                        ) : isBlocked ? (
                          <span className="text-[10px] font-heading text-destructive">Limite atingido</span>
                        ) : (
                          <span className="font-heading text-lg text-primary">R$ {svc.price}</span>
                        )}
                      </div>
                      <span className="self-center">
                        <span className={`text-xs px-3 py-2 rounded-xl flex items-center gap-1 whitespace-nowrap font-heading transition-colors ${
                          isSelected ? 'bg-primary text-primary-foreground' : 'vintage-btn'
                        }`}>
                          {isSelected ? <><Check size={12} /> Selecionado</> : 'Selecionar'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedServices.length > 0 && (
              <div className="wood-card px-4 py-3 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-sm">{selectedServices.length} serviço(s) • {totalDuration} min</span>
                  <span className="font-heading text-lg text-primary">R$ {totalComTaxa}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Taxa do app: R$ {TAXA_APP.toFixed(2)} • Sinal ({sinalPercentual}% + taxa): <strong>R$ {valorSinal.toFixed(2)}</strong> • Restante no dia: R$ {(totalPrice - totalPrice * (sinalPercentual / 100)).toFixed(2)}
                </p>
              </div>
            )}
            <button
              disabled={selectedServices.length === 0}
              onClick={() => goNext(2)}
              className="vintage-btn w-full py-3 rounded-lg text-base disabled:opacity-40"
            >
              Continuar
            </button>
          </div>
        )}

        {/* Step 3: Date */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-heading text-lg text-foreground">Escolha a data</h2>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
              {next15Days.map(date => {
                const d = new Date(date + 'T12:00:00');
                const dayName = format(d, 'EEE', { locale: ptBR });
                const dayNum = format(d, 'dd');
                const monthName = format(d, 'MMM', { locale: ptBR });
                const slots = dateSlotsMap[date] || [];
                const isWorkDay = slots.length > 0;

                // Check if any slot is actually available for the selected barber
                const hasAvailableSlot = isWorkDay && selectedBarber && slots.some((time, idx) => {
                  return idx + slotsNeeded <= slots.length &&
                    Array.from({ length: slotsNeeded }, (_, i) => slots[idx + i])
                      .every(t => isSlotAvailableForBarber(date, t, selectedBarber.user_id));
                });

                const isSelectable = isWorkDay && hasAvailableSlot;
                const isSelected = selectedDate === date;

                // Hide dates with no available slots entirely
                if (isWorkDay && !hasAvailableSlot) {
                  return (
                    <button
                      key={date}
                      disabled
                      className="flex-shrink-0 flex flex-col items-center px-3 py-3 rounded-lg transition-all min-w-[60px] slot-occupied"
                    >
                      <span className="text-[10px] uppercase">{dayName}</span>
                      <span className="text-xl font-bold">{dayNum}</span>
                      <span className="text-[10px] uppercase text-destructive">Lotado</span>
                    </button>
                  );
                }

                return (
                  <button
                    key={date}
                    disabled={!isSelectable}
                    onClick={() => { setSelectedDate(date); setSelectedTime(null); }}
                    className={`flex-shrink-0 flex flex-col items-center px-3 py-3 rounded-lg transition-all min-w-[60px] ${
                      isSelected ? 'slot-selected' : isSelectable ? 'slot-available' : 'slot-occupied'
                    }`}
                  >
                    <span className="text-[10px] uppercase">{dayName}</span>
                    <span className="text-xl font-bold">{dayNum}</span>
                    <span className="text-[10px] uppercase">{monthName}</span>
                  </button>
                );
              })}
            </div>
            <button
              disabled={!selectedDate}
              onClick={() => goNext(3)}
              className="vintage-btn w-full py-3 rounded-lg text-base disabled:opacity-40"
            >
              Continuar
            </button>
          </div>
        )}

        {/* Step 4: Time — seletor iOS-style centralizado */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-heading text-lg text-foreground text-center">Escolha o horário</h2>
            <p className="text-xs text-muted-foreground text-center">
              Duração total: {totalDuration} min ({slotsNeeded} slot{slotsNeeded > 1 ? 's' : ''})
            </p>
            {timeSlots.length === 0 ? (
              <div className="wood-card px-4 py-5 text-center border border-destructive/30">
                <p className="text-sm text-foreground font-medium mb-1">Nenhum horário neste dia</p>
                <p className="text-xs text-muted-foreground">
                  O barbeiro não atende nesta data. Escolha outra data disponível.
                </p>
              </div>
            ) : availableStartTimes.length === 0 ? (
              <div className="wood-card px-4 py-5 text-center border border-destructive/30">
                <p className="text-sm text-foreground font-medium mb-1">
                  Não há horário que comporte todos os serviços neste dia
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Seus serviços somam <strong>{totalDuration} min</strong> ({slotsNeeded} slots seguidos) e não há
                  um intervalo livre dessa duração até o fim do expediente. Tente <strong>outra data</strong> ou
                  remova algum serviço para encaixar no mesmo dia.
                </p>
              </div>
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground text-center">
                  Mostramos apenas os horários de início em que cabem todos os serviços seguidos no mesmo dia.
                </p>
                <div className="flex justify-center">
                  <IOSTimePicker
                    slots={timeSlots.map((time, idx) => ({
                      time,
                      available: !!(
                        selectedBarber &&
                        idx + slotsNeeded <= timeSlots.length &&
                        Array.from({ length: slotsNeeded }, (_, i) => timeSlots[idx + i])
                          .every(t => isSlotAvailableForBarber(selectedDate!, t, selectedBarber.user_id))
                      ),
                    }))}
                    value={selectedTime}
                    onChange={setSelectedTime}
                  />
                </div>
              </>
            )}
            <button
              disabled={!selectedTime}
              onClick={() => goNext(4)}
              className="vintage-btn w-full py-3 rounded-lg text-base disabled:opacity-40"
            >
              Continuar
            </button>
          </div>
        )}

        {/* Step 5: Confirm */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="font-heading text-lg text-foreground">Confirmar Agendamento</h2>
            <div className="wood-card px-4 py-4 space-y-2">
              <p className="text-foreground"><strong>Nome:</strong> {firstName} {lastName}</p>
              <p className="text-foreground"><strong>Telefone:</strong> {phone}</p>
              <p className="text-foreground"><strong>Barbeiro:</strong> {selectedBarber?.display_name}</p>
              <p className="text-foreground"><strong>Data:</strong> {selectedDate && format(new Date(selectedDate + 'T12:00:00'), "dd/MM/yyyy (EEEE)", { locale: ptBR })}</p>
              <p className="text-foreground"><strong>Horário:</strong> {selectedTime}</p>
              <p className="text-foreground"><strong>{promo ? 'Promoção' : 'Serviços'}:</strong> {promo ? promo.titulo : selectedServices.map(id => services.find(s => s.id === id)?.name).filter(Boolean).join(', ')}</p>
              <p className="text-foreground"><strong>Duração:</strong> {totalDuration} min</p>
              <div className="pt-2 border-t border-border space-y-2">
                <p className="text-foreground text-sm">Subtotal: R$ {totalPrice}</p>
                {TAXA_APP > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Taxa do app (por agendamento)</span>
                    <span className="text-foreground font-semibold">R$ {TAXA_APP.toFixed(2)}</span>
                  </div>
                )}
                <p className="font-heading text-lg text-primary">Total: R$ {totalComTaxa.toFixed(2)}</p>
                <p className="text-xs text-accent">Sinal a pagar agora ({sinalPercentual}% + taxa): R$ {valorSinal.toFixed(2)}</p>
                <p className="text-[11px] text-muted-foreground">Forma do sinal: {sinalModo === 'mp' ? 'Mercado Pago' : 'PIX (envio de comprovante)'}</p>
              </div>
            </div>

            {/* Aproveite também — adicionais (apenas clientes logados) */}
            {user && (addonServices.length > 0 || shopProducts.length > 0) && (
              <div className="wood-card px-4 py-4 space-y-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag size={16} className="text-primary" />
                  <h3 className="font-heading text-base text-foreground">Aproveite também</h3>
                </div>

                {/* Serviços adicionais — seguem o sinal normalmente */}
                {addonServices.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Serviços extras</p>
                    {addonServices.slice(0, 6).map((svc) => {
                      const cov = planCoverage[svc.id];
                      const isFree = !!cov && cov.restante > 0;
                      const isBlocked = !!cov && cov.restante <= 0;
                      return (
                        <div key={svc.id} className="flex items-center justify-between gap-2 bg-secondary/40 rounded-lg px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-sm text-foreground truncate">{svc.name}</p>
                            <p className="text-xs text-muted-foreground">{svc.duration} min</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isFree ? (
                              <span className="text-[11px] font-heading text-primary">Plano · grátis</span>
                            ) : (
                              <span className="text-sm font-heading text-primary">R$ {svc.price}</span>
                            )}
                            <button
                              onClick={() => toggleService(svc.id)}
                              disabled={isBlocked}
                              className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
                              aria-label={`Adicionar ${svc.name}`}
                            >
                              <Plus size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Produtos do marketplace — pagos 100% (split 90/10 vai para o vendedor) */}
                {shopProducts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Produtos da loja</p>
                    {shopProducts.slice(0, 8).map((p) => (
                      <div key={p.id} className="flex items-center gap-2 bg-secondary/40 rounded-lg px-3 py-2">
                        <div className="w-10 h-10 rounded-lg bg-secondary overflow-hidden flex items-center justify-center shrink-0">
                          {p.imagem_url ? (
                            <img src={p.imagem_url} alt={p.nome} className="w-full h-full object-cover" />
                          ) : (
                            <Package size={16} className="text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground truncate">{p.nome}</p>
                          <p className="text-xs text-primary font-semibold">R$ {p.preco.toFixed(2)}</p>
                        </div>
                        <button
                          onClick={() => {
                            addToCart({ produto_id: p.id, nome: p.nome, preco: p.preco, shop_owner_id: p.shop_owner_id, imagem_url: p.imagem_url });
                            toast.success('Adicionado ao carrinho');
                          }}
                          className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0"
                          aria-label={`Adicionar ${p.nome} ao carrinho`}
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground">
                      Produtos são pagos à parte (100%) no carrinho. O serviço continua com o sinal de {sinalPercentual}%.
                    </p>
                    <button
                      onClick={() => navigate('/carrinho')}
                      className="w-full flex items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm text-foreground"
                    >
                      <ShoppingCart size={15} /> Ver carrinho{cartCount > 0 ? ` (${cartCount})` : ''}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="sticky bottom-0 z-30 -mx-4 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] bg-gradient-to-t from-background via-background/95 to-transparent">
              <button
                onClick={handleConfirm}
                className="vintage-btn w-full py-3 rounded-lg text-base flex items-center justify-center gap-2 shadow-lg"
              >
                <Check size={18} /> Ir para pagamento do sinal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
