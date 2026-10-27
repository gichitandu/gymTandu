import {spawnSync} from 'node:child_process';
import {generateKeyPairSync} from 'node:crypto';
import {readFile,writeFile,access} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
export async function updatePushService({run,configure,log,generate=()=>generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({format:'jwk'})}){
 let secrets;try{secrets=JSON.parse(await run(['secret','list','--format=json']));}catch{await run(['login'],{interactive:true});secrets=JSON.parse(await run(['secret','list','--format=json']));}
 if(!Array.isArray(secrets)||!secrets.some(s=>s.name==='CALENDAR_RELAY_SECRET'))throw Error('Chiave calendario non trovata: usa l’account e la cartella originali. La procedura non genera o sostituisce questa chiave.');
 await configure();
 log('Aggiorno lo schema senza cancellare calendari o dati.');
 await run(['d1','execute','gymtrack-calendar','--remote','--file=schema.sql','--yes'],{interactive:true});
 log('Pubblico il servizio con il controllo dei promemoria ogni minuto.');
 await run(['deploy'],{interactive:true});
 if(!secrets.some(s=>s.name==='PUSH_VAPID_PRIVATE_JWK')){
  const jwk=generate();if(jwk.kty!=='EC'||jwk.crv!=='P-256'||!jwk.d||!jwk.x||!jwk.y)throw Error('Generazione chiave push non riuscita.');
  await run(['secret','put','PUSH_VAPID_PRIVATE_JWK'],{input:JSON.stringify(jwk),sensitive:true});
  log('Chiave push generata e caricata come segreto. Non è necessario copiarla.');
 }else log('Chiave push esistente mantenuta.');
 log('Aggiornamento completato. La chiave del calendario è rimasta invariata.');
 log('Ora aggiorna GymTrack sull’iPhone e apri Profilo > Impostazioni > Promemoria allenamento.');
 log('Premi Attiva su questo dispositivo, consenti le notifiche e usa Invia prova. Orario predefinito: 08:30, Roma.');
}
async function main(){
 if(process.platform!=='win32')throw Error('Questo avvio richiede Windows.');
 const cli=path.join(root,'.installer','node_modules','wrangler','bin','wrangler.js');let config;
 try{await access(cli);config=JSON.parse(await readFile(path.join(root,'wrangler.jsonc'),'utf8'));}catch{throw Error('Copia tutti i file di questo aggiornamento nella cartella calendar-relay ORIGINALE, accanto ad AVVIA-WINDOWS.cmd.');}
 if(config.name!=='gymtrack-calendar'||!config.d1_databases?.some(d=>d.binding==='DB'&&/^[a-f0-9-]{36}$/i.test(d.database_id)))throw Error('Configurazione originale del database non trovata. Non sovrascrivere wrangler.jsonc.');
 await updatePushService({
  log:message=>console.log(message),
  configure:async()=>{config.triggers={...config.triggers,crons:['* * * * *']};config.vars={...config.vars,PUSH_SCHEDULER_ENABLED:'true',PUSH_VAPID_SUBJECT:config.vars?.PUSH_VAPID_SUBJECT||'mailto:giacomotanduo004@gmail.com'};config.compatibility_flags=[...new Set([...(config.compatibility_flags||[]),'global_fetch_strictly_public'])];await writeFile(path.join(root,'wrangler.jsonc'),JSON.stringify(config,null,2)+'\n');},
  run:async(args,options={})=>{const result=spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false'},...(options.interactive?{stdio:'inherit'}:{input:options.input})});if(result.error||result.status!==0){if(!options.sensitive&&result.stderr)console.error(result.stderr);throw Error('Passaggio non completato: '+args.slice(0,2).join(' ')+'. Puoi rieseguire l’aggiornamento.');}return result.stdout||'';}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
