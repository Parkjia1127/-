// Only a generic offline notice. Never read or cache member data or API responses.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  const message = event.data?.text();
  if (message !== 'board-alert' && message !== 'board-test') return;
  const test = message === 'board-test';
  event.waitUntil(self.registration.showNotification(test ? '게시판 테스트 알림' : '게시판에 새 알림이 있어요', {
    body: test ? '이 알림이 보이면 푸시가 작동하고 있어요.' : '게시판을 열어 확인해 주세요.', icon: '/party-icon-192.png',
    ...(test ? { tag:'board-test', renotify:true } : {}),
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/?notifications=1'));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.mode !== 'navigate' || event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).catch(() => new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>연결이 필요해요</title><main style="margin:3rem auto;width:calc(100% - 3rem);max-width:36rem;font:1rem/1.7 system-ui"><h1>인터넷에 연결해 주세요</h1><p>입장 권한을 확인해야 글과 댓글을 볼 수 있어요.</p><a href="/">다시 열기</a></main></html>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })));
});
