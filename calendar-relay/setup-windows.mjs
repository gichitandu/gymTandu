import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {createInterface} from 'node:readline/promises';
const root=path.dirname(fileURLToPath(import.meta.url));
export function jsonList(output){
 // Wrangler's JSON mode must be parseable; never guess after a failed command.
 const text=output.replace(/\x1b\[[0-9;]*m/g,'').trim();
 let result;try{result=JSON.parse(text);}catch{throw Error('Risposta Cloudflare non leggibile. Riprova; nessun identificativo verra\u0300 indovinato.');}
 if(!Array.isArray(result))throw Error('Elenco Cloudflare non valido.');return result;
}
export function workerUrl(output){
 let url;try{url=new URL(output.trim());}catch{throw Error('Incolla soltanto l’URL HTTPS workers.dev mostrato da Cloudflare.');}
 if(url.protocol!=='https:'||!/^gymtrack-calendar\.[a-z0-9-]+\.workers\.dev$/i.test(url.hostname)||url.username||url.password||url.port||url.search||url.hash||url.pathname!=='/')throw Error('URL non valido: usa l’indirizzo del Worker gymtrack-calendar.');
 return url.origin;
}
// All arguments are static or validated; no credentials in command arguments.
export async function provision({run,writeConfig,ask,clipboard,log,secretFactory=()=>randomBytes(32).toString('hex')}){
 log('Accesso a Cloudflare: autorizza nel browser del tuo PC.');
 await run(['login'],{interactive:true});
 let databases=jsonList(await run(['d1','list','--json']));
 let database=databases.find(d=>d.name==='gymtrack-calendar');
 if(!database){await run(['d1','create','gymtrack-calendar','--update-config=false'],{interactive:true});databases=jsonList(await run(['d1','list','--json']));database=databases.find(d=>d.name==='gymtrack-calendar');}
 if(!database||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(database.uuid||''))throw Error('Database non identificato. Procedura interrotta.');
 await writeConfig(database.uuid);
 log('Preparo le sole tabelle del servizio calendario.');
 await run(['d1','execute','gymtrack-calendar','--remote','--file=schema.sql','--yes'],{interactive:true});
 log('Pubblico il servizio calendario sul tuo account.');
 await run(['deploy'],{interactive:true});
 const url=workerUrl(await ask('Incolla qui l’URL HTTPS workers.dev mostrato da Cloudflare (non una chiave):'));
 const secrets=jsonList(await run(['secret','list','--format=json']));
 if(secrets.some(s=>s.name==='CALENDAR_RELAY_SECRET')){
  log('La chiave del servizio esiste gia\u0300: viene mantenuta, senza ruotarla.');
 }else{
  const secret=secretFactory();
  if(!/^[a-f0-9]{64}$/.test(secret))throw Error('Generazione chiave non riuscita.');
  await clipboard(secret);
  try{
  log('La chiave tecnica e\u0300 negli appunti di Windows. Non incollarla in chat.');
  log('Salvala nel tuo gestore password: servira\u0300 nel campo segreto CALENDAR_RELAY_SECRET dell’hosting GymTrack.');
  await ask('Premi Invio dopo aver conservato la chiave nel gestore password.');
  await run(['secret','put','CALENDAR_RELAY_SECRET'],{input:secret+'\n',sensitive:true});}
  finally{await clipboard('');}
  log('Chiave caricata su Cloudflare; appunti svuotati.');
 }
 log('\nSERVIZIO CLOUDFLARE PUBBLICATO: '+url);
 log('Il collegamento a GymTrack richiede ancora CALENDAR_RELAY_URL e CALENDAR_RELAY_SECRET nelle variabili server dell’hosting e una nuova pubblicazione.');
 log('Puoi comunicare in chat SOLO l’URL sopra. Non inviare la chiave.');
 return url;
}
async function main(){
 if(process.platform!=='win32')throw Error('Questo avvio e\u0300 per Windows.');
 if(Number(process.versions.node.split('.')[0])<22)throw Error('Installa Node.js LTS 22 o successivo da https://nodejs.org e riapri questa finestra.');
 const cli=path.join(root,'.installer','node_modules','wrangler','bin','wrangler.js');
 await mkdir(path.join(root,'.installer'),{recursive:true});
 await writeFile(path.join(root,'.installer','package.json'),JSON.stringify({name:'gymtrack-calendar-installer',private:true,devDependencies:{wrangler:'^4.0.0'}}));
 console.log('Scarico gli strumenti ufficiali Cloudflare. Nessun piano a pagamento viene attivato.');
 const installed=spawnSync('cmd.exe',['/d','/s','/c','npm.cmd install --no-audit --no-fund'],{cwd:path.join(root,'.installer'),stdio:'inherit'});
 if(installed.error||installed.status!==0)throw Error('Installazione strumenti non riuscita. Controlla Node.js e la connessione.');
 await provision({
   log:message=>console.log(message),ask:async message=>{const prompt=createInterface({input:process.stdin,output:process.stdout});try{return await prompt.question(message+'\n');}finally{prompt.close();}},
   writeConfig:async id=>{const config=JSON.parse(await readFile(path.join(root,'wrangler.jsonc'),'utf8'));config.d1_databases=[{binding:'DB',database_name:'gymtrack-calendar',database_id:id}];await writeFile(path.join(root,'wrangler.jsonc'),JSON.stringify(config,null,2)+'\n');},
   clipboard:async value=>{const result=spawnSync('clip.exe',[],{input:value,encoding:'utf8',windowsHide:true});if(result.error||result.status!==0)throw Error('Appunti Windows non disponibili. Procedura interrotta.');},
   run:async(args,options={})=>{
    const result=spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false'},...(options.interactive?{stdio:'inherit'}:{input:options.input})});
    if(result.error||result.status!==0){if(!options.sensitive&&result.stderr)console.error(result.stderr);throw Error('Passaggio Cloudflare non riuscito: '+args.slice(0,2).join(' ')+'. Controlla l’accesso e riprova.');}
    return result.stdout||'';
   }
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){main().catch(error=>{console.error('\n'+error.message);process.exitCode=1;});}
