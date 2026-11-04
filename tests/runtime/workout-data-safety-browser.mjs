// Loopback-only data recovery exercise. No production account or archive writes.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.GYMTRACK_PLAYWRIGHT_MODULE||'playwright');
const origin='http://localhost:4173',output=process.env.GYMTRACK_QA_OUTPUT||'docs/qa/workout-data-safety',password='fixture-only-test-password';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.GYMTRACK_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,serviceWorkers:'block'}),page=await context.newPage(),errors=[],results=[];
page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
const mark=name=>{results.push(name);console.log('PASS',name);};
const call=async(path,body,revision)=>context.request.fetch(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'}),...(revision===undefined?{}:{'If-Match':String(revision)})},...(body===undefined?{}:{data:body})});
const wait=async(check,label)=>{for(let n=0;n<100;n++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Timeout: '+label);};
const read=()=>page.evaluate(async()=>{
 for(const {name} of await indexedDB.databases()){
  const db=await new Promise(resolve=>{const request=indexedDB.open(name);request.onsuccess=()=>resolve(request.result);});if(!db.objectStoreNames.contains('workouts')){db.close();continue;}
  const names=[...db.objectStoreNames].filter(name=>name!=='archiveMeta'),tx=db.transaction(names,'readonly');
  const data=await Promise.all(names.map(name=>new Promise(resolve=>{const request=tx.objectStore(name).getAll();request.onsuccess=()=>resolve([name,request.result]);}))).then(Object.fromEntries);db.close();return data;
 }throw Error('QA archive missing');
});
const writeArchive = data => page.evaluate(async data=>{
  let db;for(const {name}of await indexedDB.databases()){const candidate=await new Promise(resolve=>{const request=indexedDB.open(name);request.onsuccess=()=>resolve(request.result);});if(candidate.objectStoreNames.contains('workouts')){db=candidate;break;}candidate.close();}
  const names=Object.keys(data),tx=db.transaction([...names,'archiveMeta'],'readwrite');for(const name of names){const table=tx.objectStore(name);table.clear();for(const row of data[name])table.put(row);}
  const meta=tx.objectStore('archiveMeta'),request=meta.get('revision');request.onsuccess=()=>meta.put({id:'revision',value:(request.result?.value||0)+1});
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
 },data);
try{
 await call('auth/setup',{password});assert((await call('auth/login',{email:'giacomotanduo004@gmail.com',password})).ok());
 await page.goto(origin+'/#/');await page.locator('main [data-design-id="home.goals"]').waitFor();
 const original=await read(),source=structuredClone(original),date=new Date().toISOString().slice(0,10),oldDate=new Date(Date.now()-86400000).toISOString().slice(0,10);
 source.settings[0].goals={workoutsPerWeek:4};
 source.workouts=[{id:'qa-recorded',userId:'local',planId:'qa-plan',dayId:'qa-day',planName:'Piano otto settimane',dayName:'Seduta A registrata',date,startedAt:date+'T12:00:00Z',endedAt:date+'T13:00:00Z',duration:60,status:'completed',notes:'Registrazione originale da recuperare'},{id:'qa-other',userId:'local',planId:'qa-plan',dayId:'qa-other-day',planName:'Piano otto settimane',dayName:'Seduta precedente conservata',date:oldDate,startedAt:oldDate+'T12:00:00Z',endedAt:oldDate+'T13:00:00Z',duration:60,status:'completed',notes:'Non cambiare'}];
 source.workoutExercises=[{id:'qa-we',workoutId:'qa-recorded',exerciseId:'exercise-0',name:'Panca piana',loadMode:'external',order:0,rest:90,notes:'Tecnica controllata'},{id:'qa-other-we',workoutId:'qa-other',exerciseId:'exercise-4',name:'Lat machine',loadMode:'external',order:0,rest:90,notes:''}];
 source.sets=[{id:'qa-warmup',workoutExerciseId:'qa-we',number:1,weight:20,reps:12,kind:'warmup',completed:true},{id:'qa-work',workoutExerciseId:'qa-we',number:2,weight:72.5,reps:9,kind:'work',completed:true},{id:'qa-other-set',workoutExerciseId:'qa-other-we',number:1,weight:50,reps:10,kind:'work',completed:true}];
 source.workoutUi=[];
 const envelope=data=>({app:'GymTrack',schemaVersion:11,exportedAt:new Date().toISOString(),data});
 let response=await call('archive?scope=account',envelope(source),0);assert.equal(response.status(),200,await response.text());
 const reduced=structuredClone(source);reduced.workouts=reduced.workouts.filter(row=>row.id!=='qa-recorded');reduced.workoutExercises=reduced.workoutExercises.filter(row=>row.id!=='qa-we');reduced.sets=reduced.sets.filter(row=>row.workoutExerciseId!=='qa-we');
 response=await call('archive?scope=account',envelope(reduced),1);assert.equal(response.status(),409);assert.equal((await response.json()).code,'workout_history_conflict');
 mark('A stale full archive cannot erase today’s completed workout even with the correct server revision');
 response=await call('archive?scope=account',{...envelope(reduced),historyIntent:{workouts:['qa-recorded'],sets:['qa-warmup','qa-work']}},1);assert.equal(response.status(),200,await response.text());
 for(let revision=2;revision<14;revision++){response=await call('archive?scope=account',envelope(reduced),revision);assert.equal(response.status(),200,await response.text());}
 assert.equal((await call('archive?scope=account&version=1')).status(),200);
 mark('The original finished session remains recoverable after more than ten subsequent archive saves');
 await writeArchive(reduced);
 await page.reload();await page.locator('main [data-design-id="home.goals"]').waitFor();
 await page.goto(origin+'/#/recupera-allenamenti?date='+date);
 const candidate=page.locator('.recovery-results article').filter({hasText:'Seduta A registrata'});await candidate.first().waitFor();
 await candidate.first().getByText('Controlla esercizi, carichi e ripetizioni',{exact:true}).click();
 assert.match(await candidate.first().innerText(),/72\.5 kg × 9/);assert.match(await candidate.first().innerText(),/Riscaldamento · 20 kg × 12/);
 assert.match(await candidate.first().innerText(),/1 serie allenanti completate/);
 await page.screenshot({path:output+'/recovery-preview-mobile.png',fullPage:true});
 mark('Recovery search finds the protected server version and previews original loads, reps and warmup');
 const before=await read();await candidate.first().getByRole('button',{name:'Recupera questa seduta',exact:true}).click();
 await page.locator('gt-confirmation-dialog dialog[open] .dialog-primary').click();
 await page.getByRole('status').filter({hasText:'Seduta recuperata e copia server confermata.'}).waitFor();
 const after=await read();assert.deepEqual(after.workouts.find(row=>row.id==='qa-recorded'),source.workouts[0]);assert.deepEqual(after.sets.find(row=>row.id==='qa-work'),source.sets[1]);
 assert.deepEqual(after.workouts.find(row=>row.id==='qa-other'),before.workouts.find(row=>row.id==='qa-other'));assert.deepEqual(after.sets.find(row=>row.id==='qa-other-set'),before.sets.find(row=>row.id==='qa-other-set'));assert.deepEqual(after.plans,before.plans);assert.deepEqual(after.profiles,before.profiles);
 const head=await (await call('archive?scope=account')).json();assert(JSON.parse(head.backup).data.sets.some(row=>row.id==='qa-work'&&row.weight===72.5&&row.completed));
 mark('Targeted recovery restores and syncs the missing session while preserving the other workout, profile and plan');
 const checkpoints=await page.evaluate(async()=>{
  const db=await new Promise(resolve=>{const request=indexedDB.open('gymtrack-v1');request.onsuccess=()=>resolve(request.result);});
  const rows=await new Promise(resolve=>{const request=db.transaction('archiveMeta','readonly').objectStore('archiveMeta').getAll();request.onsuccess=()=>resolve(request.result);});db.close();return rows.filter(row=>row.id.startsWith('recovery:')).map(row=>({kind:row.kind,hasRecovered:row.data.workouts.some(workout=>workout.id==='qa-recorded')}));
 });
 assert(checkpoints.some(row=>row.kind==='before-workout-recovery'&&!row.hasRecovered));assert(checkpoints.some(row=>row.kind==='completed-workout'&&row.hasRecovered));
 mark('A verified local copy exists both before recovery and after completion, outside the live archive tables');
 await page.goto(origin+'/#/');await page.locator('main [data-design-id="home.goals"]').waitFor();await page.reload();await page.locator('main [data-design-id="home.goals"]').waitFor();
 const persisted=await read();assert(persisted.sets.some(row=>row.id==='qa-work'&&row.weight===72.5&&row.reps===9&&row.completed));
 assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),'50');
 await page.screenshot({path:output+'/recovered-home-mobile.png',fullPage:true});
 mark('Reload preserves recovered progress and restores the real weekly Home statistic');
 // Make a second disposable loss, then recover only that session from a file.
 const fresh=await (await call('archive?scope=account')).json();
 response=await call('archive?scope=account',{...envelope(reduced),historyIntent:{workouts:['qa-recorded'],sets:['qa-warmup','qa-work']}},fresh.revision);assert.equal(response.status(),200);
 await writeArchive(reduced);await page.reload();await page.locator('main [data-design-id="home.goals"]').waitFor();
 await page.goto(origin+'/#/recupera-allenamenti?date='+date);await page.getByRole('button',{name:'Cerca copie dell’allenamento',exact:true}).waitFor();
 await wait(async()=>!(await page.getByRole('button',{name:'Cerca copie dell’allenamento',exact:true}).isDisabled()),'recovery scan complete');
 await page.getByText('Cerca anche in un backup salvato in File',{exact:true}).click();
 await page.getByLabel('Backup per recuperare una singola seduta').setInputFiles({name:'gymtrack-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(envelope(source)))});
 await wait(async()=>!(await page.getByRole('button',{name:'Cerca copie dell’allenamento',exact:true}).isDisabled()),'file analysis complete');
 const fileCandidate=page.locator('.recovery-results article').filter({hasText:'Backup selezionato da File'});await fileCandidate.first().waitFor();
 await fileCandidate.first().getByRole('button',{name:'Recupera questa seduta',exact:true}).click();await page.locator('gt-confirmation-dialog dialog[open] .dialog-primary').click();
 await page.getByRole('status').filter({hasText:'Seduta recuperata e copia server confermata.'}).waitFor();
 assert((await read()).sets.some(row=>row.id==='qa-work'&&row.weight===72.5&&row.completed));assert.deepEqual((await read()).plans,reduced.plans);
 assert.deepEqual(errors,[]);
 mark('A validated backup file restores only the selected session and preserves the current plan');
 for(const width of [320,390,430]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow at '+width);}
 mark('Recovery fits 320–430 px and produces no application exceptions');
 await writeFile(output+'/browser-qa.txt',results.map(row=>'PASS '+row).join('\n')+'\n');
}catch(error){await page.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{});await writeFile(output+'/failure.txt',String(error)+'\n'+errors.join('\n'));throw error;}
finally{await browser.close();}
