import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '../services/store';
import { Meal, localDate, now, uid } from '../models/domain';
import { compressPhoto } from '../services/images';
import { LocalAiService } from '../services/local-ai';
import { FOODS, foodSuggestions, portion } from '../services/nutrition';
import { StatusComponent } from '../shared/status.component';
@Component({standalone:true,imports:[FormsModule,StatusComponent],template:`
<div class="page-heading"><div><p class="eyebrow">IL TUO DIARIO LOCALE</p><h1>Alimentazione</h1><p class="subtle">Pasti, foto e valori che puoi sempre correggere.</p></div></div><gt-status />
<section class="card"><div class="card-head"><h2>Il tuo giorno</h2><label>Data<input type="date" [(ngModel)]="day" /></label></div>
<div class="nutrition-totals"><div><strong>{{totals().calories.toFixed(0)}}</strong><small>kcal registrate</small></div><div><strong>{{totals().protein.toFixed(1)}} g</strong><small>Proteine</small></div><div><strong>{{totals().carbs.toFixed(1)}} g</strong><small>Carboidrati</small></div><div><strong>{{totals().fat.toFixed(1)}} g</strong><small>Grassi</small></div></div></section>
<div class="split" style="margin-top:20px"><section class="card"><h2>{{editing?'Modifica pasto':'Registra un pasto'}}</h2>
@if(error()){<p class="notice error" role="alert">{{error()}}</p>}
<div class="actions"><button type="button" (click)="camera.click()" [disabled]="photoBusy()">Scatta foto</button><button type="button" (click)="gallery.click()" [disabled]="photoBusy()">Scegli da Foto</button><input #camera hidden type="file" accept="image/*" capture="environment" (change)="takePhoto($event)"/><input #gallery hidden type="file" accept="image/*" (change)="takePhoto($event)" /></div>
<p class="subtle" role="status" style="margin-top:10px">{{photoBusy()?'Compressione sul dispositivo…':'La foto viene ridotta a massimo 1280 px e 500 KB prima del salvataggio. Non viene inviata a un server.'}}</p>
@if(photo){<img class="meal-preview" [src]="url(photo)" alt="Foto del pasto da controllare"/><div class="actions"><button type="button" (click)="recognize()" [disabled]="ai.busy()">Proponi alimento con AI locale</button><button type="button" (click)="photo=undefined">Rimuovi foto</button></div>}
@if(suggestions().length){<div class="notice"><b>Possibili alimenti · scegli e correggi</b><div class="actions">@for(food of suggestions();track food.id){<button type="button" (click)="choose(food.id,true)">{{food.name}}</button>}</div></div>}
<p class="notice" style="margin-top:16px">Una singola foto non misura il peso, i condimenti o gli ingredienti nascosti. Le proposte AI non sono una misura delle calorie: conferma alimento, grammi e valori prima di salvare.</p>
<form (ngSubmit)="save()"><div class="form-grid">
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
<div class="actions"><button class="primary" [disabled]="s.busy()||photoBusy()||!s.ready()">Salva pasto sul dispositivo</button><button type="button" (click)="reset()">{{editing?'Annulla modifica':'Svuota modulo'}}</button></div></form></section>
<div class="stack"><section class="card"><h2>AI locale facoltativa</h2><p class="subtle" style="margin-top:12px">Modello generico di immagini, non specializzato in piatti complessi. Il primo download gratuito richiede internet (circa 2 MB di pesi); dopo il salvataggio il modello può essere usato offline. Nessuna API AI a pagamento.</p><p class="subtle" style="margin-top:12px">{{ai.status()}}</p>
@if(ai.error()){<p class="notice error" role="alert">{{ai.error()}}</p>}
@if(ai.report();as r){<dl class="device-report"><dt>Motore</dt><dd>{{r.backend}} · {{r.model}}</dd><dt>Ultima prova sul dispositivo</dt><dd>{{r.milliseconds}} ms per inferenza, {{r.loadMs}} ms caricamento</dd><dt>Memoria tensori</dt><dd>{{(r.tensorBytes/1048576).toFixed(1)}} MB (non è la RAM totale)</dd><dt>Modello all’avvio della prova</dt><dd>{{r.cached?'Letto dal dispositivo':'Scaricato e salvato sul dispositivo'}}</dd></dl>}
<div class="actions"><button (click)="prepareAI()" [disabled]="ai.busy()||!ai.supported">Scarica e prova il modello</button>@if(ai.busy()){<button (click)="ai.cancel()">Interrompi</button>}<button (click)="ai.remove()" [disabled]="ai.busy()">Rimuovi solo il modello</button></div>
<p class="subtle" style="margin-top:14px">WebGPU non è richiesta. Su un dispositivo lento, con memoria ridotta o non supportato, puoi registrare tutto manualmente. Nessuna stima viene salvata automaticamente.</p></section>
<section class="card"><h2>Pasti registrati</h2><div class="list" style="margin-top:18px">@for(m of meals();track m.id){<article class="meal-row">@if(m.photo){<img [src]="url(m.photo)" alt="Foto del pasto registrato" loading="lazy"/>}<div><h3>{{m.name}}</h3><p class="subtle">{{m.grams}} g · {{m.calories}} kcal</p><p class="subtle">P {{m.protein}} · C {{m.carbs}} · G {{m.fat}} g</p><div class="actions"><button (click)="edit(m)">Modifica</button><button class="danger ghost" (click)="remove(m)">Elimina</button></div></div></article>}@empty{<p class="subtle">Nessun pasto per questa data. Puoi iniziare anche senza foto.</p>}</div></section></div></div>
`})
export class NutritionComponent {
 s=inject(Store);ai=inject(LocalAiService);foods=FOODS;day=localDate();mealDate=localDate();editing='';name='';grams=100;calories=0;protein=0;carbs=0;fat=0;notes='';foodId='';source:Meal['source']='manual';photo?:Blob;
 photoBusy=signal(false);error=signal('');suggestions=signal<typeof FOODS>([]);private urls=new Map<Blob,string>();
 // Date changes through ngModel are read inside these getters, not cached signals.
 meals(){return this.s.data().meals.filter(m=>m.date===this.day).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 totals(){return this.meals().reduce((a,m)=>({calories:a.calories+m.calories,protein:a.protein+m.protein,carbs:a.carbs+m.carbs,fat:a.fat+m.fat}),{calories:0,protein:0,carbs:0,fat:0});}
 url(b:Blob){if(!this.urls.has(b))this.urls.set(b,URL.createObjectURL(b));return this.urls.get(b)!;}
 async takePhoto(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file)return;this.photoBusy.set(true);this.error.set('');this.suggestions.set([]);try{this.photo=await compressPhoto(file);}catch(e){this.error.set((e as Error).message);}finally{this.photoBusy.set(false);}}
 choose(id:string,fromPhoto=false){this.foodId=id;const f=FOODS.find(f=>f.id===id);if(!f)return;this.name=f.name;this.source=fromPhoto?'photo-suggestion':'manual';this.recalculate();}
 recalculate(){const f=FOODS.find(f=>f.id===this.foodId);if(!f)return;try{Object.assign(this,portion(f,Number(this.grams)));}catch(e){this.error.set((e as Error).message);}}
 async prepareAI(){try{await this.ai.run(undefined,true);}catch(e){this.error.set((e as Error).message);}}
 async recognize(){if(!this.photo)return;this.error.set('');try{const predictions=await this.ai.run(this.photo);this.suggestions.set(foodSuggestions(predictions));if(!this.suggestions().length)this.error.set('Nessuna proposta alimentare utile. Scegli un riferimento o inserisci i valori manualmente.');}catch(e){this.error.set((e as Error).message);}}
 async save(){
  this.error.set('');if(!this.name.trim()||!this.mealDate||!Number.isFinite(this.grams)||this.grams<=0||[this.calories,this.protein,this.carbs,this.fat].some(n=>!Number.isFinite(n)||n<0)){this.error.set('Controlla nome, quantità e valori del pasto.');return;}
  const m:Meal={id:this.editing||uid(),date:this.mealDate,name:this.name.trim(),grams:this.grams,calories:this.calories,protein:this.protein,carbs:this.carbs,fat:this.fat,notes:this.notes,photo:this.photo,source:this.source,createdAt:this.s.data().meals.find(m=>m.id===this.editing)?.createdAt||now()};
  if(await this.s.change(d=>{const bytes=d.meals.filter(x=>x.id!==m.id).reduce((n,x)=>n+(x.photo?.size||0),0)+(m.photo?.size||0);if(bytes>15*1024*1024)throw Error('Archivio foto oltre 15 MB. Rimuovi alcune foto o salva senza immagine.');const i=d.meals.findIndex(x=>x.id===m.id);if(i<0)d.meals.push(m);else d.meals[i]=m;},'Pasto salvato sul dispositivo.',false)){this.day=m.date;this.reset();}
 }
 edit(m:Meal){this.editing=m.id;this.mealDate=m.date;this.name=m.name;this.grams=m.grams;this.calories=m.calories;this.protein=m.protein;this.carbs=m.carbs;this.fat=m.fat;this.notes=m.notes;this.photo=m.photo;this.source=m.source;this.foodId='';window.scrollTo({top:0,behavior:'smooth'});}
 async remove(m:Meal){if(confirm('Eliminare questo pasto e la sua foto?'))await this.s.change(d=>{d.meals=d.meals.filter(x=>x.id!==m.id);},'Pasto eliminato.',false);}
 reset(){this.editing='';this.name='';this.foodId='';this.grams=100;this.calories=0;this.protein=0;this.carbs=0;this.fat=0;this.notes='';this.photo=undefined;this.source='manual';this.mealDate=this.day;this.suggestions.set([]);}
 ngOnDestroy(){this.ai.cancel();this.urls.forEach(url=>URL.revokeObjectURL(url));}
}
