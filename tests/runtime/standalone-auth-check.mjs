import assert from 'node:assert/strict';
import {validateSameOrigin,cookieToken,createStandaloneSession,standaloneSession,destroyStandaloneSession,throttleLogin} from '../../worker/standalone-auth.js';
const url='https://gymtrack-qa.pages.dev/api/auth/login';
const request=(method,origin,headers={})=>new Request(url,{method,headers:{...(origin?{origin}:{}),...headers}});
assert.equal(validateSameOrigin(request('POST','https://attacker.example')),false);
assert.equal(validateSameOrigin(request('POST','https://gymtrack-qa.pages.dev')),true);
assert.equal(validateSameOrigin(request('POST','https://gymtrack-qa.pages.dev',{'sec-fetch-site':'cross-site'})),false);
assert.equal(cookieToken(new Request(url,{headers:{cookie:'foo=bar; __Host-gymtrack=abc; other=1'}})),'abc');
const rows=new Map(),sessions=new Map(),attempts=new Map();
const db={
 prepare(sql){
  let args=[];
  return {
   bind(...values){args=values;return this;},
   async first(){
    if(sql.startsWith('SELECT u.*')){const s=sessions.get(args[0]);return s&&s.expires>args[1]&&s.visitor===args[2]?{id:s.userId,active:1}:null;}
    if(sql.startsWith('SELECT attempts'))return {attempts:attempts.get(args[0])||0};
    return null;
   },
   async run(){
    if(sql.startsWith('INSERT INTO sessions'))sessions.set(args[0],{userId:args[1],visitor:args[2],expires:args[3]});
    if(sql.startsWith('DELETE FROM sessions WHERE token_hash'))sessions.delete(args[0]);
    if(sql.startsWith('INSERT INTO login_limits'))attempts.set(args[0],(attempts.get(args[0])||0)+1);
    return {meta:{changes:1}};
   }
  };
 },
 async batch(statements){for(const statement of statements)await statement.run();}
};
const {cookie}=await createStandaloneSession(db,{id:'user-1'});
assert.match(cookie,/HttpOnly; SameSite=Strict/);
const authed=new Request(url,{headers:{cookie:cookie.split(';')[0]}});
assert.equal((await standaloneSession(authed,db)).id,'user-1');
assert.equal(await standaloneSession(new Request(url),db),null);
await destroyStandaloneSession(authed,db);
assert.equal(await standaloneSession(authed,db),null);
const attacker=request('POST','https://gymtrack-qa.pages.dev',{'cf-connecting-ip':'198.51.100.9'});
for(let i=0;i<10;i++)await throttleLogin(attacker,db);
await assert.rejects(()=>throttleLogin(attacker,db),{status:429});
await assert.rejects(()=>throttleLogin(request('POST','https://gymtrack-qa.pages.dev')), {status:503});
console.log('Standalone authentication primitives: PASS');
