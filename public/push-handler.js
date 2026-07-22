// Permite que o cliente force a ativação da nova versão imediatamente
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Push event handlers — importScripts'd into the workbox-generated service worker
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Barbearia', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Barbearia';
  const options = {
    body: data.body || '',
    icon: '/pwa-icon-192.png',
    badge: '/pwa-icon-192.png',
    tag: data.tag || 'barbearia',
    data: { url: data.url || '/' },
    vibrate: [120, 60, 120],
    requireInteraction: false,
  };

  event.waitUntil((async () => {
    // Deduplicação: se já existe uma janela visível e focada do app,
    // o GlobalNotifier exibe um toast in-app. Suprimimos a notificação do sistema.
    try {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const hasVisibleFocused = clients.some((c) => c.visibilityState === 'visible' && c.focused);
      if (hasVisibleFocused) {
        // Avisa o cliente para garantir o toast (caso o realtime tenha falhado)
        clients.forEach((c) => {
          try { c.postMessage({ type: 'PUSH_RECEIVED', payload: data }); } catch {}
        });
        return;
      }
    } catch {}
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if ('focus' in client) {
        client.navigate(url).catch(() => {});
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
