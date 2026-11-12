export const EXCEL_FILE_LIMIT_BYTES = 10 * 1024 * 1024;
const programBodyLimit = Math.ceil(EXCEL_FILE_LIMIT_BYTES / 3) * 4 + 32768;
const programFileType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const programSafeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(value);
function programReply(data, status = 200, headers = {}) {
 return Response.json(data, {status, headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...headers}});
}
function programFail(message, status = 400, code) { throw Object.assign(new Error(message), {status,...(code?{code}:{})}); }
async function programDigest(value) {
 const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
function programDate(value) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
async function programBody(request, limit) {
 if(Number(request.headers.get('content-length')||0)>limit)programFail('Il file Excel supera il limite di 10 MB.',413);
 const reader=request.body?.getReader();if(!reader)programFail('Richiesta mancante.');
 const decoder=new TextDecoder('utf-8',{fatal:true}),parts=[];let bytes=0;
 try{
  for(;;){const item=await reader.read();if(item.done)break;bytes+=item.value.byteLength;if(bytes>limit){await reader.cancel();programFail('Il file Excel supera il limite di 10 MB.',413);}parts.push(decoder.decode(item.value,{stream:true}));}
  parts.push(decoder.decode());const body=JSON.parse(parts.join(''));if(!body||typeof body!=='object'||Array.isArray(body))programFail('Richiesta non valida.');return body;
 }catch(error){if(error.status)throw error;programFail('Richiesta non leggibile.');}
}
function programWriteAllowed(request) {
 if(request.headers.get('origin')!==new URL(request.url).origin)programFail('Richiesta non autorizzata.',403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))programFail('Formato non supportato.',415);
}
async function programReadAccount(env,user) {
 const scope=await programDigest('account:'+user.id);
 const head=await env.DB.prepare('SELECT object_key,content_hash FROM archive_heads WHERE scope=?').bind(scope).first();
 if(!head)return null;
 const object=await env.BUCKET.get(head.object_key);if(!object)programFail('La copia del piano non è disponibile. Riprova la sincronizzazione.',503);
 const text=await object.text();if(await programDigest(text)!==head.content_hash)programFail('La copia del piano non ha superato la verifica.',503);
 try{return JSON.parse(text).data;}catch{programFail('La copia del piano non è leggibile.',503);}
}
function programImportRecord(row,plans) {
 const plan=plans?.find(value=>value.id===row.plan_id);
 return {id:row.id,planId:row.plan_id,sourceName:row.source_name,fileHash:row.content_hash,planName:plan?.name||row.plan_name,startDate:row.start_date,endDate:row.end_date,weeks:row.weeks,sizeBytes:row.size_bytes,importedAt:row.imported_at,confirmedAt:row.confirmed_at,status:plans?(plan?(plan.completedAt?'completed':'active'):'unavailable'):'active'};
}
async function programExisting(db,user,id,fileHash,startDate) {
 return db.prepare('SELECT * FROM excel_import_files WHERE user_id=? AND (id=? OR (content_hash=? AND start_date=?)) ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END LIMIT 1').bind(user.id,id,fileHash,startDate,id).first();
}
function programCheckRetry(row,body) {
 if(row.content_hash!==body.fileHash||row.start_date!==body.startDate||row.end_date!==body.endDate||row.weeks!==body.weeks||row.plan_id!==body.planId)programFail('Questa importazione è già associata a un altro piano. Riapri l’archivio Excel.',409);
}

/** Import files are isolated by authenticated account and remain private R2 objects. */
export async function excelImportsApi(request,env,user) {
 try{
  if(!user)return programReply({error:'Accedi al tuo account per conservare gli Excel importati.'},401);
  if(!env.DB||!env.BUCKET)return programReply({error:'Archivio Excel non ancora disponibile.'},503);
  const path=new URL(request.url).pathname,match=/^\/api\/excel-imports(?:\/([A-Za-z0-9_-]{1,150})\/(file|confirm))?$/.exec(path);
  if(!match)return programReply({error:'Importazione non trovata.'},404);
  const id=match[1],action=match[2];
  if(!id&&request.method==='GET'){
   const rows=await env.DB.prepare('SELECT * FROM excel_import_files WHERE user_id=? AND confirmed_at IS NOT NULL ORDER BY imported_at DESC').bind(user.id).all();
   const archive=rows.results?.length?await programReadAccount(env,user):null;
   return programReply({imports:(rows.results||[]).map(row=>programImportRecord(row,archive?.plans))});
  }
  if(id&&action==='file'&&request.method==='GET'){
   const row=await env.DB.prepare('SELECT * FROM excel_import_files WHERE user_id=? AND id=? AND confirmed_at IS NOT NULL').bind(user.id,id).first();
   if(!row)return programReply({error:'File non trovato.'},404);
   const object=await env.BUCKET.get(row.object_key);if(!object)return programReply({error:'Il file non è momentaneamente disponibile.'},503);
   const bytes=await object.arrayBuffer();if(bytes.byteLength!==row.size_bytes||await programDigest(bytes)!==row.content_hash)return programReply({error:'Il file non ha superato la verifica. Riprova più tardi.'},503);
   const filename=row.source_name.replace(/[^\x20-\x7e]|["\\;\r\n]/g,'_');
   const unicode=encodeURIComponent(row.source_name).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
   return new Response(bytes,{headers:{'Content-Type':programFileType,'Content-Length':String(bytes.byteLength),'Content-Disposition':`attachment; filename="${filename}"; filename*=UTF-8''${unicode}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
  }
  if(request.method!=='POST'||(id&&action!=='confirm'))return programReply({error:'Metodo non supportato.'},405,{Allow:action==='file'?'GET':'GET, POST'});
  programWriteAllowed(request);
  if(id){
   await programBody(request,1024);
   const row=await env.DB.prepare('SELECT * FROM excel_import_files WHERE user_id=? AND id=?').bind(user.id,id).first();
   if(!row)return programReply({error:'Importazione non trovata.'},404);
   const archive=await programReadAccount(env,user),plan=archive?.plans?.find(value=>value.id===row.plan_id),metadata=plan?.program;
   if(!plan)validateImportedProgramOverlaps({plans:[...(archive?.plans||[]),{id:row.plan_id,name:row.plan_name,program:{startDate:row.start_date,endDate:row.end_date}}],scheduledWorkouts:archive?.scheduledWorkouts||[],workouts:archive?.workouts||[]});
   if(!plan||metadata?.importId!==row.id||metadata.fileHash!==row.content_hash||metadata.startDate!==row.start_date||metadata.endDate!==row.end_date||metadata.weeks!==row.weeks)return programReply({error:'Salva prima il piano sull’account, poi riprova a confermare il file.',code:'archive_not_synced'},409);
   validateImportedProgramOverlaps(archive);
   await env.DB.prepare('UPDATE excel_import_files SET confirmed_at=COALESCE(confirmed_at,?) WHERE user_id=? AND id=?').bind(Date.now(),user.id,id).run();
   const saved=await env.DB.prepare('SELECT * FROM excel_import_files WHERE user_id=? AND id=?').bind(user.id,id).first();
   return programReply({import:programImportRecord(saved,archive.plans)});
  }
  const body=await programBody(request,programBodyLimit);
  if(!programSafeId(body.id)||!programSafeId(body.planId)||typeof body.sourceName!=='string'||!body.sourceName.trim()||body.sourceName.length>200||/[\x00-\x1f\x7f/\\]/.test(body.sourceName)||!body.sourceName.toLowerCase().endsWith('.xlsx')||typeof body.fileHash!=='string'||!/^[a-f0-9]{64}$/.test(body.fileHash)||typeof body.planName!=='string'||!body.planName.trim()||body.planName.length>200||!programDate(body.startDate)||!programDate(body.endDate)||body.endDate<body.startDate||!Number.isInteger(body.weeks)||body.weeks<1||body.weeks>10000)programFail('Metadati dell’importazione non validi.');
  if(typeof body.fileBase64!=='string'||!body.fileBase64||body.fileBase64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.fileBase64))programFail('File Excel non valido.');
  if(body.fileBase64.length>Math.ceil(EXCEL_FILE_LIMIT_BYTES/3)*4)programFail('Il file Excel supera il limite di 10 MB.',413);
  const binary=atob(body.fileBase64);if(binary.length>EXCEL_FILE_LIMIT_BYTES)programFail('Il file Excel supera il limite di 10 MB.',413);
  const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
  if(bytes.length<4||bytes[0]!==0x50||bytes[1]!==0x4b||bytes[2]!==3||bytes[3]!==4||await programDigest(bytes)!==body.fileHash)programFail('Il contenuto del file Excel non corrisponde all’importazione.');
  // Check the latest authenticated account, not only the phone's local copy.
  // This preflight does not persist a plan or expose an imported file.
  const account=await programReadAccount(env,user),current=account?.plans?.find(plan=>plan.id===body.planId);
  if(current&&(current.program?.importId!==body.id||current.program?.fileHash!==body.fileHash||current.program?.startDate!==body.startDate||current.program?.endDate!==body.endDate||current.program?.weeks!==body.weeks))programFail('L’identificativo è già associato a un altro piano.',409);
  validateImportedProgramOverlaps(current?account:{plans:[...(account?.plans||[]),{id:body.planId,name:body.planName,program:{startDate:body.startDate,endDate:body.endDate}}],scheduledWorkouts:account?.scheduledWorkouts||[],workouts:account?.workouts||[]});
  const prior=await programExisting(env.DB,user,body.id,body.fileHash,body.startDate);
  if(prior){programCheckRetry(prior,body);return programReply({import:programImportRecord(prior)});}
  const pending=await env.DB.prepare('SELECT COUNT(*) AS count FROM excel_import_files WHERE user_id=? AND confirmed_at IS NULL').bind(user.id).first();
  if(pending.count>=20)return programReply({error:'Completa le importazioni in attesa prima di aggiungere altri file.'},429);
  const scope=await programDigest(user.id),key=`excel-imports/${scope}/${crypto.randomUUID()}.xlsx`,at=Date.now();
  await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:programFileType},customMetadata:{sha256:body.fileHash}});
  const inserted=await env.DB.prepare('INSERT INTO excel_import_files(user_id,id,plan_id,source_name,content_hash,object_key,size_bytes,start_date,end_date,weeks,plan_name,imported_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING').bind(user.id,body.id,body.planId,body.sourceName,body.fileHash,key,bytes.byteLength,body.startDate,body.endDate,body.weeks,body.planName.trim(),at).run();
  const saved=await programExisting(env.DB,user,body.id,body.fileHash,body.startDate);
  if(!inserted.meta?.changes){try{await env.BUCKET.delete(key);}catch{}programCheckRetry(saved,body);}
  return programReply({import:programImportRecord(saved)},inserted.meta?.changes?201:200);
 }catch(error){if(error.status)return programReply({error:error.message,...(error.code?{code:error.code}:{})},error.status);throw error;}
}

/** Shared by commit validation and file finalization: schedules use whole dates. */
export function validateImportedProgramOverlaps(data) {
 const schedules=Array.isArray(data?.scheduledWorkouts)?data.scheduledWorkouts:[],workouts=Array.isArray(data?.workouts)?data.workouts:[];
 const entries=[...schedules.filter(entry=>entry.kind===undefined||entry.kind==='workout'),...workouts].filter(entry=>programDate(entry.date)).sort((a,b)=>a.date.localeCompare(b.date));
 const retained=new Map();for(const entry of entries){const bounds=retained.get(entry.planId);if(bounds)bounds[1]=entry.date;else retained.set(entry.planId,[entry.date,entry.date]);}
 const allWindows=(data?.plans||[]).map(plan=>{
  const kept=retained.get(plan.id);
  const bounds=plan.program&&!plan.completedAt?[kept&&kept[0]<plan.program.startDate?kept[0]:plan.program.startDate,kept&&kept[1]>plan.program.endDate?kept[1]:plan.program.endDate]:kept;
  return bounds&&programDate(bounds[0])&&programDate(bounds[1])&&bounds[0]<=bounds[1]?{id:plan.id,name:plan.name,start:bounds[0],end:bounds[1],imported:!!plan.program}:null;
 }).filter(Boolean).sort((a,b)=>a.start.localeCompare(b.start));
 const windows=allWindows.filter(window=>window.imported);
 let position=0;
 for(const window of windows){
  while(position<entries.length&&entries[position].date<window.start)position++;
  while(position<entries.length&&entries[position].date<=window.end){const entry=entries[position++];if(entry.planId!==window.id)programFail(`Sovrapposizione il ${entry.date}: “${entry.dayName||'Allenamento'}” del piano “${entry.planName||'già presente'}” coincide con il periodo di “${window.name}”. Nessuna importazione è stata confermata.`,409,'PLAN_OVERLAP');}
 }
 let furthest,furthestImported;
 for(const window of allWindows){
  const prior=window.imported?furthest:furthestImported;
  if(prior&&window.start<=prior.end)programFail(`Sovrapposizione: il piano “${window.name}” occupa il periodo del piano “${prior.name}” dal ${window.start}. Nessuna importazione è stata confermata.`,409,'PLAN_OVERLAP');
  if(!furthest||window.end>furthest.end)furthest=window;
  if(window.imported&&(!furthestImported||window.end>furthestImported.end))furthestImported=window;
 }
}

const APP_FEATURE_FIELDS={nutritionEnabled:'nutrition_enabled',hubEnabled:'hub_enabled',garageEnabled:'garage_enabled'};
/** Interruttori globali delle sezioni. Prima della migrazione 0012 GT Hub e GT Garage restano chiusi. */
export async function appFeatureFlags(env){
 if(!env.DB)return{nutritionEnabled:false,hubEnabled:false,garageEnabled:false,revision:0,updatedAt:null};
 let row;
 try{row=await env.DB.prepare('SELECT nutrition_enabled,hub_enabled,garage_enabled,revision,updated_at FROM app_features WHERE id=?').bind('current').first();}
 catch(error){
  if(!/no such column|has no column/i.test(String(error?.message)))throw error;
  row=await env.DB.prepare('SELECT nutrition_enabled,revision,updated_at FROM app_features WHERE id=?').bind('current').first();
 }
 return{nutritionEnabled:row?.nutrition_enabled===1,hubEnabled:row?.hub_enabled===1,garageEnabled:row?.garage_enabled===1,revision:row?.revision||0,updatedAt:row?.updated_at??null};
}
export async function appFeaturesApi(request,env,user) {
 try{
  if(!user)return programReply({error:'Accedi al tuo account.'},401);
  if(!env.DB)return programReply({error:'Impostazioni non ancora disponibili.'},503);
  if(!['GET','POST'].includes(request.method))return programReply({error:'Metodo non supportato.'},405,{Allow:'GET, POST'});
  if(request.method==='POST'){
   if(user.role!=='SuperAdmin')return programReply({error:'Solo i Super Admin possono modificare la visibilità delle sezioni.'},403);
   programWriteAllowed(request);const body=await programBody(request,1024);
   const keys=body&&typeof body==='object'&&!Array.isArray(body)?Object.keys(body):[];
   if(!keys.length||keys.some(key=>!(key in APP_FEATURE_FIELDS)||typeof body[key]!=='boolean'))return programReply({error:'Indica quali sezioni mostrare.'},400);
   const current=await appFeatureFlags(env),next={...current};for(const key of keys)next[key]=body[key];
   if(keys.some(key=>next[key]!==current[key])){
    try{await env.DB.prepare('INSERT INTO app_features(id,nutrition_enabled,hub_enabled,garage_enabled,revision,updated_by,updated_at) VALUES(?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET nutrition_enabled=excluded.nutrition_enabled,hub_enabled=excluded.hub_enabled,garage_enabled=excluded.garage_enabled,revision=app_features.revision+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind('current',next.nutritionEnabled?1:0,next.hubEnabled?1:0,next.garageEnabled?1:0,user.id,Date.now()).run();}
    catch(error){
     if(!/no such column|has no column/i.test(String(error?.message)))throw error;
     // Database non ancora migrato (0012): Pasti si salva come prima, GT Hub e GT Garage aspettano la migrazione.
     if(keys.some(key=>key!=='nutritionEnabled'))return programReply({error:'Database da aggiornare: applica le migrazioni prima di aprire GT Hub o GT Garage.'},503);
     await env.DB.prepare('INSERT INTO app_features(id,nutrition_enabled,revision,updated_by,updated_at) VALUES(?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET nutrition_enabled=excluded.nutrition_enabled,revision=app_features.revision+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind('current',next.nutritionEnabled?1:0,user.id,Date.now()).run();
    }
   }
  }
  return programReply(await appFeatureFlags(env));
 }catch(error){if(error.status)return programReply({error:error.message},error.status);throw error;}
}
