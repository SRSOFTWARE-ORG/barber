import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  DollarSign, TrendingUp, TrendingDown, Plus, Trash2, Receipt, Wallet, PiggyBank,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import IOSDateInput from '@/components/IOSDateInput';
import { todayInputValue } from '@/lib/date';


interface Despesa {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  data: string;
  recorrente: boolean;
}

interface Summary {
  gross_revenue: number;
  platform_fees: number;
  barber_share: number;
  shop_share: number;
  total_expenses: number;
  net_profit: number;
}

const CATEGORIAS = [
  { key: 'aluguel', label: 'Aluguel' },
  { key: 'energia', label: 'Energia / Água' },
  { key: 'produtos', label: 'Produtos' },
  { key: 'ferramentas', label: 'Ferramentas' },
  { key: 'limpeza', label: 'Limpeza' },
  { key: 'salarios', label: 'Salários' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'outros', label: 'Outros' },
];

const brl = (n: number) =>
  (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function monthBounds(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

export default function FinanceiroPanel() {
  const { user } = useAuth();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [summary, setSummary] = useState<Summary | null>(null);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [loading, setLoading] = useState(false);

  // form
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState('outros');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [recorrente, setRecorrente] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { from, to } = monthBounds(month);
    const [sumRes, despRes] = await Promise.all([
      supabase.rpc('financial_summary' as any, { _shop_owner_id: user.id, _from: from, _to: to }),
      supabase
        .from('despesas' as any)
        .select('*')
        .gte('data', from)
        .lte('data', to)
        .order('data', { ascending: false }),
    ]);
    if (sumRes.data && Array.isArray(sumRes.data) && sumRes.data.length > 0) {
      const r = sumRes.data[0] as any;
      setSummary({
        gross_revenue: Number(r.gross_revenue) || 0,
        platform_fees: Number(r.platform_fees) || 0,
        barber_share: Number(r.barber_share) || 0,
        shop_share: Number(r.shop_share) || 0,
        total_expenses: Number(r.total_expenses) || 0,
        net_profit: Number(r.net_profit) || 0,
      });
    } else {
      setSummary({ gross_revenue: 0, platform_fees: 0, barber_share: 0, shop_share: 0, total_expenses: 0, net_profit: 0 });
    }
    setDespesas((despRes.data as any) || []);
    setLoading(false);
  }, [user?.id, month]);

  useEffect(() => { load(); }, [load]);

  const addDespesa = async () => {
    if (!user?.id) return;
    const v = parseFloat(valor.replace(',', '.'));
    if (!descricao.trim() || !Number.isFinite(v) || v <= 0) {
      toast.error('Informe descrição e valor válido.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('despesas' as any).insert({
      descricao: descricao.trim(),
      categoria,
      valor: v,
      data,
      recorrente,
      criado_por: user.id,
    } as any);
    setSaving(false);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    toast.success('Despesa lançada!');
    setDescricao(''); setValor(''); setRecorrente(false); setCategoria('outros');
    load();
  };

  const removeDespesa = async (id: string) => {
    const { error } = await supabase.from('despesas' as any).delete().eq('id', id);
    if (error) { toast.error('Erro ao remover.'); return; }
    setDespesas(d => d.filter(x => x.id !== id));
    load();
  };

  const chartData = useMemo(() => {
    if (!summary) return [];
    return [
      { name: 'Receita', valor: summary.gross_revenue, color: 'hsl(142 60% 45%)' },
      { name: 'Taxas', valor: summary.platform_fees, color: 'hsl(38 70% 55%)' },
      { name: 'Despesas', valor: summary.total_expenses, color: 'hsl(0 65% 55%)' },
      { name: 'Lucro', valor: summary.net_profit, color: summary.net_profit >= 0 ? 'hsl(200 70% 50%)' : 'hsl(0 70% 50%)' },
    ];
  }, [summary]);

  const despesasPorCategoria = useMemo(() => {
    const map: Record<string, number> = {};
    despesas.forEach(d => { map[d.categoria] = (map[d.categoria] || 0) + Number(d.valor); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [despesas]);

  return (
    <div className="space-y-4">
      {/* Seletor de mês */}
      <div className="wood-card rounded-2xl p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-foreground">
          <Wallet size={20} className="text-primary" />
          <span className="font-heading">Fluxo de Caixa</span>
        </div>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="vintage-input px-3 py-2 rounded-lg text-sm"
        />
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-3">
        <div className="wood-card rounded-2xl p-4">
          <div className="flex items-center gap-2 text-green-400 mb-1">
            <DollarSign size={16} />
            <span className="text-xs font-heading">Receita Bruta</span>
          </div>
          <p className="text-lg font-bold text-foreground">{brl(summary?.gross_revenue || 0)}</p>
        </div>
        <div className="wood-card rounded-2xl p-4">
          <div className="flex items-center gap-2 text-amber-400 mb-1">
            <Receipt size={16} />
            <span className="text-xs font-heading">Taxas Plataforma</span>
          </div>
          <p className="text-lg font-bold text-foreground">{brl(summary?.platform_fees || 0)}</p>
        </div>
        <div className="wood-card rounded-2xl p-4">
          <div className="flex items-center gap-2 text-red-400 mb-1">
            <TrendingDown size={16} />
            <span className="text-xs font-heading">Despesas</span>
          </div>
          <p className="text-lg font-bold text-foreground">{brl(summary?.total_expenses || 0)}</p>
        </div>
        <div className="wood-card rounded-2xl p-4 gold-border">
          <div className={`flex items-center gap-2 mb-1 ${(summary?.net_profit || 0) >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
            <PiggyBank size={16} />
            <span className="text-xs font-heading">Lucro Líquido</span>
          </div>
          <p className={`text-lg font-bold ${(summary?.net_profit || 0) >= 0 ? 'text-foreground' : 'text-red-400'}`}>
            {brl(summary?.net_profit || 0)}
          </p>
        </div>
      </div>

      {/* Gráfico */}
      <div className="wood-card rounded-2xl p-4">
        <div className="flex items-center gap-2 text-foreground mb-3">
          <TrendingUp size={18} className="text-primary" />
          <span className="font-heading text-sm">Resumo do Mês</span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={50}
                tickFormatter={(v) => `R$${Math.round(v)}`} />
              <Tooltip
                formatter={(v: number) => brl(v)}
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
              />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 text-center">
          Lucro líquido = Receita bruta − Taxas da plataforma − Despesas
        </p>
      </div>

      {/* Lançar despesa */}
      <div className="wood-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-foreground">
          <Plus size={18} className="text-primary" />
          <span className="font-heading text-sm">Lançar Despesa</span>
        </div>
        <input
          placeholder="Descrição (ex: Aluguel da loja)"
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
          maxLength={120}
          className="vintage-input w-full px-3 py-2 rounded-lg text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <select value={categoria} onChange={e => setCategoria(e.target.value)} className="vintage-input w-full px-3 py-2 rounded-lg text-sm">
            {CATEGORIAS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <input
            type="number" min="0" step="0.01" placeholder="Valor (R$)"
            value={valor} onChange={e => setValor(e.target.value)}
            className="vintage-input w-full px-3 py-2 rounded-lg text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 items-center">
          <IOSDateInput value={data} onChange={(v) => setData(v)} className="w-full text-sm" max={todayInputValue()} />
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={recorrente} onChange={e => setRecorrente(e.target.checked)} className="accent-primary" />
            Despesa fixa
          </label>
        </div>
        <button
          onClick={addDespesa}
          disabled={saving}
          className="w-full gold-border bg-primary/15 text-primary font-heading py-2.5 rounded-lg hover:bg-primary/25 transition-colors disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Adicionar despesa'}
        </button>
      </div>

      {/* Por categoria */}
      {despesasPorCategoria.length > 0 && (
        <div className="wood-card rounded-2xl p-4">
          <span className="font-heading text-sm text-foreground">Por categoria</span>
          <div className="mt-2 space-y-1.5">
            {despesasPorCategoria.map(([cat, val]) => (
              <div key={cat} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{CATEGORIAS.find(c => c.key === cat)?.label || cat}</span>
                <span className="text-foreground font-medium">{brl(val)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de despesas */}
      <div className="wood-card rounded-2xl p-4">
        <span className="font-heading text-sm text-foreground">Despesas do mês</span>
        {loading ? (
          <p className="text-sm text-muted-foreground mt-3">Carregando...</p>
        ) : despesas.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-3">Nenhuma despesa lançada neste mês.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {despesas.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-2 bg-secondary/40 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">
                    {d.descricao}
                    {d.recorrente && <span className="ml-2 text-[10px] text-primary border border-primary/40 rounded px-1">fixa</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {CATEGORIAS.find(c => c.key === d.categoria)?.label || d.categoria} · {new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-medium text-red-400">- {brl(Number(d.valor))}</span>
                  <button onClick={() => removeDespesa(d.id)} className="text-destructive p-1.5 rounded hover:bg-destructive/10">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
