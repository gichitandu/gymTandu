import { defaultExercises, defaultGroups } from './default-catalog.js';
// The platform's ChatGPT access boundary remains in place. App sessions are
// additionally bound to that authenticated visitor, and never stored in JS.
const OWNER = 'giacomotanduo004@gmail.com';
const COOKIE = '__Host-gymtrack';
const TTL = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:100000},key,256));
}
function equal(a, b) { if(a.length !== b.length) return false; let d=0; for(let i=0;i<a.length;i++) d |= a.charCodeAt(i)^b.charCodeAt(i); return d===0; }
function json(data, status=200, headers={}) { return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}}); }
function fail(message,status=400) { throw Object.assign(new Error(message),{status}); }
const publicUser = u => ({id:u.id,email:u.email,name:u.name,role:u.role,active:!!u.active,owner:u.email===OWNER});
function validPassword(p) { if(typeof p!=='string'||p.length<8||p.length>128) fail('Usa una password da 8 a 128 caratteri.'); }
function fields(body) {
  const email=String(body.email||'').trim().toLowerCase(), name=String(body.name||'').trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254) fail('Email non valida.');
  if(!name||name.length>80) fail('Inserisci un nome entro 80 caratteri.');
  if(!['Admin','User'].includes(body.role)) fail('Seleziona Admin o Cliente.');
  return {email,name,role:body.role};
}
async function session(request,db) {
  const token=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!token) return null;
  return db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND s.visitor_id=? AND u.active=1').bind(await digest(token),Date.now(),request.headers.get('oai-authenticated-user-id')||'').first();
}
async function startSession(request,db,u) {
  const token=random(), at=Date.now();
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at<?').bind(at),
    db.prepare('INSERT INTO sessions(token_hash,user_id,visitor_id,expires_at) VALUES(?,?,?,?)').bind(await digest(token),u.id,request.headers.get('oai-authenticated-user-id')||'',at+TTL*1000)
  ]);
  return json({user:publicUser(u)},200,{'Set-Cookie':`${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${TTL}`});
}
async function catalog(db) {
  const [ex, groups] = await Promise.all([db.prepare('SELECT payload FROM catalog_exercises').all(),db.prepare('SELECT id,name FROM catalog_groups').all()]);
  const exercises=new Map(defaultExercises.map(e=>[e.id,e]));
  for(const row of ex.results) {const e=JSON.parse(row.payload);exercises.set(e.id,e);}
  const muscleGroups=new Map(defaultGroups.map(g=>[g.id,g]));
  for(const g of groups.results) muscleGroups.set(g.id,g);
  return {exercises:[...exercises.values()],muscleGroups:[...muscleGroups.values()]};
}
const isEditor = user => user && ['Admin','SuperAdmin'].includes(user.role);
function validHttps(value) {try {return new URL(value).protocol==='https:';}catch{return false;}}
function exerciseFields(b,groups) {
  const e={id:b.id,name:String(b.name||'').trim(),muscleGroupId:b.muscleGroupId,secondaryMuscleIds:b.secondaryMuscleIds||[],description:String(b.description||''),equipment:String(b.equipment||'').trim(),tags:b.tags||[],active:b.active,loadMode:b.loadMode,videoUrl:b.videoUrl||'',thumbnailUrl:b.thumbnailUrl||'',imageData:b.imageData||''};
  if(typeof e.id!=='string'||! /^[a-zA-Z0-9_-]{1,150}$/.test(e.id)||!e.name||e.name.length>100||!e.equipment||e.equipment.length>80||e.description.length>2000||typeof e.active!=='boolean') fail('Dati esercizio non validi.');
  if(!groups.some(g=>g.id===e.muscleGroupId)||!Array.isArray(e.secondaryMuscleIds)||e.secondaryMuscleIds.length>20||e.secondaryMuscleIds.some(id=>!groups.some(g=>g.id===id))) fail('Gruppo muscolare non valido.');
  if(!['external','bodyweight','weighted-bodyweight','assisted'].includes(e.loadMode)||!Array.isArray(e.tags)||e.tags.length>20||e.tags.some(t=>typeof t!=='string'||t.length>80)) fail('Dati esercizio non validi.');
  if(e.videoUrl && (!validHttps(e.videoUrl)||e.videoUrl.length>1000)) fail('Inserisci un link video HTTPS valido.');
  if(e.thumbnailUrl && (!validHttps(e.thumbnailUrl)||e.thumbnailUrl.length>1000)) fail('Immagine non valida.');
  if(typeof e.imageData!=='string'||e.imageData.length>2800000||e.imageData && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(e.imageData)) fail('Immagine non valida.');
  if(e.active && !e.videoUrl) fail('Per attivare l’esercizio inserisci un video dimostrativo.');
  return e;
}
export async function api(request,env) {
  try {
    const url=new URL(request.url), path=url.pathname, db=env.DB;
    if(!db) fail('Servizio account non ancora configurato.',503);
    // Never replace or bypass Sites authentication, including for bootstrap.
    if(!request.headers.get('oai-authenticated-user-id')) fail('Accedi prima con ChatGPT.',401);
    if(request.method!=='GET' && request.headers.get('origin')!==url.origin) fail('Richiesta non autorizzata.',403);
    if(request.method!=='GET' && !request.headers.get('content-type')?.startsWith('application/json')) fail('Formato non supportato.',415);
    const me=await session(request,db);
    if(path==='/api/auth/me'&&request.method==='GET') {
      const owner=await db.prepare('SELECT id FROM users WHERE email=?').bind(OWNER).first();
      return json({user:me?publicUser(me):null,setup:!owner && request.headers.get('oai-authenticated-user-email')?.toLowerCase()===OWNER,ownerEmail:OWNER});
    }
    if(request.method==='GET'&&path==='/api/catalog') {
      if(!me) fail('Accedi per consultare gli esercizi.',401);
      const data=await catalog(db);
      if(!isEditor(me)) data.exercises=data.exercises.filter(e=>e.active);
      return json(data);
    }
    if(request.method==='GET'&&path==='/api/preferences') {
      if(!me) fail('Accedi per caricare il tema.',401);
      const p=await db.prepare('SELECT background_color FROM user_preferences WHERE user_id=?').bind(me.id).first();
      return json({backgroundColor:p?.background_color||'#050b12'});
    }
    if(request.method==='GET'&&path==='/api/users') {
      if(me?.role!=='SuperAdmin') fail('Accesso riservato al Super Admin.',403);
      const rows=await db.prepare('SELECT * FROM users ORDER BY created_at').all();
      return json({users:rows.results.map(publicUser)});
    }
    if(request.method==='GET') fail('Pagina non trovata.',404);
    const bodyLimit=path==='/api/catalog/exercise'?3000000:8192;
    if(Number(request.headers.get('content-length')||0)>bodyLimit) fail('Richiesta troppo grande.',413);
    const raw=await request.text(); if(raw.length>bodyLimit) fail('Richiesta troppo grande.',413);
    let b; try { b=JSON.parse(raw); } catch { fail('Richiesta non valida.'); }
    if(path==='/api/auth/setup'&&request.method==='POST') {
      if(request.headers.get('oai-authenticated-user-email')?.toLowerCase()!==OWNER) fail('Solo il proprietario può attivare il Super Admin.',403);
      validPassword(b.password); const salt=random(), hash=await passwordHash(b.password,salt);
      const u={id:crypto.randomUUID(),email:OWNER,name:'Giacomo Tanduo',role:'SuperAdmin',active:1};
      const result=await db.prepare('INSERT OR IGNORE INTO users(id,email,name,role,active,salt,password_hash,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(u.id,u.email,u.name,u.role,1,salt,hash,Date.now()).run();
      if(!result.meta.changes) fail('Account già attivato. Accedi con la password.',409);
      return startSession(request,db,u);
    }
    if(path==='/api/auth/login'&&request.method==='POST') {
      const email=String(b.email||'').trim().toLowerCase(), password=String(b.password||'');
      if(email.length>254||password.length>128) fail('Credenziali non valide.',401);
      // One shared throttle key per platform visitor stops unknown-email flooding too.
      const key=request.headers.get('oai-authenticated-user-id'), now=Date.now();
      await db.prepare('INSERT INTO login_limits(id,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN reset_at<? THEN 1 ELSE attempts+1 END, reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END').bind(key,now+900000,now,now).run();
      const limit=await db.prepare('SELECT attempts FROM login_limits WHERE id=?').bind(key).first();
      if(limit.attempts>10) fail('Troppi tentativi. Riprova tra 15 minuti.',429);
      const u=await db.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
      const hash=await passwordHash(password,u?.salt||'unknown-account-dummy-salt');
      if(!u||!u.active||!equal(hash,u.password_hash)) fail('Email o password non valide.',401);
      await db.prepare('DELETE FROM login_limits WHERE id=?').bind(key).run();
      return startSession(request,db,u);
    }
    if(path==='/api/auth/logout'&&request.method==='POST') {
      const token=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
      if(token) await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();
      return json({ok:true},200,{'Set-Cookie':`${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`});
    }
    if(!me) fail('Sessione scaduta. Accedi di nuovo.',401);
    if(path==='/api/preferences'&&request.method==='POST') {
      if(typeof b.backgroundColor!=='string'||!/^#[0-9a-fA-F]{6}$/.test(b.backgroundColor)) fail('Colore non valido.');
      await db.prepare('INSERT INTO user_preferences(user_id,background_color) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET background_color=excluded.background_color').bind(me.id,b.backgroundColor).run();
      return json({backgroundColor:b.backgroundColor});
    }
    if(path==='/api/catalog/exercise'&&request.method==='POST') {
      if(!isEditor(me)) fail('Solo Admin e Super Admin possono modificare il catalogo.',403);
      const data=await catalog(db), old=data.exercises.find(e=>e.id===b.id), e=exerciseFields(b,data.muscleGroups);
      e.createdAt=old?.createdAt||new Date().toISOString();
      if(old?.videoUrl===e.videoUrl) {e.videoTitle=old.videoTitle;e.videoChannel=old.videoChannel;}
      await db.prepare('INSERT INTO catalog_exercises(id,payload,active,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,active=excluded.active,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(e.id,JSON.stringify(e),e.active?1:0,me.id,Date.now()).run();
      return json({exercise:e});
    }
    if(path==='/api/catalog/group'&&request.method==='POST') {
      if(!isEditor(me)) fail('Solo Admin e Super Admin possono modificare i gruppi.',403);
      const id=b.id, name=String(b.name||'').trim();
      if(typeof id!=='string'||! /^[a-zA-Z0-9_-]{1,150}$/.test(id)||!name||name.length>80) fail('Gruppo non valido.');
      await db.prepare('INSERT INTO catalog_groups(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').bind(id,name).run();
      return json({ok:true});
    }
    if(path==='/api/auth/password'&&request.method==='POST') {
      validPassword(b.password);
      if(!equal(await passwordHash(String(b.currentPassword||''),me.salt),me.password_hash)) fail('Password attuale errata.',403);
      const salt=random();
      await db.batch([db.prepare('UPDATE users SET salt=?,password_hash=? WHERE id=?').bind(salt,await passwordHash(b.password,salt),me.id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(me.id)]);
      return startSession(request,db,me);
    }
    if(me.role!=='SuperAdmin') fail('Accesso riservato al Super Admin.',403);
    if(path==='/api/users'&&request.method==='POST') {
      const u=fields(b); validPassword(b.password);
      if(u.email===OWNER) fail('Account proprietario già riservato.',409);
      const salt=random();
      const existing=await db.prepare('SELECT id FROM users WHERE email=?').bind(u.email).first();
      if(existing) fail('Questa email è già registrata.',409);
      await db.prepare('INSERT INTO users(id,email,name,role,active,salt,password_hash,created_at) VALUES(?,?,?,?,1,?,?,?)').bind(crypto.randomUUID(),u.email,u.name,u.role,salt,await passwordHash(b.password,salt),Date.now()).run();
      return json({ok:true},201);
    }
    if(path.startsWith('/api/users/')&&request.method==='PATCH') {
      const id=path.slice('/api/users/'.length), target=await db.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
      if(!target) fail('Utente non trovato.',404);
      if(target.email===OWNER||target.id===me.id) fail('Il Super Admin proprietario è protetto.',403);
      const u=fields(b);
      if(u.email===OWNER) fail('Email riservata al proprietario.');
      if(typeof b.active!=='boolean') fail('Stato non valido.');
      const salt=b.password?random():target.salt;
      if(b.password) validPassword(b.password);
      const hash=b.password?await passwordHash(b.password,salt):target.password_hash;
      await db.batch([db.prepare('UPDATE users SET name=?,email=?,role=?,active=?,salt=?,password_hash=? WHERE id=?').bind(u.name,u.email,u.role,b.active?1:0,salt,hash,id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(id)]);
      return json({ok:true});
    }
    fail('Operazione non trovata.',404);
  } catch(e) { return json({error:e.status?e.message:'Servizio non disponibile. Riprova.'},e.status||503); }
}
// __ASSETS__ is replaced by the build, keeping this deployment dependency-free.
const assets = /* __ASSETS__ */ {};
export default {async fetch(request,env) {
  const path=new URL(request.url).pathname;
  if(path.startsWith('/api/')) return api(request,env);
  if(!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
  const asset=assets[path==='/'?'/index.html':path];
  if(!asset) return new Response('Not found',{status:404});
  return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)),{headers:{'Content-Type':asset.type,'Cache-Control':path==='/ngsw.json'||path==='/index.html'||path==='/'?'no-cache':'public,max-age=3600','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});
}};
