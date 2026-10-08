// v89 — اضافه‌شده نسبت به نسخه‌ی قبلی: کش پوسته‌ی برنامه و کتابخانه‌های CDN (برای بازشدن بدون فیلترشکن) + اعلان Push.
// درخواست‌های Supabase و پروکسی‌ها مثل قبل کاملاً دست‌نخورده می‌مانند (فقط CDNهای jsdelivr/unpkg/cdnjs و خود سایت).
/* v89 — Service Worker: نصب PWA، بازشدن بدون فیلترشکن (کش پوسته و کتابخانه‌ها)، اعلان Push */
const V = 'v105', SHELL = 'shell-' + V, LIBS = 'libs-v1';
const CDN = /(^|\.)(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)$/;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.all(['./', 'manifest.json', 'icon-192.png', 'icon-512.png', 'vendor/supabase.js']
      .map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== LIBS) await caches.delete(k);
    await self.clients.claim();
  })());
});

// اول شبکه (تا نسخه‌ی جدید همیشه بیاید)؛ اگر ۳.۵ ثانیه جواب نداد یا قطع بود، نسخه‌ی کش‌شده
async function netFirst(req, nav) {
  const cache = await caches.open(SHELL);
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 3500);
    const res = await fetch(req, { signal: ctl.signal }).finally(() => clearTimeout(t));
    const isHtml = /text\/html/.test(res.headers.get('content-type') || '');
    if (res.ok && (nav || !isHtml)) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true }) || (nav && await cache.match('./'));
    if (hit) return hit;
    throw err;
  }
}
// کتابخانه‌های CDN: بار اول که لود شد برای همیشه کش می‌شود تا بعدش حتی با فیلتر بودن CDN هم کار کند
async function cacheFirst(req) {
  const cache = await caches.open(LIBS);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  try {
    const res = await fetch(new Request(req.url, { mode: 'cors', credentials: 'omit' }));
    if (res.ok) cache.put(req.url, res.clone());
    return res;
  } catch (e) { return fetch(req); }
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) e.respondWith(netFirst(req, req.mode === 'navigate'));
  else if (CDN.test(url.hostname)) e.respondWith(cacheFirst(req));
  // بقیه (Supabase، پروکسی‌ها، تلگرام) دست‌نخورده می‌ماند
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { try { d = { body: e.data.text() }; } catch (__) {} }
  e.waitUntil(self.registration.showNotification(d.title || 'غرفه فامیلی', {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', dir: 'rtl', lang: 'fa', tag: d.tag, data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) if ('focus' in c) return c.focus();
    return clients.openWindow((e.notification.data && e.notification.data.url) || './');
  })());
});
