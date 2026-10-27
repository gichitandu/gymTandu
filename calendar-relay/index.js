import {pushApi,pushNeedsEvents,updatePushEvents,dispatchPushReminders} from './push.js';
// Separate public Worker. No GymTrack account cookies or platform credentials.
const calEncoder=new TextEncoder();
export async function tokenHash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',calEncoder.encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function calReply(body,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});}
function calEqual(a,b){let different=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)different|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return different===0;}
export function validEvents(events){
 if(!Array.isArray(events)||events.length>10000)throw Error('Invalid events');
 const ids=new Set();
 return events.map(e=>{
  if(!e||typeof e.id!=='string'||!/^[a-zA-Z0-9_-]{1,150}$/.test(e.id)||ids.has(e.id)||typeof e.title!=='string'||!e.title.trim()||e.title.length>200||typeof e.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||e.date<'1900-01-01'||e.date>'9998-12-31'||new Date(e.date+'T12:00:00Z').toISOString().slice(0,10)!==e.date)throw Error('Invalid event');
  ids.add(e.id);return{id:e.id,title:e.title,date:e.date};
 });
}
function calEscape(text){return text.replaceAll('\\','\\\\').replaceAll('\r\n','\n').replaceAll('\r','\n').replaceAll('\n','\\n').replaceAll(';','\\;').replaceAll(',','\\,');}
function calFold(text){let out='',line='',bytes=0;for(const char of text){const length=calEncoder.encode(char).length;if(bytes+length>75){out+=line+'\r\n';line=' ';bytes=1;}line+=char;bytes+=length;}return out+line;}
export function renderCalendar(events,revision,updatedAt,feedId){
 const stamp=new Date(updatedAt).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//GymTrack//Calendario//IT','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:GymTrack','REFRESH-INTERVAL;VALUE=DURATION:PT1H','X-PUBLISHED-TTL:PT1H'];
 for(const e of validEvents(events)){
  const end=new Date(e.date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);
  lines.push('BEGIN:VEVENT',`UID:${e.id}.${feedId}@gymtrack`, `DTSTAMP:${stamp}`,`LAST-MODIFIED:${stamp}`,`SEQUENCE:${revision}`,`DTSTART;VALUE=DATE:${e.date.replaceAll('-','')}`,`DTEND;VALUE=DATE:${end.toISOString().slice(0,10).replaceAll('-','')}`,`SUMMARY:${calEscape(e.title)}`,'TRANSP:TRANSPARENT','END:VEVENT');
 }
 lines.push('END:VCALENDAR');return lines.map(calFold).join('\r\n')+'\r\n';
}
export default {async fetch(request,env){
 try{
  const path=new URL(request.url).pathname;
  const feed=/^\/calendar\/([a-f0-9]{64})\.ics$/.exec(path);
  if(feed&&['GET','HEAD'].includes(request.method)){
   const row=await env.DB.prepare('SELECT * FROM feeds WHERE token_hash=? AND enabled=1').bind(await tokenHash(feed[1])).first();
   if(!row)return calReply({error:'Calendar unavailable'},404);
   return new Response(request.method==='HEAD'?null:renderCalendar(JSON.parse(row.events),row.revision,row.updated_at,row.account_key),{headers:{'Content-Type':'text/calendar; charset=utf-8','Cache-Control':'private, no-store','Content-Disposition':'inline; filename="gymtrack.ics"','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}});
  }
  const manage=/^\/manage\/([a-f0-9]{64})(\/push)?$/.exec(path);
  if(!manage)return calReply({error:'Not found'},404);
  const secret=env.CALENDAR_RELAY_SECRET;
  if(!secret||secret.length<32||!calEqual(request.headers.get('Authorization')||'','Bearer '+secret))return calReply({error:'Unauthorized'},401);
  const key=manage[1];
  if(manage[2])return await pushApi(request,env,key);
  if(request.method==='GET'){
   const row=await env.DB.prepare('SELECT token,enabled,revision,updated_at FROM feeds WHERE account_key=?').bind(key).first();
   return calReply({enabled:!!row?.enabled,token:row?.enabled?row.token:null,revision:row?.revision||0,updatedAt:row?.updated_at||null,needsEvents:await pushNeedsEvents(env,key)});
  }
  if(request.method==='DELETE'){
   await env.DB.prepare("UPDATE feeds SET enabled=0,token=NULL,token_hash=NULL,events='[]' WHERE account_key=?").bind(key).run();
   return calReply({enabled:false});
  }
  if(request.method!=='POST')return calReply({error:'Method not allowed'},405);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return calReply({error:'Invalid content type'},415);
  // Bound the actual body, not just Content-Length (streamed requests too).
  const reader=request.body?.getReader();if(!reader)return calReply({error:'Missing body'},400);
  const chunks=[];let size=0;for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>4*1024*1024){await reader.cancel();return calReply({error:'Too large'},413);}chunks.push(item.value);}
  const joined=new Uint8Array(size);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}
  const body=JSON.parse(new TextDecoder().decode(joined)),events=validEvents(body.events);
  if(!Number.isSafeInteger(body.revision)||body.revision<0||!Number.isSafeInteger(body.updatedAt)||body.updatedAt<0||body.updatedAt>8640000000000000)return calReply({error:'Invalid revision'},400);
  if(body.enable===true){
   const token=[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');
   // Repeated enable calls preserve the current subscription. Re-enable rotates it.
   await env.DB.prepare(`INSERT INTO feeds(account_key,token,token_hash,enabled,revision,updated_at,events) VALUES(?,?,?,1,?,?,?) ON CONFLICT(account_key) DO UPDATE SET token=CASE WHEN feeds.enabled=1 THEN feeds.token ELSE excluded.token END,token_hash=CASE WHEN feeds.enabled=1 THEN feeds.token_hash ELSE excluded.token_hash END,enabled=1,revision=CASE WHEN feeds.enabled=0 OR excluded.revision>=feeds.revision THEN excluded.revision ELSE feeds.revision END,updated_at=CASE WHEN feeds.enabled=0 OR excluded.revision>=feeds.revision THEN excluded.updated_at ELSE feeds.updated_at END,events=CASE WHEN feeds.enabled=0 OR excluded.revision>=feeds.revision THEN excluded.events ELSE feeds.events END`).bind(key,token,await tokenHash(token),body.revision,body.updatedAt,JSON.stringify(events)).run();
  }else{
   // Ordinary archive saves never enable/re-enable a subscription.
   await env.DB.prepare('UPDATE feeds SET events=?,revision=?,updated_at=? WHERE account_key=? AND enabled=1 AND revision<=?').bind(JSON.stringify(events),body.revision,body.updatedAt,key,body.revision).run();
  }
  await updatePushEvents(env,key,events,body.revision);
  return calReply({ok:true});
 }catch(error){return calReply({error:error.status?error.message:'Calendar request failed'},error.status||400);}
},async scheduled(_event,env,ctx){ctx.waitUntil(dispatchPushReminders(env));}};
