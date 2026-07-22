import { useState } from 'react';
import { KeyRound, Eye, EyeOff, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * Card no painel admin (e CEO) para o próprio usuário alterar a senha.
 */
export default function AdminChangePasswordCard() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (pw.length < 6) { toast.error('Senha deve ter pelo menos 6 caracteres'); return; }
    if (pw !== pw2) { toast.error('As senhas não coincidem'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('change-own-password', {
        body: { newPassword: pw },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Senha alterada! Use a nova senha no próximo login.');
      setPw(''); setPw2('');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao alterar senha');
    }
    setSaving(false);
  };

  return (
    <div className="wood-card px-4 py-4 space-y-3 mt-4">
      <h3 className="font-heading text-base text-primary flex items-center gap-2">
        <KeyRound size={16} /> Alterar minha senha
      </h3>
      <p className="text-xs text-muted-foreground">
        A nova senha passa a valer no próximo login. O CEO também consegue ver/alterar pelo painel dele.
      </p>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={pw}
          onChange={e => setPw(e.target.value)}
          placeholder="Nova senha (mín. 6 caracteres)"
          className="vintage-input w-full px-3 py-2 pr-10 rounded-lg text-sm"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary p-1"
          aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      <input
        type={show ? 'text' : 'password'}
        value={pw2}
        onChange={e => setPw2(e.target.value)}
        placeholder="Confirme a nova senha"
        className="vintage-input w-full px-3 py-2 rounded-lg text-sm"
      />
      <button
        onClick={handleSave}
        disabled={saving || !pw || !pw2}
        className="vintage-btn w-full py-2 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-40"
      >
        <Save size={14} /> {saving ? 'Salvando...' : 'Salvar nova senha'}
      </button>
    </div>
  );
}
