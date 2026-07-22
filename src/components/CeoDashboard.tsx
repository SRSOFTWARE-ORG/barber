import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Store, Users, CalendarDays, CalendarCheck, TrendingUp, Wallet,
  LifeBuoy, CreditCard, ShoppingBag, RefreshCw, Activity, AlertTriangle,
  CalendarHeart, Bell,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Stats {
  barbershops: number;
  clients: number;
  appointmentsTotal: number;
  appointmentsToday: number;
  appointmentsMonth: number;
  pendingTickets: number;
  totalTickets: number;
  subsPaid: number;
  subsPending: number;
  subsOverdue: number;
  mrr: number;
  grossMonth: number;
  feesMonth: number;
  products: number;
  marketplaceOrders: number;
  marketplaceRevenue: number;
  eventsActive: number;
  notificationsSent: number;
  generatedAt: string;
}

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 });

function StatCard({
  icon: Icon, label, value, sub, accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'primary' | 'accent' | 'destructive';
}) {
  const tone =
    accent === 'destructive' ? 'text-destructive' : accent === 'accent' ? 'text-accent' : 'text-primary';
  return (
    <div className="wood-card px-4 py-3 flex flex-col gap-1 animate-fade-in">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading">{label}</span>
        <Icon size={16} className={tone} />
      </div>
      <span className="font-heading text-2xl leading-none text-foreground">{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

export default function CeoDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const debounceRef = useRef<number | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-admin', { body: { action: 'stats' } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setStats(data as Stats);
      setLastUpdate(new Date());
    } catch {
      /* silencioso: dashboard não deve quebrar o painel */
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Atualização em tempo real: agrupa eventos para evitar excesso de chamadas
  useEffect(() => {
    const scheduleRefresh = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => load(true), 1500);
    };
    const channel = supabase
      .channel('ceo-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suporte' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_subscriptions' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_pedidos' }, scheduleRefresh)
      .subscribe();
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [load]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 px-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="wood-card h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!stats) {
    return <p className="text-center text-muted-foreground py-6 px-4">Não foi possível carregar o painel.</p>;
  }

  return (
    <section className="px-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base text-primary flex items-center gap-2">
          <Activity size={16} /> Visão Geral
          <span className="flex items-center gap-1 text-[10px] font-normal text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            ao vivo
          </span>
        </h2>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="text-primary flex items-center gap-1 text-xs disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {/* Operação */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-heading mb-2">Operação</p>
        <div className="grid grid-cols-2 gap-2">
          <StatCard icon={Store} label="Barbearias" value={stats.barbershops} sub="administradores ativos" />
          <StatCard icon={Users} label="Clientes" value={stats.clients} sub="vinculados" />
          <StatCard icon={CalendarCheck} label="Hoje" value={stats.appointmentsToday} sub="agendamentos" accent="accent" />
          <StatCard icon={CalendarDays} label="No mês" value={stats.appointmentsMonth} sub={`${stats.appointmentsTotal} no total`} />
        </div>
      </div>

      {/* Financeiro */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-heading mb-2">Financeiro do mês</p>
        <div className="grid grid-cols-2 gap-2">
          <StatCard icon={TrendingUp} label="Faturamento" value={brl(stats.grossMonth)} sub="bruto processado" accent="accent" />
          <StatCard icon={Wallet} label="Taxas do app" value={brl(stats.feesMonth)} sub="receita da plataforma" accent="primary" />
          <StatCard icon={CreditCard} label="MRR (mensalidades)" value={brl(stats.mrr)} sub={`${stats.subsPaid} pagas`} accent="primary" />
          <StatCard icon={ShoppingBag} label="Marketplace" value={brl(stats.marketplaceRevenue)} sub={`${stats.marketplaceOrders} pedidos`} accent="accent" />
        </div>
      </div>

      {/* Alertas / pendências */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-heading mb-2">Pendências</p>
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            icon={LifeBuoy}
            label="Suporte"
            value={stats.pendingTickets}
            sub={`${stats.totalTickets} tickets no total`}
            accent={stats.pendingTickets > 0 ? 'destructive' : 'primary'}
          />
          <StatCard
            icon={AlertTriangle}
            label="Mensalidades"
            value={stats.subsPending + stats.subsOverdue}
            sub={`${stats.subsOverdue} atrasadas`}
            accent={stats.subsOverdue > 0 ? 'destructive' : 'primary'}
          />
        </div>
      </div>

      {/* Engajamento */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-heading mb-2">Engajamento</p>
        <div className="grid grid-cols-2 gap-2">
          <StatCard icon={CalendarHeart} label="Eventos ativos" value={stats.eventsActive} sub="temas no ar" accent={stats.eventsActive > 0 ? 'accent' : 'primary'} />
          <StatCard icon={Bell} label="Notificações" value={stats.notificationsSent} sub="enviadas pelo CEO" accent="primary" />
        </div>
      </div>


      {lastUpdate && (
        <p className="text-center text-[10px] text-muted-foreground/70 pt-1">
          Atualizado às {lastUpdate.toLocaleTimeString('pt-BR')}
        </p>
      )}
    </section>
  );
}
