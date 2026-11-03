import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { api, IOS_LOGOUT_RECOVERY_BEFORE, IOS_REFRESH_RECOVERY_ID } from '../worker/index.js';
import {APPROVED_THEME_PALETTES} from '../shared/approved-palettes.js';
let sql: DatabaseSync;
let env: any;
const origin='https://gymtrack.test';
const owner='giacomotanduo004@gmail.com';
function request(path:string,body?:unknown,opts:{cookie?:string;email?:string;visitor?:string;method?:string;origin?:string;agent?:string}={}) {
 return new Request(origin+'/api/'+path,{method:opts.method||(body?'POST':'GET'),headers:{'oai-authenticated-user-id':opts.visitor||'owner-visitor','oai-authenticated-user-email':opts.email||owner,...(body?{'Content-Type':'application/json',Origin:opts.origin||origin}:{}),...(opts.cookie?{Cookie:opts.cookie}:{}),...(opts.agent?{'User-Agent':opts.agent}:{})},body:body?JSON.stringify(body):undefined});
}
async function call(path:string,body?:unknown,opts:any={}){return api(request(path,body,opts),env);}
async function activate(){const r=await call('auth/setup',{password:'owner-password-123'});expect(r.status).toBe(200);return r.headers.get('set-cookie')!.split(';')[0];}
beforeEach(()=>{
 sql=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
 env={DB:{prepare:(q:string)=>{let args:any[]=[];const statement={bind:(...a:any[])=>{args=a;return statement;},first:async()=>sql.prepare(q).get(...args),all:async()=>({results:sql.prepare(q).all(...args)}),run:async()=>({meta:{changes:Number(sql.prepare(q).run(...args).changes)}})};return statement;},batch:async(a:any[])=>{sql.exec('BEGIN');try{const r=[];for(const s of a)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}}};
});
afterEach(()=>sql.close());
it('bootstrap is restricted to the verified owner and can run only once',async()=>{
 expect((await call('auth/setup',{password:'password-123456'},{email:'attacker@example.com'})).status).toBe(403);
 const cookie=await activate();expect((await call('auth/setup',{password:'another-password-123'})).status).toBe(409);
 const me=await (await call('auth/me',undefined,{cookie})).json();expect(me.user.role).toBe('SuperAdmin');expect(me.platformOwner).toBe(true);
 expect((await (await call('auth/me',undefined,{email:'client@example.com'})).json()).platformOwner).toBe(false);
 expect(cookie).not.toContain('owner-password');
});
it('denies clients and admins the entire user-management API, including forged role submissions',async()=>{
 const cookie=await activate();
 for(const role of ['Admin','User']){
  const email=role.toLowerCase()+'@example.com';
  expect((await call('users',{name:role,email,username:role.toLowerCase(),role,password:'a-secure-password-123'},{cookie})).status).toBe(201);
  const login=await call('auth/login',{email,password:'a-secure-password-123'},{visitor:role,email});const c=login.headers.get('set-cookie')!.split(';')[0];
  const opts={cookie:c,visitor:role,email};
  expect((await call('users',undefined,opts)).status).toBe(403);
  expect((await call('users',{name:'Fake',email:'fake@example.com',role:'SuperAdmin',password:'a-secure-password-123'},opts)).status).toBe(403);
  expect((await call('users/anything',{role:'SuperAdmin'}, {...opts,method:'PATCH'})).status).toBe(403);
 }
});
it('isolates sessions by platform visitor and revokes sessions when an account is disabled',async()=>{
 const cookie=await activate();
 await call('users',{name:'Client',email:'client@example.com',username:'client',role:'User',password:'a-secure-password-123'},{cookie});
 const r=await call('auth/login',{email:'client@example.com',password:'a-secure-password-123'},{visitor:'client',email:'client@example.com'});const clientCookie=r.headers.get('set-cookie')!.split(';')[0];
 expect(r.headers.get('set-cookie')).toContain('Secure; HttpOnly; SameSite=Strict');
 const stolen=await (await call('auth/me',undefined,{cookie:clientCookie})).json();expect(stolen.user).toBeNull();
 const users=(await (await call('users',undefined,{cookie})).json()).users;const u=users.find((u:any)=>!u.owner);
 expect((await call('users/'+u.id,{...u,active:false,password:''},{cookie,method:'PATCH'})).status).toBe(200);
 const me=await (await call('auth/me',undefined,{cookie:clientCookie,visitor:'client'})).json();expect(me.user).toBeNull();
 expect((await call('auth/login',{email:u.email,password:'a-secure-password-123'},{visitor:'client'})).status).toBe(401);
});
it('protects the owner, rejects cross-origin writes and rate-limits passwords',async()=>{
 const cookie=await activate();const u=(await (await call('auth/me',undefined,{cookie})).json()).user;
 expect((await call('users/'+u.id,{...u,role:'User',active:false},{cookie,method:'PATCH'})).status).toBe(403);
 expect((await call('users',{},{cookie,origin:'https://other.test'})).status).toBe(403);
 for(let i=0;i<10;i++)expect((await call('auth/login',{email:owner,password:'wrong'})).status).toBe(401);
 expect((await call('auth/login',{email:owner,password:'owner-password-123'})).status).toBe(429);
});
it('changing a password invalidates older sessions and the old password',async()=>{
 const cookie=await activate();
 expect((await call('auth/password',{currentPassword:'wrong',password:'new-password-12345'},{cookie})).status).toBe(403);
 const changed=await call('auth/password',{currentPassword:'owner-password-123',password:'new-password-12345'},{cookie});expect(changed.status).toBe(200);
 expect((await (await call('auth/me',undefined,{cookie})).json()).user).toBeNull();
 expect((await call('auth/login',{email:owner,password:'owner-password-123'})).status).toBe(401);
 expect((await call('auth/login',{email:owner,password:'new-password-12345'})).status).toBe(200);
});

it('accepts eight plain characters and rejects seven for setup, creation and password changes',async()=>{
 expect((await call('auth/setup',{password:'abcdefg'})).status).toBe(400);
 const setup=await call('auth/setup',{password:'abcdefgh'});expect(setup.status).toBe(200);
 const cookie=setup.headers.get('set-cookie')!.split(';')[0];
 expect((await call('users',{name:'Client',email:'eight@example.com',username:'eight',role:'User',password:'abcdefg'},{cookie})).status).toBe(400);
 expect((await call('users',{name:'Client',email:'eight@example.com',username:'eight',role:'User',password:'abcdefgh'},{cookie})).status).toBe(201);
 expect((await call('auth/password',{currentPassword:'abcdefgh',password:'abcdefg'},{cookie})).status).toBe(400);
 expect((await call('auth/password',{currentPassword:'abcdefgh',password:'ijklmnop'},{cookie})).status).toBe(200);
});

it('shares the catalog, permits admin changes and hides inactive exercises from clients',async()=>{
 const cookie=await activate();
 const base=await (await call('catalog',undefined,{cookie})).json();expect(base.exercises).toHaveLength(253);expect(base.muscleGroups).toHaveLength(8);expect(base.exercises.every((e:any)=>e.videoUrl==='')).toBe(true);
 for(const role of ['Admin','User'])await call('users',{name:role,email:role.toLowerCase()+'@example.com',username:role.toLowerCase(),role,password:'abcdefgh'},{cookie});
 const sessionFor=async(role:string)=>{const r=await call('auth/login',{email:role.toLowerCase()+'@example.com',password:'abcdefgh'},{visitor:role});return {cookie:r.headers.get('set-cookie')!.split(';')[0],visitor:role};};
 const admin=await sessionFor('Admin'),client=await sessionFor('User');
 const e={...base.exercises[0],active:false};
 expect((await call('catalog/exercise',e,client)).status).toBe(403);
 expect((await call('catalog/group',{id:'test',name:'Test'},client)).status).toBe(403);
 expect((await call('catalog/exercise',e,admin)).status).toBe(200);
 const visible=await (await call('catalog',undefined,client)).json();expect(visible.exercises.find((x:any)=>x.id===e.id)).toBeUndefined();
 const managed=await (await call('catalog',undefined,admin)).json();expect(managed.exercises.find((x:any)=>x.id===e.id).active).toBe(false);
 expect((await call('catalog/exercise',{...e,id:'custom-test',name:'Esercizio test',active:true,videoUrl:''},admin)).status).toBe(200);
 expect((await call('catalog/exercise',{...e,id:'custom-test',name:'Esercizio test',active:false,videoUrl:''},admin)).status).toBe(200);
 expect((await call('catalog/exercise',{...e,active:true},admin)).status).toBe(200);
 expect((await (await call('catalog',undefined,client)).json()).exercises.find((x:any)=>x.id===e.id)).toBeTruthy();
});
it('saves a background per account, rejects invalid colors and preserves the default for others',async()=>{
 const cookie=await activate();
 await call('users',{name:'Client',email:'theme@example.com',username:'theme',role:'User',password:'abcdefgh'},{cookie});
 const r=await call('auth/login',{email:'theme@example.com',password:'abcdefgh'},{visitor:'client'});const client={cookie:r.headers.get('set-cookie')!.split(';')[0],visitor:'client'};
 expect((await call('preferences',{backgroundColor:'red;display:none'},{cookie})).status).toBe(400);
 expect((await call('preferences',{backgroundColor:'#123456'},{cookie})).status).toBe(200);
 expect((await (await call('preferences',undefined,{cookie})).json()).backgroundColor).toBe('#123456');
 expect((await (await call('preferences',undefined,client)).json()).backgroundColor).toBe('#050E17');
});

it('reserves normalized unique usernames and supports both username and email login',async()=>{
 const cookie=await activate();
 expect((await call('auth/username',{username:'Giacomo'},{cookie})).status).toBe(200);
 const me=await (await call('auth/me',undefined,{cookie})).json();expect(me.user.username).toBe('giacomo');
 expect((await call('auth/login',{email:'GIACOMO',password:'owner-password-123'})).status).toBe(200);
 expect((await call('auth/login',{email:owner,password:'owner-password-123'})).status).toBe(200);
 expect((await call('users',{name:'Other',email:'other@example.com',username:'GIACOMO',role:'User',password:'abcdefgh'},{cookie})).status).toBe(409);
 expect((await call('users',{name:'Other',email:'other@example.com',username:'other.user',role:'User',password:'abcdefgh'},{cookie})).status).toBe(201);
 const r=await call('auth/login',{identifier:'OTHER.USER',password:'abcdefgh'},{visitor:'other'});expect(r.status).toBe(200);const otherCookie=r.headers.get('set-cookie')!.split(';')[0];
 expect((await call('auth/username',{username:'giacomo'},{cookie:otherCookie,visitor:'other'})).status).toBe(409);
 expect((await call('auth/username',{username:'other.changed'},{cookie:otherCookie,visitor:'other'})).status).toBe(200);
 expect((await call('auth/login',{email:'other.user',password:'abcdefgh'},{visitor:'other'})).status).toBe(401);
 expect((await call('auth/login',{email:'other.changed',password:'abcdefgh'},{visitor:'other'})).status).toBe(200);
 expect((await call('auth/username',{username:'invalid name'},{cookie})).status).toBe(400);
 expect((await call('auth/username',{username:'x'},{cookie})).status).toBe(400);
});
it('enforces username uniqueness at the database level and on admin updates',async()=>{
 const cookie=await activate();
 for(const username of ['first','second'])expect((await call('users',{name:username,email:username+'@example.com',username,role:'User',password:'abcdefgh'},{cookie})).status).toBe(201);
 const second=(await (await call('users',undefined,{cookie})).json()).users.find((u:any)=>u.username==='second');
 expect((await call('users/'+second.id,{...second,username:'FIRST',active:true},{cookie,method:'PATCH'})).status).toBe(409);
 expect(()=>sql.prepare('UPDATE users SET username=? WHERE id=?').run('first',second.id)).toThrow(/UNIQUE/);
});

it('removes saved YouTube references with a one-time migration and preserves custom catalog fields',async()=>{
 const cookie=await activate();const ex={id:'custom-legacy',name:'Esercizio personale',muscleGroupId:'muscle-0',equipment:'Manubri',secondaryMuscleIds:[],tags:['Privato'],active:false,loadMode:'external',description:'Istruzioni personali',videoUrl:'https://www.youtube.com/watch?v=abcdefghijk',videoTitle:'Vecchio titolo',thumbnailUrl:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'};
 const me=await (await call('auth/me',undefined,{cookie})).json();sql.prepare('INSERT INTO catalog_exercises VALUES(?,?,?,?,?)').run(ex.id,JSON.stringify(ex),0,me.user.id,Date.now());
 sql.exec(readFileSync('drizzle/0003_optional_exercise_videos.sql','utf8'));
 const data=await (await call('catalog',undefined,{cookie})).json();expect(data.exercises.find((e:any)=>e.id===ex.id)).toMatchObject({name:ex.name,active:false,description:ex.description,videoUrl:'',thumbnailUrl:''});
 expect((await call('catalog/exercise',{...ex,videoUrl:'https://example.com/nuovo-video.mp4',thumbnailUrl:'',active:true},{cookie})).status).toBe(200);
});

it('recovers only the old owner iPhone cookie, leaving PC sessions and all account data untouched',async()=>{
 const old=await activate();sql.prepare('UPDATE sessions SET expires_at=?').run(IOS_LOGOUT_RECOVERY_BEFORE+30*86400000-1);
 await call('preferences',{backgroundColor:'#123456'},{cookie:old});
 const login=await call('auth/login',{email:owner,password:'owner-password-123'}),pc=login.headers.get('set-cookie')!.split(';')[0];
 const before=sql.prepare('SELECT * FROM users').all(),preferences=sql.prepare('SELECT * FROM user_preferences').all();
 Object.defineProperty(env,'BUCKET',{get:()=>{throw Error('Recovery must not access personal archives');}});
 expect((await (await call('auth/device-recovery',{},{cookie:old,agent:'Windows NT Chrome'})).json()).signedOut).toBe(false);
 const recovered=await call('auth/device-recovery',{},{cookie:old,agent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'});
 expect((await recovered.json()).signedOut).toBe(true);expect(recovered.headers.get('set-cookie')).toContain('Max-Age=0');
 expect((await (await call('auth/me',undefined,{cookie:old})).json()).user).toBeNull();expect((await (await call('auth/me',undefined,{cookie:pc})).json()).user.role).toBe('SuperAdmin');
 expect(sql.prepare('SELECT * FROM users').all()).toEqual(before);expect(sql.prepare('SELECT * FROM user_preferences').all()).toEqual(preferences);
 expect((await (await call('auth/device-recovery',{},{cookie:pc,agent:'iPhone'})).json()).signedOut).toBe(false);
 expect((await (await call('auth/device-recovery',{},{cookie:old,agent:'iPhone'})).json()).signedOut).toBe(false);
});
it('rejects cross-origin recovery and never revokes another user or another platform visitor',async()=>{
 const ownerCookie=await activate();await call('users',{name:'Client',email:'recovery@example.com',username:'recover',role:'User',password:'abcdefgh'},{cookie:ownerCookie});
 const login=await call('auth/login',{email:'recover',password:'abcdefgh'},{visitor:'client'}),cookie=login.headers.get('set-cookie')!.split(';')[0];
 sql.prepare('UPDATE sessions SET expires_at=?').run(IOS_LOGOUT_RECOVERY_BEFORE+30*86400000-1);
 const count=()=>sql.prepare('SELECT COUNT(*) AS total FROM sessions').get()!.total;
 expect((await call('auth/device-recovery',{},{cookie:ownerCookie,agent:'iPhone',origin:'https://attacker.test'})).status).toBe(403);
 expect((await (await call('auth/device-recovery',{},{cookie:ownerCookie,visitor:'different',agent:'iPhone'})).json()).signedOut).toBe(false);
 expect((await (await call('auth/device-recovery',{},{cookie,visitor:'client',agent:'iPhone'})).json()).signedOut).toBe(false);expect(count()).toBe(2);
});

it('recovers the owner iPhone session from the October 29 blocked release once, while a new login stays active',async()=>{
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-29T22:00:00Z'));
 try{
  const old=await activate();sql.prepare('UPDATE sessions SET expires_at=?').run(Date.parse('2026-10-29T20:00:00Z')+30*86400000);
  const login=await call('auth/login',{email:owner,password:'owner-password-123'}),fresh=login.headers.get('set-cookie')!.split(';')[0];
  expect((await (await call('auth/device-recovery',{},{cookie:old,agent:'iPhone'})).json()).signedOut).toBe(true);
  expect((await (await call('auth/device-recovery',{},{cookie:fresh,agent:'iPhone'})).json()).signedOut).toBe(false);
  expect((await (await call('auth/me',undefined,{cookie:fresh})).json()).user.role).toBe('SuperAdmin');
 }finally{clock.mockRestore();}
});

it('refreshes an old iPhone document even with a recent valid login, without revoking it or opening any archive',async()=>{
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-29T22:00:00Z'));
 try{
  const cookie=await activate(),before=sql.prepare('SELECT * FROM sessions').all();
  Object.defineProperty(env,'BUCKET',{get:()=>{throw Error('Refresh must not access archives');}});
  const r=await call('auth/device-recovery',{},{cookie,agent:'iPhone'});
  expect(await r.json()).toEqual({signedOut:false,refreshRequired:true,recoveryId:IOS_REFRESH_RECOVERY_ID});
  expect(r.headers.get('set-cookie')).toBeNull();expect(sql.prepare('SELECT * FROM sessions').all()).toEqual(before);
  expect((await (await call('auth/me',undefined,{cookie})).json()).user.role).toBe('SuperAdmin');
 }finally{clock.mockRestore();}
});
it('refreshes the owner iPhone after a previous logout, without requiring an app cookie or a server backup',async()=>{
 const cookie=await activate();await call('auth/logout',{},{cookie});
 Object.defineProperty(env,'BUCKET',{get:()=>{throw Error('Refresh must not access archives');}});
 const r=await call('auth/device-recovery',{},{agent:'iPhone'});
 expect(await r.json()).toEqual({signedOut:false,refreshRequired:true,recoveryId:IOS_REFRESH_RECOVERY_ID});
 expect(r.headers.get('set-cookie')).toBeNull();
 const unrelated=await call('auth/device-recovery',{},{agent:'iPhone',email:'client@example.com',visitor:'client'});
 expect(await unrelated.json()).toEqual({signedOut:false});
});

it('persists full theme preferences per account for every role without modifying user permissions',async()=>{
 const cookie=await activate();
 const sessions=[{cookie}];
 for(const role of ['Admin','User']){
  const name='palette-'+role.toLowerCase();
  expect((await call('users',{name,email:name+'@example.com',username:name,role,password:'abcdefgh'},{cookie})).status).toBe(201);
  const login=await call('auth/login',{email:name,password:'abcdefgh'},{visitor:name});
  sessions.push({cookie:login.headers.get('set-cookie')!.split(';')[0],visitor:name} as any);
 }
 const before=sql.prepare('SELECT * FROM users ORDER BY id').all();
 for(let index=0;index<sessions.length;index++){
  const themeConfig={palette:['carbonio','sabbia','ghiaccio'][index],mode:['dark','light','system'][index],accent:'#445566',background:'#112233'};
  expect((await call('preferences',{backgroundColor:'#112233',themeConfig},sessions[index])).status).toBe(200);
  const saved=await (await call('preferences',undefined,sessions[index])).json();
  expect(saved).toEqual({backgroundColor:'#112233',themeConfig});
 }
 expect(sql.prepare('SELECT * FROM users ORDER BY id').all()).toEqual(before);
 expect((await call('preferences',undefined)).status).toBe(401);
 expect((await call('preferences',{backgroundColor:'#112233',themeConfig:{palette:'carbonio',mode:'dark'}})).status).toBe(401);
});

it('rejects invalid theme configurations atomically and accepts legacy background-only writes',async()=>{
 const cookie=await activate(),themeConfig={palette:'petrolio',mode:'system',accent:'#70D6C5'};
 expect((await call('preferences',{backgroundColor:'#0C1F22',themeConfig},{cookie})).status).toBe(200);
 for(const invalid of [null,[],{}, {...themeConfig,palette:'unknown'}, {...themeConfig,mode:'auto'}, {...themeConfig,accent:'red'}, {...themeConfig,background:'url(x)'}, {...themeConfig,role:'SuperAdmin'}]){
  expect((await call('preferences',{backgroundColor:'#FFFFFF',themeConfig:invalid},{cookie})).status).toBe(400);
  expect((await (await call('preferences',undefined,{cookie})).json()).themeConfig).toEqual(themeConfig);
 }
 expect((await call('preferences',{backgroundColor:'#ABCDEF'},{cookie})).status).toBe(200);
 expect(await (await call('preferences',undefined,{cookie})).json()).toEqual({backgroundColor:'#ABCDEF',themeConfig:null});
 expect(sql.prepare('SELECT theme_config FROM user_preferences').get()!.theme_config).toBeNull();
});

it('saves every new preset and its custom colors without changing account permissions',async()=>{
 const cookie=await activate(),before=sql.prepare('SELECT * FROM users ORDER BY id').all();
 for(const palette of ['oro','argento','multicolore','bianco-elegante','scuro','rosso','verde']){
  const themeConfig={palette,mode:'system',background:'#182735',accent:'#D6B76D'};
  const response=await call('preferences',{backgroundColor:'#182735',themeConfig},{cookie});
  expect(response.status).toBe(200);
  expect(await (await call('preferences',undefined,{cookie})).json()).toEqual({backgroundColor:'#182735',themeConfig});
 }
 expect(sql.prepare('SELECT * FROM users ORDER BY id').all()).toEqual(before);
});

it('persists all eight approved personal palettes for every role without changing users or permissions',async()=>{
 const ownerCookie=await activate(),sessions=[{cookie:ownerCookie}];
 for(const role of ['Admin','User']){
  const username='approved-'+role.toLowerCase();
  expect((await call('users',{name:role,email:username+'@example.com',username,role,password:'abcdefgh'},{cookie:ownerCookie})).status).toBe(201);
  const response=await call('auth/login',{email:username,password:'abcdefgh'},{visitor:username});
  sessions.push({cookie:response.headers.get('set-cookie')!.split(';')[0],visitor:username} as any);
 }
 const users=sql.prepare('SELECT * FROM users ORDER BY id').all();
 for(const session of sessions)for(const palette of APPROVED_THEME_PALETTES){
  const themeConfig={palette:palette.id,mode:'dark'};
  expect((await call('preferences',{backgroundColor:palette.background,themeConfig},session)).status).toBe(200);
  expect(await (await call('preferences',undefined,session)).json()).toEqual({backgroundColor:palette.background,themeConfig});
 }
 expect(sql.prepare('SELECT * FROM users ORDER BY id').all()).toEqual(users);
});
