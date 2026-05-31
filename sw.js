const CACHE = 'baroalba-v1';
const SHELL = [
  './login.html',
  './바로알바.html',
  './manifest.json',
  './icons/icon.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

// 설치: 앱 셸 캐시
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// 활성화: 이전 캐시 정리
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 패치: 캐시 우선, 없으면 네트워크
self.addEventListener('fetch', e => {
  // API 호출은 항상 네트워크 우선
  if (e.request.url.includes('supabase') || e.request.url.includes('kakao') || e.request.url.includes('naver.com/v1/nid')) {
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }))
  );
});

// 푸시 알림 (추후 Supabase Edge Function에서 전송)
self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(data.title || '바로알바', {
      body: data.body || '새로운 알림이 있습니다.',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      data: data.url || './바로알바.html',
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data));
});
