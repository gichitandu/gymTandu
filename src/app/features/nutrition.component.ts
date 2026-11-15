import { ProfileLinkComponent } from '../shared/profile-link.component';
import {AuthService} from '../services/auth';
import { DateFieldComponent } from '../shared/date-field.component';
import { confirmationForContext } from '../services/confirmation';
import { RouterLink } from "@angular/router";
import { IconComponent } from "../shared/icon.component";
import { moveDate, parseLocalDate } from "../services/calendar";
import { ActivatedRoute } from "@angular/router";
import { Component, HostListener, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '../services/store';
import { Meal, MealIngredient, localDate, now, uid } from '../models/domain';
import { compressPhoto } from '../services/images';
import { LocalAiService } from '../services/local-ai';
import { FOODS, foodSuggestions, mealTypeForHour, portion, sumIngredients, resizeIngredient } from '../services/nutrition';
import { MealScanLimitError, MealScanResult, MealScanService } from '../services/meal-scan';
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
@Component({standalone:true,styleUrls:["./feature-polish.css","./nutrition-simple.css", "./nutrition-redesign.css"],imports: [ProfileLinkComponent,DateFieldComponent,RouterLink,FormsModule,StatusComponent,IconComponent],template:`
<header class="meals-heading su-head"><h1>Pasti</h1><div class="su-actions"><gt-profile-link/></div></header>
<div class="nutrition-day-selector"><button class="icon-btn ghost" aria-label="Giorno precedente" (click)="moveDay(-1)"><gt-icon name="back"/></button><label class="nutrition-date-heading"><strong>{{day===today?'Oggi · ':''}}{{dayLabel()}}</strong><gt-date-field aria-label="Data alimentazione" [ngModel]="day" (ngModelChange)="selectDay($event)"></gt-date-field></label><button class="icon-btn ghost" aria-label="Giorno successivo" (click)="moveDay(1)">›</button></div><gt-status/>
<input #camera hidden type="file" accept="image/*" capture="environment" (change)="takePhoto($event)"/><input #gallery hidden type="file" accept="image/*" (change)="takePhoto($event)"/>
@if(!showForm()){
<section class="meal-summary" aria-label="Riepilogo alimentazione" [style.--p]="calorieProgress()+'%'">
 <div class="meal-calories"><strong>{{totals().calories.toLocaleString('it-IT',{maximumFractionDigits:0})}}</strong>@if(s.settings().goals?.calories){<span> / {{s.settings().goals?.calories?.toLocaleString('it-IT')}} kcal</span>}@else{<span> kcal</span>}</div>
 @if(s.settings().goals?.calories){<div class="meal-progress" role="progressbar" aria-label="Obiettivo calorie" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="calorieProgress()"><span [style.width.%]="calorieProgress()"></span></div>}
 <p class="meal-macros" aria-label="Macronutrienti">P {{totals().protein.toLocaleString('it-IT',{maximumFractionDigits:0})}} g · C {{totals().carbs.toLocaleString('it-IT',{maximumFractionDigits:0})}} g · G {{totals().fat.toLocaleString('it-IT',{maximumFractionDigits:0})}} g</p>
 <div class="meal-macro-bars" aria-hidden="true"><i [style.width.%]="macroPct('protein')"></i><i [style.width.%]="macroPct('carbs')"></i><i [style.width.%]="macroPct('fat')"></i></div>
 <a class="meal-goal-link" routerLink="/profilo" [queryParams]="{section:'goals'}">{{s.settings().goals?.calories?'Modifica obiettivo':'Imposta obiettivo'}}</a>
</section>
@if(aiBlocked()){<p class="meal-ai-wait" role="status"><gt-icon name="clock"/><span><b>Attendere ripristino</b>{{aiWaitDetail()}}</span></p>}
<div class="meal-list-heading"><h2>Diario</h2><span>{{meals().length}} {{meals().length===1?'pasto':'pasti'}}</span></div>
@for(group of mealGroups();track group.key){<p class="meal-group-title">{{group.label}}</p><div class="meal-diary-list">@for(m of group.meals;track m.id){<article class="card meal-diary-row">@if(m.photo){<img [src]="url(m.photo)" alt="" loading="lazy"/>}@else{<span class="meal-fallback"><gt-icon name="nutrition"/></span>}<button class="meal-diary-main" (click)="edit(m)"><strong>{{m.name||mealTypeLabel(m.mealType)}}</strong><span>P {{m.protein.toLocaleString('it-IT',{maximumFractionDigits:0})}} · C {{m.carbs.toLocaleString('it-IT',{maximumFractionDigits:0})}} · G {{m.fat.toLocaleString('it-IT',{maximumFractionDigits:0})}}@if(m.source==='photo-suggestion'){ · <em class="meal-ai">da foto</em>}</span></button><span class="meal-kcal">{{m.calories.toLocaleString('it-IT',{maximumFractionDigits:0})}}</span></article>}</div>}@empty{<div class="card empty meal-empty"><h3>Nessun pasto per questa data</h3><p>Fotografa il piatto o un’etichetta: alimenti e valori vengono proposti da soli. Oppure scrivi il pasto a mano.</p></div>}
<div class="meal-add su-sticky"><div class="su-btns"><button type="button" class="su-btn su-primary" (click)="captureMenu.set(false);camera.click()" [disabled]="saving()||photoBusy()||!draftReady()"><gt-icon name="camera"/>Fotografa</button><button type="button" class="su-btn meal-write" (click)="openNew()" [disabled]="saving()||photoBusy()||!draftReady()"><gt-icon name="edit"/>Scrivi</button><button type="button" class="su-iconbtn meal-gallery" (click)="gallery.click()" [disabled]="saving()||photoBusy()||!draftReady()" aria-label="Scegli una foto dalla galleria"><gt-icon name="plus"/></button></div></div>
@if(aiMeter();as meter){<div class="meal-ai-meter" role="status"><span>{{meter.text}}</span><div class="meal-ai-meter-bar" aria-hidden="true"><i [style.width.%]="meter.percent"></i></div></div>}
} @else {
<section class="card meal-editor" [attr.aria-busy]="saving()" [attr.inert]="saving()?'':null">@if(photo){<ol class="scan-steps" aria-label="Scansione pasto"><li class="done">1 · Foto acquisita</li><li class="active" aria-current="step">{{analysisState()==='running'?'2 · Analisi in corso':'2 · Controlla e salva'}}</li></ol>}<div class="card-head"><h2>{{editing?'Modifica pasto':photo?'Controlla e conferma':'Registra un pasto'}}</h2><button class="icon-btn ghost" aria-label="Torna al diario" (click)="closeForm()" [disabled]="saving()">×</button></div>
@if(recoveredDraft()){<p class="notice">Bozza recuperata. Controlla i dati e conferma il pasto quando è pronto.</p>}
@if(pendingPhoto&&!photoBusy()){<div class="actions"><button type="button" (click)="resumePhoto()">Riprendi preparazione della foto</button><button type="button" (click)="removePhoto()">Scarta foto in attesa</button></div>}
@if(photoBusy()){<p class="subtle" role="status">Preparazione della foto…</p>}
@if(error()){<p class="notice meal-error" role="alert">{{error()}}</p>}
@if(photo){<img class="meal-preview" [src]="url(photo)" alt="Foto del pasto da controllare"/>
<div class="meal-ai-status" role="status" aria-live="polite" [attr.aria-busy]="analysisState()==='running'">
@if(analysisState()==='running'){<strong>{{analysisSource()==='cloud'?'Lettura della foto con l’AI…':'Analisi della foto…'}}</strong>@if(analysisSource()!=='cloud'){<p>{{ai.status()}}</p>}}@else if(analysisState()==='blocked'||aiBlocked()&&analysisState()==='idle'){<p class="meal-ai-wait"><gt-icon name="clock"/><span><b>Attendere ripristino</b>{{aiWaitDetail()}}</span></p>}@else if(analysisMessage()){<p>{{analysisMessage()}}</p>}
</div>
<div class="actions">@if(analysisState()==='running'){<button type="button" (click)="cancelAnalysis()">Annulla analisi</button>}@else if(!aiBlocked()){<button type="button" [class.primary]="!ingredients.length" (click)="recognize()" [disabled]="analysisBusy()||photoBusy()||!canAnalyze()">{{analysisState()==='idle'?'Analizza foto':'Riprova analisi'}}</button>}@else if(ai.supported){<button type="button" (click)="recognize(true)" [disabled]="analysisBusy()||photoBusy()">Prova sul dispositivo</button>}<button type="button" (click)="removePhoto()">Rimuovi foto</button></div>
<details class="meal-photo-options"><summary>Cambia foto</summary><div class="actions"><button type="button" (click)="camera.click()" [disabled]="photoBusy()">Scatta foto</button><button type="button" (click)="gallery.click()" [disabled]="photoBusy()">Scegli da Foto</button></div></details>}
@else{<div class="actions meal-photo-add"><button type="button" (click)="camera.click()" [disabled]="photoBusy()"><gt-icon name="camera"/>Scatta foto</button><button type="button" (click)="gallery.click()" [disabled]="photoBusy()">Scegli da Foto</button></div>}
@if(suggestions().length){<div class="notice"><b>Possibili alimenti · scegli e correggi</b><div class="actions">@for(food of suggestions();track food.id){<button (click)="choose(food.id,true)">{{food.name}}</button>}</div></div>}
@if(photo){<p class="meal-estimate-note">Stima da verificare: controlla alimenti, quantità e valori prima di salvare.@if(analysisSource()==='cloud'){ Per l’analisi la foto è stata inviata a Cloudflare Workers AI.}</p>}
@if(ingredients.length){<section class="ingredient-review"><div class="section-title"><h3>Alimenti del pasto</h3><span class="pill">{{ingredients.length}} {{ingredients.length===1?'voce':'voci'}}</span></div>@for(item of ingredients;track item.id){<div class="ingredient-item"><div class="ingredient-title"><strong>{{item.name}}</strong><button class="icon-btn ghost danger" [attr.aria-label]="'Rimuovi '+item.name" (click)="removeIngredient(item.id)">×</button></div><div class="ingredient-quick"><label>Quantità (g)<input type="number" inputmode="decimal" min="1" max="10000" [ngModel]="item.grams" (change)="changeIngredientGrams(item.id,$any($event.target).valueAsNumber)"/></label><p class="ingredient-summary"><strong>{{item.calories.toLocaleString('it-IT',{maximumFractionDigits:0})}} kcal</strong><span>P {{item.protein.toLocaleString('it-IT',{maximumFractionDigits:1})}} · C {{item.carbs.toLocaleString('it-IT',{maximumFractionDigits:1})}} · G {{item.fat.toLocaleString('it-IT',{maximumFractionDigits:1})}}</span></p></div><details class="ingredient-more"><summary>Correggi nome e valori</summary><label>Nome<input type="text" maxlength="100" [ngModel]="item.name" (change)="renameIngredient(item.id,$any($event.target).value)"/></label><div class="ingredient-values">@for(field of nutritionFields;track field.key){<label>{{field.label}}<input type="number" inputmode="decimal" min="0" step="0.1" [ngModel]="item[field.key]" (ngModelChange)="changeIngredientValue(item.id,field.key,$event)"/></label>}</div></details></div>}<p class="subtle">Cambia i grammi: calorie e macronutrienti si ricalcolano in proporzione.</p></section>}
<form (ngSubmit)="save()"><div class="meal-type-chips" role="radiogroup" aria-label="Tipo di pasto">@for(type of mealTypes;track type.id){<button type="button" role="radio" [attr.aria-checked]="mealType===type.id" [class.active]="mealType===type.id" (click)="setMealType(type.id)">{{type.label}}</button>}</div>
<div class="form-grid">
@if(ingredients.length){<label class="wide meal-name-field">Nome del pasto<input name="composed-name" [(ngModel)]="composedName" maxlength="100" placeholder="Es. Pollo con riso e verdure"/></label><div class="wide meal-confirm-totals"><span>Totale del pasto</span><strong>{{ingredientTotal()?.calories??'—'}} kcal</strong><small>Proteine {{ingredientTotal()?.protein??'—'}} g · Carboidrati {{ingredientTotal()?.carbs??'—'}} g · Grassi {{ingredientTotal()?.fat??'—'}} g</small></div>
@if(!addingFood()){<div class="wide"><button type="button" class="full-width" (click)="addingFood.set(true)">+ Aggiungi un altro alimento</button></div>}}
@if(!ingredients.length||addingFood()){<details class="wide meal-form-details"><summary>Cerca un alimento</summary><label>Alimento<select name="food" [(ngModel)]="foodId" (ngModelChange)="choose($event)"><option value="">Seleziona</option>@for(food of foods;track food.id){<option [value]="food.id">{{food.name}}</option>}</select></label></details>
<label class="wide">{{ingredients.length?'Alimento da aggiungere':'Nome del pasto'}}<input name="name" [(ngModel)]="name" [required]="!ingredients.length" maxlength="100" /></label>
<label class="wide">Quantità (g)<input name="grams" type="number" inputmode="decimal" [(ngModel)]="grams" required min="1" max="10000" /></label>
@if(foodId){<button type="button" class="wide" (click)="recalculate()">Ricalcola per questi grammi dal riferimento</button>}
<label>Calorie totali (kcal)<input name="calories" type="number" inputmode="decimal" [(ngModel)]="calories" required min="0" max="20000" step="0.1" /></label>
<label>Proteine totali (g)<input name="protein" type="number" inputmode="decimal" [(ngModel)]="protein" required min="0" max="2000" step="0.1" /></label>
<label>Carboidrati totali (g)<input name="carbs" type="number" inputmode="decimal" [(ngModel)]="carbs" required min="0" max="3000" step="0.1" /></label>
<label>Grassi totali (g)<input name="fat" type="number" inputmode="decimal" [(ngModel)]="fat" required min="0" max="2000" step="0.1" /></label>
<div class="wide"><button type="button" class="full-width" (click)="addIngredient()">{{ingredients.length?'Aggiungi alla lista':'+ Aggiungi alimento al pasto'}}</button></div>}
<label class="wide">Data del pasto<gt-date-field name="meal-date" [ngModel]="mealDate" (ngModelChange)="selectMealDate($event)" required ></gt-date-field></label>
<details class="wide meal-form-details"><summary>Note{{notes?' · presenti':''}}</summary><label>Note e correzioni<textarea name="notes" [(ngModel)]="notes" maxlength="2000"></textarea></label></details>
</div><details class="meal-form-details"><summary>Come leggere i valori</summary><p class="subtle">I valori indicano il totale della porzione. Per una maggiore precisione usa l’etichetta del prodotto; le ricette possono cambiare i valori di riferimento.</p></details>
<div class="actions"><button class="primary" [disabled]="saving()||s.busy()||photoBusy()||!s.ready()">{{saving()?'Salvataggio…':'Salva pasto'}}</button><button type="button" (click)="closeForm()" [disabled]="saving()">{{editing?'Annulla modifica':'Annulla'}}</button></div></form>
@if(editing){<button class="ghost danger full-width" (click)="removeCurrent()">Elimina questo pasto</button>}
</section>}
@if(isAdmin()){<details class="card ai-details" [open]="aiOpen"><summary>Lettura foto con AI · solo admin</summary>
@if(cloud?.status();as c){<dl class="device-report"><dt>Workers AI (Cloudflare)</dt><dd>{{c.available?(c.blocked?'In pausa: attendere ripristino':'Attiva'):c.setup==='migration'?'Database da aggiornare: applica le migrazioni':'Non configurata su questo server'}}</dd>@if(c.available){<dt>Uso di oggi</dt><dd>{{c.used}} di {{c.limit}} Neuron ({{c.usedPercent}}%) · {{c.requests}} letture</dd><dt>Blocco automatico</dt><dd>Al {{c.thresholdPercent}}% del limite gratuito ({{c.cap}} Neuron)</dd><dt>Ripristino</dt><dd>Ogni giorno alle {{cloud!.resetTime()}} (00:00 UTC)</dd>}</dl>}
<p class="subtle" style="margin-top:12px">Con l’account online la foto viene letta da Workers AI di Cloudflare, che propone alimenti, grammi e valori. Il server conta i consumi e si ferma prima del limite gratuito giornaliero: fino al ripristino non parte alcuna richiesta. Senza connessione, senza Workers AI o durante la pausa resta il riconoscimento sul dispositivo qui sotto.</p>
@if(cloud?.status()?.gemini;as g){<div class="gemini-box" style="margin-top:12px"><h4 style="margin:0 0 6px">Gemini personale (gratuito)</h4>
<p class="subtle">{{g.configured?(g.source==='app'?'Attivo con la tua chiave. Le tue foto vengono lette da Gemini; gli altri account usano Workers AI. Oggi: '+g.used+' di '+g.dailyLimit+' letture.':'Attivo con la chiave impostata sul server.'):'Incolla la tua chiave di Google AI Studio per far leggere a Gemini le tue foto. Gli altri account continuano a usare Workers AI. Se Gemini non risponde o finisce il limite si passa automaticamente a Workers AI.'}}</p>
@if(!g.storage){<p class="subtle">Archivio del server non disponibile: impossibile salvare la chiave.</p>}@else{
<form (submit)="$event.preventDefault();saveGemini()"><label>Chiave API Gemini<input type="password" autocomplete="off" autocapitalize="off" spellcheck="false" [value]="geminiKey()" (input)="geminiKey.set($any($event.target).value)" placeholder="Incolla la chiave"></label>
<label>Modello (facoltativo)<input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" [value]="geminiModel()" (input)="geminiModel.set($any($event.target).value)" [placeholder]="g.model"></label>
<div class="actions"><button class="primary" [disabled]="geminiBusy()||!geminiKey().trim()">{{geminiBusy()?'Verifica in corso…':g.configured&&g.source==='app'?'Sostituisci chiave':'Salva e attiva'}}</button>@if(g.configured&&g.source==='app'){<button type="button" class="ghost danger" (click)="removeGemini()" [disabled]="geminiBusy()">Rimuovi chiave</button>}</div></form>}
@if(geminiMessage()){<p class="subtle" role="status">{{geminiMessage()}}</p>}
<p class="subtle">La chiave viene verificata con Google, salvata cifrata sul server e non viene mai mostrata né restituita all’app. Con il piano gratuito Google può usare le foto inviate per migliorare i suoi servizi: usalo solo per foto che puoi condividere.</p></div>}
<p class="subtle" style="margin-top:12px">Riconoscimento sul dispositivo: il primo utilizzo scarica il modello gratuito (circa 2 MB), poi funziona anche offline. Riconosce alcuni alimenti singoli e può non riconoscere piatti misti: scegli o correggi sempre i risultati prima di salvare.</p><p class="subtle" style="margin-top:12px">{{ai.status()}}</p>
@if(ai.report();as r){<dl class="device-report"><dt>Motore</dt><dd>{{r.backend}} · {{r.model}}</dd><dt>Ultima prova sul dispositivo</dt><dd>{{r.milliseconds}} ms per inferenza, {{r.loadMs}} ms caricamento</dd><dt>Memoria tensori</dt><dd>{{(r.tensorBytes/1048576).toFixed(1)}} MB (non è la RAM totale)</dd><dt>Modello all’avvio della prova</dt><dd>{{r.cached?'Letto dal dispositivo':'Caricato dal sito'}}</dd></dl>}
<div class="actions"><button (click)="prepareAI()" [disabled]="ai.busy()||!ai.supported">Verifica modello</button>@if(ai.busy()&&(preparingAI()||analysisState()==='running')){<button (click)="analysisState()==='running'?cancelAnalysis():ai.cancel()">Interrompi</button>}<button (click)="ai.remove()" [disabled]="ai.busy()">Reimposta riconoscimento</button></div>
<p class="subtle" style="margin-top:14px">WebGPU non è richiesta. Su un dispositivo lento, con memoria ridotta o non supportato, puoi registrare tutto manualmente. Nessuna stima viene salvata automaticamente.</p></details>}
`})
export class NutritionComponent {
 private confirmation=confirmationForContext();
 ingredients:MealIngredient[]=[];composedName='';nutritionFields:{key:'calories'|'protein'|'carbs'|'fat';label:string}[]=[{key:'calories',label:'kcal'},{key:'protein',label:'Proteine (g)'},{key:'carbs',label:'Carboidrati (g)'},{key:'fat',label:'Grassi (g)'}];
 ingredientTotal(){try{return sumIngredients(this.ingredients);}catch{return null;}}
 addIngredient(){try{const item={id:uid(),name:this.name.trim(),grams:this.grams,calories:this.calories,protein:this.protein,carbs:this.carbs,fat:this.fat};sumIngredients([...this.ingredients,item]);this.ingredients=[...this.ingredients,item];this.clearFood();this.addingFood.set(false);this.error.set('');this.draftChanged();}catch(e){this.error.set((e as Error).message);}}
 clearFood(){this.name='';this.foodId='';this.grams=100;this.calories=0;this.protein=0;this.carbs=0;this.fat=0;}
 removeIngredient(id:string){this.ingredients=this.ingredients.filter(i=>i.id!==id);this.draftChanged();}
 changeIngredientGrams(id:string,grams:number){try{this.ingredients=this.ingredients.map(i=>i.id===id?resizeIngredient(i,grams):i);this.error.set('');this.draftChanged();}catch(e){this.error.set((e as Error).message);}}
 renameIngredient(id:string,value:string){const name=String(value||'').trim().slice(0,100);if(!name)return;this.ingredients=this.ingredients.map(i=>i.id===id?{...i,name}:i);this.draftChanged();}
 changeIngredientValue(id:string,key:'calories'|'protein'|'carbs'|'fat',value:number){this.ingredients=this.ingredients.map(i=>i.id===id?{...i,[key]:value}:i);this.draftChanged();}
 private todayService=inject(TodayService,{optional:true});private lastToday=localDate();private followDay=true;private followMealDate=true;
 get today(){return this.todayService?.date()||localDate();}
 captureMenu=signal(false);
 macroPct(key:'protein'|'carbs'|'fat'){const t=this.totals();const sum=t.protein+t.carbs+t.fat;return sum?Math.max(6,Math.round(t[key]/sum*100)):0;}
 calorieProgress(){const goal=this.s.settings().goals?.calories;return goal?Math.min(100,Math.max(0,this.totals().calories/goal*100)):0;}
 showForm=signal(false);mealType:NonNullable<Meal['mealType']>=mealTypeForHour(new Date().getHours());
 mealTypes:{id:NonNullable<Meal['mealType']>;label:string}[]=[{id:'breakfast',label:'Colazione'},{id:'lunch',label:'Pranzo'},{id:'snack',label:'Spuntino'},{id:'dinner',label:'Cena'}];
 setMealType(type:NonNullable<Meal['mealType']>){this.mealType=type;this.draftChanged();}
 /** Campi per aggiungere a mano un altro alimento quando la lista è già compilata. */
 addingFood=signal(false);
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
 analysisState=signal<'idle'|'running'|'done'|'unrecognized'|'error'|'cancelled'|'blocked'>('idle');analysisMessage=signal('');preparingAI=signal(false);private analysisRequest=0;
 /** Lettura con Workers AI tramite il server; assente offline o nei contesti senza account. */
 cloud=inject(MealScanService,{optional:true});analysisSource=signal<''|'cloud'|'device'>('');private scanIds=new Set<string>();
 geminiKey=signal('');geminiModel=signal('');geminiBusy=signal(false);geminiMessage=signal('');
 async saveGemini(){
  if(!this.cloud||this.geminiBusy())return;this.geminiBusy.set(true);this.geminiMessage.set('');
  try{await this.cloud.saveGeminiKey(this.geminiKey(),this.geminiModel());this.geminiKey.set('');this.geminiMessage.set('Gemini attivato per il tuo account.');}
  catch(e){this.geminiMessage.set((e as Error).message);}finally{this.geminiBusy.set(false);}
 }
 async removeGemini(){
  if(!this.cloud||this.geminiBusy())return;this.geminiBusy.set(true);this.geminiMessage.set('');
  try{await this.cloud.removeGeminiKey();this.geminiMessage.set('Chiave rimossa: le tue foto tornano a Workers AI.');}
  catch(e){this.geminiMessage.set((e as Error).message);}finally{this.geminiBusy.set(false);}
 }
 aiBlocked(){return !!this.cloud?.blocked();}
 aiWaitDetail(){const time=this.cloud?.resetTime();return 'Lettura foto con AI in pausa'+(time?' fino alle '+time:'')+': il limite gratuito giornaliero è quasi raggiunto. Puoi comunque scrivere il pasto a mano.';}
 aiMeter(){const status=this.cloud?.status();if(!status?.available||this.aiBlocked())return null;return {percent:Math.min(100,status.thresholdPercent>0?status.usedPercent/status.thresholdPercent*100:100),text:'Lettura foto con AI · usato il '+status.usedPercent.toLocaleString('it-IT',{maximumFractionDigits:1})+'% del limite gratuito di oggi'};}
 analysisBusy(){return !!this.ai.busy?.()||!!this.cloud?.busy();}
 canAnalyze(){return !!this.cloud?.online()||this.ai.supported!==false;}
 saving=signal(false);private formSaveId:string=uid();private formVersion=0;private photoRequest=0;private destroyed=false;
 private drafts=inject(FormDraftService,{optional:true});private draftSession?:DraftSession<MealFormDraft>;
 draftReady=signal(true);recoveredDraft=signal(false);pendingPhoto?:Blob;
 private baseline='';private baselinePhoto?:Blob;
 ngOnInit(){void this.cloud?.ensureStatus();if(!this.drafts)return;this.draftReady.set(false);this.draftSession=this.drafts.bind(this.s.archiveKey(),'nutrition',()=>this.captureMealDraft(),draft=>this.restoreMealDraft(draft));void this.draftSession.ready.finally(()=>this.draftReady.set(true));}
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
  this.ingredients=structuredClone(draft.ingredients);this.followDay=draft.followDay===true;this.followMealDate=draft.followMealDate===true;if(this.followDay&&this.day!==this.today)this.day=this.today;if(this.followMealDate&&this.mealDate===draft.day)this.mealDate=this.today;this.lastToday=this.today;this.addingFood.set(!!this.ingredients.length&&!!this.name.trim());this.showForm.set(true);this.recoveredDraft.set(true);this.analysisState.set('idle');this.analysisMessage.set('La foto è conservata. Puoi ripetere l’analisi quando vuoi.');
 }
 private draftSignature(){const draft=this.captureMealDraft();if(!draft)return '';const {photo,pendingPhoto,...values}=draft;return JSON.stringify(values);}
 private markBaseline(){this.baseline=this.draftSignature();this.baselinePhoto=this.photo;this.recoveredDraft.set(false);}
 private hasMealChanges(){return this.showForm()&&(this.recoveredDraft()||!!this.pendingPhoto||this.photo!==this.baselinePhoto||this.draftSignature()!==this.baseline);}
 private clearStoredDraft(){void this.draftSession?.clear().catch(error=>this.error.set((error as Error).message));}
 resumePhoto(){if(!this.pendingPhoto||this.photoBusy())return;void this.takePhoto({target:{files:[this.pendingPhoto],value:''}} as unknown as Event);}
 // Date changes through ngModel are read inside these getters, not cached signals.
 meals(){return this.s.data().meals.filter(m=>m.date===this.day).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 /** Pasti raggruppati per momento della giornata (chi non ha un momento va in «Altri pasti»). */
 mealGroups(){const order:[Meal['mealType']|'',string][]=[['breakfast','Colazione'],['lunch','Pranzo'],['snack','Spuntino'],['dinner','Cena'],['','Altri pasti']];const all=this.meals();return order.map(([key,label])=>({key:key||'other',label,meals:all.filter(m=>(m.mealType||'')===key).reverse()})).filter(group=>group.meals.length);}
 private auth=inject(AuthService,{optional:true});isAdmin(){return this.auth?.uiRole()==='SuperAdmin'||this.auth?.uiRole()==='Admin';}
 aiOpen=inject(ActivatedRoute).snapshot.queryParamMap.get('ai')==='1';
 totals(){return this.meals().reduce((a,m)=>({calories:a.calories+m.calories,protein:a.protein+m.protein,carbs:a.carbs+m.carbs,fat:a.fat+m.fat}),{calories:0,protein:0,carbs:0,fat:0});}
 url(b:Blob){if(!this.urls.has(b))this.urls.set(b,URL.createObjectURL(b));return this.urls.get(b)!;}
 async takePhoto(event:Event){
  const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file||this.saving()||!this.draftReady())return;
  if(!this.showForm())this.reset();this.captureMenu.set(false);this.showForm.set(true);
  const version=this.formVersion,request=++this.photoRequest;this.analysisRequest++;this.ai.cancel();this.cloud?.cancel();this.photoBusy.set(true);this.pendingPhoto=file;this.error.set('');this.suggestions.set([]);this.analysisState.set('idle');this.analysisMessage.set('');this.draftChanged();let acquired=false;
  try{const photo=await compressPhoto(file);if(!this.destroyed&&version===this.formVersion&&request===this.photoRequest){this.photo=photo;this.pendingPhoto=undefined;acquired=true;this.draftChanged();}}
  catch(e){if(!this.destroyed&&version===this.formVersion&&request===this.photoRequest){this.error.set((e as Error).message);this.analysisState.set('error');this.analysisMessage.set((e as Error).message);}}
  finally{if(version===this.formVersion&&request===this.photoRequest)this.photoBusy.set(false);}
  if(acquired&&!this.destroyed&&version===this.formVersion&&request===this.photoRequest)await this.recognize();
 }
 removePhoto(){if(this.saving())return;this.photoRequest++;this.analysisRequest++;this.ai.cancel();this.cloud?.cancel();this.photoBusy.set(false);this.photo=undefined;this.pendingPhoto=undefined;this.suggestions.set([]);this.analysisState.set('idle');this.analysisMessage.set('');this.draftChanged();}
 choose(id:string,fromPhoto=false){this.foodId=id;const f=FOODS.find(f=>f.id===id);if(!f)return;this.name=f.name;this.source=fromPhoto?'photo-suggestion':'manual';this.recalculate();}
 recalculate(){const f=FOODS.find(f=>f.id===this.foodId);if(!f)return;try{Object.assign(this,portion(f,Number(this.grams)));this.draftChanged();}catch(e){this.error.set((e as Error).message);}}
 async prepareAI(){if(this.ai.busy?.())return;this.preparingAI.set(true);try{await this.ai.run(undefined,true);}catch(e){if((e as Error).name!=='AbortError')this.error.set((e as Error).message);}finally{this.preparingAI.set(false);}}
 /** Legge la foto: prima con Workers AI (se disponibile e non in pausa), altrimenti sul dispositivo. */
 async recognize(deviceOnly=false){
  if(!this.photo||this.photoBusy()||this.saving()||this.analysisBusy())return;
  const photo=this.photo,version=this.formVersion,request=this.photoRequest,analysis=++this.analysisRequest;
  const current=()=>!this.destroyed&&version===this.formVersion&&request===this.photoRequest&&photo===this.photo&&analysis===this.analysisRequest;
  this.error.set('');this.suggestions.set([]);this.analysisState.set('running');this.analysisMessage.set('');
  if(this.cloud&&!deviceOnly){
   this.analysisSource.set('cloud');
   try{
    // Con il blocco attivo non parte nessuna richiesta, nemmeno quella dello stato.
    const status=this.cloud.blocked()?null:await this.cloud.ensureStatus();if(!current())return;
    if(this.cloud.blocked()){this.showBlocked();return;}
    if(status?.available){const result=await this.cloud.scan(photo);if(!current())return;this.applyScan(result);return;}
   }catch(e){
    if(!current())return;
    if(e instanceof MealScanLimitError){this.showBlocked();return;}
    if((e as {code?:string}).code!=='AI_UNAVAILABLE'){const message=(e as Error).message||'Analisi non riuscita. Riprova o scrivi il pasto a mano.';this.error.set(message);this.analysisState.set('error');this.analysisMessage.set(message);return;}
   }
  }
  this.analysisSource.set('device');
  try{
   const predictions=await this.ai.run(photo,true);if(!current())return;
   this.suggestions.set(foodSuggestions(predictions));
   this.analysisState.set(this.suggestions().length?'done':'unrecognized');
   this.analysisMessage.set(this.suggestions().length?'Scegli l’alimento riconosciuto, poi conferma quantità e valori.':'Non ho riconosciuto un alimento con sufficiente sicurezza. Prova una foto ravvicinata e ben illuminata, oppure scegli un alimento dal riferimento qui sotto.');
  }catch(e){if(current()){const message=(e as Error).message||'Analisi non riuscita. Riprova o scegli un alimento dal riferimento.';this.error.set(message);this.analysisState.set('error');this.analysisMessage.set(message);}}
 }
 private showBlocked(){this.analysisState.set('blocked');this.analysisMessage.set(this.cloud?.waitMessage()||'Attendere ripristino.');}
 /** Gli alimenti letti dall'AI diventano voci modificabili: nulla viene salvato senza conferma. */
 private applyScan(result:MealScanResult){
  if(!result.items.length){this.analysisState.set('unrecognized');this.analysisMessage.set('Non ho riconosciuto alimenti in questa foto. Riprova con una foto più nitida e ravvicinata, oppure scrivi il pasto a mano.');return;}
  const items=result.items.map(item=>({id:uid(),...item})),kept=this.ingredients.filter(item=>!this.scanIds.has(item.id));
  try{sumIngredients([...kept,...items]);}catch(e){const message=(e as Error).message;this.error.set(message);this.analysisState.set('error');this.analysisMessage.set(message);return;}
  this.ingredients=[...kept,...items];this.scanIds=new Set(items.map(item=>item.id));
  if(!this.composedName.trim()&&result.dish)this.composedName=result.dish;
  this.source='photo-suggestion';this.addingFood.set(!!this.name.trim());
  this.analysisState.set('done');
  this.analysisMessage.set(result.kind==='label'?'Ho letto l’etichetta: controlla porzione e valori, poi salva.':items.length===1?'Ho trovato 1 alimento: controlla la quantità e salva.':'Ho trovato '+items.length+' alimenti: controlla le quantità e salva.');
  this.draftChanged();
 }
 cancelAnalysis(){this.analysisRequest++;this.ai.cancel();this.cloud?.cancel();this.analysisState.set('cancelled');this.analysisMessage.set('Analisi annullata. La foto è conservata: puoi riprovare o compilare il pasto.');}
 async save(){
  if(this.saving()||this.photoBusy())return;
  if(this.pendingPhoto){this.error.set('Riprendi la preparazione della foto oppure scarta la foto in attesa prima di salvare.');return;}
  this.error.set('');if(this.ingredients.length){if(this.name.trim()){this.error.set('Aggiungi l’alimento compilato alla lista prima di confermare.');return;}try{const totals=sumIngredients(this.ingredients);Object.assign(this,totals);}catch(e){this.error.set((e as Error).message);return;}}if((!this.ingredients.length&&!this.name.trim())||!this.mealDate||!Number.isFinite(this.grams)||this.grams<=0||[this.calories,this.protein,this.carbs,this.fat].some(n=>!Number.isFinite(n)||n<0)){this.error.set('Controlla nome, quantità e valori del pasto.');return;}
  const version=this.formVersion,id=this.editing||this.formSaveId;
  const m:Meal={ingredients:this.ingredients.length?structuredClone(this.ingredients):undefined,mealType:this.mealType,id,date:this.mealDate,name:this.ingredients.length?(this.composedName.trim()||this.mealTypeLabel(this.mealType)):this.name.trim(),grams:this.grams,calories:this.calories,protein:this.protein,carbs:this.carbs,fat:this.fat,notes:this.notes,photo:this.photo,source:this.source,createdAt:this.s.data().meals.find(m=>m.id===id)?.createdAt||now()};
  this.saving.set(true);
  try{if(await this.s.change(d=>{const bytes=d.meals.filter(x=>x.id!==m.id).reduce((n,x)=>n+(x.photo?.size||0),0)+(m.photo?.size||0);if(bytes>15*1024*1024)throw Error('Archivio foto oltre 15 MB. Rimuovi alcune foto o salva senza immagine.');const i=d.meals.findIndex(x=>x.id===m.id);if(i<0)d.meals.push(m);else d.meals[i]=m;},'Pasto salvato sul dispositivo.',false)){if(!this.destroyed&&version===this.formVersion){this.day=m.date;this.clearDraft();this.showForm.set(false);this.clearStoredDraft();}}}finally{this.saving.set(false);}
 }
 edit(m:Meal){if(this.saving())return;this.captureMenu.set(false);this.clearDraft();this.formSaveId=m.id;this.showForm.set(true);this.mealType=m.mealType||'breakfast';this.editing=m.id;this.mealDate=m.date;this.followMealDate=false;this.name=m.name;this.grams=m.grams;this.calories=m.calories;this.protein=m.protein;this.carbs=m.carbs;this.fat=m.fat;this.notes=m.notes;this.photo=m.photo;this.source=m.source;this.foodId='';this.ingredients=structuredClone(m.ingredients||[]);this.composedName=m.name;if(this.ingredients.length)this.clearFood();this.markBaseline();this.draftChanged();window.scrollTo({top:0,behavior:'smooth'});}
 async remove(m:Meal){if(await this.confirmation.ask({title:'Eliminare il pasto?',confirmLabel:'Elimina pasto',message:'Il pasto e la sua foto saranno eliminati.',tone:'danger'}))await this.s.change(d=>{d.meals=d.meals.filter(x=>x.id!==m.id);},'Pasto eliminato.',false);}
 openNew(){if(this.saving()||!this.draftReady())return;this.captureMenu.set(false);this.reset();this.showForm.set(true);this.markBaseline();this.draftChanged();}
 async closeForm(){if(this.saving())return;if(this.drafts&&this.hasMealChanges()&&!await this.confirmation.ask('Scartare la bozza di questo pasto? I pasti già salvati restano conservati.'))return;this.reset();this.showForm.set(false);this.clearStoredDraft();}
 reset(){if(!this.saving())this.clearDraft();}
 private clearDraft(){this.formVersion++;this.photoRequest++;this.analysisRequest++;this.formSaveId=uid();this.ai.cancel();this.cloud?.cancel();this.photoBusy.set(false);this.analysisState.set('idle');this.analysisMessage.set('');this.analysisSource.set('');this.scanIds.clear();this.addingFood.set(false);this.mealType=mealTypeForHour(new Date().getHours());this.ingredients=[];this.composedName='';this.error.set('');this.editing='';this.name='';this.foodId='';this.grams=100;this.calories=0;this.protein=0;this.carbs=0;this.fat=0;this.notes='';this.photo=undefined;this.pendingPhoto=undefined;this.source='manual';this.mealDate=this.day;this.followMealDate=this.followDay&&this.day===this.today;this.suggestions.set([]);this.recoveredDraft.set(false);this.baseline='';this.baselinePhoto=undefined;}
 ngOnDestroy(){void this.draftSession?.destroy();this.destroyed=true;this.formVersion++;this.photoRequest++;this.ai.cancel();this.cloud?.cancel();this.urls.forEach(url=>URL.revokeObjectURL(url));}
}
