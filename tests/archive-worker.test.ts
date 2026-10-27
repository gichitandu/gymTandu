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
