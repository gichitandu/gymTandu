// Retirement worker for legacy registrations. It never opens an account
// archive, revokes a login, removes storage, or waits for a server backup.
(()=>{
 const origin=self.location.origin,canonical='/gymtrack-app-worker-v3.js';
 let pending,finished=false;
 const moved=new Set();
 const canonicalTakingOver=()=>[self.registration.active,self.registration.installing,self.registration.waiting].some(worker=>worker?.scriptURL?.endsWith(canonical)&&worker.state!=='redundant');
 const bounded=(work,fallback,milliseconds)=>new Promise(resolve=>{
  const timer=setTimeout(()=>resolve(fallback),milliseconds);
  Promise.resolve().then(work).then(value=>{clearTimeout(timer);resolve(value);},()=>{clearTimeout(timer);resolve(fallback);});
 });
 const staticUrl=url=>url.origin===origin&&!url.pathname.startsWith('/api/')&&(
  url.pathname==='/'||/^\/(?:brand|icons|exercises|templates|vendor)\//.test(url.pathname)||
  /^\/[a-zA-Z0-9._-]+\.(?:html|js|css|json|webmanifest|png|svg|webp|jpe?g|ico|txt)$/.test(url.pathname));
 const cached=async request=>bounded(async()=>{
  const url=new URL(request.url),key=url.pathname==='/'||url.pathname==='/index.html'?new URL('/index.html',origin).href:request.url;
  const names=(await self.caches.keys()).filter(name=>name.startsWith('ngsw:')&&name.includes(':assets:')).reverse();
  for(const name of names){
   const cache=await self.caches.open(name),response=await cache.match(key,{ignoreVary:true});
   if(response?.ok)return response;
  }
 },undefined,3000);
 const staticResponse=async request=>{
  let response;
  try{
   response=await fetch(request);
   // Authentication responses must reach the browser unchanged. Never replace
   // them with cached app HTML or save them in a static-resource cache.
   if(response.ok||response.status===401||response.status===403||response.redirected||response.type==='opaqueredirect')return response;
  }catch{/* Existing Angular asset caches can bridge a temporary offline move. */}
  return await cached(request)||response||new Response('GymTrack non è disponibile in rete e questa risorsa non è ancora salvata sul dispositivo.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
 };
 const freshShell=async()=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const url=new URL('/index.html',origin);url.searchParams.set('ngsw-bypass','1');
   const response=await fetch(url.href,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});
   if(!response.ok||response.redirected||!response.headers.get('Content-Type')?.toLowerCase().includes('text/html'))return false;
   const html=await response.text();
   return html.length<524288&&/<app-root(?:\s|>)/i.test(html)&&/<meta\s+name=["']gymtrack-worker["']\s+content=["']\/gymtrack-app-worker-v3\.js["']/i.test(html);
  }catch{return false;}finally{clearTimeout(timer);}
 };
 const migrate=()=>{
  if(finished||canonicalTakingOver())return Promise.resolve();
  if(pending)return pending;
  pending=(async()=>{
   const windows=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(client=>{
    try{return new URL(client.url).origin===origin&&!moved.has(client.id);}catch{return false;}
   });
   if(!windows.length||!await freshShell())return;
   const results=await Promise.all(windows.map(client=>bounded(async()=>{
    if(canonicalTakingOver())return true;
    const target=new URL(client.url);target.pathname='/aggiorna.html';target.searchParams.set('ngsw-bypass','1');target.searchParams.set('auto','1');if(!target.hash)target.hash='/';
    const next=await client.navigate(target.href);
    if(!next)return false;
    moved.add(client.id);if(next.id)moved.add(next.id);return true;
   },false,30000)));
   finished=results.every(Boolean);
  })().catch(()=>{}).finally(()=>{pending=undefined;});
  return pending;
 };
 self.addEventListener('install',event=>event.waitUntil((async()=>{
  if(canonicalTakingOver())throw Error('The canonical worker already owns this registration.');
  if(!await freshShell())throw Error('The current application is not reachable; preserve the existing offline worker.');
  await self.skipWaiting();
 })()));
 self.addEventListener('activate',event=>event.waitUntil((async()=>{await self.clients.claim();await migrate();})()));
 self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==origin)return;
  // Release checks trigger another attempt, but their response is never
  // intercepted or used as a prerequisite for migration.
  if(staticUrl(url)||url.pathname==='/api/app-release')event.waitUntil(migrate());
  if(staticUrl(url))event.respondWith(staticResponse(request));
 });
})();
