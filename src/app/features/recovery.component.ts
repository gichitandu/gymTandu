import {Component,computed,effect,HostListener,inject,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute,RouterLink} from '@angular/router';
import {Store} from '../services/store';
import {TodayService} from '../services/today';
import {WellnessLog} from '../models/domain';
import {validWellness,sleepLabel,muscleWork} from '../services/wellness';
import {FormDraftService,DraftSession} from '../services/form-drafts';
import {DateFieldComponent} from '../shared/date-field.component';
import {IconComponent} from '../shared/icon.component';
import {StatusComponent} from '../shared/status.component';
type RecoveryDraft=WellnessLog&{restTitle?:string;restNotes?:string};
@Component({standalone:true,imports:[FormsModule,RouterLink,DateFieldComponent,IconComponent,StatusComponent],templateUrl:'./recovery.component.html',styleUrls:['./wellness-design.css','./recovery-redesign.css']})
export class RecoveryComponent {
 s=inject(Store);clock=inject(TodayService);route=inject(ActivatedRoute);drafts=inject(FormDraftService);
 mode=this.route.snapshot.data['mode']||'recovery';title=this.mode==='sleep'?'Sonno':this.mode==='rest'?'Il tuo riposo':'Recovery';
 editorOpen=signal(false);
 editorDateLabel(){return this.date===this.clock.date()?'oggi':this.date.split('-').reverse().join('/');}
 editorActionLabel(){return this.editorOpen()?'Chiudi check-in'+(this.date===this.clock.date()?'':' del '+this.editorDateLabel()):this.date!==this.clock.date()?'Apri check-in del '+this.editorDateLabel():this.mode==='sleep'?'Registra il sonno':'Registra come ti senti';}
 qualityLabel(value:number|undefined){return value?['Molto bassa','Bassa','Discreta','Buona','Ottima'][value-1]:'Non registrata';}
 editDate(date:string){this.loadDate(date);this.editorOpen.set(true);}
 date=this.clock.date();sleepMinutes:number|null=null;sleepQuality:number|null=null;energy:number|null=null;stress:number|null=null;soreness:Record<string,number>={};notes='';
 baseline='';loaded=false;restTitle='Giorno di riposo';restNotes='';restSaving=signal(false);saving=signal(false);removeId=signal('');restored=signal(false);
 session?:DraftSession<RecoveryDraft>;
 logs=computed(()=>[...this.s.data().wellnessLogs].sort((a,b)=>b.date.localeCompare(a.date)));
 current=computed(()=>this.logs().find(row=>row.date===this.clock.date()));
 sleepHistory=computed(()=>this.logs().filter(row=>row.sleepMinutes!==undefined).slice(0,7).reverse());
 averageSleep=computed(()=>{const rows=this.sleepHistory();return rows.length?Math.round(rows.reduce((s,v)=>s+v.sleepMinutes!,0)/rows.length):undefined;});
 restDays=computed(()=>this.s.data().scheduledWorkouts.filter(e=>e.kind==='rest'&&e.date>=this.clock.date()).sort((a,b)=>a.date.localeCompare(b.date)));
 focus=computed(()=>muscleWork(this.s.data(),this.daysAgo(6),this.clock.date()).filter(g=>g.sets).slice(0,4));
 maxFocus=computed(()=>Math.max(1,...this.focus().map(group=>group.sets)));
 sleepLabel=sleepLabel;
 constructor(){effect(()=>{if(this.s.ready()&&!this.loaded){this.loaded=true;this.loadDate(this.clock.date());this.session=this.drafts.bind(this.s.archiveKey(),this.mode==='rest'?'wellness-rest':'wellness',()=>{const row=this.capture();return JSON.stringify(row)===this.baseline?null:row;},row=>{if(row&&typeof row.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.date)&&typeof row.notes==='string'&&row.soreness&&typeof row.soreness==='object'){this.fill(row);this.restTitle=row.restTitle??this.restTitle;this.restNotes=row.restNotes??'';this.restored.set(true);this.editorOpen.set(true);}});}});}
 daysAgo(days:number){const date=new Date(this.clock.date()+'T12:00:00');date.setDate(date.getDate()-days);return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');}
 private fill(row:WellnessLog){this.date=row.date;this.sleepMinutes=row.sleepMinutes??null;this.sleepQuality=row.sleepQuality??null;this.energy=row.energy??null;this.stress=row.stress??null;this.soreness={...row.soreness};this.notes=row.notes;}
 loadDate(date:string){this.fill(this.logs().find(row=>row.date===date)||{id:'wellness-'+date,date,soreness:{},notes:''});this.baseline=JSON.stringify(this.capture());this.removeId.set('');this.restored.set(false);this.session?.changed();}
 capture():RecoveryDraft{return {id:'wellness-'+this.date,date:this.date,...(this.sleepMinutes===null?{}:{sleepMinutes:this.sleepMinutes}),...(this.sleepQuality===null?{}:{sleepQuality:this.sleepQuality}),...(this.energy===null?{}:{energy:this.energy}),...(this.stress===null?{}:{stress:this.stress}),soreness:{...this.soreness},notes:this.notes,...(this.mode==='rest'?{restTitle:this.restTitle,restNotes:this.restNotes}:{})};}
 @HostListener('input') @HostListener('change') changed(){this.session?.changed();}
 setSoreness(id:string,value:number){this.soreness[id]=value;this.changed();}
 deleteSoreness(id:string){delete this.soreness[id];this.changed();}
 async save(){if(this.saving())return;const row=this.capture();if(!validWellness(row)||row.date>this.clock.date()){this.s.error.set('Controlla la data e i valori del diario.');return;}if(row.sleepMinutes==null&&row.sleepQuality==null&&row.energy==null&&row.stress==null&&!row.notes.trim()&&!Object.keys(row.soreness).length){this.s.error.set('Compila almeno un dato prima di salvare il check-in.');return;}this.saving.set(true);try{if(await this.s.saveWellness(row)){this.baseline=JSON.stringify(row);if(JSON.stringify(this.capture())===this.baseline)await this.session?.clear();else await this.session?.flush();this.restored.set(false);}}finally{this.saving.set(false);}}
 async remove(row:WellnessLog){if(this.removeId()!==row.id){this.removeId.set(row.id);return;}if(await this.s.removeWellness(row.id)){if(this.date===row.date)this.loadDate(row.date);this.removeId.set('');}}
 async planRest(){if(this.restSaving())return;const captured=JSON.stringify(this.capture());this.restSaving.set(true);try{if(await this.s.scheduleCalendarActivity({date:this.date,kind:'rest',title:this.restTitle.trim()||'Giorno di riposo',notes:this.restNotes})){this.baseline=captured;if(JSON.stringify(this.capture())===captured)await this.session?.clear();else await this.session?.flush();}}finally{this.restSaving.set(false);}}
 ngOnDestroy(){void this.session?.destroy();}
}
