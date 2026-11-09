import {Component,computed,inject,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute,Router,RouterLink} from '@angular/router';
import {AuthService} from '../services/auth';
import {Store} from '../services/store';
import {ExcelImportEntry,ExcelImportService} from '../services/excel-import-service';
import {ExcelProgramDraft} from '../models/excel-import';
import {parseWorkoutExcel} from '../services/excel-parser';
import {confirmationForContext} from '../services/confirmation';
import {feedbackForContext} from '../services/feedback';
import {parseLocalDate} from '../services/calendar';
import {Exercise} from '../models/domain';
import {DateFieldComponent} from '../shared/date-field.component';
import {IconComponent} from '../shared/icon.component';

interface MatchRow{key:string;name:string;sourceIds:string[];exact?:Exercise;}
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
@Component({standalone:true,imports:[FormsModule,RouterLink,DateFieldComponent,IconComponent],templateUrl:'./excel-import.component.html',styleUrls:['./excel-import.component.css','./excel-import-v3.css']})
export class ExcelImportComponent{
 readonly auth=inject(AuthService);readonly s=inject(Store);readonly archive=inject(ExcelImportService);private router=inject(Router);private confirmation=confirmationForContext();private feedback=feedbackForContext();
 readonly mode=signal<'import'|'archive'>('import');readonly filter=signal<'all'|'active'|'completed'>('all');readonly date=signal('');readonly file=signal<File|null>(null);readonly draft=signal<ExcelProgramDraft|null>(null);readonly parsing=signal(false);readonly busy=signal(false);readonly error=signal('');readonly mappings=signal<Record<string,string>>({});readonly queries=signal<Record<string,string>>({});readonly downloading=signal('');
 private generation=0;private destroyed=false;
 readonly dateProblem=computed(()=>{const date=this.date();if(!date)return '';try{if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error();const value=parseLocalDate(date);return value.getDay()===1?'':'La prima settimana deve iniziare di lunedì.';}catch{return 'Scegli una data valida.';}});
 readonly canChooseFile=computed(()=>!!this.date()&&!this.dateProblem()&&!this.parsing()&&!this.busy()&&this.s.ready());
 readonly conflicts=computed(()=>{const draft=this.draft();return draft?this.s.excelProgramConflicts(draft):[];});
 readonly matches=computed(()=>{const draft=this.draft();if(!draft)return [] as MatchRow[];const rows=new Map<string,MatchRow>();for(const session of draft.sessions)for(const exercise of session.exercises){const key=normalize(exercise.name),found=rows.get(key);if(found){if(!found.sourceIds.includes(exercise.sourceId))found.sourceIds.push(exercise.sourceId);}else rows.set(key,{key,name:exercise.name,sourceIds:[exercise.sourceId],exact:this.s.data().exercises.find(item=>item.active&&normalize(item.name)===key)});}return [...rows.values()];});
 readonly unmatched=computed(()=>this.matches().filter(row=>!this.mapping(row)&&!row.exact));
 readonly entries=computed(()=>this.archive.files().filter(entry=>this.filter()==='all'||entry.status===this.filter()));
 readonly workSets=computed(()=>this.draft()?.sessions.reduce((total,session)=>total+session.exercises.reduce((count,exercise)=>count+exercise.sets,0),0)||0);
 constructor(){const query=inject(ActivatedRoute).snapshot.queryParamMap.get('tab');if(query==='archive')this.mode.set('archive');void this.archive.load();}
 switchMode(mode:'import'|'archive'){this.mode.set(mode);if(mode==='archive')void this.archive.load();}
 async chooseDate(date:string){this.generation++;this.date.set(date);this.draft.set(null);this.error.set('');this.mappings.set({});if(this.file()&&!this.dateProblem()&&date)await this.readFile(this.file()!);}
 async useNextMonday(){try{const value=parseLocalDate(this.date());value.setDate(value.getDate()+((8-value.getDay())%7));await this.chooseDate(`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`);}catch{}}
 async selected(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file||!this.canChooseFile())return;this.file.set(file);await this.readFile(file);}
 private async readFile(file:File){
  const generation=++this.generation;this.error.set('');this.draft.set(null);this.parsing.set(true);
  try{const draft=await parseWorkoutExcel(file,this.date());if(generation!==this.generation)return;this.draft.set(draft);const selected:Record<string,string>={};for(const row of this.matches())if(row.exact)selected[row.key]=row.exact.id;this.mappings.set(selected);}
  catch(error){if(generation===this.generation)this.error.set(error instanceof Error?error.message:'Il file non è leggibile.');}
  finally{if(generation===this.generation)this.parsing.set(false);}
 }
 mapping(row:MatchRow){const values=this.mappings();return (Object.hasOwn(values,row.key)?values[row.key]:undefined)??row.exact?.id??'';}
 query(row:MatchRow){const values=this.queries();return Object.hasOwn(values,row.key)?values[row.key]:'';}
 setMapping(row:MatchRow,value:string){this.mappings.update(current=>({...current,[row.key]:value}));}
 setQuery(row:MatchRow,value:string){this.queries.update(current=>({...current,[row.key]:value}));}
 candidates(row:MatchRow){const query=normalize(this.query(row)||row.name),words=query.split(' ').filter(Boolean),selected=this.mapping(row),catalog=this.s.data().exercises.filter(exercise=>exercise.active);const ranked=catalog.map(exercise=>({exercise,score:words.reduce((count,word)=>count+(normalize(exercise.name).includes(word)?1:0),0)})).filter(item=>item.score>0||item.exercise.id===selected).sort((a,b)=>Number(b.exercise.id===selected)-Number(a.exercise.id===selected)||b.score-a.score||a.exercise.name.localeCompare(b.exercise.name));return ranked.slice(0,12).map(item=>item.exercise);}
 async confirm(){
  const draft=this.draft(),file=this.file();if(!draft||!file||this.busy()||this.parsing())return;
  if(this.conflicts().length){this.error.set('L’importazione è bloccata dalle sovrapposizioni indicate.');return;}
  if(!this.online()){this.error.set('Collegati per confermare e verificare le sovrapposizioni.');return;}
  if(!await this.confirmation.ask({title:'Programmare questo piano?',message:`${draft.name}: ${draft.sessions.length} allenamenti dal ${this.label(draft.startDate)} al ${this.label(draft.endDate)}.`,detail:'I piani esistenti vengono conservati. Il file originale sarà archiviato dopo il salvataggio online.',confirmLabel:'Conferma e programma',tone:'info'}))return;
  if(this.destroyed)return;
  this.busy.set(true);this.error.set('');
  try{const mapping:Record<string,string>={};for(const row of this.matches())for(const id of row.sourceIds)if(this.mapping(row))mapping[id]=this.mapping(row);const result=await this.archive.import(draft,file,mapping);this.feedback.show('success',result.synced?'Piano importato e allenamenti programmati.':'Piano salvato sul dispositivo. Archivio Excel da sincronizzare.');await this.router.navigate(['/piano',result.planId]);}
  catch(error){const message=error instanceof Error?error.message:'Importazione non riuscita.';this.error.set(message);this.feedback.show('error',message);}
  finally{this.busy.set(false);}
 }
 async download(entry:ExcelImportEntry){if(this.downloading())return;this.downloading.set(entry.id);try{await this.archive.download(entry);}catch(error){this.feedback.show('error',error instanceof Error?error.message:'Download non riuscito.');}finally{this.downloading.set('');}}
 async retry(){await this.archive.completePending();}
 label(date:string){try{return parseLocalDate(date).toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'});}catch{return date;}}
 sessionCount(entry:ExcelImportEntry){return this.s.data().plans.find(plan=>plan.id===entry.planId)?.program?.sessionCount;}
 completed(entry:ExcelImportEntry){return this.s.data().workouts.filter(workout=>workout.planId===entry.planId&&workout.status==='completed').length;}
 status(entry:ExcelImportEntry){return entry.status==='completed'?'Concluso':entry.status==='active'?'Attivo':'Archivio';}
 online(){return navigator.onLine!==false&&!this.auth.offlineMode();}
 canLeave(){if(this.busy()){this.feedback.show('error','Attendi il termine dell’importazione prima di cambiare pagina.');return false;}return true;}
 ngOnDestroy(){this.destroyed=true;this.generation++;}
}
