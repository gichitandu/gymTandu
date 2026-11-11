import {sendEmptyPush,pushPublicKey} from './push.js';
// GT Hub: promemoria a orario preciso e impegni nel calendario abbonato.
// Il push resta senza contenuto: il testo lo chiede l'app installata a GymTrack.
const HUB_ID=/^[A-Za-z0-9_~.:-]{1,200}$/;
function hubRelayReply(body,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store'}});}
function hubRelayFail(message,status=400){throw Object.assign(new Error(message),{status});}
const hubIso=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)&&Number.isFinite(Date.parse(value));
export function validHubEvents(events){
 if(!Array.isArray(events)||events.length>5000)hubRelayFail('Invalid events');
 const ids=new Set();
 return events.map(e=>{
  if(!e||typeof e.id!=='string'||!/^[a-zA-Z0-9_-]{1,150}$/.test(e.id)||ids.has(e.id)||typeof e.title!=='string'||!e.title.trim()||e.title.length>200||typeof e.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||new Date(e.date+'T12:00:00Z').toISOString().slice(0,10)!==e.date)hubRelayFail('Invalid event');
  if((e.start!==undefined||e.end!==undefined)&&(!hubIso(e.start)||!hubIso(e.end)||Date.parse(e.end)<=Date.parse(e.start)))hubRelayFail('Invalid event time');
  ids.add(e.id);return{id:e.id,title:e.title,date:e.date,...(e.start?{start:e.start,end:e.end}:{})};
 });
}
export function validHubReminders(reminders){
 if(!Array.isArray(reminders)||reminders.length>2000)hubRelayFail('Invalid reminders');
 const ids=new Set();
 return reminders.map(r=>{
  if(!r||typeof r.id!=='string'||!HUB_ID.test(r.id)||ids.has(r.id)||!Number.isSafeInteger(r.at)||r.at<0)hubRelayFail('Invalid reminder');
  ids.add(r.id);return{id:r.id,at:r.at};
 });
}
export async function hubFeedEvents(env,key){
 try{const row=await env.DB.prepare('SELECT events FROM hub_feed WHERE account_key=?').bind(key).first();return row?JSON.parse(row.events):[];}catch{return [];}
}
export async function hubRelayApi(request,env,key,route){
 if(route==='/hub/sent'){
  if(request.method!=='GET')return hubRelayReply({error:'Method not allowed'},405);
  // Id inviati negli ultimi 10 minuti: ogni dispositivo mostra solo quelli che non ha già mostrato.
  const now=Date.now(),rows=await env.DB.prepare('SELECT id FROM hub_reminders WHERE account_key=? AND sent_at>=? ORDER BY sent_at DESC LIMIT 10').bind(key,now-600000).all();
  return hubRelayReply({ids:(rows.results||[]).map(r=>r.id)});
 }
 if(request.method!=='POST')return hubRelayReply({error:'Method not allowed'},405);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return hubRelayReply({error:'Invalid content type'},415);
 const reader=request.body?.getReader();if(!reader)hubRelayFail('Missing body');
 let text='',size=0;const decoder=new TextDecoder();
 for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2*1024*1024){await reader.cancel();hubRelayFail('Too large',413);}text+=decoder.decode(part.value,{stream:true});}
 let body;try{body=JSON.parse(text+decoder.decode());}catch{hubRelayFail('Invalid body');}
 const reminders=validHubReminders(body.reminders),events=validHubEvents(body.events),now=Date.now();
 // I promemoria non ancora inviati vengono sostituiti; quelli già inviati restano per non ripeterli.
 await env.DB.prepare('DELETE FROM hub_reminders WHERE account_key=? AND (sent_at IS NULL OR sent_at<?)').bind(key,now-3*86400000).run();
 for(const r of reminders)await env.DB.prepare('INSERT INTO hub_reminders(account_key,id,due_at) VALUES(?,?,?) ON CONFLICT(account_key,id) DO UPDATE SET due_at=excluded.due_at WHERE hub_reminders.sent_at IS NULL').bind(key,r.id,r.at).run();
 await env.DB.prepare('INSERT INTO hub_feed(account_key,events) VALUES(?,?) ON CONFLICT(account_key) DO UPDATE SET events=excluded.events').bind(key,JSON.stringify(events)).run();
 return hubRelayReply({ok:true,reminders:reminders.length,events:events.length});
}
export async function dispatchHubReminders(env,now=Date.now()){
 if(!pushPublicKey(env)||env.PUSH_SCHEDULER_ENABLED!=='true')return;
 // Promemoria scaduti da oltre 6 ore (servizio fermo) non vengono più inviati.
 await env.DB.prepare('UPDATE hub_reminders SET sent_at=?,acked=1 WHERE sent_at IS NULL AND due_at<?').bind(now,now-6*3600000).run();
 const rows=await env.DB.prepare('SELECT account_key,id FROM hub_reminders WHERE sent_at IS NULL AND due_at<=? ORDER BY due_at LIMIT 20').bind(now).all();
 for(const row of rows.results||[]){
  const claimed=await env.DB.prepare('UPDATE hub_reminders SET sent_at=? WHERE account_key=? AND id=? AND sent_at IS NULL').bind(now,row.account_key,row.id).run();
  if(!claimed.meta?.changes)continue;
  const devices=await env.DB.prepare('SELECT id,endpoint FROM push_devices WHERE account_key=?').bind(row.account_key).all();
  for(const device of devices.results||[]){
   let status;try{status=await sendEmptyPush(env,device.endpoint,'hub-'+row.id,now);}catch{status=503;}
   if(status===404||status===410)await env.DB.prepare('DELETE FROM push_devices WHERE id=?').bind(device.id).run();
  }
 }
}
function hubCalEscape(text){return text.replaceAll('\\','\\\\').replaceAll('\r\n','\n').replaceAll('\r','\n').replaceAll('\n','\\n').replaceAll(';','\\;').replaceAll(',','\\,');}
export function hubCalendarLines(events,stamp,feedId){
 const lines=[];
 for(const e of events){
  lines.push('BEGIN:VEVENT',`UID:${e.id}.${feedId}@gymtrack-hub`,`DTSTAMP:${stamp}`);
  if(e.start){const f=v=>v.replace(/[-:]/g,'').replace(/\.\d{3}/,'');lines.push(`DTSTART:${f(e.start)}`,`DTEND:${f(e.end)}`);}
  else{const end=new Date(e.date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);lines.push(`DTSTART;VALUE=DATE:${e.date.replaceAll('-','')}`,`DTEND;VALUE=DATE:${end.toISOString().slice(0,10).replaceAll('-','')}`);}
  lines.push(`SUMMARY:${hubCalEscape(e.title)}`,'END:VEVENT');
 }
 return lines;
}
