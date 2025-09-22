import { precacheAndRoute } from 'workbox-precaching';

// public/sw.js - Service Worker for Push Notifications

// This service worker is registered by VitePWA.
// It handles push events and displays notifications.

// This line is injected by vite-plugin-pwa to precache your assets.
// Do not remove it.
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'DayClap Notification';
  const options = {
    body: data.body || 'You have a new notification from DayClap.',
    icon: data.icon || '/favicon.svg', // use SVG icon to avoid invalid PNG errors
    badge: data.badge || '/favicon.svg',
    image: data.image || undefined,
    data: {
      url: data.url || '/',
      id: data.id || new Date().getTime(),
    },
    actions: data.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data.url;

  event.waitUntil(
    clients.openWindow(urlToOpen)
  );
});

// VitePWA auto-update
self.skipWaiting();
clients.claim();
