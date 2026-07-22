import { supabase } from '@/integrations/supabase/client';
import { ensurePwaRegistration } from '@/lib/pwa-updater';

// Chave pública VAPID (segura para o cliente)
export const VAPID_PUBLIC_KEY =
  'BEYXfc_5nuM3aEHnemCdSm8tYfUmpoOYq-HtfCM7w-AGh6lX5mCGaEFa531ETe0yvgYVG2Nl_eb1CoDcCBx3vLs';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufToBase64(buf: ArrayBuffer | null) {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function getReadyServiceWorker() {
  await ensurePwaRegistration().catch(() => undefined);
  return await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration | null>((resolve) => window.setTimeout(() => resolve(null), 8000)),
  ]);
}

export async function registerPush(userId: string) {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission === 'default') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') return;
    }
    if (Notification.permission !== 'granted') return;

    const reg = await getReadyServiceWorker();
    if (!reg) return;
    let sub = await reg.pushManager.getSubscription();
    const desiredKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    // Se já existe uma assinatura com outra chave VAPID, descarta e re-assina
    if (sub) {
      const currentKey = sub.options?.applicationServerKey;
      const mismatch = !currentKey ||
        bufToBase64(currentKey as ArrayBuffer) !== bufToBase64(desiredKey.buffer as ArrayBuffer);
      if (mismatch) {
        try { await sub.unsubscribe(); } catch {}
        try {
          await supabase.from('push_subscriptions' as any).delete().eq('endpoint', sub.endpoint);
        } catch {}
        sub = null;
      }
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: desiredKey,
      });
    }
    const json = sub.toJSON() as any;
    const endpoint = sub.endpoint;
    const p256dh = json.keys?.p256dh || bufToBase64(sub.getKey('p256dh'));
    const auth = json.keys?.auth || bufToBase64(sub.getKey('auth'));

    await supabase.from('push_subscriptions' as any).upsert(
      {
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );
  } catch (e) {
    console.warn('[push] register failed', e);
  }
}

export async function unregisterPush(userId: string) {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await supabase.from('push_subscriptions' as any).delete().eq('user_id', userId).eq('endpoint', endpoint);
    } else {
      await supabase.from('push_subscriptions' as any).delete().eq('user_id', userId);
    }
  } catch (e) {
    console.warn('[push] unregister failed', e);
  }
}

export function pushPermissionState(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}
