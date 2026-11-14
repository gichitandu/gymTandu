import { CoachVisibleTextPipe } from '../shared/coach-visible-text.pipe';
import { coachVisibleText, replaceCoachVisibleText } from '../services/coach-expert-adapter';
import { ProfileLinkComponent } from '../shared/profile-link.component';
import { NgTemplateOutlet } from '@angular/common';
import { DESIGN_DIRECTIVES } from '../design/design-directives';
import {ExerciseReplacementComponent} from '../shared/exercise-replacement.component';
import { DateFieldComponent } from '../shared/date-field.component';
import { confirmationForContext } from '../services/confirmation';
import {ExerciseScope,ExerciseScopeComponent} from "../shared/exercise-scope.component";
import { ExerciseThumbComponent } from "../shared/exercise-thumb.component";
import { matchesExercise } from "../services/exercise-search";
import { A11yModule } from "@angular/cdk/a11y";
import { Component, computed, inject, signal } from "@angular/core";
import {
  FormBuilder,
  ReactiveFormsModule,
  FormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Store } from "../services/store";
import { planOverlaps } from "../services/plan-overlap";
import {
  TrainingPlan,
  TrainingPlanDay,
  TrainingPlanExercise,
  now,
  uid,
  localDate,
} from "../models/domain";
import { TodayService } from '../services/today';
import { parseLocalDate } from '../services/calendar';
import { IconComponent } from "../shared/icon.component";
import { StatusComponent } from "../shared/status.component";
import { DraftSession, FormDraftService } from "../services/form-drafts";
type PlanEditorDraft = {
  kind: string; editId: string; saveId: string; parentId: string; baseline: string;
  expanded: string; archived: boolean; search: string; scope: ExerciseScope; unit?:'kg'|'lb';
  plan: ReturnType<PlansComponent['planForm']['getRawValue']>;
  day: ReturnType<PlansComponent['dayForm']['getRawValue']>;
  exercise: ReturnType<PlansComponent['exerciseForm']['getRawValue']>;
};
@Component({
  standalone: true,
  styleUrls: ["./feature-polish.css", "./plans-simple.css", "./plans-reference.css", "./plans-redesign.css", "./plans-editor.css"],
  imports: [CoachVisibleTextPipe,ProfileLinkComponent,NgTemplateOutlet,ExerciseReplacementComponent,...DESIGN_DIRECTIVES,DateFieldComponent,
    A11yModule,ExerciseScopeComponent,
    ExerciseThumbComponent,
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    IconComponent,
    StatusComponent,
  ],
  template: `<div class="compact-plans">
    <p class="el-only el-eyebrow el-over">{{plans().length}} {{plans().length===1?'scheda':'schede'}}</p>
    <header class="su-head"><h1 gtDesign="training.title" gtDesignLabel="training.title" gtDesignLabelDefault="Schede">Schede</h1><div class="su-actions"><button type="button" class="su-iconbtn" gtDesign="training.newPlan" (click)="newPlanStep.set('choose')" [disabled]="!s.ready()" aria-label="Nuova scheda"><gt-icon name="plus"/></button><gt-profile-link/></div></header>
    <nav class="su-seg" aria-label="Schede ed esercizi"><a class="on" aria-current="page" routerLink="/piani">Le mie schede</a><a routerLink="/catalogo">Esercizi</a><a routerLink="/coach">Il tuo coach</a></nav>
    <gt-status />
    @if(draftNotice()){<p class="notice" role="status">{{draftNotice()}}</p>}
    <a class="button ghost group-entry" routerLink="/gruppo"><gt-icon name="users"/>Allenamento in gruppo</a>
    <div class="pl-body">
    @if(!archived()&&overlaps().length){<section class="card plan-overlap" role="status" aria-label="Piani con date sovrapposte">
     <h3>Piani sovrapposti</h3>
     @for(o of overlaps();track o.keep.plan.id+o.drop.plan.id){<div class="plan-overlap-row">
      <p>“{{o.keep.plan.name}}” ({{o.keep.workouts}} sedute, {{o.keep.sets}} serie) e “{{o.drop.plan.name}}” ({{o.drop.workouts}} sedute, {{o.drop.sets}} serie) occupano le stesse date.</p>
      <button type="button" class="button" [disabled]="s.busy()" (click)="resolveOverlap(o.keep.plan.id,o.drop.plan.id)">Tieni “{{o.keep.plan.name}}” e concludi l’altro</button>
     </div>}
     <small>Il piano concluso va in archivio: sedute, serie e statistiche restano consultabili.</small>
    </section>}
    @if(!archived()){
      @for(p of activePlans();track p.id){<ng-container *ngTemplateOutlet="planCard;context:{$implicit:p}"/>}
      <div class="plans-list-heading pl-others"><h2>{{activePlans().length?'Altre schede':'Le tue schede'}}</h2>@if(archivedCount()){<button type="button" class="su-chip" (click)="archived.set(true)">Archiviate · {{archivedCount()}}</button>}</div>
      <div class="list simple-plan-list" gtDesign="training.plans">@for(p of otherPlans();track p.id){<ng-container *ngTemplateOutlet="planCard;context:{$implicit:p}"/>}@empty{@if(!activePlans().length){<div class="card empty"><h2>Nessuna scheda</h2><p class="subtle">Crea la tua prima scheda o importala da Excel.</p><button type="button" class="primary" (click)="newPlanStep.set('choose')">Nuova scheda</button></div>}}</div>
      <button type="button" class="su-btn ghost sm pl-new" (click)="newPlanStep.set('choose')" [disabled]="!s.ready()"><gt-icon name="plus"/>Nuova scheda</button>
    }@else{
      <div class="plans-list-heading"><h2>Schede archiviate</h2><button type="button" class="su-chip on" (click)="archived.set(false)">Torna alle schede</button></div>
      <div class="list simple-plan-list">@for(p of plans();track p.id){<ng-container *ngTemplateOutlet="planCard;context:{$implicit:p}"/>}@empty{<div class="card empty"><h2>Nessuna scheda archiviata</h2></div>}</div>
    }
    <ng-template #planCard let-p>
        <section class="card simple-plan" [class.pl-active]="p.active&&!p.completedAt&&!p.archived" [class.pl-editing]="editing()===p.id">
          <div class="simple-plan-top"><gt-exercise-thumb class="plan-cover-thumb" [exercise]="thumbnailExercise(p.id)"/>
            <button type="button" class="simple-plan-title" [attr.aria-expanded]="expanded()===p.id" (click)="expanded.set(expanded()===p.id?'':p.id)"><span><strong>{{p.name}}</strong><small>{{p.program?p.program.weeks+' settimane · ':''}}{{s.days(p.id).length}} {{s.days(p.id).length===1?'allenamento':'allenamenti'}}</small></span><span class="plan-chevron" aria-hidden="true">{{expanded()===p.id?'⌃':'›'}}</span></button>
            @if(p.completedAt){<span class="su-badge muted">Conclusa</span>}@else if(p.active){<span class="su-badge green"><gt-icon name="check"/>Attiva</span>}
          </div>
          @if(p.active&&!p.completedAt&&!p.archived&&s.days(p.id).length){<div class="pl-progress"><div class="pl-progress-row">@if(p.program){<span><b>Settimana {{currentWeek(p)}}</b> di {{p.program.weeks}}</span>}@else{<span><b>{{completedForPlan(p.id)}}</b> allenamenti fatti</span>}<small>{{completedForPlan(p.id)}} di {{s.days(p.id).length}}</small></div><div class="su-bar"><i [style.width.%]="planProgress(p)"></i></div></div>}
          @if(expanded()===p.id){
            @if(p.description){@if(p.program){<details class="program-description"><summary>Note del programma</summary><p class="simple-plan-description">{{p.description | coachText}}</p></details>}@else{<p class="simple-plan-description">{{p.description | coachText}}</p>}}
            @if(p.program){<div class="program-week-picker"><label>Settimana<select [ngModel]="weekFor(p)" (ngModelChange)="selectWeek(p.id,$event)">@for(week of weeksFor(p);track week){<option [ngValue]="week">Settimana {{week}} / {{p.program.weeks}}</option>}</select></label></div>}
            <div class="simple-days">
              @for(day of visibleDays(p);track day.id){
                <details class="simple-day" [class.pl-today]="dayDate(day)===today" [open]="editing()===p.id&&openDayId()===day.id">
                  <summary class="simple-day-summary"><gt-exercise-thumb class="el-only pl-day-thumb" [exercise]="dayThumbnail(day.id)"/><span><strong>{{day.name}}</strong><small>{{day.sessionDate?dateLabel(dayDate(day))+' · ':day.weekday===undefined?'':weekdays[day.weekday]+' · '}}{{dayMeta(day)}}</small></span>@if(completedDayWorkout(day)){<span class="pl-done" aria-label="Fatto"><gt-icon name="check"/></span>}@else if(dayDate(day)===today){<span class="su-badge pink">Oggi</span>}@else{<span class="day-chevron" aria-hidden="true">›</span>}</summary>
                  <div class="simple-day-body">@if(day.phase||day.notes){<div class="day-guidance">@if(day.phase){<span class="pill">{{day.phase}}</span>}@if(day.notes){<details><summary>Indicazioni della seduta</summary><p>{{day.notes}}</p></details>}</div>}
                    @if(editing()===p.id&&!p.archived&&!p.completedAt){<div class="pl-tools" role="group" [attr.aria-label]="'Modifica '+day.name"><button type="button" class="su-iconbtn" (click)="openDay(p.id,day)" aria-label="Modifica allenamento"><gt-icon name="edit"/></button><button type="button" class="su-iconbtn" (click)="s.duplicateDay(day.id)" aria-label="Duplica allenamento"><gt-icon name="copy"/></button><button type="button" class="su-iconbtn" (click)="moveDay(day,-1)" [disabled]="day.order===0" aria-label="Sposta prima"><gt-icon name="back" class="pl-up"/></button><button type="button" class="su-iconbtn" (click)="moveDay(day,1)" [disabled]="day.order===s.days(p.id).length-1" aria-label="Sposta dopo"><gt-icon name="back" class="pl-down"/></button><button type="button" class="su-iconbtn pl-remove" (click)="removeDay(day)" aria-label="Elimina allenamento"><gt-icon name="trash"/></button></div>}
                  <div class="simple-exercises"><div>
                    @for(pe of s.planExercises(day.id);track pe.id){<div class="simple-exercise-row"><gt-exercise-thumb [exercise]="s.exercise(pe.exerciseId)"/><div><strong>{{s.exercise(pe.exerciseId)?.name}}</strong><small>{{pe.sets}} × {{pe.repsMin===pe.repsMax?pe.repsMin:pe.repsMin+'–'+pe.repsMax}} rip · rec. {{restLabel(pe.rest)}}</small>@if(pe.targetWeight!==undefined){<small>{{s.formatWeight(pe.targetWeight)}} {{s.settings().unit}}</small>}@if(pe.superset){<small>Superset {{pe.superset}}</small>}@if(pe.warmupSets){<small>{{pe.warmupSets}} serie di riscaldamento</small>}@if(pe.rirMin!==undefined){<small>RIR {{pe.rirMin}}{{pe.rirMax!==undefined&&pe.rirMax!==pe.rirMin?'–'+pe.rirMax:''}}</small>}@if(pe.rpe){<small>RPE {{pe.rpe}}</small>}@if(pe.warmupNotes||pe.reference||pe.notes){<details class="exercise-guidance"><summary>Riscaldamento e note</summary>@if(pe.warmupNotes){<small><b>Riscaldamento:</b> {{pe.warmupNotes}}</small>}@if(pe.reference | coachText){<small><b>Riferimento:</b> {{pe.reference | coachText}}{{pe.loadUnit?' · '+pe.loadUnit:''}}</small>}@if(pe.notes){<small>{{pe.notes}}</small>}</details>}</div>
                      @if(editing()===p.id&&!p.archived&&!p.completedAt){<div class="pl-tools small" role="group" [attr.aria-label]="'Modifica '+s.exercise(pe.exerciseId)?.name"><button type="button" class="su-iconbtn" (click)="openExercise(day.id,pe)" aria-label="Modifica esercizio"><gt-icon name="edit"/></button><button type="button" class="su-iconbtn" (click)="replacementTarget.set(pe.id)" aria-label="Sostituisci esercizio"><gt-icon name="repeat"/></button><button type="button" class="su-iconbtn" (click)="moveExercise(pe,-1)" [disabled]="pe.order===0" aria-label="Sposta prima"><gt-icon name="back" class="pl-up"/></button><button type="button" class="su-iconbtn" (click)="moveExercise(pe,1)" [disabled]="pe.order===s.planExercises(day.id).length-1" aria-label="Sposta dopo"><gt-icon name="back" class="pl-down"/></button><button type="button" class="su-iconbtn pl-remove" (click)="removeExercise(pe)" aria-label="Rimuovi esercizio"><gt-icon name="minus"/></button></div>}
                    </div>}@empty{<p class="subtle pl-empty-day">{{editing()===p.id?'Ancora nessun esercizio: aggiungi il primo.':'Nessun esercizio.'}}</p>}
                    @if(editing()===p.id&&!p.archived&&!p.completedAt){<button type="button" class="su-btn ghost sm pl-add" (click)="openExercise(day.id)"><gt-icon name="plus"/>Aggiungi esercizio</button>}
                  </div></div>
                  @if(editing()!==p.id){<div class="simple-day-start">@if(completedDayWorkout(day);as workout){<a class="button ghost full-width" [routerLink]="['/riepilogo',workout.id]" [queryParams]="{from:'elenco'}">Vedi allenamento fatto</a>}@else if(s.planExercises(day.id).length){<a class="su-btn su-primary sm" routerLink="/anteprima-allenamento" [queryParams]="{day:day.id,return:'piani'}"><gt-icon name="play"/>Apri allenamento</a>}</div>}
                  @if(editing()!==p.id&&!p.archived&&!p.completedAt){<details class="past-workout-entry"><summary>Registra per un’altra data</summary><div class="form-grid"><label>Data<gt-date-field [max]="today" [ngModel]="pastDates[day.id]||''" (ngModelChange)="pastDates[day.id]=$event" [aria-label]="'Data allenamento passato · '+day.name"></gt-date-field></label><button type="button" class="primary" (click)="startPast(day.id)" [disabled]="!pastDates[day.id]||!s.planExercises(day.id).length||s.busy()||startingPast()">{{startingPast()?'Apertura…':'Registra'}}</button></div>@if(s.draft()){<p class="subtle"><a routerLink="/sessione">Riprendi la sessione aperta</a> prima di registrarne un’altra.</p>}</details>}
                  </div>
                </details>
              }@empty{@if(!p.archived&&!p.completedAt&&!p.program){<div class="pl-start"><span class="su-bubble pink"><gt-icon name="plans"/></span><strong>Aggiungi il primo allenamento</strong><p>Una scheda è fatta di allenamenti (Push, Gambe, Giorno A…): creane uno e scegli gli esercizi dal catalogo.</p><button type="button" class="su-btn su-primary sm" (click)="startBuilding(p.id)" [disabled]="s.busy()"><gt-icon name="plus"/>Nuovo allenamento</button></div>}@else{<p class="subtle plan-empty">Nessun allenamento nella scheda.</p>}}
            </div>
            @if(editing()===p.id&&!p.archived&&!p.program&&s.days(p.id).length){<button type="button" class="su-btn ghost sm pl-add" (click)="openDay(p.id)" [disabled]="s.busy()"><gt-icon name="plus"/>Aggiungi allenamento</button>}
            @if(editing()===p.id&&planBalance(p);as balance){@if(balance.length){<section class="pl-balance" aria-label="Serie allenanti per gruppo muscolare"><h3>Serie per gruppo muscolare <small>{{p.program?'nella settimana mostrata':'in un giro completo della scheda'}}</small></h3><div class="pl-balance-list">@for(row of balance;track row.name){<span><b>{{row.sets}}</b>{{row.name}}</span>}</div></section>}}
            @if(editing()===p.id){<details class="pl-manage" [open]="p.archived||!!p.completedAt"><summary><span class="su-bubble violet"><gt-icon name="settings"/></span><span class="su-tx"><strong>Gestisci scheda</strong><small>Rinomina · duplica · archivia · elimina</small></span><gt-icon class="pl-manage-chev" name="chevron-down"/></summary><div class="su-list pl-more">
              @if(!p.archived&&!p.completedAt){@if(!p.active){<button type="button" class="su-row" (click)="activate(p.id)"><span class="su-bubble green"><gt-icon name="check"/></span><span class="su-tx"><strong>Rendi attiva</strong></span></button>}<button type="button" class="su-row" (click)="openPlan(p)"><span class="su-bubble pink"><gt-icon name="edit"/></span><span class="su-tx"><strong>Nome e descrizione</strong></span></button>}
              @if(!p.program){<button type="button" class="su-row" (click)="s.duplicatePlan(p.id)"><span class="su-bubble violet"><gt-icon name="copy"/></span><span class="su-tx"><strong>Duplica scheda</strong></span></button>}
              @if(!p.completedAt){<button type="button" class="su-row" (click)="archive(p)"><span class="su-bubble blue"><gt-icon name="download"/></span><span class="su-tx"><strong>{{p.archived?'Ripristina':'Archivia'}}</strong></span></button><button type="button" class="su-row" (click)="showDashboard(p.id,true)"><span class="su-bubble amber"><gt-icon name="clock"/></span><span class="su-tx"><strong>Termina scheda</strong><small>Le sedute future possono essere tolte dal calendario</small></span></button>}
              <button type="button" class="su-row danger" (click)="removePlan(p)" [disabled]="s.busy()||!!deletingPlan()"><span class="su-bubble red"><gt-icon name="trash"/></span><span class="su-tx"><strong>Elimina scheda</strong></span></button>
            </div></details>}
          }
          <div class="su-btns pl-actions" [class.pl-actions-editing]="editing()===p.id&&!p.archived&&!p.completedAt">@if(!p.archived&&!p.completedAt){<button type="button" class="su-btn sm" [class.su-primary]="editing()===p.id" (click)="toggleEditing(p.id)"><gt-icon [name]="editing()===p.id?'check':'edit'"/>{{editing()===p.id?'Fine':'Modifica'}}</button>}@else{<button type="button" class="su-btn sm" (click)="toggleEditing(p.id)"><gt-icon name="more"/>{{editing()===p.id?'Chiudi':'Gestisci'}}</button>}<a class="su-btn sm" [routerLink]="['/piano',p.id]"><gt-icon name="chart"/>Andamento</a></div>
        </section>
    </ng-template>
    </div></div>
    @if(replacementTarget()){<gt-exercise-replacement [planExerciseId]="replacementTarget()" (closed)="replacementTarget.set('')"/>}
    @if(newPlanStep()){<div class="su-sheet-backdrop" (click)="newPlanStep.set('')"></div><section class="su-sheet" role="dialog" aria-modal="true" aria-labelledby="new-plan-title"><div class="su-grab"></div>
      <header class="su-sheet-head"><div><h2 id="new-plan-title">{{newPlanStep()==='copy'?'Copia una scheda':'Nuova scheda'}}</h2><p>{{newPlanStep()==='copy'?'Scegli la scheda da cui partire':'Come vuoi iniziare?'}}</p></div><button type="button" class="su-iconbtn" (click)="newPlanStep.set('')" aria-label="Chiudi"><gt-icon name="close"/></button></header>
      @if(newPlanStep()==='choose'){
        <button type="button" class="su-option main" (click)="newPlanStep.set('');openPlan()"><span class="su-bubble pink"><gt-icon name="edit"/></span><span class="su-tx"><strong>Crea da zero</strong><small>Dai un nome, aggiungi gli allenamenti e gli esercizi dal catalogo.</small></span><gt-icon name="chevron-right"/></button>
        <a class="su-option" routerLink="/importa-excel" (click)="newPlanStep.set('')"><span class="su-bubble green"><gt-icon name="download"/></span><span class="su-tx"><strong>Importa da Excel</strong><small>Il modello GymTrack o la scheda del tuo allenatore. Controlli tutto prima di salvare.</small></span><gt-icon name="chevron-right"/></a>
        <button type="button" class="su-option" (click)="newPlanStep.set('copy')" [disabled]="!copyablePlans().length"><span class="su-bubble violet"><gt-icon name="copy"/></span><span class="su-tx"><strong>Copia una scheda</strong><small>{{copyablePlans().length?'Parti da una scheda che hai già e cambia solo quello che serve.':'Nessuna scheda da copiare per ora.'}}</small></span><gt-icon name="chevron-right"/></button>
      }@else{
        <div class="su-list" style="margin-top:12px">@for(plan of copyablePlans();track plan.id){<button type="button" class="su-row" (click)="copyPlan(plan.id)" [disabled]="s.busy()"><span class="su-bubble violet"><gt-icon name="layers"/></span><span class="su-tx"><strong>{{plan.name}}</strong><small>{{s.days(plan.id).length}} {{s.days(plan.id).length===1?'allenamento':'allenamenti'}}</small></span><gt-icon class="su-chev" name="chevron-right"/></button>}</div>
        <button type="button" class="su-btn sm" style="margin-top:12px" (click)="newPlanStep.set('choose')"><gt-icon name="back"/>Indietro</button>
      }
    </section>}
    @if (modal()) {
      <div class="su-sheet-backdrop" (click)="closeModal()"></div>
      <section class="su-sheet pe-sheet" [class.pe-tall]="modal()==='exercise'" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (keydown.escape)="closeModal()" role="dialog" aria-modal="true" aria-labelledby="plan-modal">
        <div class="su-grab"></div>
        <header class="su-sheet-head">
          <div><h2 id="plan-modal">{{sheetTitle()}}</h2>@if(sheetHint();as hint){<p>{{hint}}</p>}</div>
          <button type="button" class="su-iconbtn" (click)="closeModal()" [disabled]="saving()" aria-label="Chiudi"><gt-icon name="close"/></button>
        </header>
        @if (modal() === "plan") {
          <form class="pe-form" [formGroup]="planForm" (ngSubmit)="savePlan()">
            <label class="su-label" for="pe-plan-name">Nome della scheda</label>
            <input id="pe-plan-name" class="su-field" formControlName="name" maxlength="100" placeholder="Es. Upper / Lower" autocomplete="off" cdkFocusInitial />
            @if(!editId){
              <span class="su-label" id="pe-template-label">Da dove parti</span>
              <div class="pe-templates" role="group" aria-labelledby="pe-template-label">
                @for(t of planTemplates;track t.id){<button type="button" class="pe-template" [class.on]="planTemplate()===t.id" [attr.aria-pressed]="planTemplate()===t.id" (click)="planTemplate.set(t.id)" [disabled]="saving()"><strong>{{t.label}}</strong><small>{{t.hint}}</small></button>}
              </div>
              @if(templateDays().length){<p class="pe-hint">Creo gli allenamenti <b>{{templateDays().join(' · ')}}</b>. Poi aggiungi gli esercizi e rinomini quello che vuoi.</p>}@else{<p class="pe-hint">Parti da una scheda vuota e aggiungi tu gli allenamenti.</p>}
            }
            <label class="su-label" for="pe-plan-notes">Descrizione <small>facoltativa</small></label>
            <textarea id="pe-plan-notes" class="su-field" formControlName="description" maxlength="1000" placeholder="Obiettivo, durata, note…"></textarea>
            <div class="pe-actions"><button class="su-btn su-primary" [disabled]="planForm.invalid || saving() || s.busy()">{{saving()?'Salvataggio…':editId?'Salva scheda':'Crea scheda'}}</button></div>
          </form>
        }
        @if (modal() === "day") {
          <form class="pe-form" [formGroup]="dayForm" (ngSubmit)="saveDay()">
            <label class="su-label" for="pe-day-name">Nome dell’allenamento</label>
            <input id="pe-day-name" class="su-field" formControlName="name" maxlength="80" placeholder="Es. Giorno A · Push" autocomplete="off" cdkFocusInitial />
            @if(dayIdeas().length){<div class="su-chips pe-ideas" role="group" aria-label="Nomi rapidi">@for(idea of dayIdeas();track idea){<button type="button" class="su-chip" (click)="dayForm.controls.name.setValue(idea)" [disabled]="saving()">{{idea}}</button>}</div>}
            <span class="su-label" id="pe-weekday-label">Giorno della settimana <small>facoltativo</small></span>
            <div class="pe-weekdays" role="group" aria-labelledby="pe-weekday-label">
              <button type="button" class="su-chip" [class.on]="dayForm.controls.weekday.value===''" [attr.aria-pressed]="dayForm.controls.weekday.value===''" (click)="dayForm.controls.weekday.setValue('')" [disabled]="saving()">Libero</button>
              @for (w of weekdays; track w; let i = $index) {<button type="button" class="su-chip" [class.on]="dayForm.controls.weekday.value===''+i" [attr.aria-pressed]="dayForm.controls.weekday.value===''+i" [attr.aria-label]="w" (click)="dayForm.controls.weekday.setValue(''+i)" [disabled]="saving()">{{w.slice(0,3)}}</button>}
            </div>
            <p class="pe-hint">{{dayForm.controls.weekday.value===''?'Senza giorno fisso gli allenamenti si alternano nell’ordine della scheda.':'Lo trovi proposto in Oggi ogni '+weekdays[+dayForm.controls.weekday.value].toLowerCase()+'.'}}</p>
            <div class="pe-actions"><button class="su-btn su-primary" [disabled]="dayForm.invalid || saving() || s.busy()">{{saving()?'Salvataggio…':'Salva allenamento'}}</button></div>
          </form>
        }
        @if (modal() === "exercise") {
          <form class="pe-form" [formGroup]="exerciseForm" (ngSubmit)="saveExercise()">
            @if(exerciseStep()==='pick'){
              <div class="pe-search"><gt-icon name="search"/><input type="search" aria-label="Cerca esercizio per nome" [ngModel]="exerciseSearch()" (ngModelChange)="exerciseSearch.set($event)" [ngModelOptions]="{ standalone: true }" placeholder="Cerca: panca, squat, curl…" enterkeyhint="search" autocomplete="off" /></div>
              <gt-exercise-scope class="pe-scope" [value]="scope()" (choose)="scope.set($event)"/>
              <div class="su-chips scroll pe-groups" role="group" aria-label="Gruppo muscolare"><button type="button" class="su-chip" [class.on]="!groupFilter()" [attr.aria-pressed]="!groupFilter()" (click)="groupFilter.set('')">Tutti i gruppi</button>@for(g of pickerGroups();track g.id){<button type="button" class="su-chip" [class.on]="groupFilter()===g.id" [attr.aria-pressed]="groupFilter()===g.id" (click)="groupFilter.set(groupFilter()===g.id?'':g.id)">{{g.name}}</button>}</div>
              <p class="pe-count" role="status">{{availableExercises().length}} {{availableExercises().length===1?'esercizio':'esercizi'}} · tocca per scegliere</p>
              <div class="pe-results" role="group" aria-label="Esercizi trovati">
                @for(e of shownExercises();track e.id){
                  <button type="button" class="pe-pick" [class.on]="exerciseForm.controls.exerciseId.value===e.id" [attr.aria-pressed]="exerciseForm.controls.exerciseId.value===e.id" (click)="chooseExercise(e.id)" [disabled]="saving()">
                    <gt-exercise-thumb [exercise]="e"/>
                    <span class="pe-pick-text"><strong>{{e.name}}</strong><small>{{s.muscle(e.muscleGroupId)}} · {{e.equipment}}</small></span>
                    @if(inDay(e.id)){<span class="su-badge muted">Già inserito</span>}
                    <gt-icon class="pe-pick-go" [name]="exerciseForm.controls.exerciseId.value===e.id?'check':'chevron-right'"/>
                  </button>
                }@empty{<p class="pe-hint pe-empty">Nessun esercizio trovato. Prova meno parole o togli i filtri.</p>}
                @if(availableExercises().length>shownExercises().length){<button type="button" class="su-btn sm ghost pe-more-results" (click)="pickerLimit.set(pickerLimit()+60)">Mostra altri {{availableExercises().length-shownExercises().length}}</button>}
                <a class="pe-link" routerLink="/catalogo">Non lo trovi? Apri il catalogo esercizi</a>
              </div>
            }@else{
              @if(s.exercise(exerciseForm.controls.exerciseId.value||'');as selected){
                <div class="pe-selected"><gt-exercise-thumb [exercise]="selected"/><span class="pe-pick-text"><strong>{{selected.name}}</strong><small>{{s.muscle(selected.muscleGroupId)}} · {{selected.equipment}}</small></span>
                  <button type="button" class="su-iconbtn pe-fav" [class.on]="s.isFavorite(selected.id)" (click)="s.toggleFavorite(selected.id)" [attr.aria-pressed]="s.isFavorite(selected.id)" [attr.aria-label]="s.isFavorite(selected.id)?'Rimuovi dai preferiti':'Aggiungi ai preferiti'">{{s.isFavorite(selected.id)?'★':'☆'}}</button>
                  <button type="button" class="su-chip" (click)="exerciseStep.set('pick')" [disabled]="saving()">Cambia</button></div>
              }@else{<button type="button" class="su-btn sm ghost" (click)="exerciseStep.set('pick')">Scegli un esercizio</button>}
              <div class="pe-row">
                <div><span class="su-label" id="pe-sets-label">Serie allenanti</span>
                  <div class="pe-stepper" role="group" aria-labelledby="pe-sets-label"><button type="button" (click)="bump('sets',-1,1,30)" [disabled]="saving()" aria-label="Una serie in meno">−</button><input type="number" inputmode="numeric" min="1" max="30" formControlName="sets" aria-labelledby="pe-sets-label"/><button type="button" (click)="bump('sets',1,1,30)" [disabled]="saving()" aria-label="Una serie in più">+</button></div></div>
                <div><span class="su-label" id="pe-warm-label">Riscaldamento</span>
                  <div class="pe-stepper" role="group" aria-labelledby="pe-warm-label"><button type="button" (click)="bump('warmupSets',-1,0,5)" [disabled]="saving()" aria-label="Una serie di riscaldamento in meno">−</button><input type="number" inputmode="numeric" min="0" max="5" formControlName="warmupSets" aria-labelledby="pe-warm-label"/><button type="button" (click)="bump('warmupSets',1,0,5)" [disabled]="saving()" aria-label="Una serie di riscaldamento in più">+</button></div></div>
              </div>
              <span class="su-label" id="pe-reps-label">Ripetizioni</span>
              <div class="su-chips pe-presets" role="group" aria-label="Intervalli rapidi di ripetizioni">@for(r of repPresets;track r.label){<button type="button" class="su-chip" [class.on]="exerciseForm.controls.repsMin.value===r.min&&exerciseForm.controls.repsMax.value===r.max" [attr.aria-pressed]="exerciseForm.controls.repsMin.value===r.min&&exerciseForm.controls.repsMax.value===r.max" (click)="setReps(r.min,r.max)" [disabled]="saving()"><b>{{r.min}}–{{r.max}}</b>{{r.label}}</button>}</div>
              <div class="pe-row">
                <div><span class="pe-sub" id="pe-min-label">Minimo</span>
                  <div class="pe-stepper" role="group" aria-labelledby="pe-min-label"><button type="button" (click)="bump('repsMin',-1,1,999)" [disabled]="saving()" aria-label="Riduci le ripetizioni minime">−</button><input type="number" inputmode="numeric" min="1" max="999" formControlName="repsMin" aria-labelledby="pe-min-label"/><button type="button" (click)="bump('repsMin',1,1,999)" [disabled]="saving()" aria-label="Aumenta le ripetizioni minime">+</button></div></div>
                <div><span class="pe-sub" id="pe-max-label">Massimo</span>
                  <div class="pe-stepper" role="group" aria-labelledby="pe-max-label"><button type="button" (click)="bump('repsMax',-1,1,999)" [disabled]="saving()" aria-label="Riduci le ripetizioni massime">−</button><input type="number" inputmode="numeric" min="1" max="999" formControlName="repsMax" aria-labelledby="pe-max-label"/><button type="button" (click)="bump('repsMax',1,1,999)" [disabled]="saving()" aria-label="Aumenta le ripetizioni massime">+</button></div></div>
              </div>
              @if(repsInverted()){<p class="pe-error" role="alert">Le ripetizioni minime non possono superare le massime.</p>}
              <span class="su-label" id="pe-rest-label">Recupero tra le serie</span>
              <div class="su-chips pe-presets" role="group" aria-labelledby="pe-rest-label">@for(v of restPresets;track v){<button type="button" class="su-chip" [class.on]="exerciseForm.controls.rest.value===v" [attr.aria-pressed]="exerciseForm.controls.rest.value===v" (click)="setRest(v)" [disabled]="saving()">{{restLabel(v)}}</button>}<label class="pe-inline">Altro<input type="number" inputmode="numeric" min="0" max="7200" formControlName="rest" aria-label="Recupero in secondi"/>s</label></div>
              <details class="pe-more" [open]="advancedOpen()"><summary><span><strong>Opzioni avanzate</strong><small>{{advancedSummary()}}</small></span><gt-icon name="chevron-down"/></summary>
                <div class="pe-row">
                  <label class="pe-field">Peso target ({{ s.settings().unit }})<input class="su-field" type="number" inputmode="decimal" min="0" step="0.5" formControlName="targetWeight" placeholder="—" /></label>
                  <label class="pe-field">RPE target (1–10)<input class="su-field" type="number" inputmode="decimal" min="1" max="10" step="0.5" formControlName="rpe" placeholder="—" /></label>
                </div>
                <p class="pe-hint">Il Coach Ombra usa l’RPE target per capire quando proporti di salire di carico.</p>
                <span class="su-label" id="pe-superset-label">Superset</span>
                <div class="su-chips" role="group" aria-labelledby="pe-superset-label">@for(g of supersetGroups;track g){<button type="button" class="su-chip" [class.on]="(exerciseForm.controls.superset.value||'')===g" [attr.aria-pressed]="(exerciseForm.controls.superset.value||'')===g" (click)="exerciseForm.controls.superset.setValue(g)" [disabled]="saving()">{{g?'Gruppo '+g:'Nessuno'}}</button>}</div>
                <p class="pe-hint">Assegna lo stesso gruppo a due esercizi per alternarli. Il recupero parte dopo la coppia. I riscaldamenti restano separati dai record.</p>
                <label class="su-label" for="pe-ex-notes">Note</label>
                <textarea id="pe-ex-notes" class="su-field" formControlName="notes" maxlength="1000" placeholder="Tecnica, presa, tempo…"></textarea>
              </details>
              <div class="pe-actions">
                <button class="su-btn su-primary" [disabled]="exerciseForm.invalid || repsInverted() || saving() || s.busy()">{{saving()?'Salvataggio…':'Salva esercizio'}}</button>
                @if(!editId){<button type="button" class="su-btn sm" (click)="saveExercise(true)" [disabled]="exerciseForm.invalid || repsInverted() || saving() || s.busy()"><gt-icon name="plus"/>Salva e aggiungi un altro</button>}
              </div>
            }
          </form>
        }
      </section>
    }`,
})
export class PlansComponent {
 private confirmation=confirmationForContext();
  exerciseCount(id:string){return this.s.days(id).reduce((n,d)=>n+this.s.planExercises(d.id).length,0);}
  dayThumbnail(dayId:string){const entry=this.s.planExercises(dayId)[0];return entry?this.s.exercise(entry.exerciseId):undefined;}
  thumbnailExercise(id:string){const day=this.s.days(id)[0],entry=day?this.s.planExercises(day.id)[0]:undefined;return entry?this.s.exercise(entry.exerciseId):undefined;}
  s = inject(Store);
  router = inject(Router);
  private route = inject(ActivatedRoute,{optional:true});
  selectedWeeks=signal<Record<string,number>>({});
  fb = inject(FormBuilder);
  hub=signal<'today'|'plans'>('plans');
  /** Modalità «Modifica» di una scheda: le azioni compaiono sulle righe invece che nei menu ⋯. */
  editing=signal('');
  openDayId=signal('');
  newPlanStep=signal<''|'choose'|'copy'>('');
  activePlans=computed(()=>this.plans().filter(plan=>plan.active&&!plan.completedAt));
  otherPlans=computed(()=>this.plans().filter(plan=>!(plan.active&&!plan.completedAt)));
  archivedCount=computed(()=>this.s.data().plans.filter(plan=>plan.archived).length);
  copyablePlans=computed(()=>this.s.data().plans.filter(plan=>!plan.program&&!plan.archived));
  /** Scheda vuota: entra in modifica e apre subito il primo allenamento. */
  startBuilding(id:string){this.editing.set(id);this.expanded.set(id);this.openDay(id);}
  toggleEditing(id:string){const next=this.editing()===id?'':id;this.editing.set(next);if(next)this.expanded.set(id);}
  async copyPlan(id:string){await this.s.duplicatePlan(id);this.newPlanStep.set('');}
  currentWeek(plan:TrainingPlan){const next=this.s.days(plan.id).find(day=>day.sessionDate&&this.dayDate(day)>=this.today&&!this.completedDayWorkout(day));return next?.week||(plan.program&&plan.program.endDate<this.today?plan.program.weeks:1);}
  planProgress(plan:TrainingPlan){const total=this.s.days(plan.id).length;return total?Math.min(100,Math.round(this.completedForPlan(plan.id)/total*100)):0;}
  overlaps=computed(()=>planOverlaps(this.s.data()));
  async resolveOverlap(keepId:string,dropId:string){
   const keep=this.s.data().plans.find(p=>p.id===keepId),drop=this.s.data().plans.find(p=>p.id===dropId);
   if(!keep||!drop||!await this.confirmation.ask('Concludere “'+drop.name+'” e tenere “'+keep.name+'”? Le sedute registrate restano nello storico.'))return;
   await this.s.finishPlan(dropId,true);
  }
  todayExerciseCount=computed(()=>{const draft=this.s.draft(),day=this.todayDay();return draft?this.s.workoutExercises(draft.id).length:day?this.s.planExercises(day.id).length:0;});
  todaySetCount=computed(()=>{const draft=this.s.draft();if(draft)return this.s.workoutExercises(draft.id).reduce((total,row)=>total+this.s.sets(row.id).filter(set=>set.kind!=='warmup').length,0);const day=this.todayDay();return day?this.s.planExercises(day.id).reduce((total,row)=>total+row.sets,0):0;});
  completedForPlan(id:string){return this.s.completed().filter(workout=>workout.planId===id).length;}
  todayDay=computed(()=>{const day=this.s.nextDay();return day&&!this.s.data().plans.find(p=>p.id===day.planId)?.completedAt?day:undefined;});
  todayPlan=computed(()=>{const id=this.s.draft()?.planId||this.todayDay()?.planId;return this.s.data().plans.find(plan=>plan.id===id);});
  todaySchedule=computed(()=>{const draft=this.s.draft(),dayId=draft?.dayId||this.todayDay()?.id;if(!dayId)return undefined;return this.s.data().scheduledWorkouts.filter(event=>(event.kind??'workout')==='workout'&&event.dayId===dayId&&(draft?event.workoutId===draft.id:event.date>=this.today&&!this.s.completed().some(workout=>workout.id===event.workoutId))).sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||''))[0];});
  todaySessionDate=computed(()=>this.s.draft()?.date||this.todaySchedule()?.date||this.todayDay()?.sessionDate||'');
  todayDuration=computed(()=>{const minutes=this.todaySchedule()?.durationMinutes;return minutes!==undefined&&Number.isFinite(minutes)&&minutes>0?minutes:undefined;});
  programLabel(plan:TrainingPlan){return plan.name+(plan.program?.weeks&&!/programma\s+\d+\s+settimane/i.test(plan.name)?' · Programma '+plan.program.weeks+' settimane':'');}
  todayProgramLabel=computed(()=>{const plan=this.todayPlan();return plan?this.programLabel(plan):this.s.draft()?.planName||'Il tuo programma';});
  todayWeekday=computed(()=>{const date=this.todaySessionDate();if(date){const label=new Date(date+'T12:00:00').toLocaleDateString('it-IT',{weekday:'long'});return label.charAt(0).toUpperCase()+label.slice(1);}const weekday=this.todayDay()?.weekday;return weekday===undefined?'':this.weekdays[weekday];});
  todayTitle=computed(()=>{const title=this.s.draft()?.dayName||this.todayDay()?.name||'Allenati',weekday=this.todayWeekday();return weekday&&!/^(?:lun(?:edì)?|mar(?:tedì)?|mer(?:coledì)?|gio(?:vedì)?|ven(?:erdì)?|sab(?:ato)?|dom(?:enica)?)(?:[\s.\-–—]|$)/i.test(title)?weekday.slice(0,3)+' – '+title:title;});
  archived = signal(false);
  expanded = signal(this.s.activePlan?.()?.id||"");
  modal = signal("");
  replacementTarget = signal('');
  saving = signal(false);
  deletingPlan=signal('');startingPast=signal(false);pastDates:Record<string,string>={};
  private todayClock=inject(TodayService,{optional:true});
  get today(){return this.todayClock?.date()||localDate();}
  draftNotice = signal('');
  private drafts = inject(FormDraftService,{optional:true});
  private draftSession?: DraftSession<PlanEditorDraft>;
  private draftSubscriptions: {unsubscribe():void}[] = [];
  private formBaseline = '';
  private restoringDraft = false;
  private destroyed = false;
  private restoreTimer?: ReturnType<typeof setTimeout>;
  private formSaveId = "";
  editId = "";
  parentId = "";
  exerciseSearch = signal("");scope=signal<ExerciseScope>("all");
  selectedCatalogId = signal("");
  weekdays = [
    "Lunedì",
    "Martedì",
    "Mercoledì",
    "Giovedì",
    "Venerdì",
    "Sabato",
    "Domenica",
  ];
  plans = computed(() =>
    this.s.data().plans.filter((p) => p.archived === this.archived()),
  );
  /* ===== Editor guidato: struttura iniziale, scelta esercizio in due passi, valori rapidi ===== */
  readonly planTemplates=[
    {id:'',label:'Vuota',hint:'Decidi tu gli allenamenti',days:[] as string[]},
    {id:'full',label:'Full body',hint:'3 allenamenti',days:['Full body A','Full body B','Full body C']},
    {id:'upper-lower',label:'Upper / Lower',hint:'4 allenamenti',days:['Upper A','Lower A','Upper B','Lower B']},
    {id:'ppl',label:'Push Pull Legs',hint:'3 allenamenti',days:['Push','Pull','Legs']},
    {id:'ppl-2',label:'Push Pull Legs × 2',hint:'6 allenamenti',days:['Push A','Pull A','Legs A','Push B','Pull B','Legs B']},
  ];
  planTemplate=signal('');
  templateDays=computed(()=>this.planTemplates.find(template=>template.id===this.planTemplate())?.days||[]);
  readonly repPresets=[{min:4,max:6,label:'forza'},{min:6,max:10,label:'forza e massa'},{min:8,max:12,label:'massa'},{min:12,max:15,label:'resistenza'}];
  readonly restPresets=[60,90,120,180];
  readonly supersetGroups=['','A','B','C','D'];
  exerciseStep=signal<'pick'|'config'>('pick');
  groupFilter=signal('');
  pickerLimit=signal(40);
  advancedOpen=signal(false);
  pickerGroups=computed(()=>{const used=new Set(this.s.data().exercises.filter(e=>e.active).map(e=>e.muscleGroupId));return this.s.data().muscleGroups.filter(group=>used.has(group.id));});
  shownExercises=computed(()=>this.availableExercises().slice(0,this.pickerLimit()));
  inDay(exerciseId:string){return this.modal()==='exercise'&&this.s.planExercises(this.parentId).some(entry=>entry.exerciseId===exerciseId&&entry.id!==this.editId);}
  sheetTitle(){return this.modal()==='plan'?(this.editId?'Nome e descrizione':'Nuova scheda'):this.modal()==='day'?(this.editId?'Modifica allenamento':'Nuovo allenamento'):this.exerciseStep()==='pick'?'Scegli l’esercizio':this.editId?'Modifica esercizio':'Serie e ripetizioni';}
  sheetHint(){
    if(this.modal()==='plan')return this.editId?'':'Dai un nome e scegli la struttura di partenza.';
    const data=this.s.data();
    if(this.modal()==='day')return data.plans.find(plan=>plan.id===this.parentId)?.name||'';
    return data.days.find(day=>day.id===this.parentId)?.name||'';
  }
  /** Nomi rapidi per un nuovo allenamento, senza quelli già usati nella scheda. */
  dayIdeas(){if(this.editId)return [];const used=new Set(this.s.data().days.filter(day=>day.planId===this.parentId).map(day=>day.name.trim().toLowerCase()));return ['Push','Pull','Legs','Upper','Lower','Full body','Giorno A','Giorno B','Giorno C'].filter(name=>!used.has(name.toLowerCase())).slice(0,6);}
  bump(field:'sets'|'repsMin'|'repsMax'|'warmupSets',delta:number,min:number,max:number){
    const controls=this.exerciseForm.controls,control=controls[field],value=Math.min(max,Math.max(min,Math.round(Number(control.value)||0)+delta));
    control.setValue(value);control.markAsDirty();
    // L'intervallo resta coerente: il minimo trascina il massimo e viceversa.
    if(field==='repsMin'&&value>(controls.repsMax.value??value))controls.repsMax.setValue(value);
    if(field==='repsMax'&&value<(controls.repsMin.value??value))controls.repsMin.setValue(value);
  }
  setReps(min:number,max:number){this.exerciseForm.patchValue({repsMin:min,repsMax:max});this.exerciseForm.markAsDirty();}
  setRest(seconds:number){this.exerciseForm.controls.rest.setValue(seconds);this.exerciseForm.controls.rest.markAsDirty();}
  restLabel(seconds:number){return seconds<60?seconds+' s':Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}
  repsInverted(){const {repsMin,repsMax}=this.exerciseForm.controls;return Number(repsMin.value)>Number(repsMax.value);}
  advancedSummary(){const v=this.exerciseForm.getRawValue(),parts=[v.targetWeight!==null&&v.targetWeight!==undefined?'peso target':'',v.rpe!==null&&v.rpe!==undefined?'RPE '+v.rpe:'',v.superset?'superset '+v.superset:'',v.notes?'note':''].filter(Boolean);return parts.length?parts.join(' · '):'Peso target · RPE · superset · note';}
  /** Riepilogo dell'allenamento: esercizi, serie allenanti e durata indicativa (lavoro + recuperi). */
  dayMeta(day:TrainingPlanDay){
    const rows=this.s.planExercises(day.id),sets=rows.reduce((total,row)=>total+row.sets,0);
    const seconds=rows.reduce((total,row)=>total+row.sets*(45+row.rest)+(row.warmupSets||0)*75,0),minutes=Math.max(5,Math.round(seconds/300)*5);
    return rows.length+(rows.length===1?' esercizio':' esercizi')+(sets?' · '+sets+' serie · ~'+minutes+' min':'');
  }
  /** Serie allenanti per gruppo muscolare principale negli allenamenti mostrati (una settimana tipo). */
  planBalance(plan:TrainingPlan){
    const totals=new Map<string,number>();
    for(const day of this.visibleDays(plan))for(const row of this.s.planExercises(day.id)){const group=this.s.muscle(this.s.exercise(row.exerciseId)?.muscleGroupId||'');if(group)totals.set(group,(totals.get(group)||0)+row.sets);}
    return [...totals].map(([name,sets])=>({name,sets})).sort((a,b)=>b.sets-a.sets||a.name.localeCompare(b.name));
  }
  availableExercises = computed(() =>
    this.s
      .data()
      .exercises.filter(
        (e) =>
          e.active &&
          (!this.groupFilter()||e.muscleGroupId===this.groupFilter()) &&
          (this.scope()==='all'||(this.scope()==='favorites'?this.s.isFavorite(e.id):this.s.recentExerciseIds().includes(e.id))) &&
          matchesExercise(e,this.exerciseSearch()),
      ),
  );
  exercisesForGroup(id:string) { return this.availableExercises().filter(e=>e.muscleGroupId===id); }
  chooseExercise(id:string) { this.exerciseForm.controls.exerciseId.setValue(id);this.exerciseForm.controls.exerciseId.markAsTouched();this.selectedCatalogId.set(id);this.exerciseStep.set('config'); }
  planForm = this.fb.nonNullable.group({
    name: ["", [Validators.required, Validators.pattern(/\S/)]],
    description: [""],
  });
  dayForm = this.fb.nonNullable.group({
    name: ["", [Validators.required, Validators.pattern(/\S/)]],
    weekday: [""],
  });
  exerciseForm = this.fb.group({
    warmupSets:[0,[Validators.min(0),Validators.max(5),Validators.pattern(/^\d+$/)]],superset:[""],
    exerciseId: ["", Validators.required],
    sets: [
      3,
      [
        Validators.required,
        Validators.min(1),
        Validators.max(30),
        Validators.pattern(/^\d+$/),
      ],
    ],
    repsMin: [
      8,
      [
        Validators.required,
        Validators.min(1),
        Validators.max(999),
        Validators.pattern(/^\d+$/),
      ],
    ],
    repsMax: [
      12,
      [
        Validators.required,
        Validators.min(1),
        Validators.max(999),
        Validators.pattern(/^\d+$/),
      ],
    ],
    rest: [90, [Validators.required, Validators.min(0), Validators.max(7200)]],
    targetWeight: [null as number | null, Validators.min(0)],
    rpe: [null as number | null, [Validators.min(1), Validators.max(10)]],
    notes: [""],
  });
  ngOnInit(){
    const selected=this.route?.snapshot?.queryParamMap?.get('plan');
    if(selected){this.hub.set('plans');this.expanded.set(selected);const plan=this.s.data().plans.find(p=>p.id===selected);if(plan){this.archived.set(plan.archived);const week=Number(this.route?.snapshot?.queryParamMap?.get('week'));if(plan.program&&Number.isInteger(week)&&week>=1&&week<=plan.program.weeks)this.selectWeek(plan.id,week);}}
    if(!this.drafts)return;
    this.draftSession=this.drafts.bind(this.s.archiveKey(),'plans-editor',()=>this.captureDraft(),value=>this.restoreDraft(value));
    const changed=()=>{if(!this.restoringDraft)this.draftSession?.changed();};
    this.draftSubscriptions=[this.planForm.valueChanges.subscribe(changed),this.dayForm.valueChanges.subscribe(changed),this.exerciseForm.valueChanges.subscribe(changed)];
  }
  private activeValue(){return this.modal()==='plan'?this.planForm.getRawValue():this.modal()==='day'?this.dayForm.getRawValue():this.exerciseForm.getRawValue();}
  private hasChanges(){return !!this.modal()&&JSON.stringify(this.activeValue())!==this.formBaseline;}
  private captureDraft():PlanEditorDraft|null{
    if(!this.hasChanges())return null;
    return {kind:this.modal(),editId:this.editId,saveId:this.formSaveId,parentId:this.parentId,baseline:this.formBaseline,expanded:this.expanded(),archived:this.archived(),search:this.exerciseSearch(),scope:this.scope(),unit:this.s.settings?.()?.unit||'kg',plan:this.planForm.getRawValue(),day:this.dayForm.getRawValue(),exercise:this.exerciseForm.getRawValue()};
  }
  private appliedDraft(value:PlanEditorDraft){
    const data=this.s.data();
    if(value.kind==='plan'){const plan=data.plans.find(item=>item.id===value.saveId);return !!plan&&plan.name===value.plan.name.trim()&&coachVisibleText(plan.description)===value.plan.description.trim();}
    if(value.kind==='day'){const day=data.days.find(item=>item.id===value.saveId);return !!day&&day.name===value.day.name.trim()&&day.weekday===(value.day.weekday===''?undefined:Number(value.day.weekday));}
    const entry=data.planExercises.find(item=>item.id===value.saveId),form=value.exercise;
    const kg=form.targetWeight===null?undefined:value.unit==='lb'?form.targetWeight/2.2046226218:form.targetWeight;
    return !!entry&&entry.exerciseId===form.exerciseId&&entry.sets===form.sets&&entry.repsMin===form.repsMin&&entry.repsMax===form.repsMax&&entry.rest===form.rest&&entry.targetWeight===kg&&entry.rpe===(form.rpe??undefined)&&entry.notes===(form.notes||'')&&(entry.warmupSets||0)===(form.warmupSets||0)&&(entry.superset||'')===(form.superset||'');
  }
  private restoreDraft(value:PlanEditorDraft){
    if(this.destroyed||this.modal())return;
    if(typeof this.s.ready==='function'&&!this.s.ready()){this.restoreTimer=setTimeout(()=>this.restoreDraft(value),100);return;}
    if(!value){void this.draftSession?.clear();return;}
    const data=this.s.data();
    const stale=!['plan','day','exercise'].includes(value.kind)||!value.saveId||!value.plan||!value.day||!value.exercise||typeof value.baseline!=='string'||
      value.kind==='plan'&&!!value.editId&&!data.plans.some(p=>p.id===value.editId)||
      value.kind==='day'&&(!data.plans.some(p=>p.id===value.parentId)||!!value.editId&&!data.days.some(d=>d.id===value.editId&&d.planId===value.parentId))||
      value.kind==='exercise'&&(!data.days.some(d=>d.id===value.parentId)||!!value.editId&&!data.planExercises.some(e=>e.id===value.editId&&e.dayId===value.parentId));
    if(stale||this.appliedDraft(value)){this.draftNotice.set(stale?'La bozza precedente si riferiva a un elemento non più disponibile. L’archivio è rimasto invariato.':'');this.clearStoredDraft();return;}
    const unit=this.s.settings?.()?.unit||'kg';
    if(value.unit&&value.unit!==unit&&value.exercise.targetWeight!==null){
      const convert=(weight:number)=>unit==='lb'?weight*2.2046226218:weight/2.2046226218;
      value.exercise.targetWeight=convert(value.exercise.targetWeight);
      if(value.kind==='exercise'){try{const baseline=JSON.parse(value.baseline);if(baseline.targetWeight!==null)baseline.targetWeight=convert(baseline.targetWeight);value.baseline=JSON.stringify(baseline);}catch{/* An old baseline can remain conservative and ask before discard. */}}
    }
    this.restoringDraft=true;
    try{
      this.planForm.reset(value.plan);this.dayForm.reset(value.day);this.exerciseForm.reset(value.exercise);
      const existing=(value.kind==='plan'?data.plans:value.kind==='day'?data.days:data.planExercises).some(item=>item.id===value.saveId);
      this.editId=existing?value.saveId:value.editId;this.formSaveId=value.saveId;this.parentId=value.parentId;this.formBaseline=value.baseline;
      this.hub.set('plans');this.expanded.set(value.expanded);this.archived.set(value.archived);this.exerciseSearch.set(value.search);this.scope.set(value.scope);
      this.selectedCatalogId.set(value.exercise.exerciseId||'');this.groupFilter.set('');this.pickerLimit.set(40);this.exerciseStep.set(value.exercise.exerciseId?'config':'pick');this.advancedOpen.set(value.exercise.targetWeight!==null||value.exercise.rpe!==null||!!value.exercise.superset||!!value.exercise.notes);this.modal.set(value.kind);this.draftNotice.set('Bozza recuperata. Controlla i valori e salva quando sei pronto.');
    }finally{this.restoringDraft=false;}
  }
  private beginEditor(retry:()=>void){
    if(this.saving())return false;
    if(this.hasChanges()){void this.confirmation.ask('Scartare le modifiche non salvate prima di aprire un altro modulo?').then(ok=>{if(ok&&!this.destroyed&&!this.saving()){this.editorSaved();retry();}});return false;}
    if(this.modal())this.clearStoredDraft();
    clearTimeout(this.restoreTimer);this.draftNotice.set('');return true;
  }
  private editorOpened(){this.formBaseline=JSON.stringify(this.activeValue());this.draftSession?.changed();}
  private clearStoredDraft(){void this.draftSession?.clear().catch(()=>{/* Pending cleanup is retried by the draft service before exit. */});}
  private editorSaved(){this.modal.set('');this.formBaseline='';this.draftNotice.set('');this.clearStoredDraft();}
  ngOnDestroy(){clearTimeout(this.restoreTimer);void this.draftSession?.destroy();this.destroyed=true;this.draftSubscriptions.forEach(subscription=>subscription.unsubscribe());}
  openPlan(p?: TrainingPlan) {
    if(!this.beginEditor(()=>this.openPlan(p)))return;
    this.hub.set('plans');
    this.editId = p?.id || "";
    this.formSaveId = p?.id || uid();
    this.planTemplate.set('');
    this.planForm.reset({
      name: p?.name || "",
      description: coachVisibleText(p?.description),
    });
    this.modal.set("plan");
    this.editorOpened();
  }
  async savePlan() {
    if (this.planForm.invalid || this.saving()) return;
    this.saving.set(true);
    this.planForm.disable({emitEvent:false});
    try {
    const v = this.planForm.getRawValue();
    const id = this.formSaveId ||= this.editId || uid();
    const created = !this.editId, days = created ? this.templateDays() : [];
    if (await this.s.savePlan(id, v.name, replaceCoachVisibleText(this.s.data().plans.find(p=>p.id===id)?.description, v.description))) {
      // Una scheda nuova si apre subito in modifica, con gli allenamenti della struttura scelta.
      if (days.length && await this.s.addPlanDays(id, days)) this.openDayId.set(this.s.days(id)[0]?.id || '');
      this.expanded.set(id);
      if (created) { this.archived.set(false); this.editing.set(id); }
      this.editorSaved();
    }
    } finally { this.planForm.enable({emitEvent:false});this.saving.set(false); }
  }
  openDay(planId: string, day?: TrainingPlanDay) {
    if(!this.beginEditor(()=>this.openDay(planId, day)))return;
    this.parentId = planId;
    this.editId = day?.id || "";
    this.formSaveId = day?.id || uid();
    this.dayForm.reset({
      name: day?.name || "",
      weekday: day?.weekday === undefined ? "" : String(day.weekday),
    });
    this.modal.set("day");
    this.editorOpened();
  }
  async saveDay() {
    if (this.dayForm.invalid || this.saving()) return;
    this.saving.set(true);
    this.dayForm.disable({emitEvent:false});
    try {
    const v = this.dayForm.getRawValue();
    const created = !this.editId;
    if (
      await this.s.saveDay(
        this.formSaveId ||= this.editId || uid(),
        this.parentId,
        v.name,
        v.weekday === "" ? undefined : Number(v.weekday),
      )
    ) {
      this.expanded.set(this.parentId);
      if (created) this.openDayId.set(this.formSaveId);
      this.editorSaved();
    }
    } finally { this.dayForm.enable({emitEvent:false});this.saving.set(false); }
  }
  activate(id: string) {
    void this.s.change((d) => {
      d.plans.forEach((p) => (p.active = p.id === id && !p.archived));
    }, "Piano attivo aggiornato.");
  }
  async archive(p: TrainingPlan) {
    if (
      !p.archived &&
      !await this.confirmation.ask(
        "Archiviare il piano? Tutti gli allenamenti storici saranno conservati.",
      )
    )
      return;
    void this.s.change(
      (d) => {
        const x = d.plans.find((x) => x.id === p.id)!;
        x.archived = !p.archived;
        x.active = false;
        x.updatedAt = now();
      },
      p.archived ? "Piano ripristinato." : "Piano archiviato.",
    );
  }
  async removePlan(plan:TrainingPlan){
    if(this.deletingPlan())return;
    if(!await this.confirmation.ask({title:'Eliminare il piano?',confirmLabel:'Elimina piano',detail:plan.name+' · '+this.s.days(plan.id).length+' giorni',message:`Eliminare il piano “${plan.name}” con i giorni e gli esercizi programmati? Gli allenamenti già registrati e le loro serie resteranno nello storico. Gli altri piani non saranno modificati.`,tone:'danger'}))return;
    const planned=this.s.plannedEventsOf(plan.id).length;
    const removePlannedEvents=planned>0&&await this.confirmation.ask({title:'E le sedute nel calendario?',confirmLabel:'Elimina anche dal calendario',cancelLabel:'Mantieni nel calendario',tone:'danger',detail:planned===1?'1 seduta in programma':planned+' sedute in programma',message:`Il piano “${plan.name}” ha sedute in programma nel calendario non ancora svolte. Vuoi eliminarle insieme al piano? Gli allenamenti già registrati restano comunque nello storico.`});
    this.deletingPlan.set(plan.id);
    try{if(await this.s.deletePlan(plan.id,{removePlannedEvents})){if(this.expanded()===plan.id)this.expanded.set('');}}
    finally{this.deletingPlan.set('');}
  }
  async removeDay(day: TrainingPlanDay) {
    if (
      await this.confirmation.ask(
        "Eliminare questo giorno e i suoi esercizi? Lo storico rimane disponibile.",
      )
    )
      void this.s.change((d) => {
        d.days = d.days.filter((x) => x.id !== day.id);
        d.planExercises = d.planExercises.filter((e) => e.dayId !== day.id);
        d.days
          .filter((x) => x.planId === day.planId)
          .sort((a, b) => a.order - b.order)
          .forEach((x, i) => (x.order = i));
      });
  }
  moveDay(day: TrainingPlanDay, dir: number) {
    void this.s.change((d) => {
      const rows = d.days
        .filter((x) => x.planId === day.planId)
        .sort((a, b) => a.order - b.order);
      const idx = rows.findIndex((x) => x.id === day.id);
      const other = rows[idx + dir];
      if (other)
        [rows[idx].order, other.order] = [other.order, rows[idx].order];
    });
  }
  openExercise(dayId: string, e?: TrainingPlanExercise) {
    if(!this.beginEditor(()=>this.openExercise(dayId, e)))return;
    this.parentId = dayId;
    this.editId = e?.id || "";
    this.formSaveId = e?.id || uid();
    this.selectedCatalogId.set(e?.exerciseId || "");
    this.exerciseSearch.set("");
    this.groupFilter.set("");
    this.pickerLimit.set(40);
    this.exerciseStep.set(e ? "config" : "pick");
    this.advancedOpen.set(!!e && (e.targetWeight !== undefined || !!e.rpe || !!e.superset || !!e.notes));
    // Un nuovo esercizio riparte dallo schema dell'ultimo inserito nello stesso allenamento.
    const previous = e ? undefined : this.s.planExercises(dayId).at(-1);
    this.exerciseForm.reset({
      exerciseId: e?.exerciseId || "",
      sets: e?.sets || previous?.sets || 3,
      repsMin: e?.repsMin || previous?.repsMin || 8,
      repsMax: e?.repsMax || previous?.repsMax || 12,
      rest: e?.rest ?? previous?.rest ?? 90,
      targetWeight:
        e?.targetWeight === undefined ? null : this.s.weight(e.targetWeight),
      rpe: e?.rpe ?? null,
      notes: e?.notes || "",warmupSets:e?.warmupSets||0,superset:e?.superset||"",
    });
    this.modal.set("exercise");
    this.editorOpened();
  }
  async closeModal(){if(this.saving())return;if(this.hasChanges()&&!await this.confirmation.ask('Scartare le modifiche non salvate?'))return;this.editorSaved();}
  async saveExercise(another = false) {
    if (this.exerciseForm.invalid || this.saving()) return;
    const v = this.exerciseForm.getRawValue();
    if (v.repsMin! > v.repsMax!) {
      this.s.error.set(
        "Le ripetizioni minime non possono superare le massime.",
      );
      return;
    }
    this.saving.set(true);
    this.exerciseForm.disable({emitEvent:false});
    try {
    if (
      await this.s.savePlanExercise({
        ...this.s.data().planExercises.find(entry=>entry.id===this.editId),
        id: this.formSaveId ||= this.editId || uid(),
        dayId: this.parentId,
        warmupSets:v.warmupSets||0,superset:v.superset||undefined,
        exerciseId: v.exerciseId!,
        sets: v.sets!,
        repsMin: v.repsMin!,
        repsMax: v.repsMax!,
        rest: v.rest!,
        targetWeight:
          v.targetWeight === null ? undefined : this.s.kg(v.targetWeight),
        rpe: v.rpe ?? undefined,
        notes: v.notes || "",
        order:
          this.s.data().planExercises.find((e) => e.id === (this.formSaveId || this.editId))
            ?.order ?? this.s.planExercises(this.parentId).length,
      })
    ) {
      const day = this.parentId;
      this.openDayId.set(day);
      this.editorSaved();
      if (another) queueMicrotask(() => { if (!this.destroyed && !this.modal()) this.openExercise(day); });
    }
    } finally { this.exerciseForm.enable({emitEvent:false});this.saving.set(false); }
  }
  moveExercise(e: TrainingPlanExercise, dir: number) {
    void this.s.change((d) => {
      const rows = d.planExercises
        .filter((x) => x.dayId === e.dayId)
        .sort((a, b) => a.order - b.order);
      const idx = rows.findIndex((x) => x.id === e.id);
      if (rows[idx + dir])
        [rows[idx].order, rows[idx + dir].order] = [
          rows[idx + dir].order,
          rows[idx].order,
        ];
    });
  }
  async removeExercise(e: TrainingPlanExercise) {
    if(!await this.confirmation.ask('Rimuovere questo esercizio dal giorno del piano? Lo storico degli allenamenti resta conservato.'))return;
    void this.s.change((d) => {
      d.planExercises = d.planExercises.filter((x) => x.id !== e.id);
      d.planExercises
        .filter((x) => x.dayId === e.dayId)
        .sort((a, b) => a.order - b.order)
        .forEach((x, i) => (x.order = i));
    });
  }
  weeksFor(plan:TrainingPlan){return [...new Set(this.s.days(plan.id).map(day=>day.week).filter((week):week is number=>week!==undefined))].sort((a,b)=>a-b);}
  weekFor(plan:TrainingPlan){const options=this.weeksFor(plan),requested=this.selectedWeeks()[plan.id];if(requested&&options.includes(requested))return requested;const next=this.s.days(plan.id).find(day=>day.sessionDate&&this.dayDate(day)>=this.today&&!this.completedDayWorkout(day));return next?.week||(plan.program&&plan.program.endDate<this.today?options.at(-1):options[0])||1;}
  selectWeek(planId:string,week:number){this.selectedWeeks.update(values=>({...values,[planId]:Number(week)}));}
  visibleDays(plan:TrainingPlan){return plan.program?this.s.days(plan.id).filter(day=>day.week===this.weekFor(plan)):this.s.days(plan.id);}
  dayDate(day:TrainingPlanDay){return this.s.data().scheduledWorkouts.find(event=>event.dayId===day.id)?.date||day.sessionDate||'';}
  dateLabel(value:string){try{return parseLocalDate(value).toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'});}catch{return value;}}
  completedDayWorkout(day:TrainingPlanDay){if(!day.sessionDate)return undefined;const event=this.s.data().scheduledWorkouts.find(event=>event.dayId===day.id),linked=event?.workoutId?this.s.data().workouts.find(workout=>workout.id===event.workoutId):undefined;return linked?.status==='completed'?linked:undefined;}
  showDashboard(planId:string,finish=false){void this.router.navigateByUrl('/piano/'+encodeURIComponent(planId)+(finish?'?finish=1':''));}
  async start(dayId: string) {
    const day=this.s.data().days.find(day=>day.id===dayId),event=day?.sessionDate?this.s.data().scheduledWorkouts.find(event=>event.dayId===dayId):this.s.data().scheduledWorkouts.find(event=>(event.kind??'workout')==='workout'&&event.dayId===dayId&&event.date===this.today&&!event.workoutId);
    if(event){
      if(event.date>this.today&&!await this.confirmation.ask('Iniziare ora questo allenamento? La sessione verrà registrata nella data di oggi.'))return;
      const linked=event.workoutId?this.s.data().workouts.find(workout=>workout.id===event.workoutId):undefined,date=linked?.status==='draft'||event.date>this.today?undefined:event.date;
      if(await this.s.startScheduled(event.id,date))await this.router.navigateByUrl('/sessione');
      return;
    }
    if(day?.sessionDate&&day.sessionDate>this.today&&!await this.confirmation.ask('Iniziare ora questo allenamento? La sessione verrà registrata nella data di oggi.'))return;
    if (await this.s.start(dayId)) await this.router.navigateByUrl("/sessione");
  }
  async startPast(day:string){
    if(this.startingPast())return;
    const date=this.pastDates[day];
    try{parseLocalDate(date);if(date>this.today)throw Error('Scegli oggi o una data passata.');}
    catch(error){this.s.error.set(error instanceof Error?error.message:'Scegli la data dell’allenamento.');return;}
    this.startingPast.set(true);
    try{
      if(await this.s.start(day,date))await this.router.navigateByUrl('/sessione');
      else if(this.s.draft())await this.router.navigateByUrl('/sessione?requestedDate='+encodeURIComponent(date));
    }
    finally{this.startingPast.set(false);}
  }
}
