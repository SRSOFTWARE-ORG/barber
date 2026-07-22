import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { toast } from 'sonner';
import { ArrowLeft, ShoppingCart, Trash2, Minus, Plus, Package, Loader2, ShieldCheck } from 'lucide-react';
import Seo from '@/components/Seo';
import { trackEvent, AnalyticsEvents } from '@/lib/analytics';

const brl = (n: number) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CartPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, removeItem, setQty, total } = useCart();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [bumpId, setBumpId] = useState<string | null>(null);

  const count = items.reduce((s, i) => s + i.quantidade, 0);

  const bump = (id: string) => {
    setBumpId(id);
    setTimeout(() => setBumpId((cur) => (cur === id ? null : cur)), 180);
  };

  const changeQty = (id: string, q: number) => {
    setQty(id, q);
    bump(id);
  };

  const handleRemove = (id: string) => {
    setRemovingId(id);
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Aguarda a animação de saída antes de remover de fato (curto no mobile).
    setTimeout(() => {
      removeItem(id);
      setRemovingId(null);
    }, reduceMotion ? 0 : 180);
  };

  const payItem = async (produto_id: string) => {
    if (!user) {
      toast.error('Entre na sua conta para pagar.');
      navigate('/profile');
      return;
    }
    const item = items.find((i) => i.produto_id === produto_id);
    if (!item) return;
    trackEvent(AnalyticsEvents.CartCheckoutStart, {
      produto_id: item.produto_id,
      nome: item.nome,
      preco: item.preco,
      quantidade: item.quantidade,
    });
    setPayingId(produto_id);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, telefone')
        .eq('id', user.id)
        .maybeSingle();

      const { data, error } = await supabase.functions.invoke('marketplace-checkout', {
        body: {
          produto_id: item.produto_id,
          quantidade: item.quantidade,
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
        localStorage.setItem('pendingMktChat', JSON.stringify({ to: item.shop_owner_id }));
      } catch {}
      removeItem(produto_id);
      window.location.href = initPoint;
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao iniciar pagamento.');
      setPayingId(null);
    }
  };

  return (
    <div className="page-shell min-h-screen pb-40">
      <Seo path="/carrinho" title="Carrinho — Produtos da Barbearia" description="Revise os produtos adicionais escolhidos, ajuste as quantidades e finalize a compra com retirada na loja." />
      <div className="page-header flex items-center gap-3 px-4">
        <button onClick={() => navigate(-1)} className="text-primary transition-transform active:scale-90" aria-label="Voltar"><ArrowLeft size={24} /></button>
        <h1 className="font-heading text-xl text-foreground flex items-center gap-2">
          <span className="relative">
            <ShoppingCart size={20} />
            {count > 0 && (
              <span className="absolute -top-2 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center animate-scale-in">
                {count}
              </span>
            )}
          </span>
          Carrinho
        </h1>
      </div>

      <div className="px-4 space-y-3">
        {items.length === 0 ? (
          <div className="wood-card px-4 py-12 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-secondary/60 flex items-center justify-center mx-auto mb-3 animate-scale-in">
              <Package size={30} className="text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">Seu carrinho está vazio.</p>
            <button onClick={() => navigate('/marketplace')} className="vintage-btn mt-4 px-5 py-2 rounded-lg text-sm hover-scale">Ver produtos</button>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground animate-fade-in flex items-start gap-1.5">
              <ShieldCheck size={14} className="text-primary shrink-0 mt-0.5" />
              Produtos são pagos 100% no ato (split 90/10 para o vendedor). Cada produto é pago separadamente, pois pode ser de vendedores diferentes.
            </p>
            {items.map((item, idx) => {
              const isRemoving = removingId === item.produto_id;
              return (
                <div
                  key={item.produto_id}
                  style={{ animationDelay: `${Math.min(idx, 8) * 45}ms` }}
                  className={`cart-anim wood-card px-3 py-3 flex items-center gap-3 transition-[transform,opacity] duration-150 ease-out ${isRemoving ? 'opacity-0 translate-x-8 scale-95' : 'animate-fade-in'}`}
                >

                  <div className="w-16 h-16 rounded-lg bg-secondary overflow-hidden flex items-center justify-center shrink-0">
                    {item.imagem_url ? (
                      <img src={item.imagem_url} alt={item.nome} className="w-full h-full object-cover transition-transform duration-300 hover:scale-110" />
                    ) : (
                      <Package size={20} className="text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-heading text-sm text-foreground truncate">{item.nome}</p>
                    <p className="text-xs text-primary font-semibold">{brl(item.preco)}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <button onClick={() => changeQty(item.produto_id, item.quantidade - 1)} className="w-7 h-7 rounded-lg bg-secondary border border-border flex items-center justify-center text-primary transition-transform active:scale-90 hover:border-primary" aria-label="Diminuir"><Minus size={13} /></button>
                      <span className={`text-sm font-heading text-foreground w-6 text-center transition-transform ${bumpId === item.produto_id ? 'scale-125 text-primary' : ''}`}>{item.quantidade}</span>
                      <button onClick={() => changeQty(item.produto_id, item.quantidade + 1)} className="w-7 h-7 rounded-lg bg-secondary border border-border flex items-center justify-center text-primary transition-transform active:scale-90 hover:border-primary" aria-label="Aumentar"><Plus size={13} /></button>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <button onClick={() => handleRemove(item.produto_id)} className="text-destructive transition-transform active:scale-75 hover:rotate-12" aria-label="Remover do carrinho"><Trash2 size={18} /></button>
                    <button
                      onClick={() => payItem(item.produto_id)}
                      disabled={payingId === item.produto_id}
                      className="vintage-btn px-3 py-1.5 rounded-lg text-xs disabled:opacity-50 flex items-center gap-1 hover-scale"
                    >
                      {payingId === item.produto_id ? <Loader2 size={13} className="animate-spin" /> : 'Pagar'}
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Barra de total fixa */}
      {items.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-background via-background/95 to-transparent animate-fade-in">
          <div className="wood-card px-4 py-3 flex items-center justify-between shadow-lg shadow-black/30 gold-border">
            <div>
              <span className="text-[11px] text-muted-foreground block">Total do carrinho</span>
              <span className="font-heading text-xl text-primary">{brl(total)}</span>
            </div>
            <span className="text-xs text-muted-foreground">{count} {count === 1 ? 'item' : 'itens'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
