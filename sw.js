// Service Worker v323 — بدون دخالت در لود سایت (فقط برای نصب PWA)
const V = 'v323';

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    // همه کش‌های قدیمی shell که HTML را خراب می‌کردند پاک شوند
    try {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) {
        if (String(k).indexOf('shell-') === 0 || String(k).indexOf('libs-') === 0) {
          return caches.delete(k);
        }
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

// هیچ fetch را respondWith نکن — مرورگر مستقیم از سرور می‌گیرد
// وجود این listener فقط برای معیار نصب Chrome است
self.addEventListener('fetch', function () {
  // intentionally empty
});
