import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Clock, Users } from 'lucide-react';

type Barber = {
  id: string;
  company_id: string;
  user_id: string | null;
  display_name: string;
  status: 'active' | 'inactive' | 'vacation' | 'blocked';
  is_bookable: boolean;
  commission_rate: number;
  email: string | null;
  phone: string | null;
};

type Availability = {
  id: string;
  barber_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  active: boolean;
  unit_id: string | null;
};

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function BarberSchedulePage() {
  const { companyId, loading: loadingCompany } = useCompanyId();
  const { user, role } = useAuth();

  const canManage = role === 'ceo' || role === 'admin' || role === 'owner' || role === 'proprietario' || role === 'gerente' || role === 'manager';

  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);

  const [barberDialog, setBarberDialog] = useState(false);
  const [barberForm, setBarberForm] = useState({ display_name: '', email: '', phone: '', commission_rate: 40 });

  const [avDialog, setAvDialog] = useState(false);
  const [avForm, setAvForm] = useState({ weekday: 1, start_time: '09:00', end_time: '18:00' });
  const [saving, setSaving] = useState(false);

  const selected = useMemo(() => barbers.find(b => b.id === selectedId) ?? null, [barbers, selectedId]);
  const isSelectedMe = selected && selected.user_id === user?.id;
  const canEditSelected = canManage || isSelectedMe;

  const loadBarbers = async () => {
    if (!companyId) { setBarbers([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('barbers')
      .select('id, company_id, user_id, display_name, status, is_bookable, commission_rate, email, phone')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('display_name');
    if (error) toast.error(error.message);
    const list = (data ?? []) as Barber[];
    setBarbers(list);
    if (!selectedId && list.length) setSelectedId(list[0].id);
    setLoading(false);
  };

  const loadAvailability = async (barberId: string) => {
    const { data, error } = await (supabase as any)
      .from('barber_availability')
      .select('id, barber_id, weekday, start_time, end_time, active, unit_id')
      .eq('barber_id', barberId)
      .order('weekday').order('start_time');
    if (error) { toast.error(error.message); return; }
    setAvailability((data ?? []) as Availability[]);
  };

  useEffect(() => { loadBarbers(); /* eslint-disable-next-line */ }, [companyId]);
  useEffect(() => { if (selectedId) loadAvailability(selectedId); else setAvailability([]); }, [selectedId]);

  const createBarber = async () => {
    if (!companyId || !barberForm.display_name.trim()) return;
    setSaving(true);
    const { error } = await (supabase as any).from('barbers').insert({
      company_id: companyId,
      display_name: barberForm.display_name.trim(),
      email: barberForm.email.trim() || null,
      phone: barberForm.phone.trim() || null,
      commission_rate: barberForm.commission_rate,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Barbeiro criado');
    setBarberDialog(false);
    setBarberForm({ display_name: '', email: '', phone: '', commission_rate: 40 });
    loadBarbers();
  };

  const removeBarber = async (b: Barber) => {
    if (!confirm(`Excluir "${b.display_name}"?`)) return;
    const { error } = await (supabase as any)
      .from('barbers')
      .update({ deleted_at: new Date().toISOString(), status: 'inactive', is_bookable: false })
      .eq('id', b.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Excluído');
    if (selectedId === b.id) setSelectedId(null);
    loadBarbers();
  };

  const addAvailability = async () => {
    if (!selected) return;
    if (avForm.end_time <= avForm.start_time) { toast.error('Horário inválido'); return; }
    setSaving(true);
    const { error } = await (supabase as any).from('barber_availability').insert({
      barber_id: selected.id,
      weekday: avForm.weekday,
      start_time: avForm.start_time,
      end_time: avForm.end_time,
      active: true,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Disponibilidade adicionada');
    setAvDialog(false);
    loadAvailability(selected.id);
  };

  const removeAvailability = async (a: Availability) => {
    const { error } = await (supabase as any).from('barber_availability').delete().eq('id', a.id);
    if (error) { toast.error(error.message); return; }
    if (selected) loadAvailability(selected.id);
  };

  if (loadingCompany) return <div className="p-6 flex justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pb-24 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6" /> Barbeiros</h1>
        {canManage && (
          <Button onClick={() => setBarberDialog(true)}><Plus className="w-4 h-4 mr-1" /> Novo barbeiro</Button>
        )}
      </div>

      {!companyId && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">
          Nenhuma empresa vinculada ao seu usuário.
        </CardContent></Card>
      )}

      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        {/* Lista de barbeiros */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Equipe</CardTitle></CardHeader>
          <CardContent className="p-2 space-y-1">
            {loading ? (
              <div className="p-4 flex justify-center"><Loader2 className="animate-spin w-4 h-4" /></div>
            ) : barbers.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">Nenhum barbeiro</div>
            ) : (
              barbers.map(b => (
                <button
                  key={b.id}
                  onClick={() => setSelectedId(b.id)}
                  className={`w-full text-left p-2 rounded-md hover:bg-accent transition ${selectedId === b.id ? 'bg-accent' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-sm">{b.display_name}</div>
                      <div className="text-xs text-muted-foreground">{b.commission_rate}% comissão</div>
                    </div>
                    <Badge variant={b.status === 'active' ? 'default' : 'secondary'}>{b.status}</Badge>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* Agenda do barbeiro selecionado */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {selected ? `Agenda de ${selected.display_name}` : 'Selecione um barbeiro'}
            </CardTitle>
            <div className="flex gap-2">
              {selected && canEditSelected && (
                <Button size="sm" onClick={() => setAvDialog(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Horário
                </Button>
              )}
              {selected && canManage && (
                <Button size="sm" variant="ghost" onClick={() => removeBarber(selected)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selected ? (
              <div className="text-sm text-muted-foreground">Escolha um barbeiro na lista.</div>
            ) : (
              <>
                <div className="text-xs text-muted-foreground">
                  {selected.email ?? '—'} · {selected.phone ?? '—'}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAYS.map((d, idx) => {
                    const slots = availability.filter(a => a.weekday === idx);
                    return (
                      <div key={idx} className="border rounded-md p-2 min-h-[100px]">
                        <div className="text-xs font-semibold mb-1">{d}</div>
                        {slots.length === 0 ? (
                          <div className="text-[10px] text-muted-foreground">—</div>
                        ) : (
                          slots.map(s => (
                            <div key={s.id} className="text-[11px] mb-1 p-1 rounded bg-accent flex items-center justify-between gap-1">
                              <span>{s.start_time.slice(0,5)}–{s.end_time.slice(0,5)}</span>
                              {canEditSelected && (
                                <button onClick={() => removeAvailability(s)} className="text-destructive hover:opacity-70">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog criar barbeiro */}
      <Dialog open={barberDialog} onOpenChange={setBarberDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo barbeiro</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome de exibição *</Label>
              <Input value={barberForm.display_name} onChange={e => setBarberForm({ ...barberForm, display_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input type="email" value={barberForm.email} onChange={e => setBarberForm({ ...barberForm, email: e.target.value })} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={barberForm.phone} onChange={e => setBarberForm({ ...barberForm, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Comissão (%)</Label>
              <Input type="number" min={0} max={100} step={0.5}
                value={barberForm.commission_rate}
                onChange={e => setBarberForm({ ...barberForm, commission_rate: Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBarberDialog(false)}>Cancelar</Button>
            <Button onClick={createBarber} disabled={saving}>
              {saving && <Loader2 className="animate-spin w-4 h-4 mr-1" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog nova disponibilidade */}
      <Dialog open={avDialog} onOpenChange={setAvDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova disponibilidade</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Dia da semana</Label>
              <select
                className="w-full h-10 px-3 rounded-md border bg-background"
                value={avForm.weekday}
                onChange={e => setAvForm({ ...avForm, weekday: Number(e.target.value) })}
              >
                {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início</Label>
                <Input type="time" value={avForm.start_time} onChange={e => setAvForm({ ...avForm, start_time: e.target.value })} />
              </div>
              <div>
                <Label>Fim</Label>
                <Input type="time" value={avForm.end_time} onChange={e => setAvForm({ ...avForm, end_time: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAvDialog(false)}>Cancelar</Button>
            <Button onClick={addAvailability} disabled={saving}>
              {saving && <Loader2 className="animate-spin w-4 h-4 mr-1" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
