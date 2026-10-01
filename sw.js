self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

self.addEventListener('message', e => {
    if (e.data && e.data.type === 'SHOW_NOTIFICATION') {
        self.registration.showNotification(e.data.title, {
            body: e.data.body,
            icon: '/media/logo-blanco.png',
            badge: '/media/logo-blanco.png',
            vibrate: [200, 100, 200]
        });
    }
});

self.addEventListener('push', e => {
    const data = e.data ? e.data.json() : {};
    e.waitUntil(
        self.registration.showNotification(data.title || 'Mi Turno', {
            body: data.body || '',
            icon: '/media/logo-blanco.png',
            badge: '/media/logo-blanco.png'
        })
    );
});
