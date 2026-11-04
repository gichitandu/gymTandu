// Disposable loopback archive only. Never connects to the live GymTrack Site.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {chromium} = await import(process.env.GYMTRACK_PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.GYMTRACK_QA_OUTPUT || 'docs/qa/training-upgrades';
await mkdir(output, {recursive: true});
const origin = 'http://localhost:4173', password = 'fixture-only-test-password';
const browser = await chromium.launch({executablePath: process.env.GYMTRACK_CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']});
const context = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, serviceWorkers: 'block'});
const page = await context.newPage(), errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
page.setDefaultTimeout(12000);
const mark = text => {results.push(text); console.log('PASS', text);};
const read = () => page.evaluate(async () => {
  for (const {name} of await indexedDB.databases()) {
    const db = await new Promise(resolve => {const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result);});
    if (!db.objectStoreNames.contains('workouts')) {db.close(); continue;}
    const names = [...db.objectStoreNames].filter(name => name !== 'archiveMeta'), tx = db.transaction(names, 'readonly');
    const data = await Promise.all(names.map(name => new Promise(resolve => {const request = tx.objectStore(name).getAll(); request.onsuccess = () => resolve([name, request.result]);}))).then(Object.fromEntries);
    db.close(); return data;
  }
  throw Error('QA archive missing');
});
const waitFor = async (predicate, label) => {
  for (let attempts = 0; attempts < 60; attempts++) {if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100));}
  throw Error('Timed out: ' + label);
};
const settings = async () => {
  await page.goto(origin + '/#/profilo?section=settings');
  await page.getByText('Unità e allenamento', {exact: true}).click();
  await page.getByRole('switch', {name: 'Riusa settimana precedente per impostazione predefinita'}).waitFor();
};
const openWeek = async (week = 2) => {
  await page.goto(origin + '/#/piani');
  await page.getByRole('button', {name: 'I miei piani', exact: true}).click();
  const title = page.locator('.simple-plan-title').filter({hasText: 'Programma QA otto settimane'});
  if (await title.getAttribute('aria-expanded') !== 'true') await title.click();
  await page.locator('.program-week-picker select').selectOption({label: 'Settimana ' + week + ' / 8'});
  const day = page.locator('.simple-day').first(); await day.locator('summary.simple-day-summary').click(); return day;
};
const startPrompt = async () => {
  const day = await openWeek(); await day.getByRole('button', {name: 'Inizia', exact: true}).click();
  const dialog = page.locator('gt-workout-start-options dialog[open]'); await dialog.waitFor(); return dialog;
};
const discard = async () => {
  await page.locator('.session-simple-options summary').click();
  await page.getByRole('button', {name: 'Elimina sessione aperta', exact: true}).click();
  await page.locator('gt-confirmation-dialog dialog[open] .dialog-primary').click();
  await page.waitForURL(origin + '/#/');
  await page.locator('main [data-design-id="home.goals"]').waitFor();
};
const current = async () => {const data = await read(), workout = data.workouts.find(row => row.status === 'draft'), exercise = data.workoutExercises.find(row => row.workoutId === workout?.id); return {data, workout, exercise, sets: data.sets.filter(row => row.workoutExerciseId === exercise?.id).sort((a,b) => a.number-b.number)};};
try {
  await context.request.post(origin + '/api/auth/setup', {headers: {Origin: origin}, data: {password}});
  const login = await context.request.post(origin + '/api/auth/login', {headers: {Origin: origin}, data: {email: 'giacomotanduo004@gmail.com', password}});
  assert(login.ok());
  await page.goto(origin + '/#/'); await page.locator('main [data-design-id="home.goals"]').waitFor();
  await page.evaluate(async () => {
    let db;
    for (const {name} of await indexedDB.databases()) {const candidate = await new Promise(resolve => {const request=indexedDB.open(name); request.onsuccess=()=>resolve(request.result);}); if(candidate.objectStoreNames.contains('workouts')) {db=candidate;break;} candidate.close();}
    const tables = ['plans','days','planExercises','workouts','workoutExercises','sets','scheduledWorkouts','workoutUi','settings','archiveMeta'], tx=db.transaction(tables,'readwrite');
    const local = date => new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10), today = new Date(), start = new Date(today); start.setDate(start.getDate()-7);
    const at = offset => {const date=new Date(start);date.setDate(date.getDate()+offset);return local(date);}, stamp = new Date().toISOString();
    for(const name of tables) if(!['settings','archiveMeta'].includes(name)) tx.objectStore(name).clear();
    tx.objectStore('plans').put({id:'qa-plan',userId:'local',name:'Programma QA otto settimane',description:'Fixture locale',active:true,archived:false,createdAt:stamp,updatedAt:stamp,program:{importId:'qa-import',sourceName:'QA.xlsx',sourceKind:'original',startDate:at(0),endDate:at(55),weeks:8,fileHash:'a'.repeat(64),importedAt:stamp,sessionCount:16}});
    for(let week=1;week<=8;week++) for(let slot=0;slot<2;slot++) {
      const id=`qa-w${week}-${slot}`, date=at((week-1)*7+slot*3);
      tx.objectStore('days').put({id,planId:'qa-plan',name:slot?'Seduta B':'Seduta A',order:(week-1)*2+slot,week,weekday:new Date(date+'T12:00:00').getDay(),sessionDate:date});
      tx.objectStore('planExercises').put({id:'pe-'+id,dayId:id,exerciseId:'exercise-0',sets:week===2?4:3,repsMin:week===2?6:8,repsMax:10,rest:90,warmupSets:1,targetWeight:10,notes:'Tecnica controllata',order:0});
      tx.objectStore('scheduledWorkouts').put({id:'event-'+id,dayId:id,planId:'qa-plan',planName:'Programma QA otto settimane',dayName:slot?'Seduta B':'Seduta A',date,notes:'',...(week===1&&slot===0?{workoutId:'qa-old'}:{})});
    }
    tx.objectStore('workouts').put({id:'qa-old',userId:'local',planId:'qa-plan',dayId:'qa-w1-0',planName:'Programma QA otto settimane',dayName:'Seduta A',date:at(0),startedAt:at(0)+'T12:00:00Z',endedAt:at(0)+'T12:30:00Z',duration:30,notes:'Fonte immutabile',status:'completed',programWeek:1});
    tx.objectStore('workoutExercises').put({id:'qa-old-ex',workoutId:'qa-old',exerciseId:'exercise-0',name:'Panca piana bilanciere',loadMode:'external',order:0,rest:90,notes:''});
    [[20,12,'warmup'],[40,6,'warmup'],[60,10,'work'],[62.5,9,'work'],[65,8,'work']].forEach(([weight,reps,kind],index)=>tx.objectStore('sets').put({id:'qa-old-set-'+index,workoutExerciseId:'qa-old-ex',number:index+1,weight,reps,kind,rest:kind==='warmup'?45:90,notes:'',completed:true}));
    const settings=tx.objectStore('settings'), request=settings.get('local');request.onsuccess=()=>{const row=request.result;row.prefill=true;row.gymMode=false;delete row.reusePreviousWeek;settings.put(row);};
    const revision=tx.objectStore('archiveMeta'), rev=revision.get('revision');rev.onsuccess=()=>revision.put({id:'revision',value:(rev.result?.value||0)+1});
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  });
  await page.reload(); await page.locator('main [data-design-id="home.goals"]').waitFor();
  const original = await read(), history = {workout: original.workouts.find(row=>row.id==='qa-old'), exercise: original.workoutExercises.find(row=>row.id==='qa-old-ex'),sets: original.sets.filter(row=>row.workoutExerciseId==='qa-old-ex')};
  let prompt = await startPrompt();
  assert(await prompt.getByRole('checkbox').isChecked());
  await prompt.getByRole('button',{name:'Annulla',exact:true}).click();
  assert(!(await read()).workouts.some(row=>row.status==='draft'));
  mark('Weekly default is ON; cancelling preparation creates no workout or sets');
  await settings(); const toggle = page.getByRole('switch',{name:'Riusa settimana precedente per impostazione predefinita'});
  await toggle.click(); await waitFor(async()=> (await read()).settings[0].reusePreviousWeek===false,'saved weekly default');
  await page.reload(); await page.getByText('Unità e allenamento', {exact: true}).click(); await toggle.waitFor(); assert.equal(await toggle.getAttribute('aria-checked'),'false');
  await page.getByText('Icona e collegamento Home',{exact:true}).click();
  assert.equal(await page.getByLabel('Link diretto di GymTrack').inputValue(), origin+'/');
  assert.equal(await page.getByRole('link',{name:'Apri GymTrack direttamente'}).getAttribute('target'),'_top');
  await page.screenshot({path:output+'/settings-and-install-mobile.png',fullPage:true});
  mark('Settings persist the OFF default and provide the direct app installation link');
  prompt = await startPrompt(); assert(!(await prompt.getByRole('checkbox').isChecked()));
  await prompt.getByRole('button',{name:'Inizia allenamento',exact:true}).click();
  await page.locator('gt-active-workout').waitFor();
  let state=await current(); assert.equal(state.sets.filter(row=>row.kind==='warmup').length,1); assert.deepEqual(state.sets.filter(row=>row.kind==='work').map(row=>row.weight),[10,10,10,10]);
  mark('Weekly opt-out overrides legacy prefill and preserves the new-week prescription');
  await discard(); prompt = await startPrompt(); await prompt.getByRole('checkbox').check();
  await prompt.getByRole('button',{name:'Inizia allenamento',exact:true}).click();await page.locator('gt-active-workout').waitFor();
  state=await current(); assert.equal(state.sets.filter(row=>row.kind==='warmup').length,2);assert.deepEqual(state.sets.filter(row=>row.kind==='work').map(row=>[row.weight,row.reps]),[[60,6],[62.5,6],[65,6],[65,6]]);assert(state.sets.every(row=>!row.completed));
  mark('Per-session opt-in copies both warmups and weights without completing sets or replacing current-week reps');
  await page.locator('.training-list-row').first().click();
  await page.getByRole('button',{name:'Sostituisci esercizio',exact:true}).click();
  let replacement=page.locator('gt-exercise-replacement dialog[open]');await replacement.waitFor();
  await replacement.getByRole('searchbox').fill('Lat machine');
  await replacement.getByLabel('Nuovo esercizio',{exact:true}).selectOption('exercise-4');
  await replacement.getByLabel('Applica la sostituzione',{exact:true}).selectOption('selected');
  assert.equal(await replacement.locator('fieldset').count(),8);
  await replacement.locator('fieldset').filter({has:page.locator('legend',{hasText:'Settimana 7'})}).getByRole('checkbox').nth(1).check();
  assert.match(await replacement.locator('.replacement-summary').innerText(),/2 occorrenze in 2 allenamenti/);
  await page.screenshot({path:output+'/selected-weeks-mobile.png',fullPage:true});
  await replacement.getByRole('button',{name:'Applica sostituzione',exact:true}).click();await replacement.waitFor({state:'detached'});
  state=await current();assert.equal(state.exercise.exerciseId,'exercise-4');assert.equal(state.data.planExercises.filter(row=>row.exerciseId==='exercise-4').length,2);assert(state.sets.every(row=>row.weight===0));
  mark('Exercise replacement selects specific days across eight weeks and resets loads for the new machine');
  const rowId=state.sets[0].id;
  await page.locator('#series-weight').fill('22.5');await page.locator('#series-reps').fill('10');
  await page.getByRole('button',{name:'Salva serie',exact:true}).click();
  await page.getByRole('button',{name:'Continua',exact:true}).click();
  await page.getByRole('button',{name:'Apri serie 1 completata',exact:true}).click();
  await waitFor(async()=>await page.locator('[data-recording-set]').getAttribute('data-recording-set')===rowId,'selected completed row rendered');
  await page.locator('#series-weight').fill('25');
  await page.getByRole('button',{name:'Aggiorna serie',exact:true}).click();
  await waitFor(async()=> (await current()).sets.find(row=>row.id===rowId)?.weight===25,'completed row update');
  assert.equal(await page.locator('[data-recording-set]').getAttribute('data-recording-set'),rowId);
  assert.equal(await page.locator('.recovery-panel').count(),0);
  for(const width of [320,390]) {
    await page.setViewportSize({width,height:844});
    for(let n=0;n<4;n++) {
      await page.getByRole('button',{name:n%2?'Apri serie 1 completata':'Apri serie 3',exact:true}).click();
      const completed=!!(n%2),save=page.locator('.save-series'),label=save.locator('span');
      await waitFor(async () => await label.innerText() === (completed?'Aggiorna serie':'Salva serie'), 'selected series save label');
      assert.equal(await label.innerText(),completed?'Aggiorna serie':'Salva serie');
      assert.equal(await page.locator('[data-save-set]').getAttribute('data-save-set'),await page.locator('[data-recording-set]').getAttribute('data-recording-set'));
      const style=await label.evaluate(el=>{const s=getComputedStyle(el),b=el.getBoundingClientRect();return {color:s.color,opacity:s.opacity,width:b.width,height:b.height,font:s.fontSize};});
      assert(style.width>60&&style.height>14);assert.equal(style.opacity,'1');assert.notEqual(style.color,'rgba(0, 0, 0, 0)');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile horizontal overflow');
    }
  }
  await page.screenshot({path:output+'/save-series-mobile.png',fullPage:true});
  mark('Completed and pending series keep readable labels at 320/390 px; completed edits retain focus and do not open recovery');
  await page.getByRole('button',{name:'Apri serie 3',exact:true}).click();
  await waitFor(async()=>await page.locator('[data-recording-set]').getAttribute('data-recording-set')===state.sets[2].id,'selected pending row rendered');
  await page.locator('#series-weight').fill('37.5');
  await page.getByRole('button',{name:'Dettagli',exact:true}).click();
  await waitFor(async()=> (await current()).sets.some(row=>row.weight===37.5),'pending input flushed before row deletion');
  await page.getByRole('button',{name:'Elimina riscaldamento 1',exact:true}).click();
  await page.locator('gt-confirmation-dialog dialog[open] .dialog-primary').click();
  await waitFor(async()=>await page.locator('.focus-set-item').count()===5,'first deletion rendered and renumbered');
  await page.getByRole('button',{name:'Elimina serie 3',exact:true}).click();
  await waitFor(async()=>await page.locator('.focus-set-item').count()===4,'second deletion rendered');
  state=await current();assert.equal(state.sets.length,4);assert.deepEqual(state.sets.map(row=>row.number),[1,2,3,4]);assert(!state.sets.some(row=>row.id===rowId));
  assert(state.sets.some(row=>row.weight===37.5));
  mark('Individual completed warmup and pending work rows can be removed without losing other pending values');
  const day=await openWeek(3);await day.locator('.simple-exercise-row .simple-menu > summary').click();await day.getByRole('button',{name:'Sostituisci esercizio',exact:true}).click();
  replacement=page.locator('gt-exercise-replacement dialog[open]');await replacement.waitFor();
  await replacement.getByRole('searchbox').fill('Lat machine');
  await replacement.getByLabel('Nuovo esercizio',{exact:true}).selectOption('exercise-4');await replacement.getByLabel('Applica la sostituzione',{exact:true}).selectOption('all');
  assert.match(await replacement.locator('.replacement-summary').innerText(),/14 occorrenze/);
  await replacement.getByRole('button',{name:'Applica sostituzione',exact:true}).click();await replacement.waitFor({state:'detached'});
  const final=await read();assert(final.planExercises.every(row=>row.exerciseId==='exercise-4'));
  assert.deepEqual({workout:final.workouts.find(row=>row.id==='qa-old'),exercise:final.workoutExercises.find(row=>row.id==='qa-old-ex'),sets:final.sets.filter(row=>row.workoutExerciseId==='qa-old-ex')},history);
  mark('Plan-menu replacement updates all remaining occurrences while recorded history stays byte-for-byte unchanged');
  await context.route('**/icons/**',route=>route.fulfill({status:401,contentType:'text/html',body:'Private Site sign-in'}));
  await page.reload();await page.locator('main h1').waitFor();
  const icons=await page.evaluate(async()=>{
    const touch=document.querySelector('link[rel="apple-touch-icon"]').href, manifest=await (await fetch('/manifest.webmanifest')).json();
    const dimension=async src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve([image.naturalWidth,image.naturalHeight]);image.onerror=reject;image.src=src;});
    return {touch,dimensions:await dimension(touch),manifest,manifestDimensions:await Promise.all(manifest.icons.map(icon=>dimension(icon.src))),blocked:(await fetch('/icons/gt-modern-180.png')).status,credentials:document.querySelector('link[rel="manifest"]').crossOrigin};
  });
  assert.equal(icons.blocked,401);assert.deepEqual(icons.dimensions,[180,180]);assert.equal(icons.credentials,'use-credentials');assert(icons.manifest.icons.every(icon=>icon.src.startsWith('data:image/png;base64,')));assert.deepEqual(icons.manifestDimensions,[[192,192],[512,512]]);
  assert.equal(createHash('sha256').update(Buffer.from(icons.touch.split(',')[1],'base64')).digest('hex'),'c6d4b408c717a2917ddb573a43265bbe6b638b3ed914cebd616d7e5756aa4904');
  mark('Embedded GT Home Screen icons decode correctly even when private icon URL requests return sign-in HTML');
  assert.deepEqual(errors,[]);mark('No browser exceptions across settings, plans, session recording and all dialogs');
  await writeFile(output+'/browser-qa.txt',results.map(row=>'PASS '+row).join('\n')+'\n');
} catch(error) {await page.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{});await writeFile(output+'/failure.json',JSON.stringify({errors,url:page.url(),archive:await read().catch(()=>null),text:await page.locator('body').innerText()},null,2));throw error;}
finally {await browser.close();}
