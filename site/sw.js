// Increase the version when releasing updates. Cache names are scoped to the Pages path.
const prefix='finance-shell:'+new URL(self.registration.scope).pathname+':';
const version=prefix+'5';
const shell=[
  './','./index.html','./assets/styles.css','./manifest.webmanifest',
  './assets/icons/icon-192.png','./assets/icons/icon-512.png','./assets/icons/apple.png','./assets/icons/maskable.png',
  './js/app.mjs','./js/view.mjs','./js/api.mjs','./js/storage.mjs','./js/import.mjs','./js/categorization.mjs',
  './js/parsers/statements.mjs','./js/parsers/alfa.mjs','./js/parsers/otp.mjs','./vendor/papaparse.min.js','./vendor/xlsx.full.min.js',
  './vendor/pdf.min.mjs','./vendor/pdf.worker.min.mjs'
];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(version);
  await cache.addAll(shell.map(path=>new Request(new URL(path,self.registration.scope),{cache:'reload'})));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for (const name of await caches.keys()) if (name.startsWith(prefix)&&name!==version) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  if (request.method!=='GET'||!url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async()=>{
    const cache=await caches.open(version);
    if (request.mode==='navigate') {
      return (await cache.match(new URL('./index.html',self.registration.scope))) || fetch(request);
    }
    return (await cache.match(request)) || fetch(request);
  })());
});
