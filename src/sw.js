/* ===== Bellamare Tracker — Service Worker ===== */

var CACHE_NAME = 'bm-tracker-v12';
var SHELL_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/db.js',
  '/js/tasks.js',
  '/js/email.js',
  '/img/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json'
];

// Install: pre-cache app shell, activate immediately
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(SHELL_ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

// Activate: clean ALL old caches, take control immediately
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

// Fetch: NETWORK-FIRST for everything (cloud app — always get latest)
self.addEventListener('fetch', function (event) {
  // Only handle GET requests — let DELETE/PUT/POST pass through untouched
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request).then(function (response) {
      // Cache the fresh response for offline fallback
      if (response.ok) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, clone);
        });
      }
      return response;
    }).catch(function () {
      // Network failed — try cache as fallback
      return caches.match(event.request);
    })
  );
});
