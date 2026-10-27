import {calendarConfigure,calendarApi} from 'calendar.js';
function check(ok,message){if(!ok)throw Error(message);}
export default {
 async test(){
  const key='a'.repeat(64),me={id:'synthetic-admin',role:'SuperAdmin'};
  let stored=null,calls=0,redirect=false;
  const env={CALENDAR_RELAY_URL:'https://relay.invalid',DB:{prepare(){return{bind(...values){this.values=values;return this;},async first(){return stored;},async run(){stored={secret:this.values[1]};return{meta:{changes:1}};}};}}};
  const original=globalThis.fetch,warning=console.warn;
  const warnings=[];console.warn=(value)=>warnings.push(value);
  globalThis.fetch=async(url,init)=>{
   // Construct an actual workerd Request: Node fetch mocks accept redirect:error
   // but the production engine rejects it before any network request is sent.
   const request=new Request(url,init);calls++;
   check(request.headers.get('authorization')==='Bearer '+key,'Authorization did not reach the intended relay');
   if(redirect)return new Response(null,{status:307,headers:{Location:'https://different-host.invalid'}});
   return Response.json({enabled:false,token:null,revision:0,updatedAt:null});
  };
  const request=()=>new Request('https://gymtrack.invalid/api/calendar-config',{method:'POST',body:JSON.stringify({secret:key})});
  try{
   const response=await calendarConfigure(request(),env,me);
   check(response.status===200,'Activation must work in the Cloudflare runtime; got '+response.status+' '+await response.text());
   check(stored?.secret===key,'Verified key was not stored');check(calls===1,'Unexpected relay request count');
   const status=await calendarApi(new Request('https://gymtrack.invalid/api/calendar-subscription'),env,me,()=>{throw Error('Archive must not be read by this probe');});
   const text=await status.text();check(status.status===200&&!text.includes(key),'Key leaked through subscription status');
   stored=null;calls=0;redirect=true;
   const rejected=await calendarConfigure(request(),env,me);
   check(rejected.status===502,'Redirect must be rejected');check(calls===1,'Redirect was followed');check(stored===null,'Key was stored without verification');
   check(!JSON.stringify(warnings).includes(key),'Key leaked in diagnostics');
  }finally{globalThis.fetch=original;console.warn=warning;}
 }
};
