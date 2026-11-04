import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { api } from '../worker/index.js';
import { archiveApi, ARCHIVE_LIMIT_BYTES } from '../worker/archive.js';
import { seed } from '../src/app/core/seed';
import { exportBackup } from '../src/app/services/backup';

const origin='https://gymtrack.test',owner='giacomotanduo004@gmail.com';
let sql:DatabaseSync,env:any,objects:Map<string,string>,backup:string;
function request(scope='device',body?:string,options:{visitor?:string;cookie?:string;method?:string;origin?:string;headers?:Record<string,string>;query?:string}={}){
 return new Request(origin+'/api/archive?scope='+scope+(options.query||''),{
  method:options.method||(body===undefined?'GET':'POST'),
  headers:{'oai-authenticated-user-id':options.visitor||'owner-visitor','oai-authenticated-user-email':owner,...(body===undefined?{}:{Origin:options.origin||origin,'Content-Type':'application/json','If-Match':'0'}),...(options.cookie?{Cookie:options.cookie}:{}),...options.headers},body,
 });
}
async function get(scope='device',options:any={}){const response=await api(request(scope,undefined,options),env);return{response,data:await response.json()};}
async function put(body=backup,revision=0,scope='device',options:any={}){const response=await api(request(scope,body,{...options,headers:{'If-Match':String(revision),...options.headers}}),env);return{response,data:await response.json()};}
async function activate(){const response=await api(new Request(origin+'/api/auth/setup',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','oai-authenticated-user-id':'owner-visitor','oai-authenticated-user-email':owner},body:JSON.stringify({password:'owner-password-123'})}),env);expect(response.status).toBe(200);return response.headers.get('set-cookie')!.split(';')[0];}
beforeEach(async()=>{
 sql=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
 let queue=Promise.resolve<unknown>(undefined);objects=new Map();
 env={DB:{prepare:(query:string)=>{let args:any[]=[];const statement={bind:(...values:any[])=>{args=values;return statement;},first:async()=>sql.prepare(query).get(...args),all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}})};return statement;},batch:(statements:any[])=>{const job=queue.then(async()=>{sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}});queue=job.catch(()=>{});return job;}},BUCKET:{put:vi.fn(async(key:string,value:string)=>{objects.set(key,value);}),get:vi.fn(async(key:string)=>objects.has(key)?{text:async()=>objects.get(key)!}:null),delete:vi.fn(async(keys:string|string[])=>{for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);})}};
 backup=await exportBackup(seed());
});
afterEach(()=>{sql.close();vi.restoreAllMocks();});

it('retains a complete archive in server storage across a new Worker environment',async()=>{
 expect((await get()).data).toEqual({revision:0,backup:null,updatedAt:null});
 const saved=await put();expect(saved.response.status).toBe(200);expect(saved.data.revision).toBe(1);
 env={...env,BUCKET:{...env.BUCKET}};
 const loaded=await get();expect(loaded.data.backup).toBe(backup);expect(loaded.data.revision).toBe(1);
 expect(loaded.response.headers.get('Cache-Control')).toContain('no-store');
 expect(sql.prepare('SELECT COUNT(*) AS n FROM archive_heads').get()!.n).toBe(1);
 expect(objects.size).toBe(1);
});
it('accepts older v10 snapshots, validates v11 wellness and retains the last good server copy after invalid input',async()=>{
 const old=JSON.parse(backup);old.schemaVersion=10;delete old.data.wellnessLogs;
 expect((await put(JSON.stringify(old))).response.status).toBe(200);
 const current=JSON.parse(backup);current.data.wellnessLogs=[{id:'wellness-day',date:'2026-11-02',sleepMinutes:465,energy:4,soreness:{'muscle-0':1},notes:''}];current.data.settings[0].themeConfig={palette:'viola-neon',mode:'dark'};
 const good=JSON.stringify(current);expect((await put(good,1)).response.status).toBe(200);
 for(const patch of [{sleepMinutes:1441},{date:'2026-02-30'},{energy:6},{soreness:{x:5}}]){
  const bad=structuredClone(current);Object.assign(bad.data.wellnessLogs[0],patch);expect((await put(JSON.stringify(bad),2)).response.status).toBe(400);
 }
 const missing=structuredClone(current);delete missing.data.wellnessLogs;expect((await put(JSON.stringify(missing),2)).response.status).toBe(400);
 const duplicated=structuredClone(current);duplicated.data.wellnessLogs.push({...duplicated.data.wellnessLogs[0],id:'other-id'});expect((await put(JSON.stringify(duplicated),2)).response.status).toBe(400);
 expect((await get()).data.backup).toBe(good);
});

it('isolates platform visitors, separates device/account archives, and requires a real account session',async()=>{
 await put();expect((await get('device',{visitor:'different-visitor'})).data.backup).toBeNull();
 expect((await put(backup,0,'account')).response.status).toBe(401);
 const cookie=await activate();
 expect((await get('account',{cookie})).data.backup).toBeNull();
 expect((await put(backup,0,'account',{cookie})).response.status).toBe(200);
 expect((await get('account',{cookie})).data.backup).toBe(backup);
 expect((await get('account',{cookie,visitor:'different-visitor'})).response.status).toBe(401);
 expect((await put(backup,0,'invented')).response.status).toBe(400);
 const missing=new Request(origin+'/api/archive');expect((await api(missing,env)).status).toBe(401);
 expect((await put(backup,1,'device',{origin:'https://attacker.test'})).response.status).toBe(403);
});

it('rejects stale and concurrent writes without replacing or deleting the winning snapshot',async()=>{
 const pending:(()=>void)[]=[];
 env.BUCKET.put.mockImplementation(async(key:string,value:string)=>{objects.set(key,value);await new Promise<void>(resolve=>{pending.push(resolve);if(pending.length===2)pending.forEach(done=>done());});});
 const [first,second]=await Promise.all([put(),put(backup.replace('Atleta','Seconda bozza'))]);
 expect([first.response.status,second.response.status].sort()).toEqual([200,409]);
 expect(objects.size).toBe(1);expect((await get()).data.revision).toBe(1);
 const stale=await put(backup,0);expect(stale.response.status).toBe(409);expect(stale.data.revision).toBe(1);
 expect(objects.size).toBe(1);
});

it('keeps the previous archive after object write or database failures and preserves an ambiguously committed head',async()=>{
 await put();
 env.BUCKET.put.mockRejectedValueOnce(new Error('Bucket temporarily unreachable'));
 expect((await put(backup,1)).response.status).toBe(503);expect((await get()).data.revision).toBe(1);
 const batch=env.DB.batch.bind(env.DB);
 vi.spyOn(env.DB,'batch').mockRejectedValueOnce(new Error('D1 request failed'));
 expect((await put(backup,1)).response.status).toBe(503);expect((await get()).data.backup).toBe(backup);
 vi.spyOn(env.DB,'batch').mockImplementationOnce(async(statements:any[])=>{await batch(statements);throw Error('Response lost after commit');});
 expect((await put(backup,1)).response.status).toBe(503);
 const recovered=await get();expect(recovered.data.revision).toBe(2);expect(recovered.data.backup).toBe(backup);
});

it('keeps ten immutable recovery versions and can read a previous version without changing the current head',async()=>{
 for(let revision=0;revision<13;revision++)expect((await put(backup,revision)).response.status).toBe(200);
 const history=await get('device',{query:'&history=1'});
 expect(history.data.revision).toBe(13);expect(history.data.versions.map((version:any)=>version.revision)).toEqual([13,12,11,10,9,8,7,6,5,4]);
 expect(objects.size).toBe(10);
 const previous=await get('device',{query:'&version=4'});expect(previous.data.revision).toBe(4);expect(previous.data.headRevision).toBe(13);expect(previous.data.backup).toBe(backup);
 expect((await get('device',{query:'&version=3'})).response.status).toBe(404);
 expect((await get()).data.revision).toBe(13);
});

it('rejects malformed, partial, oversized and unconditioned snapshots while preserving the current archive',async()=>{
 await put();
 for(const candidate of ['not json',JSON.stringify({app:'GymTrack',schemaVersion:5,exportedAt:new Date().toISOString(),data:{}})])expect((await put(candidate,1)).response.status).toBe(400);
 const duplicate=JSON.parse(backup);duplicate.data.plans=[{id:'same'},{id:'same'}];expect((await put(JSON.stringify(duplicate),1)).response.status).toBe(400);
 const garbage=JSON.parse(backup);garbage.data.profiles=[{id:'local'}];expect((await put(JSON.stringify(garbage),1)).response.status).toBe(400);
 expect((await put(backup,1,'device',{headers:{'Content-Length':String(ARCHIVE_LIMIT_BYTES+1)}})).response.status).toBe(413);
 expect((await put(backup,1,'device',{headers:{'If-Match':''}})).response.status).toBe(428);
 const large=new Request(origin+'/api/archive?scope=device',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','If-Match':'1','oai-authenticated-user-id':'owner-visitor'},body:new ReadableStream({start(controller){controller.enqueue(new Uint8Array(ARCHIVE_LIMIT_BYTES+1));controller.close();}}),duplex:'half'} as RequestInit);
 expect((await api(large,env)).status).toBe(413);
 expect((await get()).data.revision).toBe(1);expect(objects.size).toBe(1);
});

it('accepts quoted revision preconditions and detects missing or corrupted objects without discarding metadata',async()=>{
 expect((await put(backup,0,'device',{headers:{'If-Match':'"0"'}})).response.status).toBe(200);
 const key=[...objects.keys()][0];objects.set(key,'corrupted');
 expect((await get()).response.status).toBe(503);
 objects.delete(key);expect((await get()).response.status).toBe(503);
 expect(sql.prepare('SELECT revision FROM archive_heads').get()!.revision).toBe(1);
});

it('keeps a committed account archive readable when the optional calendar service fails',async()=>{
 const cookie=await activate();const me=sql.prepare('SELECT * FROM users LIMIT 1').get() as any;
 const hook=vi.fn(async()=>{throw Error('calendar offline');});
 const response=await archiveApi(request('account',backup,{cookie}),env,me,hook);
 expect(response.status).toBe(200);expect(hook).toHaveBeenCalledOnce();
 const saved=await get('account',{cookie});expect(saved.response.status).toBe(200);expect(saved.data.backup).toBe(backup);expect(saved.data.revision).toBe(1);
});

it('keeps origin and role checks on calendar activation',async()=>{
 const cookie=await activate();
 const body=JSON.stringify({secret:'a'.repeat(64)});
 const url=origin+'/api/calendar-config';
 const headers={'oai-authenticated-user-id':'owner-visitor','Content-Type':'application/json',Cookie:cookie};
 const foreign=await api(new Request(url,{method:'POST',headers:{...headers,Origin:'https://elsewhere.test'},body}),env);expect(foreign.status).toBe(403);
 sql.prepare("UPDATE users SET role='User'").run();
 const denied=await api(new Request(url,{method:'POST',headers:{...headers,Origin:origin},body}),env);expect(denied.status).toBe(403);
 expect(sql.prepare('SELECT count(*) AS n FROM calendar_service_config').get()?.n).toBe(0);
});

it('retains a full theme in account archives and rejects malformed themes before replacing the head',async()=>{
 const cookie=await activate(),themeConfig={palette:'prugna',mode:'system',background:'#1D1424',accent:'#F0A6A0'};
 const content=JSON.parse(backup);content.data.settings[0].themeConfig=themeConfig;
 const text=JSON.stringify(content);
 expect((await put(text,0,'account',{cookie})).response.status).toBe(200);
 expect(JSON.parse((await get('account',{cookie})).data.backup).data.settings[0].themeConfig).toEqual(themeConfig);
 for(const value of [null,[],{...themeConfig,palette:'other'},{...themeConfig,mode:'auto'},{...themeConfig,accent:'red'},{...themeConfig,background:'url(x)'},{...themeConfig,unknown:true}]){
  content.data.settings[0].themeConfig=value;
  expect((await put(JSON.stringify(content),1,'account',{cookie})).response.status).toBe(400);
 }
 const loaded=await get('account',{cookie});expect(loaded.data.revision).toBe(1);expect(loaded.data.backup).toBe(text);
});

it('retains timed calendar activities and legacy workout snapshots without changing their data',async()=>{
 const content=JSON.parse(backup);
 content.data.scheduledWorkouts=[
  {id:'legacy',date:'2026-10-30',planId:'retired-plan',dayId:'retired-day',planName:'Piano conservato',dayName:'Parte alta',notes:'x'.repeat(10000)},
  {id:'timed-workout',kind:'workout',date:'2026-10-30',planId:'retired-plan',dayId:'retired-day',planName:'Piano conservato',dayName:'Parte alta',notes:'',time:'11:30',durationMinutes:80,estimatedCalories:450},
  {id:'cardio',kind:'cardio',date:'2026-10-30',planId:'',dayId:'',planName:'',dayName:'Cardio HIIT',notes:'Tapis roulant',time:'07:00',durationMinutes:20,estimatedCalories:180,done:true},
  {id:'mobility',kind:'mobility',date:'2026-10-30',planId:'',dayId:'',planName:'',dayName:'Mobilità',notes:'',time:'19:00',durationMinutes:10,done:false},
  {id:'rest',kind:'rest',date:'2026-10-30',planId:'',dayId:'',planName:'',dayName:'Riposo',notes:'Recupero attivo'},
  {id:'other',kind:'other',date:'2026-10-30',planId:'',dayId:'',planName:'',dayName:'Appuntamento',notes:'',time:'23:59',estimatedCalories:0,done:false},
 ];
 const text=JSON.stringify(content);
 expect((await put(text)).response.status).toBe(200);
 const loaded=await get();expect(loaded.data.backup).toBe(text);expect(JSON.parse(loaded.data.backup).data.scheduledWorkouts).toEqual(content.data.scheduledWorkouts);
});

it('rejects invalid calendar activity metadata atomically while retaining the saved archive',async()=>{
 expect((await put()).response.status).toBe(200);
 const base={id:'activity',kind:'cardio',date:'2026-10-30',planId:'',dayId:'',planName:'',dayName:'Cardio',notes:'',time:'11:30',durationMinutes:20,estimatedCalories:150,done:false};
 for(const patch of [
  {id:' '},{kind:'unknown'},{kind:null},{kind:'workout'},{kind:'rest'},
  {date:'2026-02-30'},{date:'30/10/2026'},{time:'24:00'},{time:'7:00'},{time:null},
  {durationMinutes:0},{durationMinutes:1441},{durationMinutes:null},{durationMinutes:'20'},
  {estimatedCalories:-1},{estimatedCalories:20001},{estimatedCalories:null},{estimatedCalories:'150'},
  {done:'yes'},{done:null},{workoutId:'historic-workout'},{dayName:''},{notes:'x'.repeat(2001)},{planId:null},{dayId:null},{planName:12},{planId:'other-plan'},{dayId:'other-day'},{planName:'Altro piano'},
 ]){
  const content=JSON.parse(backup);content.data.scheduledWorkouts=[{...base,...patch}];
  expect((await put(JSON.stringify(content),1)).response.status,JSON.stringify(patch)).toBe(400);
 }
 const loaded=await get();expect(loaded.data.revision).toBe(1);expect(loaded.data.backup).toBe(backup);expect(objects.size).toBe(1);
});

it('persists the completed-workout deletion preference and rejects malformed values without replacing the archive',async()=>{
 const data=seed();data.settings[0].allowCompletedWorkoutDeletion=true;const text=await exportBackup(data);
 expect((await put(text)).response.status).toBe(200);
 const loaded=(await get()).data;expect(JSON.parse(loaded.backup).data.settings[0].allowCompletedWorkoutDeletion).toBe(true);
 const invalid=JSON.parse(text);invalid.data.settings[0].allowCompletedWorkoutDeletion='true';
 expect((await put(JSON.stringify(invalid),1)).response.status).toBe(400);expect((await get()).data.backup).toBe(text);
});

it('round-trips weekly reuse defaults and rejects malformed preferences without replacing the saved archive', async () => {
 let revision = 0, saved = '';
 for (const enabled of [true, false]) {
  const data = seed(); data.settings[0].reusePreviousWeek = enabled; saved = await exportBackup(data);
  expect((await put(saved, revision++)).response.status).toBe(200);
  expect(JSON.parse((await get()).data.backup).data.settings[0].reusePreviousWeek).toBe(enabled);
 }
 for (const value of ['false', 0, 1, null, {}, []]) {
  const invalid = JSON.parse(saved); invalid.data.settings[0].reusePreviousWeek = value;
  expect((await put(JSON.stringify(invalid), revision)).response.status).toBe(400);
 }
 expect((await get()).data.backup).toBe(saved); expect((await get()).data.revision).toBe(revision);
});

it('retains every new theme preset and custom colors in account snapshots',async()=>{
 const cookie=await activate();let revision=0;
 for(const palette of ['oro','argento','multicolore','bianco-elegante','scuro','rosso','verde']){
  const content=JSON.parse(backup),themeConfig={palette,mode:'system',background:'#182735',accent:'#D6B76D'};
  content.data.settings[0].themeConfig=themeConfig;
  const text=JSON.stringify(content),saved=await put(text,revision,'account',{cookie});
  expect(saved.response.status).toBe(200);
  revision++;
  const loaded=await get('account',{cookie});
  expect(loaded.data.revision).toBe(revision);
  expect(loaded.data.backup).toBe(text);
  expect(JSON.parse(loaded.data.backup).data.settings[0].themeConfig).toEqual(themeConfig);
 }
});

it('round-trips all approved palette IDs through server backups without changing the workout archive',async()=>{
 const original=JSON.parse(backup);let revision=0;
 for(const palette of ['blu-azzurro','viola-neon','petrolio-lumina','smeraldo-sport','rubino-carbonio','oro-satinato','argento-artico','prugna-rose']){
  const data=structuredClone(original);data.data.settings[0].themeConfig={palette,mode:'dark'};
  expect((await put(JSON.stringify(data),revision++)).response.status).toBe(200);
  const saved=JSON.parse((await get()).data.backup);
  expect(saved.data.settings[0].themeConfig).toEqual({palette,mode:'dark'});
  expect(saved.data.plans).toEqual(original.data.plans);expect(saved.data.sets).toEqual(original.data.sets);expect(saved.data.profiles).toEqual(original.data.profiles);
 }
});
