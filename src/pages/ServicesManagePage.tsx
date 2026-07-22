import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyId } from '@/hooks/useCompanyId';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Loader2, Plus, Pencil, Trash2, Scissors } from 'lucide-react';

type Service = {
  id: string; company_id: string; name: string; description: string | null;
  duration_minutes: number; price: number; is_active: boolean;
};
type Barber = { id: string; display_name: string; status: string };
type Link = { id: string; barber_id: string; service_id: string; active: boolean };

export default function ServicesManagePage() {
  const { companyId, loading: loadingCompany } = useCompanyId();
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedSvc, setSelectedSvc] = useState<string | null>(null);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [form, setForm] = useState<{ id?: string; name: string; description: string; duration_minutes: number; price: number; is_active: boolean }>(
    { name: '', description: '', duration_minutes: 30, price: 0, is_active: true },
  );
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    const [{ data: svc }, { data: brb }, { data: bs }] = await Promise.all([
      (supabase as any).from('services').select('*').eq('company_id', companyId).is('deleted_at', null).order('sort_order').order('name'),
      (supabase as any).from('barbers').select('id, display_name, status').eq('company_id', companyId).is('deleted_at', null).order('display_name'),
      (supabase as any).from('barber_services').select('id, barber_id, service_id, active').eq('company_id', companyId),
    ]);
    setServices((svc ?? []) as Service[]);
    setBarbers((brb ?? []) as Barber[]);
    setLinks((bs ?? []) as Link[]);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  const openNew = () => {
    setForm({ name: '', description: '', duration_minutes: 30, price: 0, is_active: true });
    setDlgOpen(true);
  };
  const openEdit = (s: Service) => {
    setForm({ id: s.id, name: s.name, description: s.description ?? '', duration_minutes: s.duration_minutes, price: Number(s.price), is_active: s.is_active });
    setDlgOpen(true);
  };

  const save = async () => {
    if (!companyId || !form.name.trim()) { toast.error('Nome obrigatório'); return; }
    setSaving(true);
    const payload: any = {
      company_id: companyId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      duration_minutes: form.duration_minutes,
      price: form.price,
      is_active: form.is_active,
    };
    const q = form.id
      ? (supabase as any).from('services').update(payload).eq('id', form.id)
      : (supabase as any).from('services').insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Salvo');
    setDlgOpen(false);
    load();
  };

  const removeSvc = async (s: Service) => {
    if (!confirm(`Excluir serviço "${s.name}"?`)) return;
    const { error } = await (supabase as any).from('services')
      .update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', s.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Excluído'); load();
  };

  const toggleLink = async (svcId: string, barberId: string, currentlyLinked: boolean) => {
    if (currentlyLinked) {
      const link = links.find(l => l.service_id === svcId && l.barber_id === barberId);
      if (!link) return;
      const { error } = await (supabase as any).from('barber_services').delete().eq('id', link.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await (supabase as any).from('barber_services').insert({
        barber_id: barberId, service_id: svcId, active: true,
      });
      if (error) { toast.error(error.message); return; }
    }
    load();
  };

  const linkedBarbers = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    links.forEach(l => {
      if (!map[l.service_id]) map[l.service_id] = new Set();
      map[l.service_id].add(l.barber_id);
    });
    return map;
  }, [links]);

  if (loadingCompany) return <div className="p-6 flex justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Scissors className="w-6 h-6" /> Serviços</h1>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo serviço</Button>
      </div>

      {!companyId && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">Nenhuma empresa vinculada.</CardContent></Card>
      )}

      {loading ? (
        <div className="p-6 flex justify-center"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="grid gap-3">
          {services.map(s => {
            const barberIds = linkedBarbers[s.id] ?? new Set();
            const isOpen = selectedSvc === s.id;
            return (
              <Card key={s.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold truncate">{s.name}</div>
                        <Badge variant={s.is_active ? 'default' : 'secondary'}>
                          {s.is_active ? 'ativo' : 'inativo'}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.duration_minutes} min · R$ {Number(s.price).toFixed(2)} · {barberIds.size} barbeiro(s)
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedSvc(isOpen ? null : s.id)}>
                      {isOpen ? 'Fechar' : 'Vincular'}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => removeSvc(s)}><Trash2 className="w-4 h-4" /></Button>
                  </div>

                  {isOpen && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <div className="text-xs text-muted-foreground">Marque os barbeiros que executam este serviço:</div>
                      {barbers.length === 0 ? (
                        <div className="text-xs text-muted-foreground">Nenhum barbeiro cadastrado.</div>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {barbers.map(b => {
                            const linked = barberIds.has(b.id);
                            return (
                              <label key={b.id} className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer">
                                <Checkbox checked={linked} onCheckedChange={() => toggleLink(s.id, b.id, linked)} />
                                <span className="text-sm truncate">{b.display_name}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {services.length === 0 && (
            <Card><CardContent className="p-6 text-center text-muted-foreground">Nenhum serviço.</CardContent></Card>
          )}
        </div>
      )}

      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? 'Editar serviço' : 'Novo serviço'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Duração (min) *</Label>
                <Input type="number" min={5} step={5} value={form.duration_minutes}
                  onChange={e => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Preço (R$)</Label>
                <Input type="number" min={0} step={0.5} value={form.price}
                  onChange={e => setForm({ ...form, price: Number(e.target.value) })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: !!v })} />
              Ativo
            </label>
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
