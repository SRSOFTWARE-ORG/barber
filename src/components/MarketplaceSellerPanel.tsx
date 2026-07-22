import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Trash2, Package, Upload, Check, Boxes, ShoppingBag, Sparkles } from 'lucide-react';
import { prepareImageUpload } from '@/lib/media';

interface Produto {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  estoque: number;
  imagem_url: string | null;
  ativo: boolean;
}

interface Pedido {
  id: string;
  produto_nome: string;
  comprador_nome: string | null;
  quantidade: number;
  valor_total: number;
  amount_net: number;
  status: string;
  created_at: string;
}

const brl = (n: number) =>
  (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Aguardando pagamento',
  pago: 'Pago — retirar na loja',
  retirado: 'Retirado',
  cancelado: 'Cancelado',
};

export default function MarketplaceSellerPanel() {
  const { user } = useAuth();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'produtos' | 'vendas'>('produtos');

  // form
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [preco, setPreco] = useState('');
  const [estoque, setEstoque] = useState('');
  const [imagemUrl, setImagemUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [genDesc, setGenDesc] = useState(false);

  const gerarDescricaoIA = async () => {
    if (!nome.trim()) { toast.error('Informe o nome do produto primeiro.'); return; }
    setGenDesc(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-product-description', {
        body: { nome: nome.trim(), preco: preco || null },
      });
      if (error) throw error;
      if (data?.descricao) {
        setDescricao(data.descricao);
        toast.success('Descrição gerada por IA!');
      } else {
        toast.error('Não foi possível gerar a descrição.');
      }
    } catch (err: any) {
      toast.error('Erro ao gerar descrição: ' + (err?.message || err));
    } finally {
      setGenDesc(false);
    }
  };

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [prodRes, pedRes] = await Promise.all([
      supabase.from('marketplace_produtos' as any).select('*').eq('shop_owner_id', user.id).order('created_at', { ascending: false }),
      supabase.from('marketplace_pedidos' as any)
        .select('id, produto_nome, comprador_nome, quantidade, valor_total, amount_net, status, created_at')
        .eq('shop_owner_id', user.id)
        .order('created_at', { ascending: false }),
    ]);
    setProdutos((prodRes.data as any) || []);
    setPedidos((pedRes.data as any) || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    e.target.value = '';
    setUploading(true);
    try {
      const prepared = await prepareImageUpload(file);
      const extension = prepared.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `marketplace/${user.id}/produto-${Date.now()}.${extension}`;
      const { error } = await supabase.storage.from('gallery').upload(path, prepared, {
        upsert: true, contentType: prepared.type || 'image/jpeg', cacheControl: '3600',
      });
      if (error) throw error;
      const { data } = supabase.storage.from('gallery').getPublicUrl(path);
      setImagemUrl(data.publicUrl);
      toast.success('Imagem enviada!');
    } catch (err: any) {
      toast.error('Erro no upload: ' + (err?.message || err));
    } finally {
      setUploading(false);
    }
  };

  const addProduto = async () => {
    if (!user?.id) return;
    const p = parseFloat(preco.replace(',', '.'));
    const est = parseInt(estoque || '0', 10);
    if (!nome.trim() || !Number.isFinite(p) || p <= 0) {
      toast.error('Informe nome e preço válidos.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('marketplace_produtos' as any).insert({
      shop_owner_id: user.id,
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      preco: p,
      estoque: Number.isFinite(est) ? est : 0,
      imagem_url: imagemUrl || null,
      ativo: true,
    } as any);
    setSaving(false);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Produto cadastrado!');
    setNome(''); setDescricao(''); setPreco(''); setEstoque(''); setImagemUrl('');
    load();
  };

  const toggleAtivo = async (prod: Produto) => {
    const { error } = await supabase.from('marketplace_produtos' as any)
      .update({ ativo: !prod.ativo } as any).eq('id', prod.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    load();
  };

  const removeProduto = async (id: string) => {
    const { error } = await supabase.from('marketplace_produtos' as any).delete().eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Produto removido.');
    load();
  };

  const marcarRetirado = async (id: string) => {
    const { error } = await supabase.from('marketplace_pedidos' as any)
      .update({ status: 'retirado' } as any).eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Marcado como retirado.');
    load();
  };

  return (
    <div className="px-4 space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setView('produtos')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-heading ${view === 'produtos' ? 'gold-border bg-primary/15 text-primary' : 'wood-card text-muted-foreground'}`}>
          <Boxes size={16} /> Produtos
        </button>
        <button onClick={() => setView('vendas')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-heading ${view === 'vendas' ? 'gold-border bg-primary/15 text-primary' : 'wood-card text-muted-foreground'}`}>
          <ShoppingBag size={16} /> Vendas
        </button>
      </div>

      {view === 'produtos' && (
        <>
          <div className="wood-card rounded-xl p-4 space-y-3">
            <h3 className="font-heading text-foreground flex items-center gap-2"><Plus size={16} className="text-primary" /> Novo produto</h3>
            <input placeholder="Nome do produto" value={nome} onChange={e => setNome(e.target.value)} className="vintage-input w-full px-3 py-2 rounded-lg" />
            <div className="relative">
              <textarea placeholder="Descrição (opcional)" value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} className="vintage-input w-full px-3 py-2 pr-10 rounded-lg resize-none" />
            </div>
            <button
              type="button"
              onClick={gerarDescricaoIA}
              disabled={genDesc || !nome.trim()}
              className="flex items-center justify-center gap-2 w-full text-sm font-heading text-primary wood-card gold-border px-3 py-2 rounded-lg disabled:opacity-50">
              <Sparkles size={15} /> {genDesc ? 'Gerando descrição...' : 'Gerar descrição com IA'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="Preço (R$)" value={preco} onChange={e => setPreco(e.target.value)} className="vintage-input w-full px-3 py-2 rounded-lg" />
              <input type="number" placeholder="Estoque" value={estoque} onChange={e => setEstoque(e.target.value)} className="vintage-input w-full px-3 py-2 rounded-lg" />
            </div>
            <div className="flex items-center gap-3">
              {imagemUrl && <img src={imagemUrl} alt="prévia" className="w-14 h-14 rounded-lg object-cover gold-border" />}
              <label className="flex items-center gap-2 text-sm text-primary cursor-pointer wood-card px-3 py-2 rounded-lg">
                <Upload size={16} /> {uploading ? 'Enviando...' : 'Imagem'}
                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
            </div>
            <button onClick={addProduto} disabled={saving} className="w-full bg-primary text-primary-foreground font-heading py-2.5 rounded-lg disabled:opacity-50">
              {saving ? 'Salvando...' : 'Cadastrar produto'}
            </button>
          </div>

          {loading ? (
            <p className="text-center text-muted-foreground text-sm py-6">Carregando...</p>
          ) : produtos.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-6">Nenhum produto cadastrado.</p>
          ) : (
            <div className="space-y-2">
              {produtos.map(prod => (
                <div key={prod.id} className="wood-card rounded-xl p-3 flex items-center gap-3">
                  {prod.imagem_url
                    ? <img src={prod.imagem_url} alt={prod.nome} className="w-14 h-14 rounded-lg object-cover gold-border" />
                    : <div className="w-14 h-14 rounded-lg bg-secondary/50 flex items-center justify-center"><Package size={20} className="text-muted-foreground" /></div>}
                  <div className="flex-1 min-w-0">
                    <p className="font-heading text-foreground truncate">{prod.nome}</p>
                    <p className="text-xs text-muted-foreground">{brl(prod.preco)} • estoque: {prod.estoque}</p>
                    <button onClick={() => toggleAtivo(prod)} className={`text-[11px] mt-1 px-2 py-0.5 rounded-full ${prod.ativo ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                      {prod.ativo ? 'À venda' : 'Pausado'}
                    </button>
                  </div>
                  <button onClick={() => removeProduto(prod.id)} className="text-destructive p-2"><Trash2 size={18} /></button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {view === 'vendas' && (
        loading ? (
          <p className="text-center text-muted-foreground text-sm py-6">Carregando...</p>
        ) : pedidos.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-6">Nenhuma venda ainda.</p>
        ) : (
          <div className="space-y-2">
            {pedidos.map(ped => (
              <div key={ped.id} className="wood-card rounded-xl p-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="font-heading text-foreground truncate">{ped.produto_nome} ×{ped.quantidade}</p>
                    <p className="text-xs text-muted-foreground">{ped.comprador_nome || 'Cliente'}</p>
                    <p className="text-xs text-muted-foreground">{new Date(ped.created_at).toLocaleString('pt-BR')}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-heading text-primary">{brl(ped.valor_total)}</p>
                    <p className="text-[11px] text-muted-foreground">líq. {brl(ped.amount_net)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                    ped.status === 'pago' ? 'bg-primary/15 text-primary'
                    : ped.status === 'retirado' ? 'bg-green-500/15 text-green-500'
                    : ped.status === 'cancelado' ? 'bg-destructive/15 text-destructive'
                    : 'bg-secondary text-muted-foreground'}`}>
                    {STATUS_LABEL[ped.status] || ped.status}
                  </span>
                  {ped.status === 'pago' && (
                    <button onClick={() => marcarRetirado(ped.id)} className="flex items-center gap-1 text-xs text-primary border border-primary/30 rounded-lg px-2 py-1">
                      <Check size={14} /> Retirado
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
