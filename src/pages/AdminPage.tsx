import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, MessageCircle, LayoutDashboard, TrendingUp, Users, Gauge,
  BrainCircuit, CalendarDays, UserRound, Cake, Wallet, Crown, Scissors,
  Camera, Store, Package, Tag, Star, MessageSquare, Zap, Settings2,
  UserCog, Building2, Smartphone, FileText, Palette, Search, Calendar,
  Users2, Clock, UserCheck, ShoppingBag, ChevronDown,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import IOSDateInput from '@/components/IOSDateInput';

type Tile = {
  key: string;
  label: string;
  icon: any;
  to?: string;
  soon?: boolean;
};

const TILES: Tile[] = [
  { key: 'dash',   label: 'Dashboard',    icon: LayoutDashboard, to: '/dashboard' },
  { key: 'exec',   label: 'Executivo',    icon: TrendingUp,      to: '/analytics' },
  { key: 'crm',    label: 'CRM',          icon: Users,           to: '/clients' },
  { key: 'ocup',   label: 'Ocupação',     icon: Gauge,           to: '/analytics?tab=ocupacao' },
  { key: 'ia',     label: 'IA Gerente',   icon: BrainCircuit,    to: '/chat' },
  { key: 'cal',    label: 'Calendário',   icon: CalendarDays,    to: '/bookings' },
  { key: 'cli',    label: 'Clientes',     icon: UserRound,       to: '/clients' },
  { key: 'birth',  label: 'Aniversários', icon: Cake,            to: '/clients?filter=birthdays' },
  { key: 'fin',    label: 'Financeiro',   icon: Wallet,          to: '/fatura' },
  { key: 'plans',  label: 'Planos',       icon: Crown,           to: '/subscriptions-manage' },
  { key: 'serv',   label: 'Serviços',     icon: Scissors,        to: '/services-manage' },
  { key: 'gal',    label: 'Galeria',      icon: Camera,          to: '/gallery' },
  { key: 'shop',   label: 'Loja',         icon: Store,           to: '/marketplace' },
  { key: 'stock',  label: 'Estoque',      icon: Package,         soon: true },
  { key: 'promo',  label: 'Promoções',    icon: Tag,             to: '/promos' },
  { key: 'rate',   label: 'Avaliações',   icon: Star,            soon: true },
  { key: 'sup',    label: 'Suporte',      icon: MessageSquare,   to: '/chat?ch=support' },
  { key: 'quick',  label: 'Rápida',       icon: Zap,             to: '/bookings?quick=1' },
  { key: 'cfg',    label: 'Config',       icon: Settings2,       to: '/settings' },
  { key: 'team',   label: 'Equipe',       icon: UserCog,         to: '/ceo' },
  { key: 'units',  label: 'Unidades',     icon: Building2,       soon: true },
  { key: 'wa',     label: 'WhatsApp',     icon: Smartphone,      to: '/ceo?tab=whatsapp' },
  { key: 'about',  label: 'Sobre',        icon: FileText,        to: '/about' },
  { key: 'theme',  label: 'Tema',         icon: Palette,         to: '/settings?tab=theme' },
];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayRange(iso: string): { from: string; to: string } {
  const [y, m, d] = iso.split('-').map(Number);
  const from = new Date(y, m - 1, d, 0, 0, 0, 0);
  const to = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

const PT_MONTHS = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const PT_WEEKDAY = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];

function humanDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${d} de ${PT_MONTHS[m - 1]} de ${y}`;
}
function weekdayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${PT_WEEKDAY[dt.getDay()]}, ${d} de ${PT_MONTHS[m - 1]}`;
}

export default function AdminPage() {
  const nav = useNavigate();
  const { shopDisplayName } = useAuth();
  const [date, setDate] = useState<string>(todayISO());
  const [search, setSearch] = useState('');
  const [kpi, setKpi] = useState({ total: 0, pendentes: 0, concluidos: 0, conversao: 0 });
  const [loading, setLoading] = useState(false);

  const { from, to } = useMemo(() => dayRange(date), [date]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const base = (supabase as any)
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .gte('starts_at', from)
          .lt('starts_at', to);

        const [tot, pen, done] = await Promise.all([
          base,
          (supabase as any).from('bookings').select('id', { count: 'exact', head: true })
            .gte('starts_at', from).lt('starts_at', to)
            .in('status', ['scheduled', 'pending', 'confirmed']),
          (supabase as any).from('bookings').select('id', { count: 'exact', head: true })
            .gte('starts_at', from).lt('starts_at', to)
            .in('status', ['done', 'completed', 'finished']),
        ]);

        if (!alive) return;
        const total = tot.count ?? 0;
        const concluidos = done.count ?? 0;
        setKpi({
          total,
          pendentes: pen.count ?? 0,
          concluidos,
          conversao: total > 0 ? Math.round((concluidos / total) * 100) : 0,
        });
      } catch (err) {
        console.warn('[AdminPage] KPI load failed:', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [from, to]);

  const goSearch = () => {
    const q = search.trim();
    if (!q) return nav('/clients');
    nav(`/clients?q=${encodeURIComponent(q)}`);
  };

  const openTile = (t: Tile) => {
    if (t.soon) return toast.info(`${t.label}: em breve`);
    if (t.to) nav(t.to);
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/85 backdrop-blur border-b border-border/50">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => nav(-1)}
            aria-label="Voltar"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted/40 text-foreground"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-heading text-2xl text-foreground flex-1 truncate">Painel Admin</h1>
          <button
            onClick={() => nav('/chat')}
            aria-label="Mensagens"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted/40 text-primary"
          >
            <MessageCircle size={20} />
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 pt-4 space-y-4">
        {shopDisplayName && (
          <p className="text-xs text-muted-foreground -mt-2">{shopDisplayName}</p>
        )}

        {/* Grid de módulos — glass tiles */}
        <section aria-label="Módulos" className="grid grid-cols-4 gap-2 sm:gap-3">
          {TILES.map((t, i) => {
            const Icon = t.icon;
            const highlight = i === 0;
            return (
              <button
                key={t.key}
                onClick={() => openTile(t)}
                className={[
                  'aspect-square rounded-xl border flex flex-col items-center justify-center gap-1.5 px-1 text-center transition-all',
                  'bg-background/35 backdrop-blur-md hover:bg-background/45 active:scale-[0.97]',
                  'shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.04)]',
                  highlight
                    ? 'border-primary/70 ring-1 ring-primary/40 shadow-[0_0_18px_-4px_hsl(var(--primary)/0.45)]'
                    : 'border-white/5 hover:border-white/10',
                  t.soon ? 'opacity-70' : '',
                ].join(' ')}
              >
                <Icon size={22} className={highlight ? 'text-primary' : 'text-foreground/85'} />
                <span className="text-[11px] leading-tight text-foreground/90 font-heading">{t.label}</span>
              </button>
            );
          })}
        </section>

        {/* Busca de cliente — glass */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') goSearch(); }}
            placeholder="Buscar cliente por nome ou telefone..."
            className="w-full h-12 pl-9 pr-4 rounded-2xl bg-background/35 backdrop-blur-md border border-white/5 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/60"
          />
        </div>

        {/* Data — glass */}
        <div className="rounded-2xl bg-background/35 backdrop-blur-md border border-white/5 px-1">
          <IOSDateInput
            value={date}
            onChange={(v) => setDate(v || todayISO())}
            placeholder={humanDate(date)}
            className="!bg-transparent !border-0 !h-12 !rounded-2xl"
          />
        </div>
        <p className="text-xs text-muted-foreground text-center -mt-2">{weekdayLabel(date)}</p>

        {/* KPIs — glass */}
        <section className="grid grid-cols-3 gap-2 sm:gap-3">
          <KpiCard icon={Users2}       value={kpi.total}      label="Total"      loading={loading} tint="primary" />
          <KpiCard icon={Clock}        value={kpi.pendentes}  label="Pendentes"  loading={loading} tint="warning" />
          <KpiCard icon={CheckCircle2} value={kpi.concluidos} label="Concluídos" loading={loading} tint="success" />
        </section>

        {/* Conversão — glass */}
        <section className="rounded-2xl bg-background/35 backdrop-blur-md border border-white/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ShoppingBag size={16} className="text-primary" />
              <span className="text-sm text-foreground/90 font-heading">Conversão da Loja</span>
            </div>
            <span className="text-primary font-semibold">{kpi.conversao}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.min(100, kpi.conversao)}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">concluídos / total no dia</p>
        </section>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon, value, label, loading, tint,
}: {
  icon: any;
  value: number; label: string; loading: boolean;
  tint: 'primary' | 'warning' | 'success';
}) {
  const tintCls =
    tint === 'primary' ? 'text-primary' :
    tint === 'warning' ? 'text-amber-400' :
    'text-emerald-400';
  return (
    <div className="rounded-2xl bg-background/35 backdrop-blur-md border border-white/5 p-3 flex flex-col items-center justify-center gap-1">
      <Icon size={18} className={tintCls} />
      <span className={`text-2xl font-bold ${tintCls}`}>
        {loading ? '—' : value}
      </span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
