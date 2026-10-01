// sw.js - Service Worker para PWA y Notificaciones Push en Móviles (Mi Turno)

const CACHE_NAME = 'miturno-v1';

// Instalación inmediata
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activación y toma de control de clientes
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Listener para mensajes provenientes de la app web (postMessage)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, badge, data } = event.data;
    
    self.registration.showNotification(title || 'Mi Turno Barbería', {
      body: body || '',
      icon: icon || '/media/logo-blanco.png',
      badge: badge || '/media/logo-blanco.png',
      vibrate: [200, 100, 200, 100, 200],
      tag: 'miturno-notif-' + Date.now(),
      renotify: true,
      data: data || { url: '/pages/turnos.html' }
    });
  }
});

// Listener para Push Remotos (Web Push API / FCM)
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Mi Turno', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Mi Turno Barbería';
  const options = {
    body: data.body || 'Tenés una novedad sobre tu turno.',
    icon: '/media/logo-blanco.png',
    badge: '/media/logo-blanco.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/pages/turnos.html' }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Click en la notificación abre o enfoca la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) 
    ? event.notification.data.url 
    : '/pages/turnos.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
