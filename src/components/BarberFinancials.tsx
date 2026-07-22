import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  DollarSign, TrendingUp, Users, X, Wallet, Receipt, Clock, CalendarRange,
  ChevronRight, CircleDollarSign, History, Loader2,
} from 'lucide-react';
import { PAY_FREQUENCIES } from './BarberTeamPanel';

interface EarningRow {
  barber_id: string;
  barber_name: string;
  avatar_url: string | null;
  is_owner: boolean;
  commission_type: string | null;
  commission_value: number | null;
  pay_frequency: string;
  total_appointments: number;
  total_revenue: number;
  avg_ticket: number;
  commission_amount: number;
  amount_paid: number;
  status: 'pendente' | 'parcial' | 'pago';
}

interface ServiceRow {
  agendamento_id: string;
  cliente_nome: string;
  servicos: string;
  valor: number;
  data: string;
  hora: string;
  status: string;
}

interface PaymentRow {
  id: string;
  barber_id: string;
  amount: number;
  period_start: string | null;
  period_end: string | null;
  metodo: string | null;
  observacoes: string | null;
  paid_by_name: string | null;
  created_at: string;
}

const BRL = (n: number) =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PRESETS = [
  { key: 'hoje', label: 'Hoje', days: 0 },
  { key: 'semana', label: '7 dias', days: 7 },
  { key: 'quinzena', label: '15 dias', days: 15 },
  { key: 'mes', label: '30 dias', days: 30 },
  { key: 'ano', label: '1 ano', days: 365 },
];

const fmtDate = (d: string) => {
  try { return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR'); } catch { return d; }
};
const fmtDateTime = (d: string) => {
  try { return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return d; }
};

const statusBadge = (s: string) => {
  if (s === 'pago') return 'bg-green-500/15 text-green-500';
  if (s === 'parcial') return 'bg-amber-500/15 text-amber-500';
  return 'bg-red-500/15 text-red-500';
};
const statusLabel = (s: string) =>
  s === 'pago' ? 'Pago' : s === 'parcial' ? 'Parcialmente Pago' : 'Pendente';
const freqLabel = (f: string) => PAY_FREQUENCIES.find((x) => x.value === f)?.label || 'Semanal';

function rangeFromDays(days: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

export default function BarberFinancials() {
  const [rows, setRows] = useState<EarningRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [preset, setPreset] = useState('semana');
  const [detail, setDetail] = useState<EarningRow | null>(null);

  const { from, to } = rangeFromDays(PRESETS.find((p) => p.key === preset)?.days ?? 7);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc('barber_earnings_dashboard', {
      _from: from, _to: to,
    });
    if (error) { toast.error('Erro ao carregar ganhos'); setRows([]); }
    else setRows((data as EarningRow[]) || []);
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const totalRevenue = rows.reduce((s, r) => s + Number(r.total_revenue || 0), 0);
  const totalDue = rows.reduce((s, r) => s + Math.max(0, Number(r.commission_amount || 0) - Number(r.amount_paid || 0)), 0);

  return (
    <div className="space-y-4">
      <div className="wood-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Wallet size={20} className="text-primary" />
          <h2 className="font-heading text-lg">Ganhos da Equipe</h2>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                preset === p.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><TrendingUp size={12} /> Faturamento</p>
            <p className="font-heading text-lg text-primary">{BRL(totalRevenue)}</p>
          </div>
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><CircleDollarSign size={12} /> A repassar</p>
            <p className="font-heading text-lg text-amber-500">{BRL(totalDue)}</p>
          </div>
        </div>
      </div>

      {loading && (
        <p className="text-center text-sm text-muted-foreground py-6 flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Carregando...
        </p>
      )}

      {!loading && rows.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-6">Nenhum dado no período.</p>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.barber_id} className="wood-card p-3">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-secondary flex items-center justify-center flex-shrink-0">
                {r.avatar_url
                  ? <img src={r.avatar_url} alt="" className="w-full h-full object-cover" draggable={false} />
                  : <span className="text-lg font-bold text-primary">{(r.barber_name || '?').charAt(0).toUpperCase()}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{r.barber_name}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusBadge(r.status)}`}>{statusLabel(r.status)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {r.is_owner ? 'Proprietário' : 'Barbeiro'} · {freqLabel(r.pay_frequency)}
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1.5 text-[11px]">
                  <span className="text-muted-foreground">Serviços: <b className="text-foreground">{r.total_appointments}</b></span>
                  <span className="text-muted-foreground">Gerado: <b className="text-foreground">{BRL(r.total_revenue)}</b></span>
                  <span className="text-muted-foreground">Comissão: <b className="text-foreground">{BRL(r.commission_amount)}</b></span>
                  <span className="text-muted-foreground">Pago: <b className="text-foreground">{BRL(r.amount_paid)}</b></span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setDetail(r)}
              className="mt-2 w-full py-1.5 rounded-lg bg-secondary text-xs font-medium flex items-center justify-center gap-1 hover:bg-secondary/70"
            >
              Ver Detalhes <ChevronRight size={14} />
            </button>
          </div>
        ))}
      </div>

      {detail && (
        <BarberDetailModal
          row={detail}
          from={from}
          to={to}
          onClose={() => setDetail(null)}
          onPaid={() => { load(); }}
        />
      )}
    </div>
  );
}

function StatBox({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg bg-secondary/50 p-2.5">
      <p className="text-[10px] text-muted-foreground flex items-center gap-1">{icon} {label}</p>
      <p className={`font-heading text-base ${accent || 'text-foreground'}`}>{value}</p>
    </div>
  );
}

function BarberDetailModal({
  row, from, to, onClose, onPaid,
}: { row: EarningRow; from: string; to: string; onClose: () => void; onPaid: () => void }) {
  const [tab, setTab] = useState<'servicos' | 'pagamentos'>('servicos');
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('pix');
  const [payObs, setPayObs] = useState('');
  const [saving, setSaving] = useState(false);

  const due = Math.max(0, Number(row.commission_amount || 0) - Number(row.amount_paid || 0));

  const loadData = useCallback(async () => {
    setLoading(true);
    const [svc, pay] = await Promise.all([
      (supabase as any).rpc('barber_service_history', { _barber_id: row.barber_id, _from: from, _to: to }),
      (supabase as any).rpc('barber_payment_history', { _barber_id: row.barber_id }),
    ]);
    setServices((svc.data as ServiceRow[]) || []);
    setPayments((pay.data as PaymentRow[]) || []);
    setLoading(false);
  }, [row.barber_id, from, to]);

  useEffect(() => { loadData(); }, [loadData]);

  const registerPayment = async () => {
    const amt = Number(String(payAmount).replace(',', '.'));
    if (!amt || amt <= 0) { toast.error('Informe um valor válido'); return; }
    setSaving(true);
    const { error } = await (supabase as any).rpc('register_barber_payment', {
      _barber_id: row.barber_id,
      _amount: amt,
      _period_start: from,
      _period_end: to,
      _metodo: payMethod,
      _observacoes: payObs || null,
    });
    setSaving(false);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Pagamento registrado');
    setPayAmount(''); setPayObs('');
    await loadData();
    onPaid();
  };

  const lastPayment = payments[0];

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="wood-card w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between sticky top-0 -mt-4 pt-4 pb-2 bg-card z-10">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-full overflow-hidden bg-secondary flex items-center justify-center flex-shrink-0">
              {row.avatar_url
                ? <img src={row.avatar_url} alt="" className="w-full h-full object-cover" draggable={false} />
                : <span className="font-bold text-primary">{(row.barber_name || '?').charAt(0)}</span>}
            </div>
            <div className="min-w-0">
              <p className="font-heading text-base truncate">{row.barber_name}</p>
              <p className="text-[11px] text-muted-foreground">{row.is_owner ? 'Proprietário' : 'Barbeiro'} · {freqLabel(row.pay_frequency)}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground p-1"><X size={20} /></button>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-2 gap-2">
          <StatBox icon={<Users size={11} />} label="Atendimentos" value={String(row.total_appointments)} />
          <StatBox icon={<TrendingUp size={11} />} label="Faturado" value={BRL(row.total_revenue)} />
          <StatBox icon={<Receipt size={11} />} label="Ticket médio" value={BRL(row.avg_ticket)} />
          <StatBox icon={<DollarSign size={11} />} label="Comissão gerada" value={BRL(row.commission_amount)} accent="text-primary" />
          <StatBox icon={<Wallet size={11} />} label="Já pago" value={BRL(row.amount_paid)} />
          <StatBox icon={<CircleDollarSign size={11} />} label="A receber" value={BRL(due)} accent="text-amber-500" />
        </div>

        {/* Registrar pagamento */}
        {!row.is_owner && (
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-xs font-medium flex items-center gap-1"><CircleDollarSign size={13} className="text-primary" /> Registrar pagamento</p>
            <div className="flex gap-2">
              <input
                type="number" inputMode="decimal" min="0" step="0.01"
                value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                placeholder={`Valor (sugerido ${BRL(due)})`}
                className="flex-1 px-2.5 py-2 rounded-lg bg-input border border-border text-sm"
              />
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
                className="px-2 py-2 rounded-lg bg-input border border-border text-sm">
                <option value="pix">Pix</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="transferencia">Transferência</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <input
              value={payObs} onChange={(e) => setPayObs(e.target.value)}
              placeholder="Observações (opcional)"
              className="w-full px-2.5 py-2 rounded-lg bg-input border border-border text-sm"
            />
            <button onClick={registerPayment} disabled={saving}
              className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50">
              {saving ? 'Registrando...' : 'Confirmar pagamento'}
            </button>
          </div>
        )}

        {lastPayment && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <History size={11} /> Último pagamento: {BRL(lastPayment.amount)} em {fmtDateTime(lastPayment.created_at)}
          </p>
        )}

        {/* Tabs */}
        <div className="flex gap-1.5">
          <button onClick={() => setTab('servicos')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${tab === 'servicos' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
            Histórico de serviços
          </button>
          <button onClick={() => setTab('pagamentos')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${tab === 'pagamentos' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
            Pagamentos
          </button>
        </div>

        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-4 flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Carregando...
          </p>
        ) : tab === 'servicos' ? (
          <div className="space-y-2">
            {services.length === 0 && <p className="text-center text-xs text-muted-foreground py-4">Nenhum atendimento no período.</p>}
            {services.map((s) => (
              <div key={s.agendamento_id} className="rounded-lg bg-secondary/40 p-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{s.cliente_nome}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{s.servicos}</p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <CalendarRange size={10} /> {fmtDate(s.data)} <Clock size={10} /> {String(s.hora).slice(0, 5)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-heading text-sm text-primary">{BRL(s.valor)}</p>
                  <span className="text-[10px] text-muted-foreground">{s.status}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {payments.length === 0 && <p className="text-center text-xs text-muted-foreground py-4">Nenhum pagamento registrado.</p>}
            {payments.map((p) => (
              <div key={p.id} className="rounded-lg bg-secondary/40 p-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{BRL(p.amount)} <span className="text-[10px] text-muted-foreground">· {p.metodo || '—'}</span></p>
                  <p className="text-[11px] text-muted-foreground">{fmtDateTime(p.created_at)}</p>
                  {p.observacoes && <p className="text-[11px] text-muted-foreground truncate">"{p.observacoes}"</p>}
                  {p.paid_by_name && <p className="text-[10px] text-muted-foreground">por {p.paid_by_name}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
