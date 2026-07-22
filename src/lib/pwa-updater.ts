import { Workbox } from 'workbox-window';

const UPDATE_INTERVAL_MS = 60_000;
const SW_URL = `${import.meta.env.BASE_URL}sw.js`;

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), ms)),
  ]);
}

let wb: Workbox | null = null;
let registerPromise: Promise<ServiceWorkerRegistration | undefined> | null = null;
let updateInterval: number | null = null;

export function isPreviewPwaContext() {
  if (typeof window === 'undefined') return false;

  const hostname = window.location.hostname;
  const isPreviewHost = hostname.includes('id-preview--') || hostname.includes('lovableproject.com');

  try {
    return isPreviewHost || window.self !== window.top;
  } catch {
    return true;
  }
}

export async function cleanupPreviewServiceWorkers() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  }
}

export function getPwaWorkbox() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || isPreviewPwaContext()) {
    return null;
  }

  if (!wb) {
    wb = new Workbox(SW_URL, { updateViaCache: 'none' } as RegistrationOptions);
  }

  return wb;
}

export async function ensurePwaRegistration() {
  const workbox = getPwaWorkbox();
  if (!workbox) return undefined;

  if (!registerPromise) {
    registerPromise = withTimeout(
      workbox
      .register({ immediate: true })
      .then(async (registration) => {
        await registration?.update().catch(() => undefined);

        if (updateInterval === null) {
          updateInterval = window.setInterval(() => {
            workbox.update().catch(() => undefined);
          }, UPDATE_INTERVAL_MS);
        }

        return registration;
      })
      .catch((error) => {
        registerPromise = null;
        throw error;
      }),
      8000,
      undefined,
    );
  }

  return registerPromise;
}

export async function triggerPwaUpdate() {
  const workbox = getPwaWorkbox();
  const registration = await withTimeout(ensurePwaRegistration(), 8000, undefined);

  if (!workbox || !registration) return false;

  await withTimeout(registration.update().catch(() => undefined), 5000, undefined);

  if (registration.waiting) {
    workbox.messageSkipWaiting();
    return true;
  }

  return false;
}

/**
 * Limpeza TOTAL do PWA: equivale a apagar e reinstalar o app numa guia anônima.
 * - Desregistra TODOS os service workers
 * - Apaga TODOS os caches (incluindo HTML, fontes, chunks antigos)
 * - Limpa Cache Storage do navegador
 * Mantém apenas a sessão de login (localStorage do Supabase) para não deslogar o usuário.
 */
export async function nukePwaAndReload() {
  if (typeof window === 'undefined') return;

  // 1) Desregistra todos os service workers
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister().catch(() => false)));
    } catch {
      /* ignore */
    }
  }

  // 2) Apaga TODOS os caches do Cache Storage
  if ('caches' in window) {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name).catch(() => false)));
    } catch {
      /* ignore */
    }
  }

  // 3) Recarrega buscando tudo do servidor (sem cache do navegador)
  const url = new URL(window.location.href);
  url.pathname = '/';
  url.searchParams.set('_fresh', Date.now().toString());
  window.location.replace(url.toString());
}