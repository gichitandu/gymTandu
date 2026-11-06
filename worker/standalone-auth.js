// Standalone Cloudflare Pages authentication boundary.
// This module is intentionally separate from the ChatGPT Sites authentication.
// A Pages Function can use it only after D1 migrations, CSRF, archive and
// integration tests have passed. Never trust oai-* headers from the internet.
const COOKIE='__Host-gymtrack';
const TTL_SECONDS=60*60*24*30;
const enc=new TextEncoder();
const hex=bytes=>[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
const sha256=async value=>hex(await crypto.subtle.digest('SHA-256',enc.encode(value)));
const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export function validateSameOrigin(request){
 const url=new URL(request.url);
 if(!['GET','HEAD','OPTIONS'].includes(request.method)){
  if(request.headers.get('origin')!==url.origin)return false;
  const fetchSite=request.headers.get('sec-fetch-site');
  if(fetchSite&&fetchSite!=='same-origin'&&fetchSite!=='none')return false;
 }
 return true;
}
export function cookieToken(request){
 const value=request.headers.get('cookie')||'';
 return value.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||null;
}
export async function standaloneSession(request,db){
 const token=cookieToken(request);
 if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
 return db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND s.visitor_id=? AND u.active=1')
  .bind(await sha256(token),Date.now(),'standalone').first();
}
export async function createStandaloneSession(db,user){
 const token=randomToken(),now=Date.now();
 await db.batch([
  db.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now),
  db.prepare('INSERT INTO sessions(token_hash,user_id,visitor_id,expires_at) VALUES(?,?,?,?)')
   .bind(await sha256(token),user.id,'standalone',now+TTL_SECONDS*1000)
 ]);
 return {cookie:`${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${TTL_SECONDS}`};
}
export async function destroyStandaloneSession(request,db){
 const token=cookieToken(request);
 if(token&&/^[a-f0-9]{64}$/.test(token))
  await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run();
 return `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
}
export async function throttleLogin(request,db){
 // Hash the network address: do not persist the raw IP or trust client headers.
 // CF-Connecting-IP is only meaningful after Cloudflare has terminated TLS.
 const address=request.headers.get('cf-connecting-ip');
 if(!address)throw Object.assign(new Error('Identità rete non verificabile.'),{status:503});
 const key=await sha256('standalone-login:'+address),now=Date.now();
 await db.prepare('INSERT INTO login_limits(id,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN reset_at<? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END').bind(key,now+900000,now,now).run();
 const row=await db.prepare('SELECT attempts FROM login_limits WHERE id=?').bind(key).first();
 if(row.attempts>10)throw Object.assign(new Error('Troppi tentativi. Riprova tra 15 minuti.'),{status:429});
 return key;
}
export async function clearLoginThrottle(db,key){
 await db.prepare('DELETE FROM login_limits WHERE id=?').bind(key).run();
}
