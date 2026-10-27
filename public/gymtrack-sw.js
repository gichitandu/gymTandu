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
self.addEventListener('push',event=>{
 if(event.data){try{if(event.data.text()!=='')return;}catch{return;}} // Keep structured Angular pushes intact.
 event.waitUntil((async()=>{
  const grant=await reminderGrant();if(!grant?.enabled)return;
  await self.registration.showNotification('GymTrack · Allenamento',{body:'È il momento di dedicarti al tuo allenamento. Apri il programma di oggi.',icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:'gymtrack-daily-workout',renotify:false,data:{gymtrackWorkoutReminder:true}});
  try{await self.navigator.setAppBadge?.(1);}catch{}
 })());
});
self.addEventListener('notificationclick',event=>{
 if(!event.notification.data?.gymtrackWorkoutReminder)return;
 event.stopImmediatePropagation();event.notification.close();event.waitUntil((async()=>{
  try{await self.navigator.clearAppBadge?.();}catch{}
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true}),existing=windows.find(w=>new URL(w.url).origin===self.location.origin);
  if(existing)await existing.focus();else await self.clients.openWindow('/calendario');
 })());
});
importScripts('/ngsw-worker.js');
