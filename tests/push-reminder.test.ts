import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import relay from '../calendar-relay/index.js';
import {pushPreferences,nextPushTime,pushLocalDay,validatePushEndpoint,vapidAuthorization,dispatchPushReminders} from '../calendar-relay/push.js';
import {updatePushService} from '../calendar-relay/update-push-windows.mjs';
import {pushReminderApi} from '../worker/push.js';
let sql:DatabaseSync,env:any,jwk:JsonWebKey;
const key='a'.repeat(64),other='b'.repeat(64),endpoint='https://web.push.apple.com/synthetic-subscription',secret='s'.repeat(64);
function request(body?:any,account=key,method=body?'POST':'GET',device=''){
 return new Request('https://relay.test/manage/'+account+'/push'+(device?'?device='+device:''),{method,headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
}
const json=async(r:Response)=>r.json() as Promise<any>;
async function subscribe(account=key,date='2026-10-28',extra:any={}){return json(await relay.fetch(request({operation:'subscribe',endpoint:account===key?endpoint:endpoint+'-other',events:[{date}],revision:1,time:'08:30',timezone:'Europe/Rome',everyDay:false,...extra},account),env));}
beforeEach(async()=>{
 sql=new DatabaseSync(':memory:');sql.exec(readFileSync('calendar-relay/schema.sql','utf8'));
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);jwk=await crypto.subtle.exportKey('jwk',pair.privateKey);
 env={CALENDAR_RELAY_SECRET:secret,PUSH_VAPID_PRIVATE_JWK:JSON.stringify(jwk),PUSH_VAPID_SUBJECT:'mailto:test@example.test',PUSH_SCHEDULER_ENABLED:'true',DB:{prepare:(query:string)=>{let args:any[]=[];const statement={bind(...a:any[]){args=a;return statement;},first:async()=>sql.prepare(query).get(...args),all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}})};return statement;}}};
});
afterEach(()=>{sql.close();vi.restoreAllMocks();vi.useRealTimers();});
it('defaults to 08:30 Italy and resolves winter/summer time and DST gaps',()=>{
 expect(pushPreferences()).toEqual({time:'08:30',timezone:'Europe/Rome',everyDay:false});
 expect(new Date(nextPushTime(Date.parse('2026-01-01T00:00:00Z'),'08:30','Europe/Rome').at).toISOString()).toBe('2026-01-01T07:30:00.000Z');
 expect(new Date(nextPushTime(Date.parse('2026-07-01T00:00:00Z'),'08:30','Europe/Rome').at).toISOString()).toBe('2026-07-01T06:30:00.000Z');
 const spring=nextPushTime(Date.parse('2026-03-29T00:00:00Z'),'02:30','Europe/Rome');expect(new Date(spring.at).toISOString()).toBe('2026-03-29T01:30:00.000Z');
 const next=nextPushTime(Date.parse('2026-10-25T00:45:00Z'),'02:30','Europe/Rome','2026-10-25');expect(next.day).toBe('2026-10-26');
});
it('validates time zones and restricts destinations to actual push services',()=>{
 for(const value of ['http://web.push.apple.com/a','https://127.0.0.1/a','https://web.push.apple.com.evil.test/a','https://u:p@web.push.apple.com/a'])expect(()=>validatePushEndpoint(value)).toThrow();
 expect(validatePushEndpoint(endpoint)).toBe(endpoint);expect(()=>pushPreferences({time:'25:00'})).toThrow();expect(()=>pushPreferences({timezone:'not/a/zone'})).toThrow();
});
it('signs a valid ES256 VAPID token with endpoint audience and an expiry under 24 hours',async()=>{
 const now=Date.parse('2026-10-27T07:00:00Z'),authorization=await vapidAuthorization(endpoint,jwk,'mailto:test@example.test',now);
 const token=authorization.split('t=')[1].split(',')[0],parts=token.split('.'),decode=(s:string)=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
 const claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));expect(claims.aud).toBe('https://web.push.apple.com');expect(claims.exp).toBe(Math.floor(now/1000)+43200);
 const pub=await crypto.subtle.importKey('jwk',{kty:jwk.kty,crv:jwk.crv,x:jwk.x,y:jwk.y,ext:true},{name:'ECDSA',namedCurve:'P-256'},true,['verify']);
 expect(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pub,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]))).toBe(true);
});
it('requires management authorization and keeps device settings scoped to each account',async()=>{
 const unauth=new Request('https://relay.test/manage/'+key+'/push');expect((await relay.fetch(unauth,env)).status).toBe(401);
 const a=await subscribe(),b=await subscribe(other);expect(a.id).not.toBe(b.id);
 expect((await json(await relay.fetch(request(undefined,other,'GET',a.id),env))).deviceEnabled).toBe(false);
 await relay.fetch(request({id:a.id},other,'DELETE'),env);expect(sql.prepare('SELECT count(*) AS n FROM push_devices').get()?.n).toBe(2);
 await relay.fetch(request({id:a.id},key,'DELETE'),env);expect(sql.prepare('SELECT count(*) AS n FROM push_devices').get()?.n).toBe(1);
});
it('sends once per device/day, without a message payload or following redirects',async()=>{
 const saved=await subscribe();const now=Date.parse('2026-10-28T07:30:00Z');sql.prepare('UPDATE push_devices SET next_due=?,due_day=?').run(now,'2026-10-28');
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(null,{status:201}));
 await dispatchPushReminders(env,now);await dispatchPushReminders(env,now+1000);
 expect(fetch).toHaveBeenCalledOnce();const options=fetch.mock.calls[0][1]!;expect(options.redirect).toBe('manual');expect(options.body).toBeUndefined();expect((options.headers as any).Authorization).toMatch(/^vapid t=/);
 expect(sql.prepare('SELECT last_sent_day FROM push_devices WHERE id=?').get(saved.id)?.last_sent_day).toBe('2026-10-28');
});
it('skips rest days by default and allows the explicit every-day preference',async()=>{
 await subscribe(key,'2026-10-29');const now=Date.parse('2026-10-28T07:30:00Z');sql.prepare('UPDATE push_devices SET next_due=?,due_day=?').run(now,'2026-10-28');const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(null,{status:201}));
 await dispatchPushReminders(env,now);expect(fetch).not.toHaveBeenCalled();
 sql.prepare('UPDATE push_accounts SET every_day=1').run();sql.prepare('UPDATE push_devices SET next_due=?,due_day=?').run(now,'2026-10-28');await dispatchPushReminders(env,now);expect(fetch).toHaveBeenCalledOnce();
});
it('removes expired subscriptions and retries a temporary failure only a bounded number of times',async()=>{
 await subscribe();const now=Date.parse('2026-10-28T07:30:00Z');sql.prepare('UPDATE push_devices SET next_due=?,due_day=?').run(now,'2026-10-28');const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(null,{status:503}));
 await dispatchPushReminders(env,now);await dispatchPushReminders(env,now+300000);await dispatchPushReminders(env,now+600000);await dispatchPushReminders(env,now+900000);expect(fetch).toHaveBeenCalledTimes(3);
 sql.prepare('UPDATE push_devices SET next_due=?,due_day=?').run(now,'2026-10-28');fetch.mockResolvedValue(new Response(null,{status:410}));await dispatchPushReminders(env,now);expect(sql.prepare('SELECT count(*) AS n FROM push_devices').get()?.n).toBe(0);
});
it('keeps calendar events and tokens unchanged while adding push tables',async()=>{
 sql.prepare('INSERT INTO feeds VALUES(?,?,?,?,?,?,?)').run(key,'token','hash',1,42,1,'[]');sql.exec(readFileSync('calendar-relay/schema.sql','utf8'));expect(sql.prepare('SELECT token,revision FROM feeds').get()).toEqual({token:'token',revision:42});
});
it('upgrades the service without rotating either existing secret',async()=>{
 const calls:any[]=[];await updatePushService({run:async(args:any,options:any)=>{calls.push({args,options});return args[0]==='secret'?JSON.stringify([{name:'CALENDAR_RELAY_SECRET'},{name:'PUSH_VAPID_PRIVATE_JWK'}]):'';},configure:async()=>{},log:()=>{},generate:()=>{throw Error('must not rotate');}});
 expect(calls.some(c=>c.args[0]==='secret'&&c.args[1]==='put')).toBe(false);expect(calls.some(c=>c.args[0]==='deploy')).toBe(true);
});
it('does not leak a private VAPID key through push settings and reports old service versions honestly',async()=>{
 const state=await json(await relay.fetch(request(),env));expect(state.available).toBe(true);expect(JSON.stringify(state)).not.toContain(jwk.d!);
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('not found',{status:404}));
 const main=await pushReminderApi(new Request('https://gymtrack.test/api/push-reminder'),{CALENDAR_RELAY_URL:'https://relay.test',CALENDAR_RELAY_SECRET:secret},{id:'u',role:'User'},()=>{throw Error('no archive needed');});
 expect(await main.json()).toMatchObject({available:false,needsUpdate:true});expect(fetch).toHaveBeenCalledOnce();
});

it('updates only the current account preferences and limits repeated delivery tests',async()=>{
 const a=await subscribe(),b=await subscribe(other);vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(null,{status:201}));
 expect((await relay.fetch(request({operation:'test',id:b.id}),env)).status).toBe(404);
 expect((await relay.fetch(request({operation:'test',id:a.id}),env)).status).toBe(200);expect((await relay.fetch(request({operation:'test',id:a.id}),env)).status).toBe(429);
 await relay.fetch(request({operation:'preferences',time:'09:15',timezone:'Europe/Rome',everyDay:true,events:[],revision:2}),env);
 expect(sql.prepare('SELECT time FROM push_accounts WHERE account_key=?').get(key)?.time).toBe('09:15');expect(sql.prepare('SELECT time FROM push_accounts WHERE account_key=?').get(other)?.time).toBe('08:30');
});
it('generates a VAPID secret only once and never prints the private material',async()=>{
 const calls:any[]=[],logs:string[]=[];
 await updatePushService({run:async(args:any,options:any)=>{calls.push({args,options});return args[0]==='secret'&&args[1]==='list'?JSON.stringify([{name:'CALENDAR_RELAY_SECRET'}]):'';},configure:async()=>{},log:(s:string)=>logs.push(s),generate:()=>jwk});
 const uploads=calls.filter(c=>c.args[0]==='secret'&&c.args[1]==='put');expect(uploads).toHaveLength(1);expect(uploads[0].args[2]).toBe('PUSH_VAPID_PRIVATE_JWK');expect(JSON.parse(uploads[0].options.input).d).toBe(jwk.d);expect(logs.join(' ')).not.toContain(jwk.d!);
});
it('does not alter a different or unconfigured Cloudflare service',async()=>{
 const configure=vi.fn(),run=vi.fn().mockResolvedValue('[]');await expect(updatePushService({run,configure,log:()=>{}})).rejects.toThrow('Chiave calendario non trovata');expect(configure).not.toHaveBeenCalled();expect(run).toHaveBeenCalledOnce();
});

it('does not send duplicate pushes when scheduler invocations overlap',async()=>{
 await subscribe();const now=Date.parse('2026-10-28T07:30:00Z');sql.prepare('UPDATE push_devices SET next_due=?,due_day=?').run(now,'2026-10-28');
 let finish!:(r:Response)=>void;const fetch=vi.spyOn(globalThis,'fetch').mockReturnValue(new Promise(r=>finish=r));
 const first=dispatchPushReminders(env,now),second=dispatchPushReminders(env,now);await vi.waitFor(()=>expect(fetch).toHaveBeenCalledOnce());finish(new Response(null,{status:201}));await Promise.all([first,second]);expect(fetch).toHaveBeenCalledOnce();
});
it('projects only dates from the authenticated server archive, ignoring forged client events',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({ok:true,id:'a'.repeat(64)}));
 const req=new Request('https://gymtrack.test/api/push-reminder',{method:'POST',body:JSON.stringify({operation:'subscribe',endpoint,time:'08:30',timezone:'Europe/Rome',everyDay:false,events:[{date:'2099-01-01',photo:'private'}]})});
 const head=()=>Response.json({revision:3,backup:JSON.stringify({data:{scheduledWorkouts:[{id:'p',date:'2026-10-28',dayName:'private name',notes:'private notes'}],workouts:[]}})});
 const response=await pushReminderApi(req,{CALENDAR_RELAY_URL:'https://relay.test',CALENDAR_RELAY_SECRET:secret},{id:'u',role:'User'},head);expect(response.status).toBe(200);
 const sent=JSON.parse(fetch.mock.calls[0][1]?.body as string);expect(sent.events).toEqual([{date:'2026-10-28'}]);expect(JSON.stringify(sent)).not.toContain('private');expect(sent.revision).toBe(3);
});
