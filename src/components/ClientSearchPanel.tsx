import { useState, useEffect, useMemo } from 'react';
import { Search, X, MessageCircle, Clock, Calendar, CheckCircle, ChevronDown, ChevronUp, Scissors, Unlink, Link, Pencil, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBarbershop } from '@/contexts/BarbershopContext';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface SearchResult {
  id: string;
  full_name: string | null;
  telefone: string | null;
  avatar_url: string | null;
  vinculo_em?: string | null;
}

// Cliente novo = vinculado ao barbeiro nos últimos 7 dias
const isNewClient = (vinculoEm?: string | null) => {
  if (!vinculoEm) return false;
  const diff = Date.now() - new Date(vinculoEm).getTime();
  return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
};

interface ClientDetail {
  profile: SearchResult;
  lastVisit: { date: string; services: string } | null;
  nextAppointment: { date: string; time: string } | null;
  totalVisits: number;
  history: Array<{ id: string; date: string; time: string; services: string; valor: number }>;
  linkedBarberId: string | null;
  linkedBarberName: string | null;
}

export default function ClientSearchPanel() {
  const { services, settings, appointments } = useBarbershop();
  const { user, role, shopDisplayName } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<ClientDetail | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  // CEO edit states
  const [availableBarbers, setAvailableBarbers] = useState<{ user_id: string; display_name: string }[]>([]);
  const [showRelinkPicker, setShowRelinkPicker] = useState(false);
  const [editingClient, setEditingClient] = useState(false);
  const [editClientName, setEditClientName] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [savingClient, setSavingClient] = useState(false);

  // For admins, filter appointments by their barberId
  const filteredAppointments = useMemo(() => {
    if (role === 'ceo') return appointments;
    if (role === 'admin' && user?.id) {
      return appointments.filter(a => a.barbeiroId === user.id);
    }
    return appointments;
  }, [appointments, role, user?.id]);

  // Load all clients for dropdown - RLS handles filtering for admins
  const loadAllClients = async () => {
    setSearching(true);
    
    if (role === 'admin' && user?.id) {
      // For admins: get clients from their appointments (since profiles RLS filters by adm_responsavel_id)
      const phoneSet = new Set<string>();
      const clientResults: SearchResult[] = [];
      
      filteredAppointments.forEach(a => {
        const phone = a.clientPhone.replace(/\D/g, '');
        if (!phoneSet.has(phone)) {
          phoneSet.add(phone);
          clientResults.push({
            id: a.clienteId || `appt-${phone}`,
            full_name: `${a.clientName} ${a.clientLastName}`,
            telefone: a.clientPhone,
            avatar_url: null,
          });
        }
      });
      
      // Also try profiles (RLS will filter)
      const { data } = await supabase.from('profiles').select('id, full_name, telefone, avatar_url, vinculo_em').order('full_name').limit(50);
      if (data) {
        const seenIds = new Set(clientResults.map(c => c.id));
        data.forEach(p => {
          if (!seenIds.has(p.id)) {
            clientResults.push({ id: p.id, full_name: p.full_name, telefone: p.telefone, avatar_url: p.avatar_url, vinculo_em: (p as any).vinculo_em });
          }
        });
      }
      
      setResults(clientResults);
    } else {
      // CEO sees all
      const { data } = await supabase.from('profiles').select('id, full_name, telefone, avatar_url, vinculo_em').order('full_name').limit(50);
      setResults((data || []).map(p => ({ id: p.id, full_name: p.full_name, telefone: p.telefone, avatar_url: p.avatar_url, vinculo_em: (p as any).vinculo_em })));
    }
    
    setSearching(false);
  };

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 1) {
      if (!dropdownOpen) setResults([]);
      return;
    }

    setDropdownOpen(true);
    const timeout = setTimeout(async () => {
      setSearching(true);
      const isPhone = /\d/.test(query);
      
      // Search profiles (RLS handles admin filtering)
      let profileQuery = supabase.from('profiles').select('id, full_name, telefone, avatar_url, vinculo_em');
      if (isPhone) {
        profileQuery = profileQuery.ilike('telefone', `%${query.replace(/\D/g, '')}%`);
      } else {
        profileQuery = profileQuery.ilike('full_name', `%${query}%`);
      }
      const { data } = await profileQuery.limit(10);
      
      // Also search from appointments (filtered by barber for admins)
      const q = query.toLowerCase();
      const apptResults: SearchResult[] = [];
      const seenPhones = new Set((data || []).map(p => p.telefone?.replace(/\D/g, '')));
      
      filteredAppointments.forEach(a => {
        const phone = a.clientPhone.replace(/\D/g, '');
        if (seenPhones.has(phone)) return;
        
        const matches = isPhone
          ? phone.includes(query.replace(/\D/g, ''))
          : `${a.clientName} ${a.clientLastName}`.toLowerCase().includes(q);
        
        if (matches) {
          seenPhones.add(phone);
          apptResults.push({
            id: a.clienteId || `appt-${phone}`,
            full_name: `${a.clientName} ${a.clientLastName}`,
            telefone: a.clientPhone,
            avatar_url: null,
          });
        }
      });

      const profileResults: SearchResult[] = (data || []).map(p => ({
        id: p.id,
        full_name: p.full_name,
        telefone: p.telefone,
        avatar_url: p.avatar_url,
        vinculo_em: (p as any).vinculo_em,
      }));

      setResults([...profileResults, ...apptResults]);
      setSearching(false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [query, filteredAppointments]);

  const handleToggleDropdown = () => {
    if (dropdownOpen) {
      setDropdownOpen(false);
      setResults([]);
    } else {
      setDropdownOpen(true);
      if (!query.trim()) loadAllClients();
    }
  };

  const loadClientDetail = async (client: SearchResult) => {
    setLoadingDetail(true);
    setShowHistory(false);
    setEditingClient(false);
    setShowRelinkPicker(false);

    // Use filtered appointments for this client
    let clientAppts;
    if (client.id.startsWith('appt-')) {
      const phone = client.telefone?.replace(/\D/g, '') || '';
      clientAppts = filteredAppointments.filter(a => a.clientPhone.replace(/\D/g, '').includes(phone));
    } else {
      clientAppts = filteredAppointments.filter(a => a.clienteId === client.id);
      // Also check by phone if no results
      if (clientAppts.length === 0 && client.telefone) {
        const phone = client.telefone.replace(/\D/g, '');
        clientAppts = filteredAppointments.filter(a => a.clientPhone.replace(/\D/g, '') === phone);
      }
    }

    clientAppts.sort((a, b) => b.date.localeCompare(a.date));

    const today = format(new Date(), 'yyyy-MM-dd');

    const lastFinished = clientAppts.find(a => a.status === 'finalizado');
    const lastVisit = lastFinished ? {
      date: lastFinished.date,
      services: (lastFinished.serviceIds || [])
        .map((id: string) => services.find(s => s.id === id)?.name)
        .filter(Boolean)
        .join(', ') || 'Serviço',
    } : null;

    const nextAppt = clientAppts.find(a =>
      ['pending', 'confirmed'].includes(a.status) && a.date >= today
    );
    const nextAppointment = nextAppt ? {
      date: nextAppt.date,
      time: nextAppt.time,
    } : null;

    const totalVisits = clientAppts.filter(a => a.status === 'finalizado').length;

    const history = clientAppts
      .filter(a => a.status === 'finalizado')
      .map(a => ({
        id: a.id,
        date: a.date,
        time: a.time,
        services: (a.serviceIds || [])
          .map((id: string) => services.find(s => s.id === id)?.name)
          .filter(Boolean)
          .join(', ') || 'Serviço',
        valor: Number(a.valorPago) || 0,
      }));

    // Fetch linked barber info (for CEO)
    let linkedBarberId: string | null = null;
    let linkedBarberName: string | null = null;
    if (!client.id.startsWith('appt-')) {
      const { data: profileData } = await supabase.from('profiles').select('adm_responsavel_id').eq('id', client.id).single();
      if (profileData?.adm_responsavel_id) {
        linkedBarberId = profileData.adm_responsavel_id;
        const { data: nameData } = await supabase.rpc('get_barber_name', { _barber_id: profileData.adm_responsavel_id });
        if (nameData) linkedBarberName = nameData;
      }
    }

    setSelectedDetail({
      profile: client,
      lastVisit,
      nextAppointment,
      totalVisits,
      history,
      linkedBarberId,
      linkedBarberName,
    });
    setLoadingDetail(false);
    setResults([]);
    setQuery('');
  };

  const handleUnlinkBarber = async () => {
    if (!selectedDetail || selectedDetail.profile.id.startsWith('appt-')) return;
    const { error } = await supabase.from('profiles').update({ adm_responsavel_id: null }).eq('id', selectedDetail.profile.id);
    if (error) { toast.error('Erro ao desvincular'); return; }
    toast.success('Cliente desvinculado do barbeiro!');
    setSelectedDetail(prev => prev ? { ...prev, linkedBarberId: null, linkedBarberName: null } : null);
  };

  const handleRelinkBarber = async (barberId: string, barberName: string) => {
    if (!selectedDetail || selectedDetail.profile.id.startsWith('appt-')) return;
    const { error } = await supabase.from('profiles').update({ adm_responsavel_id: barberId }).eq('id', selectedDetail.profile.id);
    if (error) { toast.error('Erro ao vincular'); return; }
    toast.success(`Cliente vinculado a ${barberName}!`);
    setSelectedDetail(prev => prev ? { ...prev, linkedBarberId: barberId, linkedBarberName: barberName } : null);
    setShowRelinkPicker(false);
  };

  const handleSaveClientEdit = async () => {
    if (!selectedDetail || selectedDetail.profile.id.startsWith('appt-')) return;
    setSavingClient(true);
    const { error } = await supabase.from('profiles').update({
      full_name: editClientName,
      telefone: editClientPhone,
    }).eq('id', selectedDetail.profile.id);
    if (error) { toast.error('Erro ao salvar'); setSavingClient(false); return; }
    toast.success('Cliente atualizado!');
    setSelectedDetail(prev => prev ? {
      ...prev,
      profile: { ...prev.profile, full_name: editClientName, telefone: editClientPhone }
    } : null);
    setEditingClient(false);
    setSavingClient(false);
  };

  const loadBarbersList = async () => {
    const { data } = await supabase.rpc('get_barbers');
    if (data) setAvailableBarbers(data);
  };

  const getWhatsAppLink = (phone: string, name: string) => {
    const digits = phone.replace(/\D/g, '');
    const brPhone = digits.startsWith('55') ? digits : `55${digits}`;
    const msg = encodeURIComponent(`Olá ${name}, aqui é da ${shopDisplayName}! Tudo bem? 😊`);
    return `https://wa.me/${brPhone}?text=${msg}`;
  };

  return (
    <div className="px-4 mb-4">
      {/* Search Bar */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder="Buscar cliente por nome ou telefone..."
          value={query}
          onChange={e => { setQuery(e.target.value); setSelectedDetail(null); }}
          onFocus={() => { if (!query.trim()) { setDropdownOpen(true); loadAllClients(); } }}
          className="vintage-input w-full pl-10 pr-16 py-3 rounded-lg text-sm"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); setDropdownOpen(false); }} className="text-muted-foreground p-1">
              <X size={16} />
            </button>
          )}
          <button onClick={handleToggleDropdown} className="text-muted-foreground p-1">
            {dropdownOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Dropdown Results */}
      {dropdownOpen && results.length > 0 && (
        <div className="wood-card mt-1 max-h-60 overflow-y-auto divide-y divide-border/20 rounded-lg">
          {results.map(client => (
            <button
              key={client.id}
              onClick={() => { loadClientDetail(client); setDropdownOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
                {client.avatar_url ? (
                  <img src={client.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-muted-foreground text-sm font-heading">
                    {(client.full_name || '?')[0]}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-foreground text-sm font-medium truncate flex items-center gap-1.5">
                  {client.full_name || 'Sem nome'}
                  {isNewClient(client.vinculo_em) && (
                    <span className="text-[9px] uppercase tracking-wider bg-accent/20 text-accent px-1.5 py-0.5 rounded-full flex-shrink-0">Novo</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{client.telefone || 'Sem telefone'}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {searching && query.length >= 2 && results.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-3">Buscando...</p>
      )}

      {!searching && query.length >= 2 && results.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-3">Nenhum cliente encontrado</p>
      )}

      {/* Client Detail Card */}
      {selectedDetail && (
        <div className="wood-card mt-3 px-4 py-4 space-y-3 border border-primary/20 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted border-2 border-primary flex items-center justify-center overflow-hidden">
                {selectedDetail.profile.avatar_url ? (
                  <img src={selectedDetail.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-muted-foreground text-lg font-heading">
                    {(selectedDetail.profile.full_name || '?')[0]}
                  </span>
                )}
              </div>
              <div>
                <p className="font-heading text-base text-primary flex items-center gap-1.5">
                  {selectedDetail.profile.full_name}
                  {isNewClient(selectedDetail.profile.vinculo_em) && (
                    <span className="text-[9px] uppercase tracking-wider bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">Cliente novo</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{selectedDetail.profile.telefone}</p>
              </div>
            </div>
            <button onClick={() => setSelectedDetail(null)} className="text-muted-foreground">
              <X size={18} />
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center py-2 rounded-lg bg-muted/30">
              <CheckCircle size={16} className="mx-auto text-primary mb-1" />
              <p className="font-heading text-lg text-foreground">{selectedDetail.totalVisits}</p>
              <p className="text-[10px] text-muted-foreground">Visitas</p>
            </div>
            <div className="text-center py-2 rounded-lg bg-muted/30">
              <Clock size={16} className="mx-auto text-accent mb-1" />
              <p className="text-xs text-foreground font-medium mt-1">
                {selectedDetail.lastVisit
                  ? format(new Date(selectedDetail.lastVisit.date + 'T12:00:00'), 'dd/MM', { locale: ptBR })
                  : '—'}
              </p>
              <p className="text-[10px] text-muted-foreground">Última</p>
            </div>
            <div className="text-center py-2 rounded-lg bg-muted/30">
              <Calendar size={16} className="mx-auto mb-1" style={{ color: 'hsl(142, 40%, 50%)' }} />
              <p className="text-xs text-foreground font-medium mt-1">
                {selectedDetail.nextAppointment
                  ? format(new Date(selectedDetail.nextAppointment.date + 'T12:00:00'), 'dd/MM', { locale: ptBR })
                  : '—'}
              </p>
              <p className="text-[10px] text-muted-foreground">Próximo</p>
            </div>
          </div>

          {/* Linked Barber Info (CEO) */}
          {role === 'ceo' && !selectedDetail.profile.id.startsWith('appt-') && (
            <div className="wood-card px-3 py-2 space-y-2 border border-border/30">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Scissors size={13} className="text-primary/70" />
                  <span className="text-foreground font-medium">
                    {selectedDetail.linkedBarberName || 'Sem barbeiro vinculado'}
                  </span>
                </p>
                <div className="flex items-center gap-1">
                  {selectedDetail.linkedBarberId && (
                    <button
                      onClick={() => { if (confirm('Desvincular este cliente do barbeiro?')) handleUnlinkBarber(); }}
                      className="text-destructive p-1 rounded hover:bg-destructive/10"
                      title="Desvincular"
                    >
                      <Unlink size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => { setShowRelinkPicker(!showRelinkPicker); if (!showRelinkPicker) loadBarbersList(); }}
                    className="text-primary p-1 rounded hover:bg-primary/10"
                    title={selectedDetail.linkedBarberId ? 'Trocar barbeiro' : 'Vincular barbeiro'}
                  >
                    <Link size={14} />
                  </button>
                </div>
              </div>
              {showRelinkPicker && (
                <div className="space-y-1">
                  {availableBarbers.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">Nenhum barbeiro disponível</p>
                  ) : availableBarbers.map(b => (
                    <button
                      key={b.user_id}
                      onClick={() => handleRelinkBarber(b.user_id, b.display_name)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                        b.user_id === selectedDetail.linkedBarberId ? 'bg-primary/20 text-primary' : 'hover:bg-muted/30 text-foreground'
                      }`}
                    >
                      <Scissors size={12} className="text-primary" />
                      {b.display_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CEO Edit Client Info */}
          {role === 'ceo' && !selectedDetail.profile.id.startsWith('appt-') && (
            editingClient ? (
              <div className="space-y-2">
                <input
                  value={editClientName}
                  onChange={e => setEditClientName(e.target.value)}
                  placeholder="Nome completo"
                  className="vintage-input w-full px-3 py-2 rounded-lg text-sm"
                />
                <input
                  value={editClientPhone}
                  onChange={e => {
                    let v = e.target.value.replace(/\D/g, '').slice(0, 11);
                    if (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
                    else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
                    else if (v.length > 0) v = `(${v}`;
                    setEditClientPhone(v);
                  }}
                  placeholder="Telefone"
                  className="vintage-input w-full px-3 py-2 rounded-lg text-sm"
                />
                <div className="flex gap-2">
                  <button onClick={() => setEditingClient(false)} className="flex-1 py-1.5 rounded-lg text-sm border border-muted-foreground/30 text-muted-foreground flex items-center justify-center gap-1">
                    <X size={12} /> Cancelar
                  </button>
                  <button onClick={handleSaveClientEdit} disabled={savingClient || !editClientName} className="vintage-btn flex-1 py-1.5 rounded-lg text-sm flex items-center justify-center gap-1 disabled:opacity-40">
                    <Save size={12} /> {savingClient ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setEditClientName(selectedDetail.profile.full_name || '');
                  setEditClientPhone(selectedDetail.profile.telefone || '');
                  setEditingClient(true);
                }}
                className="text-xs text-primary flex items-center gap-1"
              >
                <Pencil size={12} /> Editar dados do cliente
              </button>
            )
          )}

          {/* Last Visit Detail */}
          {selectedDetail.lastVisit && (
            <div className="text-sm text-muted-foreground">
              <span className="text-foreground font-medium">Último corte:</span>{' '}
              {format(new Date(selectedDetail.lastVisit.date + 'T12:00:00'), "dd 'de' MMMM", { locale: ptBR })} — {selectedDetail.lastVisit.services}
            </div>
          )}
          {!selectedDetail.lastVisit && (
            <p className="text-sm text-muted-foreground italic">Nenhum histórico encontrado</p>
          )}

          {/* Next Appointment */}
          {selectedDetail.nextAppointment && (
            <div className="text-sm px-3 py-2 rounded-lg bg-accent/10 text-accent">
              📅 Agendado para: {format(new Date(selectedDetail.nextAppointment.date + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })} às {selectedDetail.nextAppointment.time}
            </div>
          )}
          {!selectedDetail.nextAppointment && (
            <p className="text-sm text-muted-foreground">Sem horário marcado</p>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {selectedDetail.profile.telefone && (
              <a
                href={getWhatsAppLink(selectedDetail.profile.telefone, selectedDetail.profile.full_name || '')}
                target="_blank"
                rel="noopener noreferrer"
                className="vintage-btn flex-1 py-2 rounded-lg flex items-center justify-center gap-2 text-sm"
                style={{ background: 'hsl(142, 40%, 25%)' }}
              >
                <MessageCircle size={16} /> WhatsApp
              </a>
            )}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="vintage-btn flex-1 py-2 rounded-lg flex items-center justify-center gap-2 text-sm"
            >
              {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              Histórico
            </button>
          </div>

          {/* Full History */}
          {showHistory && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {selectedDetail.history.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3">Nenhum atendimento concluído</p>
              )}
              {selectedDetail.history.map(h => (
                <div key={h.id} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0">
                  <div>
                    <p className="text-sm text-foreground">
                      {format(new Date(h.date + 'T12:00:00'), 'dd/MM/yyyy')} às {h.time}
                    </p>
                    <p className="text-xs text-muted-foreground">{h.services}</p>
                  </div>
                  <span className="font-heading text-sm text-primary">R$ {h.valor.toFixed(2)}</span>
                </div>
              ))}
              {selectedDetail.history.length > 0 && (
                <div className="flex justify-between pt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground font-medium">Total gasto</span>
                  <span className="font-heading text-primary">
                    R$ {selectedDetail.history.reduce((s, h) => s + h.valor, 0).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
