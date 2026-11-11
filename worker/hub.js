import {calendarRuntimeEnv,calendarRelay,calendarConfigured} from './calendar.js';
// GT Hub: archivio separato da GymTrack (R2 hub/<utente>.json), riservato al Super Admin.
// Promemoria e impegni vengono proiettati verso il servizio calendario/notifiche.
export const HUB_LIMIT_BYTES=8*1024*1024;
const HUB_COLLECTIONS=['events','notes','transactions','imports','rules','plans','people','groups','expenses','settlements','prefs','cars','fuelups'];
// Raccolte aggiunte dopo: una copia dell'app non ancora aggiornata non le invia e non deve cancellarle.
const HUB_LATER_COLLECTIONS=['cars','fuelups'];
const HUB_ROW_LIMITS={events:5000,notes:5000,transactions:60000,imports:3000,rules:3000,plans:300,people:500,groups:300,expenses:30000,settlements:30000,prefs:5,cars:20,fuelups:20000};
const HUB_HISTORY_DAYS=3;
function hubReply(data,status=200){return Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
function hubFail(message,status=400){throw Object.assign(new Error(message),{status});}
const hubObjectKey=user=>'hub/'+user.id+'.json';
async function hubBody(request){
 const declared=request.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>HUB_LIMIT_BYTES))hubFail('Il Hub supera il limite di 8 MB.',413);
 const reader=request.body?.getReader();if(!reader)hubFail('Richiesta non valida.');
 const decoder=new TextDecoder('utf-8',{fatal:true}),parts=[];let bytes=0;
 try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>HUB_LIMIT_BYTES){await reader.cancel();hubFail('Il Hub supera il limite di 8 MB.',413);}parts.push(decoder.decode(part.value,{stream:true}));}parts.push(decoder.decode());}
 catch(error){if(error.status)throw error;hubFail('Richiesta non valida.');}
 try{return JSON.parse(parts.join(''));}catch{hubFail('Richiesta non valida.');}
}
export function hubValidate(body){
 if(!body||typeof body!=='object'||Array.isArray(body))hubFail('Richiesta non valida.');
 if(!Number.isSafeInteger(body.baseRevision)||body.baseRevision<0)hubFail('Revisione non valida.',428);
 const data=body.data;
 if(!data||typeof data!=='object'||Array.isArray(data))hubFail('Copia del Hub non valida.');
 const out={version:1};
 for(const name of HUB_COLLECTIONS){
  const rows=data[name]===undefined?[]:data[name];
  if(!Array.isArray(rows)||rows.length>HUB_ROW_LIMITS[name])hubFail('Copia del Hub non valida.');
  const ids=new Set();
  for(const row of rows){
   if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!row.id||row.id.length>150||ids.has(row.id)||!Number.isFinite(row.updatedAt))hubFail('La copia contiene record non validi.');
   ids.add(row.id);
  }
  out[name]=rows;
 }
 return out;
}
export async function hubRead(env,user){
 const object=await env.BUCKET.get(hubObjectKey(user));
 if(!object)return{revision:0,updatedAt:null,data:null};
 return{revision:Number(object.customMetadata?.revision||0),updatedAt:Number(object.customMetadata?.updatedAt||0)||null,data:JSON.parse(await object.text())};
}
// Una copia al giorno della versione precedente, conservata per 3 giorni.
async function hubKeepHistory(env,user,head,now){
 const previous=Number(head.customMetadata?.updatedAt||0),day=new Date(now).toISOString().slice(0,10);
 if(!previous||new Date(previous).toISOString().slice(0,10)===day)return;
 const old=await env.BUCKET.get(hubObjectKey(user));if(!old)return;
 const prefix='hub-history/'+user.id+'/';
 await env.BUCKET.put(prefix+new Date(previous).toISOString().slice(0,10)+'.json',await old.text(),{httpMetadata:{contentType:'application/json'}});
 const list=await env.BUCKET.list({prefix,limit:100});
 const stale=(list.objects||[]).map(o=>o.key).sort().reverse().slice(HUB_HISTORY_DAYS);
 for(const key of stale)await env.BUCKET.delete(key);
}
export async function hubApi(request,env,user,ctx){
 try{
  if(!user)hubFail('Accedi al tuo account.',401);
  if(user.role!=='SuperAdmin')hubFail('GT Hub è riservato al Super Admin.',403);
  if(!env.BUCKET)hubFail('Archivio server non configurato.',503);
  const path=new URL(request.url).pathname;
  if(path==='/api/hub/due'){if(request.method!=='GET')hubFail('Metodo non supportato.',405);return hubReply(await hubDue(env,user));}
  if(path!=='/api/hub')hubFail('Operazione non trovata.',404);
  if(request.method==='GET')return hubReply(await hubRead(env,user));
  if(request.method!=='PUT')hubFail('Metodo non supportato.',405);
  const body=await hubBody(request),data=hubValidate(body),key=hubObjectKey(user);
  const head=await env.BUCKET.head(key),current=head?Number(head.customMetadata?.revision||0):0;
  if(body.baseRevision!==current)return hubReply({error:'Il Hub è cambiato su un altro dispositivo. Unisco le modifiche e riprovo.',revision:current},409);
  const absent=HUB_LATER_COLLECTIONS.filter(name=>body.data[name]===undefined);
  if(head&&absent.length){const kept=(await hubRead(env,user)).data||{};for(const name of absent)if(Array.isArray(kept[name]))data[name]=kept[name];}
  const now=Date.now(),revision=current+1;
  if(head)await hubKeepHistory(env,user,head,now).catch(()=>{});
  const saved=await env.BUCKET.put(key,JSON.stringify(data),{httpMetadata:{contentType:'application/json'},customMetadata:{revision:String(revision),updatedAt:String(now)},...(head?{onlyIf:{etagMatches:head.etag}}:{})});
  if(!saved)return hubReply({error:'Il Hub è cambiato su un altro dispositivo. Unisco le modifiche e riprovo.',revision:current},409);
  const publish=hubPublish(env,user,data,now).catch(()=>{});
  if(ctx?.waitUntil)ctx.waitUntil(publish);else await publish;
  return hubReply({revision,updatedAt:now});
 }catch(error){return hubReply({error:error.status?error.message:'Servizio non disponibile. Riprova.'},error.status||503);}
}

/* ---------------------------------------------------------------- date e fusi orari */
const hubFormatters=new Map();
function hubParts(at,tz){
 let f=hubFormatters.get(tz);
 if(!f){f=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});hubFormatters.set(tz,f);}
 return Object.fromEntries(f.formatToParts(at).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
export function hubLocalDay(at,tz){const p=hubParts(at,tz);return p.year+'-'+p.month+'-'+p.day;}
/** Ora locale (fuso dell'utente) → istante UTC, con ora legale. */
export function hubZonedUtc(day,time,tz){
 const [y,m,d]=day.split('-').map(Number),[h,mi]=time.split(':').map(Number),wall=Date.UTC(y,m-1,d,h,mi);
 let at=wall;
 for(let i=0;i<2;i++){const p=hubParts(at,tz),seen=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);at+=wall-seen;}
 return at;
}
function hubAddDays(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function hubDim(y,m){return new Date(Date.UTC(y,m,0)).getUTCDate();}
export function hubOccurrences(e,from,to){
 if(typeof e.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||e.date>to)return[];
 if(!e.repeat||e.repeat==='none')return e.date>=from?[e.date]:[];
 const out=[],[y0,m0,d0]=e.date.split('-').map(Number);
 for(let k=0;k<2000&&out.length<400;k++){
  let day;
  if(e.repeat==='weekly')day=hubAddDays(e.date,7*k);
  else{const months=e.repeat==='monthly'?k:12*k,y=y0+Math.floor((m0-1+months)/12),m=(m0-1+months)%12+1;day=`${y}-${String(m).padStart(2,'0')}-${String(Math.min(d0,hubDim(y,m))).padStart(2,'0')}`;}
  if(day>to)break;if(day>=from)out.push(day);
 }
 return out;
}
function hubTz(data){const tz=(data.prefs||[]).find(p=>!p.deleted)?.timezone;try{if(typeof tz==='string'&&tz.length<=80){new Intl.DateTimeFormat('en',{timeZone:tz}).format(0);return tz;}}catch{}return 'Europe/Rome';}
const hubValidTime=t=>typeof t==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t);

/** Promemoria degli impegni (con anticipi) e avvisi di budget all'80%. */
export function hubReminders(data,now=Date.now()){
 const tz=hubTz(data),today=hubLocalDay(now,tz),to=hubAddDays(today,60),out=[];
 for(const e of data.events||[]){
  if(e.deleted||!e.notify||!Array.isArray(e.notifyOffsets)||!e.notifyOffsets.length||(e.done&&e.repeat==='none'))continue;
  for(const day of hubOccurrences(e,hubAddDays(today,-1),to)){
   const start=hubZonedUtc(day,hubValidTime(e.time)?e.time:'09:00',tz);
   for(const offset of e.notifyOffsets.slice(0,5)){
    if(!Number.isInteger(offset)||offset<0||offset>20160)continue;
    const at=start-offset*60000;
    if(at>now-300000&&out.length<1500)out.push({id:`ev~${e.id}~${day}~${offset}`,at});
   }
  }
 }
 const prefs=(data.prefs||[]).find(p=>!p.deleted);
 for(const a of Array.isArray(prefs?.budgetAlerts)?prefs.budgetAlerts.slice(0,20):[]){
  if(typeof a?.category==='string'&&/^[a-z]{1,30}$/.test(a.category)&&typeof a.month==='string'&&/^\d{4}-\d{2}$/.test(a.month)&&a.month===today.slice(0,7))out.push({id:`budget~${a.category}~${a.month}`,at:now});
 }
 return out;
}
/** Impegni da mostrare nel calendario dell'iPhone (feed .ics già abbonato). */
export function hubCalendarEvents(data,now=Date.now()){
 const tz=hubTz(data),today=hubLocalDay(now,tz),out=[];
 for(const e of data.events||[]){
  if(e.deleted||!e.showInCalendar||typeof e.title!=='string'||!e.title.trim())continue;
  for(const day of hubOccurrences(e,hubAddDays(today,-30),hubAddDays(today,365))){
   if(out.length>=1500)break;
   const title=(e.kind==='scadenza'?'Scadenza: ':'')+e.title.trim().slice(0,180),id=('hub-'+e.id+'-'+day.replaceAll('-','')).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,150);
   if(hubValidTime(e.time)){const start=hubZonedUtc(day,e.time,tz),minutes=Number.isInteger(e.durationMinutes)&&e.durationMinutes>0&&e.durationMinutes<=1440?e.durationMinutes:60;out.push({id,title,date:day,start:new Date(start).toISOString(),end:new Date(start+minutes*60000).toISOString()});}
   else out.push({id,title,date:day});
  }
 }
 return out;
}
export async function hubPublish(env,user,data,now=Date.now()){
 env=await calendarRuntimeEnv(env);
 if(!calendarConfigured(env))return;
 await calendarRelay(env,user,'POST',{reminders:hubReminders(data,now),events:hubCalendarEvents(data,now)},'/hub');
}

const HUB_MONTHS=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
function hubWhen(day,time,offset,tz,now){
 const today=hubLocalDay(now,tz),tomorrow=hubAddDays(today,1),at=time?' alle '+time:'';
 const date=day===today?'Oggi':day===tomorrow?'Domani':`Il ${Number(day.slice(8,10))} ${HUB_MONTHS[Number(day.slice(5,7))-1]}`;
 if(offset===0)return time?'Adesso · '+time:date;
 if(offset<60&&day===today)return `Tra ${offset} minuti${at}`;
 if(offset<1440&&day===today)return `Tra ${offset/60} ${offset===60?'ora':'ore'}${at}`;
 return date+at;
}
const hubEuro=c=>(Math.abs(c)/100).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});
/** Il service worker chiede qui il testo dei promemoria appena inviati (il push non ha contenuto). */
export async function hubDue(env,user,now=Date.now()){
 env=await calendarRuntimeEnv(env);
 if(!calendarConfigured(env))return{items:[]};
 let ids=[];
 try{const sent=await calendarRelay(env,user,'GET',undefined,'/hub/sent');ids=Array.isArray(sent.ids)?sent.ids.slice(0,10):[];}catch{return{items:[]};}
 if(!ids.length)return{items:[]};
 const stored=await hubRead(env,user),data=stored.data||{},tz=hubTz(data),items=[];
 const prefs=(data.prefs||[]).find(p=>!p.deleted);
 for(const id of ids){
  const parts=String(id).split('~');
  if(parts[0]==='ev'){
   const e=(data.events||[]).find(x=>x.id===parts[1]&&!x.deleted);if(!e)continue;
   const offset=Number(parts[3])||0;
   items.push({id,title:String(e.title).slice(0,120),body:hubWhen(parts[2],hubValidTime(e.time)?e.time:'',offset,tz,now),url:'/hub/calendario?giorno='+parts[2]});
  }else if(parts[0]==='budget'){
   const a=(Array.isArray(prefs?.budgetAlerts)?prefs.budgetAlerts:[]).find(x=>x.category===parts[1]&&x.month===parts[2]);if(!a)continue;
   items.push({id,title:`Budget ${String(a.label||a.category).slice(0,40)} all'${Math.round(a.pct)}%`,body:`${hubEuro(a.spent)} € su ${hubEuro(a.cap)} € di ${HUB_MONTHS[Number(parts[2].slice(5,7))-1]}.`,url:'/hub/spese?vista=piano'});
  }
 }
 return{items};
}
