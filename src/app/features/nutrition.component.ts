import { RingComponent } from "../shared/ring.component";
import { IconComponent } from "../shared/icon.component";
import { moveDate, parseLocalDate } from "../services/calendar";
import { ActivatedRoute } from "@angular/router";
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '../services/store';
import { Meal, localDate, now, uid } from '../models/domain';
import { compressPhoto } from '../services/images';
import { LocalAiService } from '../services/local-ai';
import { FOODS, foodSuggestions, portion } from '../services/nutrition';
import { StatusComponent } from '../shared/status.component';
@Component({standalone:true,imports:[FormsModule,StatusComponent,RingComponent,IconComponent],template:`
<div class="page-heading compact-heading"><button class="icon-btn ghost" aria-label="Giorno precedente" (click)="moveDay(-1)"><gt-icon name="back"/></button><div class="nutrition-date-heading"><h1>{{day===today?'Oggi':dayLabel()}}</h1><label><input aria-label="Data alimentazione" type="date" [(ngModel)]="day"/><span>{{dayLabel()}}</span></label></div><button class="icon-btn ghost" aria-label="Giorno successivo" (click)="moveDay(1)">›</button></div><gt-status/>
<input #camera hidden type="file" accept="image/*" capture="environment" (change)="takePhoto($event)"/><input #gallery hidden type="file" accept="image/*" (change)="takePhoto($event)"/>
@if(!showForm()){
<section class="nutrition-dashboard"><gt-ring class="calorie-ring" [value]="totals().calories" [target]="s.settings().goals?.calories" label="Calorie del giorno" color="#008cff"/><p class="subtle">{{s.settings().goals?.calories?'kcal registrate sul tuo obiettivo':'kcal registrate · imposta il tuo obiettivo nel profilo'}}</p><div class="macro-grid"><div><gt-ring [value]="totals().protein" [target]="s.settings().goals?.protein" label="Proteine" unit="g" color="#e44068"/><span>Proteine</span></div><div><gt-ring [value]="totals().carbs" [target]="s.settings().goals?.carbs" label="Carboidrati" unit="g" color="#eac32f"/><span>Carboidrati</span></div><div><gt-ring [value]="totals().fat" [target]="s.settings().goals?.fat" label="Grassi" unit="g" color="#9a48dc"/><span>Grassi</span></div></div></section>
<div class="meal-diary-list">@for(m of meals();track m.id){<article class="card meal-diary-row">@if(m.photo){<img [src]="url(m.photo)" alt="Foto del pasto" loading="lazy"/>}@else{<span class="meal-fallback"><gt-icon name="nutrition"/></span>}<button class="meal-diary-main" (click)="edit(m)"><strong>{{mealTypeLabel(m.mealType)||m.name}}</strong><span>{{m.mealType?m.name+' · ':''}}{{m.calories}} kcal</span></button><button class="meal-check" aria-label="Modifica pasto registrato" (click)="edit(m)">✓</button></article>}@empty{<div class="card empty"><h3>Il tuo diario è pronto</h3><p>Registra un pasto con una foto oppure dai valori dell’etichetta.</p></div>}</div>
<button class="primary full-width scan-meal-button" (click)="camera.click()" [disabled]="photoBusy()"><gt-icon name="camera"/> Scansiona pasto</button><div class="actions nutrition-secondary-actions"><button class="ghost" (click)="gallery.click()">Scegli da Foto</button><button class="ghost" (click)="reset();showForm.set(true)">+ Inserisci manualmente</button></div>
} @else {
<section class="card meal-editor"><div class="card-head"><h2>{{editing?'Modifica pasto':photo?'Controlla e conferma':'Registra un pasto'}}</h2><button class="icon-btn ghost" aria-label="Torna al diario" (click)="reset();showForm.set(false)">×</button></div>
@if(error()){<p class="notice error" role="alert">{{error()}}</p>}
<div class="actions"><button (click)="camera.click()" [disabled]="photoBusy()">Scatta foto</button><button (click)="gallery.click()" [disabled]="photoBusy()">Galleria</button></div>
<p class="subtle" role="status" style="margin-top:12px">{{photoBusy()?'Compressione sul dispositivo…':'Foto compresse sul dispositivo. Nessun invio a server AI.'}}</p>
@if(photo){<img class="meal-preview" [src]="url(photo)" alt="Foto del pasto da controllare"/><div class="actions"><button class="primary" (click)="recognize()" [disabled]="ai.busy()">{{ai.busy()?'Analisi locale in corso…':'Proponi alimento con AI locale'}}</button><button (click)="photo=undefined">Rimuovi foto</button></div>}
@if(suggestions().length){<div class="notice"><b>Possibili alimenti · scegli e correggi</b><div class="actions">@for(food of suggestions();track food.id){<button (click)="choose(food.id,true)">{{food.name}}</button>}</div></div>}
<p class="notice" style="margin-top:16px">La foto non misura quantità, condimenti o ingredienti nascosti. Conferma alimento, grammi e valori: tutte le stime sono modificabili.</p>
<form (ngSubmit)="save()"><div class="form-grid"><label class="wide">Tipo di pasto<select name="meal-type" [(ngModel)]="mealType"><option value="breakfast">Colazione</option><option value="lunch">Pranzo</option><option value="dinner">Cena</option><option value="snack">Spuntino</option></select></label>
<label class="wide">Alimento di riferimento (facoltativo)<select name="food" [(ngModel)]="foodId" (ngModelChange)="choose($event)"><option value="">Inserimento manuale / etichetta</option>@for(food of foods;track food.id){<option [value]="food.id">{{food.name}}</option>}</select></label>
<label class="wide">Nome del pasto<input name="name" [(ngModel)]="name" required maxlength="100" /></label>
<label>Quantità (g)<input name="grams" type="number" inputmode="decimal" [(ngModel)]="grams" required min="1" max="10000" /></label><label>Data del pasto<input name="meal-date" type="date" [(ngModel)]="mealDate" required /></label>
@if(foodId){<button type="button" class="wide" (click)="recalculate()">Ricalcola per questi grammi dal riferimento</button>}
<label>Calorie totali (kcal)<input name="calories" type="number" inputmode="decimal" [(ngModel)]="calories" required min="0" max="20000" step="0.1" /></label>
<label>Proteine totali (g)<input name="protein" type="number" inputmode="decimal" [(ngModel)]="protein" required min="0" max="2000" step="0.1" /></label>
<label>Carboidrati totali (g)<input name="carbs" type="number" inputmode="decimal" [(ngModel)]="carbs" required min="0" max="3000" step="0.1" /></label>
<label>Grassi totali (g)<input name="fat" type="number" inputmode="decimal" [(ngModel)]="fat" required min="0" max="2000" step="0.1" /></label>
<label class="wide">Note, ingredienti e correzioni<textarea name="notes" [(ngModel)]="notes" maxlength="2000"></textarea></label>
</div><p class="subtle" style="margin-top:12px">Valori di riferimento generici per 100 g: la ricetta e la preparazione cambiano i risultati. Quando disponibile usa l’etichetta del tuo prodotto. Tutti i campi riportano il totale della porzione.</p>
<div class="actions"><button class="primary" [disabled]="s.busy()||photoBusy()||!s.ready()">Salva pasto sul dispositivo</button><button type="button" (click)="reset();showForm.set(false)">{{editing?'Annulla modifica':'Svuota modulo'}}</button></div></form>
@if(editing){<button class="ghost danger full-width" (click)="removeCurrent()">Elimina questo pasto</button>}
</section>}
<details class="card ai-details"><summary>AI locale · preparazione e test</summary><p class="subtle" style="margin-top:12px">Modello generico di immagini, non specializzato in piatti complessi. Il primo download gratuito richiede internet (circa 2 MB di pesi); dopo il salvataggio il modello può essere usato offline. Nessuna API AI a pagamento.</p><p class="subtle" style="margin-top:12px">{{ai.status()}}</p>
@if(ai.error()){<p class="notice error" role="alert">{{ai.error()}}</p>}
@if(ai.report();as r){<dl class="device-report"><dt>Motore</dt><dd>{{r.backend}} · {{r.model}}</dd><dt>Ultima prova sul dispositivo</dt><dd>{{r.milliseconds}} ms per inferenza, {{r.loadMs}} ms caricamento</dd><dt>Memoria tensori</dt><dd>{{(r.tensorBytes/1048576).toFixed(1)}} MB (non è la RAM totale)</dd><dt>Modello all’avvio della prova</dt><dd>{{r.cached?'Letto dal dispositivo':'Scaricato e salvato sul dispositivo'}}</dd></dl>}
<div class="actions"><button (click)="prepareAI()" [disabled]="ai.busy()||!ai.supported">Scarica e prova il modello</button>@if(ai.busy()){<button (click)="ai.cancel()">Interrompi</button>}<button (click)="ai.remove()" [disabled]="ai.busy()">Rimuovi solo il modello</button></div>
<p class="subtle" style="margin-top:14px">WebGPU non è richiesta. Su un dispositivo lento, con memoria ridotta o non supportato, puoi registrare tutto manualmente. Nessuna stima viene salvata automaticamente.</p></details>
`})
export class NutritionComponent {
 showForm=signal(false);today=localDate();mealType:NonNullable<Meal['mealType']>='breakfast';
 constructor(){const date=inject(ActivatedRoute).snapshot.queryParamMap.get('date');if(date){try{parseLocalDate(date);this.day=date;this.mealDate=date;}catch{}}}
 dayLabel(){return new Date(this.day+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'});}
 moveDay(direction:number){this.day=moveDate(this.day,direction);}
 mealTypeLabel(type?:Meal['mealType']){return type?({breakfast:'Colazione',lunch:'Pranzo',dinner:'Cena',snack:'Spuntino'})[type]:'';}
 async removeCurrent(){const meal=this.s.data().meals.find(m=>m.id===this.editing);if(meal){await this.remove(meal);if(!this.s.data().meals.some(m=>m.id===meal.id)){this.reset();this.showForm.set(false);}}}
 s=inject(Store);ai=inject(LocalAiService);foods=FOODS;day=localDate();mealDate=localDate();editing='';name='';grams=100;calories=0;protein=0;carbs=0;fat=0;notes='';foodId='';source:Meal['source']='manual';photo?:Blob;
 photoBusy=signal(false);error=signal('');suggestions=signal<typeof FOODS>([]);private urls=new Map<Blob,string>();
 // Date changes through ngModel are read inside these getters, not cached signals.
 meals(){return this.s.data().meals.filter(m=>m.date===this.day).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 totals(){return this.meals().reduce((a,m)=>({calories:a.calories+m.calories,protein:a.protein+m.protein,carbs:a.carbs+m.carbs,fat:a.fat+m.fat}),{calories:0,protein:0,carbs:0,fat:0});}
 url(b:Blob){if(!this.urls.has(b))this.urls.set(b,URL.createObjectURL(b));return this.urls.get(b)!;}
 async takePhoto(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file)return;this.showForm.set(true);this.photoBusy.set(true);this.error.set('');this.suggestions.set([]);try{this.photo=await compressPhoto(file);}catch(e){this.error.set((e as Error).message);}finally{this.photoBusy.set(false);}}
 choose(id:string,fromPhoto=false){this.foodId=id;const f=FOODS.find(f=>f.id===id);if(!f)return;this.name=f.name;this.source=fromPhoto?'photo-suggestion':'manual';this.recalculate();}
 recalculate(){const f=FOODS.find(f=>f.id===this.foodId);if(!f)return;try{Object.assign(this,portion(f,Number(this.grams)));}catch(e){this.error.set((e as Error).message);}}
 async prepareAI(){try{await this.ai.run(undefined,true);}catch(e){this.error.set((e as Error).message);}}
 async recognize(){if(!this.photo)return;this.error.set('');try{const predictions=await this.ai.run(this.photo);this.suggestions.set(foodSuggestions(predictions));if(!this.suggestions().length)this.error.set('Nessuna proposta alimentare utile. Scegli un riferimento o inserisci i valori manualmente.');}catch(e){this.error.set((e as Error).message);}}
 async save(){
  this.error.set('');if(!this.name.trim()||!this.mealDate||!Number.isFinite(this.grams)||this.grams<=0||[this.calories,this.protein,this.carbs,this.fat].some(n=>!Number.isFinite(n)||n<0)){this.error.set('Controlla nome, quantità e valori del pasto.');return;}
  const m:Meal={mealType:this.mealType,id:this.editing||uid(),date:this.mealDate,name:this.name.trim(),grams:this.grams,calories:this.calories,protein:this.protein,carbs:this.carbs,fat:this.fat,notes:this.notes,photo:this.photo,source:this.source,createdAt:this.s.data().meals.find(m=>m.id===this.editing)?.createdAt||now()};
  if(await this.s.change(d=>{const bytes=d.meals.filter(x=>x.id!==m.id).reduce((n,x)=>n+(x.photo?.size||0),0)+(m.photo?.size||0);if(bytes>15*1024*1024)throw Error('Archivio foto oltre 15 MB. Rimuovi alcune foto o salva senza immagine.');const i=d.meals.findIndex(x=>x.id===m.id);if(i<0)d.meals.push(m);else d.meals[i]=m;},'Pasto salvato sul dispositivo.',false)){this.day=m.date;this.reset();this.showForm.set(false);}
 }
 edit(m:Meal){this.showForm.set(true);this.mealType=m.mealType||'breakfast';this.editing=m.id;this.mealDate=m.date;this.name=m.name;this.grams=m.grams;this.calories=m.calories;this.protein=m.protein;this.carbs=m.carbs;this.fat=m.fat;this.notes=m.notes;this.photo=m.photo;this.source=m.source;this.foodId='';window.scrollTo({top:0,behavior:'smooth'});}
 async remove(m:Meal){if(confirm('Eliminare questo pasto e la sua foto?'))await this.s.change(d=>{d.meals=d.meals.filter(x=>x.id!==m.id);},'Pasto eliminato.',false);}
 reset(){this.editing='';this.name='';this.foodId='';this.grams=100;this.calories=0;this.protein=0;this.carbs=0;this.fat=0;this.notes='';this.photo=undefined;this.source='manual';this.mealDate=this.day;this.suggestions.set([]);}
 ngOnDestroy(){this.ai.cancel();this.urls.forEach(url=>URL.revokeObjectURL(url));}
}
