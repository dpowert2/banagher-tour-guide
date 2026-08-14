var VERSION = 'banagher-v7';
var CORE = 'banagher-core-' + VERSION;
var EXT = 'banagher-ext-' + VERSION;
var PRECACHE = ['./', './index.html', './navigate.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CORE).then(function (c) { return c.addAll(PRECACHE); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CORE && k !== EXT) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Google Maps / Places: always network, never cache (useless offline anyway)
  if (url.hostname.indexOf('googleapis.com') !== -1 && url.hostname.indexOf('fonts') === -1) return;
  if (url.hostname.indexOf('gstatic.com') !== -1 && url.hostname.indexOf('fonts') === -1) return;
  if (url.hostname.indexOf('google.com') !== -1 || url.hostname.indexOf('googleusercontent') !== -1) return;

  // Weather: network first, fall back to cache
  if (url.hostname === 'api.open-meteo.com') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(EXT).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  // HTML pages: network-first, fall back to cache offline
  if (url.origin === location.origin &&
      (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/'))) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CORE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) { return hit || caches.match('./index.html'); });
      })
    );
    return;
  }

  // Other same-origin assets: cache first, refresh in background
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CORE).then(function (c) { c.put(req, copy); });
          }
          return res;
        }).catch(function () { return hit; });
        return hit || net;
      })
    );
    return;
  }

  // Fonts + Wikimedia photos: stale-while-revalidate
  if (url.hostname.indexOf('fonts.googleapis.com') !== -1 ||
      url.hostname.indexOf('fonts.gstatic.com') !== -1 ||
      url.hostname.indexOf('upload.wikimedia.org') !== -1) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(EXT).then(function (c) { c.put(req, copy); });
          return res;
        }).catch(function () { return hit; });
        return hit || net;
      })
    );
  }
});
