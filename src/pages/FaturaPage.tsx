import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Receipt, Users, Calendar, ExternalLink, CheckCircle2,
  AlertTriangle, Info, Copy, Sparkles, Zap, CreditCard, Wallet, FileText,
  X, Mail, ShieldCheck, Clock, Check, QrCode,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import InAppCardCheckout from '@/components/InAppCardCheckout';
import { useT } from '@/contexts/LanguageContext';

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

type MethodId = 'pix' | 'debit' | 'credit' | 'boleto';

const METHODS: {
  id: MethodId;
  label: string;
  short: string;
  fee: number;
  icon: typeof Zap;
  desc: string;
}[] = [
  { id: 'pix',    label: 'PIX',              short: 'PIX',     fee: 0.0099, icon: Zap,        desc: 'Aprovação na hora • menor juros' },
  { id: 'debit',  label: 'Cartão de Débito', short: 'Débito',  fee: 0.0299, icon: Wallet,     desc: 'Aprovação imediata' },
  { id: 'credit', label: 'Cartão de Crédito',short: 'Crédito', fee: 0.0499, icon: CreditCard, desc: 'Parcelável no MP' },
  { id: 'boleto', label: 'Boleto Bancário',  short: 'Boleto',  fee: 0.0349, icon: FileText,   desc: 'Compensação em 1–3 dias úteis' },
];

export default function FaturaPage() {
  const navigate = useNavigate();
  const t = useT();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [pixKey, setPixKey] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  const [method, setMethod] = useState<MethodId | null>(null);
  const [pixModal, setPixModal] = useState<{ sub: SubRow } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: mySubs }, { data: pix }] = await Promise.all([
      supabase.rpc('get_my_subscription_status'),
      supabase.rpc('get_app_pix_key'),
    ]);
    setSubs((mySubs as SubRow[]) || []);
    setPixKey(typeof pix === 'string' ? pix : '');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const s = params.get('status');
    if (s === 'ok') toast.success(t('fatura.paidToast'));
    else if (s === 'pending') toast.info(t('fatura.pendingToast'));
    else if (s === 'fail') toast.error(t('fatura.failToast'));
  }, [params]);

  const payWithMP = async (sub: SubRow) => {
    if (!method) { toast.error(t('fatura.chooseMethodError')); return; }
    if (method === 'pix') {
      setPixModal({ sub });
      return;
    }
    setPaying(sub.id);
    const { data, error } = await supabase.functions.invoke('subscription-checkout', {
      body: { subscription_id: sub.id, method },
    });
    setPaying(null);
    if (error || !(data as any)?.init_point) {
      toast.error((data as any)?.error || error?.message || t('fatura.startError'));
      return;
    }
    window.location.href = (data as any).init_point;
  };

  const fmtMonth = (d: string) => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  const current = subs.find(s => s.status !== 'pago') || subs[0];
  const totalPending = subs.filter(s => s.status !== 'pago')
    .reduce((acc, s) => acc + Number(s.total_amount || 0), 0);

  const selected = METHODS.find(m => m.id === method);
  const net = current ? Number(current.total_amount) : 0;
  const gross = selected ? +(net / (1 - selected.fee)).toFixed(2) : net;
  const feeAmt = selected ? +(gross - net).toFixed(2) : 0;

  return (
    <div className="page-shell min-h-screen pb-24">
      <div className="page-header flex items-center gap-3 px-4">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/more'))} className="text-primary" aria-label="Voltar"><ArrowLeft size={24} /></button>
        <h1 className="font-heading text-xl text-foreground">{t('fatura.title')}</h1>
      </div>

      <BlockedBanner />



      {loading && <p className="text-center text-sm text-muted-foreground py-8">{t('common.loading')}</p>}

      {!loading && !current && (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          {t('fatura.empty')}
        </div>
      )}

      {!loading && current && (
        <div className="px-4 space-y-4">
          {/* HERO — Fatura atual */}
          <div className="relative overflow-hidden rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-card via-card to-primary/5 shadow-[0_8px_30px_-8px_hsl(var(--primary)/0.4)]">
            {/* Glow decoration */}
            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-56 h-56 rounded-full bg-accent/15 blur-3xl pointer-events-none" />

            <div className="relative p-5 space-y-4">
              {/* Cabeçalho */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                    <Sparkles size={11} className="text-primary" />
                    <span>{t('fatura.monthInvoice')}</span>
                  </div>
                  <h2 className="font-heading text-2xl capitalize text-foreground leading-none">
                    {fmtMonth(current.period_month)}
                  </h2>
                </div>
                <span className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-full shadow ${
                  current.status === 'pago' ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/40' :
                  current.status === 'atrasado' ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/40' :
                  'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40'
                }`}>
                  {statusLabel(current.status, t)}
                </span>
              </div>

              {/* Breakdown */}
              <div className="space-y-1.5 text-sm bg-background/40 rounded-xl p-3 backdrop-blur-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('fatura.base')}</span>
                  <span className="font-medium">R$ {Number(current.base_amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Users size={13} /> {current.team_count} × R$ {Number(current.per_barber_amount).toFixed(2)}
                  </span>
                  <span className="font-medium">R$ {(current.team_count * Number(current.per_barber_amount)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-border/40">
                  <span className="font-semibold">{t('fatura.subtotal')}</span>
                  <span className="font-bold text-foreground">R$ {net.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Calendar size={12} /> {t('fatura.dueIn')}
                </span>
                <span className="font-semibold text-foreground">
                  {new Date(current.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
              </div>

              {current.status !== 'pago' && (
                <>
                  {/* Seleção de método — Checkout transparente */}
                  <div className="pt-2 space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <CreditCard size={11} className="text-primary" />
                      {t('fatura.choosePayment')}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {METHODS.map(m => {
                        const Icon = m.icon;
                        const active = method === m.id;
                        return (
                          <button
                            key={m.id}
                            onClick={() => setMethod(m.id)}
                            className={`text-left p-3 rounded-xl border-2 transition-all ${
                              active
                                ? 'border-primary bg-primary/15 shadow-[0_4px_16px_-4px_hsl(var(--primary)/0.5)] scale-[1.02]'
                                : 'border-border/40 bg-background/40 hover:border-primary/40'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Icon size={16} className={active ? 'text-primary' : 'text-muted-foreground'} />
                              <span className={`text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>
                                {m.short}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-tight">
                              Juros {(m.fee * 100).toFixed(2).replace('.', ',')}%
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Resumo + ação */}
                  {selected ? (
                    selected.id === 'pix' ? (
                      <>
                        <div className="relative bg-gradient-to-br from-primary/20 via-primary/10 to-transparent rounded-2xl p-4 text-center border border-primary/30">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">
                            {t('fatura.totalPix')}
                          </p>
                          <p className="text-4xl font-extrabold text-primary leading-none tracking-tight">
                            R$ {gross.toFixed(2)}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-2">
                            R$ {net.toFixed(2)} <span className="opacity-60">+</span> R$ {feeAmt.toFixed(2)} <span className="opacity-60">{t('fatura.feeMp')}</span>
                          </p>
                        </div>
                        <button
                          onClick={() => payWithMP(current)}
                          disabled={paying === current.id}
                          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_6px_20px_-6px_hsl(var(--primary)/0.6)] active:scale-[0.98] transition-transform"
                        >
                          {paying === current.id ? (
                            <span className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                          ) : (
                            <>
                              <QrCode size={17} /> {t('fatura.payPix', { valor: gross.toFixed(2) })}
                            </>
                          )}
                        </button>
                      </>
                    ) : (
                      <div className="pt-1">
                        <InAppCardCheckout
                          mode="subscription"
                          referenceId={current.id}
                          valorSinal={net}
                          amountLabel={t('fatura.invoiceLabel')}
                          onApproved={load}
                        />
                      </div>
                    )
                  ) : (
                    <div className="border-2 border-dashed border-border/50 rounded-xl p-4 text-center text-xs text-muted-foreground">
                      {t('fatura.selectMethod')}
                    </div>
                  )}

                  {/* PIX direto sem juros */}
                  {pixKey && (
                    <details className="text-xs group">
                      <summary className="cursor-pointer text-muted-foreground py-2 hover:text-primary transition-colors flex items-center gap-1">
                        <Zap size={12} /> {t('fatura.pixDirect')}
                      </summary>
                      <div className="mt-2 space-y-2 bg-secondary/30 p-3 rounded-xl border border-border/30">
                        <p className="text-[11px]">
                          {t('fatura.pixDirectNote', { valor: net.toFixed(2) })}
                        </p>
                        <div className="flex items-center gap-2 bg-background/60 p-2 rounded-lg">
                          <code className="flex-1 text-xs font-mono break-all">{pixKey}</code>
                          <button onClick={() => { navigator.clipboard.writeText(pixKey); toast.success(t('common.copied')); }}
                            className="p-1.5 text-primary hover:bg-primary/10 rounded"><Copy size={14} /></button>
                        </div>
                      </div>
                    </details>
                  )}
                </>
              )}

              {current.status === 'pago' && (
                <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 rounded-xl p-3 ring-1 ring-green-500/30">
                  <CheckCircle2 size={20} />
                  <span>{t('fatura.paidOn', { data: current.paid_at ? new Date(current.paid_at).toLocaleDateString('pt-BR') : '—' })}</span>
                </div>
              )}
            </div>
          </div>

          {totalPending > 0 && subs.filter(s => s.status !== 'pago').length > 1 && (
            <div className="flex items-center gap-2 text-xs bg-red-500/10 border border-red-500/30 rounded-xl p-2.5">
              <AlertTriangle size={14} className="text-red-500" />
              <span>{t('fatura.openInvoices', { valor: totalPending.toFixed(2) })}</span>
            </div>
          )}

          {/* Histórico */}
          {subs.length > 1 && (
            <div className="wood-card p-4 space-y-2">
              <h3 className="font-heading text-base flex items-center gap-2">
                <Receipt size={16} className="text-primary" /> {t('fatura.history')}
              </h3>
              <div className="space-y-1.5">
                {subs.map(s => (
                  <div key={s.id} className="flex items-center justify-between border border-border/30 rounded-lg p-2.5 text-sm">
                    <span className="capitalize">{fmtMonth(s.period_month)}</span>
                    <span className="font-medium">R$ {Number(s.total_amount).toFixed(2)}</span>
                    <span className={`text-[10px] uppercase font-bold ${s.status === 'pago' ? 'text-green-400' : s.status === 'atrasado' ? 'text-red-400' : 'text-amber-400'}`}>
                      {statusLabel(s.status, t)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {pixModal && (
        <PixCheckoutModal
          sub={pixModal.sub}
          onClose={() => setPixModal(null)}
          onPaid={() => { setPixModal(null); load(); }}
        />
      )}
    </div>
  );
}

function statusLabel(status: string, t: (k: string) => string): string {
  if (status === 'pago') return t('fatura.statusPaid');
  if (status === 'atrasado') return t('fatura.statusLate');
  if (status === 'pendente') return t('fatura.statusPending');
  return status;
}

function BlockedBanner() {
  const { shopBlocked } = useAuth();
  const t = useT();
  if (!shopBlocked) return null;
  return (
    <div className="mx-4 mb-3 mt-2 rounded-xl border-2 border-red-500/50 bg-red-500/10 p-3 flex gap-2">
      <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
      <div className="text-xs">
        <p className="font-bold text-red-400">{t('fatura.blockedTitle')}</p>
        <p className="text-muted-foreground mt-0.5">{t('fatura.blockedBody')}</p>
      </div>
    </div>
  );
}

// ============================================================
// PIX Checkout Modal — in-app, premium UI, replaces MP hosted page
// ============================================================
function PixCheckoutModal({
  sub, onClose, onPaid,
}: { sub: SubRow; onClose: () => void; onPaid: () => void }) {
  const { user } = useAuth();
  type Step = 'email' | 'qr' | 'paid';
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pix, setPix] = useState<{
    payment_id: string; qr_code: string; qr_code_base64: string; amount: number; ticket_url: string;
  } | null>(null);
  const pollRef = useRef<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(30 * 60);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.toLowerCase().endsWith('@barbershop.app');

  const generate = async () => {
    if (!emailValid) { toast.error('E-mail inválido'); return; }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('subscription-pix-create', {
      body: { subscription_id: sub.id, payer_email: email.trim(), payer_name: name.trim() || (user?.user_metadata?.nome as string | undefined) || 'Cliente' },
    });
    setLoading(false);
    if (error || !(data as any)?.qr_code) {
      toast.error((data as any)?.error || error?.message || 'Erro ao gerar PIX');
      return;
    }
    setPix(data as any);
    setStep('qr');
  };

  // Poll subscription status
  useEffect(() => {
    if (step !== 'qr') return;
    pollRef.current = window.setInterval(async () => {
      const { data } = await supabase.rpc('get_my_subscription_status');
      const row = (data as SubRow[] | null)?.find(s => s.id === sub.id);
      if (row?.status === 'pago') {
        setStep('paid');
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, sub.id]);

  // Countdown
  useEffect(() => {
    if (step !== 'qr') return;
    const t = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [step]);

  const copyCode = async () => {
    if (!pix?.qr_code) return;
    await navigator.clipboard.writeText(pix.qr_code);
    setCopied(true);
    toast.success('Código PIX copiado!');
    setTimeout(() => setCopied(false), 2200);
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60), r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-6 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-md max-h-[92vh] overflow-y-auto bg-card/90 backdrop-blur-xl border border-border/50 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.6)] rounded-t-3xl md:rounded-3xl animate-in slide-in-from-bottom-8 md:slide-in-from-bottom-4 duration-300"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card/80 backdrop-blur-xl border-b border-border/40 px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center ring-1 ring-primary/30">
              <Zap size={17} className="text-primary" />
            </div>
            <div>
              <p className="font-heading text-sm leading-none">Pagamento PIX</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Aprovação na hora • Seguro</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary/60 text-muted-foreground transition-all">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Resumo persistente */}
          <div className="rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/25 p-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Total a pagar</p>
            <p className="text-3xl font-extrabold text-primary leading-none mt-1">
              R$ {(pix?.amount ?? +(sub.total_amount / (1 - 0.0099)).toFixed(2)).toFixed(2)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Mensalidade Barbershop — {new Date(sub.period_month + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </p>
          </div>

          {step === 'email' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Mail size={11} /> E-mail para receber o comprovante
                </label>
                <div className="relative">
                  <input
                    type="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className={`w-full px-4 py-3 rounded-xl bg-background/60 border-2 outline-none text-sm transition-all duration-300 ${
                      email.length === 0 ? 'border-border/50 focus:border-primary' :
                      emailValid ? 'border-green-500/60 focus:border-green-500' : 'border-red-500/50 focus:border-red-500'
                    }`}
                  />
                  {email.length > 0 && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {emailValid
                        ? <CheckCircle2 size={18} className="text-green-500" />
                        : <AlertTriangle size={18} className="text-red-500" />}
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">Use um e-mail real. Não é compartilhado.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Seu nome (opcional)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={(user?.user_metadata?.nome as string | undefined) || 'Como aparece no PIX'}
                  className="w-full px-4 py-3 rounded-xl bg-background/60 border-2 border-border/50 focus:border-primary outline-none text-sm transition-all duration-300"
                />
              </div>

              <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-background/40 rounded-xl p-2.5">
                <ShieldCheck size={14} className="text-green-500 shrink-0" />
                <span>Pagamento processado pelo Mercado Pago. Confirmação automática.</span>
              </div>

              <button
                onClick={generate}
                disabled={!emailValid || loading}
                className="w-full py-4 rounded-xl font-bold text-base bg-gradient-to-r from-primary via-primary to-primary/80 text-primary-foreground shadow-[0_10px_30px_-8px_hsl(var(--primary)/0.7)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <>
                    <QrCode size={18} /> Gerar PIX
                  </>
                )}
              </button>
            </div>
          )}

          {step === 'qr' && pix && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-400">
              {/* QR Code */}
              <div className="bg-white p-4 rounded-2xl flex items-center justify-center ring-1 ring-border/30">
                {pix.qr_code_base64 ? (
                  <img
                    src={`data:image/png;base64,${pix.qr_code_base64}`}
                    alt="QR Code PIX"
                    className="w-56 h-56 object-contain"
                  />
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center text-gray-400">
                    <QrCode size={80} />
                  </div>
                )}
              </div>

              <div className="text-center">
                <p className="text-[11px] text-muted-foreground">Escaneie com o app do seu banco</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5 flex items-center justify-center gap-1">
                  <Clock size={10} /> Expira em {fmtTime(secondsLeft)}
                </p>
              </div>

              {/* Copy code */}
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Ou copie o código PIX</p>
                <div className="flex items-stretch gap-2">
                  <code className="flex-1 text-[10px] font-mono break-all bg-background/60 border border-border/40 rounded-xl p-3 max-h-20 overflow-y-auto">
                    {pix.qr_code}
                  </code>
                </div>
                <button
                  onClick={copyCode}
                  className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-300 ${
                    copied
                      ? 'bg-green-500/20 text-green-400 ring-2 ring-green-500/40 scale-[1.01]'
                      : 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:scale-[1.02] active:scale-[0.98] shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.6)]'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check size={18} className="animate-in zoom-in duration-200" /> Copiado!
                    </>
                  ) : (
                    <>
                      <Copy size={16} /> Copiar código PIX
                    </>
                  )}
                </button>
              </div>

              <div className="text-center text-[11px] text-muted-foreground bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5 flex items-center justify-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                Aguardando pagamento… liberação automática
              </div>
            </div>
          )}

          {step === 'paid' && (
            <div className="py-8 text-center space-y-3 animate-in fade-in zoom-in duration-400">
              <div className="w-20 h-20 mx-auto rounded-full bg-green-500/20 ring-4 ring-green-500/30 flex items-center justify-center">
                <CheckCircle2 size={44} className="text-green-400" />
              </div>
              <h3 className="font-heading text-xl">Pagamento confirmado!</h3>
              <p className="text-sm text-muted-foreground">Sua barbearia está liberada.</p>
              <button
                onClick={onPaid}
                className="mt-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
              >
                Continuar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

