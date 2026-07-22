import { useEffect, useRef, useState } from 'react';
import { CreditCard, Barcode, Loader2, CheckCircle2, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

declare global {
  interface Window { MercadoPago?: any; }
}

interface Props {
  /** 'appointment' = sinal cai na conta MP do barbeiro. 'subscription' = mensalidade na conta da plataforma. */
  mode?: 'appointment' | 'subscription';
  /** ID do agendamento (appointment) ou da fatura (subscription). */
  referenceId: string;
  /** Valor base exibido (sinal ou subtotal da fatura). */
  valorSinal: number;
  amountLabel?: string;
  defaultFirstName?: string;
  defaultLastName?: string;
  onApproved?: () => void;
}

type Tab = 'card' | 'boleto';

function loadMpSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.MercadoPago) return resolve();
    const existing = document.querySelector('script[data-mp-sdk]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar SDK')));
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://sdk.mercadopago.com/js/v2';
    s.async = true;
    s.setAttribute('data-mp-sdk', 'true');
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Falha ao carregar SDK do Mercado Pago'));
    document.head.appendChild(s);
  });
}

export default function InAppCardCheckout({
  mode = 'appointment',
  referenceId,
  valorSinal,
  amountLabel,
  defaultFirstName,
  defaultLastName,
  onApproved,
}: Props) {
  const [tab, setTab] = useState<Tab>('card');
  const [ready, setReady] = useState(false);
  const [keyMissing, setKeyMissing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [boleto, setBoleto] = useState<{ url: string | null } | null>(null);
  const mpRef = useRef<any>(null);

  const processFn = mode === 'subscription' ? 'mp-process-subscription' : 'mp-process-payment';
  const refKey = mode === 'subscription' ? 'subscription_id' : 'agendamento_id';
  const label = amountLabel || (mode === 'subscription' ? 'Valor da fatura' : 'Sinal a pagar');

  // Campos cartão
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState(`${defaultFirstName || ''} ${defaultLastName || ''}`.trim());
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [installments, setInstallments] = useState(1);

  // Comuns
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const body = mode === 'appointment' ? { agendamento_id: referenceId } : undefined;
        const { data } = await supabase.functions.invoke('mp-public-key', body ? { body } : {});
        const pk = (data as any)?.public_key;
        if (!pk) { if (active) setKeyMissing(true); throw new Error('Pagamento por cartão indisponível para este barbeiro. Use PIX.'); }
        await loadMpSdk();
        if (!active) return;
        mpRef.current = new window.MercadoPago(pk, { locale: 'pt-BR' });
        setReady(true);
      } catch (e: any) {
        toast.error(e?.message || 'Não foi possível iniciar o pagamento por cartão');
      }
    })();
    return () => { active = false; };
  }, [mode, referenceId]);

  const cleanDigits = (v: string) => v.replace(/\D/g, '');

  const handleCard = async () => {
    if (!mpRef.current) { toast.error('Pagamento ainda carregando...'); return; }
    const num = cleanDigits(cardNumber);
    const [mm, yy] = expiry.split('/').map((x) => x.trim());
    if (num.length < 13) { toast.error('Número do cartão inválido'); return; }
    if (!cardName.trim()) { toast.error('Informe o nome impresso no cartão'); return; }
    if (!mm || !yy) { toast.error('Validade inválida (MM/AA)'); return; }
    if (cleanDigits(cvv).length < 3) { toast.error('CVV inválido'); return; }
    if (cleanDigits(cpf).length !== 11) { toast.error('CPF inválido'); return; }
    if (!email.includes('@')) { toast.error('E-mail inválido'); return; }

    setSubmitting(true);
    try {
      const bin = num.slice(0, 8);
      const pmRes = await mpRef.current.getPaymentMethods({ bin });
      const pm = pmRes?.results?.[0];
      if (!pm) throw new Error('Cartão não reconhecido');
      const cardKind = pm.payment_type_id === 'debit_card' ? 'debit' : 'credit';

      const tokenRes = await mpRef.current.createCardToken({
        cardNumber: num,
        cardholderName: cardName.trim(),
        cardExpirationMonth: mm,
        cardExpirationYear: yy.length === 2 ? `20${yy}` : yy,
        securityCode: cleanDigits(cvv),
        identificationType: 'CPF',
        identificationNumber: cleanDigits(cpf),
      });
      if (!tokenRes?.id) throw new Error('Não foi possível validar o cartão');

      const { data, error } = await supabase.functions.invoke(processFn, {
        body: {
          [refKey]: referenceId,
          method: 'card',
          card_kind: cardKind,
          token: tokenRes.id,
          payment_method_id: pm.id,
          issuer_id: pm.issuer?.id ? String(pm.issuer.id) : undefined,
          installments: cardKind === 'debit' ? 1 : installments,
          payer: {
            email,
            first_name: cardName.trim().split(' ')[0],
            last_name: cardName.trim().split(' ').slice(1).join(' '),
            identification_type: 'CPF',
            identification_number: cleanDigits(cpf),
          },
        },
      });
      if (error) throw new Error('Falha ao processar pagamento');
      const res = data as any;
      if (res?.error) throw new Error(res.error);
      if (res?.status === 'approved') {
        setDone(true);
        toast.success(mode === 'subscription' ? 'Fatura paga! Acesso liberado.' : 'Pagamento aprovado! Horário confirmado.');
        onApproved?.();
      } else if (res?.status === 'in_process' || res?.status === 'pending') {
        toast.info('Pagamento em análise. Você será avisado na confirmação.');
      } else {
        toast.error('Pagamento recusado. Tente outro cartão.');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao processar cartão');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBoleto = async () => {
    if (cleanDigits(cpf).length !== 11) { toast.error('CPF inválido'); return; }
    if (!email.includes('@')) { toast.error('E-mail inválido'); return; }
    if (!cardName.trim()) { toast.error('Informe seu nome completo'); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke(processFn, {
        body: {
          [refKey]: referenceId,
          method: 'boleto',
          payment_method_id: 'bolbradesco',
          payer: {
            email,
            first_name: cardName.trim().split(' ')[0],
            last_name: cardName.trim().split(' ').slice(1).join(' '),
            identification_type: 'CPF',
            identification_number: cleanDigits(cpf),
          },
        },
      });
      if (error) throw new Error('Falha ao gerar boleto');
      const res = data as any;
      if (res?.error) throw new Error(res.error);
      setBoleto({ url: res?.boleto_url || null });
      toast.success('Boleto gerado! A confirmação ocorre após a compensação.');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao gerar boleto');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="wood-card px-4 py-6 flex flex-col items-center gap-2 text-center">
        <CheckCircle2 className="text-accent" size={40} />
        <p className="font-heading text-lg text-foreground">
          {mode === 'subscription' ? 'Fatura paga!' : 'Pagamento aprovado!'}
        </p>
        <p className="text-xs text-muted-foreground">
          {mode === 'subscription' ? 'Sua barbearia está liberada.' : 'Seu horário está garantido. Até breve!'}
        </p>
      </div>
    );
  }

  if (keyMissing) {
    return (
      <div className="wood-card px-4 py-5 text-center space-y-1">
        <p className="font-heading text-sm text-foreground">Cartão/Boleto indisponível</p>
        <p className="text-xs text-muted-foreground">
          {mode === 'subscription'
            ? 'Pagamento online temporariamente indisponível. Use o PIX abaixo.'
            : 'Este barbeiro ainda não conectou o Mercado Pago. Use o PIX ou envie o comprovante.'}
        </p>
      </div>
    );
  }

  return (
    <div className="wood-card px-4 py-4 space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setTab('card')}
          className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 text-sm transition-all ${tab === 'card' ? 'slot-selected' : 'slot-available'}`}
        >
          <CreditCard size={16} /> Cartão
        </button>
        <button
          onClick={() => setTab('boleto')}
          className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 text-sm transition-all ${tab === 'boleto' ? 'slot-selected' : 'slot-available'}`}
        >
          <Barcode size={16} /> Boleto
        </button>
      </div>

      <div className="flex justify-between items-center text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-heading text-primary text-base">R$ {valorSinal.toFixed(2)}</span>
      </div>
      <p className="text-[10px] text-muted-foreground -mt-2">
        O juros do método é somado pelo Mercado Pago no checkout.
      </p>

      {!ready && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
          <Loader2 className="animate-spin" size={16} /> Carregando pagamento seguro...
        </div>
      )}

      {tab === 'card' ? (
        <div className="space-y-3">
          <input
            inputMode="numeric"
            placeholder="Número do cartão"
            value={cardNumber}
            onChange={(e) => setCardNumber(cleanDigits(e.target.value).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '))}
            className="vintage-input w-full px-3 py-2.5 rounded-lg text-sm"
          />
          <input
            placeholder="Nome impresso no cartão"
            value={cardName}
            onChange={(e) => setCardName(e.target.value)}
            className="vintage-input w-full px-3 py-2.5 rounded-lg text-sm"
          />
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              placeholder="MM/AA"
              value={expiry}
              onChange={(e) => {
                let v = cleanDigits(e.target.value).slice(0, 4);
                if (v.length > 2) v = `${v.slice(0, 2)}/${v.slice(2)}`;
                setExpiry(v);
              }}
              className="vintage-input flex-1 px-3 py-2.5 rounded-lg text-sm"
            />
            <input
              inputMode="numeric"
              placeholder="CVV"
              value={cvv}
              onChange={(e) => setCvv(cleanDigits(e.target.value).slice(0, 4))}
              className="vintage-input flex-1 px-3 py-2.5 rounded-lg text-sm"
            />
          </div>
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              placeholder="CPF do titular"
              value={cpf}
              onChange={(e) => setCpf(cleanDigits(e.target.value).slice(0, 11))}
              className="vintage-input flex-1 px-3 py-2.5 rounded-lg text-sm"
            />
            <select
              value={installments}
              onChange={(e) => setInstallments(Number(e.target.value))}
              className="vintage-input px-3 py-2.5 rounded-lg text-sm"
            >
              {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}x</option>)}
            </select>
          </div>
          <input
            type="email"
            placeholder="E-mail para recibo"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="vintage-input w-full px-3 py-2.5 rounded-lg text-sm"
          />
          <button
            onClick={handleCard}
            disabled={!ready || submitting}
            className="vintage-btn w-full py-3 rounded-lg flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            style={{ background: 'hsl(120, 30%, 30%)' }}
          >
            {submitting ? <Loader2 className="animate-spin" size={16} /> : <CreditCard size={16} />}
            {submitting ? 'Processando...' : `Pagar R$ ${valorSinal.toFixed(2)}`}
          </button>
          <p className="text-[10px] text-muted-foreground text-center">
            🔒 Dados protegidos pelo Mercado Pago. Não armazenamos o cartão.
          </p>
        </div>
      ) : boleto ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-accent">
            <CheckCircle2 size={18} /> <span className="text-sm font-heading">Boleto gerado</span>
          </div>
          {boleto.url ? (
            <a
              href={boleto.url}
              target="_blank"
              rel="noopener noreferrer"
              className="vintage-btn w-full py-3 rounded-lg flex items-center justify-center gap-2 text-sm"
            >
              <ExternalLink size={16} /> Abrir boleto
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">Boleto criado. Verifique seu e-mail.</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            A confirmação ocorre automaticamente após a compensação (pode levar até 1 dia útil).
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            placeholder="Nome completo"
            value={cardName}
            onChange={(e) => setCardName(e.target.value)}
            className="vintage-input w-full px-3 py-2.5 rounded-lg text-sm"
          />
          <input
            inputMode="numeric"
            placeholder="CPF"
            value={cpf}
            onChange={(e) => setCpf(cleanDigits(e.target.value).slice(0, 11))}
            className="vintage-input w-full px-3 py-2.5 rounded-lg text-sm"
          />
          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="vintage-input w-full px-3 py-2.5 rounded-lg text-sm"
          />
          <button
            onClick={handleBoleto}
            disabled={submitting}
            className="vintage-btn w-full py-3 rounded-lg flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {submitting ? <Loader2 className="animate-spin" size={16} /> : <Barcode size={16} />}
            {submitting ? 'Gerando...' : 'Gerar boleto'}
          </button>
        </div>
      )}
    </div>
  );
}
