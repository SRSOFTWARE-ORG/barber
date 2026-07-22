import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, MessageCircle, Clock, AlertCircle, CheckCircle2, Upload, FileCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBarbershop } from '@/contexts/BarbershopContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { StatusTimeline } from '@/components/StatusTimeline';
import InAppCardCheckout from '@/components/InAppCardCheckout';


interface Appt {
  id: string;
  cliente_nome: string;
  cliente_sobrenome: string;
  cliente_telefone: string;
  data: string;
  hora: string;
  servico_ids: string[];
  status: string;
  sinal_pago: boolean;
  valor_pago: number;
  valor_sinal: number;
  taxa_app: number;
  barbeiro_id: string | null;
  barbeiro_nome: string | null;
  comprovante_url: string | null;
  pix_gerado_em: string | null;
}

interface BarberPix {
  chave_pix: string | null;
  qr_code_pix_url: string | null;
  telefone: string | null;
  full_name: string | null;
}

export default function PaymentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { services } = useBarbershop();
  const [appt, setAppt] = useState<Appt | null>(null);
  const [pix, setPix] = useState<BarberPix | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [signedComprovanteUrl, setSignedComprovanteUrl] = useState<string | null>(null);
  const [scopedServices, setScopedServices] = useState<{ id: string; nome: string }[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [method, setMethod] = useState<'pix' | 'online'>('pix');

  const MAX_SIZE = 8 * 1024 * 1024; // 8MB
  const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data } = await supabase.from('agendamentos').select('id, created_at, cliente_nome, cliente_sobrenome, data, hora, servico_ids, status, cliente_id, valor_pago, barbeiro_id, barbeiro_nome, arquivado, sinal_pago, valor_sinal, taxa_app, comprovante_url, pix_gerado_em, eh_fracionado, fase1_duracao, espera_duracao, fase2_duracao').eq('id', id).single();
      if (data) {
        setAppt(data as any);
        // Marca pix_gerado_em na primeira vez que o cliente vê a tela (inicia contagem dos 5min)
        const d: any = data;
        if (!d.sinal_pago && !d.pix_gerado_em && d.status !== 'cancelled') {
          supabase.from('agendamentos').update({ pix_gerado_em: new Date().toISOString() } as any).eq('id', id).then(() => {});
        }
        if (d.barbeiro_id) {
          const { data: p } = await supabase.rpc('get_barber_pix', { _barber_id: d.barbeiro_id });
          if (p && p.length > 0) setPix(p[0] as BarberPix);
          // Nomes dos serviços no escopo do barbeiro (multi-tenant; funciona p/ anônimos)
          const { data: svc } = await supabase.rpc('get_services_for_barber', { _barber_id: d.barbeiro_id });
          if (svc) setScopedServices((svc as any[]).map((s) => ({ id: s.id, nome: s.nome })));
        }
      }
      setLoading(false);
    };
    load();

    // Realtime: confirmação e updates da row do agendamento
    const channel = supabase
      .channel(`payment-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'agendamentos', filter: `id=eq.${id}` }, (payload) => {
        const next = payload.new as any;
        setAppt(prev => prev ? { ...prev, ...next } : next);
        if (next.sinal_pago) {
          toast.success('✓ Pagamento confirmado pelo barbeiro!');
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  // Gera signed URL do comprovante quando existir
  useEffect(() => {
    if (!appt?.comprovante_url || !appt.id) { setSignedComprovanteUrl(null); return; }
    const path = appt.comprovante_url.includes('/comprovantes/')
      ? appt.comprovante_url.split('/comprovantes/')[1]
      : appt.comprovante_url;
    supabase.storage.from('comprovantes').createSignedUrl(path, 60 * 10).then(({ data }) => {
      if (data?.signedUrl) setSignedComprovanteUrl(data.signedUrl);
    });
  }, [appt?.comprovante_url, appt?.id]);

  // Contagem regressiva de 5 minutos a partir da geração do PIX
  useEffect(() => {
    if (!appt || appt.sinal_pago || appt.status === 'cancelled' || !appt.pix_gerado_em) {
      setSecondsLeft(null);
      return;
    }
    const deadline = new Date(appt.pix_gerado_em).getTime() + 5 * 60 * 1000;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [appt?.pix_gerado_em, appt?.sinal_pago, appt?.status]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Carregando...</p></div>;
  if (!appt) return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Agendamento não encontrado.</p></div>;

  const svcNames = appt.servico_ids
    .map(sid => services.find(s => s.id === sid)?.name || scopedServices.find(s => s.id === sid)?.nome)
    .filter(Boolean).join(', ');
  const valorSinal = Number(appt.valor_sinal) || (Number(appt.valor_pago) / 2 + Number(appt.taxa_app || 3));
  const mmss = secondsLeft != null ? `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}` : null;

  const copyPix = async () => {
    if (!pix?.chave_pix) return;
    try {
      await navigator.clipboard.writeText(pix.chave_pix);
      toast.success('Chave PIX copiada!');
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  const sendWhatsApp = () => {
    if (!pix?.telefone) {
      toast.error('Barbeiro ainda não cadastrou o telefone');
      return;
    }
    const digits = pix.telefone.replace(/\D/g, '');
    const br = digits.startsWith('55') ? digits : `55${digits}`;
    const msg = encodeURIComponent(
      `Olá ${pix.full_name || 'barbeiro'}! Acabei de pagar o sinal do meu agendamento.\n\n` +
      `📅 ${format(new Date(appt.data + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })} às ${appt.hora.slice(0,5)}\n` +
      `✂️ ${svcNames}\n` +
      `💰 Sinal: R$ ${valorSinal.toFixed(2)}\n\n` +
      `Segue o comprovante 👇`
    );
    window.open(`https://wa.me/${br}?text=${msg}`, '_blank');
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-selecionar mesmo arquivo
    if (!file || !appt) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error('Formato inválido. Envie JPG, PNG, WEBP ou PDF.');
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error(`Arquivo muito grande (máx ${MAX_SIZE / 1024 / 1024}MB)`);
      return;
    }
    setPendingFile(file);
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const cancelPending = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(null);
    setPreviewUrl(null);
  };

  const confirmUpload = async () => {
    if (!pendingFile || !appt) return;
    setUploading(true);
    const ext = pendingFile.name.split('.').pop() || 'jpg';
    const path = `${appt.id}/comprovante-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('comprovantes')
      .upload(path, pendingFile, { upsert: true, contentType: pendingFile.type });
    if (upErr) {
      toast.error('Erro ao enviar comprovante: ' + upErr.message);
      setUploading(false);
      return;
    }
    await supabase.from('agendamentos').update({ comprovante_url: path } as any).eq('id', appt.id);
    setAppt({ ...appt, comprovante_url: path });
    toast.success('Comprovante enviado! Aguardando confirmação do barbeiro.');
    cancelPending();
    setUploading(false);
  };

  return (
    <div className="min-h-screen pb-20">
      <div className="page-header flex items-center gap-3 px-4">
        <button onClick={() => navigate('/')} className="text-primary"><ArrowLeft size={24} /></button>
        <h1 className="font-heading text-xl text-foreground">Pagamento do Sinal</h1>
      </div>

      <div className="px-4 space-y-4">
        {/* Status banner */}
        {appt.sinal_pago ? (
          <div className="wood-card px-4 py-4 flex items-center gap-3 border-l-4" style={{ borderLeftColor: 'hsl(120, 40%, 40%)' }}>
            <CheckCircle2 className="text-accent" size={24} />
            <div>
              <p className="font-heading text-base text-foreground">Pagamento confirmado!</p>
              <p className="text-xs text-muted-foreground">Seu horário está garantido. Até breve!</p>
            </div>
          </div>
        ) : appt.status === 'cancelled' ? (
          <div className="wood-card px-4 py-4 flex items-center gap-3 border-l-4" style={{ borderLeftColor: 'hsl(0, 70%, 45%)' }}>
            <AlertCircle className="text-destructive" size={24} />
            <div>
              <p className="font-heading text-base text-foreground">Agendamento cancelado</p>
              <p className="text-xs text-muted-foreground">O sinal não foi pago em 5 minutos. O horário foi liberado — faça um novo agendamento.</p>
            </div>
          </div>
        ) : (
          <div className="wood-card px-4 py-4 flex items-center gap-3 border-l-4" style={{ borderLeftColor: mmss && secondsLeft! <= 60 ? 'hsl(0, 70%, 45%)' : 'hsl(40, 80%, 50%)' }}>
            <Clock className={mmss && secondsLeft! <= 60 ? 'text-destructive' : 'text-primary'} size={24} />
            <div className="flex-1">
              <p className="font-heading text-base text-foreground">Aguardando pagamento</p>
              {mmss ? (
                <p className="text-xs text-muted-foreground">
                  Pague o sinal em <strong className="text-foreground tabular-nums">{mmss}</strong> ou o horário será liberado automaticamente.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">O barbeiro confirmará após receber o comprovante.</p>
              )}
            </div>
          </div>
        )}


        {/* Resumo */}
        <div className="wood-card px-4 py-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Resumo</p>
          <p className="text-foreground text-sm">{format(new Date(appt.data + 'T12:00:00'), "dd/MM/yyyy (EEEE)", { locale: ptBR })} às {appt.hora.slice(0,5)}</p>
          <p className="text-foreground text-sm">Barbeiro: {appt.barbeiro_nome || pix?.full_name}</p>
          <p className="text-foreground text-sm">Serviços: {svcNames}</p>
          <div className="pt-2 border-t border-border mt-2 space-y-0.5 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Total do corte</span><span>R$ {Number(appt.valor_pago).toFixed(2)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Taxa do app</span><span>R$ {Number(appt.taxa_app).toFixed(2)}</span></div>
            <div className="flex justify-between font-heading text-primary text-base pt-1"><span>Sinal agora (50% + taxa)</span><span>R$ {valorSinal.toFixed(2)}</span></div>
            <div className="flex justify-between text-xs text-muted-foreground"><span>Restante no dia</span><span>R$ {(Number(appt.valor_pago) / 2).toFixed(2)}</span></div>
          </div>
        </div>

        {/* Seletor de forma de pagamento */}
        {!appt.sinal_pago && appt.status !== 'cancelled' && (
          <div className="flex gap-2">
            <button onClick={() => setMethod('pix')} className={`flex-1 py-2.5 rounded-lg text-sm transition-all ${method === 'pix' ? 'slot-selected' : 'slot-available'}`}>PIX / Comprovante</button>
            <button onClick={() => setMethod('online')} className={`flex-1 py-2.5 rounded-lg text-sm transition-all ${method === 'online' ? 'slot-selected' : 'slot-available'}`}>Cartão / Boleto</button>
          </div>
        )}

        {method === 'online' && !appt.sinal_pago && appt.status !== 'cancelled' && (
          <InAppCardCheckout
            mode="appointment"
            referenceId={appt.id}
            valorSinal={valorSinal}
            defaultFirstName={appt.cliente_nome}
            defaultLastName={appt.cliente_sobrenome}
          />
        )}

        {method === 'pix' && (<>
        {/* PIX */}
        {!pix?.chave_pix && !pix?.qr_code_pix_url ? (
          <div className="wood-card px-4 py-4 flex items-start gap-3">
            <AlertCircle className="text-destructive flex-shrink-0 mt-0.5" size={20} />
            <div className="text-sm text-muted-foreground">
              O barbeiro ainda não cadastrou a chave PIX. Entre em contato pelo WhatsApp para combinar o pagamento.
            </div>
          </div>
        ) : (
          <div className="wood-card px-4 py-4 space-y-3">
            <p className="font-heading text-base text-primary">Pagamento via PIX</p>
            {pix.qr_code_pix_url && (
              <div className="flex flex-col items-center gap-2">
                <img src={pix.qr_code_pix_url} alt="QR Code PIX" className="w-56 h-56 object-contain rounded-lg bg-white p-2" />
                <p className="text-xs text-muted-foreground">Escaneie com o app do seu banco</p>
              </div>
            )}
            {pix.chave_pix && (
              <div>
                <label className="text-xs text-muted-foreground">Chave PIX</label>
                <div className="flex gap-2 mt-1">
                  <input readOnly value={pix.chave_pix} className="vintage-input flex-1 px-3 py-2 rounded-lg text-sm" />
                  <button onClick={copyPix} className="vintage-btn px-3 rounded-lg flex items-center gap-1 text-sm">
                    <Copy size={14} /> Copiar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upload comprovante */}
        <div className="wood-card px-4 py-4 space-y-3">
          <p className="font-heading text-base text-foreground flex items-center gap-2">
            <Upload size={18} /> Enviar comprovante (foto ou PDF)
          </p>
          <p className="text-[11px] text-muted-foreground">
            Formatos aceitos: JPG, PNG, WEBP, PDF • Tamanho máx: 8MB.<br />
            Apenas você e o barbeiro vinculado conseguem visualizar este arquivo.
          </p>

          {appt.comprovante_url && !pendingFile && (
            <div className="flex items-center gap-3 p-2 rounded-lg bg-accent/10 border border-accent/30">
              <FileCheck className="text-accent flex-shrink-0" size={20} />
              {signedComprovanteUrl ? (
                <a href={signedComprovanteUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent underline truncate flex-1">
                  Comprovante enviado — abrir
                </a>
              ) : (
                <span className="text-xs text-muted-foreground flex-1">Gerando link seguro...</span>
              )}
            </div>
          )}

          {/* Pré-visualização do arquivo selecionado */}
          {pendingFile && (
            <div className="space-y-2 p-3 rounded-lg border border-border bg-background/40">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-foreground truncate flex-1">
                  📎 {pendingFile.name} <span className="text-muted-foreground">({(pendingFile.size / 1024).toFixed(0)} KB)</span>
                </p>
                <button onClick={cancelPending} className="text-destructive text-xs" disabled={uploading}>Remover</button>
              </div>
              {previewUrl ? (
                <img src={previewUrl} alt="Pré-visualização do comprovante" className="max-h-64 mx-auto rounded-lg object-contain bg-black/30" />
              ) : (
                <div className="text-center text-xs text-muted-foreground py-6 bg-muted/30 rounded-lg">
                  PDF selecionado — pré-visualização não disponível
                </div>
              )}
              <button
                onClick={confirmUpload}
                disabled={uploading}
                className="vintage-btn w-full py-2 rounded-lg flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                style={{ background: 'hsl(120, 30%, 30%)' }}
              >
                <Upload size={14} /> {uploading ? 'Enviando...' : 'Confirmar envio'}
              </button>
            </div>
          )}

          {!pendingFile && (
            <label className="vintage-btn w-full py-3 rounded-lg flex items-center justify-center gap-2 text-sm cursor-pointer">
              <Upload size={16} /> {appt.comprovante_url ? 'Enviar outro comprovante' : 'Selecionar arquivo'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                className="hidden"
                onChange={handleFilePick}
              />
            </label>
          )}
        </div>

        {/* WhatsApp comprovante */}
        <div className="wood-card px-4 py-4 space-y-3">
          <p className="font-heading text-base text-foreground">Enviar comprovante por WhatsApp</p>
          <p className="text-xs text-muted-foreground">
            Abra o WhatsApp do barbeiro com a mensagem do agendamento já preenchida — basta anexar a imagem do comprovante.
          </p>
          <button
            onClick={sendWhatsApp}
            className="vintage-btn w-full py-3 rounded-lg flex items-center justify-center gap-2"
            style={{ background: 'hsl(142, 40%, 25%)' }}
          >
            <MessageCircle size={18} /> Abrir WhatsApp com mensagem pronta
          </button>
        </div>
        </>)}



        {/* Histórico/Log */}
        <div className="wood-card px-4 py-4 space-y-3">
          <p className="font-heading text-base text-foreground">Histórico do agendamento</p>
          <StatusTimeline agendamentoId={appt.id} />
        </div>

        <button onClick={() => navigate('/profile')} className="vintage-btn w-full py-3 rounded-lg text-sm opacity-80">
          Ver meus agendamentos
        </button>
      </div>
    </div>
  );
}
