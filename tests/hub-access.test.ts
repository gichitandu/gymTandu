import '@angular/compiler';
import {signal} from '@angular/core';
import {expect,it} from 'vitest';
import {adminOnly,appAllowed,hubAllowed} from '../src/app/hub/hub-access';

function ctx(role:string|null,{hub=false,garage=false,offline=false,preview=false}={}){
 const auth:any={user:signal(role?{id:'a',role}:null),offlineMode:signal(offline),viewAsClient:signal(preview)};
 const features:any={hubEnabled:signal(hub),garageEnabled:signal(garage)};
 return{auth,features};
}
it('lets the Super Admin open GT Hub and GT Garage even when they are not open to everyone',()=>{
 const {auth,features}=ctx('SuperAdmin');
 expect(appAllowed(auth,features,'hub')).toBe(true);expect(appAllowed(auth,features,'auto')).toBe(true);
 expect(adminOnly(features,'hub')).toBe(true);
});
it('opens each app to normal users only when its global switch is on',()=>{
 for(const role of ['User','Admin']){
  expect(hubAllowed(ctx(role).auth,ctx(role).features)).toBe(false);
  const hub=ctx(role,{hub:true});expect(appAllowed(hub.auth,hub.features,'hub')).toBe(true);expect(appAllowed(hub.auth,hub.features,'auto')).toBe(false);
  const car=ctx(role,{garage:true});expect(appAllowed(car.auth,car.features,'hub')).toBe(false);expect(appAllowed(car.auth,car.features,'auto')).toBe(true);expect(hubAllowed(car.auth,car.features)).toBe(true);
 }
});
it('keeps both apps closed without an account or without network, and follows the switches in client preview',()=>{
 const none=ctx(null,{hub:true,garage:true});expect(hubAllowed(none.auth,none.features)).toBe(false);
 const offline=ctx('SuperAdmin',{offline:true});expect(hubAllowed(offline.auth,offline.features)).toBe(false);
 const preview=ctx('SuperAdmin',{preview:true});expect(hubAllowed(preview.auth,preview.features)).toBe(false);
 const open=ctx('SuperAdmin',{preview:true,garage:true});expect(appAllowed(open.auth,open.features,'auto')).toBe(true);expect(adminOnly(open.features,'auto')).toBe(false);
});
