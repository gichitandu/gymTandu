import {Component,computed,inject,input,output,signal} from '@angular/core';
import {Store} from '../services/store';
import {machineKey} from '../services/training-flow';

/**
 * Scelta rapida della macchina usata per un esercizio della seduta: un tocco su un chip.
 * In seduta riprende i carichi dell'ultima volta su quella macchina; su una seduta registrata cambia solo l'etichetta.
 * Tutte le scritture passano da Store.assignMachine.
 */
@Component({selector:'gt-machine-picker',standalone:true,template:`
@if(row();as e){<div class="mp" role="group" [attr.aria-label]="'Macchina usata per '+e.name">
<div class="mp-head"><span class="mp-label">Macchina</span>@if(!current()){<span class="mp-hint">{{completed()?'Non indicata':'Su quale stai lavorando?'}}</span>}</div>
<div class="mp-chips">
@for(m of options();track m.key){<button type="button" class="mp-chip" [class.on]="m.key===current()" [attr.aria-pressed]="m.key===current()" (click)="pick(m.name)" [disabled]="s.busy()">{{m.name}}</button>}
@if(adding()){<span class="mp-new-box"><input #box class="mp-input" maxlength="120" placeholder="Es. Panatta sala 2" aria-label="Nome della nuova macchina" (keydown.enter)="add(box.value)" (keydown.escape)="adding.set(false)"/><button type="button" class="mp-chip on" (click)="add(box.value)" [disabled]="s.busy()">OK</button><button type="button" class="mp-chip" (click)="adding.set(false)">Annulla</button></span>}
@else{<button type="button" class="mp-chip mp-add" (click)="adding.set(true)" [disabled]="s.busy()">+ Nuova</button>}
@if(current()){<button type="button" class="mp-chip mp-clear" (click)="pick('')" [disabled]="s.busy()" aria-label="Togli la macchina">Nessuna</button>}
</div>
@if(showOthers()&&others().length){<ul class="mp-others" aria-label="Ultima volta sulle altre macchine">@for(o of others();track o.key){<li><button type="button" (click)="pick(o.name)" [disabled]="s.busy()" [attr.aria-label]="'Passa a '+o.name+': ultima volta '+o.text"><b>{{o.name}}</b> · {{o.date}}<span>{{o.text}}</span></button></li>}</ul>}
</div>}`,styles:[`
.mp{margin:10px 0;display:grid;gap:8px}
.mp-head{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.mp-label{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.mp-hint{font-size:12px;color:var(--muted)}
.mp-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.mp-chip{min-height:36px;padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:inherit;font:inherit;font-size:13px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mp-chip.on{background:var(--accent,#2f6df6);border-color:var(--accent,#2f6df6);color:#fff;font-weight:600}
.mp-add,.mp-clear{color:var(--muted)}
.mp-new-box{display:flex;gap:6px;flex-wrap:wrap;align-items:center;width:100%}
.mp-input{flex:1 1 160px;min-height:36px;padding:6px 10px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:inherit;font:inherit;font-size:16px}
.mp-others{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.mp-others button{width:100%;text-align:left;display:flex;flex-wrap:wrap;gap:4px 8px;align-items:baseline;padding:6px 10px;border-radius:10px;border:1px dashed var(--line);background:transparent;color:inherit;font:inherit;font-size:12px}
.mp-others span{color:var(--muted)}
`]})
export class MachinePickerComponent{
 s=inject(Store);
 workoutExerciseId=input.required<string>();
 /** Mostra l'ultima volta sulle altre macchine (in seduta). */
 showOthers=input(true);
 changed=output<string>();
 adding=signal(false);
 row=computed(()=>this.s.data().workoutExercises.find(e=>e.id===this.workoutExerciseId()));
 completed=computed(()=>{const e=this.row();return !!e&&this.s.data().workouts.find(w=>w.id===e.workoutId)?.status==='completed';});
 current=computed(()=>machineKey(this.row()?.machineSetup));
 private known=computed(()=>{const e=this.row();return e?this.s.machinesFor(e.exerciseId,e.workoutId):[];});
 options=computed(()=>{
  const e=this.row();if(!e)return [];
  const list=new Map<string,{key:string;name:string}>();
  const add=(name?:string)=>{const key=machineKey({machine:name});if(key&&!list.has(key))list.set(key,{key,name:name!.replace(/\s+/g,' ').trim()});};
  add(e.machineSetup?.machine);add(this.s.preference(e.exerciseId)?.machineSetup?.machine);for(const m of this.known())add(m.name);
  return [...list.values()];
 });
 others=computed(()=>{
  const e=this.row();if(!e)return [];const unit=this.s.settings().unit,body=e.loadMode==='bodyweight';
  return this.known().filter(m=>m.key!==this.current()).slice(0,4).map(m=>{
   const same=m.sets.every(x=>x.weight===m.sets[0].weight);
   const text=body?m.sets.map(x=>x.reps).join(' · ')+' rip.':same?this.s.formatWeight(m.sets[0].weight)+' '+unit+' × '+m.sets.map(x=>x.reps).join(' · '):m.sets.map(x=>this.s.formatWeight(x.weight)+'×'+x.reps).join(' · ')+' '+unit;
   return {key:m.key,name:m.name,date:m.date.split('-').reverse().slice(0,2).join('/'),text};
  });
 });
 async pick(name:string){
  const e=this.row();if(!e||this.s.busy())return;
  if(machineKey({machine:name})===this.current()){this.adding.set(false);return;}
  if(await this.s.assignMachine(e.id,name)){this.adding.set(false);this.changed.emit(name);}
 }
 add(value:string){const name=value.replace(/\s+/g,' ').trim();if(name)void this.pick(name);}
}
