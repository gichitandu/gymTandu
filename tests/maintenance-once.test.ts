// Audit tests for the completed one-off reset; helper is excluded from deployment.
// after the approved production operation has been performed and verified.
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {performTanduReset} from '../tools/maintenance-tandu-reset.mjs';
import {archiveApi} from '../worker/archive.js';
import {exportBackup,importBackup} from '../src/app/services/backup';
import {seed} from '../src/app/core/seed';

const origin='https://gymtrack.test',uid='35e2c49b-0f56-40e6-a958-ce876d5c8bfe',capability='fixture-maintenance-capability';
let sql:DatabaseSync,env:any,objects:Map<string,string>,metadata:Map<string,any>,previous:string,me:any,scope:string;
const hash=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
function archiveRequest(body?:string,revision=0){return new Request(origin+'/api/archive?scope=account',{method:body===undefined?'GET':'POST',headers:{'oai-authenticated-user-id':'visitor',...(body===undefined?{}:{'Content-Type':'application/json','If-Match':String(revision)})},body});}
function maintenance(body:unknown={userId:uid},headers:Record<string,string>={}){return new Request(origin+'/api/maintenance-once',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+capability,...headers},body:JSON.stringify(body)});}
const catalog=vi.fn(async()=>{const data=seed();return{exercises:data.exercises,muscleGroups:data.muscleGroups};}),publish=vi.fn().mockResolvedValue(undefined);
const reset=(request=maintenance())=>performTanduReset(request,env,catalog,archiveApi,publish);
beforeEach(async()=>{
 sql=new DatabaseSync(':memory:');for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+name,'utf8'));
 sql.prepare('INSERT INTO users(id,name,email,username,role,active,salt,password_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(uid,'Tandu','tandu-fixture@example.test','tandu','SuperAdmin',1,'keep-salt','keep-password-hash',1);
 sql.prepare('INSERT INTO users(id,name,email,username,role,active,salt,password_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run('other','Other','other-fixture@example.test','other','SuperAdmin',1,'other-salt','other-password-hash',1);
 sql.prepare('INSERT INTO user_preferences(user_id,background_color) VALUES(?,?)').run(uid,'#112233');
 objects=new Map();metadata=new Map();let queue=Promise.resolve<unknown>(undefined);
 env={GYMTRACK_MAINTENANCE_SECRET:capability,DB:{prepare:(query:string)=>{let args:any[]=[];const statement={query,bind:(...values:any[])=>{args=values;return statement;},first:async()=>sql.prepare(query).get(...args),all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}})};return statement;},batch:(statements:any[])=>{const job=queue.then(async()=>{sql.exec('BEGIN');try{const values=[];for(const statement of statements)values.push(await statement.run());sql.exec('COMMIT');return values;}catch(error){sql.exec('ROLLBACK');throw error;}});queue=job.catch(()=>{});return job;}},BUCKET:{put:vi.fn(async(key:string,value:string,options:any)=>{objects.set(key,value);metadata.set(key,options);}),get:vi.fn(async(key:string)=>objects.has(key)?{text:async()=>objects.get(key)!}:null),delete:vi.fn(async(keys:string|string[])=>{for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);})}};
 const data=seed(),at='2026-10-01T12:00:00.000Z';data.profiles[0]={id:'local',name:'Tandu',role:'SuperAdmin',bodyWeight:75,height:180,goal:'Old private goal'};
 data.plans.push({id:'old-plan',userId:'local',name:'Old plan',description:'Old notes',createdAt:at,updatedAt:at,active:true,archived:false});
 data.workouts.push({id:'old-workout',userId:'local',planId:'old-plan',dayId:'old-day',planName:'Old plan',dayName:'Old day',date:'2026-10-01',startedAt:at,endedAt:'2026-10-01T12:30:00.000Z',duration:30,notes:'Old session notes',status:'completed'});
 data.meals.push({id:'old-meal',name:'Old meal',date:'2026-10-01',grams:100,calories:400,protein:20,carbs:30,fat:10,notes:'',source:'manual',createdAt:at});
 previous=await exportBackup(data);me=sql.prepare('SELECT * FROM users WHERE id=?').get(uid);scope=await hash('account:'+uid);
 expect((await archiveApi(archiveRequest(previous),env,me)).status).toBe(200);catalog.mockClear();publish.mockClear();
});
afterEach(()=>{sql.close();vi.restoreAllMocks();});

it('requires the capability, exact Tandu identity, username and SuperAdmin role before changing anything',async()=>{
 const before=sql.prepare('SELECT * FROM archive_heads').all(),count=objects.size;
 expect((await reset(maintenance({userId:uid},{Authorization:'Bearer wrong'}))).status).toBe(404);
 expect((await reset(maintenance({userId:uid},{Origin:'https://elsewhere.test'}))).status).toBe(403);
 expect((await reset(maintenance({userId:'other'}))).status).toBe(403);
 sql.prepare('UPDATE users SET username=? WHERE id=?').run('not-tandu',uid);expect((await reset()).status).toBe(403);
 sql.prepare('UPDATE users SET username=?,role=? WHERE id=?').run('tandu','Admin',uid);expect((await reset()).status).toBe(403);
 expect(objects.size).toBe(count);expect(sql.prepare('SELECT * FROM archive_heads').all()).toEqual(before);expect(sql.prepare('SELECT COUNT(*) AS n FROM account_archive_resets').get()!.n).toBe(0);expect(catalog).not.toHaveBeenCalled();
});
it('resets only personal archive data, preserves account credentials and roles, and retains an exact private recovery copy',async()=>{
 const users=sql.prepare('SELECT * FROM users ORDER BY id').all(),oldHead=sql.prepare('SELECT * FROM archive_heads WHERE scope=?').get(scope)!;
 const response=await reset(),value=await response.json();expect(response.status).toBe(200);expect(value.current).toEqual({plans:0,workouts:0,meals:0});expect(value.previous).toEqual({plans:1,workouts:1,meals:1});
 expect(sql.prepare('SELECT * FROM users ORDER BY id').all()).toEqual(users);
 const row=sql.prepare('SELECT * FROM account_archive_resets WHERE user_id=?').get(uid)!;expect(row.completed_at).toBeTruthy();expect(String(row.recovery_key)).toMatch(/^reset-recovery\/[a-f0-9]{64}\/tandu-excel-/);expect(objects.get(String(row.recovery_key))).toBe(previous);expect(objects.get(String(oldHead.object_key))).toBe(previous);
 expect(Number(row.retain_until)).toBeGreaterThan(Date.now()+29*86400000);expect(Number(metadata.get(String(row.recovery_key)).customMetadata.retainUntil)).toBeGreaterThan(Date.now()+29*86400000);
 const loaded=await(await archiveApi(archiveRequest(),env,me)).json(),data=await importBackup(loaded.backup);expect(data.settings[0].archiveResetId).toBe(row.reset_id);expect(data.plans).toEqual([]);expect(data.workouts).toEqual([]);expect(data.meals).toEqual([]);expect(data.profiles[0]).toEqual({id:'local',name:'Tandu',role:'SuperAdmin'});expect(data.roles).toEqual((await importBackup(previous)).roles);expect(data.exercises.length).toBe(seed().exercises.length);expect(publish).toHaveBeenCalledOnce();
 expect(sql.prepare('SELECT * FROM user_preferences WHERE user_id=?').get(uid)).toBeUndefined();
});
it('does not reset new records when the completed operation is requested again',async()=>{
 await reset();const loaded=await(await archiveApi(archiveRequest(),env,me)).json(),data=await importBackup(loaded.backup),at=new Date().toISOString();
 data.plans.push({id:'new-plan',userId:'local',name:'New plan to retain',description:'',createdAt:at,updatedAt:at,active:true,archived:false});
 const updated=await exportBackup(data);expect((await archiveApi(archiveRequest(updated,loaded.revision),env,me)).status).toBe(200);const puts=env.BUCKET.put.mock.calls.length;
 const second=await reset();expect((await second.json()).alreadyCompleted).toBe(true);expect(env.BUCKET.put.mock.calls).toHaveLength(puts);expect((await(await archiveApi(archiveRequest(),env,me)).json()).backup).toBe(updated);
});
it('refuses to reset when the old head object fails integrity verification',async()=>{
 const head=sql.prepare('SELECT * FROM archive_heads WHERE scope=?').get(scope)!;objects.set(String(head.object_key),'corrupt');const response=await reset();expect(response.status).toBe(503);expect(sql.prepare('SELECT revision FROM archive_heads WHERE scope=?').get(scope)!.revision).toBe(1);expect(sql.prepare('SELECT COUNT(*) AS n FROM account_archive_resets').get()!.n).toBe(0);
});
it('finalizes an interrupted completion without wiping a new plan written after the reset head committed',async()=>{
 const batch=env.DB.batch;let fail=true;env.DB.batch=async(statements:any[])=>{if(fail&&statements.some(s=>s.query.startsWith('UPDATE account_archive_resets'))){fail=false;throw Error('Completion acknowledgement lost');}return batch(statements);};
 await expect(reset()).rejects.toThrow('Completion acknowledgement lost');
 const loaded=await(await archiveApi(archiveRequest(),env,me)).json(),data=await importBackup(loaded.backup),at=new Date().toISOString();expect(data.settings[0].archiveResetId).toBeTruthy();
 data.plans.push({id:'after-reset',userId:'local',name:'Created after committed reset',description:'',createdAt:at,updatedAt:at,active:true,archived:false});const current=await exportBackup(data);expect((await archiveApi(archiveRequest(current,loaded.revision),env,me)).status).toBe(200);const puts=env.BUCKET.put.mock.calls.length;
 const retry=await reset();expect(retry.status).toBe(200);expect((await(await archiveApi(archiveRequest(),env,me)).json()).backup).toBe(current);expect(env.BUCKET.put.mock.calls).toHaveLength(puts);expect(sql.prepare('SELECT completed_at FROM account_archive_resets WHERE user_id=?').get(uid)!.completed_at).toBeTruthy();
});
