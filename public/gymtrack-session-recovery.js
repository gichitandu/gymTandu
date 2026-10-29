// This also runs when an old installation still registers ngsw-worker.js.
// Refreshing a stale owner iPhone install does not require revoking a new login.
// The dedicated cache contains only a recovery receipt, never account archives.
(()=>{
 let checked=false,needsReload=false,job,recoveryId;
 const bounded=(work,fallback,milliseconds=500)=>new Promise(resolve=>{
  const timer=setTimeout(()=>resolve(fallback),milliseconds);
  Promise.resolve().then(work).then(value=>{clearTimeout(timer);resolve(value);},()=>{clearTimeout(timer);resolve(fallback);});
 });
 const markerKey=id=>new URL('/__gymtrack_device_recovery__/'+encodeURIComponent(id),self.location.origin).href;
 const markerCache=()=>self.caches?.open('gymtrack-device-recovery-v1');
 const wasRefreshed=id=>bounded(async()=>{const cache=await markerCache();return !!(await cache?.match(markerKey(id)))?.ok;},false);
 const rememberRefresh=id=>bounded(async()=>{const cache=await markerCache();if(cache)await cache.put(markerKey(id),new Response('refreshed',{headers:{'Content-Type':'text/plain'}}));},undefined);
 const reloadWindows=async()=>{
  const windows=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(client=>new URL(client.url).origin===self.location.origin);
  const results=await Promise.all(windows.map(client=>bounded(async()=>{
   const fresh=new URL('/',self.location.origin);fresh.searchParams.set('ngsw-bypass','1');fresh.hash='/';
   return !!await client.navigate(fresh.href);
  },false,30000)));
  checked=windows.length>0&&results.every(Boolean);
  if(checked&&recoveryId)await rememberRefresh(recoveryId);
 };
 const recover=()=>{
  if(checked)return Promise.resolve();
  if(job)return job;
  job=(async()=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
   try{
    if(needsReload){await reloadWindows();return;}
    const response=await fetch('/api/auth/device-recovery',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:'{}',signal:controller.signal});
    if(!response.ok)return;
    const result=await response.json();
    const id=typeof result.recoveryId==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(result.recoveryId)?result.recoveryId:undefined;
    if(result.signedOut!==true&&!(result.refreshRequired===true&&id)){checked=true;return;}
    // A genuine cookie revocation must also close remembered offline identity.
    // A new session only needs one fresh document per recovery generation.
    if(result.signedOut!==true&&await wasRefreshed(id)){checked=true;return;}
    recoveryId=id;needsReload=true;await reloadWindows();
   }catch{/* Retry when an online app next checks its release. */}
   finally{clearTimeout(timer);}
  })().finally(()=>{job=undefined;});
  return job;
 };
 self.addEventListener('activate',event=>event.waitUntil(recover()));
 self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin===self.location.origin&&url.pathname==='/api/app-release'&&event.request.method==='GET')event.waitUntil(recover());
 });
})();
