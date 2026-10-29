// This also runs when an old installation still registers ngsw-worker.js.
// The server permits only the owner's pre-fix iPhone cookie to recover once.
// Recovery changes identity metadata only; backups and local archives are not prerequisites.
(()=>{
 let checked=false,needsReload=false,job;
 const reloadWindows=async()=>{
  const windows=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(client=>new URL(client.url).origin===self.location.origin);
  const results=await Promise.allSettled(windows.map(client=>{
   const fresh=new URL('/',self.location.origin);fresh.searchParams.set('ngsw-bypass','1');fresh.hash='/';
   return client.navigate(fresh.href);
  }));
  checked=windows.length>0&&results.every(result=>result.status==='fulfilled');
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
    if(result.signedOut!==true){checked=true;return;}
    needsReload=true;await reloadWindows();
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
