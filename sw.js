const CACHE = 'baroalba-v312';
const SHELL = [
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/logo-share.png',
  './icons/og-share.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 페이지에서 SKIP_WAITING 메시지 수신 시 즉시 활성화
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // http/https 이외(chrome-extension:// 등) 무시
  if (!url.startsWith('http')) return;

  // API 서버리스 함수, Supabase, 카카오, 네이버 API는 항상 네트워크 직접
  if (url.includes('/api/') || url.includes('supabase') || url.includes('kakao') || url.includes('naver.com')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // HTML 파일은 네트워크 우선 + Chrome 디스크 캐시 완전 우회
  const _path = new URL(url).pathname;
  if (e.request.destination === 'document' || _path.endsWith('.html') || _path.endsWith('/')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).catch(() =>
        caches.match(e.request).then(r => r || Response.error())
      )
    );
    return;
  }

  // CSS, JS, 이미지는 캐시 우선
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});

self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(data.title || '바로알바', {
      body: data.body || '새로운 알림이 있습니다.',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      vibrate: [200, 100, 200],
      tag: data.tag || ('msg-' + Date.now()),
      renotify: true,
      data: (() => {
        const u = data.url || './바로알바.html';
        let view = null;
        try { view = new URL(u, 'https://baroalba.multimove.co.kr').searchParams.get('view'); } catch(e) {}
        return { url: u, appId: data.app_id || null, type: data.type || null, view };
      })(),
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const { url, appId, type, view } = e.notification.data || {};
  const targetUrl = url || './바로알바.html';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      const appWin = wins.find(w =>
        w.url.includes('바로알바.html') ||
        w.url.includes('baroalba.multimove.co.kr')
      );
      if (appWin) {
        appWin.focus();
        if (appId && type === 'chat') {
          appWin.postMessage({ type: 'OPEN_CHAT', appId, view });
        }
        return;
      }
      return clients.openWindow(targetUrl);
    })
  );
});
