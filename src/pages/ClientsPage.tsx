import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyId } from '@/hooks/useCompanyId';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Plus, Pencil, Trash2, Search } from 'lucide-react';

type Client = {
  id: string;
  company_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  status: 'active' | 'inactive' | 'blocked';
  tags: string[];
  visits_count: number;
  total_spent: number;
  last_visit_at: string | null;
};

type FormState = {
  id?: string;
  full_name: string;
  email: string;
  phone: string;
  document: string;
  status: Client['status'];
};

const emptyForm: FormState = {
  full_name: '', email: '', phone: '', document: '', status: 'active',
};

export default function ClientsPage() {
  const { companyId, loading: loadingCompany } = useCompanyId();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Client['status']>('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchClients = async () => {
    if (!companyId) { setClients([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('clients')
      .select('id, company_id, full_name, email, phone, document, status, tags, visits_count, total_spent, last_visit_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('full_name', { ascending: true });
    if (error) toast.error(`Erro ao carregar clientes: ${error.message}`);
    setClients((data ?? []) as Client[]);
    setLoading(false);
  };

  useEffect(() => { fetchClients(); /* eslint-disable-next-line */ }, [companyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.full_name.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q) ||
        (c.document ?? '').toLowerCase().includes(q)
      );
    });
  }, [clients, search, statusFilter]);

  const openNew = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (c: Client) => {
    setForm({
      id: c.id,
      full_name: c.full_name,
      email: c.email ?? '',
      phone: c.phone ?? '',
      document: c.document ?? '',
      status: c.status,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!companyId) { toast.error('Empresa não identificada'); return; }
    if (!form.full_name.trim()) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    const payload: any = {
      company_id: companyId,
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      document: form.document.trim() || null,
      status: form.status,
    };
    const q = form.id
      ? (supabase as any).from('clients').update(payload).eq('id', form.id)
      : (supabase as any).from('clients').insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) { toast.error(`Erro ao salvar: ${error.message}`); return; }
    toast.success(form.id ? 'Cliente atualizado' : 'Cliente criado');
    setOpen(false);
    fetchClients();
  };

  const remove = async (c: Client) => {
    if (!confirm(`Excluir cliente "${c.full_name}"?`)) return;
    const { error } = await (supabase as any)
      .from('clients')
      .update({ deleted_at: new Date().toISOString(), status: 'inactive' })
      .eq('id', c.id);
    if (error) { toast.error(`Erro ao excluir: ${error.message}`); return; }
    toast.success('Cliente excluído');
    fetchClients();
  };

  if (loadingCompany) return <div className="p-6 flex justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto pb-24">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo cliente</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? 'Editar cliente' : 'Novo cliente'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome completo *</Label>
                <Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Documento</Label>
                  <Input value={form.document} onChange={e => setForm({ ...form, document: e.target.value })} />
                </div>
                <div>
                  <Label>Status</Label>
                  <select
                    className="w-full h-10 px-3 rounded-md border bg-background"
                    value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value as Client['status'] })}
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                    <option value="blocked">Bloqueado</option>
                  </select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="animate-spin w-4 h-4 mr-1" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!companyId && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">
          Nenhuma empresa vinculada ao seu usuário. Vincule via <code>user_roles</code> para gerenciar clientes.
        </CardContent></Card>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome, email, telefone, documento…"
                 value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select
          className="h-10 px-3 rounded-md border bg-background"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as any)}
        >
          <option value="all">Todos status</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
          <option value="blocked">Bloqueados</option>
        </select>
      </div>

      {loading ? (
        <div className="p-6 flex justify-center"><Loader2 className="animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">Nenhum cliente encontrado.</CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {filtered.map(c => (
            <Card key={c.id}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold truncate">{c.full_name}</div>
                    <Badge variant={c.status === 'active' ? 'default' : c.status === 'blocked' ? 'destructive' : 'secondary'}>
                      {c.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[c.email, c.phone, c.document].filter(Boolean).join(' · ') || '—'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {c.visits_count} visitas · R$ {Number(c.total_spent).toFixed(2)}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => remove(c)}><Trash2 className="w-4 h-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
