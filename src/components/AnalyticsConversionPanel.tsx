import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, ShoppingCart, Eye, CreditCard, RotateCcw } from 'lucide-react';
import {
  AnalyticsEvents,
  getAnalyticsCounters,
  getConversionRate,
} from '@/lib/analytics';

/**
 * Painel simples de conversão para o Admin.
 * Lê os contadores agregados (localStorage) gravados por src/lib/analytics.ts
 * e reage em tempo real ao CustomEvent('analytics').
 */
export default function AnalyticsConversionPanel() {
  const [counters, setCounters] = useState<Record<string, number>>({});
  const [rate, setRate] = useState(0);

  const refresh = useCallback(() => {
    setCounters(getAnalyticsCounters());
    setRate(getConversionRate());
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('analytics', handler);
    return () => window.removeEventListener('analytics', handler);
  }, [refresh]);

  const get = (k: string) => counters[k] || 0;

  const views = get(AnalyticsEvents.MarketplaceView);
  const adds = get(AnalyticsEvents.CartAdd) + get(AnalyticsEvents.MarketplaceAddToCart);
  const removes = get(AnalyticsEvents.CartRemove);
  const checkouts = get(AnalyticsEvents.CartCheckoutStart) + get(AnalyticsEvents.MarketplaceBuyNow);

  const cards = [
    { label: 'Visitas à loja', value: views, icon: Eye },
    { label: 'Adições ao carrinho', value: adds, icon: ShoppingCart },
    { label: 'Itens removidos', value: removes, icon: RotateCcw },
    { label: 'Compras iniciadas', value: checkouts, icon: CreditCard },
  ];

  const hasData = views + adds + removes + checkouts > 0;

  return (
    <div className="wood-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading text-base text-foreground flex items-center gap-2">
          <TrendingUp size={18} className="text-primary" /> Conversão da Loja
        </h3>
        <div className="text-right">
          <span className="font-heading text-xl text-primary">
            {(rate * 100).toFixed(0)}%
          </span>
          <p className="text-[10px] text-muted-foreground -mt-1">compras / adições</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {cards.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-lg bg-secondary/40 border border-primary/10 p-3 flex flex-col gap-1"
          >
            <Icon size={16} className="text-primary/80" />
            <span className="font-heading text-lg text-foreground leading-none">{value}</span>
            <span className="text-[11px] text-muted-foreground leading-tight">{label}</span>
          </div>
        ))}
      </div>

      {!hasData && (
        <p className="text-[11px] text-muted-foreground text-center">
          Ainda sem dados. Os números aparecem conforme os clientes navegam na loja e no carrinho.
        </p>
      )}
    </div>
  );
}
