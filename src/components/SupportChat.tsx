import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { MessageCircle, Send, ArrowLeft, Plus, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Ticket {
  id: string;
  adm_id: string;
  assunto: string;
  mensagem: string;
  status: string;
  resposta: string | null;
  created_at: string;
}

interface Msg {
  id: string;
  ticket_id: string;
  sender_id: string;
  conteudo: string;
  created_at: string;
}

/**
 * Chat de suporte bidirecional, seguro e privado.
 * - Clientes e barbeiros abrem chamados e conversam apenas no seu próprio chamado.
 * - O CEO vê todos os chamados e responde dentro da conversa.
 * O RLS garante que cada participante só enxergue as mensagens do seu chamado.
 */
export default function SupportChat({ ceo = false }: { ceo?: boolean }) {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newAssunto, setNewAssunto] = useState('');
  const [newMensagem, setNewMensagem] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadTickets = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    let q = supabase.from('suporte').select('*').order('created_at', { ascending: false });
    if (!ceo) q = q.eq('adm_id', user.id);
    const { data } = await q;
    const list = (data as Ticket[]) || [];
    setTickets(list);
    // CEO: resolve who opened each ticket (CEO can read all profiles)
    if (ceo && list.length > 0) {
      const ids = [...new Set(list.map(t => t.adm_id))];
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => { map[p.id] = p.full_name || 'Usuário'; });
      setNames(map);
    }
    setLoading(false);
  }, [user?.id, ceo]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const loadMessages = useCallback(async (ticketId: string) => {
    const { data } = await supabase
      .from('suporte_mensagens')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    setMessages((data as Msg[]) || []);
  }, []);

  // Realtime updates for the active ticket thread
  useEffect(() => {
    if (!active) return;
    loadMessages(active.id);
    const channel = supabase
      .channel(`suporte-${active.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'suporte_mensagens', filter: `ticket_id=eq.${active.id}`,
      }, () => loadMessages(active.id))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [active?.id, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCreate = async () => {
    if (!newAssunto.trim() || !newMensagem.trim() || !user) return;
    setSending(true);
    const { data, error } = await supabase
      .from('suporte')
      .insert({ adm_id: user.id, assunto: newAssunto.trim(), mensagem: newMensagem.trim() })
      .select('*')
      .single();
    setSending(false);
    if (error || !data) { toast.error('Erro ao abrir chamado'); return; }
    toast.success('Chamado aberto!');
    setNewAssunto(''); setNewMensagem(''); setCreating(false);
    setTickets(prev => [data as Ticket, ...prev]);
    setActive(data as Ticket);
  };

  const handleSend = async () => {
    if (!text.trim() || !active || !user) return;
    setSending(true);
    const conteudo = text.trim();
    const { error } = await supabase
      .from('suporte_mensagens')
      .insert({ ticket_id: active.id, sender_id: user.id, conteudo });
    if (error) { setSending(false); toast.error('Erro ao enviar'); return; }
    setText('');
    // Atualiza status e notifica a outra ponta quando possível
    if (ceo) {
      await supabase.from('suporte').update({ status: 'em_analise', resposta: conteudo }).eq('id', active.id);
      // CEO pode inserir notificação para qualquer usuário
      await supabase.from('notificacoes').insert({
        user_id: active.adm_id,
        tipo: 'suporte',
        titulo: '💬 Resposta do suporte',
        mensagem: `Sobre "${active.assunto}": ${conteudo.slice(0, 80)}`,
      });
    } else {
      await supabase.from('suporte').update({ status: 'pendente' }).eq('id', active.id);
    }
    setSending(false);
    loadMessages(active.id);
    loadTickets();
  };

  const markResolved = async () => {
    if (!active) return;
    await supabase.from('suporte').update({ status: 'resolvido' }).eq('id', active.id);
    toast.success('Chamado resolvido');
    setActive({ ...active, status: 'resolvido' });
    loadTickets();
  };

  const statusBadge = (status: string) => (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
      status === 'resolvido' ? 'bg-green-900/50 text-green-400' :
      status === 'em_analise' ? 'bg-yellow-900/50 text-yellow-400' :
      'bg-destructive/20 text-destructive'
    }`}>
      {status === 'pendente' ? 'Pendente' : status === 'em_analise' ? 'Em análise' : 'Resolvido'}
    </span>
  );

  // ===== Thread view =====
  if (active) {
    const allBubbles: { id: string; sender_id: string; conteudo: string; created_at: string }[] = [
      { id: 'root', sender_id: active.adm_id, conteudo: active.mensagem, created_at: active.created_at },
      ...messages,
    ];
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => setActive(null)} className="text-primary flex items-center gap-1 text-sm">
            <ArrowLeft size={16} /> Voltar
          </button>
          {statusBadge(active.status)}
        </div>
        <div className="wood-card px-4 py-3">
          <p className="text-sm font-semibold text-foreground">{active.assunto}</p>
          {ceo && <p className="text-[10px] text-muted-foreground">{names[active.adm_id] || 'Usuário'}</p>}
        </div>

        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {allBubbles.map(b => {
            const mine = b.sender_id === user?.id;
            return (
              <div key={b.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${mine ? 'bg-primary text-primary-foreground' : 'wood-card text-foreground'}`}>
                  <p className="text-sm whitespace-pre-wrap break-words">{b.conteudo}</p>
                  <p className={`text-[9px] mt-1 ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {format(new Date(b.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {active.status !== 'resolvido' ? (
          <div className="space-y-2">
            <div className="flex gap-2 items-end">
              <textarea
                placeholder="Escreva sua mensagem..."
                value={text}
                onChange={e => setText(e.target.value)}
                rows={2}
                className="vintage-input flex-1 px-3 py-2 rounded-lg text-sm resize-none"
              />
              <button
                onClick={handleSend}
                disabled={sending || !text.trim()}
                className="vintage-btn px-4 py-2 rounded-lg flex items-center justify-center disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </div>
            {ceo && (
              <button onClick={markResolved} className="text-xs text-green-500 flex items-center gap-1">
                <CheckCircle2 size={13} /> Marcar como resolvido
              </button>
            )}
          </div>
        ) : (
          <p className="text-center text-xs text-muted-foreground py-2">Chamado encerrado.</p>
        )}
      </div>
    );
  }

  // ===== List view =====
  return (
    <div className="space-y-3">
      {!ceo && (
        creating ? (
          <div className="wood-card px-4 py-4 space-y-3">
            <h3 className="font-heading text-base text-primary flex items-center gap-2">
              <MessageCircle size={16} /> Novo chamado
            </h3>
            <input
              placeholder="Assunto"
              value={newAssunto}
              onChange={e => setNewAssunto(e.target.value)}
              className="vintage-input w-full px-3 py-2 rounded-lg text-sm"
            />
            <textarea
              placeholder="Descreva sua dúvida ou problema..."
              value={newMensagem}
              onChange={e => setNewMensagem(e.target.value)}
              rows={4}
              className="vintage-input w-full px-3 py-2 rounded-lg text-sm resize-y"
            />
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={sending || !newAssunto.trim() || !newMensagem.trim()}
                className="vintage-btn flex-1 py-2 rounded-lg text-sm disabled:opacity-40">
                {sending ? 'Enviando...' : 'Abrir chamado'}
              </button>
              <button onClick={() => setCreating(false)} className="text-xs text-muted-foreground px-3">Cancelar</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating(true)} className="vintage-btn w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2">
            <Plus size={16} /> Abrir novo chamado
          </button>
        )
      )}

      <h3 className="font-heading text-base text-foreground flex items-center gap-2">
        <MessageCircle size={16} className="text-primary" /> {ceo ? 'Todos os chamados' : 'Meus chamados'}
      </h3>

      {loading ? (
        <p className="text-center text-muted-foreground py-4 animate-pulse">Carregando...</p>
      ) : tickets.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-sm">Nenhum chamado ainda.</p>
      ) : (
        <div className="space-y-2">
          {tickets.map(t => (
            <button key={t.id} onClick={() => setActive(t)} className="wood-card px-4 py-3 w-full text-left space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground truncate">{t.assunto}</p>
                {statusBadge(t.status)}
              </div>
              <p className="text-xs text-muted-foreground truncate">{t.mensagem}</p>
              <p className="text-[10px] text-muted-foreground">
                {ceo ? `${names[t.adm_id] || 'Usuário'} — ` : ''}{format(new Date(t.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
