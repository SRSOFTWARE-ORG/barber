import { useState, useEffect, lazy, Suspense } from 'react';
import { ArrowLeft, UserPlus, UserMinus, LogOut, MessageCircle, Send, Pencil, X, Save, ChevronRight, Users, Calendar, Camera, Star, Tag, Mail, Phone, MapPin, Eye, EyeOff, Copy, KeyRound, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import IOSDateInput from '@/components/IOSDateInput';

// Painéis pesados: carregados sob demanda quando a aba é aberta (menos lag ao abrir /ceo)
const EvolutionPanel = lazy(() => import('@/components/EvolutionPanel'));
const CeoDashboard = lazy(() => import('@/components/CeoDashboard'));
const CeoNotificationCenter = lazy(() => import('@/components/CeoNotificationCenter'));
const CeoSystemPanel = lazy(() => import('@/components/CeoSystemPanel'));
const CeoEventsPanel = lazy(() => import('@/components/CeoEventsPanel'));
const WhatsAppMonitorPanel = lazy(() => import('@/components/WhatsAppMonitorPanel'));
const WhatsAppHealthPanel = lazy(() => import('@/components/WhatsAppHealthPanel'));
const SupportChat = lazy(() => import('@/components/SupportChat'));

const PanelFallback = () => (
  <div className="flex items-center justify-center py-10">
    <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
  </div>
);

interface AdminUser {
  user_id: string;
  display_name: string | null;
  role: string;
}

interface AdminDetail {
  profile: {
    full_name?: string | null;
    telefone?: string | null;
    endereco_completo?: string | null;
    link_google_maps?: string | null;
    avatar_url?: string | null;
    data_nascimento?: string | null;
  };
  email: string | null;
  clientCount: number;
  appointmentCount: number;
  photoCount: number;
  avgRating: string | null;
  ratingCount: number;
  promoCount: number;
}

interface Ticket {
  id: string;
  adm_id: string;
  assunto: string;
  mensagem: string;
  status: string;
  resposta: string | null;
  created_at: string;
}

export default function CeoPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const [adminList, setAdminList] = useState<AdminUser[]>([]);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminUsername, setNewAdminUsername] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editTaxa, setEditTaxa] = useState<string>('');
  const [editIsentaAte, setEditIsentaAte] = useState<string>(''); // 'YYYY-MM-DD' ou ''
  const [editLoading, setEditLoading] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminUser | null>(null);
  const [adminDetail, setAdminDetail] = useState<AdminDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Suporte state
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [tab, setTab] = useState<'dashboard' | 'eventos' | 'equipe' | 'usuarios' | 'notificacoes' | 'sistema' | 'suporte' | 'whatsapp'>('dashboard');
  // Usuários (credenciais)
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userFilter, setUserFilter] = useState<'todos' | 'cliente' | 'admin' | 'ceo'>('todos');
  const [userSearch, setUserSearch] = useState('');
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [newAdminPasswordVisible, setNewAdminPasswordVisible] = useState(false);
  const [editPasswordVisible, setEditPasswordVisible] = useState(false);
  const [selectedBarberWA, setSelectedBarberWA] = useState<AdminUser | null>(null);

  const fetchAdmins = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-admin', {
        body: { action: 'list' },
      });
      if (error) { console.error('Error fetching admins:', error); return; }
      if (data?.error) { console.error('Error from function:', data.error); return; }
      setAdminList(data?.admins || []);
    } catch (e: any) {
      console.error('Error fetching admins:', e);
      toast.error('Erro ao carregar administradores');
    }
  };

  const fetchTickets = async () => {
    setTicketsLoading(true);
    const { data } = await supabase.from('suporte').select('*').order('created_at', { ascending: false });
    if (data) setTickets(data);
    setTicketsLoading(false);
  };

  const fetchAllUsers = async () => {
    setUsersLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-admin', { body: { action: 'list-all-users' } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAllUsers(data?.users || []);
    } catch (e: any) {
      toast.error('Erro ao carregar usuários');
    }
    setUsersLoading(false);
  };

  useEffect(() => { fetchAdmins(); }, []);
  useEffect(() => { if (tab === 'suporte') fetchTickets(); }, [tab]);
  useEffect(() => { if (tab === 'usuarios') fetchAllUsers(); }, [tab]);

  const handleAddAdmin = async () => {
    if (!newAdminName || !newAdminUsername || !newAdminPassword) {
      toast.error('Preencha nome, usuário e senha'); return;
    }
    // Usuário pode digitar "johnatan" (vira johnatan@barbershop.app) ou
    // qualquer string com "@" (ex.: "johnatan@corte"), que é usada EXATAMENTE.
    const raw = newAdminUsername.trim().toLowerCase();
    const hasAt = raw.includes('@');
    const sanitizedUsername = hasAt
      ? raw.replace(/\s+/g, '')
      : raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '.')
          .replace(/[^a-z0-9._-]/g, '');
    if (!sanitizedUsername || (hasAt && !/^[^@\s]+@[^@\s]+$/.test(sanitizedUsername))) {
      toast.error('Usuário inválido'); return;
    }
    if (newAdminPassword.length < 6) {
      toast.error('Senha deve ter pelo menos 6 caracteres'); return;
    }
    setAdminLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-admin', {
        body: hasAt
          ? { action: 'add', email: sanitizedUsername, password: newAdminPassword, displayName: newAdminName }
          : { action: 'add', username: sanitizedUsername, password: newAdminPassword, displayName: newAdminName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Admin "${newAdminName}" criado!`);
      setNewAdminName(''); setNewAdminUsername(''); setNewAdminPassword('');
      fetchAdmins();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar admin');
    }
    setAdminLoading(false);
  };

  const handleRemoveAdmin = async (userId: string, name: string | null) => {
    if (!confirm(`Remover ${name || 'este admin'}?`)) return;
    try {
      const { data, error } = await supabase.functions.invoke('manage-admin', {
        body: { action: 'remove', userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Admin removido');
      fetchAdmins();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao remover');
    }
  };

  const handleEditAdmin = async (userId: string) => {
    const hasTaxa = editTaxa !== '' && !Number.isNaN(Number(editTaxa));
    const hasIsentaChange = editIsentaAte !== '__unchanged__';
    if (!editName && !editPassword && !editEmail && !hasTaxa && !hasIsentaChange) {
      toast.error('Preencha algum campo para atualizar'); return;
    }
    if (editPassword && editPassword.length < 6) { toast.error('Senha deve ter pelo menos 6 caracteres'); return; }
    const cleanEmail = editEmail.trim().toLowerCase().replace(/\s+/g, '');
    if (cleanEmail && !/^[^@\s]+@[^@\s]+$/.test(cleanEmail)) { toast.error('Login inválido (use formato usuario@algo)'); return; }
    if (hasTaxa && Number(editTaxa) < 0) { toast.error('Taxa não pode ser negativa'); return; }
    setEditLoading(true);
    try {
      // Converte YYYY-MM-DD -> ISO no fim do dia (ou null para limpar)
      let isentaAteIso: string | null | undefined = undefined;
      if (hasIsentaChange) {
        if (!editIsentaAte) isentaAteIso = null;
        else {
          const d = new Date(`${editIsentaAte}T23:59:59`);
          isentaAteIso = d.toISOString();
        }
      }
      const { data, error } = await supabase.functions.invoke('manage-admin', {
        body: {
          action: 'update', userId,
          displayName: editName || undefined,
          password: editPassword || undefined,
          newEmail: cleanEmail || undefined,
          taxaAppValor: hasTaxa ? Number(editTaxa) : undefined,
          taxaIsentaAte: hasIsentaChange ? isentaAteIso : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Admin atualizado!');
      setEditingId(null); setEditName(''); setEditPassword(''); setEditEmail(''); setEditTaxa(''); setEditIsentaAte('__unchanged__');
      fetchAdmins();
      if (tab === 'usuarios') fetchAllUsers();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao atualizar');
    }
    setEditLoading(false);
  };

  const handleViewDetail = async (admin: AdminUser) => {
    setSelectedAdmin(admin);
    setDetailLoading(true);
    setAdminDetail(null);
    try {
      const { data, error } = await supabase.functions.invoke('manage-admin', {
        body: { action: 'detail', userId: admin.user_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAdminDetail(data);
    } catch (e: any) {
      toast.error('Erro ao carregar detalhes');
      setSelectedAdmin(null);
    }
    setDetailLoading(false);
  };

  const handleSignOut = async () => { await signOut(); navigate('/admin'); };

  const getAdminName = (admId: string) => {
    return adminList.find(a => a.user_id === admId)?.display_name || 'Barbeiro';
  };

  const handleReply = async (ticketId: string, newStatus: string) => {
    const { error } = await supabase.from('suporte').update({
      resposta: replyText || null,
      status: newStatus,
    }).eq('id', ticketId);
    if (error) { toast.error('Erro ao responder'); return; }
    toast.success('Ticket atualizado!');
    setReplyingId(null); setReplyText('');
    fetchTickets();
  };

  return (
    <div className="min-h-screen pb-20">
      <div className="page-header flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin')} className="text-primary"><ArrowLeft size={24} /></button>
          <h1 className="font-heading text-xl text-foreground">Gestão CEO</h1>
        </div>
        <button onClick={handleSignOut} className="text-destructive flex items-center gap-1 text-sm">
          <LogOut size={18} /> Sair
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-4 mb-4 overflow-x-auto no-scrollbar">
        {(['dashboard', 'eventos', 'equipe', 'usuarios', 'notificacoes', 'sistema', 'suporte', 'whatsapp'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 min-w-[5rem] py-2 rounded-lg text-xs font-heading transition-all whitespace-nowrap ${
              tab === t ? 'slot-selected' : 'wood-card'
            }`}
          >
            {t === 'dashboard' ? 'Painel' : t === 'eventos' ? 'Eventos' : t === 'equipe' ? 'Equipe' : t === 'usuarios' ? 'Usuários' : t === 'notificacoes' ? 'Avisos' : t === 'sistema' ? 'Sistema' : t === 'suporte' ? 'Suporte' : 'WhatsApp'}
            {t === 'suporte' && tickets.filter(tk => tk.status === 'pendente').length > 0 && (
              <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground font-bold">
                {tickets.filter(tk => tk.status === 'pendente').length}
              </span>
            )}
          </button>
        ))}
      </div>

      <Suspense fallback={<PanelFallback />}>
        {tab === 'dashboard' && <CeoDashboard />}
        {tab === 'eventos' && <CeoEventsPanel />}
        {tab === 'notificacoes' && <CeoNotificationCenter admins={adminList} />}
        {tab === 'sistema' && <CeoSystemPanel />}
      </Suspense>





      {tab === 'whatsapp' && (
        <section className="px-4 space-y-3"><Suspense fallback={<PanelFallback />}>
          {!selectedBarberWA ? (
            <>
              <WhatsAppHealthPanel />
              <div className="pt-4 border-t border-border/30" />
              <h2 className="font-heading text-base text-primary">Configuração por Barbeiro</h2>
              <p className="text-xs text-muted-foreground">Selecione um barbeiro para configurar a Evolution API e ver o status de conexão.</p>
              <div className="space-y-2">
                {/* placeholder kept by next lines */}
                {adminList.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum barbeiro cadastrado</p>
                )}
                {adminList.map(b => (
                  <button
                    key={b.user_id}
                    onClick={() => setSelectedBarberWA(b)}
                    className="wood-card px-4 py-3 w-full flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare size={16} className="text-primary" />
                      <span className="font-heading text-sm text-foreground">{b.display_name || 'Barbeiro'}</span>
                    </div>
                    <ChevronRight size={18} className="text-primary" />
                  </button>
                ))}
              </div>
              <div className="pt-4">
                <h3 className="font-heading text-sm text-primary mb-2">Fila Global</h3>
                <WhatsAppMonitorPanel />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <button onClick={() => setSelectedBarberWA(null)} className="text-primary flex items-center gap-1 text-sm">
                  <ArrowLeft size={16} /> Voltar
                </button>
                <h2 className="font-heading text-sm text-primary">{selectedBarberWA.display_name}</h2>
              </div>
              <EvolutionPanel barbeiroId={selectedBarberWA.user_id} />
            </>
          )}
        </Suspense></section>
      )}


      {/* Equipe tab */}
      {tab === 'equipe' && (
        <section className="px-4 space-y-3">
          <h2 className="font-heading text-base text-primary">Equipe (Administradores)</h2>
          <div className="space-y-2">
            {adminList.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum administrador cadastrado</p>
            )}
            {adminList.map(admin => (
              <div key={admin.user_id} className="wood-card px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <button onClick={() => handleViewDetail(admin)} className="flex-1 text-left flex items-center gap-2">
                    <p className="text-foreground">{admin.display_name || 'Admin'}</p>
                    <ChevronRight size={14} className="text-muted-foreground" />
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={async (e) => {
                      e.stopPropagation();
                      if (editingId === admin.user_id) {
                        setEditingId(null); setEditName(''); setEditPassword(''); setEditEmail('');
                        setEditTaxa(''); setEditIsentaAte('__unchanged__');
                      } else {
                        setEditingId(admin.user_id);
                        setEditName(admin.display_name || '');
                        setEditPassword(''); setEditEmail('');
                        setEditTaxa(''); setEditIsentaAte('__unchanged__');
                        // Carrega taxa atual para mostrar como placeholder
                        try {
                          const { data: prof } = await (supabase.rpc as any)('ceo_get_admin_taxa', { _admin_id: admin.user_id })
                            .then((r: any) => ({ data: Array.isArray(r.data) ? r.data[0] : r.data }));
                          if (prof) {
                            setEditTaxa(prof.taxa_app_valor != null ? String(prof.taxa_app_valor) : '3');
                            if (prof.taxa_isenta_ate) {
                              setEditIsentaAte(new Date(prof.taxa_isenta_ate).toISOString().slice(0, 10));
                            } else {
                              setEditIsentaAte('');
                            }
                          }
                        } catch {}
                      }
                    }} className="text-primary">
                      {editingId === admin.user_id ? <X size={18} /> : <Pencil size={16} />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleRemoveAdmin(admin.user_id, admin.display_name); }} className="text-destructive">
                      <UserMinus size={18} />
                    </button>
                  </div>
                </div>
                {editingId === admin.user_id && (
                  <div className="space-y-2 pt-1">
                    <input placeholder="Novo nome" value={editName} onChange={e => setEditName(e.target.value)} className="vintage-input w-full px-3 py-2 rounded-lg text-sm" />
                    <input placeholder="Novo login (ex: johnatan@corte)" value={editEmail} onChange={e => setEditEmail(e.target.value)} autoCapitalize="none" autoCorrect="off" className="vintage-input w-full px-3 py-2 rounded-lg text-sm" />
                    <div className="relative">
                      <input placeholder="Nova senha (opcional)" type={editPasswordVisible ? 'text' : 'password'} value={editPassword} onChange={e => setEditPassword(e.target.value)} className="vintage-input w-full px-3 py-2 pr-10 rounded-lg text-sm" />
                      <button
                        type="button"
                        onClick={() => setEditPasswordVisible(v => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary p-1"
                        aria-label={editPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                      >
                        {editPasswordVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {/* Taxa do app por barbeiro */}
                    <div className="border-t border-border/40 pt-2 space-y-2">
                      <p className="text-[11px] uppercase tracking-wider text-primary font-heading">Taxa do app</p>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Valor da taxa por serviço (R$)</label>
                        <input
                          type="number" step="0.01" min={0}
                          placeholder="3.00"
                          value={editTaxa}
                          onChange={e => setEditTaxa(e.target.value)}
                          className="vintage-input w-full px-3 py-2 rounded-lg text-sm mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Isentar da taxa até (deixe vazio para remover isenção)</label>
                        <IOSDateInput
                          value={editIsentaAte === '__unchanged__' ? '' : editIsentaAte}
                          onChange={setEditIsentaAte}
                          className="w-full mt-1"
                        />
                        <p className="text-[10px] text-muted-foreground/80 mt-1">
                          Enquanto a data não passar, o barbeiro não paga a taxa do app.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleEditAdmin(admin.user_id)}
                      disabled={editLoading}
                      className="vintage-btn w-full py-2 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      <Save size={14} /> {editLoading ? 'Salvando...' : 'Salvar alterações'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="wood-card px-4 py-4 space-y-2">
            <input placeholder="Nome do barbeiro" value={newAdminName} onChange={e => setNewAdminName(e.target.value)} className="vintage-input w-full px-3 py-2 rounded-lg" />
            <input placeholder="Usuário de acesso" value={newAdminUsername} onChange={e => setNewAdminUsername(e.target.value)} className="vintage-input w-full px-3 py-2 rounded-lg" />
            <div className="relative">
              <input placeholder="Senha (mín. 6 caracteres)" type={newAdminPasswordVisible ? 'text' : 'password'} value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} className="vintage-input w-full px-3 py-2 pr-10 rounded-lg" />
              <button
                type="button"
                onClick={() => setNewAdminPasswordVisible(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary p-1"
                aria-label={newAdminPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {newAdminPasswordVisible ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <button
              onClick={handleAddAdmin}
              disabled={!newAdminName || !newAdminUsername || !newAdminPassword || adminLoading}
              className="vintage-btn w-full py-2 rounded-lg flex items-center justify-center gap-2 text-sm disabled:opacity-40"
            >
              <UserPlus size={16} /> {adminLoading ? 'Criando...' : 'Adicionar Admin'}
            </button>
          </div>
        </section>
      )}

      {/* Usuários tab — Credenciais */}
      {tab === 'usuarios' && (
        <section className="px-4 space-y-3">
          <h2 className="font-heading text-base text-primary flex items-center gap-2">
            <KeyRound size={16} /> Credenciais de Acesso
          </h2>
          <p className="text-[11px] text-muted-foreground -mt-2">
            Visível apenas para o CEO. Senhas em texto ficam disponíveis para contas criadas/atualizadas após esta versão.
          </p>

          <div className="flex gap-2 flex-wrap">
            {(['todos','cliente','admin','ceo'] as const).map(f => (
              <button
                key={f}
                onClick={() => setUserFilter(f)}
                className={`px-3 py-1 rounded-full text-xs ${userFilter === f ? 'bg-primary text-primary-foreground' : 'wood-card text-muted-foreground'}`}
              >
                {f === 'todos' ? 'Todos' : f === 'cliente' ? 'Clientes' : f === 'admin' ? 'Admins' : 'CEO'}
              </button>
            ))}
          </div>

          <input
            placeholder="Buscar por nome, usuário ou e-mail..."
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            className="vintage-input w-full px-3 py-2 rounded-lg text-sm"
          />

          {usersLoading ? (
            <p className="text-center text-muted-foreground py-6 animate-pulse">Carregando usuários...</p>
          ) : (
            <div className="space-y-2">
              {allUsers
                .filter(u => userFilter === 'todos' || u.role === userFilter)
                .filter(u => {
                  if (!userSearch.trim()) return true;
                  const q = userSearch.toLowerCase();
                  return [u.display_name, u.username, u.email, u.barbearia, u.barbeiro_vinculado]
                    .filter(Boolean)
                    .some((v: string) => v.toLowerCase().includes(q));
                })
                .map(u => {
                  const show = !!revealed[u.user_id];
                  return (
                    <div key={u.user_id} className="wood-card px-4 py-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-foreground font-medium truncate">{u.display_name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          u.role === 'ceo' ? 'bg-primary/30 text-primary' :
                          u.role === 'admin' ? 'bg-accent/30 text-accent' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {u.role === 'ceo' ? 'CEO' : u.role === 'admin' ? 'Barbeiro' : 'Cliente'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-1 pt-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Usuário:</span>
                          <div className="flex items-center gap-1">
                            <code className="text-foreground bg-muted/40 px-2 py-0.5 rounded">{u.email || u.username}</code>
                            <button
                              onClick={() => { navigator.clipboard.writeText(u.email || u.username); toast.success('Login copiado'); }}
                              className="text-primary hover:opacity-80"
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Barbearia:</span>
                          <span className="text-foreground truncate">{u.barbearia || '—'}</span>
                        </div>
                        {u.role === 'cliente' && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Barbeiro vinculado:</span>
                            <span className="text-foreground truncate">{u.barbeiro_vinculado || 'Sem vínculo'}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Senha:</span>
                          <span className="text-[10px] italic text-muted-foreground/70">gerenciada pelo usuário</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              {allUsers.length === 0 && (
                <p className="text-center text-muted-foreground py-6 text-sm">Nenhum usuário cadastrado.</p>
              )}
            </div>
          )}
        </section>
      )}


      {/* Suporte tab */}
      {tab === 'suporte' && (
        <section className="px-4">
          <Suspense fallback={<PanelFallback />}><SupportChat ceo /></Suspense>
        </section>
      )}

      {/* Detail Modal */}
      {selectedAdmin && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-end justify-center" onClick={() => setSelectedAdmin(null)}>
          <div
            className="w-full max-w-md bg-background rounded-t-2xl max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-background px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="font-heading text-lg text-foreground">{selectedAdmin.display_name || 'Admin'}</h2>
              <button onClick={() => setSelectedAdmin(null)} className="text-muted-foreground"><X size={20} /></button>
            </div>

            {detailLoading ? (
              <p className="text-center text-muted-foreground py-12 animate-pulse">Carregando...</p>
            ) : adminDetail ? (
              <div className="px-4 py-4 space-y-4">
                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon: Users, label: 'Clientes', value: adminDetail.clientCount },
                    { icon: Calendar, label: 'Agendamentos', value: adminDetail.appointmentCount },
                    { icon: Camera, label: 'Fotos', value: adminDetail.photoCount },
                    { icon: Star, label: 'Avaliações', value: adminDetail.ratingCount },
                    { icon: Star, label: 'Nota média', value: adminDetail.avgRating || '—' },
                    { icon: Tag, label: 'Promoções', value: adminDetail.promoCount },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="wood-card px-3 py-3 text-center space-y-1">
                      <Icon size={16} className="text-primary mx-auto" />
                      <p className="text-lg font-heading text-foreground">{value}</p>
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Info */}
                <div className="wood-card px-4 py-3 space-y-3">
                  <h3 className="font-heading text-sm text-primary">Informações</h3>
                  {adminDetail.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail size={14} className="text-muted-foreground" />
                      <span className="text-foreground">{adminDetail.email}</span>
                    </div>
                  )}
                  {adminDetail.profile.telefone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone size={14} className="text-muted-foreground" />
                      <span className="text-foreground">{adminDetail.profile.telefone}</span>
                    </div>
                  )}
                  {adminDetail.profile.endereco_completo && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin size={14} className="text-muted-foreground" />
                      <span className="text-foreground">{adminDetail.profile.endereco_completo}</span>
                    </div>
                  )}
                  {adminDetail.profile.data_nascimento && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar size={14} className="text-muted-foreground" />
                      <span className="text-foreground">
                        {format(new Date(adminDetail.profile.data_nascimento + 'T12:00:00'), 'dd/MM/yyyy')}
                      </span>
                    </div>
                  )}
                  {!adminDetail.email && !adminDetail.profile.telefone && !adminDetail.profile.endereco_completo && !adminDetail.profile.data_nascimento && (
                    <p className="text-xs text-muted-foreground">Nenhuma informação adicional cadastrada.</p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
