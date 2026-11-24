// アプリの画面をスマホに保存して、すばやく開けるようにする
const CACHE = "futari-v16";
const SHELL = ["./", "index.html", "style.css", "app.js", "store.js", "compat.js", "config.js", "manifest.json",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  // ブラウザに残っている古いファイルではなく、必ずサーバーの最新を保存する
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 自分のファイルは「新しいのを取りに行き、だめなら保存分」。Firebase の通信には触らない。
// cache: "no-cache" で、ブラウザに残っている古い版を使わずに毎回サーバーに確かめる
// (新しい app.js と古い store.js が混ざるのを防ぐ)
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
