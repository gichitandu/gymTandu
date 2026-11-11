// GT Garage: dati dell'auto dal portale ufficiale Volkswagen "EU Data Act" (sola lettura, gratuito).
// Login OIDC con il Volkswagen ID dell'utente (segreti VW_ID_EMAIL e VW_ID_PASSWORD), poi il pacchetto
// di dati più recente della richiesta continua attivata dall'utente sul portale (uno ogni ~15 minuti).
// Flusso ricavato dalle integrazioni open source (licenza MIT) homeassistant-vw-eu-data-act e
// CarConnectivity-connector-vw-eu-data-act, comprese le richieste fatte da VW ai client della comunità:
// User-Agent che identifica il prodotto, nessuna pagina del portale caricata "a vuoto", sessione
// riutilizzata tra un controllo e l'altro e al massimo un controllo ogni 15 minuti.
const VW_PORTAL='https://eu-data-act.drivesomethinggreater.com';
const VW_IDENTITY='https://identity.vwgroup.io';
const VW_PORTAL_HOST='eu-data-act.drivesomethinggreater.com';
const VW_IDENTITY_HOST='identity.vwgroup.io';
const VW_CLIENT_ID='9b58543e-1c15-4193-91d5-8a14145bebb0@apps_vw-dilab_com';
const VW_BRAND='VOLKSWAGEN_PASSENGER_CARS';
const VW_AGENT='gymtrack-gt-garage/1.0';
const VW_STATUS_KEY='garage/vw-status.json';
const VW_SESSION_KEY='garage/vw-session.json';
const VW_NO_CONTENT='_no_content_found.zip';
const VW_REDIRECTS=[301,302,303,307,308];
const VW_MIN_MANUAL_MS=3*60000;
const VW_AUTH_PAUSE_MS=6*3600000;
const VW_RETRY_MS=25*60000;
const VW_ZIP_LIMIT=8*1024*1024;

class VwError extends Error{constructor(message,kind='api',retryAfter){super(message);this.kind=kind;this.retryAfter=retryAfter;}}

export function vwConfigured(env){return typeof env?.VW_ID_EMAIL==='string'&&env.VW_ID_EMAIL.includes('@')&&typeof env?.VW_ID_PASSWORD==='string'&&env.VW_ID_PASSWORD.length>0;}

/* ---------------------------------------------------------------- cookie */
export class VwJar{
 constructor(list){this.list=Array.isArray(list)?list.filter(c=>c&&typeof c.name==='string'&&(!c.expires||c.expires>Date.now())):[];}
 store(url,response){
  const host=new URL(url).hostname;
  const lines=typeof response.headers.getSetCookie==='function'?response.headers.getSetCookie():(response.headers.get('set-cookie')?[response.headers.get('set-cookie')]:[]);
  for(const line of lines){
   const parts=line.split(';'),first=parts.shift()||'',eq=first.indexOf('=');
   if(eq<1)continue;
   const cookie={name:first.slice(0,eq).trim(),value:first.slice(eq+1).trim(),domain:host,hostOnly:true,path:'/'};
   let remove=false;
   for(const attr of parts){
    const [rawKey,...rest]=attr.split('='),key=rawKey.trim().toLowerCase(),value=rest.join('=').trim();
    if(key==='domain'&&value){const d=value.replace(/^\./,'').toLowerCase();if(host===d||host.endsWith('.'+d)){cookie.domain=d;cookie.hostOnly=false;}}
    else if(key==='path'&&value.startsWith('/'))cookie.path=value;
    else if(key==='max-age'&&/^-?\d+$/.test(value)){const s=Number(value);if(s<=0)remove=true;else cookie.expires=Date.now()+s*1000;}
    else if(key==='expires'&&!cookie.expires){const t=Date.parse(value);if(Number.isFinite(t)){if(t<=Date.now())remove=true;else cookie.expires=t;}}
   }
   this.list=this.list.filter(c=>!(c.name===cookie.name&&c.domain===cookie.domain&&c.path===cookie.path));
   if(!remove)this.list.push(cookie);
  }
 }
 matches(c,url){const u=new URL(url),host=u.hostname;return(c.hostOnly?host===c.domain:host===c.domain||host.endsWith('.'+c.domain))&&u.pathname.startsWith(c.path||'/')&&(!c.expires||c.expires>Date.now());}
 header(url){return this.list.filter(c=>this.matches(c,url)).map(c=>c.name+'='+c.value).join('; ');}
 has(name,host){return this.list.some(c=>c.name===name&&(c.hostOnly?host===c.domain:host===c.domain||host.endsWith('.'+c.domain))&&(!c.expires||c.expires>Date.now()));}
 forget(name){this.list=this.list.filter(c=>c.name!==name);}
}

function vwAllowed(url){try{const u=new URL(url);return u.protocol==='https:'&&[VW_IDENTITY_HOST,VW_PORTAL_HOST].includes(u.hostname.toLowerCase());}catch{return false;}}
async function vwFetch(jar,url,{method='GET',headers={},body,referer}={}){
 if(!vwAllowed(url))throw new VwError('Il portale Volkswagen ha indicato un indirizzo inatteso: accesso interrotto.','auth');
 const h=new Headers({'User-Agent':VW_AGENT,Accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','Accept-Language':'it-IT,it;q=0.9,en;q=0.8',...headers});
 const cookie=jar.header(url);if(cookie)h.set('Cookie',cookie);if(referer)h.set('Referer',referer);
 let response;
 try{response=await fetch(url,{method,headers:h,body,redirect:'manual'});}
 catch{throw new VwError('Portale Volkswagen non raggiungibile.','unavailable');}
 jar.store(url,response);
 return response;
}
function vwRetryAfter(response){const raw=(response.headers.get('retry-after')||'').trim();if(/^\d+$/.test(raw))return Number(raw)*1000;const t=Date.parse(raw);return Number.isFinite(t)?Math.max(0,t-Date.now()):undefined;}
function vwCheckLogin(response){
 if(response.status===429)throw new VwError('Volkswagen ha chiesto di riprovare più tardi.','rate',vwRetryAfter(response));
 if(response.status>=500||response.status===404)throw new VwError('Il servizio di accesso Volkswagen non è disponibile in questo momento.','unavailable');
}
const vwIsCallback=url=>{const u=new URL(url);return u.hostname===VW_PORTAL_HOST&&u.pathname.startsWith('/services/callbacklogin');};
function vwMarketingCallback(url){
 const u=new URL(url);
 if(u.hostname.toLowerCase()!==VW_IDENTITY_HOST||!u.pathname.includes('/consent/marketing/'))return null;
 try{const t=new URL(u.searchParams.get('callback')||'');if(t.protocol==='https:'&&t.hostname.toLowerCase()===VW_IDENTITY_HOST&&['/oidc/v1/oauth/client/callback','/oidc/v1/oauth/client/callback/success'].includes(t.pathname))return t.href;}catch{}
 return null;
}
/** Segue i redirect a mano (per tenere i cookie di ogni passaggio) e si ferma sulla callback del portale. */
async function vwFollow(jar,response,url){
 for(let i=0;i<10;i++){
  if(vwIsCallback(url)||!VW_REDIRECTS.includes(response.status))return{response,url};
  const location=response.headers.get('location');if(!location)return{response,url};
  let target=new URL(location,url).href;
  if(!vwAllowed(target))throw new VwError('Il portale Volkswagen ha indicato un indirizzo inatteso: accesso interrotto.','auth');
  // Una domanda facoltativa sul marketing si salta senza rispondere, come fa il login ufficiale di evcc.
  target=vwMarketingCallback(target)||target;
  await response.body?.cancel?.();
  response=await vwFetch(jar,target,{referer:url});url=target;
 }
 throw new VwError('Accesso Volkswagen non riuscito: troppi reindirizzamenti.','unavailable');
}

/* ---------------------------------------------------------------- moduli di accesso */
const vwEntities=text=>String(text).replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|#39);/gi,(m,e)=>{const k=e.toLowerCase();if(k==='amp')return'&';if(k==='quot')return'"';if(k==='apos'||k==='#39')return"'";if(k==='lt')return'<';if(k==='gt')return'>';const n=k.startsWith('#x')?parseInt(k.slice(2),16):parseInt(k.slice(1),10);return Number.isFinite(n)?String.fromCodePoint(n):m;});
function vwAttr(tag,name){const m=tag.match(new RegExp('\\s'+name+'\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i'));return m?vwEntities(m[2]??m[3]??m[4]??''):null;}
export function vwTemplateModel(html){
 const at=html.indexOf('templateModel');if(at<0)return{};
 const start=html.indexOf('{',at);if(start<0)return{};
 let depth=0,quote='',escaped=false;
 for(let i=start;i<html.length;i++){
  const c=html[i];
  if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}
  if(c==='"'||c==="'"){quote=c;continue;}
  if(c==='{')depth++;
  else if(c==='}'&&--depth===0){try{return JSON.parse(html.slice(start,i+1));}catch{return{};}}
 }
 return{};
}
export function vwLoginFields(html){
 const formStart=html.search(/<form\b/i);let action=null;const fields={};
 if(formStart>=0){
  const formEnd=html.indexOf('</form',formStart),form=html.slice(formStart,formEnd<0?undefined:formEnd);
  action=vwAttr(form.match(/<form\b[^>]*>/i)[0],'action');
  for(const tag of form.match(/<input\b[^>]*>/gi)||[]){const name=vwAttr(tag,'name');if(name)fields[name]=vwAttr(tag,'value')??'';}
 }
 const model=vwTemplateModel(html);
 for(const key of ['hmac','relayState'])if(model[key])fields[key]=String(model[key]);
 const email=model.emailPasswordForm?.email;if(email&&!('email' in fields))fields.email=String(email);
 const csrf=html.match(/csrf_token\s*[:=]\s*['"]([^'"]+)['"]/);if(csrf&&!('_csrf' in fields))fields._csrf=csrf[1];
 return{fields,action,model};
}
/** Riconosce dal contenuto il modulo di accesso (email, poi password; oppure entrambe). Mai le pagine di registrazione. */
export function vwDetectForm(url,html){
 const {fields,action,model}=vwLoginFields(html);
 const hints=[action||'',new URL(url).pathname,String(model.postAction||''),String(model.template||'')].map(h=>h.toLowerCase());
 if(hints.some(h=>h.includes('register')||h.includes('signup')))return null;
 if('hmac' in fields&&'_csrf' in fields){
  const asksPassword=hints.some(h=>h.includes('authenticate'));
  const postUrl=action?new URL(action,url).href:asksPassword?url.split('?')[0]:url;
  return{fields,postUrl,identifiers:['email'],asksPassword};
 }
 const identifiers=['username','email'].filter(n=>n in fields),asksPassword='password' in fields;
 if(!identifiers.length&&!asksPassword)return null;
 return{fields,postUrl:action?new URL(action,url).href:url,identifiers,asksPassword};
}
function vwLoginError(html){const m=vwTemplateModel(html),e=m.error||m.errorCode;return e?(typeof e==='object'?e.text||e.errorCode||'':String(e)):'';}

export async function vwLogin(env,jar){
 const country=(env.VW_ID_COUNTRY||'it').toLowerCase(),language=(env.VW_ID_LANGUAGE||'it').toLowerCase();
 const params=new URLSearchParams({client_id:VW_CLIENT_ID,response_type:'code',scope:'openid cars profile',state:`${country}__${language}__${VW_BRAND}`,redirect_uri:VW_PORTAL+'/login',prompt:'login'});
 const authorize=VW_IDENTITY+'/oidc/v1/authorize?'+params;
 let {response,url}=await vwFollow(jar,await vwFetch(jar,authorize),authorize);
 vwCheckLogin(response);
 let html=await response.text(),emailSent=false;
 for(let step=0;step<3;step++){
  const form=vwDetectForm(url,html);
  if(!form||(emailSent&&!form.asksPassword)){
   if(!emailSent)throw new VwError('Pagina di accesso Volkswagen non riconosciuta: il portale potrebbe essere cambiato.','unavailable');
   throw new VwError(vwLoginError(html)||'Volkswagen non ha accettato l’email del Volkswagen ID.','auth');
  }
  if(new URL(form.postUrl).hostname.toLowerCase()!==VW_IDENTITY_HOST)throw new VwError('Il modulo di accesso punta a un indirizzo inatteso.','auth');
  const data={...form.fields};for(const n of form.identifiers)data[n]=env.VW_ID_EMAIL;if(form.asksPassword)data.password=env.VW_ID_PASSWORD;
  response=await vwFetch(jar,form.postUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data).toString(),referer:url});
  vwCheckLogin(response);
  ({response,url}=await vwFollow(jar,response,form.postUrl));
  if(form.asksPassword||vwIsCallback(url))return vwFinishLogin(jar,response,url);
  vwCheckLogin(response);
  emailSent=true;html=await response.text();
 }
 throw new VwError('Accesso Volkswagen non completato.','unavailable');
}
async function vwFinishLogin(jar,response,url){
 vwCheckLogin(response);
 if(vwIsCallback(url)){
  if(response.status>=400)throw new VwError('Il portale Volkswagen ha rifiutato l’accesso.','auth');
  if(!jar.has('access_token',VW_PORTAL_HOST))throw new VwError('Il portale Volkswagen non ha aperto la sessione.','unavailable');
  return;
 }
 const html=await response.text();
 if(url.includes('terms-and-conditions'))throw new VwError('Volkswagen chiede di accettare nuove condizioni: accedi una volta al portale EU Data Act dal browser e accettale.','auth');
 const segments=new URL(url).pathname.split('/');
 if(segments.includes('signin-service')&&segments.includes('consent'))throw new VwError('Volkswagen fa una domanda sul consenso: accedi una volta al portale EU Data Act dal browser e rispondi.','auth');
 if(vwDetectForm(url,html)||url.includes('signin-service')||url.includes('/error'))throw new VwError(vwLoginError(html)||'Email o password del Volkswagen ID non corrette.','auth');
 throw new VwError('Accesso Volkswagen non completato.','unavailable');
}

/* ---------------------------------------------------------------- portale */
async function vwJson(jar,path,headers={}){
 const response=await vwFetch(jar,VW_PORTAL+path,{headers:{Accept:'application/json, text/plain, */*',...headers}});
 if(response.status===401||response.status===403)throw new VwError('Sessione Volkswagen scaduta.','session');
 if(response.status===429)throw new VwError('Volkswagen ha chiesto di riprovare più tardi.','rate',vwRetryAfter(response));
 if(response.status>=400)throw new VwError('Il portale Volkswagen ha risposto con un errore ('+response.status+').','unavailable');
 try{return await response.json();}catch{throw new VwError('Risposta del portale Volkswagen non valida.','unavailable');}
}
export function vwFindVin(node){
 if(Array.isArray(node)){for(const item of node){const vin=vwFindVin(item);if(vin)return vin;}return null;}
 if(node&&typeof node==='object'){const vin=node.vin||node.vehicleIdentificationNumber;if(typeof vin==='string'&&/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin))return vin.toUpperCase();for(const value of Object.values(node)){const found=vwFindVin(value);if(found)return found;}}
 return null;
}
function vwStamp(name){const m=String(name).replace(/\.zip$/i,'').split('_').reverse().find(p=>/^\d{14}$/.test(p));return m?Date.UTC(+m.slice(0,4),+m.slice(4,6)-1,+m.slice(6,8),+m.slice(8,10),+m.slice(10,12),+m.slice(12,14)):0;}
export function vwNewest(listing){
 const files=(Array.isArray(listing)?listing:Array.isArray(listing?.files)?listing.files:[]).filter(f=>f&&typeof f.name==='string');
 const time=f=>{const t=Date.parse(f.createdOn||'');return Number.isFinite(t)?t:vwStamp(f.name);};
 const sorted=[...files].sort((a,b)=>time(a)-time(b));
 const content=sorted.filter(f=>!f.name.endsWith(VW_NO_CONTENT));
 return{any:sorted.length>0,newest:content[content.length-1]||null};
}

/* ---------------------------------------------------------------- ZIP */
export async function vwUnzipJson(buffer){
 const bytes=new Uint8Array(buffer),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw new VwError('Pacchetto dati Volkswagen non leggibile.','api');
 let at=view.getUint32(end+16,true);const count=view.getUint16(end+10,true);
 for(let n=0;n<count&&at+46<=bytes.length;n++){
  if(view.getUint32(at,true)!==0x02014b50)break;
  const method=view.getUint16(at+10,true),size=view.getUint32(at+20,true),full=view.getUint32(at+24,true),nameLength=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true),local=view.getUint32(at+42,true);
  const name=new TextDecoder().decode(bytes.subarray(at+46,at+46+nameLength));
  at+=46+nameLength+extra+comment;
  if(!/\.json$/i.test(name))continue;
  if(full>VW_ZIP_LIMIT||view.getUint32(local,true)!==0x04034b50)throw new VwError('Pacchetto dati Volkswagen non leggibile.','api');
  const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true),data=bytes.subarray(start,start+size);
  let text;
  if(method===0)text=new TextDecoder().decode(data);
  else if(method===8)text=await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  else throw new VwError('Pacchetto dati Volkswagen in un formato non supportato.','api');
  try{return JSON.parse(text);}catch{throw new VwError('Pacchetto dati Volkswagen non leggibile.','api');}
 }
 throw new VwError('Il pacchetto dati Volkswagen non contiene dati.','api');
}

/* ---------------------------------------------------------------- valori */
function vwTime(raw){const s=String(raw??'').trim();if(/^\d{12,}$/.test(s))return Number(s);const t=Date.parse(s);return Number.isFinite(t)?t:null;}
/** Dal pacchetto (array "Data" di campi) i valori utili a una Golf a benzina o diesel. */
export function vwValues(payload){
 const points=(Array.isArray(payload?.Data)?payload.Data:[]).filter(p=>p&&p.key).map(p=>({key:String(p.key),name:String(p.dataFieldName||p.key),raw:p.value,at:vwTime(p.timestampUtc)}));
 const freshest=name=>points.filter(p=>p.name===name&&p.raw!==null&&p.raw!==undefined&&String(p.raw).trim()!=='').sort((a,b)=>(b.at??-1)-(a.at??-1)||(a.key<b.key?-1:1));
 const number=name=>{for(const p of freshest(name)){const n=Number(String(p.raw).trim());if(Number.isFinite(n))return n;}return null;};
 const text=name=>{const p=freshest(name)[0];return p?String(p.raw):'';};
 const first=(...names)=>{for(const n of names){const v=number(n);if(v!==null)return v;}return null;};
 const miles=/mi/i.test(text('mileage.unit'));
 const odometerList=freshest('mileage.value').length?freshest('mileage.value'):freshest('mileage');
 const topAt=odometerList[0]?.at??null,odometerValues=odometerList.filter(p=>p.at===topAt).map(p=>Number(p.raw)).filter(Number.isFinite);
 let odometer=odometerValues.length?Math.max(...odometerValues):null;if(odometer!==null&&miles)odometer=odometer*1.609344;
 const fuel=first('fuel_level_current_level','tank_current_level');
 const range=first('cruising_range_primary_engine','cruising_range_combined');
 const consumption=first('long_term_data_average_fuel_consumption');
 const days=name=>{const v=number(name);return v===null?null:Math.round(-v);};
 const captured=points.filter(p=>p.name==='car_captured_time').map(p=>vwTime(p.raw)).filter(t=>t!==null);
 const stamps=points.map(p=>p.at).filter(t=>t!==null);
 const capturedAt=captured.length?Math.max(...captured):stamps.length?Math.max(...stamps):null;
 const values={
  fuelPct:fuel!==null&&fuel>=0&&fuel<=100?Math.round(fuel):null,
  rangeKm:range!==null&&range>=0&&range<5000?Math.round(range):null,
  odometerKm:odometer!==null&&odometer>0&&odometer<5000000?Math.round(odometer):null,
  // Il portale indica litri ogni 1000 km.
  consumption:consumption!==null&&consumption>0&&consumption<400?Math.round(consumption)/10:null,
  inspectionDays:days('maintenance_interval__time_until_inspection'),inspectionKm:days('maintenance_interval_distance_until_inspection'),
  oilDays:days('maintenance_interval__time_until_oil_change'),oilKm:days('maintenance_interval_distance_until_oil_change'),
 };
 return{values,capturedAt};
}

/* ---------------------------------------------------------------- sincronizzazione */
async function vwRead(env,key){try{const o=await env.BUCKET.get(key);return o?JSON.parse(await o.text()):null;}catch{return null;}}
async function vwWrite(env,key,value){await env.BUCKET.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}});}
function vwPublic(status,env){
 const s=status||{};
 return{configured:vwConfigured(env),state:vwConfigured(env)?s.state||'pending':'off',message:s.message||'',checkedAt:s.checkedAt||null,updatedAt:s.updatedAt||null,capturedAt:s.capturedAt||null,values:s.values||null,vehicle:s.vinTail?'…'+s.vinTail:null};
}

/** Un controllo: riusa la sessione salvata, rifà l'accesso solo se serve, scarica solo pacchetti nuovi. */
export async function vwSync(env,{now=Date.now(),manual=false}={}){
 if(!vwConfigured(env)||!env.BUCKET)return vwPublic(null,env);
 const status=await vwRead(env,VW_STATUS_KEY)||{},session=await vwRead(env,VW_SESSION_KEY)||{};
 if(manual?(status.checkedAt&&now-status.checkedAt<VW_MIN_MANUAL_MS):(status.pauseUntil&&now<status.pauseUntil))return vwPublic(status,env);
 const jar=new VwJar(session.account===env.VW_ID_EMAIL?session.cookies:[]);
 let fresh=false;
 const login=async()=>{jar.forget('access_token');await vwLogin(env,jar);fresh=true;};
 const call=async fn=>{try{return await fn();}catch(error){if(error.kind==='session'&&!fresh){await login();return fn();}throw error;}};
 const next={...status,checkedAt:now};
 try{
  if(!jar.has('access_token',VW_PORTAL_HOST))await login();
  let vin=session.vin,identifier=session.identifier;
  if(!vin)vin=vwFindVin(await call(()=>vwJson(jar,'/proxy_api/consent/me/vehicles?viewPosition=FRONT_LEFT')));
  if(!vin){Object.assign(next,{state:'novehicle',message:'Nessuna auto collegata al tuo Volkswagen ID sul portale EU Data Act.',pauseUntil:now+VW_RETRY_MS});return await vwSave(env,next,{account:env.VW_ID_EMAIL,cookies:jar.list},jar);}
  const metadata=async()=>{const m=await call(()=>vwJson(jar,`/proxy_api/euda-apim/datarequest/vehicles/${vin}/metadata/partial`));return m?.Identifier||m?.identifier||null;};
  if(!identifier)identifier=await metadata();
  if(!identifier){Object.assign(next,{state:'norequest',vinTail:vin.slice(-4),message:'Attiva sul portale EU Data Act la richiesta continua di dati (ogni 15 minuti, tutti i dati).',pauseUntil:now+VW_RETRY_MS});return await vwSave(env,next,{account:env.VW_ID_EMAIL,cookies:jar.list,vin},jar);}
  const list=id=>call(()=>vwJson(jar,`/proxy_api/euda-apim/datadelivery/vehicles/${vin}/${id}/list`,{type:'partial'}));
  let listing;
  try{listing=await list(identifier);}catch(error){if(error.kind!=='unavailable')throw error;listing=null;}
  if(!listing||!vwNewest(listing).any){const renewed=await metadata();if(renewed&&renewed!==identifier){identifier=renewed;listing=await list(identifier);}}
  const {newest,any}=vwNewest(listing);
  const keep={account:env.VW_ID_EMAIL,cookies:jar.list,vin,identifier,lastFile:session.lastFile};
  Object.assign(next,{vinTail:vin.slice(-4),pauseUntil:now+15*60000});
  if(!newest){Object.assign(next,{state:next.values?'ok':'waiting',message:next.values?'':any?'L’auto non ha ancora inviato dati: guidala o apri l’app Volkswagen.':'In attesa del primo pacchetto di dati (può servire qualche ora).'});return await vwSave(env,next,keep,jar);}
  if(newest.name!==session.lastFile){
   const response=await call(async()=>{const r=await vwFetch(jar,`${VW_PORTAL}/proxy_api/euda-apim/datadelivery/vehicles/${vin}/${identifier}/download`,{headers:{filename:newest.name,type:'partial',Accept:'*/*'}});if(r.status===401||r.status===403)throw new VwError('Sessione Volkswagen scaduta.','session');return r;});
   if(response.status===429)throw new VwError('Volkswagen ha chiesto di riprovare più tardi.','rate',vwRetryAfter(response));
   if(response.status>=400)throw new VwError('Download dei dati Volkswagen non riuscito ('+response.status+').','unavailable');
   const {values,capturedAt}=vwValues(await vwUnzipJson(await response.arrayBuffer()));
   const merged={...(next.values||{})};for(const [k,v] of Object.entries(values))if(v!==null)merged[k]=v;
   Object.assign(next,{values:merged,capturedAt:capturedAt||next.capturedAt||null,updatedAt:now});keep.lastFile=newest.name;
  }
  Object.assign(next,{state:'ok',message:''});
  return await vwSave(env,next,keep,jar);
 }catch(error){
  const kind=error instanceof VwError?error.kind:'unavailable';
  const pause=kind==='auth'?VW_AUTH_PAUSE_MS:kind==='rate'?Math.max(error.retryAfter||0,30*60000):VW_RETRY_MS;
  Object.assign(next,{state:kind==='auth'?'auth':'error',message:error instanceof VwError?error.message:'Collegamento Volkswagen non riuscito.',pauseUntil:now+pause});
  await vwWrite(env,VW_SESSION_KEY,{...session,account:env.VW_ID_EMAIL,cookies:kind==='auth'?[]:jar.list}).catch(()=>{});
  await vwWrite(env,VW_STATUS_KEY,next).catch(()=>{});
  return vwPublic(next,env);
 }
}
async function vwSave(env,status,session){await vwWrite(env,VW_SESSION_KEY,session);await vwWrite(env,VW_STATUS_KEY,status);return vwPublic(status,env);}

export async function vwScheduled(env){if(vwConfigured(env)&&env.BUCKET)await vwSync(env);}

export async function vwApi(request,env,user){
 const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 if(!user)return reply({error:'Accedi al tuo account.'},401);
 if(user.role!=='SuperAdmin')return reply({error:'GT Garage è riservato al Super Admin.'},403);
 if(!env.BUCKET)return reply({error:'Archivio server non configurato.'},503);
 const path=new URL(request.url).pathname;
 if(path==='/api/hub/vw'&&request.method==='GET')return reply(vwPublic(await vwRead(env,VW_STATUS_KEY),env));
 if(path==='/api/hub/vw/sync'&&request.method==='POST')return reply(await vwSync(env,{manual:true}));
 return reply({error:'Operazione non trovata.'},404);
}
