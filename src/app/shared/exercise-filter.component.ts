import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Exercise } from '../models/domain';
import { matchesExercise } from '../services/exercise-search';
import { ExerciseThumbComponent } from './exercise-thumb.component';

@Component({
  selector: 'gt-exercise-filter',
  standalone: true,
  imports: [FormsModule, ExerciseThumbComponent],
  template: `<label class="search-label">Cerca per nome
      <input type="search" placeholder="Contiene le parole…" autocomplete="off"
        [ngModel]="query()" (ngModelChange)="query.set($event)" />
    </label>
    <label class="group-label">Gruppo muscolare<select [ngModel]="groupId()" (ngModelChange)="groupId.set($event)"><option value="">Tutti i gruppi</option>@for(group of groups();track group.id){<option [value]="group.id">{{group.name}}</option>}</select></label>
    <label class="exercise-label">Esercizio
      <select [ngModel]="value()" (ngModelChange)="choose.emit($event)">
        <option value="" [disabled]="!includeAll()">{{includeAll() ? 'Tutti gli esercizi' : 'Seleziona un esercizio'}}</option>
        @if (pinned(); as exercise) {
          <option [value]="exercise.id">{{exercise.name}} (selezionato)</option>
        }
        @for (exercise of filtered(); track exercise.id) {
          <option [value]="exercise.id">{{exercise.name}}</option>
        }
      </select>
    </label>
    @if (selected(); as exercise) {
      <gt-exercise-thumb [exercise]="exercise" />
    }
    @if (query().trim() || groupId()) {
      <span class="filter-result" role="status">{{filtered().length}} esercizi trovati{{pinned() ? ' · Selezione attuale conservata' : ''}}</span>
    }`,
  styles: [`
    :host{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px 8px;flex:1;min-width:180px;align-content:start;max-width:100%;color:var(--muted);font-size:12px}
    label{min-width:0!important;margin:0;color:inherit;font-size:inherit;font-weight:inherit;line-height:1.4}.search-label{grid-column:1/-1}
    .group-label{grid-column:1/-1}.exercise-label{grid-column:1}input,select{width:100%;min-width:0}
    gt-exercise-thumb{grid-column:2;align-self:end;--thumb-width:58px;--thumb-height:43px}
    .filter-result{grid-column:1/-1;color:var(--muted);font-size:11px;line-height:1.4}
  `],
})
export class ExerciseFilterComponent {
  exercises = input.required<Exercise[]>();
  value = input('');
  includeAll = input(false);
  choose = output<string>();
  query = signal('');
  groupId = signal('');
  groups = computed(() => [...new Map(this.exercises().filter(exercise => exercise.muscleGroupId).map(exercise => [exercise.muscleGroupId, {id:exercise.muscleGroupId,name:exercise.tags?.find(tag => tag.trim()) || 'Altro'}])).values()].sort((a,b) => a.name.localeCompare(b.name, 'it')));
  selected = computed(() => this.exercises().find(exercise => exercise.id === this.value()));
  filtered = computed(() => this.exercises().filter(exercise => (!this.groupId() || exercise.muscleGroupId === this.groupId()) && matchesExercise(exercise, this.query(), true)));
  pinned = computed(() => {
    const exercise = this.selected();
    return exercise && (!matchesExercise(exercise, this.query(), true) || !!this.groupId() && exercise.muscleGroupId !== this.groupId()) ? exercise : undefined;
  });
}
