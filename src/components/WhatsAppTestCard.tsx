import { useState, useEffect } from 'react';
import { Send, RefreshCw, CheckCircle2, AlertCircle, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface Props { barberPhone?: string | null }

export default function WhatsAppTestCard({ barberPhone }: Props) {
  const { user } = useAuth();
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState('Olá! Esta é uma mensagem de teste do app da barbearia. ✂️');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; info?: string } | null>(null);

  useEffect(() => {
    (async () => {
      if (barberPhone) { setPhone(barberPhone); return; }
      if (user?.id) {
        const { data } = await supabase.from('profiles').select('telefone').eq('id', user.id).maybeSingle();
        if (data?.telefone) setPhone(data.telefone);
      }
    })();
  }, [user?.id, barberPhone]);

  const send = async () => {
    if (!phone.trim()) { toast.error('Informe um número'); return; }
    setSending(true); setResult(null);
    const { data, error } = await supabase.functions.invoke('evolution-send', {
      body: { number: phone, message: msg, test: true },
    });
    setSending(false);
    if (error) { setResult({ ok: false, info: error.message }); toast.error(error.message); return; }
    const ok = !!data?.ok;
    setResult({ ok, info: ok ? 'Enviado com sucesso' : (data?.data?.message || data?.error || 'Falha') });
    if (ok) toast.success('Mensagem enviada'); else toast.error('Falha no envio');
  };

  return (
    <div className="wood-card px-4 py-4 space-y-3">
      <h3 className="font-heading text-sm text-primary flex items-center gap-2">
        <MessageCircle size={14}/> Teste de WhatsApp
      </h3>
      <p className="text-[11px] text-muted-foreground">Envia uma mensagem real para validar a integração. O CEO precisa ter configurado a Evolution API.</p>
      <label className="block text-xs">
        <span className="text-muted-foreground">Número (com DDI)</span>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="5511999999999" className="vintage-input w-full px-3 py-2 rounded-lg mt-1"/>
      </label>
      <label className="block text-xs">
        <span className="text-muted-foreground">Mensagem</span>
        <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={3} className="vintage-input w-full px-3 py-2 rounded-lg mt-1 text-xs resize-y"/>
      </label>
      {result && (
        <div className={`text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${result.ok ? 'bg-green-900/30 text-green-400' : 'bg-destructive/20 text-destructive'}`}>
          {result.ok ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>}
          {result.info}
        </div>
      )}
      <button onClick={send} disabled={sending} className="vintage-btn w-full py-2 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-40">
        {sending ? <RefreshCw size={14} className="animate-spin"/> : <Send size={14}/>}
        {sending ? 'Enviando...' : 'Enviar mensagem de teste'}
      </button>
    </div>
  );
}
