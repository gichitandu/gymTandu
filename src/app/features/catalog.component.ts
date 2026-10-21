import { SectionHeadingComponent } from "../shared/section-heading.component";
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
  imports: [SectionHeadingComponent,
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
          placeholder="Nome, tag o attrezzatura…"
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
    <p class="subtle" style="margin:16px 0">{{filtered().length}} esercizi {{s.canEditCatalog()?'· Catalogo condiviso':'· Disponibili per le tue schede'}}</p>
    <div class="catalog-grid">
      @for (e of filtered(); track e.id) {
        <article class="card catalog-exercise-card">
          <div class="card-head">
            <div class="exercise-info">
              @if (imageUrl(e)) {
                <img class="exercise-thumb" [src]="imageUrl(e)" alt="" />
              } @else {
                @if(e.thumbnailUrl) {<img class="exercise-thumb video-thumb" [src]="e.thumbnailUrl" alt="" loading="lazy" referrerpolicy="no-referrer" (error)="$any($event.target).style.display='none'" />} @else {<span class="exercise-thumb"><gt-icon name="weight" /></span>}
              }
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
          (keydown.escape)="editing.set(false)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exercise-title"
        >
          <div class="modal-head">
            <h2 id="exercise-title">
              {{ editId ? "Modifica esercizio" : "Nuovo esercizio" }}
            </h2>
            <button (click)="editing.set(false)" aria-label="Chiudi">×</button>
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
                  accept="image/*"
                  (change)="image($event)"
              /></label>
              <label class="wide">Scatta una foto<input type="file" accept="image/*" capture="environment" (change)="image($event)" /></label>
              @if (imageBlob) {
                <div class="wide">
                  <span class="pill green">Immagine selezionata</span>
                  <button
                    type="button"
                    class="ghost"
                    (click)="imageBlob = undefined"
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
                [disabled]="form.invalid || s.busy() || saving()"
              >
                Salva esercizio</button
              ><button type="button" (click)="editing.set(false)">
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
  editId = "";
  imageBlob?: Blob;
  private urls = new Map<Blob, string>();
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
          `${e.name} ${e.equipment} ${e.tags.join(" ")}`
            .toLocaleLowerCase("it")
            .includes(this.query().toLocaleLowerCase("it")),
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
  imageUrl(e: Exercise) {
    if (!e.image) return "";
    if (!this.urls.has(e.image))
      this.urls.set(e.image, URL.createObjectURL(e.image));
    return this.urls.get(e.image)!;
  }
  ngOnDestroy() {
    this.urls.forEach((u) => URL.revokeObjectURL(u));
  }
  open(e?: Exercise) {
    if(!this.s.canEditCatalog()) return;
    this.editId = e?.id || "";
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
      active: e?.active ?? false,
    });
    this.editing.set(true);
  }
  close(e: MouseEvent) {
    if (e.target === e.currentTarget) this.editing.set(false);
  }
  async image(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {this.imageBlob=await compressPhoto(file);}catch(e){this.s.error.set((e as Error).message);}
    (event.target as HTMLInputElement).value='';
  }
  async save() {
    if (this.form.invalid || this.saving() || !this.s.canEditCatalog()) return;
    this.saving.set(true);
    const v = this.form.getRawValue();
    const old = this.s.exercise(this.editId);
    if (
      await this.s.saveExercise({
        id: this.editId || uid(),
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
    this.saving.set(false);
  }
  async toggle(e: Exercise) {
    if(this.saving() || !this.s.canEditCatalog())return;
    this.saving.set(true);await this.s.saveExercise({...e,active:!e.active});this.saving.set(false);
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
