// Métricas simples (client-side) para acompanhar o funil de carrinho e Marketplace.
// Sem dependências externas: registra eventos no console (DEV), mantém contadores
// agregados em localStorage e dispara um CustomEvent para quem quiser ouvir.

type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

const COUNTERS_KEY = 'analytics:counters';
const LOG_KEY = 'analytics:log';
const LOG_LIMIT = 200;

export const AnalyticsEvents = {
  // Carrinho
  CartAdd: 'cart_add',
  CartRemove: 'cart_remove',
  CartQtyChange: 'cart_qty_change',
  CartCheckoutStart: 'cart_checkout_start',
  // Marketplace
  MarketplaceView: 'marketplace_view',
  MarketplaceProductOpen: 'marketplace_product_open',
  MarketplaceAddToCart: 'marketplace_add_to_cart',
  MarketplaceBuyNow: 'marketplace_buy_now',
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / private mode errors */
  }
}

/** Registra uma ação do usuário no funil. Nunca lança erro. */
export function trackEvent(name: AnalyticsEventName | string, props: AnalyticsProps = {}) {
  try {
    const counters = readJson<Record<string, number>>(COUNTERS_KEY, {});
    counters[name] = (counters[name] || 0) + 1;
    writeJson(COUNTERS_KEY, counters);

    const log = readJson<{ name: string; props: AnalyticsProps; ts: number }[]>(LOG_KEY, []);
    log.push({ name, props, ts: Date.now() });
    if (log.length > LOG_LIMIT) log.splice(0, log.length - LOG_LIMIT);
    writeJson(LOG_KEY, log);

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info(`[analytics] ${name}`, props);
    }
    window.dispatchEvent(new CustomEvent('analytics', { detail: { name, props, ts: Date.now() } }));
  } catch {
    /* analytics nunca deve quebrar a UX */
  }
}

/** Lê os contadores agregados (para um painel simples de conversão). */
export function getAnalyticsCounters(): Record<string, number> {
  return readJson<Record<string, number>>(COUNTERS_KEY, {});
}

/** Lê o histórico recente de eventos. */
export function getAnalyticsLog(): { name: string; props: AnalyticsProps; ts: number }[] {
  return readJson<{ name: string; props: AnalyticsProps; ts: number }[]>(LOG_KEY, []);
}

/** Taxa de conversão simples (compras iniciadas / itens adicionados). */
export function getConversionRate(): number {
  const c = getAnalyticsCounters();
  const adds = (c[AnalyticsEvents.CartAdd] || 0) + (c[AnalyticsEvents.MarketplaceAddToCart] || 0);
  const checkouts =
    (c[AnalyticsEvents.CartCheckoutStart] || 0) + (c[AnalyticsEvents.MarketplaceBuyNow] || 0);
  if (adds === 0) return 0;
  return Math.min(1, checkouts / adds);
}
