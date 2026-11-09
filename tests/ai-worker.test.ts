import {beforeEach,afterEach,it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {api} from '../worker/index.js';
import {mealImage,mealSanitize,mealReserveNeurons} from '../worker/ai.js';
const origin='https://gymtrack.test',owner='giacomotanduo004@gmail.com';
// JPEG minimale sintetico: inizia con FF D8 FF, come ogni file JPEG.
const photo='data:image/jpeg;base64,'+Buffer.from([0xff,0xd8,0xff,0xe0,0,16,74,70,73,70,0,1]).toString('base64');
let sql:DatabaseSync,env:any,calls:any[];
function request(path:string,body?:unknown,options:{cookie?:string;origin?:string}={}){
 return new Request(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':owner,...(body===undefined?{}:{Origin:options.origin||origin,'Content-Type':'application/json'}),...(options.cookie?{Cookie:options.cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
const call=(path:string,body?:unknown,options:any={})=>api(request(path,body,options),env);
async function activate(){const response=await call('auth/setup',{password:'owner-password-123'});expect(response.status).toBe(200);return response.headers.get('set-cookie')!.split(';')[0];}
const modelAnswer={is_food:true,note:'Condimento non visibile.',items:[
 {name:'Pasta al pomodoro',grams:250,kcal:380,protein:12,carbs:70,fat:6,confidence:'medium'},
 {name:'Parmigiano',grams:10,kcal:900,protein:3.5,carbs:0,fat:2.8,confidence:'high'},
]};
beforeEach(()=>{
 sql=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
 calls=[];
 env={DB:{prepare:(query:string)=>{let args:any[]=[];const statement={bind:(...values:any[])=>{args=values;return statement;},first:async()=>sql.prepare(query).get(...args),all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}})};return statement;},batch:async(statements:any[])=>{sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}},
  AI:{run:async(model:string,input:any)=>{calls.push({model,input});return {response:modelAnswer};}}};
});
afterEach(()=>sql.close());

it('requires a signed-in account and an enabled AI binding',async()=>{
 expect((await call('ai/meal-scan',{image:photo})).status).toBe(401);
 const cookie=await activate();
 const without={...env,AI:undefined};
 const response=await api(request('ai/meal-scan',{image:photo},{cookie}),without);
 expect(response.status).toBe(503);expect(calls).toEqual([]);
});

it('analyses a photo, keeps it out of storage and returns validated meal items',async()=>{
 const cookie=await activate();
 const response=await call('ai/meal-scan',{image:photo,note:'  circa 250 g di pasta  '},{cookie});
 expect(response.status).toBe(200);
 const result=await response.json();
 expect(calls).toHaveLength(1);
 expect(calls[0].model).toBe('@cf/google/gemma-3-12b-it');
 const content=calls[0].input.messages[1].content;
 expect(content[1].image_url.url).toBe(photo);expect(content[0].text).toContain('circa 250 g di pasta');
 expect(result.isFood).toBe(true);expect(result.items).toHaveLength(2);
 // Le kcal coerenti con i macro restano; quelle impossibili vengono riallineate (3,5 P + 2,8 F = 39 kcal).
 expect(result.items[0]).toMatchObject({name:'Pasta al pomodoro',grams:250,calories:380,confidence:'medium'});
 expect(result.items[1].calories).toBe(39);expect(result.adjusted).toBe(true);
 expect(result.quota).toEqual({used:1,limit:5});expect(result.budget.state).toBe('ok');
 expect(JSON.stringify(result)).not.toContain('base64');
});

it('rejects invalid or oversized photos before using any AI quota',async()=>{
 const cookie=await activate();
 for(const image of [undefined,'',123,'data:image/png;base64,AAAA','data:image/jpeg;base64,AAAA','https://example.test/a.jpg'])
  expect((await call('ai/meal-scan',{image},{cookie})).status).toBe(400);
 const big='data:image/jpeg;base64,/9j/'+'A'.repeat(900000);
 expect((await call('ai/meal-scan',{image:big},{cookie})).status).toBe(413);
 expect(calls).toEqual([]);
 expect(sql.prepare("SELECT COUNT(*) AS n FROM login_limits WHERE id LIKE 'ai:%'").get()!.n).toBe(0);
});

it('limits analyses per account and per day, and refunds failed ones',async()=>{
 const cookie=await activate();env.AI_DAILY_LIMIT='2';
 for(let i=0;i<2;i++)expect((await call('ai/meal-scan',{image:photo},{cookie})).status).toBe(200);
 const limited=await call('ai/meal-scan',{image:photo},{cookie});
 expect(limited.status).toBe(429);expect((await limited.json()).error).toContain('domani');
 expect(calls).toHaveLength(2);
 expect(sql.prepare("SELECT attempts FROM login_limits WHERE id LIKE 'ai:user:%'").get()!.attempts).toBe(2);
 // Un'analisi non riuscita per colpa del servizio non consuma la quota.
 sql.exec("DELETE FROM login_limits WHERE id LIKE 'ai:%'");
 env.AI={run:async()=>{throw Error('capacity exceeded');}};
 const failed=await call('ai/meal-scan',{image:photo},{cookie});
 expect(failed.status).toBe(503);expect((await failed.json()).error).not.toContain('capacity');
 expect(sql.prepare("SELECT attempts FROM login_limits WHERE id LIKE 'ai:user:%'").get()!.attempts).toBe(0);
 expect(sql.prepare("SELECT attempts FROM login_limits WHERE id LIKE 'ai:global:%'").get()!.attempts).toBe(0);
});

it('treats unreadable model output as a retryable error that costs the user nothing',async()=>{
 const cookie=await activate();
 env.AI={run:async()=>({response:'non è json'})};
 const response=await call('ai/meal-scan',{image:photo},{cookie});
 expect(response.status).toBe(502);
 expect(sql.prepare("SELECT attempts FROM login_limits WHERE id LIKE 'ai:user:%'").get()!.attempts).toBe(0);
 // Il modello ha comunque consumato calcolo: la quota globale non viene restituita.
 expect(sql.prepare("SELECT attempts FROM login_limits WHERE id LIKE 'ai:global:%'").get()!.attempts).toBe(mealReserveNeurons());
});

it('reads both Workers AI response shapes and reports real token usage',async()=>{
 const cookie=await activate();
 env.AI={run:async()=>({choices:[{message:{content:JSON.stringify(modelAnswer)}}],usage:{prompt_tokens:1000,completion_tokens:300}})};
 const response=await call('ai/meal-scan',{image:photo},{cookie});
 expect(response.status).toBe(200);expect((await response.json()).items).toHaveLength(2);
 // 1000 token in + 300 out sono circa 47 neuroni (x1,2 di prudenza): si carica al minimo del 30% della riserva.
 const used=sql.prepare("SELECT attempts FROM login_limits WHERE id LIKE 'ai:global:%'").get()!.attempts as number;
 expect(used).toBe(Math.ceil(mealReserveNeurons()*0.3));
 expect(used).toBeLessThan(mealReserveNeurons());
});

it('stops everyone when one more analysis could pass 95% of the allowance',async()=>{
 const cookie=await activate();
 const reserve=mealReserveNeurons();
 // Quota piccola: la prima analisi porta l'uso tra il 90% e la soglia di stop.
 env.AI_DAILY_NEURONS=String(Math.ceil(reserve/0.93));env.AI_DAILY_LIMIT='50';
 const allowance=Number(env.AI_DAILY_NEURONS);
 expect(reserve).toBeGreaterThanOrEqual(allowance*0.9);expect(reserve).toBeLessThanOrEqual(allowance*0.95);
 expect(await (await call('ai/budget',undefined,{cookie})).json()).toMatchObject({state:'ok',percent:0});
 const first=await call('ai/meal-scan',{image:photo},{cookie});expect(first.status).toBe(200);
 const warned=(await first.json()).budget;expect(warned.state).toBe('stopped');
 expect(warned.message).toContain('pausa');
 expect(await (await call('ai/budget',undefined,{cookie})).json()).toMatchObject({state:'stopped'});
 // Da qui nessuno può più usare l'AI, e il modello non viene chiamato.
 const blocked=await call('ai/meal-scan',{image:photo},{cookie});
 expect(blocked.status).toBe(429);expect((await blocked.json()).error).toContain('domani');
 expect(calls).toHaveLength(1);
 expect(sql.prepare("SELECT attempts FROM login_limits WHERE id LIKE 'ai:global:%'").get()!.attempts).toBe(reserve);
});

it('shows a warning state between 90% and the stop threshold, and never exceeds 95%',async()=>{
 const cookie=await activate();
 const reserve=mealReserveNeurons();
 env.AI_DAILY_LIMIT='100';env.AI_DAILY_NEURONS='10000';
 // Usa risposte con consumo noto: 1 analisi = 30% della riserva.
 env.AI={run:async()=>({response:modelAnswer,usage:{prompt_tokens:10,completion_tokens:10}})};
 const per=Math.ceil(reserve*0.3);
 sql.exec(`INSERT INTO login_limits(id,attempts,reset_at) VALUES('ai:global:${new Date().toISOString().slice(0,10)}',${9000-per},${Date.now()+3600000})`);
 const reached=await call('ai/meal-scan',{image:photo},{cookie});
 expect(reached.status).toBe(200);
 const budget=(await reached.json()).budget;
 expect(budget).toMatchObject({state:'warning',percent:90});expect(budget.message).toContain('90%');
 // Continua finché la prossima analisi (nel caso peggiore) supererebbe il 95%.
 let guard=0,status=200;
 while(status===200&&guard++<100)status=(await call('ai/meal-scan',{image:photo},{cookie})).status;
 expect(status).toBe(429);
 const used=sql.prepare("SELECT attempts FROM login_limits WHERE id LIKE 'ai:global:%'").get()!.attempts as number;
 expect(used+reserve).toBeGreaterThan(9500);expect(used).toBeLessThanOrEqual(9500);
});

it('reports the AI as unavailable when the binding is missing',async()=>{
 const cookie=await activate();
 const response=await api(request('ai/budget',undefined,{cookie}),{...env,AI:undefined});
 expect(await response.json()).toMatchObject({state:'unavailable'});
 expect((await call('ai/budget')).status).toBe(401);
});

it('accepts only JPEG data URLs within the size limit',()=>{
 expect(mealImage(photo)).toBe(photo);
 expect(()=>mealImage('data:image/jpeg;base64,/9j/'+'A'.repeat(900000))).toThrow();
 expect(()=>mealImage(photo+'<script>')).toThrow();
});

it('sanitizes model output: fenced JSON, junk entries, bounds and non-food photos',()=>{
 const fenced='```json\n'+JSON.stringify({is_food:true,note:'x',items:[
  {name:'  Riso   bianco ',grams:150,kcal:195,protein:4,carbs:42,fat:.5,confidence:'high'},
  {name:'',grams:50,kcal:10,protein:1,carbs:1,fat:1,confidence:'low'},
  {name:'Senza grammi',grams:0,kcal:10,protein:1,carbs:1,fat:1,confidence:'low'},
  {name:'Negativo',grams:10,kcal:10,protein:-1,carbs:1,fat:1,confidence:'low'},
  {name:'Enorme',grams:999999,kcal:99999,protein:1,carbs:1,fat:1,confidence:'boh'},
 ]})+'\n```';
 const result=mealSanitize(fenced)!;
 expect(result.items.map(i=>i.name)).toEqual(['Riso bianco','Enorme']);
 expect(result.items[0]).toMatchObject({grams:150,calories:195,confidence:'high'});
 expect(result.items[1]).toMatchObject({grams:2000,calories:17,confidence:'low'});
 expect(mealSanitize({is_food:false,note:'',items:[]})).toMatchObject({isFood:false,items:[]});
 expect(mealSanitize('non json')).toBeNull();expect(mealSanitize({items:'no'})).toBeNull();
});

it('emails the owner once per day at the warning and stop levels, without ever blocking an analysis',async()=>{
 const cookie=await activate();
 const reserve=mealReserveNeurons();
 env.RESEND_API_KEY='re_test_key';env.AI_DAILY_LIMIT='100';env.AI_DAILY_NEURONS='10000';
 env.AI={run:async()=>({response:modelAnswer,usage:{prompt_tokens:10,completion_tokens:10}})};
 const per=Math.ceil(reserve*0.3),sent:any[]=[],realFetch=globalThis.fetch;
 globalThis.fetch=(async(url:string,init:any)=>{sent.push({url,body:JSON.parse(init.body),auth:init.headers.Authorization});return new Response('{}',{status:200});}) as any;
 try{
  sql.exec(`INSERT INTO login_limits(id,attempts,reset_at) VALUES('ai:global:${new Date().toISOString().slice(0,10)}',${9000-per},${Date.now()+3600000})`);
  expect((await call('ai/meal-scan',{image:photo},{cookie})).status).toBe(200);
  expect(sent).toHaveLength(1);
  expect(sent[0].url).toBe('https://api.resend.com/emails');expect(sent[0].auth).toBe('Bearer re_test_key');
  expect(sent[0].body.to).toEqual([owner]);expect(sent[0].body.subject).toContain('90%');
  let guard=0,status=200;
  while(status===200&&guard++<100)status=(await call('ai/meal-scan',{image:photo},{cookie})).status;
  expect(status).toBe(429);
  // Altre richieste bloccate nello stesso giorno non generano altre email.
  for(let i=0;i<3;i++)expect((await call('ai/meal-scan',{image:photo},{cookie})).status).toBe(429);
  expect(sent.map(mail=>mail.body.subject)).toEqual([sent[0].body.subject,'GymTrack: analisi foto in pausa fino a domani']);
  // Senza chiave Resend non parte nulla e le analisi non ne risentono.
  sql.exec("DELETE FROM login_limits WHERE id LIKE 'ai:%'");delete env.RESEND_API_KEY;sent.length=0;
  sql.exec(`INSERT INTO login_limits(id,attempts,reset_at) VALUES('ai:global:${new Date().toISOString().slice(0,10)}',${9000-per},${Date.now()+3600000})`);
  expect((await call('ai/meal-scan',{image:photo},{cookie})).status).toBe(200);expect(sent).toEqual([]);
 }finally{globalThis.fetch=realFetch;}
});
