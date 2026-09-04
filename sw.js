const CACHE_NAME = 'family-store-v1';
const ASSETS = [
  '/family-store-app/',
  '/family-store-app/index.html',
  '/family-store-app/manifest.json',
  '/family-store-app/icon-192.png',
  '/family-store-app/icon-512.png'
];

// نصب و ذخیره فایل‌های اصلی در کش
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// فعال‌سازی و پاک‌سازی کش‌های قدیمی
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// مدیریت درخواست‌ها (اول شبکه، در صورت قطعی پاسخ از کش)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request).then((response) => {
        if (response) {
          return response;
        }
        // در صورت عدم دسترسی به شبکه و فایل، بازگرداندن صفحه اصلی
        if (event.request.mode === 'navigate') {
          return caches.match('/family-store-app/index.html');
        }
      });
    })
  );
});
