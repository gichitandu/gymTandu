import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {excelImportsApi,appFeaturesApi,validateImportedProgramOverlaps,EXCEL_FILE_LIMIT_BYTES} from '../worker/program-imports.js';
let sql:DatabaseSync,env:any;
const alice={id:'alice',role:'User'},bob={id:'bob',role:'User'},admin={id:'admin',role:'SuperAdmin'},origin='https://gymtrack.test';
const bytes=Uint8Array.of(0x50,0x4b,3,4,1,2,3,4,5,6,7,8);
const hash=async(value:string|ArrayBufferView)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value))].map(n=>n.toString(16).padStart(2,'0')).join('');
const objects=new Map<string,Uint8Array>();
function request(path='/api/excel-imports',method='GET',body?:any,headers:Record<string,string>={}){return new Request(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});}
async function payload(extra:any={}){return{id:'import-one',planId:'excel-plan-import-one',sourceName:'Scheda personalizzata.xlsx',fileHash:await hash(bytes),fileBase64:Buffer.from(bytes).toString('base64'),planName:'Massa',startDate:'2026-11-02',endDate:'2026-12-25',weeks:8,...extra};}
async function stage(extra:any={},user=alice){return excelImportsApi(request('/api/excel-imports','POST',await payload(extra)),env,user);}
async function publish(body:any,user=alice){
 const text=JSON.stringify({app:'GymTrack',schemaVersion:6,data:body}),scope=await hash('account:'+user.id),key='test-archive-'+user.id;
 objects.set(key,new TextEncoder().encode(text));sql.prepare('INSERT INTO archive_heads(scope,revision,object_key,updated_at,size_bytes,content_hash) VALUES(?,1,?,?,?,?) ON CONFLICT(scope) DO UPDATE SET object_key=excluded.object_key,content_hash=excluded.content_hash').run(scope,key,Date.now(),text.length,await hash(text));
 return key;
}
async function archive(extra:any={}){const p=await payload();return{plans:[{id:p.planId,name:'Massa',program:{importId:p.id,fileHash:p.fileHash,startDate:p.startDate,endDate:p.endDate,weeks:p.weeks}}],scheduledWorkouts:[],workouts:[],...extra};}
beforeEach(()=>{
 objects.clear();sql=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(name=>/^000[0-7]_.*\.sql$/.test(name)).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
 for(const user of [alice,bob,admin])sql.prepare('INSERT INTO users(id,email,name,role,salt,password_hash,created_at) VALUES(?,?,?,?,?,?,?)').run(user.id,user.id+'@example.test',user.id,user.role,'synthetic-salt','synthetic-hash',1);
 env={DB:{prepare:(query:string)=>{let args:any[]=[];const statement={bind:(...values:any[])=>{args=values;return statement;},first:async()=>sql.prepare(query).get(...args),all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}})};return statement;}},BUCKET:{put:vi.fn(async(key:string,value:string|Uint8Array)=>{objects.set(key,typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value));}),get:vi.fn(async(key:string)=>{const value=objects.get(key);return value?{text:async()=>new TextDecoder().decode(value),arrayBuffer:async()=>value.slice().buffer}:null;}),delete:vi.fn(async(key:string)=>objects.delete(key))}};
});
afterEach(()=>{sql.close();vi.restoreAllMocks();});
it('requires an account and keeps staged originals out of confirmed listings and downloads',async()=>{
 expect((await excelImportsApi(request(),env,null)).status).toBe(401);expect((await appFeaturesApi(request('/api/app-features'),env,null)).status).toBe(401);
 expect((await stage({userId:'bob'})).status).toBe(201);
 expect(sql.prepare('SELECT user_id FROM excel_import_files').get()!.user_id).toBe('alice');
 expect(await (await excelImportsApi(request(),env,alice)).json()).toEqual({imports:[]});
 expect((await excelImportsApi(request('/api/excel-imports/import-one/file'),env,alice)).status).toBe(404);
 expect((await excelImportsApi(request('/api/excel-imports/import-one/confirm','POST',{}),env,alice)).status).toBe(409);
});
it('confirms only a matching saved account plan and downloads the exact immutable original',async()=>{
 await stage();await publish(await archive());
 const confirmed=await excelImportsApi(request('/api/excel-imports/import-one/confirm','POST',{}),env,alice);
 expect(confirmed.status).toBe(200);expect((await confirmed.json() as any).import.status).toBe('active');
 const list=await (await excelImportsApi(request(),env,alice)).json() as any;expect(list.imports).toHaveLength(1);expect(list.imports[0].sourceName).toBe('Scheda personalizzata.xlsx');expect(JSON.stringify(list)).not.toContain('excel-imports/');
 const file=await excelImportsApi(request('/api/excel-imports/import-one/file'),env,alice);expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);expect(file.headers.get('content-type')).toContain('spreadsheetml');expect(file.headers.get('content-disposition')).toContain('attachment');expect(file.headers.get('cache-control')).toBe('private, no-store');
 const before=sql.prepare('SELECT confirmed_at FROM excel_import_files').get();await excelImportsApi(request('/api/excel-imports/import-one/confirm','POST',{}),env,alice);expect(sql.prepare('SELECT confirmed_at FROM excel_import_files').get()).toEqual(before);
});
it('reports a late server overlap for the staged import even when its local plan was never committed online',async()=>{
 await stage();const data={plans:[{id:'other',name:'Altro piano'}],scheduledWorkouts:[{id:'other-date',planId:'other',dayName:'Seduta esistente',planName:'Altro piano',date:'2026-11-05'}],workouts:[]};await publish(data);
 const before=sql.prepare('SELECT * FROM archive_heads').all(),response=await excelImportsApi(request('/api/excel-imports/import-one/confirm','POST',{}),env,alice),body=await response.json() as any;
 expect(response.status).toBe(409);expect(body.code).toBe('PLAN_OVERLAP');expect(body.error).toContain('2026-11-05');expect(sql.prepare('SELECT * FROM archive_heads').all()).toEqual(before);expect(sql.prepare('SELECT confirmed_at FROM excel_import_files').get()!.confirmed_at).toBeNull();
});
it('does not let other accounts or a Super Admin inspect or confirm somebody else’s files',async()=>{
 await stage();await publish(await archive());await excelImportsApi(request('/api/excel-imports/import-one/confirm','POST',{}),env,alice);
 for(const user of [bob,admin]){
  expect(await (await excelImportsApi(request(),env,user)).json()).toEqual({imports:[]});
  expect((await excelImportsApi(request('/api/excel-imports/import-one/file'),env,user)).status).toBe(404);
  expect((await excelImportsApi(request('/api/excel-imports/import-one/confirm','POST',{}),env,user)).status).toBe(404);
 }
 expect((await stage({},bob)).status).toBe(201);expect(sql.prepare('SELECT COUNT(*) AS n FROM excel_import_files').get()!.n).toBe(2);
});
it('deduplicates stage retries and never overwrites an existing import ID with changed bytes',async()=>{
 expect((await stage()).status).toBe(201);expect((await stage()).status).toBe(200);expect(env.BUCKET.put).toHaveBeenCalledOnce();
 expect((await stage({id:'retry-other-id'})).status).toBe(200);expect(env.BUCKET.put).toHaveBeenCalledOnce();
 expect((await stage({planId:'another-plan'})).status).toBe(409);expect((await stage({fileHash:'a'.repeat(64)})).status).toBe(400);expect(sql.prepare('SELECT COUNT(*) AS n FROM excel_import_files').get()!.n).toBe(1);
});
it('returns all confirmed Excel files rather than silently truncating older plans',async()=>{
 const insert=sql.prepare('INSERT INTO excel_import_files(user_id,id,plan_id,source_name,content_hash,object_key,size_bytes,start_date,end_date,weeks,plan_name,imported_at,confirmed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
 for(let i=0;i<1001;i++)insert.run('alice','file-'+i,'plan-'+i,'Piano.xlsx',i.toString(16).padStart(64,'0'),'object-'+i,12,'2026-11-02','2026-12-25',8,'Piano '+i,i,1);
 const response=await excelImportsApi(request(),env,alice);expect((await response.json() as any).imports).toHaveLength(1001);
});
it('requires program metadata to match the original file and exposes a renamed or completed plan without modifying the original',async()=>{
 await stage();const data=await archive();data.plans[0].program.importId='forged';await publish(data);
 expect((await excelImportsApi(request('/api/excel-imports/import-one/confirm','POST',{}),env,alice)).status).toBe(409);
 data.plans[0].program.importId='import-one';Object.assign(data.plans[0],{name:'Nome modificato',completedAt:'2026-12-26T12:00:00Z'});await publish(data);
 expect((await excelImportsApi(request('/api/excel-imports/import-one/confirm','POST',{}),env,alice)).status).toBe(200);
 const list=await (await excelImportsApi(request(),env,alice)).json() as any;expect(list.imports[0]).toMatchObject({planName:'Nome modificato',status:'completed',sourceName:'Scheda personalizzata.xlsx'});
});
it.each([{sourceName:'../file.xlsx'},{sourceName:'bad\r\nfile.xlsx'},{sourceName:'file.xlsm'},{startDate:'2026-02-30'},{endDate:'2026-01-01'},{weeks:0},{fileBase64:'not base64'}])('rejects malformed file metadata before persisting %j',async extra=>{
 expect((await stage(extra)).status).toBe(400);expect(env.BUCKET.put).not.toHaveBeenCalled();
});
it('bounds uploads, rejects invalid JSON shapes and cross-origin writes, and preserves completed files after corruption',async()=>{
 expect((await excelImportsApi(request('/api/excel-imports','POST',{}, {'Content-Length':String(EXCEL_FILE_LIMIT_BYTES*2)}),env,alice)).status).toBe(413);
 expect((await excelImportsApi(request('/api/excel-imports','POST',null),env,alice)).status).toBe(400);
 expect((await excelImportsApi(request('/api/excel-imports','POST',await payload(),{Origin:'https://other.test'}),env,alice)).status).toBe(403);
 await stage();await publish(await archive());await excelImportsApi(request('/api/excel-imports/import-one/confirm','POST',{}),env,alice);
 const row=sql.prepare('SELECT * FROM excel_import_files').get()!;objects.set(row.object_key as string,Uint8Array.of(1,2,3));
 expect((await excelImportsApi(request('/api/excel-imports/import-one/file'),env,alice)).status).toBe(503);expect(sql.prepare('SELECT COUNT(*) AS n FROM excel_import_files').get()!.n).toBe(1);
});
it('cannot confirm an import whose plan overlaps existing scheduled or recorded activity',async()=>{
 await stage();const data=await archive({scheduledWorkouts:[{id:'old',planId:'old-plan',planName:'Altro piano',dayName:'Gambe',date:'2026-11-03'}]});await publish(data);
 const response=await excelImportsApi(request('/api/excel-imports/import-one/confirm','POST',{}),env,alice);expect(response.status).toBe(409);expect((await response.json() as any).error).toContain('2026-11-03');expect(sql.prepare('SELECT confirmed_at FROM excel_import_files').get()!.confirmed_at).toBeNull();
});
it('blocks an overlap already present on the account before staging or changing any stored import',async()=>{
 await publish({plans:[{id:'old',name:'Piano già presente'}],scheduledWorkouts:[{id:'old-session',planId:'old',planName:'Piano già presente',dayName:'Schiena',date:'2026-11-05'}],workouts:[]});
 const before=sql.prepare('SELECT * FROM archive_heads').all(),result=await stage();expect(result.status).toBe(409);expect((await result.json() as any).error).toContain('Piano già presente');expect(env.BUCKET.put).not.toHaveBeenCalled();expect(sql.prepare('SELECT COUNT(*) AS n FROM excel_import_files').get()!.n).toBe(0);expect(sql.prepare('SELECT * FROM archive_heads').all()).toEqual(before);
});
it('blocks overlapping plan periods even on different individual training dates and leaves legacy conflicts alone',()=>{
 const data={plans:[{id:'new',name:'Nuovo',program:{startDate:'2026-11-02',endDate:'2026-12-25'}},{id:'old',name:'Esistente'}],scheduledWorkouts:[{planId:'old',date:'2026-10-30'},{planId:'old',date:'2026-12-30'}],workouts:[]};
 expect(()=>validateImportedProgramOverlaps(data)).toThrow('Sovrapposizione');delete (data.plans[0] as any).program;expect(()=>validateImportedProgramOverlaps(data)).not.toThrow();
});
it('frees the cancelled future of a completed plan but keeps retained future sessions occupied',()=>{
 const data={plans:[{id:'old',name:'Concluso',completedAt:'2026-11-10T20:00:00Z',program:{startDate:'2026-11-02',endDate:'2026-12-25'}},{id:'new',name:'Nuovo',program:{startDate:'2026-11-16',endDate:'2027-01-08'}}],scheduledWorkouts:[{planId:'old',date:'2026-11-09'}],workouts:[]};
 expect(()=>validateImportedProgramOverlaps(data)).not.toThrow();data.scheduledWorkouts.push({planId:'old',date:'2026-11-23'});expect(()=>validateImportedProgramOverlaps(data)).toThrow('Sovrapposizione');
});
it('keeps non-workout calendar activities outside plan overlap checks while preserving workout conflicts',()=>{
 const data:any={plans:[{id:'imported',name:'Programma',program:{startDate:'2026-11-02',endDate:'2026-12-25'}}],scheduledWorkouts:['cardio','mobility','rest','other'].map(kind=>({id:kind,kind,planId:'',dayId:'',planName:'',dayName:kind,date:'2026-11-03',notes:''})),workouts:[]};
 expect(()=>validateImportedProgramOverlaps(data)).not.toThrow();
 for(const kind of [undefined,'workout']){
  const candidate={...data,scheduledWorkouts:[...data.scheduledWorkouts,{id:'real-workout',kind,planId:'other-plan',dayId:'other-day',planName:'Altro piano',dayName:'Gambe',date:'2026-11-03',notes:''}]};
  expect(()=>validateImportedProgramOverlaps(candidate)).toThrow('Sovrapposizione');
 }
 data.workouts.push({id:'historic',planId:'other-plan',date:'2026-11-03'});expect(()=>validateImportedProgramOverlaps(data)).toThrow('Sovrapposizione');
});
it('defaults nutrition to hidden, permits only Super Admin changes and keeps repeat settings idempotent',async()=>{
 expect(await (await appFeaturesApi(request('/api/app-features'),env,alice)).json()).toEqual({nutritionEnabled:false,hubEnabled:false,garageEnabled:false,revision:0,updatedAt:null});
 for(const role of ['User','Admin'])expect((await appFeaturesApi(request('/api/app-features','POST',{nutritionEnabled:true}),env,{...alice,role})).status).toBe(403);
 const change=()=>appFeaturesApi(request('/api/app-features','POST',{nutritionEnabled:true}),env,admin);
 expect((await (await change()).json() as any)).toMatchObject({nutritionEnabled:true,revision:1});expect((await (await change()).json() as any).revision).toBe(1);
 expect((await (await appFeaturesApi(request('/api/app-features','POST',{nutritionEnabled:false}),env,admin)).json() as any)).toMatchObject({nutritionEnabled:false,revision:2});
 expect((await appFeaturesApi(request('/api/app-features','POST',{}),env,admin)).status).toBe(400);
});
it('keeps GT Hub and GT Garage closed until a migrated database lets a Super Admin open them for everyone',async()=>{
 // Prima della migrazione 0012: Pasti funziona, Hub e Garage restano chiusi e non si possono aprire.
 expect((await appFeaturesApi(request('/api/app-features','POST',{hubEnabled:true}),env,admin)).status).toBe(503);
 expect((await (await appFeaturesApi(request('/api/app-features','POST',{nutritionEnabled:true}),env,admin)).json() as any)).toMatchObject({nutritionEnabled:true,hubEnabled:false,garageEnabled:false});
 for(const f of readdirSync('drizzle').filter(name=>/^00(0[89]|1\d)_.*\.sql$/.test(name)).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
 expect(await (await appFeaturesApi(request('/api/app-features'),env,alice)).json()).toMatchObject({nutritionEnabled:true,hubEnabled:false,garageEnabled:false});
 for(const role of ['User','Admin'])expect((await appFeaturesApi(request('/api/app-features','POST',{hubEnabled:true}),env,{...alice,role})).status).toBe(403);
 expect((await appFeaturesApi(request('/api/app-features','POST',{hubEnabled:'yes'}),env,admin)).status).toBe(400);
 expect((await appFeaturesApi(request('/api/app-features','POST',{hubEnabled:true,other:true}),env,admin)).status).toBe(400);
 const hub=await (await appFeaturesApi(request('/api/app-features','POST',{hubEnabled:true}),env,admin)).json() as any;
 expect(hub).toMatchObject({nutritionEnabled:true,hubEnabled:true,garageEnabled:false});
 const garage=await (await appFeaturesApi(request('/api/app-features','POST',{garageEnabled:true}),env,admin)).json() as any;
 expect(garage).toMatchObject({nutritionEnabled:true,hubEnabled:true,garageEnabled:true,revision:hub.revision+1});
 expect((await (await appFeaturesApi(request('/api/app-features','POST',{garageEnabled:true}),env,admin)).json() as any).revision).toBe(garage.revision);
 expect(await (await appFeaturesApi(request('/api/app-features'),env,bob)).json()).toMatchObject({hubEnabled:true,garageEnabled:true});
});
it('adds feature and file tables without resetting account or archive records and can safely reapply the additive migration',async()=>{
 const before=sql.prepare('SELECT id,email,role FROM users ORDER BY id').all();sql.prepare('INSERT INTO archive_heads VALUES(?,?,?,?,?,?)').run('unchanged',4,'old-key',1,8,'old-hash');const head=sql.prepare('SELECT * FROM archive_heads').all();
 await stage();sql.exec(readFileSync('drizzle/0007_excel_imports_features.sql','utf8'));expect(sql.prepare('SELECT id,email,role FROM users ORDER BY id').all()).toEqual(before);expect(sql.prepare('SELECT * FROM archive_heads').all()).toEqual(head);expect(sql.prepare('SELECT COUNT(*) AS n FROM excel_import_files').get()!.n).toBe(1);
});
