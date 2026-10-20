import { beforeEach, afterEach, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
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
 sql=new DatabaseSync(':memory:');sql.exec(readFileSync('drizzle/0000_abandoned_human_torch.sql','utf8'));
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
  expect((await call('users',{name:role,email,role,password:'a-secure-password-123'},{cookie})).status).toBe(201);
  const login=await call('auth/login',{email,password:'a-secure-password-123'},{visitor:role,email});const c=login.headers.get('set-cookie')!.split(';')[0];
  const opts={cookie:c,visitor:role,email};
  expect((await call('users',undefined,opts)).status).toBe(403);
  expect((await call('users',{name:'Fake',email:'fake@example.com',role:'SuperAdmin',password:'a-secure-password-123'},opts)).status).toBe(403);
  expect((await call('users/anything',{role:'SuperAdmin'}, {...opts,method:'PATCH'})).status).toBe(403);
 }
});
it('isolates sessions by platform visitor and revokes sessions when an account is disabled',async()=>{
 const cookie=await activate();
 await call('users',{name:'Client',email:'client@example.com',role:'User',password:'a-secure-password-123'},{cookie});
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
