import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { trackEvent, AnalyticsEvents } from '@/lib/analytics';

export interface CartItem {
  produto_id: string;
  nome: string;
  preco: number;
  quantidade: number;
  shop_owner_id: string;
  imagem_url: string | null;
}

interface CartContextType {
  items: CartItem[];
  count: number;
  total: number;
  addItem: (item: Omit<CartItem, 'quantidade'>, qty?: number) => void;
  removeItem: (produto_id: string) => void;
  setQty: (produto_id: string, qty: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextType | null>(null);

const keyFor = (uid: string | null | undefined) => `cart:${uid || 'anon'}`;

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const storageKey = keyFor(user?.id);
  const [items, setItems] = useState<CartItem[]>([]);

  // Load cart whenever the active user changes.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setItems(raw ? (JSON.parse(raw) as CartItem[]) : []);
    } catch {
      setItems([]);
    }
  }, [storageKey]);

  // Persist on every change.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {}
  }, [items, storageKey]);

  const addItem = useCallback((item: Omit<CartItem, 'quantidade'>, qty = 1) => {
    trackEvent(AnalyticsEvents.CartAdd, {
      produto_id: item.produto_id,
      nome: item.nome,
      preco: item.preco,
      qty,
      shop_owner_id: item.shop_owner_id,
    });
    setItems((prev) => {
      const existing = prev.find((i) => i.produto_id === item.produto_id);
      if (existing) {
        return prev.map((i) =>
          i.produto_id === item.produto_id ? { ...i, quantidade: i.quantidade + qty } : i,
        );
      }
      return [...prev, { ...item, quantidade: qty }];
    });
  }, []);

  const removeItem = useCallback((produto_id: string) => {
    trackEvent(AnalyticsEvents.CartRemove, { produto_id });
    setItems((prev) => prev.filter((i) => i.produto_id !== produto_id));
  }, []);

  const setQty = useCallback((produto_id: string, qty: number) => {
    trackEvent(AnalyticsEvents.CartQtyChange, { produto_id, qty: Math.max(0, qty) });
    setItems((prev) =>
      prev
        .map((i) => (i.produto_id === produto_id ? { ...i, quantidade: Math.max(0, qty) } : i))
        .filter((i) => i.quantidade > 0),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const count = useMemo(() => items.reduce((s, i) => s + i.quantidade, 0), [items]);
  const total = useMemo(() => items.reduce((s, i) => s + i.preco * i.quantidade, 0), [items]);

  return (
    <CartContext.Provider value={{ items, count, total, addItem, removeItem, setQty, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be inside CartProvider');
  return ctx;
}
