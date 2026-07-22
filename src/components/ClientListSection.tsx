import { useState, useEffect } from 'react';
import { Users, Phone, MessageCircle, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBarbershop } from '@/contexts/BarbershopContext';
import { toast } from 'sonner';

interface Client {
  id: string;
  full_name: string | null;
  telefone: string | null;
  avatar_url: string | null;
}

export default function ClientListSection() {
  const { user, role, shopDisplayName } = useAuth();
  const { settings } = useBarbershop();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const loadClients = async () => {
    if (!user?.id) return;
    setLoading(true);

    if (role === 'ceo') {
      const { data } = await supabase.from('profiles').select('id, full_name, telefone, avatar_url').order('full_name');
      const { data: roles } = await supabase.from('user_roles').select('user_id');
      const roleIds = new Set((roles || []).map(r => r.user_id));
      setClients((data || []).filter(p => !roleIds.has(p.id)));
    } else {
      const { data } = await supabase.from('profiles').select('id, full_name, telefone, avatar_url').eq('adm_responsavel_id', user.id).order('full_name');
      setClients(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadClients();
  }, [user?.id, role]);

  const handleDeleteClient = async (clientId: string, name: string | null) => {
    if (!confirm(`Tem certeza que deseja excluir ${name || 'este cliente'}? Todos os dados serão removidos permanentemente.`)) return;
    try {
      const { data, error } = await supabase.functions.invoke('manage-admin', {
        body: { action: 'delete-client', userId: clientId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Cliente excluído');
      setClients(prev => prev.filter(c => c.id !== clientId));
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir cliente');
    }
  };

  const getWhatsAppLink = (phone: string, name: string) => {
    const digits = phone.replace(/\D/g, '');
    const brPhone = digits.startsWith('55') ? digits : `55${digits}`;
    const msg = encodeURIComponent(`Olá ${name}, aqui é da ${shopDisplayName}! Tudo bem? 😊`);
    return `https://wa.me/${brPhone}?text=${msg}`;
  };

  if (loading) {
    return <p className="text-center text-muted-foreground py-8 animate-pulse">Carregando clientes...</p>;
  }

  return (
    <div className="px-4">
      <h3 className="font-heading text-base text-foreground flex items-center gap-2 mb-3">
        <Users size={16} className="text-primary" />
        Meus Clientes ({clients.length})
      </h3>
      {clients.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-sm">Nenhum cliente vinculado ainda.</p>
      ) : (
        <div className="space-y-2">
          {clients.map(c => (
            <div key={c.id} className="wood-card px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
                {c.avatar_url ? (
                  <img src={c.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-muted-foreground text-sm font-heading">
                    {(c.full_name || '?')[0]}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{c.full_name || 'Sem nome'}</p>
                {c.telefone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone size={10} /> {c.telefone}
                  </p>
                )}
              </div>
              {c.telefone && (
                <a
                  href={getWhatsAppLink(c.telefone, c.full_name || '')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-500 p-2"
                >
                  <MessageCircle size={18} />
                </a>
              )}
              {role === 'ceo' && (
                <button
                  onClick={() => handleDeleteClient(c.id, c.full_name)}
                  className="text-destructive p-2"
                  title="Excluir cliente"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
