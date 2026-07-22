import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ArrowLeft, Send, MessageCircle, Check, CheckCheck, Search, Trash2, Archive, ArchiveRestore, Lock, UserPlus } from 'lucide-react';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useBarbershop } from '@/contexts/BarbershopContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface Message {
  id: string;
  remetente_id: string;
  destinatario_id: string;
  conteudo: string;
  lida: boolean;
  entregue?: boolean;
  created_at: string;
}

export default function ChatPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toParam = searchParams.get('to');
  const nameParam = searchParams.get('name');
  const { user, role, barberId: linkedBarberId } = useAuth();
  const { settings } = useBarbershop();
  const qc = useQueryClient();

  const isBarberOnline = useMemo(() => {
    if (!settings) return false;
    const now = new Date();
    return settings.workDays.includes(now.getDay()) && now.getHours() >= settings.startHour && now.getHours() < settings.endHour;
  }, [settings]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [chatPartnerId, setChatPartnerId] = useState<string | null>(null);
  const [clientList, setClientList] = useState<{ id: string; name: string; unread: number; lastMessage?: string; lastDate?: string; lastOutStatus?: 'sent' | 'delivered' | 'read' | 'none' }[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread' | 'delivered' | 'read'>('all');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set());
  const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Barber (admin) sees client list. Anyone else with a linkedBarberId chats with that barber.
  const isAdmin = (role === 'admin' || role === 'ceo') && (!linkedBarberId || linkedBarberId === user?.id);

  const { pullRefreshProps: chatListPullProps, PullIndicator: ChatListPullIndicator } = usePullRefresh({
    onRefresh: useCallback(async () => { await loadClientChats(); }, []),
  });

  // Load archived chats
  useEffect(() => {
    if (!user) return;
    supabase.from('chats_arquivados').select('partner_id').eq('user_id', user.id)
      .then(({ data }) => {
        if (data) setArchivedIds(new Set(data.map(d => d.partner_id)));
      });
  }, [user]);

  // Determine chat partner
  useEffect(() => {
    if (!user) return;
    if (isAdmin) {
      loadClientChats();
      // Carrega todos os clientes vinculados ao barbeiro para autocomplete
      supabase.from('profiles').select('id, full_name').eq('adm_responsavel_id', user.id)
        .then(({ data }) => {
          if (data) setAllClients(data.map(d => ({ id: d.id, name: d.full_name || 'Cliente' })));
        });
    } else if (linkedBarberId) {
      setChatPartnerId(linkedBarberId);
      supabase.rpc('get_barber_name', { _barber_id: linkedBarberId }).then(({ data }) => {
        if (data) setPartnerName(data);
      });
    }
  }, [user, linkedBarberId, role]);

  // Abrir conversa direta via ?to=<id> (ex.: combinar entrega após compra no marketplace)
  useEffect(() => {
    if (!user || !toParam) return;
    setSelectedClientId(toParam);
    setChatPartnerId(toParam);
    if (nameParam) {
      setPartnerName(nameParam);
    } else {
      supabase.rpc('get_barber_name', { _barber_id: toParam }).then(({ data }) => {
        if (data) setPartnerName(data);
      });
    }
  }, [user, toParam, nameParam]);

  const loadClientChats = async () => {
    if (!user) return;
    const { data: msgs } = await supabase
      .from('mensagens')
      .select('id, remetente_id, destinatario_id, lida, entregue, conteudo, created_at, apagada_remetente, apagada_destinatario')
      .or(`remetente_id.eq.${user.id},destinatario_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (!msgs) return;

    const clientIds = new Set<string>();
    const unreadMap = new Map<string, number>();
    const lastMsgMap = new Map<string, { conteudo: string; created_at: string }>();
    const lastOutStatusMap = new Map<string, 'sent' | 'delivered' | 'read'>();

    msgs.forEach((m: any) => {
      const apagadaParaMim = m.remetente_id === user.id
        ? m.apagada_remetente
        : m.apagada_destinatario;
      if (apagadaParaMim) return;

      const otherId = m.remetente_id === user.id ? m.destinatario_id : m.remetente_id;
      if (!lastMsgMap.has(otherId)) {
        lastMsgMap.set(otherId, { conteudo: m.conteudo, created_at: m.created_at });
      }
      clientIds.add(otherId);
      if (m.destinatario_id === user.id && !m.lida) {
        unreadMap.set(m.remetente_id, (unreadMap.get(m.remetente_id) || 0) + 1);
      }
      // captura status da última msg enviada por mim para este contato
      if (m.remetente_id === user.id && !lastOutStatusMap.has(otherId)) {
        const status: 'sent' | 'delivered' | 'read' = m.lida ? 'read' : (m.entregue ? 'delivered' : 'sent');
        lastOutStatusMap.set(otherId, status);
      }
    });

    const clients: typeof clientList = [];
    for (const cid of clientIds) {
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', cid).single();
      const last = lastMsgMap.get(cid);
      clients.push({
        id: cid,
        name: profile?.full_name || 'Cliente',
        unread: unreadMap.get(cid) || 0,
        lastMessage: last?.conteudo,
        lastDate: last?.created_at,
        lastOutStatus: lastOutStatusMap.get(cid) || 'none',
      });
    }
    clients.sort((a, b) => b.unread - a.unread);
    setClientList(clients);
  };

  const selectClient = (clientId: string, clientName: string) => {
    setSelectedClientId(clientId);
    setChatPartnerId(clientId);
    setPartnerName(clientName);
  };

  const handleDeleteChat = async (partnerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !confirm('Apagar esta conversa para você? A mensagem permanece para o outro lado até que ele também apague.')) return;
    // soft-delete: marca como apagada para o lado correto
    await supabase.from('mensagens').update({ apagada_remetente: true } as any)
      .eq('remetente_id', user.id).eq('destinatario_id', partnerId);
    await supabase.from('mensagens').update({ apagada_destinatario: true } as any)
      .eq('remetente_id', partnerId).eq('destinatario_id', user.id);
    setClientList(prev => prev.filter(c => c.id !== partnerId));
    toast.success('Conversa apagada para você');
  };

  const handleArchiveChat = async (partnerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    const { error } = await supabase.from('chats_arquivados').insert({ user_id: user.id, partner_id: partnerId } as any);
    if (!error) {
      setArchivedIds(prev => new Set([...prev, partnerId]));
      toast.success('Conversa arquivada');
    }
  };

  const handleUnarchiveChat = async (partnerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    await supabase.from('chats_arquivados').delete().eq('user_id', user.id).eq('partner_id', partnerId);
    setArchivedIds(prev => {
      const n = new Set(prev);
      n.delete(partnerId);
      return n;
    });
    toast.success('Conversa desarquivada');
  };

  // Load messages when partner is set
  useEffect(() => {
    if (!user || !chatPartnerId) return;

    const loadMessages = async () => {
      const { data } = await supabase
        .from('mensagens')
        .select('*')
        .or(
          `and(remetente_id.eq.${user.id},destinatario_id.eq.${chatPartnerId}),and(remetente_id.eq.${chatPartnerId},destinatario_id.eq.${user.id})`
        )
        .order('created_at', { ascending: true });

      if (data) {
        const visible = (data as any[]).filter(m => {
          const apagadaParaMim = m.remetente_id === user.id ? m.apagada_remetente : m.apagada_destinatario;
          return !apagadaParaMim;
        });
        setMessages(visible as Message[]);
      }

      const { data: marked } = await supabase
        .from('mensagens')
        .update({ lida: true, lida_em: new Date().toISOString(), entregue: true } as any)
        .eq('remetente_id', chatPartnerId)
        .eq('destinatario_id', user.id)
        .eq('lida', false)
        .select('id');

      const n = marked?.length || 0;
      if (n > 0) {
        // Decrementa contador global IMEDIATAMENTE
        qc.setQueryData(['mensagens-unread', user.id], (old: number = 0) =>
          Math.max(0, (old || 0) - n)
        );
        qc.invalidateQueries({ queryKey: ['mensagens-unread', user.id] });
        qc.invalidateQueries({ queryKey: ['mensagens'] });
        // Zera badge da conversa na lista
        setClientList(prev => prev.map(c => c.id === chatPartnerId ? { ...c, unread: 0 } : c));
      }
    };

    loadMessages();

    const channel = supabase
      .channel(`chat-${chatPartnerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mensagens' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const msg = payload.new as Message;
            if (
              (msg.remetente_id === user.id && msg.destinatario_id === chatPartnerId) ||
              (msg.remetente_id === chatPartnerId && msg.destinatario_id === user.id)
            ) {
              setMessages(prev => {
                if (prev.some(m => m.id === msg.id)) return prev;
                return [...prev, msg];
              });
              if (msg.destinatario_id === user.id) {
                supabase.from('mensagens')
                  .update({ lida: true, entregue: true, lida_em: new Date().toISOString() } as any)
                  .eq('id', msg.id)
                  .then(() => {
            qc.setQueryData(['mensagens-unread', user.id], 0);
                    qc.invalidateQueries({ queryKey: ['mensagens-unread', user.id] });
                    loadClientChats();
                  });
                // Não incrementa contador global pois já estamos vendo
        qc.setQueryData(['mensagens-unread', user.id], 0);
              }
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Message;
            setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, lida: updated.lida, entregue: (updated as any).entregue } : m));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, chatPartnerId, qc]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || !chatPartnerId) return;
    setSending(true);
    const { error } = await supabase.from('mensagens').insert({
      remetente_id: user.id,
      destinatario_id: chatPartnerId,
      conteudo: newMessage.trim(),
    });
    if (!error) setNewMessage('');
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen pb-20 flex items-center justify-center">
        <p className="text-muted-foreground">Faça login para acessar o chat</p>
      </div>
    );
  }

  if (!isAdmin && !linkedBarberId && !toParam && !chatPartnerId) {
    return (
      <div className="min-h-screen pb-4">
        <div className="page-header flex items-center gap-3 px-4">
          <button onClick={() => navigate(-1)} className="text-primary"><ArrowLeft size={24} /></button>
          <h1 className="font-heading text-xl text-foreground">Chat</h1>
        </div>
        <div className="px-4 text-center py-12">
          <MessageCircle size={48} className="mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground text-sm">Vincule-se a um barbeiro para iniciar uma conversa</p>
        </div>
      </div>
    );
  }

  // Filter clients for display
  const filteredList = clientList.filter(c => {
    const isArchived = archivedIds.has(c.id);
    if (showArchived) return isArchived;
    return !isArchived;
  }).filter(c => {
    if (filter === 'unread') return c.unread > 0;
    if (filter === 'delivered') return c.lastOutStatus === 'delivered';
    if (filter === 'read') return c.lastOutStatus === 'read';
    return true;
  }).filter(c => {
    if (!searchQuery.trim()) return true;
    return c.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const totalUnread = clientList.filter(c => !archivedIds.has(c.id) && c.unread > 0).length;
  const totalDelivered = clientList.filter(c => !archivedIds.has(c.id) && c.lastOutStatus === 'delivered').length;
  const totalRead = clientList.filter(c => !archivedIds.has(c.id) && c.lastOutStatus === 'read').length;

  // Admin: show client list if no client selected
  if (isAdmin && !selectedClientId) {
    const archivedCount = clientList.filter(c => archivedIds.has(c.id)).length;

    return (
      <div className="min-h-screen pb-4 overflow-y-auto" {...chatListPullProps}>
        <ChatListPullIndicator />
        {/* Header */}
        <div className="page-header flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-primary"><ArrowLeft size={24} /></button>
            <h1 className="font-heading text-xl text-foreground">Mensagens</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSearch(s => !s)}
              className={`p-2 rounded-lg transition-colors ${showSearch ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Search size={20} />
            </button>
          </div>
        </div>

        {/* Search bar (sempre visível para admin: permite iniciar nova conversa) */}
        {(showSearch || isAdmin) && (
          <div className="px-4 mb-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar ou iniciar conversa com um cliente..."
                className="vintage-input w-full pl-9 pr-4 py-2.5 rounded-xl text-sm"
              />
            </div>
            {/* Encryption notice */}
            <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground/80 justify-center">
              <Lock size={10} /> As mensagens são protegidas com criptografia ponta a ponta.
            </div>
            {/* Autocomplete de clientes que ainda não têm conversa */}
            {isAdmin && searchQuery.trim() && (() => {
              const q = searchQuery.toLowerCase();
              const existingIds = new Set(clientList.map(c => c.id));
              const suggestions = allClients.filter(c =>
                !existingIds.has(c.id) && c.name.toLowerCase().includes(q)
              ).slice(0, 6);
              if (suggestions.length === 0) return null;
              return (
                <div className="mt-2 wood-card rounded-xl overflow-hidden divide-y divide-border/30">
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground bg-background/40">
                    Iniciar nova conversa
                  </div>
                  {suggestions.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { selectClient(s.id, s.name); setSearchQuery(''); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-primary/10 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                        <UserPlus size={16} className="text-primary" />
                      </div>
                      <span className="font-heading text-sm text-foreground truncate">{s.name}</span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* Filter chips */}
        {!showArchived && (
          <div className="px-4 mb-3 flex gap-2 overflow-x-auto pb-1">
            {([
              { key: 'all',       label: 'Todas',        count: clientList.filter(c => !archivedIds.has(c.id)).length },
              { key: 'unread',    label: 'Não lidas',    count: totalUnread },
              { key: 'delivered', label: '✓✓ Entregue',  count: totalDelivered },
              { key: 'read',      label: '✓✓ Visto',     count: totalRead },
            ] as const).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-heading whitespace-nowrap transition-all ${
                  filter === f.key
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'wood-card text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.label}{f.count > 0 && <span className="ml-1.5 opacity-80">{f.count}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Archived toggle */}
        {archivedCount > 0 && (
          <button
            onClick={() => setShowArchived(s => !s)}
            className="mx-4 mb-3 flex items-center gap-2 px-4 py-2.5 wood-card w-full rounded-xl text-sm"
          >
            <Archive size={18} className="text-primary" />
            <span className="font-heading text-foreground">
              {showArchived ? 'Voltar às conversas' : `Arquivadas (${archivedCount})`}
            </span>
          </button>
        )}

        <div className="px-4 space-y-2">
          {filteredList.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle size={48} className="mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground text-sm">
                {searchQuery ? 'Nenhuma conversa encontrada' : showArchived ? 'Nenhuma conversa arquivada' : 'Nenhuma conversa ainda'}
              </p>
            </div>
          ) : (
            filteredList.map(c => (
              <div
                key={c.id}
                className="wood-card w-full px-4 py-3 flex items-center justify-between group cursor-pointer"
                onClick={() => selectClient(c.id, c.name)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center shrink-0">
                    <span className="text-muted-foreground font-heading">{(c.name || '?')[0]}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-heading text-foreground text-sm truncate">{c.name}</span>
                      {c.lastDate && (
                        <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
                          {format(new Date(c.lastDate), 'HH:mm')}
                        </span>
                      )}
                    </div>
                    {c.lastMessage && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{c.lastMessage}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  {c.unread > 0 && (
                    <span className="bg-primary text-primary-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
                      {c.unread}
                    </span>
                  )}
                  {showArchived ? (
                    <button
                      onClick={(e) => handleUnarchiveChat(c.id, e)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
                      title="Desarquivar"
                    >
                      <ArchiveRestore size={16} />
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={(e) => handleArchiveChat(c.id, e)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
                        title="Arquivar"
                      >
                        <Archive size={16} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteChat(c.id, e)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                        title="Apagar conversa"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  const toggleSelect = (id: string) => {
    setSelectedMsgIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const deleteSelected = async () => {
    if (selectedMsgIds.size === 0 || !user) return;
    if (!confirm(`Apagar ${selectedMsgIds.size} mensagem(ns) para você? Permanecem para o outro lado até que ele também apague.`)) return;
    const ids = Array.from(selectedMsgIds);
    const minhas = messages.filter(m => ids.includes(m.id) && m.remetente_id === user.id).map(m => m.id);
    const recebidas = messages.filter(m => ids.includes(m.id) && m.destinatario_id === user.id).map(m => m.id);
    if (minhas.length) await supabase.from('mensagens').update({ apagada_remetente: true } as any).in('id', minhas);
    if (recebidas.length) await supabase.from('mensagens').update({ apagada_destinatario: true } as any).in('id', recebidas);
    setMessages(prev => prev.filter(m => !selectedMsgIds.has(m.id)));
    setSelectedMsgIds(new Set());
    toast.success('Mensagens apagadas para você');
  };

  return (
    <div className="min-h-screen pb-28 flex flex-col">
      {/* Header */}
      <div className="page-header flex items-center gap-3 px-4 border-b border-border/30">
        {selectedMsgIds.size > 0 ? (
          <>
            <button onClick={() => setSelectedMsgIds(new Set())} className="text-primary"><ArrowLeft size={24} /></button>
            <h1 className="font-heading text-lg text-foreground flex-1">{selectedMsgIds.size} selecionada(s)</h1>
            <button onClick={deleteSelected} className="p-2 rounded-lg text-destructive hover:bg-destructive/10">
              <Trash2 size={20} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                if (isAdmin) { setSelectedClientId(null); setChatPartnerId(null); setMessages([]); loadClientChats(); }
                else navigate(-1);
              }}
              className="text-primary"
            >
              <ArrowLeft size={24} />
            </button>
            <div className="flex-1">
              <h1 className="font-heading text-lg text-foreground">{partnerName || 'Chat'}</h1>
              <div className="flex items-center gap-1.5">
                <span className={`inline-block w-2 h-2 rounded-full ${isBarberOnline ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
                <span className={`text-xs font-medium ${isBarberOnline ? 'text-green-500' : 'text-muted-foreground'}`}>
                  {isAdmin ? 'Cliente' : isBarberOnline ? 'online' : 'offline'}
                </span>
              </div>
            </div>
            <button
              onClick={async () => {
                if (!chatPartnerId || !confirm('Apagar esta conversa para você? A outra pessoa continua vendo até apagar do lado dela.')) return;
                await supabase.from('mensagens').update({ apagada_remetente: true } as any)
                  .eq('remetente_id', user.id).eq('destinatario_id', chatPartnerId);
                await supabase.from('mensagens').update({ apagada_destinatario: true } as any)
                  .eq('remetente_id', chatPartnerId).eq('destinatario_id', user.id);
                setMessages([]);
                toast.success('Conversa apagada para você');
                if (isAdmin) { setSelectedClientId(null); setChatPartnerId(null); loadClientChats(); }
              }}
              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Apagar conversa"
            >
              <Trash2 size={20} />
            </button>
          </>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ maxHeight: 'calc(100vh - 180px)' }}>
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/70 mb-2 px-3 py-1.5 rounded-full bg-muted/40 mx-auto w-fit">
          <Lock size={10} /> Mensagens protegidas com criptografia ponta a ponta
        </div>
        {messages.length === 0 && (
          <div className="text-center py-8">
            <MessageCircle size={32} className="mx-auto mb-2 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">Inicie a conversa!</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isMine = msg.remetente_id === user.id;
          const showDate = i === 0 ||
            format(new Date(msg.created_at), 'yyyy-MM-dd') !== format(new Date(messages[i - 1].created_at), 'yyyy-MM-dd');
          return (
            <div key={msg.id}>
              {showDate && (
                <p className="text-center text-[10px] text-muted-foreground my-2">
                  {format(new Date(msg.created_at), "dd 'de' MMMM", { locale: ptBR })}
                </p>
              )}
              <div
                className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                onContextMenu={(e) => { e.preventDefault(); toggleSelect(msg.id); }}
              >
                <div
                  onClick={() => { if (selectedMsgIds.size > 0) toggleSelect(msg.id); }}
                  onDoubleClick={() => toggleSelect(msg.id)}
                  className={`max-w-[80%] px-3 py-2 rounded-xl text-sm cursor-pointer select-none transition-all ${
                    isMine
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm'
                  } ${selectedMsgIds.has(msg.id) ? 'ring-2 ring-sky-400 ring-offset-1 ring-offset-background' : ''}`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.conteudo}</p>
                  <span className={`flex items-center gap-0.5 text-[9px] mt-1 ${isMine ? 'text-primary-foreground/70 justify-end' : 'text-muted-foreground'}`}>
                    {format(new Date(msg.created_at), 'HH:mm')}
                    {isMine && (
                      msg.lida
                        ? <CheckCheck size={14} className="text-sky-400 ml-1" />
                        : msg.entregue
                          ? <CheckCheck size={14} className="text-primary-foreground/70 ml-1" />
                          : <Check size={14} className="text-primary-foreground/60 ml-1" />
                    )}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input fixo acima da barra inferior */}
      <div className="fixed left-0 right-0 z-40 px-4 py-3 border-t border-border/30 bg-background/95 backdrop-blur-md"
           style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)' }}>
        <div className="flex gap-2">
          <input
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            className="vintage-input flex-1 px-4 py-2.5 rounded-xl text-sm"
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="vintage-btn px-4 rounded-xl disabled:opacity-40"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
