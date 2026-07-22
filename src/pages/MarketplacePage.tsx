import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { toast } from 'sonner';
import { ArrowLeft, Package, ShoppingBag, ShoppingCart, Store, Minus, Plus, X, Loader2, Check } from 'lucide-react';
import Seo from '@/components/Seo';
import { trackEvent, AnalyticsEvents } from '@/lib/analytics';

interface Produto {
  id: string;
  shop_owner_id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  estoque: number;
  imagem_url: string | null;
}

interface Venda {
  id: string;
  produto_nome: string;
  comprador_nome: string | null;
  quantidade: number;
  valor_total: number;
  status: string;
  created_at: string;
}

const brl = (n: number) =>
  (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function MarketplacePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addItem, count } = useCart();
  const [view, setView] = useState<'loja' | 'vendas'>('loja');
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(true);

  // buy dialog
  const [selected, setSelected] = useState<Produto | null>(null);
  const [qtd, setQtd] = useState(1);
  const [buying, setBuying] = useState(false);
  const [added, setAdded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [prodRes, vendaRes] = await Promise.all([
      supabase.from('marketplace_produtos' as any).select('*').eq('ativo', true).gt('estoque', 0).order('created_at', { ascending: false }),
      supabase.rpc('marketplace_feed' as any),
    ]);
    setProdutos((prodRes.data as any) || []);
    setVendas((vendaRes.data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('status') !== 'ok') return;
    let pending: { to?: string } | null = null;
    try { pending = JSON.parse(localStorage.getItem('pendingMktChat') || 'null'); } catch {}
    if (pending?.to) {
      try { localStorage.removeItem('pendingMktChat'); } catch {}
      toast.success('Compra registrada! Combine a entrega no chat.');
      navigate(`/chat?to=${pending.to}`);
    }
  }, [user, navigate]);

  // Registra a visualização do Marketplace (topo do funil).
  useEffect(() => {
    trackEvent(AnalyticsEvents.MarketplaceView);
  }, []);

  const openBuy = (prod: Produto) => {
    if (!user) { toast.error('Entre na sua conta para comprar.'); navigate('/profile'); return; }
    trackEvent(AnalyticsEvents.MarketplaceProductOpen, { produto_id: prod.id, nome: prod.nome, preco: prod.preco });
    setSelected(prod);
    setQtd(1);
    setAdded(false);
  };

  const addToCart = () => {
    if (!selected) return;
    trackEvent(AnalyticsEvents.MarketplaceAddToCart, { produto_id: selected.id, nome: selected.nome, preco: selected.preco, qty: qtd });
    addItem({
      produto_id: selected.id,
      nome: selected.nome,
      preco: selected.preco,
      shop_owner_id: selected.shop_owner_id,
      imagem_url: selected.imagem_url,
    }, qtd);
    setAdded(true);
    toast.success('Adicionado ao carrinho!');
    setTimeout(() => setSelected(null), 600);
  };

  const confirmarCompra = async () => {
    if (!selected || !user) return;
    trackEvent(AnalyticsEvents.MarketplaceBuyNow, { produto_id: selected.id, nome: selected.nome, preco: selected.preco, qty: qtd });
    setBuying(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, telefone')
        .eq('id', user.id)
        .maybeSingle();

      const { data, error } = await supabase.functions.invoke('marketplace-checkout', {
        body: {
          produto_id: selected.id,
          quantidade: qtd,
          comprador: {
            nome: (profile as any)?.full_name || undefined,
            telefone: (profile as any)?.telefone || undefined,
            email: user.email || `${user.id}@barbershop.app`,
          },
        },
      });
      if (error) throw error;
      const initPoint = (data as any)?.init_point;
      if (!initPoint) throw new Error((data as any)?.error || 'Não foi possível iniciar o pagamento.');
      try {
        localStorage.setItem('pendingMktChat', JSON.stringify({ to: selected.shop_owner_id }));
      } catch {}
      window.location.href = initPoint;
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao iniciar compra.');
      setBuying(false);
    }
  };

  return (
    <div className="min-h-screen pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
      <Seo
        title="Marketplace — Produtos de Barbearia"
        description="Compre produtos das barbearias parceiras: pomadas, óleos para barba e acessórios de cuidado masculino, com retirada na loja."
        path="/marketplace"
        jsonLd={produtos.length > 0 ? produtos.slice(0, 20).map((p) => ({
          "@context": "https://schema.org",
          "@type": "Product",
          name: p.nome,
          description: p.descricao || `${p.nome} disponível no marketplace da barbearia.`,
          image: p.imagem_url || `${'https://barber.srsoftwarestore.com'}/pwa-icon-512.png`,
          offers: {
            "@type": "Offer",
            price: Number(p.preco || 0).toFixed(2),
            priceCurrency: "BRL",
            availability: p.estoque > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          },
        })) : {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Marketplace — Produtos de Barbearia",
          description: "Produtos de cuidado masculino das barbearias parceiras.",
        }}
      />

      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate('/')} className="text-primary transition-transform active:scale-90"><ArrowLeft size={24} /></button>
        <h1 className="font-heading text-xl text-foreground flex items-center gap-2 flex-1"><Store size={22} className="text-primary" /> Marketplace</h1>
        <button onClick={() => navigate('/carrinho')} className="relative text-primary transition-transform active:scale-90" aria-label="Ver carrinho">
          <ShoppingCart size={24} />
          {count > 0 && (
            <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center animate-scale-in">
              {count}
            </span>
          )}
        </button>
      </div>

      <div className="flex gap-2 px-4 mb-4">
        <button onClick={() => setView('loja')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-heading transition-all duration-300 ${view === 'loja' ? 'gold-border bg-primary/15 text-primary scale-[1.02]' : 'wood-card text-muted-foreground'}`}>
          <ShoppingCart size={16} /> Produtos
        </button>
        <button onClick={() => setView('vendas')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-heading transition-all duration-300 ${view === 'vendas' ? 'gold-border bg-primary/15 text-primary scale-[1.02]' : 'wood-card text-muted-foreground'}`}>
          <ShoppingBag size={16} /> Vendas
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 px-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="wood-card rounded-xl overflow-hidden animate-pulse" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="w-full aspect-square bg-secondary/50" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-secondary/60 rounded w-3/4" />
                <div className="h-3 bg-secondary/40 rounded w-1/2" />
                <div className="h-8 bg-secondary/50 rounded-lg mt-2" />
              </div>
            </div>
          ))}
        </div>
      ) : view === 'loja' ? (
        produtos.length === 0 ? (
          <div className="text-center py-16 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mx-auto mb-3 animate-scale-in">
              <Store size={30} className="text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">Nenhum produto à venda no momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 px-4">
            {produtos.map((prod, idx) => (
              <div
                key={prod.id}
                style={{ animationDelay: `${Math.min(idx, 10) * 70}ms` }}
                className="wood-card rounded-xl overflow-hidden flex flex-col animate-fade-in group transition-all duration-300 hover:shadow-lg hover:shadow-black/30 hover:-translate-y-1"
              >
                <div className="relative w-full aspect-square overflow-hidden bg-secondary/50">
                  {prod.imagem_url
                    ? <img src={prod.imagem_url} alt={prod.nome} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    : <div className="w-full h-full flex items-center justify-center"><Package size={28} className="text-muted-foreground" /></div>}
                  {prod.estoque <= 3 && (
                    <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/90 text-destructive-foreground backdrop-blur-sm animate-fade-in">
                      Últimas {prod.estoque}
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="p-3 flex flex-col flex-1">
                  <p className="font-heading text-foreground text-sm leading-tight">{prod.nome}</p>
                  {prod.descricao && <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{prod.descricao}</p>}
                  <p className="font-heading text-primary mt-1 text-base">{brl(prod.preco)}</p>
                  <button onClick={() => openBuy(prod)} className="mt-2 w-full bg-primary text-primary-foreground text-sm font-heading py-2 rounded-lg flex items-center justify-center gap-1.5 transition-transform active:scale-95 hover:brightness-110">
                    <ShoppingCart size={15} /> Comprar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        vendas.length === 0 ? (
          <div className="text-center py-16 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mx-auto mb-3 animate-scale-in">
              <ShoppingBag size={30} className="text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">Nenhuma venda registrada ainda.</p>
          </div>
        ) : (
          <div className="space-y-2 px-4">
            {vendas.map((v, idx) => (
              <div key={v.id} style={{ animationDelay: `${Math.min(idx, 10) * 60}ms` }} className="wood-card rounded-xl p-3 flex justify-between items-center gap-2 animate-fade-in transition-transform hover:scale-[1.01]">
                <div className="min-w-0">
                  <p className="font-heading text-foreground text-sm truncate">{v.produto_nome} ×{v.quantidade}</p>
                  <p className="text-xs text-muted-foreground truncate">{v.comprador_nome || 'Cliente'} • {new Date(v.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-heading text-primary text-sm">{brl(v.valor_total)}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${v.status === 'retirado' ? 'bg-green-500/15 text-green-500' : 'bg-primary/15 text-primary'}`}>
                    {v.status === 'retirado' ? 'Retirado' : 'Pago'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Buy dialog */}
      {selected && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => !buying && setSelected(null)}>
          <div className="wood-card rounded-2xl p-4 w-full max-w-sm space-y-4 animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center gap-3">
              <h3 className="font-heading text-foreground truncate">{selected.nome}</h3>
              <button onClick={() => !buying && setSelected(null)} aria-label="Fechar" className="text-muted-foreground transition-transform active:scale-90"><X size={20} /></button>
            </div>
            {selected.imagem_url && (
              <div className="w-full aspect-video rounded-xl overflow-hidden bg-secondary">
                <img src={selected.imagem_url} alt={selected.nome} loading="lazy" decoding="async" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Quantidade</span>
              <div className="flex items-center gap-3">
                <button onClick={() => setQtd(q => Math.max(1, q - 1))} className="wood-card w-9 h-9 rounded-lg flex items-center justify-center text-primary transition-transform active:scale-90"><Minus size={16} /></button>
                <span className="font-heading text-foreground w-6 text-center text-lg">{qtd}</span>
                <button onClick={() => setQtd(q => Math.min(selected.estoque, q + 1))} className="wood-card w-9 h-9 rounded-lg flex items-center justify-center text-primary transition-transform active:scale-90"><Plus size={16} /></button>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-heading text-primary text-xl">{brl(selected.preco * qtd)}</span>
            </div>
            <p className="text-[11px] text-muted-foreground text-center">Pagamento via Mercado Pago. Retirada na loja após confirmação.</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={addToCart} disabled={buying || added} className="wood-card border border-primary/40 text-primary font-heading py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-transform active:scale-95 disabled:opacity-60">
                {added ? <><Check size={16} /> Adicionado</> : <><ShoppingCart size={16} /> Carrinho</>}
              </button>
              <button onClick={confirmarCompra} disabled={buying} className="bg-primary text-primary-foreground font-heading py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1.5 transition-transform active:scale-95 hover:brightness-110">
                {buying ? <><Loader2 size={16} className="animate-spin" /> ...</> : 'Pagar agora'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
