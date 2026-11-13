// Allenamento in gruppo: una seduta condivisa in tempo quasi reale tra più account.
// Chi la crea riceve un codice di 6 cifre e un link di invito; gli altri entrano con
// l'uno o con l'altro. Sul server restano solo esercizi e avanzamento della seduta in
// corso: le serie vere di ognuno continuano a vivere nel suo archivio personale.
export const GROUP_TTL_MS=8*60*60*1000;
export const GROUP_MAX_MEMBERS=8;
export const GROUP_MAX_REGISTRATIONS=5;
const GROUP_MAX_EXERCISES=40;
const GROUP_BODY_LIMIT=32768;
const GROUP_ID=/^[a-zA-Z0-9_-]{1,150}$/;
function groupReply(data,status=200){return Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
function groupFail(message,status=400){throw Object.assign(new Error(message),{status});}
const groupText=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const groupInt=(value,min,max,fallback)=>Number.isInteger(value)&&value>=min&&value<=max?value:fallback;
/** Riduce l'elenco inviato dal client ai soli campi previsti, con limiti espliciti. */
export function groupExercises(list){
 if(!Array.isArray(list)||list.length>GROUP_MAX_EXERCISES)groupFail('Elenco esercizi non valido.');
 return list.map((raw,index)=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))groupFail('Elenco esercizi non valido.');
  const name=groupText(raw.name,100);
  if(typeof raw.exerciseId!=='string'||!GROUP_ID.test(raw.exerciseId)||!name)groupFail('Esercizio non valido.');
  if(!['external','bodyweight','weighted-bodyweight','assisted'].includes(raw.loadMode))groupFail('Esercizio non valido.');
  const repsMin=groupInt(raw.repsMin,1,999,8),total=groupInt(raw.total,0,60,0);
  const item={exerciseId:raw.exerciseId,name,loadMode:raw.loadMode,order:groupInt(raw.order,0,10000,index),
   muscleGroupId:typeof raw.muscleGroupId==='string'&&GROUP_ID.test(raw.muscleGroupId)?raw.muscleGroupId:'',muscleGroupName:groupText(raw.muscleGroupName,80),equipment:groupText(raw.equipment,80),
   sets:groupInt(raw.sets,1,30,3),warmupSets:groupInt(raw.warmupSets,0,5,0),repsMin,repsMax:Math.max(repsMin,groupInt(raw.repsMax,1,999,repsMin)),rest:groupInt(raw.rest,0,3600,90),
   done:Math.min(total,groupInt(raw.done,0,60,0)),total};
  if(['A','B','C','D'].includes(raw.superset))item.superset=raw.superset;
  if(raw.last&&typeof raw.last==='object'&&Number.isFinite(raw.last.weight)&&raw.last.weight>=0&&raw.last.weight<=2000&&Number.isInteger(raw.last.reps)&&raw.last.reps>=1&&raw.last.reps<=999)item.last={weight:raw.last.weight,reps:raw.last.reps};
  return item;
 });
}
async function groupBody(request){
 const declared=request.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>GROUP_BODY_LIMIT))groupFail('Richiesta troppo grande.',413);
 let text;try{text=await request.text();}catch{groupFail('Richiesta non valida.');}
 if(text.length>GROUP_BODY_LIMIT)groupFail('Richiesta troppo grande.',413);
 let body;try{body=JSON.parse(text);}catch{groupFail('Richiesta non valida.');}
 if(!body||typeof body!=='object'||Array.isArray(body))groupFail('Richiesta non valida.');
 return body;
}
function groupCode(){
 const bytes=new Uint32Array(1);
 // Scarta i valori oltre l'ultimo multiplo intero: ogni codice resta equiprobabile.
 do crypto.getRandomValues(bytes);while(bytes[0]>=4294000000);
 return String(bytes[0]%1000000).padStart(6,'0');
}
function groupToken(){return [...crypto.getRandomValues(new Uint8Array(24))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const groupValidToken=value=>typeof value==='string'&&/^[0-9a-f]{48}$/.test(value);
/** Invito ancora utilizzabile: gruppo aperto e non scaduto. Usato anche dalla registrazione. */
export async function groupInvite(db,token,now=Date.now()){
 if(!groupValidToken(token))return null;
 return await db.prepare('SELECT g.*,u.name AS host_name FROM group_sessions g JOIN users u ON u.id=g.host_id WHERE g.invite_token=? AND g.ended_at IS NULL AND g.expires_at>?').bind(token,now).first()||null;
}
/** Riserva uno dei posti di registrazione dell'invito; false quando sono esauriti. */
export async function groupReserveRegistration(db,sessionId){
 const result=await db.prepare('UPDATE group_sessions SET registrations=registrations+1 WHERE id=? AND registrations<?').bind(sessionId,GROUP_MAX_REGISTRATIONS).run();
 return !!result.meta.changes;
}
async function groupState(db,sessionId,me,now){
 const session=await db.prepare('SELECT * FROM group_sessions WHERE id=?').bind(sessionId).first();
 if(!session)return null;
 const rows=(await db.prepare('SELECT * FROM group_members WHERE session_id=? ORDER BY joined_at').bind(sessionId).all()).results;
 if(!rows.some(row=>row.user_id===me.id&&!row.left_at))return null;
 const host=session.host_id===me.id,ended=!!session.ended_at||session.expires_at<=now;
 return {id:session.id,dayName:session.day_name,hostId:session.host_id,ended,expiresAt:session.expires_at,serverTime:now,
  // Codice e link servono per invitare: li vede solo chi ha creato il gruppo.
  ...(host&&!ended?{code:session.code,inviteToken:session.invite_token}:{}),
  members:rows.filter(row=>!row.left_at).map(row=>{let payload={};try{payload=JSON.parse(row.payload)||{};}catch{}
   return {id:row.user_id,name:row.name,host:row.user_id===session.host_id,me:row.user_id===me.id,mode:row.mode,exercises:Array.isArray(payload.exercises)?payload.exercises:[],current:typeof payload.current==='string'?payload.current:'',finished:payload.finished===true,updatedAt:row.updated_at};})};
}
async function groupCurrent(db,me,now){
 const row=await db.prepare('SELECT m.session_id FROM group_members m JOIN group_sessions g ON g.id=m.session_id WHERE m.user_id=? AND m.left_at IS NULL AND g.ended_at IS NULL AND g.expires_at>? ORDER BY m.joined_at DESC LIMIT 1').bind(me.id,now).first();
 return row?groupState(db,row.session_id,me,now):null;
}
/** Un account partecipa a un solo gruppo aperto alla volta. */
async function groupLeaveOthers(db,me,keepId,now){
 await db.batch([
  db.prepare('UPDATE group_sessions SET ended_at=? WHERE host_id=? AND ended_at IS NULL AND id<>?').bind(now,me.id,keepId),
  db.prepare('UPDATE group_members SET left_at=? WHERE user_id=? AND left_at IS NULL AND session_id<>?').bind(now,me.id,keepId)
 ]);
}
export async function groupApi(request,env,me,deps={}){
 try{
  const url=new URL(request.url),path=url.pathname,db=env.DB,now=Date.now();
  if(path==='/api/group/invite'){
   // Anteprima per chi apre il link prima di accedere: solo nome di chi invita e della seduta.
   if(request.method!=='GET')groupFail('Metodo non supportato.',405);
   const invite=await groupInvite(db,url.searchParams.get('token'),now);
   return groupReply(invite?{valid:true,hostName:invite.host_name,dayName:invite.day_name,registrationOpen:invite.registrations<GROUP_MAX_REGISTRATIONS}:{valid:false});
  }
  if(!me)groupFail('Accedi al tuo account per allenarti in gruppo.',401);
  if(path==='/api/group'){
   if(request.method!=='GET')groupFail('Metodo non supportato.',405);
   const id=url.searchParams.get('id');
   return groupReply({session:id?await groupState(db,id,me,now):await groupCurrent(db,me,now)});
  }
  if(request.method!=='POST')groupFail('Metodo non supportato.',405);
  const body=await groupBody(request);
  if(path==='/api/group/create'){
   const dayName=groupText(body.dayName,200),exercises=groupExercises(body.exercises);
   if(!dayName||!exercises.length)groupFail('Apri prima l’allenamento di oggi: il gruppo parte dalla tua seduta.');
   const id=crypto.randomUUID(),token=groupToken();
   let code='';
   for(let i=0;i<20&&!code;i++){const candidate=groupCode();if(!await db.prepare('SELECT id FROM group_sessions WHERE code=? AND ended_at IS NULL AND expires_at>?').bind(candidate,now).first())code=candidate;}
   if(!code)groupFail('Codice non disponibile. Riprova.',503);
   await groupLeaveOthers(db,me,id,now);
   await db.batch([
    // I gruppi chiusi o scaduti da più di un giorno non servono più a nessuno.
    db.prepare('DELETE FROM group_members WHERE session_id IN (SELECT id FROM group_sessions WHERE expires_at<? OR ended_at<?)').bind(now-86400000,now-86400000),
    db.prepare('DELETE FROM group_sessions WHERE expires_at<? OR ended_at<?').bind(now-86400000,now-86400000),
    db.prepare('INSERT INTO group_sessions(id,code,invite_token,host_id,day_name,created_at,expires_at,ended_at,registrations) VALUES(?,?,?,?,?,?,?,NULL,0)').bind(id,code,token,me.id,dayName,now,now+GROUP_TTL_MS),
    db.prepare('INSERT INTO group_members(session_id,user_id,name,mode,payload,joined_at,updated_at,left_at) VALUES(?,?,?,?,?,?,?,NULL)').bind(id,me.id,me.name,'host',JSON.stringify({exercises,current:'',finished:false}),now,now)
   ]);
   return groupReply({session:await groupState(db,id,me,now)},201);
  }
  if(path==='/api/group/join'){
   let session=null;
   if(body.token!==undefined)session=await groupInvite(db,body.token,now);
   else{
    // Il codice è corto: i tentativi sono contati per account, come per il login.
    if(deps.attempt)await deps.attempt(db,'group:'+me.id);
    if(typeof body.code!=='string'||!/^\d{6}$/.test(body.code))groupFail('Inserisci il codice di 6 cifre.');
    session=await db.prepare('SELECT * FROM group_sessions WHERE code=? AND ended_at IS NULL AND expires_at>?').bind(body.code,now).first();
   }
   if(!session)groupFail(body.token!==undefined?'Invito non valido o scaduto. Chiedi un nuovo link.':'Codice non valido o gruppo già chiuso.',404);
   if(body.token===undefined)await db.prepare('DELETE FROM login_limits WHERE id=?').bind('group:'+me.id).run();
   const existing=await db.prepare('SELECT left_at FROM group_members WHERE session_id=? AND user_id=?').bind(session.id,me.id).first();
   if(!existing||existing.left_at){
    const count=await db.prepare('SELECT COUNT(*) AS n FROM group_members WHERE session_id=? AND left_at IS NULL').bind(session.id).first();
    if(count.n>=GROUP_MAX_MEMBERS)groupFail('Il gruppo è al completo.',409);
    await groupLeaveOthers(db,me,session.id,now);
    await db.prepare('INSERT INTO group_members(session_id,user_id,name,mode,payload,joined_at,updated_at,left_at) VALUES(?,?,?,?,?,?,?,NULL) ON CONFLICT(session_id,user_id) DO UPDATE SET left_at=NULL,name=excluded.name,mode=excluded.mode,payload=excluded.payload,joined_at=excluded.joined_at,updated_at=excluded.updated_at').bind(session.id,me.id,me.name,session.host_id===me.id?'host':'',JSON.stringify({exercises:[],current:'',finished:false}),now,now).run();
   }
   return groupReply({session:await groupState(db,session.id,me,now)});
  }
  if(typeof body.id!=='string'||!GROUP_ID.test(body.id))groupFail('Gruppo non valido.');
  const member=await db.prepare('SELECT m.*,g.host_id,g.ended_at,g.expires_at FROM group_members m JOIN group_sessions g ON g.id=m.session_id WHERE m.session_id=? AND m.user_id=? AND m.left_at IS NULL').bind(body.id,me.id).first();
  if(!member)groupFail('Non fai più parte di questo gruppo.',404);
  if(path==='/api/group/leave'){
   // Chi ha creato il gruppo lo chiude per tutti; gli altri escono soltanto.
   await db.batch([
    db.prepare('UPDATE group_members SET left_at=? WHERE session_id=? AND user_id=?').bind(now,body.id,me.id),
    ...(member.host_id===me.id?[db.prepare('UPDATE group_sessions SET ended_at=? WHERE id=? AND ended_at IS NULL').bind(now,body.id)]:[])
   ]);
   return groupReply({session:null});
  }
  if(path==='/api/group/update'){
   if(member.ended_at||member.expires_at<=now)return groupReply({session:await groupState(db,body.id,me,now)});
   let payload={};try{payload=JSON.parse(member.payload)||{};}catch{}
   let mode=member.mode;
   if(body.mode!==undefined){
    if(member.host_id===me.id||!['same','match'].includes(body.mode))groupFail('Modalità non valida.');
    mode=body.mode;
   }
   if(body.exercises!==undefined)payload.exercises=groupExercises(body.exercises);
   if(body.current!==undefined)payload.current=typeof body.current==='string'&&GROUP_ID.test(body.current)?body.current:'';
   if(body.finished!==undefined)payload.finished=body.finished===true;
   await db.prepare('UPDATE group_members SET mode=?,payload=?,updated_at=? WHERE session_id=? AND user_id=?').bind(mode,JSON.stringify(payload),now,body.id,me.id).run();
   return groupReply({session:await groupState(db,body.id,me,now)});
  }
  groupFail('Operazione non trovata.',404);
 }catch(error){
  return groupReply({error:error.status?error.message:'Servizio non disponibile. Riprova.'},error.status||503);
 }
}
