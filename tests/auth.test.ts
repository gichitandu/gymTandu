import { beforeEach, afterEach, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { api } from '../worker/index.js';
let sql: DatabaseSync;
let env: any;
const origin='https://gymtrack.test';
const owner='giacomotanduo004@gmail.com';
function request(path:string,body?:unknown,opts:{cookie?:string;email?:string;visitor?:string;method?:string;origin?:string}={}) {
 return new Request(origin+'/api/'+path,{method:opts.method||(body?'POST':'GET'),headers:{'oai-authenticated-user-id':opts.visitor||'owner-visitor','oai-authenticated-user-email':opts.email||owner,...(body?{'Content-Type':'application/json',Origin:opts.origin||origin}:{}),...(opts.cookie?{Cookie:opts.cookie}:{})},body:body?JSON.stringify(body):undefined});
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
 const me=await (await call('auth/me',undefined,{cookie})).json();expect(me.user.role).toBe('SuperAdmin');
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
 const base=await (await call('catalog',undefined,{cookie})).json();expect(base.exercises).toHaveLength(161);expect(base.muscleGroups).toHaveLength(8);expect(base.exercises.every((e:any)=>e.videoUrl==='')).toBe(true);
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
