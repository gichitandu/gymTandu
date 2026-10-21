import { SectionHeadingComponent } from "../shared/section-heading.component";
import { ExerciseThumbComponent } from "../shared/exercise-thumb.component";
import { matchesExercise } from "../services/exercise-search";
import {ExerciseScope,ExerciseScopeComponent} from "../shared/exercise-scope.component";
import {MachineSetupComponent} from "../shared/machine-setup.component";
import { ExerciseFamiliesComponent } from "../shared/exercise-families.component";
import { compressPhoto } from "../services/images";
import { ExerciseVideoComponent } from "../shared/exercise-video.component";
import { A11yModule } from "@angular/cdk/a11y";
import { Component, computed, inject, signal } from "@angular/core";
import {
  FormBuilder,
  ReactiveFormsModule,
  FormsModule,
  Validators,
} from "@angular/forms";
import { Store } from "../services/store";
import { Exercise, LoadMode, uid, now } from "../models/domain";
import { IconComponent } from "../shared/icon.component";
import { StatusComponent } from "../shared/status.component";
@Component({
  standalone: true,
  styleUrl: "./account-polish.css",
  imports: [SectionHeadingComponent, ExerciseThumbComponent,
    A11yModule,ExerciseScopeComponent,MachineSetupComponent,
    ExerciseFamiliesComponent,
    ExerciseVideoComponent,
    FormsModule,
    ReactiveFormsModule,
    IconComponent,
    StatusComponent,
  ],
  template: `<gt-section-heading index="08" eyebrow="CATALOGO ESERCIZI" title="Ogni possibilità." description="Trova la variante giusta. Costruisci un allenamento che sia tuo.">@if(s.canEditCatalog()){<button class="primary" (click)="open()" [disabled]="!s.ready()"><gt-icon name="plus"/> Nuovo esercizio</button>}</gt-section-heading>
    <div class="catalog-intro"><div class="catalog-orbit" aria-hidden="true"><gt-icon name="weight"/><i></i></div><div><span class="eyebrow">LA TUA LIBRERIA DI MOVIMENTO</span><strong>{{s.data().exercises.length}} <small>esercizi in archivio</small></strong><p>{{s.data().muscleGroups.length}} gruppi muscolari · Varianti per ogni attrezzatura</p></div></div>
    <gt-status />
    <div class="filters catalog-filters">
      <label
        >Cerca<input
          type="search" placeholder="Cerca parole nel nome, es. panca manubri"
          [ngModel]="query()"
          (ngModelChange)="query.set($event)" /></label
      ><label
        >Gruppo muscolare<select
          [ngModel]="group()"
          (ngModelChange)="group.set($event)"
        >
          <option value="">Tutti i gruppi</option>
          @for (g of s.data().muscleGroups; track g.id) {
            <option [value]="g.id">{{ g.name }}</option>
          }
        </select></label
      >
      @if(s.canEditCatalog()) {<label>Stato<select [ngModel]="active()" (ngModelChange)="active.set($event)"><option value="active">Attivi</option><option value="all">Tutti, anche disattivati</option><option value="inactive">Solo disattivati</option></select></label>}
    </div>
    <gt-exercise-scope [value]="scope()" (choose)="scope.set($event)"/>
    @if(scope()==='recent'){<p class="subtle">Esercizi delle ultime sessioni, incluse quelle in corso.</p>}
    <gt-exercise-families [query]="query()" (choose)="query.set($event);group.set('')"/>
    <nav class="muscle-tabs" aria-label="Zone muscolari"><button [class.selected]="!group()" (click)="group.set('')">Tutti</button>@for(g of s.data().muscleGroups;track g.id){<button [class.selected]="group()===g.id" (click)="group.set(g.id)">{{g.name}}</button>}</nav>
    <p class="subtle" style="margin:16px 0">{{filtered().length}} esercizi {{s.sharedCatalog()?'· Catalogo condiviso':'· Catalogo personale'}}</p>
    <div class="catalog-grid">
      @for (e of filtered(); track e.id) {
        <article class="card catalog-exercise-card">
          <div class="card-head">
            <div class="exercise-info">
              <gt-exercise-thumb [exercise]="e" style="--thumb-width:116px;--thumb-height:88px"/>
              <div>
                <h3>{{ e.name }}</h3>
                <span class="pill">{{ s.muscle(e.muscleGroupId) }}</span>
              </div>
            </div>
            <div class="inline-actions"><button class="favorite-button" [class.favorite-on]="s.isFavorite(e.id)" [attr.aria-pressed]="s.isFavorite(e.id)" [attr.aria-label]="(s.isFavorite(e.id)?'Rimuovi dai preferiti: ':'Aggiungi ai preferiti: ')+e.name" (click)="s.toggleFavorite(e.id)" [disabled]="s.busy()">{{s.isFavorite(e.id)?'★':'☆'}}</button>@if(s.canEditCatalog()){<button class="ghost" (click)="open(e)">Modifica</button>}</div>
          </div>
          <p class="subtle">
            {{ e.equipment }} · {{ modeLabel(e.loadMode)
            }}{{ !e.active ? " · Disattivato" : "" }}
          </p>
          @if (e.description) {
            <p class="subtle" style="margin-top:12px">{{ e.description }}</p>
          }
          <gt-machine-setup [exerciseId]="e.id"/><div class="actions"><gt-exercise-video [exercise]="e" />
            @if(s.canEditCatalog()) {<label class="active-check"><input type="checkbox" [checked]="e.active" [disabled]="saving()" (change)="toggle(e)" />Attivo</label>}
            @for (t of e.tags; track t) {
              <span class="pill">{{ t }}</span>
            }
          </div>
        </article>
      } @empty {
        <div class="card empty">
          <h3>Nessun esercizio trovato</h3>
          <p>{{scope()==='favorites'?'Tocca la stella accanto agli esercizi per ritrovarli qui.':scope()==='recent'?'Qui compariranno gli esercizi delle tue sessioni.':'Prova un filtro diverso.'}}</p>
        </div>
      }
    </div>
    @if(s.canEditCatalog()) {<div class="card" style="margin-top:20px">
      <h3>Gruppi muscolari</h3>
      <div class="actions">
        @for (g of s.data().muscleGroups; track g.id) {
          <button class="ghost" (click)="renameGroup(g.id, g.name)">
            {{ g.name }} ✎
          </button>
        }
        <button (click)="newGroup()">+ Aggiungi gruppo</button>
      </div>
    </div>
    }
    <p class="subtle" style="margin-top:20px">I video sono facoltativi. Admin e Super Admin possono aggiungere un link HTTPS nella modifica dell’esercizio.</p>
    @if (editing() && s.canEditCatalog()) {
      <div class="modal-backdrop" (click)="close($event)">
        <section
          class="modal"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
          (keydown.escape)="dismiss()"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exercise-title"
        >
          <div class="modal-head">
            <h2 id="exercise-title">
              {{ editId ? "Modifica esercizio" : "Nuovo esercizio" }}
            </h2>
            <button (click)="dismiss()" [disabled]="saving()" aria-label="Chiudi">×</button>
          </div>
          <form [formGroup]="form" (ngSubmit)="save()">
            <div class="form-grid">
              <label class="wide"
                >Nome<input
                  formControlName="name"
                  maxlength="100"
                  autofocus /></label
              ><label
                >Gruppo principale<select formControlName="muscleGroupId">
                  @for (g of s.data().muscleGroups; track g.id) {
                    <option [value]="g.id">{{ g.name }}</option>
                  }
                </select></label
              ><label
                >Attrezzatura<input
                  formControlName="equipment"
                  maxlength="80" /></label
              ><label class="wide"
                >Gruppi secondari<select
                  formControlName="secondaryMuscleIds"
                  multiple
                  size="3"
                >
                  @for (g of s.data().muscleGroups; track g.id) {
                    <option [value]="g.id">{{ g.name }}</option>
                  }
                </select></label
              ><label class="wide"
                >Modalità di carico<select formControlName="loadMode">
                  <option value="external">
                    Carico esterno (bilanciere, manubri, macchina)
                  </option>
                  <option value="bodyweight">
                    Corpo libero · solo ripetizioni
                  </option>
                  <option value="weighted-bodyweight">
                    Corpo libero con zavorra · peso aggiunto
                  </option>
                  <option value="assisted">
                    Corpo libero assistito · peso di assistenza
                  </option>
                </select></label
              ><label class="wide"
                >Descrizione<textarea
                  formControlName="description"
                  maxlength="2000"
                ></textarea></label
              ><label class="wide">Video dimostrativo (link HTTPS facoltativo)<input type="url" formControlName="videoUrl" maxlength="1000" placeholder="Link video facoltativo" /></label>
              <label class="wide active-check"><input type="checkbox" formControlName="active" />Attivo · visibile ai clienti e selezionabile nelle schede</label>
              <p class="subtle wide">Se la spunta non è selezionata, l’esercizio resta nel catalogo degli admin. Il video è facoltativo: la visibilità dipende soltanto dalla spunta Attivo.</p>
              <label class="wide"
                >Tag, separati da virgola<input
                  formControlName="tags"
                  maxlength="200" /></label
              ><label class="wide"
                >Foto (compressa sul dispositivo prima del salvataggio)<input
                  type="file"
                  [disabled]="saving()"
                  accept="image/*"
                  (change)="image($event)"
              /></label>
              <label class="wide">Scatta una foto<input type="file" accept="image/*" capture="environment" [disabled]="saving()" (change)="image($event)" /></label>
              @if(imageLoading()){<p class="subtle wide" role="status">Preparazione della foto…</p>}
              @if (imageBlob) {
                <div class="wide">
                  <span class="pill green">Immagine selezionata</span>
                  <button
                    type="button"
                    class="ghost"
                    [disabled]="saving()" (click)="removeImage()"
                  >
                    Rimuovi immagine
                  </button>
                </div>
              }
            </div>
            <p class="subtle" style="margin-top:12px">
              Per corpo libero, zavorra e assistenza, volume e 1RM non sono
              calcolati: i carichi non sono confrontabili con quelli esterni.
            </p>
            <div class="actions">
              <button
                class="primary"
                type="submit"
                [disabled]="form.invalid || s.busy() || saving() || imageLoading()"
              >
                Salva esercizio</button
              ><button type="button" (click)="dismiss()" [disabled]="saving()">
                Annulla
              </button>
            </div>
          </form>
        </section>
      </div>
    }`,
})
export class CatalogComponent {
  s = inject(Store);
  fb = inject(FormBuilder);
  query = signal("");scope=signal<ExerciseScope>("all");
  group = signal("");
  active = signal("active");
  editing = signal(false);
  saving = signal(false);
  imageLoading = signal(false);
  private imageRequest = 0;
  editId = "";
  private formSaveId = "";
  imageBlob?: Blob;
  form = this.fb.nonNullable.group({
    name: ["", [Validators.required, Validators.pattern(/\S/)]],
    muscleGroupId: ["", Validators.required],
    secondaryMuscleIds: [[] as string[]],
    equipment: ["", Validators.required],
    loadMode: ["external" as LoadMode],
    description: [""],
    tags: [""],
    videoUrl: [""],
    active: [false],
  });
  filtered = computed(() =>
    this.s
      .data()
      .exercises.filter(
        (e) =>
          (this.scope()==='all'||(this.scope()==='favorites'?this.s.isFavorite(e.id):this.s.recentExerciseIds().includes(e.id))) &&
          (this.s.canEditCatalog() ? this.active() === "all" || (this.active() === "inactive" ? !e.active : e.active) : e.active) &&
          (!this.group() || e.muscleGroupId === this.group()) &&
          matchesExercise(e,this.query()),
      )
      .sort((a, b) => this.scope()==='recent'?this.s.recentExerciseIds().indexOf(a.id)-this.s.recentExerciseIds().indexOf(b.id):this.s.muscle(a.muscleGroupId).localeCompare(this.s.muscle(b.muscleGroupId)) || a.name.localeCompare(b.name)),
  );
  modeLabel(m: LoadMode) {
    return {
      external: "Carico esterno",
      bodyweight: "Corpo libero",
      "weighted-bodyweight": "Con zavorra",
      assisted: "Assistito",
    }[m];
  }
  open(e?: Exercise) {
    if(this.saving()||!this.s.canEditCatalog()) return;
    this.imageRequest++;this.imageLoading.set(false);
    this.editId = e?.id || "";
    this.formSaveId = e?.id || uid();
    this.imageBlob = e?.image;
    this.form.reset({
      name: e?.name || "",
      muscleGroupId:
        e?.muscleGroupId || this.s.data().muscleGroups[0]?.id || "",
      secondaryMuscleIds: e?.secondaryMuscleIds || [],
      equipment: e?.equipment || "",
      loadMode: e?.loadMode || "external",
      description: e?.description || "",
      tags: e?.tags.join(", ") || "",
      videoUrl: e?.videoUrl || "",
      active: e?.active ?? !this.s.sharedCatalog(),
    });
    this.editing.set(true);
  }
  close(e: MouseEvent) {
    if (e.target === e.currentTarget) this.dismiss();
  }
  dismiss(){if(this.saving())return;this.imageRequest++;this.imageLoading.set(false);this.editing.set(false);}
  removeImage(){if(this.saving())return;this.imageRequest++;this.imageLoading.set(false);this.imageBlob=undefined;}
  async image(event: Event) {
    const input=event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value='';
    if(this.saving())return;
    const request=++this.imageRequest;this.imageLoading.set(true);
    try {const photo=await compressPhoto(file);if(request===this.imageRequest)this.imageBlob=photo;}
    catch(e){if(request===this.imageRequest)this.s.error.set((e as Error).message);}
    finally{if(request===this.imageRequest)this.imageLoading.set(false);}
  }
  async save() {
    if (this.form.invalid || this.saving() || this.imageLoading() || !this.s.canEditCatalog()) return;
    this.saving.set(true);
    this.form.disable({emitEvent:false});
    try {
    const v = this.form.getRawValue();
    const id = this.formSaveId ||= this.editId || uid();
    const old = this.s.exercise(id);
    if (
      await this.s.saveExercise({
        id,
        name: v.name.trim(),
        muscleGroupId: v.muscleGroupId,
        secondaryMuscleIds: v.secondaryMuscleIds.filter(
          (id) => id !== v.muscleGroupId,
        ),
        equipment: v.equipment.trim(),
        description: v.description.trim(),
        loadMode: v.loadMode,
        tags: [
          ...new Set(
            v.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          ),
        ],
        active: v.active,
        videoUrl: v.videoUrl.trim(),
        thumbnailUrl: old?.thumbnailUrl,
        videoTitle: old?.videoTitle,
        videoChannel: old?.videoChannel,
        createdAt: old?.createdAt || now(),
        image: this.imageBlob,
      })
    )
      this.editing.set(false);
    } finally { this.form.enable({emitEvent:false});this.saving.set(false); }
  }
  async toggle(e: Exercise) {
    if(this.saving() || !this.s.canEditCatalog())return;
    this.saving.set(true);try{await this.s.saveExercise({...e,active:!e.active});}finally{this.saving.set(false);}
  }
  newGroup() {
    if(!this.s.canEditCatalog())return;
    const name=prompt('Nome del gruppo muscolare');if(name?.trim()) void this.s.saveMuscleGroup(uid(),name.trim());
  }
  renameGroup(id:string,current:string) {
    if(!this.s.canEditCatalog())return;
    const name=prompt('Modifica nome del gruppo',current);if(name?.trim())void this.s.saveMuscleGroup(id,name.trim());
  }
}
