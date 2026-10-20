import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth';
export const DEFAULT_BACKGROUND='#050b12';
@Injectable({providedIn:'root'})
export class ThemeService {
 auth=inject(AuthService); color=signal(DEFAULT_BACKGROUND);busy=signal(false);error=signal('');
 isLight(){const c=this.color();return [1,3,5].map(i=>parseInt(c.slice(i,i+2),16)).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0)>150;}
 presets=['#050b12','#10182b','#1c1230','#09251e','#27161b','#edf3fa'];
 async load(){try{const p=await this.auth.request('preferences');this.color.set(p.backgroundColor);this.apply();}catch{this.apply();}}
 apply(){
  const color=this.color(), rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)),light=(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)>150;
  const style=document.body.style;style.setProperty('--bg',color);style.setProperty('--card',`color-mix(in srgb, ${color} ${light?'55%':'82%'}, ${light?'white':'#23354c'})`);style.setProperty('--raised',`color-mix(in srgb, ${color} 75%, ${light?'#b7cce4':'#2c4564'})`);style.setProperty('--text',light?'#102135':'#f0f6ff');style.setProperty('--muted',light?'#41556e':'#99adc4');style.setProperty('--line',light?'#91a5bc':'#233c52');document.body.classList.toggle('custom-light',light);
 }
 async save(color:string){if(this.busy())return;this.busy.set(true);this.error.set('');try{const p=await this.auth.request('preferences',{backgroundColor:color});this.color.set(p.backgroundColor);this.apply();}catch(e){this.error.set((e as Error).message);}finally{this.busy.set(false);}}
}
