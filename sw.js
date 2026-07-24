const CACHE = 'baroalba-v561';
const SHELL = [
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/logo-share.png',
  './icons/og-share.png',
];

const SB_URL  = 'https://onwvbmllpycgswfzywjv.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ud3ZibWxscHljZ3N3Znp5d2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMDMyNzksImV4cCI6MjA5NTc3OTI3OX0.CbwhyfqCZp_jjMbHUESVzbPDAZLNV2lpniUkouqLLmQ';

// ── IndexedDB 헬퍼 (SW 재시작 후에도 인증 토큰 유지) ─────────
function _openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('baroalba-sw', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('kv');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}
async function _dbGet(key) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('kv', 'readonly').objectStore('kv').get(key);
    req.onsuccess = e => resolve(e.target.result ?? null);
    req.onerror = e => reject(e.target.error);
  });
}
async function _dbSet(key, val) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('kv', 'readwrite').objectStore('kv').put(val, key);
    req.onsuccess = () => resolve();
    req.onerror = e => reject(e.target.error);
  });
}

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

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  // 앱에서 로그인 후 인증 토큰 저장
  if (e.data?.type === 'SET_AUTH') {
    _dbSet('auth_token', e.data.token).catch(() => {});
    _dbSet('user_id',    e.data.userId).catch(() => {});
  }
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (!url.startsWith('http')) return;
  if (url.includes('/api/') || url.includes('supabase') || url.includes('kakao') || url.includes('naver.com')) {
    e.respondWith(fetch(e.request));
    return;
  }
  const _path = new URL(url).pathname;
  if (e.request.destination === 'document' || _path.endsWith('.html') || _path.endsWith('/')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).catch(() =>
        caches.match(e.request).then(r => r || Response.error())
      )
    );
    return;
  }
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
  const isChat = data.type === 'chat';
  // chat 알림에만 인라인 답장 액션 추가 (Chrome Android 지원)
  const actions = isChat ? [
    { action: 'reply', title: '답장', type: 'text', placeholder: '답장 입력...' }
  ] : [];

  e.waitUntil(
    self.registration.showNotification(data.title || '바로알바', {
      body: data.body || '새로운 알림이 있습니다.',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      vibrate: [200, 100, 200],
      tag: data.tag || ('msg-' + Date.now()),
      renotify: true,
      actions,
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

  // ── 인라인 답장 처리 ─────────────────────────────────────
  if (e.action === 'reply' && e.reply && appId) {
    e.waitUntil((async () => {
      try {
        const token  = await _dbGet('auth_token');
        const userId = await _dbGet('user_id');

        if (token && userId) {
          // Supabase REST로 직접 메시지 저장
          const res = await fetch(`${SB_URL}/rest/v1/messages`, {
            method: 'POST',
            headers: {
              'apikey': SB_ANON,
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({
              application_id: appId,
              sender_id: userId,
              content: e.reply.trim(),
              is_read: false,
            }),
          });

          if (res.ok) {
            // 성공 — 조용히 처리 (별도 알림 없음)
            return;
          }
        }

        // 인증 정보 없거나 전송 실패 → 앱 열어서 처리
        const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        const appWin = wins.find(w => w.url.includes('바로알바.html') || w.url.includes('baroalba.multimove.co.kr'));
        if (appWin) {
          appWin.focus();
          appWin.postMessage({ type: 'PENDING_REPLY', appId, content: e.reply.trim() });
        } else {
          await clients.openWindow(`${targetUrl}#chat=${appId}`);
        }
      } catch(err) {
        // 오류 시 앱 열기
        clients.openWindow(targetUrl);
      }
    })());
    return;
  }

  // ── 일반 알림 클릭 ───────────────────────────────────────
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
