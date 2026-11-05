// Genuine GymTrack screenshots: compiled Angular + disposable loopback Worker/SQLite/R2.
// Never request the real app, copy an actual archive, or create production users.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.GYMTRACK_PLAYWRIGHT_MODULE||'playwright');
const origin='http://localhost:4173';
const output=path.resolve(process.env.GYMTRACK_QA_OUTPUT||'artifacts/qa-screenshots');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({
 ...(process.env.GYMTRACK_CHROMIUM?{executablePath:process.env.GYMTRACK_CHROMIUM}:{}),
 headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
});
const context=await browser.newContext({
 viewport:{width:390,height:844},deviceScaleFactor:2,
 timezoneId:'Europe/Rome',serviceWorkers:'block',acceptDownloads:true
});
const page=await context.newPage(),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
page.setDefaultTimeout(18000);
const report=async(name,ok=true)=>{results.push({name,ok});console.log(ok?'PASS':'FAIL',name);};
const shot=async name=>{await page.screenshot({path:path.join(output,name),fullPage:true});console.log('SCREENSHOT',name);};
const api=async(url,payload)=>context.request.post(origin+'/api/'+url,{
 headers:{Origin:origin},data:payload
});
try {
 const setup=await api('auth/setup',{password:'fixture-only-test-password'});
 assert.equal(setup.status(),200,'synthetic SuperAdmin bootstrap');
 const login=await api('auth/login',{
  email:'giacomotanduo004@gmail.com',
  password:'fixture-only-test-password'
 });
 assert(login.ok(),'synthetic SuperAdmin login should succeed');
 const me=await (await context.request.get(origin+'/api/auth/me')).json();
 assert.equal(me.user?.role,'SuperAdmin','real Worker must enforce SuperAdmin role');
 assert.equal(me.user?.name,'AI SuperAdmin QA','QA identity must be visibly distinct');
 await report('Created an AI SuperAdmin QA account in loopback SQLite (not production)');
 await page.goto(origin+'/#/');
 await page.locator('main [data-design-id="home.goals"]').waitFor();
 // Synthetic local archive built through the same IndexedDB schema used by the app.
 await page.evaluate(async()=>{
  const dbInfo=await indexedDB.databases();
  let db;
  for(const {name} of dbInfo){
   const candidate=await new Promise((resolve,reject)=>{const req=indexedDB.open(name);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
   if(candidate.objectStoreNames.contains('workouts')){db=candidate;break;}
   candidate.close();
  }
  if(!db)throw Error('Local GymTrack archive not ready');
  const stores=['profiles','plans','days','planExercises','workouts','workoutExercises','sets','scheduledWorkouts','archiveMeta'];
  const tx=db.transaction(stores,'readwrite');
  const localDate=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  const offset=n=>{const d=new Date();d.setDate(d.getDate()+n);return localDate(d);};
  const stamp=new Date().toISOString(),name='AI SuperAdmin QA';
  const profiles=tx.objectStore('profiles'),profile=profiles.get('local');
  profile.onsuccess=()=>{if(profile.result)profiles.put({...profile.result,name,role:'SuperAdmin'});};
  tx.objectStore('plans').put({id:'qa-plan-visual',userId:'local',name:'Programma QA — dati sintetici',description:'Solo ambiente di prova',active:true,archived:false,createdAt:stamp,updatedAt:stamp});
  tx.objectStore('days').put({id:'qa-day-visual',planId:'qa-plan-visual',name:'Forza generale QA',order:0});
  tx.objectStore('planExercises').put({id:'qa-pe-visual',dayId:'qa-day-visual',exerciseId:'exercise-0',sets:3,repsMin:8,repsMax:12,rest:90,targetWeight:40,order:0,notes:'Solo QA'});
  for(const [i,days] of [7,21,28].entries()){
   const id='qa-session-'+i,date=offset(-days),workoutExerciseId='qa-ex-'+i;
   tx.objectStore('workouts').put({id,userId:'local',planId:'qa-plan-visual',dayId:'qa-day-visual',planName:'Programma QA',dayName:'Forza generale QA',date,startedAt:date+'T10:00:00.000Z',endedAt:date+'T10:40:00.000Z',duration:40,notes:'Dati esclusivamente sintetici',status:'completed'});
   tx.objectStore('workoutExercises').put({id:workoutExerciseId,workoutId:id,exerciseId:'exercise-0',name:'Panca piana bilanciere',loadMode:'external',order:0,rest:90,notes:''});
   for(let n=1;n<=3;n++)tx.objectStore('sets').put({id:'qa-set-'+i+'-'+n,workoutExerciseId,number:n,weight:40+i*5,reps:10,kind:'work',completed:true,rest:90,notes:''});
  }
  tx.objectStore('scheduledWorkouts').put({id:'qa-upcoming-visual',planId:'qa-plan-visual',dayId:'qa-day-visual',planName:'Programma QA',dayName:'Forza generale QA',date:offset(2),time:'18:30',notes:'Solo QA'});
  const meta=tx.objectStore('archiveMeta'),rev=meta.get('revision');
  rev.onsuccess=()=>meta.put({id:'revision',value:(rev.result?.value||0)+1});
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  db.close();
 });
 await page.reload();
 await page.locator('main [data-design-id="home.goals"]').waitFor();
 const analysisSection=page.locator('section[aria-label="Analisi avanzate"]');
 await analysisSection.getByRole('link',{name:/Analisi e report/i}).waitFor();
 await shot('01-home-mobile-reale-QA.png');
 await report('Actual Angular Home displays the text link Analisi e report');
 await analysisSection.getByRole('link',{name:/Analisi e report/i}).click();
 await page.waitForURL('**/#/analisi');
 await page.getByRole('heading',{name:'La tua evoluzione',exact:true}).waitFor();
 await page.getByRole('button',{name:/Esporta CSV/i}).waitFor();
 await shot('02-analisi-mobile-reale-QA.png');
 await report('Analysis route renders metrics, charts, reminders and CSV/PDF actions');
 const downloaded=page.waitForEvent('download');
 await page.getByRole('button',{name:/Esporta CSV/i}).click();
 const download=await downloaded;
 assert.match(download.suggestedFilename(),/gymtrack-report-.*\.csv/);
 await download.saveAs(path.join(output,'report-sintetico-QA.csv'));
 await report('CSV download generated from synthetic archive');
 const reminder=page.getByRole('button',{name:/Aggiungi al calendario/i});
 if(await reminder.isVisible()){
  const eventDownloaded=page.waitForEvent('download');
  await reminder.click();
  const file=await eventDownloaded;
  assert.match(file.suggestedFilename(),/\.ics$/);
  await file.saveAs(path.join(output,'promemoria-sintetico-QA.ics'));
  await report('Calendar .ics downloaded from synthetic scheduled workout');
 }else{
  await report('No upcoming QA workout visible: reminder export not exercised',false);
  throw Error('Upcoming synthetic workout failed to appear');
 }
 await page.goto(origin+'/#/progressi');
 await page.getByRole('link',{name:/Analisi avanzate, promemoria e report/i}).waitFor();
 await shot('03-progressi-mobile-reale-QA.png');
 await report('Progress page displays advanced analysis entry point');
 await page.goto(origin+'/#/analisi');
 await page.getByRole('heading',{name:'La tua evoluzione',exact:true}).waitFor();
 await page.setViewportSize({width:1440,height:900});
 await shot('04-analisi-desktop-reale-QA.png');
 await report('Real app Analysis page rendered at desktop width');
 assert.deepEqual(errors,[],'No unhandled browser exceptions');
 await report('No unhandled browser exceptions');
 await writeFile(path.join(output,'checks.json'),JSON.stringify({
  environment:'QA LOCAL DISPOSABLE — NOT PRODUCTION',
  snapshot:'45b403705c2de368c781a2ca1ec52667c0a8b5da',
  role:me.user.role,syntheticUser:me.user.name,
  browser:'Chromium via Playwright',mobileViewport:'390x844 @2x',
  result:'PASS',checks:results
 },null,2));
} catch(error) {
 console.error('QA screenshot run failed:',error);
 await shot('failure-qa.png').catch(()=>{});
 await writeFile(path.join(output,'checks.json'),JSON.stringify({
  environment:'QA LOCAL DISPOSABLE — NOT PRODUCTION',
  result:'FAIL',message:error.message,checks:results,browserErrors:errors
 },null,2)).catch(()=>{});
 process.exitCode=1;
} finally {
 await context.close().catch(()=>{});
 await browser.close().catch(()=>{});
}
