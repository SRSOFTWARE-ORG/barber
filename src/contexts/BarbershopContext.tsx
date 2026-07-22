import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Service {
  id: string;
  name: string;
  price: number;
  duration: number;
  ehFracionado?: boolean;
  duracaoFase1?: number;
  duracaoEspera?: number;
  duracaoFase2?: number;
  fotoUrl?: string | null;
  categoria?: string | null;
}

export interface Appointment {
  id: string;
  clientName: string;
  clientLastName: string;
  clientPhone: string;
  date: string;
  time: string;
  serviceIds: string[];
  status: 'pending' | 'confirmed' | 'cancelled' | 'finalizado';
  createdAt: string;
  clienteId?: string;
  valorPago?: number;
  barbeiroNome?: string;
  barbeiroId?: string;
  arquivado?: boolean;
  sinalPago?: boolean;
  valorSinal?: number;
  taxaApp?: number;
  comprovanteUrl?: string;
  ehFracionado?: boolean;
  fase1Duracao?: number;
  esperaDuracao?: number;
  fase2Duracao?: number;
}

export interface BusinessSettings {
  shopName: string;
  startHour: number;
  endHour: number;
  workDays: number[];
  slotDuration: number;
  closedTodayDate?: string | null;
  closedTodayTime?: string | null;
  sameDayCutoffHour?: number | null;
}

export interface BlockedSlot {
  id: string;
  date: string;
  time: string;
  reason?: string;
}

interface BarbershopContextType {
  settings: BusinessSettings;
  services: Service[];
  appointments: Appointment[];
  blockedSlots: BlockedSlot[];
  newAppointmentAlert: Appointment | null;
  clearAlert: () => void;
  updateSettings: (s: Partial<BusinessSettings>) => void;
  addService: (s: Omit<Service, 'id'>) => void;
  updateService: (id: string, s: Partial<Service>) => void;
  deleteService: (id: string) => void;
  addAppointment: (a: Omit<Appointment, 'id' | 'status' | 'createdAt'>, promo?: { titulo: string; preco: number }, financials?: { taxaApp: number; valorSinal: number; totalPrice?: number; fracInfo?: { fase1: number; espera: number; fase2: number } | null }) => Promise<Appointment | null>;
  confirmAppointment: (id: string) => void;
  cancelAppointment: (id: string) => void;
  finishAppointment: (id: string, valorPago?: number, barbeiroNome?: string) => void;
  deleteAppointment: (id: string) => Promise<void>;
  blockSlot: (date: string, time: string, reason?: string) => void;
  unblockSlot: (id: string) => void;
  isSlotAvailable: (date: string, time: string) => boolean;
  isSlotAvailableForBarber: (date: string, time: string, barberId: string) => boolean;
  isRangeAvailableForBarber: (date: string, startTime: string, durationMinutes: number, barberId: string) => boolean;
  getTimeSlots: (date: string) => string[];
  getTimeSlotsForBarber: (date: string, barberId: string) => Promise<string[]>;
  getBarberSettings: (barberId: string) => Promise<BusinessSettings>;
  saveBarberSettings: (barberId: string, s: Partial<BusinessSettings>) => Promise<void>;
  barberSettingsCache: Record<string, BusinessSettings>;
  refreshAppointments: () => Promise<void>;
  loading: boolean;
}

const defaultSettings: BusinessSettings = {
  shopName: 'Barbearia Classic',
  startHour: 9,
  endHour: 19,
  workDays: [1, 2, 3, 4, 5, 6],
  slotDuration: 30,
};

const BarbershopContext = createContext<BarbershopContextType | null>(null);

export function BarbershopProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<BusinessSettings>(defaultSettings);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [barberSettingsCache, setBarberSettingsCache] = useState<Record<string, BusinessSettings>>({});
  const [newAppointmentAlert, setNewAppointmentAlert] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);

  // Load all data from database
  useEffect(() => {
    const loadData = async () => {
      try {
        const today = new Date();
        const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const [settingsRes, servicesRes, busyRes, fullRes, blockedRes] = await Promise.all([
          supabase.from('configuracoes').select('*').limit(1).single(),
          supabase.from('servicos').select('*').order('created_at'),
          supabase.rpc('get_busy_slots', { _data_inicio: startDate, _dias: 60 }),
          // cliente_telefone is no longer readable via the table; the secure RPC
          // returns full rows (incl. phone) only for the caller's own appointments.
          supabase.rpc('list_agendamentos_full'),
          supabase.rpc('get_blocked_slots', { _data_inicio: startDate, _dias: 60 }),
        ]);

        if (settingsRes.data) {
          setSettings({
            shopName: settingsRes.data.nome_barbearia,
            startHour: settingsRes.data.hora_inicio,
            endHour: settingsRes.data.hora_fim,
            workDays: settingsRes.data.dias_funcionamento,
            slotDuration: settingsRes.data.duracao_slot,
          });
        }

        if (servicesRes.data) {
          setServices(servicesRes.data.map((s: any) => ({
            id: s.id,
            name: s.nome,
            price: Number(s.preco),
            duration: s.duracao,
            ehFracionado: !!s.eh_fracionado,
            duracaoFase1: s.duracao_fase1 ?? undefined,
            duracaoEspera: s.duracao_espera ?? undefined,
            duracaoFase2: s.duracao_fase2 ?? undefined,
            fotoUrl: s.foto_url ?? null,
            categoria: s.categoria ?? null,
          })));
        }

        // Merge full rows (RLS-allowed; staff/owner sees these) with public busy slots
        const fullById = new Map<string, any>();
        (fullRes.data || []).forEach((a: any) => fullById.set(a.id, a));
        const mapFull = (full: any): Appointment => ({
          id: full.id,
          clientName: full.cliente_nome,
          clientLastName: full.cliente_sobrenome,
          clientPhone: full.cliente_telefone,
          date: full.data,
          time: full.hora,
          serviceIds: full.servico_ids,
          status: full.status,
          createdAt: full.created_at,
          clienteId: full.cliente_id,
          valorPago: Number(full.valor_pago) || 0,
          barbeiroNome: full.barbeiro_nome || undefined,
          barbeiroId: full.barbeiro_id || undefined,
          arquivado: full.arquivado || false,
          sinalPago: full.sinal_pago || false,
          valorSinal: Number(full.valor_sinal) || 0,
          taxaApp: Number(full.taxa_app) || 3,
          comprovanteUrl: full.comprovante_url || undefined,
          ehFracionado: !!full.eh_fracionado,
          fase1Duracao: full.fase1_duracao ?? undefined,
          esperaDuracao: full.espera_duracao ?? undefined,
          fase2Duracao: full.fase2_duracao ?? undefined,
        });
        const merged: Appointment[] = [];
        (busyRes.data || []).forEach((b: any) => {
          const full = fullById.get(b.id);
          if (full) { merged.push(mapFull(full)); fullById.delete(b.id); }
          else merged.push({
            id: b.id, clientName: '', clientLastName: '', clientPhone: '',
            date: b.data, time: b.hora, serviceIds: b.servico_ids || [],
            status: b.status, createdAt: '', barbeiroId: b.barbeiro_id || undefined,
            arquivado: b.arquivado || false,
            ehFracionado: !!b.eh_fracionado,
            fase1Duracao: b.fase1_duracao ?? undefined,
            esperaDuracao: b.espera_duracao ?? undefined,
            fase2Duracao: b.fase2_duracao ?? undefined,
          });
        });
        fullById.forEach((full: any) => merged.push(mapFull(full)));
        setAppointments(merged);

        if (blockedRes.data) {
          setBlockedSlots((blockedRes.data as any[]).map(b => ({
            id: b.id,
            date: b.data,
            time: b.hora,
          })));
        }
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Realtime subscription for appointments.
  // The realtime publication intentionally EXCLUDES client PII (nome/sobrenome/telefone/valor_pago),
  // so we never receive that data over the broadcast channel. On each change event we re-fetch the
  // row through the RLS-protected SELECT, which only returns data the current user is authorized to read.
  useEffect(() => {
    const fetchAppt = async (id: string): Promise<Appointment | null> => {
      const { data } = await supabase.rpc('list_agendamentos_full', { _id: id });
      const a = Array.isArray(data) ? data[0] : null;
      if (!a) return null; // not authorized (RLS) or row gone
      const full = a as any;
      return {
        id: full.id,
        clientName: full.cliente_nome,
        clientLastName: full.cliente_sobrenome,
        clientPhone: full.cliente_telefone,
        date: full.data,
        time: full.hora,
        serviceIds: full.servico_ids,
        status: full.status,
        createdAt: full.created_at,
        clienteId: full.cliente_id || undefined,
        valorPago: Number(full.valor_pago) || 0,
        barbeiroNome: full.barbeiro_nome || undefined,
        barbeiroId: full.barbeiro_id || undefined,
        arquivado: full.arquivado || false,
        sinalPago: full.sinal_pago || false,
        valorSinal: Number(full.valor_sinal) || 0,
        taxaApp: Number(full.taxa_app) || 3,
        comprovanteUrl: full.comprovante_url || undefined,
        ehFracionado: !!full.eh_fracionado,
        fase1Duracao: full.fase1_duracao ?? undefined,
        esperaDuracao: full.espera_duracao ?? undefined,
        fase2Duracao: full.fase2_duracao ?? undefined,
      };
    };

    const channel = supabase
      .channel('agendamentos-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agendamentos' }, async (payload) => {
        const id = (payload.new as any)?.id;
        if (!id) return;
        const newAppt = await fetchAppt(id);
        if (!newAppt) return; // RLS: not authorized to read this appointment
        setAppointments(prev => {
          if (prev.some(p => p.id === newAppt.id)) return prev;
          return [newAppt, ...prev];
        });
        setNewAppointmentAlert(newAppt);
        try {
          const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbsGczHjyD0teleElCYIy31cilZ0E7WH+oxMGue1ZHUXSmv7ymi2RNR1h3n7e0qo1sV01WcZivrKOLcF1RU2uWq6ihi3ReVlRpkqajn4lxYFtXZo6gnZuEcGJeW2OKm5iWf21kYF1hh5eTk3xsZmJeYISUkI97bGdjYGCCkY2MeW1oZGFfgI+Lind0bWZjX3+OiYh3c21nZGF/joiHd3NtZ2Rhf46Ih3dzb');
          audio.volume = 0.3;
          audio.play().catch(() => {});
        } catch {}
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'agendamentos' }, async (payload) => {
        const id = (payload.new as any)?.id;
        if (!id) return;
        const updated = await fetchAppt(id);
        if (!updated) return; // RLS: not authorized to read this appointment
        setAppointments(prev => prev.map(appt => appt.id === updated.id ? { ...appt, ...updated } : appt));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const updateSettings = useCallback(async (s: Partial<BusinessSettings>) => {
    const updates: any = {};
    if (s.shopName !== undefined) updates.nome_barbearia = s.shopName;
    if (s.startHour !== undefined) updates.hora_inicio = s.startHour;
    if (s.endHour !== undefined) updates.hora_fim = s.endHour;
    if (s.workDays !== undefined) updates.dias_funcionamento = s.workDays;
    if (s.slotDuration !== undefined) updates.duracao_slot = s.slotDuration;
    updates.updated_at = new Date().toISOString();

    const { data } = await supabase.from('configuracoes').select('id').limit(1).single();
    if (data) {
      await supabase.from('configuracoes').update(updates).eq('id', data.id);
    }
    setSettings(prev => ({ ...prev, ...s }));
  }, []);

  const addService = useCallback(async (s: Omit<Service, 'id'>) => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes?.user?.id;
    let shopOwnerId: string | null = null;
    if (uid) {
      const { data: so } = await supabase.rpc('get_my_shop_owner');
      shopOwnerId = (so as string) || uid;
    }
    const payload: any = {
      nome: s.name,
      preco: s.price,
      duracao: s.duration,
      eh_fracionado: !!s.ehFracionado,
      duracao_fase1: s.duracaoFase1 ?? null,
      duracao_espera: s.duracaoEspera ?? null,
      duracao_fase2: s.duracaoFase2 ?? null,
      foto_url: s.fotoUrl ?? null,
      categoria: s.categoria ?? null,
      shop_owner_id: shopOwnerId,
    };
    const { data, error } = await supabase.from('servicos').insert(payload).select().single();
    if (data && !error) {
      const d: any = data;
      setServices(prev => [...prev, {
        id: d.id, name: d.nome, price: Number(d.preco), duration: d.duracao,
        ehFracionado: !!d.eh_fracionado,
        duracaoFase1: d.duracao_fase1 ?? undefined,
        duracaoEspera: d.duracao_espera ?? undefined,
        duracaoFase2: d.duracao_fase2 ?? undefined,
        fotoUrl: d.foto_url ?? null,
        categoria: d.categoria ?? null,
      }]);
    }
  }, []);

  const updateService = useCallback(async (id: string, s: Partial<Service>) => {
    const updates: any = {};
    if (s.name !== undefined) updates.nome = s.name;
    if (s.price !== undefined) updates.preco = s.price;
    if (s.duration !== undefined) updates.duracao = s.duration;
    if (s.ehFracionado !== undefined) updates.eh_fracionado = s.ehFracionado;
    if (s.duracaoFase1 !== undefined) updates.duracao_fase1 = s.duracaoFase1;
    if (s.duracaoEspera !== undefined) updates.duracao_espera = s.duracaoEspera;
    if (s.duracaoFase2 !== undefined) updates.duracao_fase2 = s.duracaoFase2;
    if (s.fotoUrl !== undefined) updates.foto_url = s.fotoUrl;
    if (s.categoria !== undefined) updates.categoria = s.categoria;
    await supabase.from('servicos').update(updates).eq('id', id);
    setServices(prev => prev.map(svc => svc.id === id ? { ...svc, ...s } : svc));
  }, []);

  const deleteService = useCallback(async (id: string) => {
    await supabase.from('servicos').delete().eq('id', id);
    setServices(prev => prev.filter(svc => svc.id !== id));
  }, []);

  const addAppointment = useCallback(async (a: Omit<Appointment, 'id' | 'status' | 'createdAt'>, promo?: { titulo: string; preco: number }, financials?: { taxaApp: number; valorSinal: number; totalPrice?: number; fracInfo?: { fase1: number; espera: number; fase2: number } | null }): Promise<Appointment | null> => {
    let totalPrice: number;
    let taxaApp: number;
    let valorSinal: number;

    if (financials) {
      totalPrice = financials.totalPrice ?? (promo ? promo.preco : a.serviceIds.reduce((sum, id) => {
        const svc = services.find(s => s.id === id);
        return sum + (svc?.price || 0);
      }, 0));
      taxaApp = Math.max(0, Math.min(3, financials.taxaApp));
      valorSinal = Math.round(financials.valorSinal * 100) / 100;
    } else {
      const TAXA = 3;
      totalPrice = promo ? promo.preco : a.serviceIds.reduce((sum, id) => {
        const svc = services.find(s => s.id === id);
        return sum + (svc?.price || 0);
      }, 0);
      taxaApp = TAXA;
      valorSinal = Math.round((totalPrice / 2 + taxaApp) * 100) / 100;
    }

    // Detecta serviço fracionado (apenas 1 serviço fracionado por agendamento)
    // Prioriza fracInfo explícito (necessário para clientes anônimos, cujo contexto
    // não carrega os serviços do barbeiro por causa do RLS multi-tenant).
    let fracInfo: { fase1: number; espera: number; fase2: number } | null = financials?.fracInfo ?? null;
    if (!fracInfo && !promo && a.serviceIds.length === 1) {
      const svc = services.find(s => s.id === a.serviceIds[0]);
      if (svc?.ehFracionado && svc.duracaoFase1 && svc.duracaoFase2) {
        fracInfo = {
          fase1: svc.duracaoFase1,
          espera: svc.duracaoEspera || 0,
          fase2: svc.duracaoFase2,
        };
      }
    }

    const insertData: any = {
      cliente_nome: a.clientName,
      cliente_sobrenome: a.clientLastName,
      cliente_telefone: a.clientPhone,
      data: a.date,
      hora: a.time,
      servico_ids: a.serviceIds,
      valor_pago: totalPrice,
      valor_sinal: valorSinal,
      taxa_app: taxaApp,
      sinal_pago: false,
      eh_fracionado: !!fracInfo,
      fase1_duracao: fracInfo?.fase1 ?? null,
      espera_duracao: fracInfo?.espera ?? null,
      fase2_duracao: fracInfo?.fase2 ?? null,
    };
    if (a.clienteId) insertData.cliente_id = a.clienteId;
    if (promo) insertData.barbeiro_nome = (a.barbeiroNome ? a.barbeiroNome + ' • ' : '') + 'Promoção: ' + promo.titulo;
    else if (a.barbeiroNome) insertData.barbeiro_nome = a.barbeiroNome;
    if (a.barbeiroId) insertData.barbeiro_id = a.barbeiroId;

    // cliente_telefone is not selectable via the Data API anymore; return the
    // other columns and reuse the locally-known phone for the optimistic state.
    const { data, error } = await supabase.from('agendamentos').insert(insertData).select(
      'id, created_at, cliente_nome, cliente_sobrenome, data, hora, servico_ids, status, cliente_id, valor_pago, barbeiro_id, barbeiro_nome, arquivado, sinal_pago, valor_sinal, taxa_app, comprovante_url, pix_gerado_em, eh_fracionado, fase1_duracao, espera_duracao, fase2_duracao'
    ).single();

    // Anti-duplicidade: horário tomado por outra reserva em paralelo
    if (error && (error.code === '23505' || /j.? foi reservado|acabou de ser reservado/i.test(error.message || ''))) {
      const conflict = new Error('Este horário acabou de ser reservado. Escolha outro horário.');
      (conflict as any).code = 'SLOT_TAKEN';
      throw conflict;
    }

    if (data && !error) {
      const d: any = data;
      const newAppt: Appointment = {
        id: d.id,
        clientName: d.cliente_nome,
        clientLastName: d.cliente_sobrenome,
        clientPhone: a.clientPhone,
        date: d.data,
        time: d.hora,
        serviceIds: d.servico_ids,
        status: d.status as Appointment['status'],
        createdAt: d.created_at,
        clienteId: d.cliente_id,
        valorPago: Number(d.valor_pago) || 0,
        barbeiroNome: d.barbeiro_nome || undefined,
        barbeiroId: d.barbeiro_id || undefined,
        sinalPago: d.sinal_pago || false,
        valorSinal: Number(d.valor_sinal) || 0,
        taxaApp: Number(d.taxa_app) || 3,
        ehFracionado: !!d.eh_fracionado,
        fase1Duracao: d.fase1_duracao ?? undefined,
        esperaDuracao: d.espera_duracao ?? undefined,
        fase2Duracao: d.fase2_duracao ?? undefined,
      };
      setAppointments(prev => [newAppt, ...prev]);
      setNewAppointmentAlert(newAppt);
      return newAppt;
    }
    return null;
  }, [services]);

  const confirmAppointment = useCallback(async (id: string) => {
    await supabase.from('agendamentos').update({ status: 'confirmed', sinal_pago: true } as any).eq('id', id);
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'confirmed', sinalPago: true } : a));
  }, []);

  const cancelAppointment = useCallback(async (id: string) => {
    await supabase.from('agendamentos').update({ status: 'cancelled' }).eq('id', id);
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'cancelled' as const } : a));
  }, []);

  const finishAppointment = useCallback(async (id: string, valorPago?: number, barbeiroNome?: string) => {
    const updateData: any = { status: 'finalizado' };
    if (valorPago !== undefined) updateData.valor_pago = valorPago;
    if (barbeiroNome) updateData.barbeiro_nome = barbeiroNome;
    await supabase.from('agendamentos').update(updateData).eq('id', id);
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'finalizado' as const, valorPago: valorPago ?? a.valorPago, barbeiroNome: barbeiroNome ?? a.barbeiroNome } : a));
  }, []);

  const deleteAppointment = useCallback(async (id: string) => {
    const { error } = await supabase.from('agendamentos').delete().eq('id', id);
    if (error) {
      // Fallback: if hard delete is blocked, archive + cancel so it disappears from lists.
      await supabase.from('agendamentos').update({ status: 'cancelled', arquivado: true } as any).eq('id', id);
    }
    setAppointments(prev => prev.filter(a => a.id !== id));
  }, []);



  const blockSlot = useCallback(async (date: string, time: string, reason?: string) => {
    const { data, error } = await supabase.from('horarios_bloqueados').insert({
      data: date,
      hora: time,
      motivo: reason ?? null,
    }).select().single();
    if (data && !error) {
      setBlockedSlots(prev => [...prev, { id: data.id, date: data.data, time: data.hora, reason: data.motivo ?? undefined }]);
    }
  }, []);

  const unblockSlot = useCallback(async (id: string) => {
    await supabase.from('horarios_bloqueados').delete().eq('id', id);
    setBlockedSlots(prev => prev.filter(s => s.id !== id));
  }, []);

  const timeToMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  // Retorna lista de intervalos ocupados [start, end) por um agendamento.
  // Para agendamentos fracionados, retorna DOIS intervalos (fase1 e fase2), deixando o meio livre.
  const apptBusyIntervals = useCallback((a: Appointment): [number, number][] => {
    const start = timeToMinutes(a.time);
    if (a.ehFracionado && a.fase1Duracao && a.fase2Duracao) {
      const f1End = start + a.fase1Duracao;
      const f2Start = f1End + (a.esperaDuracao || 0);
      const f2End = f2Start + a.fase2Duracao;
      return [[start, f1End], [f2Start, f2End]];
    }
    const totalDuration = a.serviceIds.reduce((sum, id) => {
      const svc = services.find(s => s.id === id);
      return sum + (svc?.duration || settings.slotDuration);
    }, 0);
    return [[start, start + totalDuration]];
  }, [services, settings.slotDuration]);

  const isSlotAvailable = useCallback((date: string, time: string) => {
    const isBlocked = blockedSlots.some(s => s.date === date && s.time === time);
    if (isBlocked) return false;
    const slotMinutes = timeToMinutes(time);
    return !appointments.some(a => {
      if (a.date !== date || a.status === 'cancelled') return false;
      return apptBusyIntervals(a).some(([s, e]) => slotMinutes >= s && slotMinutes < e);
    });
  }, [blockedSlots, appointments, apptBusyIntervals]);

  const isSlotAvailableForBarber = useCallback((date: string, time: string, barberId: string) => {
    const isBlocked = blockedSlots.some(s => s.date === date && s.time === time);
    if (isBlocked) return false;
    const slotMinutes = timeToMinutes(time);
    return !appointments.some(a => {
      if (a.date !== date || a.status === 'cancelled') return false;
      if (a.barbeiroId !== barberId) return false;
      return apptBusyIntervals(a).some(([s, e]) => slotMinutes >= s && slotMinutes < e);
    });
  }, [blockedSlots, appointments, apptBusyIntervals]);

  // Verifica se um intervalo [startTime, startTime+durationMinutes) está livre para o barbeiro.
  // Considera sobreposição com QUALQUER intervalo ocupado (incluindo fase1/fase2 de fracionados).
  const isRangeAvailableForBarber = useCallback((date: string, startTime: string, durationMinutes: number, barberId: string) => {
    const reqStart = timeToMinutes(startTime);
    const reqEnd = reqStart + durationMinutes;
    // Bloqueios manuais: verifica qualquer slot bloqueado dentro do range
    for (const b of blockedSlots) {
      if (b.date !== date) continue;
      const bs = timeToMinutes(b.time);
      if (bs >= reqStart && bs < reqEnd) return false;
    }
    return !appointments.some(a => {
      if (a.date !== date || a.status === 'cancelled') return false;
      if (a.barbeiroId !== barberId) return false;
      return apptBusyIntervals(a).some(([s, e]) => reqStart < e && reqEnd > s);
    });
  }, [blockedSlots, appointments, apptBusyIntervals]);

  const getTimeSlots = useCallback((date: string) => {
    const slots: string[] = [];
    const dateObj = new Date(date + 'T00:00:00');
    if (!settings.workDays.includes(dateObj.getDay())) return slots;

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isToday = date === today;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (let h = settings.startHour; h < settings.endHour; h++) {
      for (let m = 0; m < 60; m += settings.slotDuration) {
        const slotMinutes = h * 60 + m;
        // Skip past slots for today
        if (isToday && slotMinutes <= currentMinutes) continue;
        slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
      }
    }
    return slots;
  }, [settings]);

  const clearAlert = useCallback(() => setNewAppointmentAlert(null), []);

  const refreshAppointments = useCallback(async () => {
    const today = new Date();
    const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const [busyRes, fullRes] = await Promise.all([
      supabase.rpc('get_busy_slots', { _data_inicio: startDate, _dias: 60 }),
      supabase.rpc('list_agendamentos_full'),
    ]);
    const fullById = new Map<string, any>();
    (fullRes.data || []).forEach((a: any) => fullById.set(a.id, a));
    const mapFull = (full: any): Appointment => ({
      id: full.id, clientName: full.cliente_nome, clientLastName: full.cliente_sobrenome,
      clientPhone: full.cliente_telefone, date: full.data, time: full.hora,
      serviceIds: full.servico_ids, status: full.status, createdAt: full.created_at,
      clienteId: full.cliente_id, valorPago: Number(full.valor_pago) || 0,
      barbeiroNome: full.barbeiro_nome || undefined, barbeiroId: full.barbeiro_id || undefined,
      arquivado: full.arquivado || false, sinalPago: full.sinal_pago || false,
      valorSinal: Number(full.valor_sinal) || 0, taxaApp: Number(full.taxa_app) || 3,
      comprovanteUrl: full.comprovante_url || undefined,
    });
    const merged: Appointment[] = [];
    (busyRes.data || []).forEach((b: any) => {
      const full = fullById.get(b.id);
      if (full) { merged.push(mapFull(full)); fullById.delete(b.id); }
      else merged.push({
        id: b.id, clientName: '', clientLastName: '', clientPhone: '',
        date: b.data, time: b.hora, serviceIds: b.servico_ids || [],
        status: b.status, createdAt: '', barbeiroId: b.barbeiro_id || undefined,
        arquivado: b.arquivado || false,
      });
    });
    fullById.forEach((full: any) => merged.push(mapFull(full)));
    setAppointments(merged);
  }, []);

  const getBarberSettings = useCallback(async (barberId: string): Promise<BusinessSettings> => {
    const { data } = await supabase.from('configuracoes_barbeiro').select('*').eq('barbeiro_id', barberId).single();
    if (data) {
      const bs: BusinessSettings = {
        shopName: settings.shopName,
        startHour: (data as any).hora_inicio,
        endHour: (data as any).hora_fim,
        workDays: (data as any).dias_funcionamento,
        slotDuration: (data as any).duracao_slot,
        closedTodayDate: (data as any).fechado_hoje_data ?? null,
        closedTodayTime: (data as any).fechado_hoje_hora ?? null,
        sameDayCutoffHour: (data as any).limite_agendamento_hora ?? null,
      };
      setBarberSettingsCache(prev => ({ ...prev, [barberId]: bs }));
      return bs;
    }
    return settings;
  }, [settings]);

  const saveBarberSettings = useCallback(async (barberId: string, s: Partial<BusinessSettings>) => {
    const updates: any = {};
    if (s.startHour !== undefined) updates.hora_inicio = s.startHour;
    if (s.endHour !== undefined) updates.hora_fim = s.endHour;
    if (s.workDays !== undefined) updates.dias_funcionamento = s.workDays;
    if (s.slotDuration !== undefined) updates.duracao_slot = s.slotDuration;
    if (s.closedTodayDate !== undefined) updates.fechado_hoje_data = s.closedTodayDate;
    if (s.closedTodayTime !== undefined) updates.fechado_hoje_hora = s.closedTodayTime;
    if (s.sameDayCutoffHour !== undefined) updates.limite_agendamento_hora = s.sameDayCutoffHour;
    updates.updated_at = new Date().toISOString();

    const { data: existing } = await supabase.from('configuracoes_barbeiro').select('id').eq('barbeiro_id', barberId).single();
    if (existing) {
      await supabase.from('configuracoes_barbeiro').update(updates).eq('barbeiro_id', barberId);
    } else {
      await supabase.from('configuracoes_barbeiro').insert({ barbeiro_id: barberId, ...updates } as any);
    }
    const full = await getBarberSettings(barberId);
    setBarberSettingsCache(prev => ({ ...prev, [barberId]: { ...full, ...s } }));
  }, [getBarberSettings]);

  const getTimeSlotsForBarber = useCallback(async (date: string, barberId: string): Promise<string[]> => {
    const bs = await getBarberSettings(barberId);
    const slots: string[] = [];
    const dateObj = new Date(date + 'T00:00:00');
    if (!bs.workDays.includes(dateObj.getDay())) return slots;

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isToday = date === today;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Same-day booking cutoff: after this hour, no more same-day bookings
    if (isToday && bs.sameDayCutoffHour != null && now.getHours() >= bs.sameDayCutoffHour) {
      return slots;
    }

    // Manual early close: if today is closed from a specific time, skip slots at/after it
    let manualCloseMin: number | null = null;
    if (isToday && bs.closedTodayDate === today && bs.closedTodayTime) {
      const [ch, cm] = bs.closedTodayTime.split(':').map(Number);
      manualCloseMin = ch * 60 + (cm || 0);
    }

    for (let h = bs.startHour; h < bs.endHour; h++) {
      for (let m = 0; m < 60; m += bs.slotDuration) {
        const slotMinutes = h * 60 + m;
        if (isToday && slotMinutes <= currentMinutes) continue;
        if (manualCloseMin != null && slotMinutes >= manualCloseMin) continue;
        slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
      }
    }
    return slots;
  }, [getBarberSettings]);

  return (
    <BarbershopContext.Provider value={{
      settings, services, appointments, blockedSlots,
      newAppointmentAlert, clearAlert, loading,
      updateSettings, addService, updateService, deleteService,
      addAppointment, confirmAppointment, cancelAppointment, finishAppointment, deleteAppointment,
      blockSlot, unblockSlot,
      isSlotAvailable, isSlotAvailableForBarber, isRangeAvailableForBarber, getTimeSlots, refreshAppointments,
      getTimeSlotsForBarber, getBarberSettings, saveBarberSettings, barberSettingsCache,
    }}>
      {children}
    </BarbershopContext.Provider>
  );
}

export function useBarbershop() {
  const ctx = useContext(BarbershopContext);
  if (!ctx) throw new Error('useBarbershop must be inside BarbershopProvider');
  return ctx;
}
