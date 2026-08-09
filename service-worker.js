const CACHE="evdrivesound-v10";
const FILES=[
  "./",
  "./index.html",
  "./app.min.css",
  "./app.min.js",
  "./manifest.json",
  "./evds-logo.svg",
  "./paypal-qr.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys().then(keys=>
      Promise.all(
        keys
          .filter(key=>key!==CACHE)
          .map(key=>caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch",event=>{
  const req=event.request;

  if(req.method!=="GET") return;

  const url=new URL(req.url);

  if(url.origin!==self.location.origin) return;

  event.respondWith(
    fetch(req,{cache:"no-store"})
      .then(resp=>{
        if(resp && resp.ok && resp.type==="basic"){
          const copy=resp.clone();
          caches.open(CACHE).then(cache=>cache.put(req,copy));
        }
        return resp;
      })
      .catch(()=>caches.match(req))
  );
});
