// Service Worker v324 — بدون دخالت در لود؛ فقط معیار نصب Chrome
const V = 'v324';

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) {
        // کش‌های قدیمی که HTML را قفل می‌کردند
        if (String(k).indexOf('shell-') === 0) return caches.delete(k);
        return Promise.resolve();
      }));
    } catch (err) {}
    await self.clients.claim();
  })());
});

self.addEventListener('message', function (e) {
  var d = e && e.data;
  if (!d) return;
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  if (d.type === 'CLAIM') self.clients.claim();
  if (d.type === 'PURGE_CACHES') {
    e.waitUntil((async function () {
      try {
        var keys = await caches.keys();
        await Promise.all(keys.map(function (k) { return caches.delete(k); }));
      } catch (err) {}
    })());
  }
});

// مهم: هیچ respondWith — مرورگر همیشه مستقیم از سرور می‌گیرد
self.addEventListener('fetch', function () {});
