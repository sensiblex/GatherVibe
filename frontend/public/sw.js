self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title ?? 'GatherVibe';
  const options = {
    body: data.body ?? '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: data.data ?? {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const partyId = event.notification.data?.party_id;
  if (partyId) {
    event.waitUntil(clients.openWindow(`/parties/${partyId}`));
  } else {
    event.waitUntil(clients.openWindow('/notifications'));
  }
});

// Passthrough fetch handler — no caching, just signals intentional SW presence.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
