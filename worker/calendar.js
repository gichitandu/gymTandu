// Only projected dates/titles leave the private application. Shared secret stays server-side.
export function calendarConfigured(env){
 try{const u=new URL(env.CALENDAR_RELAY_URL);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/'&&typeof env.CALENDAR_RELAY_SECRET==='string'&&env.CALENDAR_RELAY_SECRET.length>=32;}catch{return false;}
}
async function calendarAccountKey(env,user){
 const encoder=new TextEncoder(),key=await crypto.subtle.importKey('raw',encoder.encode(env.CALENDAR_RELAY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode('gymtrack-calendar:account:'+user.id)))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
async function calendarRelay(env,user,method='GET',body){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
 try{
  const response=await fetch(new URL('/manage/'+await calendarAccountKey(env,user),env.CALENDAR_RELAY_URL),{method,redirect:'error',signal:controller.signal,headers:{Authorization:'Bearer '+env.CALENDAR_RELAY_SECRET,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw Error('Calendario iPhone momentaneamente non disponibile. Riprova.');return await response.json();
 }finally{clearTimeout(timer);}
}
export function calendarProjection(data){
 const completed=new Set(data.workouts.filter(w=>w.status==='completed').map(w=>w.id));
 return data.scheduledWorkouts.filter(e=>!completed.has(e.workoutId)).map(e=>({id:e.id,date:e.date,title:String(e.dayName||'Allenamento').slice(0,200)}));
}
export async function calendarPublish(env,user,text,revision,updatedAt){
 if(!calendarConfigured(env)||!user)return;
 const state=await calendarRelay(env,user);if(!state.enabled)return;
 await calendarRelay(env,user,'POST',{events:calendarProjection(JSON.parse(text).data),revision,updatedAt});
}
export async function calendarApi(request,env,user,readArchive){
 const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
 if(!user)return reply({error:'Accedi al tuo account per collegare il calendario.'},401);
 if(!calendarConfigured(env))return reply({configured:false,enabled:false});
 if(!['GET','POST','DELETE'].includes(request.method))return reply({error:'Metodo non supportato.'},405);
 if(request.method==='DELETE'){await calendarRelay(env,user,'DELETE');return reply({configured:true,enabled:false});}
 if(request.method==='POST'){
  const snapshot=await readArchive();if(!snapshot.ok)return snapshot;
  const head=await snapshot.json();if(!head.backup)return reply({error:'Salva prima i tuoi dati online, poi riprova.'},409);
  await calendarRelay(env,user,'POST',{enable:true,events:calendarProjection(JSON.parse(head.backup).data),revision:head.revision,updatedAt:head.updatedAt});
 }
 const state=await calendarRelay(env,user);
 const link=state.enabled&&/^[a-f0-9]{64}$/.test(state.token)?new URL('/calendar/'+state.token+'.ics',env.CALENDAR_RELAY_URL).href:null;
 return reply({configured:true,enabled:state.enabled,url:link,updatedAt:state.updatedAt});
}
