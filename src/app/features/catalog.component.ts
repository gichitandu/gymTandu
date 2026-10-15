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
  imports: [
    A11yModule,
    FormsModule,
    ReactiveFormsModule,
    IconComponent,
    StatusComponent,
  ],
  template: ` <div class="page-heading">
      <div>
        <p class="eyebrow">LA TUA LIBRERIA</p>
        <h1>Catalogo esercizi</h1>
        <p class="subtle">Gli strumenti per costruire i tuoi allenamenti.</p>
      </div>
      <button class="primary" (click)="open()" [disabled]="!s.ready()">
        <gt-icon name="plus" /> Nuovo esercizio
      </button>
    </div>
    <gt-status />
    <div class="filters">
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
      ><label
        >Stato<select [ngModel]="active()" (ngModelChange)="active.set($event)">
          <option value="active">Attivi</option>
          <option value="all">Tutti, anche disattivati</option>
        </select></label
      >
    </div>
    <div class="split">
      @for (e of filtered(); track e.id) {
        <article class="card">
          <div class="card-head">
            <div class="exercise-info">
              @if (imageUrl(e)) {
                <img class="exercise-thumb" [src]="imageUrl(e)" alt="" />
              } @else {
                <span class="exercise-thumb"><gt-icon name="weight" /></span>
              }
              <div>
                <h3>{{ e.name }}</h3>
                <span class="pill">{{ s.muscle(e.muscleGroupId) }}</span>
              </div>
            </div>
            <button class="ghost" (click)="open(e)">Modifica</button>
          </div>
          <p class="subtle">
            {{ e.equipment }} · {{ modeLabel(e.loadMode)
            }}{{ !e.active ? " · Disattivato" : "" }}
          </p>
          @if (e.description) {
            <p class="subtle" style="margin-top:12px">{{ e.description }}</p>
          }
          <div class="actions">
            <button class="ghost" (click)="toggle(e)">
              {{ e.active ? "Disattiva" : "Riattiva" }}
            </button>
            @for (t of e.tags; track t) {
              <span class="pill">{{ t }}</span>
            }
          </div>
        </article>
      } @empty {
        <div class="card empty">
          <h3>Nessun esercizio trovato</h3>
          <p>Prova un filtro diverso o aggiungi un esercizio.</p>
        </div>
      }
    </div>
    <div class="card" style="margin-top:20px">
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
    @if (editing()) {
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
              ><label class="wide"
                >Tag, separati da virgola<input
                  formControlName="tags"
                  maxlength="200" /></label
              ><label class="wide"
                >Immagine (JPEG, PNG o WebP, massimo 2 MB)<input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  (change)="image($event)"
              /></label>
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
                [disabled]="form.invalid || s.busy()"
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
  query = signal("");
  group = signal("");
  active = signal("active");
  editing = signal(false);
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
  });
  filtered = computed(() =>
    this.s
      .data()
      .exercises.filter(
        (e) =>
          (this.active() === "all" || e.active) &&
          (!this.group() || e.muscleGroupId === this.group()) &&
          `${e.name} ${e.equipment} ${e.tags.join(" ")}`
            .toLocaleLowerCase("it")
            .includes(this.query().toLocaleLowerCase("it")),
      )
      .sort((a, b) => a.name.localeCompare(b.name)),
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
    });
    this.editing.set(true);
  }
  close(e: MouseEvent) {
    if (e.target === e.currentTarget) this.editing.set(false);
  }
  async image(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      this.s.error.set("Usa un’immagine JPEG, PNG o WebP entro 2 MB.");
      (event.target as HTMLInputElement).value = "";
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      bitmap.close();
      this.imageBlob = file;
    } catch {
      this.s.error.set("Il file non contiene un’immagine valida.");
    }
  }
  async save() {
    if (this.form.invalid) return;
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
        active: old?.active ?? true,
        createdAt: old?.createdAt || now(),
        image: this.imageBlob,
      })
    )
      this.editing.set(false);
  }
  toggle(e: Exercise) {
    void this.s.saveExercise({ ...e, active: !e.active });
  }
  newGroup() {
    const name = prompt("Nome del gruppo muscolare");
    if (name?.trim())
      void this.s.change((d) => {
        if (
          d.muscleGroups.some(
            (g) => g.name.toLowerCase() === name.trim().toLowerCase(),
          )
        )
          throw Error("Gruppo già presente");
        d.muscleGroups.push({ id: uid(), name: name.trim() });
      }, "Gruppo aggiunto.");
  }
  renameGroup(id: string, current: string) {
    const name = prompt("Modifica nome del gruppo", current);
    if (name?.trim())
      void this.s.change((d) => {
        if (
          d.muscleGroups.some(
            (g) =>
              g.id !== id && g.name.toLowerCase() === name.trim().toLowerCase(),
          )
        )
          throw Error("Gruppo già presente");
        d.muscleGroups.find((g) => g.id === id)!.name = name.trim();
      }, "Gruppo aggiornato.");
  }
}
