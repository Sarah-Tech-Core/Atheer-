const STATIC_CACHE = 'atheer-static-v1';
const API_CACHE = 'atheer-api-v1';
const AUDIO_CACHE = 'atheer-audio-v1';
const MAX_AUDIO_FILES = 50;

const staticAssets = [
  './',
  './index.html',
  './offline.html',
  './style.css',
  './script.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('✅ تم تثبيت الكاش الأساسي');
      return cache.addAll(staticAssets);
    }).catch(err => console.warn('فشل تثبيت بعض الملفات:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== STATIC_CACHE && key !== API_CACHE && key !== AUDIO_CACHE) {
            console.log('🗑️ حذف الكاش القديم:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API
  if (url.hostname.includes('api.alquran.cloud') || url.hostname.includes('raw.githubusercontent.com')) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(API_CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) {
          console.log('📡 API من الكاش');
          return cached;
        }
        return new Response(JSON.stringify({ error: 'لا يوجد اتصال بالإنترنت' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Audio
  if (url.hostname.includes('mp3quran.net') && event.request.url.endsWith('.mp3')) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(AUDIO_CACHE).then(async cache => {
            const keys = await cache.keys();
            if (keys.length >= MAX_AUDIO_FILES) {
              const oldest = keys[0];
              await cache.delete(oldest);
              console.log('🗑️ حذف أقدم ملف صوتي');
            }
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) {
          console.log('🎵 صوت من الكاش');
          return cached;
        }
        return new Response('', { status: 503 });
      })
    );
    return;
  }

  // Static
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        return response;
      }
      return fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./offline.html');
        }
        return new Response('', { status: 404 });
      });
    })
  );
});