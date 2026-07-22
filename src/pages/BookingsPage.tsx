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
import { Loader2, Plus, Calendar as CalendarIcon, Download, Printer, X } from 'lucide-react';
import { buildIcs, downloadIcs, printSection, IcsEvent } from '@/lib/ics';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Barber = { id: string; display_name: string; user_id: string | null };
type Service = { id: string; name: string; duration_minutes: number; price: number };
type Client  = { id: string; full_name: string };
type Booking = {
  id: string; company_id: string; barber_id: string; client_id: string | null;
  starts_at: string; ends_at: string; status: string; total_amount: number; notes: string | null;
};

const STATUS_COLORS: Record<string,string> = {
  scheduled: 'bg-blue-500', confirmed: 'bg-emerald-500', in_progress: 'bg-amber-500',
  completed: 'bg-slate-500', cancelled: 'bg-red-500', no_show: 'bg-red-700',
};

export default function BookingsPage() {
  const { companyId, loading: loadingCompany } = useCompanyId();
  const { user, role } = useAuth();
  const canManage = ['ceo','admin','owner','proprietario','gerente','manager','suporte'].includes(role as string);

  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selBarber, setSelBarber] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [loading, setLoading] = useState(true);

  const [dlgOpen, setDlgOpen] = useState(false);
  const [form, setForm] = useState<{ id?: string; date: string; start: string; duration: number; client_id: string; service_ids: string[]; notes: string }>(
    { date: format(new Date(), 'yyyy-MM-dd'), start: '10:00', duration: 30, client_id: '', service_ids: [], notes: '' },
  );
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    const [{ data: brb }, { data: svc }, { data: cli }] = await Promise.all([
      (supabase as any).from('barbers').select('id, display_name, user_id').eq('company_id', companyId).is('deleted_at', null).order('display_name'),
      (supabase as any).from('services').select('id, name, duration_minutes, price').eq('company_id', companyId).eq('is_active', true).is('deleted_at', null),
      (supabase as any).from('clients').select('id, full_name').eq('company_id', companyId).is('deleted_at', null).order('full_name'),
    ]);
    setBarbers((brb ?? []) as Barber[]);
    setServices((svc ?? []) as Service[]);
    setClients((cli ?? []) as Client[]);
    if (!selBarber && brb?.length) setSelBarber(brb[0].id);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  useEffect(() => {
    if (!selBarber) { setBookings([]); return; }
    const from = weekStart.toISOString();
    const to = addDays(weekStart, 7).toISOString();
    (supabase as any).from('bookings')
      .select('id, company_id, barber_id, client_id, starts_at, ends_at, status, total_amount, notes')
      .eq('barber_id', selBarber)
      .gte('starts_at', from).lt('starts_at', to)
      .order('starts_at')
      .then(({ data, error }: any) => {
        if (error) toast.error(error.message);
        setBookings((data ?? []) as Booking[]);
      });
  }, [selBarber, weekStart]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const openNew = () => {
    setForm({
      date: format(new Date(), 'yyyy-MM-dd'), start: '10:00',
      duration: 30, client_id: clients[0]?.id ?? '', service_ids: [], notes: '',
    });
    setDlgOpen(true);
  };

  const save = async () => {
    if (!companyId || !selBarber) return;
    setSaving(true);
    const startsAt = new Date(`${form.date}T${form.start}:00`);
    const totalDur = form.service_ids.length
      ? services.filter(s => form.service_ids.includes(s.id)).reduce((a, s) => a + s.duration_minutes, 0)
      : form.duration;
    const endsAt = new Date(startsAt.getTime() + totalDur * 60_000);

    const { data: bk, error: err1 } = await (supabase as any).from('bookings').insert({
      company_id: companyId,
      barber_id: selBarber,
      client_id: form.client_id || null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: 'scheduled',
      notes: form.notes.trim() || null,
    }).select('id').maybeSingle();

    if (err1) {
      setSaving(false);
      toast.error(err1.message.includes('exclusion') ? 'Conflito com outro agendamento do barbeiro.' : err1.message);
      return;
    }
    // insere itens
    if (form.service_ids.length && bk) {
      const rows = form.service_ids.map(sid => {
        const s = services.find(x => x.id === sid)!;
        return { booking_id: bk.id, service_id: sid, price_at_booking: s.price, duration_at_booking: s.duration_minutes };
      });
      const { error: err2 } = await (supabase as any).from('booking_services').insert(rows);
      if (err2) { toast.error(`Reserva criada mas falhou serviços: ${err2.message}`); }
    }
    setSaving(false);
    setDlgOpen(false);
    toast.success('Agendamento criado');
    // recarrega
    setSelBarber(selBarber);
    setWeekStart(new Date(weekStart));
  };

  const cancel = async (b: Booking) => {
    if (!confirm('Cancelar este agendamento?')) return;
    const { error } = await (supabase as any).from('bookings').update({
      status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: user?.id ?? null,
    }).eq('id', b.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Cancelado');
    setBookings(bs => bs.map(x => x.id === b.id ? { ...x, status: 'cancelled' } : x));
  };

  const exportIcs = () => {
    const barber = barbers.find(b => b.id === selBarber);
    const evs: IcsEvent[] = bookings
      .filter(b => b.status !== 'cancelled')
      .map(b => {
        const client = clients.find(c => c.id === b.client_id);
        return {
          uid: `${b.id}@barber.local`,
          title: `${client?.full_name ?? 'Cliente'} — R$ ${Number(b.total_amount).toFixed(2)}`,
          description: b.notes ?? '',
          start: new Date(b.starts_at),
          end: new Date(b.ends_at),
          status: b.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE',
        };
      });
    if (!evs.length) { toast.info('Sem eventos ativos para exportar.'); return; }
    downloadIcs(`agenda-${barber?.display_name ?? 'barbeiro'}.ics`, buildIcs(`Agenda ${barber?.display_name ?? ''}`, evs));
  };

  const exportPdf = () => {
    const barber = barbers.find(b => b.id === selBarber);
    const rows = bookings.map(b => {
      const client = clients.find(c => c.id === b.client_id);
      return `<tr>
        <td>${format(new Date(b.starts_at), "dd/MM EEE HH:mm", { locale: ptBR })}</td>
        <td>${format(new Date(b.ends_at), 'HH:mm')}</td>
        <td>${client?.full_name ?? '—'}</td>
        <td>${b.status}</td>
        <td>R$ ${Number(b.total_amount).toFixed(2)}</td>
      </tr>`;
    }).join('');
    const html = `
      <h1>Agenda — ${barber?.display_name ?? ''}</h1>
      <div>Semana de ${format(weekStart,'dd/MM/yyyy')} a ${format(addDays(weekStart,6),'dd/MM/yyyy')}</div>
      <table>
        <thead><tr><th>Início</th><th>Fim</th><th>Cliente</th><th>Status</th><th>Valor</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">Sem agendamentos</td></tr>'}</tbody>
      </table>`;
    printSection(html, `Agenda ${barber?.display_name ?? ''}`);
  };

  if (loadingCompany) return <div className="p-6 flex justify-center"><Loader2 className="animate-spin" /></div>;

  const selectedBarber = barbers.find(b => b.id === selBarber);
  const canWriteBookings = canManage || selectedBarber?.user_id === user?.id;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto pb-24 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarIcon className="w-6 h-6" /> Agenda</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportIcs}><Download className="w-4 h-4 mr-1" /> ICS</Button>
          <Button variant="outline" onClick={exportPdf}><Printer className="w-4 h-4 mr-1" /> PDF</Button>
          {canWriteBookings && (
            <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo</Button>
          )}
        </div>
      </div>

      {!companyId && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">Nenhuma empresa vinculada.</CardContent></Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-10 px-3 rounded-md border bg-background"
          value={selBarber ?? ''}
          onChange={e => setSelBarber(e.target.value || null)}
        >
          <option value="">Selecione um barbeiro…</option>
          {barbers.map(b => <option key={b.id} value={b.id}>{b.display_name}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>◀</Button>
          <div className="text-sm px-2">
            {format(weekStart, 'dd/MM')} — {format(addDays(weekStart, 6), 'dd/MM/yyyy')}
          </div>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>▶</Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}>hoje</Button>
        </div>
      </div>

      {loading ? (
        <div className="p-6 flex justify-center"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {days.map(d => {
            const dayBookings = bookings.filter(b => isSameDay(new Date(b.starts_at), d));
            return (
              <Card key={d.toISOString()} className="min-h-[220px]">
                <CardHeader className="p-2">
                  <CardTitle className="text-xs text-center">
                    {format(d, 'EEE dd/MM', { locale: ptBR })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-1 space-y-1">
                  {dayBookings.length === 0 && (
                    <div className="text-[10px] text-muted-foreground text-center py-2">—</div>
                  )}
                  {dayBookings.map(b => {
                    const cli = clients.find(c => c.id === b.client_id);
                    return (
                      <div key={b.id} className={`text-[11px] p-1 rounded text-white ${STATUS_COLORS[b.status] ?? 'bg-slate-400'} ${b.status==='cancelled'?'line-through opacity-70':''}`}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold">{format(new Date(b.starts_at), 'HH:mm')}</span>
                          {canWriteBookings && b.status !== 'cancelled' && (
                            <button onClick={() => cancel(b)} title="Cancelar"><X className="w-3 h-3" /></button>
                          )}
                        </div>
                        <div className="truncate">{cli?.full_name ?? '—'}</div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo agendamento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data</Label>
                <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <Label>Hora início</Label>
                <Input type="time" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Cliente</Label>
              <select className="w-full h-10 px-3 rounded-md border bg-background"
                value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                <option value="">(sem cliente)</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>
            <div>
              <Label>Serviços</Label>
              <div className="grid grid-cols-1 gap-1 max-h-40 overflow-auto border rounded-md p-2">
                {services.map(s => {
                  const checked = form.service_ids.includes(s.id);
                  return (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={checked}
                        onChange={() => setForm(f => ({
                          ...f,
                          service_ids: checked ? f.service_ids.filter(x=>x!==s.id) : [...f.service_ids, s.id],
                        }))} />
                      <span className="flex-1">{s.name}</span>
                      <span className="text-muted-foreground text-xs">{s.duration_minutes}min · R$ {Number(s.price).toFixed(2)}</span>
                    </label>
                  );
                })}
                {services.length === 0 && <div className="text-xs text-muted-foreground">Nenhum serviço ativo.</div>}
              </div>
            </div>
            {!form.service_ids.length && (
              <div>
                <Label>Duração (min)</Label>
                <Input type="number" min={5} step={5} value={form.duration}
                  onChange={e => setForm({ ...form, duration: Number(e.target.value) })} />
              </div>
            )}
            <div>
              <Label>Notas</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDlgOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="animate-spin w-4 h-4 mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
