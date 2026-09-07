// Service Worker: هم برای قابلیت نصب (Install) روی صفحه اصلی گوشی، هم برای
// نمایش اعلان‌های فوری (Push) حتی وقتی مرورگر/برنامه کاملاً بسته است.
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

// وقتی یک پیام Push از سرور می‌رسد (حتی اگر هیچ تب بازی از برنامه وجود نداشته باشد)،
// یک اعلان سیستمی (مثل اعلان تلگرام/واتساپ) روی گوشی نمایش می‌دهیم.
self.addEventListener('push', (event) => {
  let data = { title: 'غرفه فامیلی', body: 'یک اعلان جدید دارید.' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  const options = {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    dir: 'rtl',
    lang: 'fa',
    vibrate: [120, 60, 120],
    tag: 'family-shop-alert',
    renotify: true
  };
  event.waitUntil(self.registration.showNotification(data.title || 'غرفه فامیلی', options));
});

// وقتی کاربر روی خود اعلان تپ می‌کند، برنامه را باز کن (یا اگر باز است، همان تب را جلو بیاور)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
