import {beforeEach,afterEach,it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {api} from '../worker/index.js';
const origin='https://gymtrack.test',owner='giacomotanduo004@gmail.com';
let sql:DatabaseSync,env:any;
function request(path:string,body?:unknown,options:{cookie?:string;visitor?:string;origin?:string;method?:string}={}){
 return new Request(origin+'/api/'+path,{method:options.method||(body===undefined?'GET':'POST'),headers:{'oai-authenticated-user-id':options.visitor||'owner','oai-authenticated-user-email':owner,...(body===undefined?{}:{Origin:options.origin||origin,'Content-Type':'application/json'}),...(options.cookie?{Cookie:options.cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
const call=(path:string,body?:unknown,options:any={})=>api(request(path,body,options),env);
async function activate(){const response=await call('auth/setup',{password:'owner-password-123'});expect(response.status).toBe(200);return response.headers.get('set-cookie')!.split(';')[0];}
beforeEach(()=>{
 sql=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
 env={DB:{prepare:(query:string)=>{let args:any[]=[];const statement={bind:(...values:any[])=>{args=values;return statement;},first:async()=>sql.prepare(query).get(...args),all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}})};return statement;},batch:async(statements:any[])=>{sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}}};
});
afterEach(()=>sql.close());
it('lets signed-out Sites visitors discover a release without exposing account data or bypassing Sites',async()=>{
 const response=await call('app-release');expect(response.status).toBe(200);expect(await response.json()).toEqual({buildId:'development',requestedBuildId:null,generation:0,requestedAt:null});
 expect(response.headers.get('cache-control')).toContain('no-store');
 const noIdentity=new Request(origin+'/api/app-release');expect((await api(noIdentity,env)).status).toBe(401);
});
it('allows only a server-verified SuperAdmin to request the current published build and makes duplicate clicks idempotent',async()=>{
 const cookie=await activate();
 for(const role of ['Admin','User']){
  await call('users',{name:role,email:role.toLowerCase()+'@test.com',username:role.toLowerCase(),role,password:'abcdefgh'},{cookie});
  const response=await call('auth/login',{email:role.toLowerCase()+'@test.com',password:'abcdefgh'},{visitor:role});const clientCookie=response.headers.get('set-cookie')!.split(';')[0];
  expect((await call('app-release',{role:'SuperAdmin',buildId:'forged',url:'https://other.test'},{cookie:clientCookie,visitor:role})).status).toBe(403);
 }
 expect((await call('app-release',{},{})).status).toBe(401);
 const first=await call('app-release',{buildId:'forged',url:'https://other.test'},{cookie});expect(first.status).toBe(200);const release=await first.json();
 expect(release.requestedBuildId).toBe('development');expect(release.generation).toBe(1);
 const second=await (await call('app-release',{},{cookie})).json();expect(second).toEqual(release);
 expect(sql.prepare('SELECT COUNT(*) AS n FROM app_releases').get()!.n).toBe(1);
});
it('rejects cross-origin release requests and revoked sessions',async()=>{
 const cookie=await activate();expect((await call('app-release',{},{cookie,origin:'https://other.test'})).status).toBe(403);
 await call('auth/logout',{},{cookie});expect((await call('app-release',{},{cookie})).status).toBe(401);
 expect((await (await call('app-release')).json()).generation).toBe(0);
});
