import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Trash2, Users, Percent, DollarSign, KeyRound, X, Wallet, CalendarClock } from 'lucide-react';

interface TeamMember {
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_owner: boolean;
  rating_avg: number;
  rating_count: number;
  commission_type: string | null;
  commission_value: number | null;
  allow_own_mp: boolean;
}

export const PAY_FREQUENCIES: { value: string; label: string }[] = [
  { value: 'diario', label: 'Diário' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'anual', label: 'Anual' },
];

export default function BarberTeamPanel() {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [freqMap, setFreqMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<TeamMember | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [{ data }, { data: teamRows }] = await Promise.all([
      supabase.rpc('list_barbers_of_shop', { _shop_owner_id: user.id }),
      supabase.from('barbershop_team').select('barber_id, pay_frequency').eq('shop_owner_id', user.id),
    ]);
    setMembers((data as TeamMember[]) || []);
    const fm: Record<string, string> = {};
    ((teamRows as any[]) || []).forEach((r) => { fm[r.barber_id] = r.pay_frequency || 'semanal'; });
    setFreqMap(fm);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const updateCommission = async (barberId: string, ctype: string, cval: number) => {
    if (!user?.id) return;
    const { error } = await supabase.from('barbershop_team')
      .update({ commission_type: ctype, commission_value: cval })
      .eq('shop_owner_id', user.id).eq('barber_id', barberId);
    if (error) { toast.error('Erro ao salvar'); return; }
    toast.success('Comissão atualizada');
    load();
  };

  const updatePayFrequency = async (barberId: string, freq: string) => {
    if (!user?.id) return;
    setFreqMap((prev) => ({ ...prev, [barberId]: freq }));
    const { error } = await supabase.from('barbershop_team')
      .update({ pay_frequency: freq } as any)
      .eq('shop_owner_id', user.id).eq('barber_id', barberId);
    if (error) { toast.error('Erro ao salvar período'); return; }
    toast.success('Período de pagamento atualizado');
  };

  const toggleOwnMP = async (barberId: string, value: boolean) => {
    if (!user?.id) return;
    const { error } = await supabase.from('barbershop_team')
      .update({ allow_own_mp: value })
      .eq('shop_owner_id', user.id).eq('barber_id', barberId);
    if (error) { toast.error('Erro ao salvar'); return; }
    toast.success(value ? 'Barbeiro liberado para conectar MP próprio' : 'Pagamentos voltam para sua conta');
    load();
  };

  const removeMember = async (barberId: string) => {
    if (!user?.id) return;
    if (!confirm('Remover este barbeiro do time? Ele perde o acesso à barbearia.')) return;
    const { error } = await supabase.from('barbershop_team')
      .delete().eq('shop_owner_id', user.id).eq('barber_id', barberId);
    if (error) { toast.error('Erro ao remover'); return; }
    toast.success('Removido');
    load();
  };

  const teamCount = members.filter(m => !m.is_owner).length;

  return (
    <div className="space-y-4 px-4">
      <div className="wood-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-primary" />
          <h2 className="font-heading text-lg">Sua Equipe ({teamCount}/20)</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Cadastre seus barbeiros aqui. Você cria usuário e senha, eles entram já vinculados à sua barbearia.
          Todos os pagamentos caem na sua conta Mercado Pago — o app calcula o repasse de cada um conforme a comissão.
        </p>
        <button
          onClick={() => setShowCreate(true)}
          disabled={teamCount >= 20}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Plus size={16} /> Cadastrar barbeiro
        </button>
        {teamCount >= 20 && <p className="text-xs text-destructive">Limite de 20 barbeiros atingido.</p>}
      </div>

      <div className="space-y-2">
        {loading && <p className="text-center text-sm text-muted-foreground py-4">Carregando...</p>}
        {!loading && members.map((m) => (
          <div key={m.user_id} className="wood-card p-3 flex items-start gap-3">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-secondary flex items-center justify-center flex-shrink-0">
              {m.avatar_url ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                : <span className="text-lg font-bold text-primary">{(m.display_name || '?').charAt(0).toUpperCase()}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">
                {m.display_name || m.full_name || 'Barbeiro'}
                {m.is_owner && <span className="ml-2 text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">DONO</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                ⭐ {Number(m.rating_avg).toFixed(1)} · {m.rating_count} avaliações
              </p>
              {!m.is_owner && (
                <>
                  <CommissionEditor
                    ctype={m.commission_type || 'percentage'}
                    cval={Number(m.commission_value || 50)}
                    onSave={(t, v) => updateCommission(m.user_id, t, v)}
                  />
                  <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!m.allow_own_mp}
                      onChange={(e) => toggleOwnMP(m.user_id, e.target.checked)}
                      className="accent-primary"
                    />
                    <Wallet size={12} className="text-primary" />
                    <span className="text-[11px]">
                      {m.allow_own_mp
                        ? 'Recebe direto na própria conta MP'
                        : 'Pagamentos caem na sua conta (você repassa)'}
                    </span>
                  </label>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <CalendarClock size={12} className="text-primary" />
                    <span className="text-[11px] text-muted-foreground">Período de pagamento:</span>
                    <select
                      value={freqMap[m.user_id] || 'semanal'}
                      onChange={(e) => updatePayFrequency(m.user_id, e.target.value)}
                      className="text-[11px] px-1.5 py-0.5 rounded bg-input border border-border"
                    >
                      {PAY_FREQUENCIES.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
            {!m.is_owner && (
              <div className="flex flex-col gap-1">
                <button onClick={() => setResetTarget(m)} title="Trocar senha"
                  className="p-2 text-primary hover:bg-primary/10 rounded-lg">
                  <KeyRound size={16} />
                </button>
                <button onClick={() => removeMember(m.user_id)} title="Remover"
                  className="p-2 text-destructive hover:bg-destructive/10 rounded-lg">
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        ))}
        {!loading && members.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-6">Nenhum barbeiro no time ainda.</p>
        )}
      </div>

      {showCreate && (
        <CreateBarberModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal
          target={resetTarget}
          onClose={() => setResetTarget(null)}
        />
      )}
    </div>
  );
}

function CommissionEditor({ ctype, cval, onSave }: { ctype: string; cval: number; onSave: (t: string, v: number) => void }) {
  const [type, setType] = useState(ctype);
  const [value, setValue] = useState(cval);
  const dirty = type !== ctype || value !== cval;
  return (
    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
      <button onClick={() => setType('percentage')}
        className={`p-1 rounded ${type === 'percentage' ? 'bg-primary/20 text-primary' : 'text-muted-foreground'}`}>
        <Percent size={12} />
      </button>
      <button onClick={() => setType('fixed')}
        className={`p-1 rounded ${type === 'fixed' ? 'bg-primary/20 text-primary' : 'text-muted-foreground'}`}>
        <DollarSign size={12} />
      </button>
      <input
        type="number" value={value} step="0.01" min="0"
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-16 px-1.5 py-0.5 text-xs rounded bg-input border border-border"
      />
      <span className="text-[10px] text-muted-foreground">
        {type === 'percentage' ? '% repasse ao barbeiro' : 'R$ por serviço'}
      </span>
      {dirty && (
        <button onClick={() => onSave(type, value)} className="text-[10px] text-primary font-bold">Salvar</button>
      )}
    </div>
  );
}

function CreateBarberModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [commissionType, setCommissionType] = useState<'percentage' | 'fixed'>('percentage');
  const [commissionValue, setCommissionValue] = useState(50);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!displayName.trim() || username.trim().length < 3 || password.length < 6) {
      toast.error('Preencha todos os campos (senha ≥ 6 caracteres)');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('create-team-barber', {
      body: {
        action: 'create',
        displayName: displayName.trim(),
        username: username.trim().toLowerCase(),
        password,
        commissionType,
        commissionValue,
      },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast.error('Erro: ' + (error?.message || (data as any)?.error));
      return;
    }
    toast.success('Barbeiro cadastrado! Entregue o login para ele.');
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="wood-card p-4 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-lg">Novo barbeiro</h3>
          <button onClick={onClose} className="text-muted-foreground"><X size={18} /></button>
        </div>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Nome do barbeiro</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border" placeholder="João Silva" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Usuário (login)</label>
            <input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border font-mono" placeholder="joao" />
            <p className="text-[10px] text-muted-foreground mt-0.5">Ele fará login com este nome (sem espaços).</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Senha</label>
            <input type="text" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border font-mono" placeholder="mínimo 6 caracteres" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Comissão</label>
            <div className="flex items-center gap-2">
              <button onClick={() => setCommissionType('percentage')}
                className={`px-2 py-1 rounded text-xs ${commissionType === 'percentage' ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                % do serviço
              </button>
              <button onClick={() => setCommissionType('fixed')}
                className={`px-2 py-1 rounded text-xs ${commissionType === 'fixed' ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                R$ fixo
              </button>
              <input type="number" min="0" step="0.01" value={commissionValue}
                onChange={e => setCommissionValue(Number(e.target.value))}
                className="w-20 px-2 py-1 rounded bg-input border border-border text-sm" />
            </div>
          </div>
        </div>
        <button onClick={submit} disabled={saving}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50">
          {saving ? 'Criando...' : 'Cadastrar'}
        </button>
      </div>
    </div>
  );
}

function ResetPasswordModal({ target, onClose }: { target: TeamMember; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (password.length < 6) { toast.error('Senha ≥ 6 caracteres'); return; }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('create-team-barber', {
      body: { action: 'reset-password', barberId: target.user_id, password },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast.error('Erro: ' + (error?.message || (data as any)?.error));
      return;
    }
    toast.success('Senha atualizada');
    onClose();
  };
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="wood-card p-4 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-lg">Nova senha</h3>
          <button onClick={onClose} className="text-muted-foreground"><X size={18} /></button>
        </div>
        <p className="text-xs text-muted-foreground">Para: <b>{target.display_name}</b></p>
        <input type="text" value={password} onChange={e => setPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-input border border-border font-mono" placeholder="mínimo 6 caracteres" />
        <button onClick={submit} disabled={saving}
          className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50">
          {saving ? 'Salvando...' : 'Salvar nova senha'}
        </button>
      </div>
    </div>
  );
}
