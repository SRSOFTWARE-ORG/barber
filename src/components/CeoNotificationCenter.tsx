import { useState } from 'react';
import { Bell, Send, Users, Store, UserCircle, Megaphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AdminUser {
  user_id: string;
  display_name: string | null;
}

type Target = 'all' | 'clientes' | 'admins' | string;

export default function CeoNotificationCenter({ admins }: { admins: AdminUser[] }) {
  const [titulo, setTitulo] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [target, setTarget] = useState<Target>('all');
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<number | null>(null);

  const presets: { label: string; value: Target; icon: React.ElementType }[] = [
    { label: 'Todos', value: 'all', icon: Megaphone },
    { label: 'Clientes', value: 'clientes', icon: Users },
    { label: 'Barbeiros', value: 'admins', icon: Store },
  ];

  const handleSend = async () => {
    if (!titulo.trim() || !mensagem.trim()) {
      toast.error('Preencha título e mensagem');
      return;
    }
    setSending(true);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('manage-admin', {
        body: { action: 'broadcast', titulo: titulo.trim(), mensagem: mensagem.trim(), target },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const sent = data?.sent ?? 0;
      setLastResult(sent);
      toast.success(`Notificação enviada para ${sent} ${sent === 1 ? 'pessoa' : 'pessoas'}`);
      setTitulo('');
      setMensagem('');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar notificação');
    }
    setSending(false);
  };

  const targetLabel =
    target === 'all' ? 'Todos os usuários'
    : target === 'clientes' ? 'Todos os clientes'
    : target === 'admins' ? 'Todos os barbeiros'
    : `Clientes de ${admins.find(a => a.user_id === target)?.display_name || 'barbeiro'}`;

  return (
    <section className="px-4 space-y-4">
      <h2 className="font-heading text-base text-primary flex items-center gap-2">
        <Bell size={16} /> Central de Notificações
      </h2>
      <p className="text-xs text-muted-foreground -mt-2">
        Envie comunicados que aparecem no sino e na aba de notificações dos usuários selecionados.
      </p>

      {/* Público-alvo */}
      <div className="wood-card px-4 py-4 space-y-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-heading">Público-alvo</p>
        <div className="grid grid-cols-3 gap-2">
          {presets.map(p => {
            const Icon = p.icon;
            const active = target === p.value;
            return (
              <button
                key={p.value}
                onClick={() => setTarget(p.value)}
                className={`py-2.5 rounded-lg text-xs font-heading flex flex-col items-center gap-1 transition-all ${
                  active ? 'slot-selected' : 'bg-input/40 text-foreground'
                }`}
              >
                <Icon size={16} />
                {p.label}
              </button>
            );
          })}
        </div>

        {admins.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <UserCircle size={12} /> ou clientes de um barbeiro específico
            </p>
            <select
              value={typeof target === 'string' && !['all', 'clientes', 'admins'].includes(target) ? target : ''}
              onChange={e => setTarget(e.target.value || 'all')}
              className="vintage-input w-full px-3 py-2 rounded-lg text-sm bg-input/40"
            >
              <option value="">— selecionar barbeiro —</option>
              {admins.map(a => (
                <option key={a.user_id} value={a.user_id}>{a.display_name || 'Barbeiro'}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Conteúdo */}
      <div className="wood-card px-4 py-4 space-y-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-heading">Mensagem</p>
        <input
          placeholder="Título"
          value={titulo}
          onChange={e => setTitulo(e.target.value)}
          maxLength={80}
          className="vintage-input w-full px-3 py-2 rounded-lg text-sm"
        />
        <textarea
          placeholder="Escreva o comunicado..."
          value={mensagem}
          onChange={e => setMensagem(e.target.value)}
          rows={4}
          maxLength={500}
          className="vintage-input w-full px-3 py-2 rounded-lg text-sm resize-none"
        />
        <p className="text-[10px] text-muted-foreground text-right">{mensagem.length}/500</p>
      </div>

      {/* Pré-visualização */}
      <div className="wood-card px-4 py-3 space-y-1 border border-primary/20">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading">Pré-visualização</p>
        <div className="flex items-start gap-2 pt-1">
          <div className="mt-0.5 h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <Bell size={15} className="text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-heading text-foreground truncate">{titulo || 'Título do comunicado'}</p>
            <p className="text-xs text-muted-foreground line-clamp-2">{mensagem || 'A mensagem aparecerá aqui.'}</p>
          </div>
        </div>
      </div>

      <button
        onClick={handleSend}
        disabled={sending}
        className="w-full slot-selected py-3 rounded-xl font-heading text-sm flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Send size={16} className={sending ? 'animate-pulse' : ''} />
        {sending ? 'Enviando...' : `Enviar para ${targetLabel}`}
      </button>

      {lastResult !== null && (
        <p className="text-center text-xs text-emerald-400">
          ✓ Última campanha entregue a {lastResult} {lastResult === 1 ? 'usuário' : 'usuários'}.
        </p>
      )}
    </section>
  );
}
