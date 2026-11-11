// Angular continues to own offline assets and updates. Only our payload-free
// morning reminder is handled here. Retired recovery alerts are removed on update.
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  try{
   const alerts=await self.registration.getNotifications({tag:'gymtrack-rest-timer'});
   alerts.filter(alert=>alert.tag==='gymtrack-rest-timer').forEach(alert=>alert.close());
  }catch{} // Cleanup is optional on browsers without notification enumeration.
 })());
});
function reminderGrant(){return new Promise(resolve=>{
 const open=indexedDB.open('gymtrack-push-device-v1',1);
 open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains('settings'))open.result.createObjectStore('settings');};
 open.onerror=open.onblocked=()=>resolve(null);
 open.onsuccess=()=>{const db=open.result,tx=db.transaction('settings','readonly'),job=tx.objectStore('settings').get('current');let value=null;job.onsuccess=()=>value=job.result;tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=tx.onabort=()=>{db.close();resolve(null);};};
});}
// GT Hub: il push resta vuoto; il testo dei promemoria si chiede a GymTrack con la sessione
// del dispositivo. Ogni promemoria viene mostrato una sola volta per dispositivo.
function hubShown(update){return new Promise(resolve=>{
 const open=indexedDB.open('gymtrack-push-device-v1',1);
 open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains('settings'))open.result.createObjectStore('settings');};
 open.onerror=open.onblocked=()=>resolve([]);
 open.onsuccess=()=>{const db=open.result,tx=db.transaction('settings',update?'readwrite':'readonly'),store=tx.objectStore('settings');let value=[];
  const job=update?store.put(update,'hub-shown'):store.get('hub-shown');job.onsuccess=()=>{value=update||(Array.isArray(job.result)?job.result:[]);};
  tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=tx.onabort=()=>{db.close();resolve([]);};};
});}
async function hubReminders(){
 let items;
 try{const response=await fetch('/api/hub/due',{credentials:'same-origin',cache:'no-store'});if(!response.ok)return null;const body=await response.json();items=Array.isArray(body.items)?body.items:[];}catch{return null;}
 const shown=await hubShown(),fresh=items.filter(item=>item&&typeof item.id==='string'&&!shown.includes(item.id)).slice(0,5);
 if(fresh.length)await hubShown([...fresh.map(item=>item.id),...shown].slice(0,60));
 return fresh;
}
self.addEventListener('push',event=>{
 if(event.data){try{if(event.data.text()!=='')return;}catch{return;}} // Keep structured Angular pushes intact.
 event.waitUntil((async()=>{
  const grant=await reminderGrant();if(!grant?.enabled)return;
  const hub=await hubReminders();
  if(hub&&hub.length){
   for(const item of hub)await self.registration.showNotification(String(item.title||'GT Hub').slice(0,120),{body:String(item.body||'').slice(0,240),icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:'gymtrack-hub-'+String(item.id).slice(0,100),data:{gymtrackHub:true,url:typeof item.url==='string'&&item.url.startsWith('/')&&!item.url.startsWith('//')?item.url:'/hub'}});
   try{await self.navigator.setAppBadge?.(hub.length);}catch{}
   return;
  }
  await self.registration.showNotification('GymTrack · Allenamento',{body:'È il momento di dedicarti al tuo allenamento. Apri il programma di oggi.',icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:'gymtrack-daily-workout',renotify:false,data:{gymtrackWorkoutReminder:true}});
  try{await self.navigator.setAppBadge?.(1);}catch{}
 })());
});
self.addEventListener('notificationclick',event=>{
 if(event.notification.data?.gymtrackHub){
  event.stopImmediatePropagation();event.notification.close();event.waitUntil((async()=>{
   try{await self.navigator.clearAppBadge?.();}catch{}
   const target=new URL('/#'+event.notification.data.url,self.location.origin).href,windows=await self.clients.matchAll({type:'window',includeUncontrolled:true}),existing=windows.find(w=>new URL(w.url).origin===self.location.origin);
   if(existing){await existing.focus();try{await existing.navigate?.(target);}catch{}}else await self.clients.openWindow(target);
  })());
  return;
 }
 if(!event.notification.data?.gymtrackWorkoutReminder)return;
 event.stopImmediatePropagation();event.notification.close();event.waitUntil((async()=>{
  try{await self.navigator.clearAppBadge?.();}catch{}
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true}),existing=windows.find(w=>new URL(w.url).origin===self.location.origin);
  if(existing)await existing.focus();else await self.clients.openWindow('/calendario');
 })());
});
importScripts('/gymtrack-offline-engine-v3.js');
