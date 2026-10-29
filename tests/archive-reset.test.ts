import '@angular/compiler';
import 'fake-indexeddb/auto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import Dexie from 'dexie';
import {createEnvironmentInjector,EnvironmentInjector,signal} from '@angular/core';
import {archiveApi} from '../worker/archive.js';
import {ArchiveSyncService,archiveFingerprint} from '../src/app/services/archive-sync';
import {AuthService} from '../src/app/services/auth';
import {FormDraftService} from '../src/app/services/form-drafts';
import {exportBackup,importBackup} from '../src/app/services/backup';
import {seed} from '../src/app/core/seed';
import {DataSet} from '../src/app/models/domain';

const origin='https://gymtrack.test';const injectors:EnvironmentInjector[]=[];
afterEach(()=>{for(const injector of injectors.splice(0))injector.destroy();vi.unstubAllGlobals();vi.restoreAllMocks();});
function plans(name:string){const data=seed(),at='2026-10-01T12:00:00.000Z';data.plans.push({id:'p',userId:'local',name,description:'',createdAt:at,updatedAt:at,active:true,archived:false});return data;}
function browser(){const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});vi.stubGlobal('navigator',{onLine:true});vi.stubGlobal('window',new EventTarget());vi.stubGlobal('document',Object.assign(new EventTarget(),{visibilityState:'visible'}));const reload=vi.fn();vi.stubGlobal('location',{reload});return{storage,reload};}
async function syncFixture(remote:DataSet){
 const b=browser(),user=signal({id:'tandu',owner:false}),head={revision:2,backup:await exportBackup(remote),updatedAt:Date.now()},posts:string[]=[],drafts={discardScope:vi.fn().mockResolvedValue(undefined)};
 const fetch=vi.fn(async(_url:string,options?:RequestInit)=>{
  if(options?.method==='POST'){posts.push(String(options.body));const body=JSON.parse(String(options.body));if(body.data.settings[0].archiveResetId!==JSON.parse(head.backup).data.settings[0].archiveResetId)return Response.json({code:'account_reset',error:'Archive reset',revision:head.revision},{status:409});head.backup=String(options.body);head.revision++;return Response.json(head);}
  return Response.json(head);
 });vi.stubGlobal('fetch',fetch);
 const injector=createEnvironmentInjector([{provide:AuthService,useValue:{user,offlineMode:()=>false}},{provide:FormDraftService,useValue:drafts},ArchiveSyncService],null as unknown as EnvironmentInjector);injectors.push(injector);
 return{...b,user,head,posts,drafts,fetch,service:injector.get(ArchiveSyncService),key:'gymtrack-user-tandu'};
}

it('authoritatively replaces a populated stale local archive and pending upload after a confirmed reset, without merging old plans',async()=>{
 const remote=seed();remote.settings[0].archiveResetId='reset-1';const t=await syncFixture(remote),local=plans('Old plan pending on phone');
 t.storage.set('gymtrack-server-copy-v1:'+t.key,JSON.stringify({revision:1,fingerprint:await archiveFingerprint(await exportBackup(local)),pending:true,blocked:true}));
 let release!:()=>void;const wait=new Promise<void>(resolve=>release=resolve),normal=t.fetch.getMockImplementation()!;t.fetch.mockImplementationOnce(async(url,options)=>{await wait;return normal(url,options);});
 let installed:DataSet|undefined;const accept=vi.fn(async(data:DataSet)=>{installed=structuredClone(data);return true;});const opening=t.service.open(t.key,local,true,accept);t.service.changed(plans('Old edit queued during reset download'));release();const result=await opening;
 expect(result.plans).toEqual([]);expect(result.settings[0].archiveResetId).toBe('reset-1');expect(installed?.plans).toEqual([]);expect(accept).toHaveBeenCalledOnce();expect(t.drafts.discardScope).toHaveBeenCalledExactlyOnceWith(t.key);expect(t.reload).toHaveBeenCalledOnce();expect(await t.service.flush()).toBe(true);expect(t.posts).toHaveLength(0);
 const meta=JSON.parse(t.storage.get('gymtrack-server-copy-v1:'+t.key)!);expect(meta).toMatchObject({revision:2,pending:false});expect(meta.blocked).toBeUndefined();
});
it('does not clear stale local data or drafts unless the reset snapshot was safely installed',async()=>{
 const remote=seed();remote.settings[0].archiveResetId='reset-1';const t=await syncFixture(remote),local=plans('Preserve until accepted');const result=await t.service.open(t.key,local,true,async()=>false);
 expect(result).toBe(local);expect(t.service.status()).toBe('conflict');expect(t.drafts.discardScope).not.toHaveBeenCalled();expect(t.reload).not.toHaveBeenCalled();expect(await t.service.flush()).toBe(false);expect(t.posts).toHaveLength(0);
});
it('rejects a late stale editor snapshot after reset without re-queueing it for upload',async()=>{
 const remote=seed();remote.settings[0].archiveResetId='reset-1';const t=await syncFixture(remote);await t.service.open(t.key,plans('Old phone snapshot'),true,async()=>true);
 const committed=t.head.backup;t.service.changed(plans('Late old form capture'));expect(await t.service.flush()).toBe(false);expect(t.posts).toHaveLength(0);expect(t.head.backup).toBe(committed);expect(t.service.status()).toBe('conflict');
});
it('reloads for authoritative reset after an already-open old archive receives a rejected write',async()=>{
 const initial=plans('Before reset'),t=await syncFixture(initial);t.head.revision=1;await t.service.open(t.key,initial);t.service.changed(plans('Old edit in flight'));
 const reset=seed();reset.settings[0].archiveResetId='reset-1';t.head.backup=await exportBackup(reset);t.head.revision=2;const committed=t.head.backup;
 expect(await t.service.flush()).toBe(false);expect(t.reload).toHaveBeenCalledOnce();expect(t.head.backup).toBe(committed);expect(t.service.status()).toBe('conflict');expect(t.posts).toHaveLength(1);expect(t.service.lastErrorCode()).toBe('account_reset');
});
it('does not overwrite a newly opened account while old-scope draft cleanup is pending',async()=>{
 const remote=seed();remote.settings[0].archiveResetId='reset-1';const t=await syncFixture(remote);let release!:()=>void;t.drafts.discardScope.mockImplementationOnce(()=>new Promise<void>(resolve=>release=resolve));
 const first=t.service.open(t.key,plans('Old Tandu'),true,async()=>true);await vi.waitFor(()=>expect(t.drafts.discardScope).toHaveBeenCalledOnce());
 const other=plans('Other account intact');t.user.set({id:'other',owner:false});t.head.backup=await exportBackup(other);t.head.revision=7;await t.service.open('gymtrack-user-other',other);release();await first;
 expect(t.service.revision()).toBe(7);expect(t.service.status()).toBe('saved');expect(t.reload).not.toHaveBeenCalled();expect(t.storage.get('gymtrack-server-copy-v1:gymtrack-user-other')).toContain('"revision":7');
 t.service.changed(plans('Other account new edit'));expect(await t.service.flush()).toBe(true);expect((await importBackup(t.head.backup)).plans[0].name).toBe('Other account new edit');
});
it('invalidates stale draft sessions and queued writes only in the reset scope, allowing a fresh session afterward',async()=>{
 browser();const name='discard-reset-'+crypto.randomUUID(),service=new FormDraftService(name);
 try{
  await service.write('other','profile',{name:'Keep other account draft'});await service.write('tandu','profile',{name:'Old Tandu draft'});
  const old=service.bind('tandu','profile',()=>({name:'Stale editor capture'}),()=>{});await old.ready;
  let release!:()=>void;(service as any).queue=new Promise<void>(resolve=>release=resolve);old.changed();const pending=service.write('tandu','plan',{name:'Queued old plan'}),flushing=old.flush(),discard=service.discardScope('tandu');release();await Promise.all([pending,flushing,discard]);
  await old.flush();await old.destroy();await service.flushAll();expect(await service.read('tandu','profile')).toBeNull();expect(await service.read('tandu','plan')).toBeNull();expect(await service.read('other','profile')).toEqual({name:'Keep other account draft'});
  const fresh=service.bind('tandu','profile',()=>({name:'Fresh post-reset draft'}),()=>{});await fresh.ready;fresh.changed();await fresh.flush();expect(await service.read('tandu','profile')).toEqual({name:'Fresh post-reset draft'});await fresh.destroy();
 }finally{await service.flushAll();service.ngOnDestroy();await Dexie.delete(name);}
});

it('rejects a stale or forged reset marker at the archive boundary without touching the head or recovery objects',async()=>{
 const sql=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
 const objects=new Map<string,string>(),uid='reset-user';sql.prepare('INSERT INTO users(id,name,email,username,role,active,salt,password_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(uid,'Fixture','reset-fixture@example.test','reset-fixture','User',1,'salt','hash',1);
 const env:any={DB:{prepare:(q:string)=>{let args:any[]=[];const statement={bind:(...values:any[])=>{args=values;return statement;},first:async()=>sql.prepare(q).get(...args),all:async()=>({results:sql.prepare(q).all(...args)}),run:async()=>({meta:{changes:Number(sql.prepare(q).run(...args).changes)}})};return statement;},batch:async(statements:any[])=>{sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}},BUCKET:{put:vi.fn(async(key:string,value:string)=>objects.set(key,value)),get:async(key:string)=>objects.has(key)?{text:async()=>objects.get(key)!}:null,delete:vi.fn(async()=>{})}};
 const user={id:uid},scope=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('account:'+uid)))].map(v=>v.toString(16).padStart(2,'0')).join('');
 const request=(body:string,revision:number)=>new Request(origin+'/api/archive?scope=account',{method:'POST',headers:{'oai-authenticated-user-id':'visitor','Content-Type':'application/json','If-Match':String(revision)},body});
 try{
  const original=await exportBackup(plans('Old snapshot'));expect((await archiveApi(request(original,0),env,user)).status).toBe(200);
  sql.prepare('INSERT INTO account_archive_resets(id,user_id,scope,reset_id,completed_at) VALUES(?,?,?,?,?)').run('operation',uid,scope,'server-reset-1',Date.now());const before=sql.prepare('SELECT * FROM archive_heads').all(),puts=env.BUCKET.put.mock.calls.length;
  expect((await archiveApi(request(original,1),env,user)).status).toBe(409);
  const forged=plans('Wrong reset marker');forged.settings[0].archiveResetId='forged';expect((await archiveApi(request(await exportBackup(forged),1),env,user)).status).toBe(409);expect(env.BUCKET.put.mock.calls).toHaveLength(puts);expect(sql.prepare('SELECT * FROM archive_heads').all()).toEqual(before);
  const valid=plans('After approved reset');valid.settings[0].archiveResetId='server-reset-1';expect((await archiveApi(request(await exportBackup(valid),1),env,user)).status).toBe(200);expect(sql.prepare('SELECT revision FROM archive_heads').get()!.revision).toBe(2);
  sql.prepare('INSERT INTO users(id,name,email,username,role,active,salt,password_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run('unaffected','Other','unaffected-fixture@example.test','unaffected','User',1,'salt','hash',1);
  expect((await archiveApi(request(await exportBackup(plans('Other account ordinary save')),0),env,{id:'unaffected'})).status).toBe(200);
 }finally{sql.close();}
});
