import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Trash2, Check, X, CheckCircle, Crown, Link2, Save, Users } from 'lucide-react';

interface Plano {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  ativo: boolean;
}
interface PlanoServico {
  id: string;
  plano_id: string;
  servico_id: string;
  limite_mensal: number | null;
}
interface Servico {
  id: string;
  nome: string;
  preco: number;
}
interface ClientePlano {
  id: string;
  cliente_id: string;
  plano_id: string;
  status: string;
  confirmado_em: string | null;
}
interface ClientOption {
  id: string;
  full_name: string | null;
}

export default function PlanosPanel() {
  const { user } = useAuth();
  const [shopOwnerId, setShopOwnerId] = useState<string | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [planoServicos, setPlanoServicos] = useState<PlanoServico[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [clientePlanos, setClientePlanos] = useState<ClientePlano[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);

  // create plan form
  const [novoNome, setNovoNome] = useState('');
  const [novoDesc, setNovoDesc] = useState('');
  const [novoPreco, setNovoPreco] = useState('');

  // assign form
  const [assignClient, setAssignClient] = useState('');
  const [assignPlano, setAssignPlano] = useState('');

  // barberhub link
  const [barberhubLink, setBarberhubLink] = useState('');
  const [savingLink, setSavingLink] = useState(false);

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    // resolve shop owner (team barber -> owner, otherwise self)
    const { data: team } = await supabase
      .from('barbershop_team')
      .select('shop_owner_id')
      .eq('barber_id', user.id)
      .eq('active', true)
      .maybeSingle();
    const sid = (team as any)?.shop_owner_id || user.id;
    setShopOwnerId(sid);

    const [{ data: pl }, { data: ps }, { data: svc }, { data: cp }, { data: cl }, { data: prof }] = await Promise.all([
      supabase.from('planos').select('*').eq('shop_owner_id', sid).order('created_at'),
      supabase.from('plano_servicos').select('*'),
      supabase.rpc('get_services_for_barber', { _barber_id: user.id }),
      supabase.from('cliente_planos').select('*').eq('shop_owner_id', sid).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('adm_responsavel_id', user.id),
      supabase.from('profiles').select('barberhub_link').eq('id', sid).maybeSingle(),
    ]);
    setPlanos((pl as any) || []);
    setPlanoServicos((ps as any) || []);
    setServicos(((svc as any[]) || []).map((s) => ({ id: s.id, nome: s.nome, preco: Number(s.preco) })));
    setClientePlanos((cp as any) || []);
    setClients((cl as any) || []);
    setBarberhubLink((prof as any)?.barberhub_link || '');
    setLoading(false);
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [user?.id]);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.full_name || 'Cliente';
  const planoName = (id: string) => planos.find((p) => p.id === id)?.nome || 'Plano';

  const createPlano = async () => {
    if (!novoNome.trim() || !shopOwnerId) { toast.error('Informe o nome do plano'); return; }
    const { error } = await supabase.from('planos').insert({
      shop_owner_id: shopOwnerId,
      nome: novoNome.trim(),
      descricao: novoDesc.trim() || null,
      preco: Number(novoPreco.replace(',', '.')) || 0,
    });
    if (error) { toast.error('Erro ao criar plano'); return; }
    toast.success('Plano criado');
    setNovoNome(''); setNovoDesc(''); setNovoPreco('');
    loadAll();
  };

  const deletePlano = async (id: string) => {
    const { error } = await supabase.from('planos').delete().eq('id', id);
    if (error) { toast.error('Erro ao excluir'); return; }
    toast.success('Plano excluído');
    loadAll();
  };

  const toggleServico = async (planoId: string, servicoId: string) => {
    const existing = planoServicos.find((x) => x.plano_id === planoId && x.servico_id === servicoId);
    if (existing) {
      await supabase.from('plano_servicos').delete().eq('id', existing.id);
    } else {
      await supabase.from('plano_servicos').insert({ plano_id: planoId, servico_id: servicoId, limite_mensal: 1 });
    }
    loadAll();
  };

  const setLimite = async (psId: string, value: string) => {
    const v = value.trim() === '' ? null : Math.max(0, parseInt(value, 10) || 0);
    await supabase.from('plano_servicos').update({ limite_mensal: v }).eq('id', psId);
    setPlanoServicos((prev) => prev.map((x) => (x.id === psId ? { ...x, limite_mensal: v } : x)));
  };

  const assignPlan = async () => {
    if (!assignClient || !assignPlano || !shopOwnerId) { toast.error('Escolha cliente e plano'); return; }
    const { error } = await supabase.from('cliente_planos').insert({
      shop_owner_id: shopOwnerId,
      cliente_id: assignClient,
      plano_id: assignPlano,
      status: 'pendente',
    });
    if (error) { toast.error('Erro ao adicionar (cliente pode já ter um plano)'); return; }
    toast.success('Plano adicionado como pendente. Confirme para ativar.');
    setAssignClient(''); setAssignPlano('');
    loadAll();
  };

  const confirmPlan = async (cp: ClientePlano) => {
    const { error } = await supabase.from('cliente_planos')
      .update({ status: 'ativo', confirmado_por: user?.id, confirmado_em: new Date().toISOString() })
      .eq('id', cp.id);
    if (error) { toast.error('Erro ao confirmar (cliente já tem um plano ativo?)'); return; }
    toast.success('Plano confirmado e ativo!');
    loadAll();
  };

  const cancelPlan = async (cp: ClientePlano) => {
    const { error } = await supabase.from('cliente_planos').update({ status: 'cancelado' }).eq('id', cp.id);
    if (error) { toast.error('Erro ao cancelar'); return; }
    toast.success('Plano cancelado');
    loadAll();
  };

  const saveBarberhubLink = async () => {
    if (!shopOwnerId) return;
    setSavingLink(true);
    const { error } = await supabase.from('profiles').update({ barberhub_link: barberhubLink.trim() || null }).eq('id', shopOwnerId);
    setSavingLink(false);
    if (error) { toast.error('Erro ao salvar link'); return; }
    toast.success('Link do BarberHub salvo');
  };

  const pendentes = useMemo(() => clientePlanos.filter((c) => c.status === 'pendente'), [clientePlanos]);
  const ativos = useMemo(() => clientePlanos.filter((c) => c.status === 'ativo'), [clientePlanos]);

  if (loading) return <p className="text-muted-foreground text-center py-8">Carregando planos...</p>;

  return (
    <div className="px-4 space-y-6 pb-8">
      {/* BarberHub link */}
      <div className="wood-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Link2 size={18} className="text-primary" />
          <h3 className="font-heading text-base text-foreground">Integração BarberHub</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Cole o link da sua barbearia no BarberHub. Os clientes verão o atalho para conhecer/assinar os planos.
        </p>
        <input
          value={barberhubLink}
          onChange={(e) => setBarberhubLink(e.target.value)}
          placeholder="https://barberhub.srsoftwarestore.com/..."
          className="vintage-input w-full px-3 py-2.5 rounded-lg text-sm"
        />
        <button onClick={saveBarberhubLink} disabled={savingLink} className="vintage-btn px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50">
          <Save size={15} /> Salvar link
        </button>
      </div>

      {/* Create plan */}
      <div className="wood-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Crown size={18} className="text-primary" />
          <h3 className="font-heading text-base text-foreground">Criar plano</h3>
        </div>
        <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome (ex: Plano Premium)" className="vintage-input w-full px-3 py-2.5 rounded-lg text-sm" />
        <input value={novoDesc} onChange={(e) => setNovoDesc(e.target.value)} placeholder="Descrição (opcional)" className="vintage-input w-full px-3 py-2.5 rounded-lg text-sm" />
        <input value={novoPreco} onChange={(e) => setNovoPreco(e.target.value)} placeholder="Mensalidade R$ (ex: 99,90)" inputMode="decimal" className="vintage-input w-full px-3 py-2.5 rounded-lg text-sm" />
        <button onClick={createPlano} className="vintage-btn px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <Plus size={15} /> Criar plano
        </button>
      </div>

      {/* Existing plans + services */}
      {planos.map((p) => (
        <div key={p.id} className="wood-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-heading text-base text-foreground">{p.nome}</p>
              {p.descricao && <p className="text-xs text-muted-foreground">{p.descricao}</p>}
              <p className="text-sm text-primary font-semibold mt-0.5">R$ {Number(p.preco).toFixed(2).replace('.', ',')}/mês</p>
            </div>
            <button onClick={() => deletePlano(p.id)} className="text-destructive" aria-label="Excluir plano"><Trash2 size={18} /></button>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Serviços incluídos (limite por mês)</p>
            {servicos.length === 0 && <p className="text-xs text-muted-foreground">Cadastre serviços primeiro.</p>}
            {servicos.map((s) => {
              const ps = planoServicos.find((x) => x.plano_id === p.id && x.servico_id === s.id);
              const incluido = !!ps;
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <button
                    onClick={() => toggleServico(p.id, s.id)}
                    className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${incluido ? 'bg-primary text-primary-foreground' : 'bg-secondary border border-border'}`}
                    aria-label={incluido ? 'Remover do plano' : 'Adicionar ao plano'}
                  >
                    {incluido && <Check size={13} />}
                  </button>
                  <span className="text-sm text-foreground flex-1 truncate">{s.nome}</span>
                  {incluido && (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        value={ps?.limite_mensal ?? ''}
                        onChange={(e) => setLimite(ps!.id, e.target.value)}
                        placeholder="∞"
                        className="vintage-input w-16 px-2 py-1 rounded text-sm text-center"
                      />
                      <span className="text-[10px] text-muted-foreground">/mês</span>
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground">Deixe o limite vazio para uso ilimitado. Serviços no plano ficam gratuitos até o limite; ao atingir o limite, o cliente é impedido de agendar aquele serviço.</p>
          </div>
        </div>
      ))}

      {/* Assign plan to client */}
      <div className="wood-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-primary" />
          <h3 className="font-heading text-base text-foreground">Adicionar cliente a um plano</h3>
        </div>
        <select value={assignClient} onChange={(e) => setAssignClient(e.target.value)} className="vintage-input w-full px-3 py-2.5 rounded-lg text-sm">
          <option value="">Selecione o cliente</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name || 'Cliente'}</option>)}
        </select>
        <select value={assignPlano} onChange={(e) => setAssignPlano(e.target.value)} className="vintage-input w-full px-3 py-2.5 rounded-lg text-sm">
          <option value="">Selecione o plano</option>
          {planos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <button onClick={assignPlan} className="vintage-btn px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <Plus size={15} /> Adicionar (pendente)
        </button>
      </div>

      {/* Pending confirmations */}
      {pendentes.length > 0 && (
        <div className="wood-card p-4 space-y-3">
          <h3 className="font-heading text-base text-foreground">Aguardando confirmação</h3>
          {pendentes.map((cp) => (
            <div key={cp.id} className="flex items-center justify-between gap-2 bg-secondary/40 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">{clientName(cp.cliente_id)}</p>
                <p className="text-xs text-muted-foreground truncate">{planoName(cp.plano_id)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => confirmPlan(cp)} className="vintage-btn px-3 py-1.5 rounded-lg text-xs flex items-center gap-1"><CheckCircle size={14} /> Confirmar</button>
                <button onClick={() => cancelPlan(cp)} className="text-destructive" aria-label="Recusar"><X size={18} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active plans */}
      <div className="wood-card p-4 space-y-3">
        <h3 className="font-heading text-base text-foreground">Clientes com plano ativo</h3>
        {ativos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum cliente com plano ativo.</p>
        ) : ativos.map((cp) => (
          <div key={cp.id} className="flex items-center justify-between gap-2 bg-secondary/40 rounded-lg px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm text-foreground truncate">{clientName(cp.cliente_id)}</p>
              <p className="text-xs text-primary truncate">{planoName(cp.plano_id)}</p>
            </div>
            <button onClick={() => cancelPlan(cp)} className="text-destructive text-xs underline shrink-0">Encerrar</button>
          </div>
        ))}
      </div>
    </div>
  );
}
