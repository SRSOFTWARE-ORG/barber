import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { KpiCard } from './KpiCard';
import { CalendarDays, DollarSign, Users, Star } from 'lucide-react';

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function OwnerDashboard({ companyId }: { companyId: string | null }) {
  const [row, setRow] = useState<any>(null);
  useEffect(() => {
    if (!companyId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('v_dashboard_company_30d')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      setRow(data);
    })();
  }, [companyId]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard label="Agendamentos (30d)" value={row?.bookings_total ?? '—'} icon={<CalendarDays className="w-4 h-4 text-muted-foreground" />} />
      <KpiCard label="Receita bruta (30d)" value={row ? fmtBRL(Number(row.gross_cents || 0)) : '—'} icon={<DollarSign className="w-4 h-4 text-muted-foreground" />} />
      <KpiCard label="Novos clientes" value={row?.new_clients ?? '—'} icon={<Users className="w-4 h-4 text-muted-foreground" />} />
      <KpiCard label="Nota média" value={row?.rating_avg ? Number(row.rating_avg).toFixed(2) : '—'} icon={<Star className="w-4 h-4 text-muted-foreground" />} />
    </div>
  );
}

export function BarberDashboard({ barberId }: { barberId: string | null }) {
  const [row, setRow] = useState<any>(null);
  useEffect(() => {
    if (!barberId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('v_dashboard_barber_today')
        .select('*')
        .eq('barber_id', barberId)
        .maybeSingle();
      setRow(data);
    })();
  }, [barberId]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard label="Hoje" value={row?.today_bookings ?? '—'} hint="agendamentos ativos" icon={<CalendarDays className="w-4 h-4 text-muted-foreground" />} />
      <KpiCard label="Faturamento do mês" value={row ? fmtBRL(Number(row.month_gross_cents || 0)) : '—'} icon={<DollarSign className="w-4 h-4 text-muted-foreground" />} />
      <KpiCard label="Nota média" value={row?.rating_avg ? Number(row.rating_avg).toFixed(2) : '—'} icon={<Star className="w-4 h-4 text-muted-foreground" />} />
      <KpiCard label="Avaliações" value={row?.rating_count ?? '—'} icon={<Users className="w-4 h-4 text-muted-foreground" />} />
    </div>
  );
}

export function PlatformDashboard() {
  const [row, setRow] = useState<any>(null);
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).rpc('dashboard_platform');
      setRow(Array.isArray(data) ? data[0] : data);
    })();
  }, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <KpiCard label="Empresas ativas" value={row?.companies_active ?? '—'} />
      <KpiCard label="Assinaturas pagas" value={row?.paying_companies ?? '—'} />
      <KpiCard label="Receita 30d" value={row ? fmtBRL(Number(row.gross_30d_cents || 0)) : '—'} />
      <KpiCard label="Unidades" value={row?.units_total ?? '—'} />
      <KpiCard label="Barbeiros" value={row?.barbers_total ?? '—'} />
      <KpiCard label="Clientes" value={row?.clients_total ?? '—'} />
    </div>
  );
}
