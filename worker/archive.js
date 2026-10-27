export const ARCHIVE_LIMIT_BYTES = 50 * 1024 * 1024;
const ARCHIVE_RETAINED_VERSIONS = 10;
const archiveTables = ['profiles','roles','plans','days','planExercises','exercises','muscleGroups','workouts','workoutExercises','sets','settings','meals','scheduledWorkouts','measurements','exercisePreferences','workoutUi'];
const archiveRowLimits={profiles:1,roles:3,plans:10000,days:100000,planExercises:100000,exercises:10000,muscleGroups:1000,workouts:100000,workoutExercises:300000,sets:1000000,settings:1,meals:10000,scheduledWorkouts:10000,measurements:10000,exercisePreferences:10000,workoutUi:1};
function archiveJson(data, status=200, headers={}) { return Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...headers}}); }
function archiveFail(message,status=400) { throw Object.assign(new Error(message),{status}); }
async function archiveDigest(value) { const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join(''); }
function archiveRevision(value) {
 const match=/^(?:"(\d+)"|(\d+))$/.exec(value||'');
 const revision=match?Number(match[1]||match[2]):NaN;
 if(!Number.isSafeInteger(revision)||revision<0||revision>=Number.MAX_SAFE_INTEGER)archiveFail('Indica la revisione della copia da aggiornare.',428);
 return revision;
}
async function archiveBody(request) {
 const declared=Number(request.headers.get('content-length')||0);
 if(declared>ARCHIVE_LIMIT_BYTES)archiveFail('La copia supera il limite di 50 MB.',413);
 const reader=request.body?.getReader();if(!reader)archiveFail('Copia archivio mancante.');
 const decoder=new TextDecoder('utf-8',{fatal:true}),parts=[];let bytes=0;
 try {
  for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>ARCHIVE_LIMIT_BYTES){await reader.cancel();archiveFail('La copia supera il limite di 50 MB.',413);}parts.push(decoder.decode(part.value,{stream:true}));}
  parts.push(decoder.decode());
 } catch(error) {if(error.status)throw error;archiveFail('Copia archivio non leggibile.');}
 return {text:parts.join(''),bytes};
}
function archiveValidate(text) {
 let backup;try{backup=JSON.parse(text);}catch{archiveFail('La copia non è un JSON valido.');}
 if(backup?.app!=='GymTrack'||!Number.isInteger(backup.schemaVersion)||backup.schemaVersion<1||typeof backup.exportedAt!=='string'||!Number.isFinite(Date.parse(backup.exportedAt))||!backup.data||typeof backup.data!=='object'||Array.isArray(backup.data))archiveFail('La copia non è un archivio GymTrack valido.');
 // Full domain validation also runs on the client before upload and restore.
 // This boundary rejects partial/garbage snapshots instead of replacing a head.
 for(const name of archiveTables){
  const rows=backup.data[name];
  if(!Array.isArray(rows)||rows.length>archiveRowLimits[name])archiveFail('La copia dell’archivio è incompleta.');
  const ids=new Set();
  for(const row of rows){if(!row||typeof row.id!=='string'||!row.id||row.id.length>150||ids.has(row.id))archiveFail('La copia contiene record non validi.');ids.add(row.id);}
 }
 if(backup.data.profiles.length!==1||backup.data.settings.length!==1||!backup.data.roles.length)archiveFail('La copia dell’archivio è incompleta.');
 const data=backup.data,nonempty=value=>typeof value==='string'&&value.trim().length>0,numeric=value=>Number.isFinite(value)&&value>=0;
 const profile=data.profiles[0],settings=data.settings[0];
 if(profile.id!=='local'||!nonempty(profile.name)||!['SuperAdmin','Admin','User'].includes(profile.role)||settings.id!=='local'||!['dark','light'].includes(settings.theme)||!['kg','lb'].includes(settings.unit)||typeof settings.prefill!=='boolean'||data.roles.length!==3||new Set(data.roles.map(role=>role.name)).size!==3||data.roles.some(role=>!['SuperAdmin','Admin','User'].includes(role.name)))archiveFail('Profilo o impostazioni della copia non validi.');
 const ids=Object.fromEntries(archiveTables.map(name=>[name,new Set(data[name].map(row=>row.id))]));
 for(const plan of data.plans)if(!nonempty(plan.name)||!ids.profiles.has(plan.userId)||typeof plan.active!=='boolean'||typeof plan.archived!=='boolean')archiveFail('Piano della copia non valido.');
 for(const group of data.muscleGroups)if(!nonempty(group.name))archiveFail('Gruppo della copia non valido.');
 for(const exercise of data.exercises)if(!nonempty(exercise.name)||!nonempty(exercise.equipment)||!ids.muscleGroups.has(exercise.muscleGroupId)||!Array.isArray(exercise.secondaryMuscleIds)||exercise.secondaryMuscleIds.some(id=>!ids.muscleGroups.has(id))||!Array.isArray(exercise.tags)||typeof exercise.active!=='boolean'||!['external','bodyweight','weighted-bodyweight','assisted'].includes(exercise.loadMode))archiveFail('Esercizio della copia non valido.');
 for(const day of data.days)if(!nonempty(day.name)||!ids.plans.has(day.planId)||!Number.isInteger(day.order)||day.order<0)archiveFail('Giorno della copia non valido.');
 for(const exercise of data.planExercises)if(!ids.days.has(exercise.dayId)||!ids.exercises.has(exercise.exerciseId)||!Number.isInteger(exercise.sets)||exercise.sets<1||exercise.sets>30||!Number.isInteger(exercise.repsMin)||!Number.isInteger(exercise.repsMax)||exercise.repsMin<1||exercise.repsMax<exercise.repsMin||exercise.repsMax>999||!numeric(exercise.rest))archiveFail('Esercizio del piano della copia non valido.');
 for(const workout of data.workouts)if(!ids.profiles.has(workout.userId)||!nonempty(workout.planName)||!nonempty(workout.dayName)||!['draft','completed'].includes(workout.status))archiveFail('Allenamento della copia non valido.');
 for(const exercise of data.workoutExercises)if(!ids.workouts.has(exercise.workoutId)||!nonempty(exercise.name))archiveFail('Esercizio registrato della copia non valido.');
 for(const set of data.sets)if(!ids.workoutExercises.has(set.workoutExerciseId)||!Number.isInteger(set.number)||set.number<1||!numeric(set.weight)||!Number.isInteger(set.reps)||set.reps<1||set.reps>999||typeof set.completed!=='boolean')archiveFail('Serie della copia non valida.');
}
async function archiveCleanup(db,bucket,scope) {
 // Cleanup is outside the successful head transaction. A cleanup failure leaves
 // extra recovery copies, never a missing current or previous snapshot.
 try {
  const old=await db.prepare('SELECT id,object_key FROM archive_versions WHERE scope=? ORDER BY revision DESC LIMIT 100 OFFSET ?').bind(scope,ARCHIVE_RETAINED_VERSIONS).all();
  if(!old.results?.length)return;
  await db.batch(old.results.map(row=>db.prepare('DELETE FROM archive_versions WHERE id=? AND scope=?').bind(row.id,scope)));
  await bucket.delete(old.results.map(row=>row.object_key));
 }catch{/* A later successful upload can retry best-effort retention cleanup. */}
}

export async function archiveApi(request,env,me,onSaved) {
 const url=new URL(request.url),kind=url.searchParams.get('scope')||'device',visitor=request.headers.get('oai-authenticated-user-id');
 if(!visitor)archiveFail('Accedi prima con ChatGPT.',401);
 if(!['device','account'].includes(kind))archiveFail('Archivio non valido.');
 if(kind==='account'&&!me)archiveFail('Accedi all’account per aprire la sua copia persistente.',401);
 if(!env.BUCKET)archiveFail('Copia persistente non ancora configurata. I dati sul dispositivo sono conservati.',503);
 const scope=await archiveDigest(kind==='account'?'account:'+me.id:'visitor:'+visitor),db=env.DB;
 const head=await db.prepare('SELECT * FROM archive_heads WHERE scope=?').bind(scope).first();
 if(request.method==='GET') {
  if(url.searchParams.get('history')==='1'){
   const versions=await db.prepare('SELECT revision,updated_at AS updatedAt,size_bytes AS sizeBytes,content_hash AS contentHash FROM archive_versions WHERE scope=? ORDER BY revision DESC LIMIT ?').bind(scope,ARCHIVE_RETAINED_VERSIONS).all();
   return archiveJson({revision:head?.revision||0,versions:versions.results||[]});
  }
  let selected=head;
  if(url.searchParams.has('version')){
   const version=archiveRevision(url.searchParams.get('version'));
   selected=await db.prepare('SELECT * FROM archive_versions WHERE scope=? AND revision=?').bind(scope,version).first();
   if(!selected)archiveFail('Copia precedente non trovata.',404);
  }
  if(!selected)return archiveJson({revision:0,backup:null,updatedAt:null});
  const object=await env.BUCKET.get(selected.object_key);
  if(!object)archiveFail('La copia persistente non è momentaneamente leggibile. L’archivio locale resta conservato.',503);
  const backup=await object.text();
  if(await archiveDigest(backup)!==selected.content_hash)archiveFail('La copia persistente non ha superato la verifica. L’archivio locale resta conservato.',503);
  return archiveJson({revision:selected.revision,backup,updatedAt:selected.updated_at,contentHash:selected.content_hash,...(selected.revision!==head?.revision?{headRevision:head?.revision||0}:{})},200,{ETag:'"'+selected.revision+'"'});
 }
 if(request.method!=='POST')return archiveJson({error:'Metodo non supportato.'},405,{Allow:'GET, POST'});
 const base=archiveRevision(request.headers.get('if-match'));
 if(base!==(head?.revision||0))return archiveJson({error:'La copia persistente è cambiata in un’altra finestra. Le modifiche locali sono conservate.',revision:head?.revision||0},409);
 const body=await archiveBody(request);archiveValidate(body.text);
 const revision=base+1,at=Date.now(),hash=await archiveDigest(body.text),id=crypto.randomUUID(),key=`archives/${scope}/${revision}/${id}.json`;
 await env.BUCKET.put(key,body.text,{httpMetadata:{contentType:'application/json; charset=utf-8'},customMetadata:{revision:String(revision),sha256:hash}});
 let result;
 try {
  result=await db.batch([
   db.prepare('INSERT INTO archive_heads(scope,revision,object_key,updated_at,size_bytes,content_hash) SELECT ?,?,?,?,?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM archive_heads WHERE scope=?) ON CONFLICT(scope) DO UPDATE SET revision=excluded.revision,object_key=excluded.object_key,updated_at=excluded.updated_at,size_bytes=excluded.size_bytes,content_hash=excluded.content_hash WHERE archive_heads.revision=?').bind(scope,revision,key,at,body.bytes,hash,base,scope,base),
   db.prepare('INSERT INTO archive_versions(id,scope,revision,object_key,updated_at,size_bytes,content_hash) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM archive_heads WHERE scope=? AND revision=? AND object_key=?)').bind(id,scope,revision,key,at,body.bytes,hash,scope,revision,key)
  ]);
 }catch(error){
  // A network error can arrive after D1 committed the head. Keep the immutable
  // object on an ambiguous failure; deleting it could remove a committed copy.
  throw error;
 }
 if(!result[0]?.meta?.changes){
  try{await env.BUCKET.delete(key);}catch{}
  const current=await db.prepare('SELECT revision FROM archive_heads WHERE scope=?').bind(scope).first();
  return archiveJson({error:'La copia persistente è cambiata durante il salvataggio. Le modifiche locali sono conservate.',revision:current?.revision||0},409);
 }
 await archiveCleanup(db,env.BUCKET,scope);
 // Optional external calendar must never make a committed archive look unsaved.
 if(kind==='account'&&onSaved){try{await onSaved(body.text,revision,at);}catch{/* Retry on next save or reconnect. Archive remains durable. */}}
 return archiveJson({revision,updatedAt:at,contentHash:hash},200,{ETag:'"'+revision+'"'});
}
