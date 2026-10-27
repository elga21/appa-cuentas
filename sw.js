const CACHE_NAME = 'finanzas-app-v7-recuperacion-sheets-20261026';
const CHART_URL = 'https://cdn.jsdelivr.net/npm/chart.js';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './tasks.js',
    './manifest.json',
    './icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            await cache.addAll(ASSETS);
            // Una caída del CDN no impide instalar el resto de la aplicación.
            await cache.add(CHART_URL).catch(() => {});
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(
        keys.filter(key => key.startsWith('finanzas-app-') && key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (new URL(event.request.url).origin !== self.location.origin && event.request.url !== CHART_URL) return;
    event.respondWith(
        fetch(event.request).then(response => {
            if (response.ok) {
                const copy = response.clone();
                event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
            }
            return response;
        }).catch(async () => {
            const cached = await caches.match(event.request);
            if (cached) return cached;
            if (event.request.mode === 'navigate') return caches.match('./index.html');
            return Response.error();
        })
    );
});
