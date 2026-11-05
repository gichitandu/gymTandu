import { Component, ElementRef, afterRenderEffect, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '../services/store';
import {replacementCandidates} from '../services/replacement-candidates';
import {ExerciseThumbComponent} from './exercise-thumb.component';
import { PlanReplacementScope, planReplacementTargets } from '../services/exercise-replacement';

export interface ExerciseReplacementClosed {applied: boolean; activeChanged?: boolean}
@Component({selector: 'gt-exercise-replacement', standalone: true, imports: [FormsModule, ExerciseThumbComponent], template: `
<dialog #panel aria-labelledby="replacement-title" (cancel)="cancel($event)">
  <header><div><p class="eyebrow">IL TUO PROGRAMMA</p><h2 id="replacement-title">Sostituisci esercizio</h2></div><button type="button" class="close" aria-label="Chiudi sostituzione" [disabled]="busy()" (click)="close()">×</button></header>
  <p class="original"><strong>{{original()?.name || 'Esercizio non disponibile'}}</strong><small>{{plan()?.name || 'Seduta in corso'}}</small></p>
  @if(error()){<p class="replacement-error" role="alert">{{error()}}</p>}
  <label>Cerca il nuovo esercizio<input type="search" [ngModel]="query()" (ngModelChange)="setQuery($event)" placeholder="Nome, macchina o attrezzatura" [disabled]="busy()"></label>
  <label>Gruppo muscolare<select aria-label="Gruppo muscolare" [ngModel]="muscleGroup()" (ngModelChange)="setMuscleGroup($event)" [disabled]="busy()"><option value="">Tutti i gruppi muscolari</option>@for(group of s.data().muscleGroups;track group.id){<option [value]="group.id">{{group.name}}</option>}</select></label>
  <label>Nuovo esercizio<select aria-label="Nuovo esercizio" [ngModel]="replacement()" (ngModelChange)="replacement.set($event)" [disabled]="busy()"><option value="">Scegli un esercizio</option>@if(pinned();as selected){<option [value]="selected.id">{{selected.name}} · {{selected.equipment}} (selezionato)</option>}@for(candidate of alternatives();track candidate.id){<option [value]="candidate.id">{{candidate.name}} · {{candidate.equipment}}</option>}</select></label>
  <div class="candidate-count" role="status" aria-live="polite">{{alternatives().length}} esercizi disponibili{{query()||muscleGroup()?' con i filtri selezionati':''}}. Seleziona un esercizio per vedere la sua immagine.</div>
  <div class="candidate-browser" role="region" aria-label="Esercizi disponibili con immagini">
    @for(candidate of visibleAlternatives();track candidate.id){
      <button type="button" class="candidate" [class.candidate-selected]="replacement()===candidate.id" [attr.aria-pressed]="replacement()===candidate.id" [attr.aria-label]="'Seleziona '+candidate.name" [disabled]="busy()" (click)="replacement.set(candidate.id)">
        <gt-exercise-thumb [exercise]="candidate"/>
        <span class="candidate-copy"><strong>{{candidate.name}}</strong><small>{{s.muscle(candidate.muscleGroupId)}} · {{candidate.equipment}}</small></span>
        <span class="candidate-check" aria-hidden="true">{{replacement()===candidate.id?'✓':''}}</span>
      </button>
    }@empty{<p class="candidate-empty">Nessun esercizio corrisponde ai filtri. Modifica la ricerca o scegli un altro gruppo muscolare.</p>}
  </div>
  @if(visibleAlternatives().length<alternatives().length){
    <button type="button" class="load-more" [disabled]="busy()" (click)="showMore()">Mostra altri esercizi ({{alternatives().length-visibleAlternatives().length}} rimanenti)</button>
  }
  @if(selectedPreview();as selected){
    <div class="candidate-pinned"><gt-exercise-thumb [exercise]="selected"/><span><strong>Selezione conservata</strong><small>{{selected.name}} · {{s.muscle(selected.muscleGroupId)}}</small></span></div>
  }
  <label>Applica la sostituzione<select aria-label="Applica la sostituzione" [ngModel]="scope()" (ngModelChange)="scope.set($event)" [disabled]="busy()">
    @if(active()){<option value="session" [disabled]="!canChangeActive()">Solo questa seduta</option>}@else{<option value="single">Solo questo allenamento</option>}
    @if(source()&&plan()&&!plan()!.archived&&!plan()!.completedAt){<option value="all">Tutte le occorrenze nel piano</option><option value="selected">Solo gli allenamenti selezionati</option>}
  </select></label>
  @if(active()&&!canChangeActive()){<p class="help">Questa seduta contiene serie già eseguite: conservano il loro esercizio. Puoi aggiornare la programmazione del piano.</p>}
  @if(scope()==='selected'){
    <div class="selection-actions"><button type="button" (click)="selectAll()" [disabled]="busy()">Seleziona tutti</button><button type="button" (click)="selectedDays.set([])" [disabled]="busy()">Nessuno</button></div>
    <div class="day-selection">@for(group of dayGroups();track group.key){<fieldset><legend>{{group.label}}</legend>@for(day of group.days;track day.id){<label><input type="checkbox" [checked]="selectedDays().includes(day.id)" [disabled]="busy()" (change)="toggleDay(day.id,$any($event.target).checked)"><span><strong>{{day.name}}</strong><small>{{day.sessionDate?date(day.sessionDate):'Allenamento '+(day.order+1)}}@if(recorded(day.id)){ · già registrato: storico invariato}</small></span></label>}</fieldset>}</div>
  }
  <p class="replacement-summary" role="status">{{summary()}}</p>
  <p class="help">Serie, ripetizioni, recuperi e riscaldamento previsto restano nel piano. Imposta i carichi adatti alla nuova macchina. Gli allenamenti già registrati restano conservati.</p>
  <footer><button type="button" class="primary" [disabled]="busy()||s.busy()||!chosen()||!canApply()" (click)="apply()">{{busy()?'Salvataggio…':'Applica sostituzione'}}</button><button type="button" [disabled]="busy()" (click)="close()">Annulla</button></footer>
</dialog>`, styles: [`
:host{display:contents}dialog{width:min(600px,calc(100vw - 28px));max-height:calc(100dvh - 32px);overflow:auto;overscroll-behavior:contain;margin:auto;padding:22px;border:1px solid var(--line);border-radius:22px;background:var(--card);color:var(--text);font-family:inherit;box-shadow:0 24px 80px #0008}dialog::backdrop{background:#030914bb;backdrop-filter:blur(5px)}header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}h2{font-size:23px;line-height:1.25;margin:8px 0 16px}.eyebrow{font-size:10px;letter-spacing:1.5px;color:var(--accent-text);margin:0}.close{flex:none;width:44px;min-height:44px;font-size:24px;padding:4px}.original{padding:14px;border:1px solid var(--line);border-radius:13px;background:var(--bg);margin:0 0 18px}.original strong,.original small{display:block;overflow-wrap:anywhere}.original small{font-size:12px;color:var(--muted);margin-top:4px}label{display:block;margin:14px 0;font-size:13px;font-weight:600;line-height:1.5}input[type=search],select{display:block;width:100%;max-width:100%;min-width:0;font:400 16px/1.4 system-ui;margin-top:6px;min-height:46px;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--text)}button{min-height:44px;border:1px solid var(--line);border-radius:11px;background:var(--raised);color:var(--text);padding:10px 13px;font-family:inherit;line-height:1.4;cursor:pointer}button:disabled{opacity:.55;cursor:default}.selection-actions{display:flex;gap:8px}.selection-actions button{font-size:12px}.day-selection{max-height:34dvh;overflow:auto;margin:12px 0;padding:0 8px 0 0}fieldset{border:1px solid var(--line);border-radius:12px;padding:4px 12px;margin:10px 0}legend{font-size:12px;font-weight:700;color:var(--accent-text);padding:0 5px}.day-selection label{display:flex;align-items:flex-start;gap:10px;cursor:pointer;margin:10px 0;font-size:12px}.day-selection input{width:20px;height:20px;min-height:20px;flex:none;margin:1px 0;accent-color:var(--accent)}.day-selection strong,.day-selection small{display:block;line-height:1.5}.day-selection small{font-weight:400;color:var(--muted);margin-top:2px}.replacement-summary{padding:12px;border-radius:12px;background:var(--accent-soft);font-size:13px;line-height:1.6}.help{font-size:12px;line-height:1.65;color:var(--muted)}.replacement-error{padding:12px;color:var(--danger);background:var(--danger-soft);border-radius:12px;font-size:13px}footer{display:grid;gap:9px;margin-top:20px}footer .primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:650}.candidate-count{font-size:12px;color:var(--muted);line-height:1.5;margin:14px 0 8px}.candidate-browser{display:grid;gap:8px;max-height:min(38dvh,380px);overflow-y:auto;overscroll-behavior:contain;padding:3px 4px 6px 0;margin-bottom:8px}.candidate{width:100%;display:flex;align-items:center;gap:12px;min-height:78px;padding:10px;text-align:left;border:1px solid var(--line);border-radius:13px;background:var(--bg)}.candidate:hover{border-color:var(--accent-text)}.candidate-selected{outline:2px solid var(--accent);border-color:var(--accent)!important;background:var(--accent-soft)}.candidate gt-exercise-thumb{--thumb-width:70px;--thumb-height:62px}.candidate-copy{flex:1;min-width:0;display:grid;gap:5px;overflow-wrap:anywhere}.candidate-copy strong{font-size:13px;font-weight:700}.candidate-copy small,.candidate-pinned small{display:block;color:var(--muted);font-size:11px;line-height:1.5}.candidate-check{width:22px;flex:none;color:var(--accent-text);font-size:22px}.candidate-empty{font-size:13px;color:var(--muted);line-height:1.5;padding:14px;margin:0}.load-more{width:100%;font-size:12px;min-height:44px}.candidate-pinned{display:flex;align-items:center;gap:10px;background:var(--accent-soft);border:1px solid var(--line);border-radius:12px;padding:10px;margin-top:10px}.candidate-pinned gt-exercise-thumb{--thumb-width:62px;--thumb-height:52px}.candidate-pinned strong{font-size:12px;display:block}@media(max-width:480px){dialog{padding:16px}.candidate gt-exercise-thumb{--thumb-width:64px;--thumb-height:58px}}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent-text);outline-offset:2px}
`]})
export class ExerciseReplacementComponent {
  s = inject(Store);
  planExerciseId = input(''); workoutExerciseId = input('');
  closed = output<ExerciseReplacementClosed>();
  query = signal(''); muscleGroup = signal(''); visibleCount = signal(24);
  replacement = signal(''); scope = signal<PlanReplacementScope | 'session'>('single');
  selectedDays = signal<string[]>([]); busy = signal(false); error = signal('');
  private key = ''; private expectedExerciseId = '';
  private panel = viewChild<ElementRef<HTMLDialogElement>>('panel');
  active = computed(() => this.s.data().workoutExercises.find(row => row.id === this.workoutExerciseId()));
  source = computed(() => {
    if (this.planExerciseId()) return this.s.data().planExercises.find(row => row.id === this.planExerciseId());
    const active = this.active(), workout = this.s.data().workouts.find(row => row.id === active?.workoutId);
    if (!active || !workout) return;
    const entries = this.s.planExercises(workout.dayId).filter(row => row.exerciseId === active.exerciseId);
    const occurrence = this.s.workoutExercises(workout.id).filter(row => row.exerciseId === active.exerciseId).findIndex(row => row.id === active.id);
    return entries.find(row => row.order === active.order) || entries[Math.max(0, occurrence)];
  });
  original = computed(() => this.s.exercise(this.active()?.exerciseId || this.source()?.exerciseId || ''));
  plan = computed(() => {const source = this.source(), day = this.s.data().days.find(row => row.id === source?.dayId); return this.s.data().plans.find(row => row.id === day?.planId);});
  alternatives = computed(() => replacementCandidates(this.s.data().exercises, this.original(), this.query(), this.muscleGroup()));
  visibleAlternatives = computed(() => this.alternatives().slice(0, this.visibleCount()));
  chosen = computed(() => this.s.data().exercises.find(row => row.id === this.replacement() && row.active && row.id !== this.original()?.id));
  pinned = computed(() => this.chosen() && !this.alternatives().some(row => row.id === this.chosen()!.id) ? this.chosen() : undefined);
  selectedPreview = computed(() => this.chosen() && !this.visibleAlternatives().some(row => row.id === this.chosen()!.id) ? this.chosen() : undefined);
  availableDays = computed(() => {
    const source = this.source(), plan = this.plan(); if (!source || !plan) return [];
    const ids = new Set(this.s.data().planExercises.filter(row => row.exerciseId === source.exerciseId).map(row => row.dayId));
    return this.s.days(plan.id).filter(day => ids.has(day.id));
  });
  dayGroups = computed(() => {
    const groups = new Map<number, ReturnType<typeof this.availableDays>>();
    for (const day of this.availableDays()) {const key = day.week || 0; groups.set(key, [...(groups.get(key) || []), day]);}
    return [...groups].sort(([a], [b]) => a - b).map(([key, days]) => ({key, label: key ? 'Settimana ' + key : 'Allenamenti del piano', days}));
  });
  targets = computed(() => this.scope() === 'session' || !this.source() ? [] : planReplacementTargets(this.s.data(), this.source()!.id, this.scope() as PlanReplacementScope, this.selectedDays()));
  canChangeActive = computed(() => !!this.active() && !this.s.sets(this.active()!.id).some(row => row.completed));
  canApply = computed(() => this.scope() === 'session' ? this.canChangeActive() : this.targets().length > 0 && !!this.plan() && !this.plan()!.archived && !this.plan()!.completedAt);
  summary = computed(() => this.scope() === 'session' ? 'Sostituisci l’esercizio solo nella seduta aperta. Il piano resta invariato.' : this.targets().length + ' occorrenze in ' + new Set(this.targets().map(row => row.dayId)).size + ' allenamenti del piano.');
  constructor() {
    effect(() => {const key = this.planExerciseId() + ':' + this.workoutExerciseId(); if (key === this.key) return; this.key = key; this.query.set(''); this.muscleGroup.set(''); this.visibleCount.set(24); this.replacement.set(''); const source = this.source(); this.expectedExerciseId = this.original()?.id || ''; this.selectedDays.set(source ? [source.dayId] : []); this.scope.set(this.workoutExerciseId() ? this.canChangeActive() ? 'session' : source ? 'all' : 'session' : 'single');});
    afterRenderEffect(() => {const panel = this.panel()?.nativeElement; if (panel && !panel.open) panel.showModal();});
  }
  setQuery(value: string) {this.query.set(value); this.visibleCount.set(24);}
  setMuscleGroup(value: string) {this.muscleGroup.set(value); this.visibleCount.set(24);}
  showMore() {this.visibleCount.update(count => Math.min(count + 24, this.alternatives().length));}
  date(value: string) {return new Date(value + 'T12:00:00').toLocaleDateString('it-IT', {weekday: 'short', day: 'numeric', month: 'short'});}
  recorded(dayId: string) {return this.s.completed().some(row => row.dayId === dayId);}
  toggleDay(id: string, selected: boolean) {this.selectedDays.update(ids => selected ? [...new Set([...ids, id])] : ids.filter(value => value !== id));}
  selectAll() {this.selectedDays.set(this.availableDays().map(day => day.id));}
  close() {if (!this.busy()) this.closed.emit({applied: false});}
  cancel(event: Event) {event.preventDefault(); this.close();}
  async apply() {
    if (this.busy() || !this.chosen() || !this.canApply()) return;
    this.busy.set(true); this.error.set('');
    try {
      if (this.scope() === 'session' && this.active()) {
        if (this.active()!.exerciseId !== this.expectedExerciseId) {this.error.set('L’esercizio è cambiato. Riapri la sostituzione.'); return;}
        if (await this.s.substituteWorkoutExercise(this.active()!.id, this.replacement(), this.expectedExerciseId)) this.closed.emit({applied: true, activeChanged: true});
        else this.error.set(this.s.error() || 'Sostituzione non salvata.');
      } else if (this.source()) {
        const result = await this.s.replacePlanExercise({sourceId: this.source()!.id, expectedExerciseId: this.expectedExerciseId, replacementId: this.replacement(), scope: this.scope() as PlanReplacementScope, dayIds: this.selectedDays(), workoutExerciseId: this.workoutExerciseId() || undefined});
        if (result) this.closed.emit({applied: true, activeChanged: result.activeChanged}); else this.error.set(this.s.error() || 'Sostituzione non salvata.');
      }
    } finally {this.busy.set(false);}
  }
}
