import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { CreditCard, CheckCircle2, ExternalLink, TrendingUp, RefreshCw, AlertTriangle, Copy, Calendar, Users } from 'lucide-react';
import IOSDateInput from '@/components/IOSDateInput';
import { todayInputValue } from '@/lib/date';

interface DashRow {
  barber_id: string;
  barber_name: string;
  total_appointments: number;
  total_revenue: number;
  total_barber_share: number;
  total_shop_share: number;
}
interface SubRow {
  id: string;
  period_month: string;
  total_amount: number;
  base_amount: number;
  team_count: number;
  per_barber_amount: number;
  status: string;
  due_date: string;
  paid_at: string | null;
}
interface AllSubRow extends SubRow {
  shop_owner_id: string;
  shop_name: string;
}

export default function MercadoPagoPanel() {
  const { user, role } = useAuth();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [canOwnMP, setCanOwnMP] = useState<boolean | null>(null);
  const [dash, setDash] = useState<DashRow[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [allSubs, setAllSubs] = useState<AllSubRow[]>([]);
  const [prices, setPrices] = useState<{ base: number; per: number }>({ base: 99.9, per: 19.9 });
  const [pixKey, setPixKey] = useState<string>('');
  const [editingPix, setEditingPix] = useState(false);
  const [pixDraft, setPixDraft] = useState('');
  const [editingPrices, setEditingPrices] = useState(false);
  const [baseDraft, setBaseDraft] = useState('99.90');
  const [perDraft, setPerDraft] = useState('19.90');
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [{ data: conn }, { data: rows }, { data: mySubs }, { data: pix }, { data: pr }, { data: canOwn }] = await Promise.all([
      supabase.rpc('mp_is_connected', { _shop_owner_id: user.id }),
      supabase.rpc('shop_dashboard', { _shop_owner_id: user.id, _from: from, _to: to }),
      supabase.rpc('get_my_subscription_status'),
      supabase.rpc('get_app_pix_key'),
      supabase.rpc('get_subscription_prices'),
      supabase.rpc('can_barber_own_mp', { _barber_id: user.id }),
    ]);
    setConnected(Boolean(conn));
    setCanOwnMP(Boolean(canOwn));
    setDash((rows as DashRow[]) || []);
    setSubs((mySubs as SubRow[]) || []);
    setPixKey(typeof pix === 'string' ? pix : '');
    const p = Array.isArray(pr) ? pr[0] : pr;
    if (p) {
      setPrices({ base: Number(p.base_price || 99.9), per: Number(p.per_barber_price || 19.9) });
      setBaseDraft(Number(p.base_price || 99.9).toFixed(2));
      setPerDraft(Number(p.per_barber_price || 19.9).toFixed(2));
    }
    if (role === 'ceo') {
      const { data: all } = await supabase.rpc('list_all_subscriptions', { _status: null });
      setAllSubs((all as AllSubRow[]) || []);
    }
    setLoading(false);
  }, [user?.id, from, to, role]);

  useEffect(() => { load(); }, [load]);

  const connectMP = async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.functions.invoke('mp-oauth-start', { body: {} });
    if (error || !(data as any)?.url) { toast.error('Erro ao iniciar conexão'); return; }
    window.location.href = (data as any).url;
  };

  const savePix = async () => {
    const { error } = await supabase.rpc('set_app_pix_key', { _key: pixDraft.trim() });
    if (error) { toast.error('Erro ao salvar'); return; }
    toast.success('Chave PIX atualizada'); setEditingPix(false); load();
  };

  const savePrices = async () => {
    const { error } = await supabase.rpc('set_subscription_prices', {
      _base: Number(baseDraft), _per_barber: Number(perDraft),
    });
    if (error) { toast.error('Erro ao salvar preços'); return; }
    toast.success('Preços atualizados'); setEditingPrices(false); load();
  };

  const markPaid = async (id: string) => {
    if (!confirm('Confirmar recebimento desta mensalidade?')) return;
    const { error } = await supabase.rpc('mark_subscription_paid', { _id: id, _payment_id: null, _notes: null });
    if (error) { toast.error('Erro'); return; }
    toast.success('Marcada como paga'); load();
  };

  const regenerate = async () => {
    const { error } = await supabase.rpc('generate_all_invoices', {});
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Faturas regeneradas'); load();
  };

  const currentSub = subs[0];
  const owingTotal = subs.filter(s => s.status === 'pendente' || s.status === 'atrasado')
    .reduce((acc, s) => acc + Number(s.total_amount || 0), 0);

  const totals = dash.reduce((acc, r) => ({
    rev: acc.rev + Number(r.total_revenue || 0),
    barb: acc.barb + Number(r.total_barber_share || 0),
    shop: acc.shop + Number(r.total_shop_share || 0),
    apts: acc.apts + Number(r.total_appointments || 0),
  }), { rev: 0, barb: 0, shop: 0, apts: 0 });

  const fmtMonth = (d: string) => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="space-y-4 px-4">
      {/* Subscription — minha mensalidade */}
      <div className="wood-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Calendar size={20} className="text-primary" />
          <h2 className="font-heading text-lg">Mensalidade da Plataforma</h2>
          <button onClick={load} className="ml-auto p-1.5 text-muted-foreground hover:text-primary">
            <RefreshCw size={14} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          R$ <b>{prices.base.toFixed(2)}</b> por barbearia + R$ <b>{prices.per.toFixed(2)}</b> por barbeiro vinculado por mês.
        </p>

        {currentSub ? (
          <div className={`p-3 rounded-lg border ${currentSub.status === 'pago' ? 'border-green-500/30 bg-green-500/5' : currentSub.status === 'atrasado' ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="font-medium text-sm capitalize">{fmtMonth(currentSub.period_month)}</p>
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${currentSub.status === 'pago' ? 'bg-green-500/20 text-green-500' : currentSub.status === 'atrasado' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500'}`}>
                {currentSub.status}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] mb-2">
              <div><span className="text-muted-foreground">Base:</span> <b>R$ {currentSub.base_amount.toFixed(2)}</b></div>
              <div className="flex items-center gap-1"><Users size={11} /><b>{currentSub.team_count}</b> × R$ {currentSub.per_barber_amount.toFixed(2)}</div>
              <div className="text-right"><span className="text-muted-foreground">Vence:</span> {new Date(currentSub.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
            </div>
            <p className="text-2xl font-bold text-primary">R$ {currentSub.total_amount.toFixed(2)}</p>
            {currentSub.status !== 'pago' && pixKey && (
              <div className="mt-2 flex items-center gap-2 bg-secondary/40 p-2 rounded-lg">
                <code className="flex-1 text-xs font-mono break-all">{pixKey}</code>
                <button onClick={() => { navigator.clipboard.writeText(pixKey); toast.success('Copiado!'); }}
                  className="p-1.5 text-primary"><Copy size={14} /></button>
              </div>
            )}
            {currentSub.status !== 'pago' && !pixKey && (
              <p className="text-[11px] text-muted-foreground italic mt-2">Chave PIX da plataforma ainda não cadastrada.</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Nenhuma fatura gerada ainda.</p>
        )}

        {owingTotal > 0 && (
          <div className="flex items-center gap-2 text-xs bg-amber-500/10 border border-amber-500/30 rounded p-2">
            <AlertTriangle size={14} className="text-amber-500" />
            <span>Total em aberto: <b>R$ {owingTotal.toFixed(2)}</b></span>
          </div>
        )}

        {subs.length > 1 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Histórico ({subs.length - 1})</summary>
            <div className="space-y-1 mt-2">
              {subs.slice(1).map(s => (
                <div key={s.id} className="flex items-center justify-between border border-border/30 rounded p-2">
                  <span className="capitalize">{fmtMonth(s.period_month)}</span>
                  <span>R$ {s.total_amount.toFixed(2)}</span>
                  <span className={`text-[10px] uppercase ${s.status === 'pago' ? 'text-green-500' : 'text-amber-500'}`}>{s.status}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Configuração de cobrança (por barbeiro) */}
      <PaymentConfigCard userId={user?.id} mpConnected={connected === true} onConnectMP={connectMP} />

      {/* MP Connection (a conta MP é DESTE barbeiro) */}
      <div className="wood-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard size={20} className="text-primary" />
          <h2 className="font-heading text-lg">Minha conta Mercado Pago</h2>
        </div>
        {canOwnMP === false ? (
          <div className="text-xs bg-amber-500/10 border border-amber-500/30 rounded p-3 space-y-1">
            <p className="font-medium text-amber-500">Conexão MP não liberada</p>
            <p className="text-muted-foreground">
              O dono da barbearia ainda não liberou para você receber direto na sua conta.
              Seus pagamentos caem na conta dele e ele faz o repasse conforme sua comissão.
            </p>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground">
              Conecte a sua conta MP. Os sinais pagos pelos seus clientes caem direto na sua conta.
            </p>
            {connected === true ? (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-green-500"><CheckCircle2 size={18} /> Conectada</span>
                <button onClick={connectMP} className="text-xs text-muted-foreground underline">Trocar conta</button>
              </div>
            ) : connected === false ? (
              <button onClick={connectMP}
                className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2">
                <ExternalLink size={14} /> Conectar Mercado Pago
              </button>
            ) : (
              <p className="text-xs text-muted-foreground">Verificando…</p>
            )}
          </>
        )}
      </div>


      {/* CEO panels */}
      {role === 'ceo' && (
        <>
          <div className="wood-card p-4 space-y-2">
            <h3 className="font-heading text-base">Preços da Mensalidade (CEO)</h3>
            {editingPrices ? (
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <label className="text-xs w-24">Base barbearia:</label>
                  <input value={baseDraft} onChange={e => setBaseDraft(e.target.value)} type="number" step="0.01"
                    className="flex-1 px-2 py-1.5 text-sm rounded-lg bg-input border border-border" />
                </div>
                <div className="flex gap-2 items-center">
                  <label className="text-xs w-24">Por barbeiro:</label>
                  <input value={perDraft} onChange={e => setPerDraft(e.target.value)} type="number" step="0.01"
                    className="flex-1 px-2 py-1.5 text-sm rounded-lg bg-input border border-border" />
                </div>
                <div className="flex gap-2">
                  <button onClick={savePrices} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium">Salvar</button>
                  <button onClick={() => setEditingPrices(false)} className="text-xs text-muted-foreground">Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between text-sm">
                <span>R$ {prices.base.toFixed(2)} + R$ {prices.per.toFixed(2)}/barbeiro</span>
                <button onClick={() => setEditingPrices(true)} className="text-xs text-primary underline">Editar</button>
              </div>
            )}
          </div>

          <div className="wood-card p-4 space-y-2">
            <h3 className="font-heading text-base">Chave PIX da plataforma (CEO)</h3>
            {editingPix ? (
              <div className="flex gap-2">
                <input value={pixDraft} onChange={e => setPixDraft(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-sm rounded-lg bg-input border border-border" placeholder="email@x.com" />
                <button onClick={savePix} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium">Salvar</button>
                <button onClick={() => setEditingPix(false)} className="text-xs text-muted-foreground">Cancelar</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-secondary/40 p-2 rounded break-all">{pixKey || '— sem chave —'}</code>
                <button onClick={() => { setPixDraft(pixKey); setEditingPix(true); }}
                  className="text-xs text-primary underline">Editar</button>
              </div>
            )}
          </div>

          <div className="wood-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-base">Todas as Mensalidades (CEO)</h3>
              <button onClick={regenerate} className="text-xs text-primary underline">Gerar mês atual</button>
            </div>
            {allSubs.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhuma fatura.</p>}
            <div className="space-y-1.5">
              {allSubs.map(s => (
                <div key={s.id} className="border border-border/30 rounded p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{s.shop_name}</span>
                    <span className={`text-[10px] uppercase font-bold ${s.status === 'pago' ? 'text-green-500' : s.status === 'atrasado' ? 'text-red-500' : 'text-amber-500'}`}>{s.status}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                    <span className="capitalize">{fmtMonth(s.period_month)} · {s.team_count} barbeiro(s)</span>
                    <span className="font-bold text-primary">R$ {Number(s.total_amount).toFixed(2)}</span>
                  </div>
                  {s.status !== 'pago' && (
                    <button onClick={() => markPaid(s.id)} className="mt-1.5 text-[11px] text-green-500 underline">
                      Marcar como paga
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Dashboard de faturamento */}
      <div className="wood-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className="text-primary" />
          <h2 className="font-heading text-lg">Faturamento por Barbeiro</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">De</label>
            <IOSDateInput value={from} onChange={setFrom} className="w-full text-sm" max={to || todayInputValue()} />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Até</label>
            <IOSDateInput value={to} onChange={setTo} className="w-full text-sm" min={from} max={todayInputValue()} />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1.5 pt-2">
          <Stat label="Atend." value={String(totals.apts)} />
          <Stat label="Bruto" value={`R$${totals.rev.toFixed(0)}`} />
          <Stat label="Barb." value={`R$${totals.barb.toFixed(0)}`} />
          <Stat label="Casa" value={`R$${totals.shop.toFixed(0)}`} />
        </div>
        {loading && <p className="text-center text-sm text-muted-foreground py-2">Carregando…</p>}
        {!loading && dash.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-3">Sem pagamentos no período.</p>
        )}
        {!loading && dash.length > 0 && (
          <div className="space-y-1.5">
            {dash.map((r) => (
              <div key={r.barber_id} className="border border-border/30 rounded-lg p-2.5">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{r.barber_name}</p>
                  <p className="text-xs text-muted-foreground">{r.total_appointments} atend.</p>
                </div>
                <div className="grid grid-cols-3 gap-1 mt-1 text-[11px]">
                  <span>Total: <b>R$ {Number(r.total_revenue).toFixed(2)}</b></span>
                  <span className="text-primary">Barb.: <b>R$ {Number(r.total_barber_share).toFixed(2)}</b></span>
                  <span className="text-muted-foreground">Casa: <b>R$ {Number(r.total_shop_share).toFixed(2)}</b></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary/40 rounded-lg p-2 text-center">
      <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
      <p className="text-sm font-bold text-primary">{value}</p>
    </div>
  );
}

// ---------- Configuração de cobrança por barbeiro ----------
function PaymentConfigCard({ userId, mpConnected, onConnectMP }: { userId?: string; mpConnected: boolean; onConnectMP: () => void }) {
  const [modo, setModo] = useState<'pix' | 'mp'>('pix');
  const [percentual, setPercentual] = useState(50);
  const [taxa, setTaxa] = useState(3);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    // Lê dados de pagamento do próprio dono via função segura (campos sensíveis
    // não são mais legíveis diretamente na tabela profiles).
    (supabase.rpc as any)('get_my_payment_profile')
      .then(({ data }: any) => {
        const row = Array.isArray(data) ? data[0] : data;
        if (row) {
          setModo(row.sinal_modo || 'pix');
          setPercentual(row.sinal_percentual || 50);
          setTaxa(Number(row.taxa_app_valor ?? 3));
        }
        setLoaded(true);
      });
  }, [userId]);

  const save = async () => {
    if (!userId) return;
    if (modo === 'mp' && !mpConnected) {
      toast.error('Conecte sua conta MP antes de selecionar este modo');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      sinal_modo: modo,
      sinal_percentual: percentual,
      taxa_app_valor: taxa,
    } as any).eq('id', userId);
    setSaving(false);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    toast.success('Configuração salva!');
  };

  if (!loaded) return <div className="wood-card p-4 text-xs text-muted-foreground">Carregando configuração…</div>;

  return (
    <div className="wood-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <CreditCard size={20} className="text-primary" />
        <h2 className="font-heading text-lg">Como cobrar o sinal</h2>
      </div>

      {/* Modo */}
      <div className="space-y-2">
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Modo de pagamento</label>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setModo('pix')}
            className={`p-3 rounded-xl border-2 text-left transition-all ${modo === 'pix' ? 'border-primary bg-primary/10' : 'border-border/40 bg-background/40'}`}>
            <p className="font-semibold text-sm">PIX (comprovante)</p>
            <p className="text-[10px] text-muted-foreground">Cliente envia comprovante, você confirma</p>
          </button>
          <button onClick={() => setModo('mp')}
            className={`p-3 rounded-xl border-2 text-left transition-all ${modo === 'mp' ? 'border-primary bg-primary/10' : 'border-border/40 bg-background/40'}`}>
            <p className="font-semibold text-sm">Mercado Pago</p>
            <p className="text-[10px] text-muted-foreground">Cliente paga online, direto na sua conta</p>
          </button>
        </div>
        {modo === 'mp' && !mpConnected && (
          <button onClick={onConnectMP} className="w-full text-xs py-2 rounded-lg bg-amber-500/15 text-amber-500 border border-amber-500/40 flex items-center justify-center gap-1.5">
            <AlertTriangle size={12} /> Vincule sua conta MP para usar este modo
          </button>
        )}
      </div>

      {/* % sinal */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="uppercase tracking-wider text-muted-foreground">Sinal exigido</span>
          <span className="font-bold text-primary">{percentual}%</span>
        </div>
        <input type="range" min={10} max={100} step={5} value={percentual}
          onChange={(e) => setPercentual(Number(e.target.value))}
          className="w-full accent-primary" />
        <p className="text-[10px] text-muted-foreground">% do total dos serviços que o cliente paga no ato do agendamento</p>
      </div>

      {/* Taxa app */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="uppercase tracking-wider text-muted-foreground">Taxa do app (por agendamento)</span>
          <span className="font-bold text-primary">{taxa === 0 ? 'Isenta' : `R$ ${taxa.toFixed(2)}`}</span>
        </div>
        <input type="range" min={0} max={3} step={0.5} value={taxa}
          onChange={(e) => setTaxa(Number(e.target.value))}
          className="w-full accent-primary" />
        <p className="text-[10px] text-muted-foreground">Mínimo R$ 0 (isenta) · Máximo R$ 3 · cobrada uma vez por agendamento, somada ao sinal</p>
      </div>

      <button onClick={save} disabled={saving}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50">
        {saving ? 'Salvando…' : 'Salvar configuração'}
      </button>
    </div>
  );
}

