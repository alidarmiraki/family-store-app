// Service Worker ساده فقط برای قابلیت نصب (Install) روی صفحه اصلی گوشی.
// عمداً کش تهاجمی نمی‌کند تا همیشه آخرین نسخه‌ی زنده از Supabase لود شود
// و داده‌ها هیچ‌وقت قدیمی (Stale) نمایش داده نشوند.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// هیچ کشی انجام نمی‌دهیم؛ فقط وجود این فایل برای معیارهای نصب (installability) کافی است.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
