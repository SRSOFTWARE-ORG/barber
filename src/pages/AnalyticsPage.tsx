import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, Users, CalendarCheck, XCircle, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { trackAnalyticsEvent, installAnalyticsFlusher, flushAnalyticsQueue, getAnalyticsQueueSize } from "@/lib/analytics-offline";

type DailyRow = { company_id: string; day: string; booked: number; completed: number; no_show: number; cancelled: number };
type Snapshot = {
  period_start: string;
  bookings_count: number;
  revenue_gross: number;
  revenue_net: number;
  active_clients: number;
  new_clients: number;
  no_show_count: number;
  cancellation_count: number;
  avg_ticket: number;
};

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [queueSize, setQueueSize] = useState(0);
  const [online, setOnline] = useState<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    installAnalyticsFlusher();
    const on = () => { setOnline(true); void flushAnalyticsQueue().then(() => setQueueSize(getAnalyticsQueueSize())); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const t = setInterval(() => setQueueSize(getAnalyticsQueueSize()), 3000);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    void load();
  }, [user?.id]);

  async function load() {
    setLoading(true);
    try {
      const { data: membership } = await supabase
        .from("user_roles" as never)
        .select("company_id")
        .eq("user_id", user!.id)
        .in("role", ["owner", "manager"])
        .limit(1)
        .maybeSingle<{ company_id: string }>();

      const cid = membership?.company_id ?? null;
      setCompanyId(cid);
      if (!cid) return;

      void trackAnalyticsEvent(cid, user!.id, "analytics_page_viewed");
      setQueueSize(getAnalyticsQueueSize());

      const since = new Date();
      since.setDate(since.getDate() - 30);

      const [d, s] = await Promise.all([
        supabase.from("v_bookings_daily" as never).select("*").eq("company_id", cid).gte("day", since.toISOString().slice(0, 10)).order("day"),
        supabase.from("kpi_snapshots" as never).select("*").eq("company_id", cid).eq("granularity", "month").order("period_start", { ascending: false }).limit(1).maybeSingle<Snapshot>(),
      ]);

      setDaily((d.data as DailyRow[] | null) ?? []);
      setSnapshot(s.data ?? null);
    } catch (e) {
      toast.error("Falha ao carregar analytics", { description: String((e as Error).message) });
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => {
    return daily.reduce(
      (acc, r) => ({
        booked: acc.booked + Number(r.booked || 0),
        completed: acc.completed + Number(r.completed || 0),
        no_show: acc.no_show + Number(r.no_show || 0),
        cancelled: acc.cancelled + Number(r.cancelled || 0),
      }),
      { booked: 0, completed: 0, no_show: 0, cancelled: 0 }
    );
  }, [daily]);

  const maxDay = Math.max(1, ...daily.map((r) => Number(r.booked || 0)));

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!companyId) {
    return <div className="p-6 text-sm text-muted-foreground">Você precisa ser owner ou manager de uma empresa para ver analytics.</div>;
  }

  const money = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Analytics & KPIs</h1>
          <p className="text-sm text-muted-foreground">Últimos 30 dias • snapshot mensal mais recente</p>
        </div>
        {(!online || queueSize > 0) && (
          <div className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
            <WifiOff className="h-3 w-3" />
            {online ? `Enviando ${queueSize} evento(s) pendente(s)…` : `Offline — ${queueSize} evento(s) em fila`}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard icon={<CalendarCheck className="h-4 w-4" />} label="Reservas (30d)" value={String(totals.booked)} />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Concluídas" value={String(totals.completed)} />
        <KpiCard icon={<XCircle className="h-4 w-4" />} label="No-show / Canceladas" value={`${totals.no_show} / ${totals.cancelled}`} />
        <KpiCard icon={<Users className="h-4 w-4" />} label="Ticket médio (mês)" value={snapshot ? money(Number(snapshot.avg_ticket)) : "—"} />
      </div>

      <Card>
        <CardHeader><CardTitle>Reservas por dia</CardTitle></CardHeader>
        <CardContent>
          {daily.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem dados nos últimos 30 dias.</div>
          ) : (
            <div className="flex h-40 items-end gap-1">
              {daily.map((r) => {
                const h = (Number(r.booked || 0) / maxDay) * 100;
                return (
                  <div key={r.day} className="flex-1 rounded-t bg-primary/70" style={{ height: `${h}%` }} title={`${r.day}: ${r.booked}`} />
                );
              })}
            </div>
          )}
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            {daily[0] && <span>{daily[0].day}</span>}
            {daily[daily.length - 1] && <span>{daily[daily.length - 1].day}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Snapshot do mês</CardTitle></CardHeader>
        <CardContent>
          {snapshot ? (
            <div className="grid gap-3 md:grid-cols-3">
              <Row label="Receita bruta" value={money(Number(snapshot.revenue_gross))} />
              <Row label="Receita líquida" value={money(Number(snapshot.revenue_net))} />
              <Row label="Reservas" value={String(snapshot.bookings_count)} />
              <Row label="Clientes ativos" value={String(snapshot.active_clients)} />
              <Row label="Novos clientes" value={String(snapshot.new_clients)} />
              <Row label="No-show" value={String(snapshot.no_show_count)} />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Nenhum snapshot mensal computado ainda. Um worker deve popular <code>kpi_snapshots</code>.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="mt-2 text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
