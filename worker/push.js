import {calendarRuntimeEnv,calendarRelay,calendarProjection} from './calendar.js';
export async function pushReminderApi(request,env,user,readArchive){
 const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
 if(!user)return reply({error:'Accedi al tuo account per attivare i promemoria.'},401);
 env=await calendarRuntimeEnv(env);
 if(!env.CALENDAR_RELAY_SECRET||!env.CALENDAR_RELAY_URL)return request.method==='GET'?reply({available:false,configured:false,time:'08:30',timezone:'Europe/Rome',everyDay:false,deviceEnabled:false}):reply({error:'Il servizio notifiche non è ancora configurato.'},503);
 const url=new URL(request.url),device=url.searchParams.get('device')||'';
 if(device&&!/^[a-f0-9]{64}$/.test(device))return reply({error:'Dispositivo non valido.'},400);
 if(!['GET','POST','DELETE'].includes(request.method))return reply({error:'Metodo non supportato.'},405);
 let body;
 if(request.method!=='GET'){
  const reader=request.body?.getReader();if(!reader)return reply({error:'Richiesta mancante.'},400);
  const decoder=new TextDecoder();let text='',size=0;
  for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384){await reader.cancel();return reply({error:'Richiesta troppo grande.'},413);}text+=decoder.decode(part.value,{stream:true});}
  try{body=JSON.parse(text+decoder.decode());}catch{return reply({error:'Richiesta non valida.'},400);}
  if(request.method==='POST'&&!['subscribe','preferences','test'].includes(body.operation))return reply({error:'Operazione non supportata.'},400);
  if(request.method==='DELETE'||body.operation==='test'){
   if(typeof body.id!=='string'||!/^[a-f0-9]{64}$/.test(body.id))return reply({error:'Dispositivo non valido.'},400);
   body={id:body.id,...(request.method==='POST'?{operation:'test'}:{})};
  }else{
   const snapshot=await readArchive();if(!snapshot.ok)return snapshot;const head=await snapshot.json();
   body={operation:body.operation,time:body.time,timezone:body.timezone,everyDay:body.everyDay,...(body.operation==='subscribe'?{endpoint:body.endpoint}:{}),events:head.backup?calendarProjection(JSON.parse(head.backup).data).map(e=>({date:e.date})):[],revision:head.revision||0};
  }
 }
 try{return reply({...await calendarRelay(env,user,request.method,body,'/push'+(device?'?device='+device:'')),configured:true});}
 catch(error){
  if(error.calendarReason==='relay_not_found'&&request.method==='GET')return reply({available:false,configured:true,needsUpdate:true,time:'08:30',timezone:'Europe/Rome',everyDay:false,deviceEnabled:false});
  const messages={400:'Controlla orario, fuso orario e impostazioni del dispositivo.',404:'Attiva prima le notifiche su questo dispositivo.',409:'Questo dispositivo è associato a un altro account. Disattiva la precedente iscrizione e riprova.',410:'Iscrizione scaduta. Disattiva e riattiva le notifiche su questo dispositivo.',429:'Attendi un minuto prima di inviare un’altra prova.',502:'Il fornitore delle notifiche non ha accettato l’invio. Riprova tra un minuto.',503:'Il servizio notifiche deve essere aggiornato dall’amministratore.'};
  if(messages[error.httpStatus])return reply({error:messages[error.httpStatus]},error.httpStatus);
  throw error;
 }
}
