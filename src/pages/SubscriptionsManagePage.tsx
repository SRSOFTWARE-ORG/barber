import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Trash2, Check, Users, Crown, Download, FileSpreadsheet } from 'lucide-react';

interface Company { id: string; name: string; }
interface Plan {
  id: string; company_id: string; name: string; description: string | null;
  price: number; billing_cycle: 'monthly' | 'quarterly' | 'yearly'; is_active: boolean;
}
interface PlanService {
  id: string; plan_id: string; service_id: string;
  monthly_quota: number | null; discount_percent: number;
}
interface Service { id: string; name: string; price: number; company_id: string; }
interface Client { id: string; full_name: string | null; company_id: string; }
interface ClientSub {
  id: string; company_id: string; client_id: string; plan_id: string;
  status: 'pending' | 'active' | 'paused' | 'cancelled' | 'expired';
  current_period_end: string | null;
}
interface MonthlyRow {
  company_id: string; period_month: string;
  bookings_completed: number; gross_total: number;
  barber_total: number; house_total: number;
  bookings_covered: number; covered_gross: number;
}

const csvEscape = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const downloadFile = (name: string, content: string, mime = 'text/csv;charset=utf-8') => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
};

export default function SubscriptionsManagePage() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planServices, setPlanServices] = useState<PlanService[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [subs, setSubs] = useState<ClientSub[]>([]);
  const [report, setReport] = useState<MonthlyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newCycle, setNewCycle] = useState<Plan['billing_cycle']>('monthly');

  const [assignClient, setAssignClient] = useState('');
  const [assignPlan, setAssignPlan] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { resolveCompanyIdForUser } = await import('@/hooks/useCompanyId');
      const cid = await resolveCompanyIdForUser(user.id);
      console.log('Resolved company:', cid);
      const cos: Company[] = [];
      if (cid) {
        const { data: comp } = await (supabase as any)
          .from('companies')
          .select('id, name')
          .eq('id', cid)
          .maybeSingle();
        if (comp) cos.push(comp as Company);
      }
      setCompanies(cos);
      if (cos[0] && !companyId) setCompanyId(cos[0].id);
      setLoading(false);
    })();
    // eslint-disable-next-line
  }, [user?.id]);

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      const [{ data: pl }, { data: ps }, { data: svc }, { data: cli }, { data: cs }, { data: rep }] = await Promise.all([
        (supabase as any).from('subscription_plans').select('*').eq('company_id', companyId).order('sort_order'),
        (supabase as any).from('plan_services').select('*'),
        (supabase as any).from('services').select('id, name, price, company_id').eq('company_id', companyId).eq('is_active', true),
        (supabase as any).from('clients').select('id, full_name, company_id').eq('company_id', companyId),
        (supabase as any).from('client_subscriptions').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
        (supabase as any).from('v_monthly_coverage_report').select('*').eq('company_id', companyId).order('period_month', { ascending: false }),
      ]);
      setPlans((pl as any) || []);
      setPlanServices((ps as any) || []);
      setServices((svc as any) || []);
      setClients((cli as any) || []);
      setSubs((cs as any) || []);
      setReport((rep as any) || []);
    })();
  }, [companyId]);

  const createPlan = async () => {
    if (!newName.trim() || !companyId) { toast.error('Informe o nome'); return; }
    const { error } = await (supabase as any).from('subscription_plans').insert({
      company_id: companyId,
      name: newName.trim(),
      description: newDesc.trim() || null,
      price: Number(newPrice.replace(',', '.')) || 0,
      billing_cycle: newCycle,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success('Plano criado');
    setNewName(''); setNewDesc(''); setNewPrice('');
    const { data: pl } = await (supabase as any).from('subscription_plans').select('*').eq('company_id', companyId);
    setPlans((pl as any) || []);
  };

  const deletePlan = async (id: string) => {
    const { error } = await (supabase as any).from('subscription_plans').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    setPlans((p) => p.filter((x) => x.id !== id));
  };

  const toggleCoverage = async (planId: string, serviceId: string) => {
    const existing = planServices.find((x) => x.plan_id === planId && x.service_id === serviceId);
    if (existing) {
      await (supabase as any).from('plan_services').delete().eq('id', existing.id);
      setPlanServices((prev) => prev.filter((x) => x.id !== existing.id));
    } else {
      const { data } = await (supabase as any).from('plan_services').insert({
        plan_id: planId, service_id: serviceId, monthly_quota: 1, discount_percent: 100,
      } as any).select().single();
      if (data) setPlanServices((prev) => [...prev, data as any]);
    }
  };

  const updateQuota = async (id: string, value: string) => {
    const v = value.trim() === '' ? null : Math.max(0, parseInt(value, 10) || 0);
    await (supabase as any).from('plan_services').update({ monthly_quota: v }).eq('id', id);
    setPlanServices((prev) => prev.map((x) => (x.id === id ? { ...x, monthly_quota: v } : x)));
  };

  const assignSubscription = async () => {
    if (!assignClient || !assignPlan) { toast.error('Escolha cliente e plano'); return; }
    const { error } = await (supabase as any).from('client_subscriptions').insert({
      company_id: companyId, client_id: assignClient, plan_id: assignPlan, status: 'pending',
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success('Assinatura criada (pendente)');
    setAssignClient(''); setAssignPlan('');
    const { data } = await (supabase as any).from('client_subscriptions').select('*').eq('company_id', companyId);
    setSubs((data as any) || []);
  };

  const setSubStatus = async (id: string, status: ClientSub['status']) => {
    const patch: any = { status };
    if (status === 'active') { patch.started_at = new Date().toISOString(); patch.confirmed_at = new Date().toISOString(); patch.confirmed_by = user?.id; }
    if (status === 'cancelled') patch.cancelled_at = new Date().toISOString();
    const { error } = await (supabase as any).from('client_subscriptions').update(patch).eq('id', id);
    if (error) { toast.error(error.message); return; }
    setSubs((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  };

  const clientName = (id: string) => clients.find((c) => c.id === id)?.full_name || '—';
  const planName = (id: string) => plans.find((p) => p.id === id)?.name || '—';

  const pending = useMemo(() => subs.filter((s) => s.status === 'pending'), [subs]);
  const active  = useMemo(() => subs.filter((s) => s.status === 'active'),  [subs]);

  const exportCoverageCSV = () => {
    const header = ['period_month', 'bookings_completed', 'bookings_covered', 'gross_total', 'barber_total', 'house_total', 'covered_gross'];
    const rows = report.map((r) => [r.period_month, r.bookings_completed, r.bookings_covered, r.gross_total, r.barber_total, r.house_total, r.covered_gross]);
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
    downloadFile(`relatorio-mensal-${companyId.slice(0, 8)}.csv`, csv);
  };

  const exportSubscriptionsCSV = () => {
    const header = ['status', 'client', 'plan', 'current_period_end'];
    const rows = subs.map((s) => [s.status, clientName(s.client_id), planName(s.plan_id), s.current_period_end ?? '']);
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
    downloadFile(`assinaturas-${companyId.slice(0, 8)}.csv`, csv);
  };

  if (loading) return <p className="text-muted-foreground text-center py-8">Carregando...</p>;
  if (!companies.length) return <p className="text-muted-foreground text-center py-8">Você não tem empresas vinculadas.</p>;

  return (
    <div className="px-4 space-y-6 pb-24 pt-4 max-w-3xl mx-auto">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl text-foreground flex items-center gap-2"><Crown size={22} /> Assinaturas & Planos</h1>
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="vintage-input w-full px-3 py-2.5 rounded-lg text-sm"
        >
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </header>

      {/* Relatório mensal + exportação */}
      <section className="wood-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-base">Relatório mensal (cobertura & 60/40)</h2>
          <div className="flex gap-2">
            <button onClick={exportCoverageCSV} className="vintage-btn px-3 py-1.5 rounded text-xs flex items-center gap-1">
              <FileSpreadsheet size={14} /> CSV cobertura
            </button>
            <button onClick={exportSubscriptionsCSV} className="vintage-btn px-3 py-1.5 rounded text-xs flex items-center gap-1">
              <Download size={14} /> CSV assinaturas
            </button>
          </div>
        </div>
        {report.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem dados para o período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1">Mês</th>
                  <th>Reservas</th>
                  <th>Cobertas</th>
                  <th>Bruto</th>
                  <th>Barbeiro (60%)</th>
                  <th>Casa (40%)</th>
                </tr>
              </thead>
              <tbody>
                {report.map((r) => (
                  <tr key={r.period_month} className="border-t border-border/40">
                    <td className="py-1">{r.period_month}</td>
                    <td>{r.bookings_completed}</td>
                    <td>{r.bookings_covered}</td>
                    <td>R$ {Number(r.gross_total).toFixed(2)}</td>
                    <td>R$ {Number(r.barber_total).toFixed(2)}</td>
                    <td>R$ {Number(r.house_total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Criar plano */}
      <section className="wood-card p-4 space-y-3">
        <h2 className="font-heading text-base">Criar plano</h2>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome" className="vintage-input w-full px-3 py-2.5 rounded-lg text-sm" />
        <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Descrição" className="vintage-input w-full px-3 py-2.5 rounded-lg text-sm" />
        <div className="flex gap-2">
          <input value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="Preço" inputMode="decimal" className="vintage-input flex-1 px-3 py-2.5 rounded-lg text-sm" />
          <select value={newCycle} onChange={(e) => setNewCycle(e.target.value as any)} className="vintage-input px-2 py-2.5 rounded-lg text-sm">
            <option value="monthly">Mensal</option>
            <option value="quarterly">Trimestral</option>
            <option value="yearly">Anual</option>
          </select>
        </div>
        <button onClick={createPlan} className="vintage-btn px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <Plus size={15} /> Criar plano
        </button>
      </section>

      {/* Planos existentes + cobertura */}
      {plans.map((p) => (
        <section key={p.id} className="wood-card p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-heading text-base">{p.name}</p>
              {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
              <p className="text-sm text-primary font-semibold">R$ {Number(p.price).toFixed(2)} / {p.billing_cycle}</p>
            </div>
            <button onClick={() => deletePlan(p.id)} className="text-destructive"><Trash2 size={18} /></button>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">Serviços cobertos (quota/mês)</p>
            {services.length === 0 && <p className="text-xs text-muted-foreground">Cadastre serviços primeiro.</p>}
            {services.map((s) => {
              const ps = planServices.find((x) => x.plan_id === p.id && x.service_id === s.id);
              const included = !!ps;
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <button
                    onClick={() => toggleCoverage(p.id, s.id)}
                    className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${included ? 'bg-primary text-primary-foreground' : 'bg-secondary border border-border'}`}
                  >
                    {included && <Check size={13} />}
                  </button>
                  <span className="text-sm flex-1 truncate">{s.name}</span>
                  {included && (
                    <input
                      type="number" min={0}
                      value={ps?.monthly_quota ?? ''}
                      onChange={(e) => updateQuota(ps!.id, e.target.value)}
                      placeholder="∞"
                      className="vintage-input w-16 px-2 py-1 rounded text-sm text-center"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Assinar cliente */}
      <section className="wood-card p-4 space-y-3">
        <h2 className="font-heading text-base flex items-center gap-2"><Users size={18} /> Vincular cliente a plano</h2>
        <select value={assignClient} onChange={(e) => setAssignClient(e.target.value)} className="vintage-input w-full px-3 py-2.5 rounded-lg text-sm">
          <option value="">Cliente</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name || '—'}</option>)}
        </select>
        <select value={assignPlan} onChange={(e) => setAssignPlan(e.target.value)} className="vintage-input w-full px-3 py-2.5 rounded-lg text-sm">
          <option value="">Plano</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={assignSubscription} className="vintage-btn px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <Plus size={15} /> Criar assinatura (pendente)
        </button>
      </section>

      {pending.length > 0 && (
        <section className="wood-card p-4 space-y-2">
          <h2 className="font-heading text-base">Pendentes</h2>
          {pending.map((s) => (
            <div key={s.id} className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm truncate">{clientName(s.client_id)}</p>
                <p className="text-xs text-muted-foreground truncate">{planName(s.plan_id)}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setSubStatus(s.id, 'active')} className="vintage-btn px-3 py-1 rounded text-xs">Ativar</button>
                <button onClick={() => setSubStatus(s.id, 'cancelled')} className="text-destructive text-xs">Recusar</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="wood-card p-4 space-y-2">
        <h2 className="font-heading text-base">Ativas</h2>
        {active.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma assinatura ativa.</p>
        ) : active.map((s) => (
          <div key={s.id} className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm truncate">{clientName(s.client_id)}</p>
              <p className="text-xs text-primary truncate">{planName(s.plan_id)}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setSubStatus(s.id, 'paused')} className="text-xs text-muted-foreground underline">Pausar</button>
              <button onClick={() => setSubStatus(s.id, 'cancelled')} className="text-destructive text-xs">Encerrar</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
