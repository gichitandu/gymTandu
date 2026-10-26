import { DateFieldComponent } from '../shared/date-field.component';
import { confirmationForContext } from '../services/confirmation';
import { SectionHeadingComponent } from "../shared/section-heading.component";
import { RouterLink } from "@angular/router";
import { RingComponent } from "../shared/ring.component";
import { IconComponent } from "../shared/icon.component";
import { moveDate, parseLocalDate } from "../services/calendar";
import { ActivatedRoute } from "@angular/router";
import { Component, HostListener, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '../services/store';
import { Meal, MealIngredient, localDate, now, uid } from '../models/domain';
import { compressPhoto } from '../services/images';
import { LocalAiService } from '../services/local-ai';
import { FOODS, foodSuggestions, portion, sumIngredients, resizeIngredient } from '../services/nutrition';
import { StatusComponent } from '../shared/status.component';
import { feedbackForContext, feedbackSignal } from '../services/feedback';
import { DraftSession, FormDraftService } from '../services/form-drafts';
import { TodayService } from '../services/today';
import type { AppUpdateEvent } from '../services/pwa';
interface MealFormDraft {
 version:1;formSaveId:string;day:string;mealDate:string;mealType:NonNullable<Meal['mealType']>;editing:string;name:string;
 grams:number;calories:number;protein:number;carbs:number;fat:number;notes:string;foodId:string;source:Meal['source'];
 photo?:Blob;pendingPhoto?:Blob;ingredients:MealIngredient[];composedName:string;followDay:boolean;followMealDate:boolean;
}
@Component({standalone:true,styleUrl:"./feature-polish.css",imports: [DateFieldComponent,SectionHeadingComponent,RouterLink,FormsModule,StatusComponent,RingComponent,IconComponent],template:`
<gt-section-heading index="04" eyebrow="Energia per il tuo percorso" title="Alimentazione" description="Un giorno alla volta, il tuo equilibrio prende forma."/>
<div class="nutrition-day-selector"><button class="icon-btn ghost" aria-label="Giorno precedente" (click)="moveDay(-1)"><gt-icon name="back"/></button><label class="nutrition-date-heading"><strong>{{day===today?'Oggi':dayLabel()}}</strong><gt-date-field aria-label="Data alimentazione" [ngModel]="day" (ngModelChange)="selectDay($event)"></gt-date-field><span>{{dayLabel()}}</span></label><button class="icon-btn ghost" aria-label="Giorno successivo" (click)="moveDay(1)">›</button></div><gt-status/>
<input #camera hidden type="file" accept="image/*" capture="environment" (change)="takePhoto($event)"/><input #gallery hidden type="file" accept="image/*" (change)="takePhoto($event)"/>
@if(!showForm()){
<section class="nutrition-dashboard nutrition-observatory">
  <div class="energy-panel"><div class="energy-caption"><span class="panel-kicker">BILANCIO DEL GIORNO</span><h2>La tua energia.</h2><p class="subtle">{{s.settings().goals?.calories?'Il totale registrato rispetto al tuo obiettivo personale.':'Ogni pasto aggiunge un tassello al tuo diario.'}}</p></div><div class="energy-orbit"><span class="orbit-tick tick-one" aria-hidden="true"></span><span class="orbit-tick tick-two" aria-hidden="true"></span><gt-ring unit="kcal" class="calorie-ring" [value]="totals().calories" [target]="s.settings().goals?.calories" label="Calorie del giorno" color="#22caff"/></div><div class="energy-foot"><span><i></i>{{meals().length}} {{meals().length===1?'pasto registrato':'pasti registrati'}}</span><a routerLink="/profilo" [queryParams]="{section:'goals'}" aria-label="Modifica obiettivi nutrizionali">Obiettivi <gt-icon name="arrow"/></a></div></div>
  <div class="macro-grid macro-constellation"><div class="macro-panel protein-panel"><span class="macro-index">01 / PROTEINE</span><gt-ring [value]="totals().protein" [target]="s.settings().goals?.protein" label="Proteine" unit="g" color="#ff638b"/><span>Proteine</span><small>{{s.settings().goals?.protein?'obiettivo '+s.settings().goals?.protein+' g':'grammi registrati'}}</small></div><div class="macro-panel carbs-panel"><span class="macro-index">02 / CARBOIDRATI</span><gt-ring [value]="totals().carbs" [target]="s.settings().goals?.carbs" label="Carboidrati" unit="g" color="#eacb58"/><span>Carboidrati</span><small>{{s.settings().goals?.carbs?'obiettivo '+s.settings().goals?.carbs+' g':'grammi registrati'}}</small></div><div class="macro-panel fat-panel"><span class="macro-index">03 / GRASSI</span><gt-ring [value]="totals().fat" [target]="s.settings().goals?.fat" label="Grassi" unit="g" color="#af8bff"/><span>Grassi</span><small>{{s.settings().goals?.fat?'obiettivo '+s.settings().goals?.fat+' g':'grammi registrati'}}</small></div></div>
</section>
<div class="diary-section-heading"><div><span class="panel-kicker">IL DIARIO</span><h2>I tuoi pasti</h2></div><span class="diary-count">{{meals().length.toString().padStart(2,'0')}}</span></div>
<div class="meal-diary-list">@for(m of meals();track m.id){<article class="card meal-diary-row">@if(m.photo){<img [src]="url(m.photo)" alt="Foto del pasto" loading="lazy"/>}@else{<span class="meal-fallback"><gt-icon name="nutrition"/></span>}<button class="meal-diary-main" (click)="edit(m)"><strong>{{mealTypeLabel(m.mealType)||m.name}}</strong><span>{{m.mealType?m.name+' · ':''}}{{m.calories.toLocaleString('it-IT',{maximumFractionDigits:1})}} kcal</span><small>P {{m.protein.toLocaleString('it-IT',{maximumFractionDigits:1})}} g <i>·</i> C {{m.carbs.toLocaleString('it-IT',{maximumFractionDigits:1})}} g <i>·</i> G {{m.fat.toLocaleString('it-IT',{maximumFractionDigits:1})}} g</small></button><button class="meal-check" aria-label="Modifica pasto registrato" (click)="edit(m)"><gt-icon name="check"/></button></article>}@empty{<div class="card empty diary-empty"><span class="diary-empty-orbit" aria-hidden="true"><gt-icon name="nutrition"/></span><h3>Il tuo diario è pronto</h3><p>Registra un pasto con una foto oppure dai valori dell’etichetta.</p></div>}</div>
<div class="nutrition-capture"><button class="primary full-width scan-meal-button" (click)="camera.click()" [disabled]="photoBusy()||!draftReady()"><gt-icon name="camera"/> Scansiona pasto <gt-icon name="arrow"/></button><div class="actions nutrition-secondary-actions"><button class="ghost" (click)="gallery.click()" [disabled]="!draftReady()">Scegli da Foto</button><button class="ghost" (click)="openNew()" [disabled]="saving()||!draftReady()">+ Inserisci manualmente</button></div></div>
} @else {
<section class="card meal-editor" [attr.aria-busy]="saving()" [attr.inert]="saving()?'':null">@if(photo){<ol class="scan-steps" aria-label="Scansione pasto"><li class="done">1 · Foto acquisita</li><li class="active" aria-current="step">{{analysisState()==='running'?'2 · Analisi in corso':'2 · Controlla alimenti'}}</li></ol>}<div class="card-head"><h2>{{editing?'Modifica pasto':photo?'Controlla e conferma':'Registra un pasto'}}</h2><button class="icon-btn ghost" aria-label="Torna al diario" (click)="closeForm()" [disabled]="saving()">×</button></div>
<div class="actions"><button (click)="camera.click()" [disabled]="photoBusy()">Scatta foto</button><button (click)="gallery.click()" [disabled]="photoBusy()">Galleria</button></div>
@if(recoveredDraft()){<p class="notice">Bozza recuperata. Controlla i dati e conferma il pasto quando è pronto.</p>}
@if(pendingPhoto&&!photoBusy()){<div class="actions"><button type="button" (click)="resumePhoto()">Riprendi preparazione della foto</button><button type="button" (click)="removePhoto()">Scarta foto in attesa</button></div>}
<p class="subtle" role="status" style="margin-top:12px">{{photoBusy()?'Preparazione della foto…':'La foto viene analizzata sul dispositivo, senza inviarla a servizi AI.'}}</p>
@if(photo){<img class="meal-preview" [src]="url(photo)" alt="Foto del pasto da controllare"/>
<div class="meal-ai-status" role="status" aria-live="polite" [attr.aria-busy]="analysisState()==='running'">
@if(analysisState()==='running'){<strong>Analisi della foto…</strong><p>{{ai.status()}}</p>}@else if(analysisMessage()){<p>{{analysisMessage()}}</p>}
</div>
<div class="actions">@if(analysisState()==='running'){<button type="button" (click)="cancelAnalysis()">Annulla analisi</button>}@else{<button type="button" class="primary" (click)="recognize()" [disabled]="ai.busy()||photoBusy()||!ai.supported">{{analysisState()==='idle'?'Analizza foto':'Riprova analisi'}}</button>}<button type="button" (click)="removePhoto()">Rimuovi foto</button></div>}
@if(suggestions().length){<div class="notice"><b>Possibili alimenti · scegli e correggi</b><div class="actions">@for(food of suggestions();track food.id){<button (click)="choose(food.id,true)">{{food.name}}</button>}</div></div>}
<p class="notice" style="margin-top:16px">La foto non misura quantità, condimenti o ingredienti nascosti. Conferma alimento, grammi e valori: tutte le stime sono modificabili.</p>
@if(ingredients.length){<section class="ingredient-review"><div class="section-title"><h3>Alimenti da confermare</h3><span class="pill">{{ingredients.length}} voci</span></div>@for(item of ingredients;track item.id){<div class="ingredient-item"><div class="ingredient-title"><strong>{{item.name}}</strong><button class="icon-btn ghost danger" [attr.aria-label]="'Rimuovi '+item.name" (click)="removeIngredient(item.id)">×</button></div><div class="ingredient-inputs"><label>Quantità (g)<input type="number" inputmode="decimal" min="1" max="10000" [ngModel]="item.grams" (change)="changeIngredientGrams(item.id,$any($event.target).valueAsNumber)"/></label>@for(field of nutritionFields;track field.key){<label>{{field.label}}<input type="number" inputmode="decimal" min="0" step="0.1" [ngModel]="item[field.key]" (ngModelChange)="changeIngredientValue(item.id,field.key,$event)"/></label>}</div></div>}<p class="subtle">I valori di ogni alimento si riferiscono alla quantità indicata. Modificando i grammi vengono ricalcolati in proporzione.</p></section>}
<form (ngSubmit)="save()"><div class="form-grid"><label class="wide">Tipo di pasto<select name="meal-type" [(ngModel)]="mealType"><option value="breakfast">Colazione</option><option value="lunch">Pranzo</option><option value="dinner">Cena</option><option value="snack">Spuntino</option></select></label>
<label class="wide">Alimento di riferimento (facoltativo)<select name="food" [(ngModel)]="foodId" (ngModelChange)="choose($event)"><option value="">Inserimento manuale / etichetta</option>@for(food of foods;track food.id){<option [value]="food.id">{{food.name}}</option>}</select></label>
<label class="wide">{{ingredients.length?'Alimento da aggiungere':'Nome del pasto'}}<input name="name" [(ngModel)]="name" [required]="!ingredients.length" maxlength="100" /></label>
<label>Quantità (g)<input name="grams" type="number" inputmode="decimal" [(ngModel)]="grams" required min="1" max="10000" /></label><label>Data del pasto<gt-date-field name="meal-date" [ngModel]="mealDate" (ngModelChange)="selectMealDate($event)" required ></gt-date-field></label>
@if(foodId){<button type="button" class="wide" (click)="recalculate()">Ricalcola per questi grammi dal riferimento</button>}
<label>Calorie totali (kcal)<input name="calories" type="number" inputmode="decimal" [(ngModel)]="calories" required min="0" max="20000" step="0.1" /></label>
<label>Proteine totali (g)<input name="protein" type="number" inputmode="decimal" [(ngModel)]="protein" required min="0" max="2000" step="0.1" /></label>
<label>Carboidrati totali (g)<input name="carbs" type="number" inputmode="decimal" [(ngModel)]="carbs" required min="0" max="3000" step="0.1" /></label>
<label>Grassi totali (g)<input name="fat" type="number" inputmode="decimal" [(ngModel)]="fat" required min="0" max="2000" step="0.1" /></label>
<div class="wide"><button type="button" class="full-width" (click)="addIngredient()">+ Aggiungi alimento al pasto</button></div>
<label class="wide">Note, ingredienti e correzioni<textarea name="notes" [(ngModel)]="notes" maxlength="2000"></textarea></label>
</div><p class="subtle" style="margin-top:12px">Valori di riferimento generici per 100 g: la ricetta e la preparazione cambiano i risultati. Quando disponibile usa l’etichetta del tuo prodotto. Tutti i campi riportano il totale della porzione.</p>
@if(ingredients.length){<label class="meal-name-field">Nome del pasto completo<input name="composed-name" [(ngModel)]="composedName" maxlength="100" placeholder="Es. Pollo con riso e verdure"/></label><div class="meal-confirm-totals"><span>Totale da confermare</span><strong>{{ingredientTotal()?.calories??'—'}} kcal</strong><small>Proteine {{ingredientTotal()?.protein??'—'}} g · Carboidrati {{ingredientTotal()?.carbs??'—'}} g · Grassi {{ingredientTotal()?.fat??'—'}} g</small></div>}
<div class="actions"><button class="primary" [disabled]="saving()||s.busy()||photoBusy()||!s.ready()">{{saving()?'Salvataggio…':'Conferma e salva pasto'}}</button><button type="button" (click)="closeForm()" [disabled]="saving()">{{editing?'Annulla modifica':'Annulla'}}</button></div></form>
@if(editing){<button class="ghost danger full-width" (click)="removeCurrent()">Elimina questo pasto</button>}
</section>}
<details class="card ai-details"><summary>Riconoscimento foto · stato e impostazioni</summary><p class="subtle" style="margin-top:12px">L’analisi parte quando scegli la foto. Il primo utilizzo scarica automaticamente il modello gratuito (circa 2 MB); con il modello disponibile sul dispositivo puoi usarlo anche offline. Riconosce alcuni alimenti singoli e può non riconoscere piatti misti: scegli o correggi sempre i risultati prima di salvare.</p><p class="subtle" style="margin-top:12px">{{ai.status()}}</p>
@if(ai.report();as r){<dl class="device-report"><dt>Motore</dt><dd>{{r.backend}} · {{r.model}}</dd><dt>Ultima prova sul dispositivo</dt><dd>{{r.milliseconds}} ms per inferenza, {{r.loadMs}} ms caricamento</dd><dt>Memoria tensori</dt><dd>{{(r.tensorBytes/1048576).toFixed(1)}} MB (non è la RAM totale)</dd><dt>Modello all’avvio della prova</dt><dd>{{r.cached?'Letto dal dispositivo':'Caricato dal sito'}}</dd></dl>}
<div class="actions"><button (click)="prepareAI()" [disabled]="ai.busy()||!ai.supported">Verifica modello</button>@if(ai.busy()&&(preparingAI()||analysisState()==='running')){<button (click)="analysisState()==='running'?cancelAnalysis():ai.cancel()">Interrompi</button>}<button (click)="ai.remove()" [disabled]="ai.busy()">Reimposta riconoscimento</button></div>
<p class="subtle" style="margin-top:14px">WebGPU non è richiesta. Su un dispositivo lento, con memoria ridotta o non supportato, puoi registrare tutto manualmente. Nessuna stima viene salvata automaticamente.</p></details>
`})
export class NutritionComponent {
 private confirmation=confirmationForContext();
 ingredients:MealIngredient[]=[];composedName='';nutritionFields:{key:'calories'|'protein'|'carbs'|'fat';label:string}[]=[{key:'calories',label:'kcal'},{key:'protein',label:'Proteine (g)'},{key:'carbs',label:'Carboidrati (g)'},{key:'fat',label:'Grassi (g)'}];
 ingredientTotal(){try{return sumIngredients(this.ingredients);}catch{return null;}}
 addIngredient(){try{const item={id:uid(),name:this.name.trim(),grams:this.grams,calories:this.calories,protein:this.protein,carbs:this.carbs,fat:this.fat};sumIngredients([...this.ingredients,item]);this.ingredients=[...this.ingredients,item];this.clearFood();this.error.set('');this.draftChanged();}catch(e){this.error.set((e as Error).message);}}
 clearFood(){this.name='';this.foodId='';this.grams=100;this.calories=0;this.protein=0;this.carbs=0;this.fat=0;}
 removeIngredient(id:string){this.ingredients=this.ingredients.filter(i=>i.id!==id);this.draftChanged();}
 changeIngredientGrams(id:string,grams:number){try{this.ingredients=this.ingredients.map(i=>i.id===id?resizeIngredient(i,grams):i);this.error.set('');this.draftChanged();}catch(e){this.error.set((e as Error).message);}}
 changeIngredientValue(id:string,key:'calories'|'protein'|'carbs'|'fat',value:number){this.ingredients=this.ingredients.map(i=>i.id===id?{...i,[key]:value}:i);this.draftChanged();}
 private todayService=inject(TodayService,{optional:true});private lastToday=localDate();private followDay=true;private followMealDate=true;
 get today(){return this.todayService?.date()||localDate();}
 showForm=signal(false);mealType:NonNullable<Meal['mealType']>='breakfast';
 constructor(){const date=inject(ActivatedRoute).snapshot.queryParamMap.get('date');if(date){try{parseLocalDate(date);this.day=date;this.mealDate=date;this.followDay=false;this.followMealDate=false;}catch{}}if(this.todayService)effect(()=>{const next=this.todayService!.date(),previous=this.lastToday;if(next===previous)return;if(this.followDay&&this.day===previous)this.day=next;if(this.followMealDate&&this.mealDate===previous)this.mealDate=next;this.lastToday=next;});}
 dayLabel(){return new Date(this.day+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'});}
 moveDay(direction:number){this.selectDay(moveDate(this.day,direction));}
 selectDay(date:string){try{parseLocalDate(date);this.day=date;this.followDay=false;this.draftChanged();}catch{}}
 selectMealDate(date:string){this.mealDate=date;this.followMealDate=false;this.draftChanged();}
 mealTypeLabel(type?:Meal['mealType']){return type?({breakfast:'Colazione',lunch:'Pranzo',dinner:'Cena',snack:'Spuntino'})[type]:'';}
 async removeCurrent(){if(this.saving())return;const meal=this.s.data().meals.find(m=>m.id===this.editing),version=this.formVersion;if(meal){await this.remove(meal);if(version===this.formVersion&&!this.s.data().meals.some(m=>m.id===meal.id)){this.reset();this.showForm.set(false);this.clearStoredDraft();}}}
 s=inject(Store);ai=inject(LocalAiService);foods=FOODS;day=localDate();mealDate=localDate();editing='';name='';grams=100;calories=0;protein=0;carbs=0;fat=0;notes='';foodId='';source:Meal['source']='manual';photo?:Blob;
 private feedback=feedbackForContext();
 photoBusy=signal(false);error=feedbackSignal('error',this.feedback);suggestions=signal<typeof FOODS>([]);private urls=new Map<Blob,string>();
 analysisState=signal<'idle'|'running'|'done'|'unrecognized'|'error'|'cancelled'>('idle');analysisMessage=signal('');preparingAI=signal(false);private analysisRequest=0;
 saving=signal(false);private formSaveId:string=uid();private formVersion=0;private photoRequest=0;private destroyed=false;
 private drafts=inject(FormDraftService,{optional:true});private draftSession?:DraftSession<MealFormDraft>;
 draftReady=signal(true);recoveredDraft=signal(false);pendingPhoto?:Blob;
 private baseline='';private baselinePhoto?:Blob;
 ngOnInit(){if(!this.drafts)return;this.draftReady.set(false);this.draftSession=this.drafts.bind(this.s.archiveKey(),'nutrition',()=>this.captureMealDraft(),draft=>this.restoreMealDraft(draft));void this.draftSession.ready.finally(()=>this.draftReady.set(true));}
 @HostListener('input') @HostListener('change') draftChanged(){this.draftSession?.changed();}
 @HostListener('window:gymtrack:before-update',['$event']) beforeUpdate(event:Event){if(this.photoBusy())(event as AppUpdateEvent).waitUntil(Promise.resolve(false));}
 async canLeave(){if(this.photoBusy()){this.error.set('Attendi la preparazione della foto prima di uscire.');return false;}return await this.draftSession?.flush()??true;}
 private captureMealDraft():MealFormDraft|null {if(!this.showForm())return null;return {version:1,formSaveId:this.formSaveId,day:this.day,mealDate:this.mealDate,mealType:this.mealType,editing:this.editing,name:this.name,grams:this.grams,calories:this.calories,protein:this.protein,carbs:this.carbs,fat:this.fat,notes:this.notes,foodId:this.foodId,source:this.source,photo:this.photo,pendingPhoto:this.pendingPhoto,ingredients:structuredClone(this.ingredients),composedName:this.composedName,followDay:this.followDay,followMealDate:this.followMealDate};}
 private restoreMealDraft(draft:MealFormDraft){
  const text=(value:unknown,max:number)=>typeof value==='string'&&value.length<=max,numeric=(value:unknown)=>value===null||typeof value==='number';
  if(!draft||draft.version!==1||!text(draft.formSaveId,150)||!draft.formSaveId||!text(draft.day,10)||!text(draft.mealDate,10)||!['breakfast','lunch','dinner','snack'].includes(draft.mealType)||!text(draft.editing,150)||!text(draft.name,100)||!text(draft.notes,2000)||!text(draft.foodId,150)||!text(draft.composedName,100)||!['manual','photo-suggestion'].includes(draft.source)||![draft.grams,draft.calories,draft.protein,draft.carbs,draft.fat].every(numeric)||!Array.isArray(draft.ingredients)||draft.ingredients.length>30||draft.ingredients.some(item=>!item||!text(item.id,150)||!text(item.name,100)||![item.grams,item.calories,item.protein,item.carbs,item.fat].every(numeric))||draft.photo!==undefined&&!(draft.photo instanceof Blob)||draft.pendingPhoto!==undefined&&!(draft.pendingPhoto instanceof Blob))return;
  try{parseLocalDate(draft.day);if(draft.mealDate)parseLocalDate(draft.mealDate);}catch{return;}
  if(!draft.editing&&this.s.data().meals.some(meal=>meal.id===draft.formSaveId)||draft.editing&&this.s.ready()&&!this.s.data().meals.some(meal=>meal.id===draft.editing)){void this.draftSession?.clear().catch(error=>this.error.set((error as Error).message));return;}
  this.formSaveId=draft.formSaveId;for(const key of ['day','mealDate','mealType','editing','name','grams','calories','protein','carbs','fat','notes','foodId','source','photo','pendingPhoto','composedName'] as const)(this as any)[key]=draft[key];
  this.ingredients=structuredClone(draft.ingredients);this.followDay=draft.followDay===true;this.followMealDate=draft.followMealDate===true;if(this.followDay&&this.day!==this.today)this.day=this.today;if(this.followMealDate&&this.mealDate===draft.day)this.mealDate=this.today;this.lastToday=this.today;this.showForm.set(true);this.recoveredDraft.set(true);this.analysisState.set('idle');this.analysisMessage.set('La foto è conservata. Puoi ripetere l’analisi quando vuoi.');
 }
 private draftSignature(){const draft=this.captureMealDraft();if(!draft)return '';const {photo,pendingPhoto,...values}=draft;return JSON.stringify(values);}
 private markBaseline(){this.baseline=this.draftSignature();this.baselinePhoto=this.photo;this.recoveredDraft.set(false);}
 private hasMealChanges(){return this.showForm()&&(this.recoveredDraft()||!!this.pendingPhoto||this.photo!==this.baselinePhoto||this.draftSignature()!==this.baseline);}
 private clearStoredDraft(){void this.draftSession?.clear().catch(error=>this.error.set((error as Error).message));}
 resumePhoto(){if(!this.pendingPhoto||this.photoBusy())return;void this.takePhoto({target:{files:[this.pendingPhoto],value:''}} as unknown as Event);}
 // Date changes through ngModel are read inside these getters, not cached signals.
 meals(){return this.s.data().meals.filter(m=>m.date===this.day).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 totals(){return this.meals().reduce((a,m)=>({calories:a.calories+m.calories,protein:a.protein+m.protein,carbs:a.carbs+m.carbs,fat:a.fat+m.fat}),{calories:0,protein:0,carbs:0,fat:0});}
 url(b:Blob){if(!this.urls.has(b))this.urls.set(b,URL.createObjectURL(b));return this.urls.get(b)!;}
 async takePhoto(event:Event){
  const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file||this.saving()||!this.draftReady())return;
  if(!this.showForm())this.reset();this.showForm.set(true);
  const version=this.formVersion,request=++this.photoRequest;this.analysisRequest++;this.ai.cancel();this.photoBusy.set(true);this.pendingPhoto=file;this.error.set('');this.suggestions.set([]);this.analysisState.set('idle');this.analysisMessage.set('');this.draftChanged();let acquired=false;
  try{const photo=await compressPhoto(file);if(!this.destroyed&&version===this.formVersion&&request===this.photoRequest){this.photo=photo;this.pendingPhoto=undefined;acquired=true;this.draftChanged();}}
  catch(e){if(!this.destroyed&&version===this.formVersion&&request===this.photoRequest){this.error.set((e as Error).message);this.analysisState.set('error');this.analysisMessage.set((e as Error).message);}}
  finally{if(version===this.formVersion&&request===this.photoRequest)this.photoBusy.set(false);}
  if(acquired&&!this.destroyed&&version===this.formVersion&&request===this.photoRequest)await this.recognize();
 }
 removePhoto(){if(this.saving())return;this.photoRequest++;this.analysisRequest++;this.ai.cancel();this.photoBusy.set(false);this.photo=undefined;this.pendingPhoto=undefined;this.suggestions.set([]);this.analysisState.set('idle');this.analysisMessage.set('');this.draftChanged();}
 choose(id:string,fromPhoto=false){this.foodId=id;const f=FOODS.find(f=>f.id===id);if(!f)return;this.name=f.name;this.source=fromPhoto?'photo-suggestion':'manual';this.recalculate();}
 recalculate(){const f=FOODS.find(f=>f.id===this.foodId);if(!f)return;try{Object.assign(this,portion(f,Number(this.grams)));this.draftChanged();}catch(e){this.error.set((e as Error).message);}}
 async prepareAI(){if(this.ai.busy?.())return;this.preparingAI.set(true);try{await this.ai.run(undefined,true);}catch(e){if((e as Error).name!=='AbortError')this.error.set((e as Error).message);}finally{this.preparingAI.set(false);}}
 async recognize(){
  if(!this.photo||this.photoBusy()||this.saving()||this.ai.busy?.())return;
  const photo=this.photo,version=this.formVersion,request=this.photoRequest,analysis=++this.analysisRequest;
  const current=()=>!this.destroyed&&version===this.formVersion&&request===this.photoRequest&&photo===this.photo&&analysis===this.analysisRequest;
  this.error.set('');this.suggestions.set([]);this.analysisState.set('running');this.analysisMessage.set('');
  try{
   const predictions=await this.ai.run(photo,true);if(!current())return;
   this.suggestions.set(foodSuggestions(predictions));
   this.analysisState.set(this.suggestions().length?'done':'unrecognized');
   this.analysisMessage.set(this.suggestions().length?'Scegli l’alimento riconosciuto, poi conferma quantità e valori.':'Non ho riconosciuto un alimento con sufficiente sicurezza. Prova una foto ravvicinata e ben illuminata, oppure scegli un alimento dal riferimento qui sotto.');
  }catch(e){if(current()){const message=(e as Error).message||'Analisi non riuscita. Riprova o scegli un alimento dal riferimento.';this.error.set(message);this.analysisState.set('error');this.analysisMessage.set(message);}}
 }
 cancelAnalysis(){this.analysisRequest++;this.ai.cancel();this.analysisState.set('cancelled');this.analysisMessage.set('Analisi annullata. La foto è conservata: puoi riprovare o compilare il pasto.');}
 async save(){
  if(this.saving()||this.photoBusy())return;
  if(this.pendingPhoto){this.error.set('Riprendi la preparazione della foto oppure scarta la foto in attesa prima di salvare.');return;}
  this.error.set('');if(this.ingredients.length){if(this.name.trim()){this.error.set('Aggiungi l’alimento compilato alla lista prima di confermare.');return;}try{const totals=sumIngredients(this.ingredients);Object.assign(this,totals);}catch(e){this.error.set((e as Error).message);return;}}if((!this.ingredients.length&&!this.name.trim())||!this.mealDate||!Number.isFinite(this.grams)||this.grams<=0||[this.calories,this.protein,this.carbs,this.fat].some(n=>!Number.isFinite(n)||n<0)){this.error.set('Controlla nome, quantità e valori del pasto.');return;}
  const version=this.formVersion,id=this.editing||this.formSaveId;
  const m:Meal={ingredients:this.ingredients.length?structuredClone(this.ingredients):undefined,mealType:this.mealType,id,date:this.mealDate,name:this.ingredients.length?(this.composedName.trim()||this.mealTypeLabel(this.mealType)):this.name.trim(),grams:this.grams,calories:this.calories,protein:this.protein,carbs:this.carbs,fat:this.fat,notes:this.notes,photo:this.photo,source:this.source,createdAt:this.s.data().meals.find(m=>m.id===id)?.createdAt||now()};
  this.saving.set(true);
  try{if(await this.s.change(d=>{const bytes=d.meals.filter(x=>x.id!==m.id).reduce((n,x)=>n+(x.photo?.size||0),0)+(m.photo?.size||0);if(bytes>15*1024*1024)throw Error('Archivio foto oltre 15 MB. Rimuovi alcune foto o salva senza immagine.');const i=d.meals.findIndex(x=>x.id===m.id);if(i<0)d.meals.push(m);else d.meals[i]=m;},'Pasto salvato sul dispositivo.',false)){if(!this.destroyed&&version===this.formVersion){this.day=m.date;this.clearDraft();this.showForm.set(false);this.clearStoredDraft();}}}finally{this.saving.set(false);}
 }
 edit(m:Meal){if(this.saving())return;this.clearDraft();this.formSaveId=m.id;this.showForm.set(true);this.mealType=m.mealType||'breakfast';this.editing=m.id;this.mealDate=m.date;this.followMealDate=false;this.name=m.name;this.grams=m.grams;this.calories=m.calories;this.protein=m.protein;this.carbs=m.carbs;this.fat=m.fat;this.notes=m.notes;this.photo=m.photo;this.source=m.source;this.foodId='';this.ingredients=structuredClone(m.ingredients||[]);this.composedName=m.name;if(this.ingredients.length)this.clearFood();this.markBaseline();this.draftChanged();window.scrollTo({top:0,behavior:'smooth'});}
 async remove(m:Meal){if(await this.confirmation.ask({title:'Eliminare il pasto?',confirmLabel:'Elimina pasto',message:'Il pasto e la sua foto saranno eliminati.',tone:'danger'}))await this.s.change(d=>{d.meals=d.meals.filter(x=>x.id!==m.id);},'Pasto eliminato.',false);}
 openNew(){if(this.saving()||!this.draftReady())return;this.reset();this.showForm.set(true);this.markBaseline();this.draftChanged();}
 async closeForm(){if(this.saving())return;if(this.drafts&&this.hasMealChanges()&&!await this.confirmation.ask('Scartare la bozza di questo pasto? I pasti già salvati restano conservati.'))return;this.reset();this.showForm.set(false);this.clearStoredDraft();}
 reset(){if(!this.saving())this.clearDraft();}
 private clearDraft(){this.formVersion++;this.photoRequest++;this.analysisRequest++;this.formSaveId=uid();this.ai.cancel();this.photoBusy.set(false);this.analysisState.set('idle');this.analysisMessage.set('');this.ingredients=[];this.composedName='';this.error.set('');this.editing='';this.name='';this.foodId='';this.grams=100;this.calories=0;this.protein=0;this.carbs=0;this.fat=0;this.notes='';this.photo=undefined;this.pendingPhoto=undefined;this.source='manual';this.mealDate=this.day;this.followMealDate=this.followDay&&this.day===this.today;this.suggestions.set([]);this.recoveredDraft.set(false);this.baseline='';this.baselinePhoto=undefined;}
 ngOnDestroy(){void this.draftSession?.destroy();this.destroyed=true;this.formVersion++;this.photoRequest++;this.ai.cancel();this.urls.forEach(url=>URL.revokeObjectURL(url));}
}
