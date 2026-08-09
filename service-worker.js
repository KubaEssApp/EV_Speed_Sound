const CACHE="evdrivesound-v11";
const FILES=["./","./index.html","./app.min.css","./app.min.js","./manifest.json","./evds-logo.svg","./paypal-qr.png","./icon-192.png","./icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const url=new URL(e.request.url);
  if(url.origin!==self.location.origin)return;
  e.respondWith(fetch(e.request,{cache:"no-store"}).then(r=>{
    if(r&&r.ok&&r.type==="basic"){const c=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c))}
    return r;
  }).catch(()=>caches.match(e.request)));
});