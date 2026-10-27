import {vapidAuthorization,sendEmptyPush,nextPushTime} from 'push.js';
function check(ok,message){if(!ok)throw Error(message);}
const decode=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export default{async test(){
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),jwk=await crypto.subtle.exportKey('jwk',pair.privateKey);
 const endpoint='https://web.push.apple.com/runtime-synthetic',now=Date.parse('2026-10-27T07:30:00Z');
 const authorization=await vapidAuthorization(endpoint,jwk,'mailto:test@example.test',now),token=authorization.split('t=')[1].split(',')[0],parts=token.split('.');
 check(decode(parts[2]).length===64,'VAPID ES256 signature must use raw 64-byte encoding');
 check(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pair.publicKey,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])),'VAPID signature invalid in workerd');
 check(new Date(nextPushTime(Date.parse('2026-07-01T00:00Z'),'08:30','Europe/Rome').at).toISOString()==='2026-07-01T06:30:00.000Z','Summer timezone scheduling failed');
 const original=globalThis.fetch;let called=0;
 try{
  globalThis.fetch=async(url,init)=>{const request=new Request(url,init);called++;check(request.redirect==='manual','Unsupported or unsafe redirect mode');check(!init.body,'Reminder must not transmit personal payloads');check(request.headers.get('authorization')?.startsWith('vapid t='),'Missing VAPID header');return new Response(null,{status:201});};
  check(await sendEmptyPush({PUSH_VAPID_PRIVATE_JWK:JSON.stringify(jwk),PUSH_VAPID_SUBJECT:'mailto:test@example.test'},endpoint,'runtime',now)===201,'Send failed');check(called===1,'Unexpected retry');
 }finally{globalThis.fetch=original;}
}};
