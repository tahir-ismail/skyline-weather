// Service worker: makes Skyline installable and lets it open offline with the last forecast.
// Bump the version when the list of app files changes, so old caches get cleared.
const CACHE = 'skyline-v1';
const APP_FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'logic.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];
const API_HOSTS = ['api.open-meteo.com', 'air-quality-api.open-meteo.com', 'geocoding-api.open-meteo.com', 'api.bigdatacloud.net'];

// On install: save the app files so the page itself loads offline.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting(); // use the new version straight away instead of waiting for every tab to close
});

// On activate: delete caches from older versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Decides where each request is answered from.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // App files and weather data: try the network first so they're always fresh, fall back to the cache offline.
  if (url.origin === self.location.origin || API_HOSTS.includes(url.hostname)) {
    event.respondWith(networkFirst(request));
    return;
  }
  // Fonts and icons rarely change: use the cached copy if there is one.
  event.respondWith(cacheFirst(request));
});

// Fetches from the network and saves a copy; uses the saved copy if the network fails.
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (cached) return cached;
    throw error;
  }
}

// Uses the saved copy if there is one; otherwise fetches and saves it.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
  return response;
}
