const CACHE_NAME = 'strichliste-v1';

const APP_SHELL_URLS = [
  '/favicon.ico',
  '/libjs/i18next.js',
  '/libjs/tailwind.js',
  '/appjs/translate.js',
  '/appjs/permission.js'
];

// Install the service worker and cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache and caching app shell');
        return cache.addAll(APP_SHELL_URLS);
      })
  );
});

// Clean up old caches on activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// The main fetch event handler
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/i/image')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return fetch(event.request).then((networkResponse) => {
          console.log('Caching new image:', url.pathname);
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        }).catch(() => {
          console.log('Serving image from cache:', url.pathname);
          return cache.match(event.request);
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) return response;
        return fetch(event.request);
      })
  );
});
