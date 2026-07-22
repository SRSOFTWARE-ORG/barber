import { useEffect, useState, ReactNode, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import logoImg from '@/assets/barber-logo.png';

const maskPhone = (raw: string) => {
  let v = raw.replace(/\D/g, '').slice(0, 11);
  if (v.length > 6) v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
  else if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
  else if (v.length > 0) v = `(${v}`;
  return v;
};

/**
 * Após login social (Google/Apple), clientes são obrigados a preencher
 * nome e telefone antes de usar o app. Staff (admin/ceo) já possui dados,
 * portanto o gate só atua sobre usuários sem papel (clientes).
 */
export default function ProfileCompletionGate({ children }: { children: ReactNode }) {
  const { user, role, loading } = useAuth();
  const [status, setStatus] = useState<'checking' | 'ok' | 'needed'>('checking');
  const [nome, setNome] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const check = useCallback(async () => {
    if (!user) { setStatus('ok'); return; }
    // Staff sempre liberado.
    if (role === 'admin' || role === 'ceo') { setStatus('ok'); return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, telefone')
      .eq('id', user.id)
      .maybeSingle();

    const metaName = (user.user_metadata?.full_name || user.user_metadata?.name || '') as string;

    // Garante que exista uma linha de perfil para o usuário.
    if (!profile) {
      await supabase.from('profiles').upsert({ id: user.id, full_name: metaName || null } as any);
    }

    const fullName = (profile?.full_name || metaName || '').trim();
    const tel = (profile?.telefone || '').trim();

    if (fullName && tel) {
      setStatus('ok');
    } else {
      setNome(fullName);
      setPhone(tel);
      setStatus('needed');
    }
  }, [user, role]);

  useEffect(() => {
    if (loading) return;
    setStatus('checking');
    check();
  }, [loading, check]);

  const handleSave = async () => {
    const trimmedName = nome.trim();
    const digits = phone.replace(/\D/g, '');
    if (!trimmedName) { toast.error('Informe seu nome'); return; }
    if (digits.length < 10) { toast.error('Informe um telefone válido com DDD'); return; }
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, full_name: trimmedName, telefone: phone } as any);
    setSaving(false);
    if (error) {
      toast.error('Não foi possível salvar. Tente novamente.');
      return;
    }
    toast.success('Perfil completo! Bem-vindo 💈');
    setStatus('ok');
  };

  if (loading || status === 'checking') return <>{children}</>;

  if (status === 'needed') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 gap-4">
        <img src={logoImg} alt="Logo" className="w-20 h-20 opacity-90" />
        <div className="text-center max-w-sm">
          <h1 className="font-display text-2xl text-primary tracking-wider">Complete seu perfil</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Para continuar, precisamos do seu nome e telefone. É rápido e só será pedido uma vez.
          </p>
        </div>
        <div className="wood-card px-4 py-6 space-y-3 w-full max-w-sm">
          <input
            placeholder="Seu nome completo"
            value={nome}
            onChange={e => setNome(e.target.value)}
            className="vintage-input w-full px-3 py-2 rounded-lg"
          />
          <input
            placeholder="Celular com DDD — (11) 99999-9999"
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={e => setPhone(maskPhone(e.target.value))}
            className="vintage-input w-full px-3 py-2 rounded-lg"
          />
          <button
            onClick={handleSave}
            disabled={saving || !nome.trim() || phone.replace(/\D/g, '').length < 10}
            className="vintage-btn w-full py-2 rounded-lg text-sm disabled:opacity-40"
          >
            {saving ? 'Salvando...' : 'Salvar e continuar'}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
