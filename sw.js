// Service Worker ساده فقط برای قابلیت نصب (Install) روی صفحه اصلی گوشی.
// عمداً کش تهاجمی نمی‌کند تا همیشه آخرین نسخه‌ی زنده از Supabase لود شود
// و داده‌ها هیچ‌وقت قدیمی (Stale) نمایش داده نشوند.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// نکته‌ی مهم: فقط درخواست‌های هم‌مبدأ (خود همین سایت) را لمس می‌کنیم.
// درخواست‌های برون‌مبدأ (Supabase، تلگرام، پروکسی روی ali8001.ir) را کاملاً
// دست‌نخورده می‌گذاریم — یعنی اصلاً respondWith صدا زده نمی‌شود — تا مرورگر
// مستقیماً خودش آن‌ها را مدیریت کند. اگر این درخواست‌ها از داخل fetch()
// سرویس‌ورکر رد شوند، سیگنال قطع (AbortController) که برای جلوگیری از
// قفل‌شدن دکمه‌ها روی اینترنت فیلتر/کند استفاده شده درست کار نمی‌کند و
// درخواست ممکن است برای همیشه معلق بماند — دقیقاً همان چیزی که باعث
// «قفل‌شدن» دکمه‌ی ثبت ورود/خروج در نسخه‌ی نصب‌شده می‌شد.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return; // برون‌مبدأ: کاری نکن، بگذار مرورگر مستقیم خودش هندلش کند
  }
  event.respondWith(fetch(event.request));
});
