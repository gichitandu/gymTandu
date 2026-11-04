// Audit helper for the completed, explicitly authorized one-off Tandu reset.
// Not imported by the application or deployment bundle; retained only for tests.
export async function performTanduReset(request,env,catalog,archiveApi,calendarPublish){
 const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
 const secret=env.GYMTRACK_MAINTENANCE_SECRET;
 if(!secret||request.method!=='POST'||request.headers.get('authorization')!=='Bearer '+secret)return reply({error:'Not found'},404);
 if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Richiesta non valida'},403);
 const raw=await request.text();if(raw.length>2048)return reply({error:'Richiesta non valida'},400);
 let body;try{body=JSON.parse(raw);}catch{return reply({error:'Richiesta non valida'},400);}
 const user=await env.DB.prepare('SELECT id,name,email,username,role FROM users WHERE id=?').bind(body.userId).first();
 if(user?.id!=='35e2c49b-0f56-40e6-a958-ce876d5c8bfe'||user.username!=='tandu'||user.role!=='SuperAdmin')return reply({error:'Account differente dal destinatario autorizzato.'},403);
 const operation='tandu-excel-2026-10-29';
 const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const scope=await digest('account:'+user.id);
 let row=await env.DB.prepare('SELECT * FROM account_archive_resets WHERE user_id=?').bind(user.id).first();
 if(row?.completed_at)return reply({ok:true,alreadyCompleted:true,userId:user.id,role:user.role});
 const head=await env.DB.prepare('SELECT * FROM archive_heads WHERE scope=?').bind(scope).first();
 let previous=null;
 if(head){const object=await env.BUCKET.get(head.object_key);if(!object)return reply({error:'Copia corrente non leggibile; nessuna modifica.'},503);const text=await object.text();if(await digest(text)!==head.content_hash)return reply({error:'Verifica copia corrente non riuscita; nessuna modifica.'},503);previous=JSON.parse(text);
  const key='reset-recovery/'+scope+'/'+operation+'.json';
  if(!await env.BUCKET.get(key))await env.BUCKET.put(key,text,{httpMetadata:{contentType:'application/json'},customMetadata:{retainUntil:String(Date.now()+30*86400000)}});
 }
 if(row&&previous?.data?.settings?.[0]?.archiveResetId===row.reset_id){
  // The archive commit can succeed before its completion acknowledgement.
  // Retrying may finalize bookkeeping, never reset newer user entries again.
  await env.DB.prepare('UPDATE account_archive_resets SET completed_at=? WHERE user_id=? AND completed_at IS NULL').bind(Date.now(),user.id).run();
  return reply({ok:true,alreadyCompleted:true,userId:user.id,role:user.role,revision:head.revision});
 }
 if(!row){
  await env.DB.prepare('INSERT INTO account_archive_resets(id,user_id,scope,reset_id,recovery_key,retain_until) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO NOTHING').bind(operation,user.id,scope,crypto.randomUUID(),head?'reset-recovery/'+scope+'/'+operation+'.json':null,Date.now()+30*86400000).run();
  row=await env.DB.prepare('SELECT * FROM account_archive_resets WHERE user_id=?').bind(user.id).first();
 }
 const shared=await catalog(env.DB);
 const roles=previous?.data?.roles||[{id:'superadmin',name:'SuperAdmin',permissions:['*']},{id:'admin',name:'Admin',permissions:['catalog:write']},{id:'user',name:'User',permissions:['plans:own','workouts:own','stats:own']}];
 const data={profiles:[{id:'local',name:user.name||'Tandu',role:user.role}],roles,plans:[],days:[],planExercises:[],exercises:shared.exercises,muscleGroups:shared.muscleGroups,workouts:[],workoutExercises:[],sets:[],settings:[{id:'local',theme:'dark',unit:'kg',prefill:false,archiveResetId:row.reset_id}],meals:[],scheduledWorkouts:[],measurements:[],exercisePreferences:[],workoutUi:[]};
 const backup=JSON.stringify({app:'GymTrack',schemaVersion:6,exportedAt:new Date().toISOString(),data,historyIntent:{workouts:(previous?.data?.workouts||[]).filter(row=>row.status==='completed').map(row=>row.id),sets:(previous?.data?.sets||[]).filter(row=>row.completed).map(row=>row.id)}});
 const update=new Request(new URL('/api/archive?scope=account',request.url),{method:'POST',headers:{'oai-authenticated-user-id':'authorized-maintenance','content-type':'application/json','if-match':String(head?.revision||0)},body:backup});
 const result=await archiveApi(update,env,user,(text,revision,at)=>calendarPublish(env,user,text,revision,at));
 if(!result.ok)return result;
 const saved=await result.json();
 await env.DB.batch([env.DB.prepare('UPDATE account_archive_resets SET completed_at=? WHERE user_id=? AND completed_at IS NULL').bind(Date.now(),user.id),env.DB.prepare('DELETE FROM user_preferences WHERE user_id=?').bind(user.id)]);
 return reply({ok:true,userId:user.id,role:user.role,revision:saved.revision,resetId:row.reset_id,retainedRecoveryCopy:!!head,previous:{plans:previous?.data?.plans?.length||0,workouts:previous?.data?.workouts?.length||0,meals:previous?.data?.meals?.length||0},current:{plans:0,workouts:0,meals:0}});
}
