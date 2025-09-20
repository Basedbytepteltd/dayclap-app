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
    icon: data.icon || '/icon-192.png', // Use your PWA icon
    badge: data.badge || '/icon-192.png', // A small icon for notification tray
    image: data.image || undefined, // Optional image
    data: {
      url: data.url || '/', // URL to open when notification is clicked
      id: data.id || new Date().getTime(),
    },
    actions: data.actions || [], // Optional actions
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

// These lines are for VitePWA's auto-update mechanism.
// Do not remove them.
self.skipWaiting();
clients.claim();
