// Service Worker v318 — غیرفعال / فقط عبور از شبکه
const V = 'v318';
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    } catch (err) {}
    await self.clients.claim();
  })());
});
// هیچ fetch را رهگیری نکن — بگذار مرورگر مستقیم از سرور بگیرد
