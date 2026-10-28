/* The release id is shared by every cache key in this deployment. */
const RELEASE = '20261029-229';
const CACHE_PREFIX = 'boki-rpg-';
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE}`;
const VERSIONED_ASSETS = [
  './css/style.css', './data/accounting-domain.js', './data/questions.js', './data/accounting-oracle.js', './js/calculator.js', './js/model.js',
  './js/rpg.js', './js/engine.js', './js/feedback.js', './js/explanation-formulas.js', './js/explanation-model.js', './js/explanation-design-system.js', './js/view.js', './js/controller.js', './js/app.js', './data/form-a.json', './js/form-a-scoring.js', './js/form-a-store.js', './js/form-a.js', './css/form-a.css'
].map(path => `${path}?v=${RELEASE}`);
const APP_SHELL = [
  './', './index.html', './form-a.html', './manifest.webmanifest', './icons/app-icon.svg', ...VERSIONED_ASSETS
];

self.addEventListener('install', event => {
  // Installation only succeeds when one coherent release has been downloaded.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'BOKI_STORAGE_CLIENTS' && event.source?.id && event.ports?.[0]) {
    const port=event.ports[0];
    // includeUncontrolled is essential: Release179 clients have no Web Lock.
    event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients => {
      // Identify this replying worker, not a different active worker seen by a
      // waiting installation. A page wrapper may lag after a manual reload.
      const supported='serviceWorker' in self,worker=supported?self.serviceWorker:null;
      const activation=supported?{state:worker?.state??'unknown',active:!!worker&&self.registration.active===worker}:null;
      port.postMessage({protocol:1,release:RELEASE,requester:event.source.id,clients:clients.map(client=>client.id),activation});
    }).catch(()=>port.postMessage({protocol:1,error:true})));
  }
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

const networkFirst = async request => {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok && response.type !== 'opaque') await cache.put(request, response.clone());
    return response;
  } catch (_) {
    return (await cache.match(request)) || cache.match(new URL(request.url).pathname.endsWith('/form-a.html') ? './form-a.html' : './index.html');
  }
};

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }
  // Query strings are release identifiers and therefore remain part of the key.
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && response.type !== 'opaque') await cache.put(event.request, response.clone());
    return response;
  }));
});
