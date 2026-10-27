// The relay URL is configured by hosting; users cannot redirect the shared secret.
async function calendarRuntimeEnv(env){
 if(calendarConfigured(env)||!env.CALENDAR_RELAY_URL||!env.DB)return env;
 const row=await env.DB.prepare('SELECT secret FROM calendar_service_config WHERE id=?').bind('current').first();
 return row?{...env,CALENDAR_RELAY_SECRET:row.secret}:env;
}
export async function calendarConfigure(request,env,user){
 const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
 if(!user||user.role!=='SuperAdmin')return reply({error:'Solo i Super Admin possono attivare il servizio.'},403);
 if(request.method!=='POST')return reply({error:'Metodo non supportato.'},405);
 if(!env.CALENDAR_RELAY_URL)return reply({error:'Indirizzo del servizio non ancora configurato.'},503);
 const current=await calendarRuntimeEnv(env);
 if(calendarConfigured(current))return reply({error:'Il servizio è già configurato. La chiave esistente è stata mantenuta.'},409);
 // The installer generates exactly 32 random bytes encoded as hex.
 const reader=request.body?.getReader();if(!reader)return reply({error:'Chiave mancante.'},400);
 const decoder=new TextDecoder();let body='',bytes=0;
 for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>1024){await reader.cancel();return reply({error:'Richiesta troppo grande.'},413);}body+=decoder.decode(part.value,{stream:true});}
 body+=decoder.decode();let secret;try{secret=JSON.parse(body).secret;}catch{return reply({error:'Richiesta non valida.'},400);}
 if(typeof secret!=='string'||!/^[a-f0-9]{64}$/i.test(secret.trim()))return reply({error:'Incolla la chiave tecnica generata dalla procedura Windows.'},400);
 const candidate={...env,CALENDAR_RELAY_SECRET:secret.trim()};
 if(!calendarConfigured(candidate))return reply({error:'Indirizzo del servizio non valido.'},503);
 try{await calendarRelay(candidate,user);}catch{return reply({error:'Verifica non riuscita. Controlla la chiave e che la procedura Windows sia terminata.'},400);}
 const result=await env.DB.prepare('INSERT INTO calendar_service_config(id,secret,configured_by,configured_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').bind('current',candidate.CALENDAR_RELAY_SECRET,user.id,Date.now()).run();
 if(!result.meta?.changes)return reply({error:'Servizio già configurato da un altro accesso. Riapri questa sezione.'},409);
 return reply({configured:true});
}
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
 if(!user)return;env=await calendarRuntimeEnv(env);
 if(!calendarConfigured(env))return;
 const state=await calendarRelay(env,user);if(!state.enabled)return;
 await calendarRelay(env,user,'POST',{events:calendarProjection(JSON.parse(text).data),revision,updatedAt});
}
export async function calendarApi(request,env,user,readArchive){
 const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
 if(!user)return reply({error:'Accedi al tuo account per collegare il calendario.'},401);
 env=await calendarRuntimeEnv(env);
 if(!calendarConfigured(env))return reply({configured:false,enabled:false,canConfigure:user.role==='SuperAdmin'&&!!env.CALENDAR_RELAY_URL});
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
